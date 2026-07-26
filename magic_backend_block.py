# ---------------------------------------------------------------------------
# Magic link natif — auth sans mot de passe sur NOTRE backend (pas Supabase).
# Cohabite avec le login/register classique. Cookie httpOnly identique.
# ---------------------------------------------------------------------------
MAGIC_TOKEN_TTL_MINUTES = 15
MAGIC_REQUEST_MAX = 5
MAGIC_REQUEST_WINDOW = 3600


class MagicRequestIn(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    create: bool = False
    lang: str = "fr"


def _hash_magic_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _send_magic_email(email: str, link: str, lang: str, is_signup: bool) -> None:
    fr = lang.startswith("fr")
    if fr:
        subject = "Votre lien de connexion Fironova"
        heading = "Bienvenue chez Fironova" if is_signup else "Connexion à Fironova"
        intro = ("Confirmez votre adresse pour activer votre compte."
                 if is_signup else "Cliquez pour vous connecter sans mot de passe.")
        cta = "Activer mon compte" if is_signup else "Me connecter"
        expiry = f"Ce lien expire dans {MAGIC_TOKEN_TTL_MINUTES} minutes et ne sert qu'une fois."
        ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."
    else:
        subject = "Your Fironova sign-in link"
        heading = "Welcome to Fironova" if is_signup else "Sign in to Fironova"
        intro = ("Confirm your address to activate your account."
                 if is_signup else "Click to sign in without a password.")
        cta = "Activate my account" if is_signup else "Sign me in"
        expiry = f"This link expires in {MAGIC_TOKEN_TTL_MINUTES} minutes and works only once."
        ignore = "If you didn't request this, you can safely ignore this email."
    html = f"""\
<div style="font-family:Inter,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;background:#F7FAFC;padding:40px 24px;">
  <div style="background:#0B2E4F;border-radius:20px 20px 0 0;padding:28px 32px;">
    <span style="font-family:'Space Grotesk',sans-serif;color:#F7FAFC;font-size:20px;font-weight:700;letter-spacing:-0.02em;">FIRONOVA</span>
    <span style="color:#00B8D4;font-size:20px;font-weight:700;"> ·</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:36px 32px;border:1px solid #E2E8F0;border-top:none;">
    <h1 style="font-family:'Space Grotesk',sans-serif;color:#0B2E4F;font-size:24px;font-weight:700;margin:0 0 12px;">{heading}</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 28px;">{intro}</p>
    <a href="{link}" style="display:inline-block;background:#00B8D4;color:#0B2E4F;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;">{cta} &rarr;</a>
    <p style="color:#64748B;font-size:12px;line-height:1.6;margin:28px 0 0;font-family:'JetBrains Mono',monospace;">{expiry}</p>
    <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:8px 0 0;">{ignore}</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px;">
    <p style="color:#94A3B8;font-size:11px;line-height:1.5;margin:0;">Produits destin&eacute;s &agrave; la recherche uniquement (RUO). R&eacute;serv&eacute; aux 18 ans et plus.<br>For Research Use Only. 18+ only.</p>
  </div>
</div>"""
    await _send_email(email, subject, html)


@api.post("/auth/magic/request")
async def magic_request(payload: MagicRequestIn, request: Request):
    """Émet un lien magique. Réponse uniforme : ne révèle jamais si l'email existe."""
    _rate_limit("magic_request", _client_ip(request), MAGIC_REQUEST_MAX,
                MAGIC_REQUEST_WINDOW, "Trop de demandes. Réessayez plus tard.")
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    is_signup = payload.create and not existing
    # Login demandé sur un email inconnu -> réponse neutre, aucun email (anti-énumération).
    if not payload.create and not existing:
        return {"ok": True}
    raw = secrets.token_urlsafe(32)
    await db.magic_tokens.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "token_hash": _hash_magic_token(raw),
        "is_signup": is_signup,
        "name": (payload.name or "").strip()[:120],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=MAGIC_TOKEN_TTL_MINUTES)).isoformat(),
        "used_at": None,
        "ip": _client_ip(request),
    })
    base = PUBLIC_BASE_URL or str(request.base_url).rstrip("/")
    link = f"{base}/auth/callback?token={raw}"
    await _send_magic_email(email, link, payload.lang or "fr", is_signup)
    return {"ok": True}


@api.post("/auth/magic/verify")
async def magic_verify(response: Response, request: Request, token: str = Body(..., embed=True)):
    """Vérifie le token (usage unique + TTL), crée le compte si signup, pose le cookie."""
    token_hash = _hash_magic_token((token or "").strip())
    rec = await db.magic_tokens.find_one({"token_hash": token_hash})
    now = datetime.now(timezone.utc)
    invalid = HTTPException(status_code=400, detail="Lien invalide ou expiré.")
    if not rec or rec.get("used_at"):
        raise invalid
    try:
        if datetime.fromisoformat(rec["expires_at"]) < now:
            raise invalid
    except HTTPException:
        raise
    except Exception:
        raise invalid
    claimed = await db.magic_tokens.update_one(
        {"_id": rec["_id"], "used_at": None},
        {"$set": {"used_at": now.isoformat()}},
    )
    if claimed.modified_count != 1:
        raise invalid
    email = rec["email"]
    user = await db.users.find_one({"email": email})
    if not user:
        user_doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": rec.get("name") or email.split("@")[0],
            "password_hash": hash_password(secrets.token_urlsafe(32)),
            "role": "user",
            "token_version": 0,
            "created_at": now.isoformat(),
            "passwordless": True,
        }
        await db.users.insert_one(user_doc)
        try:
            await db.subscribers.update_one({"email": email}, {"$set": {"converted": True}})
        except Exception as e:  # pragma: no cover
            logging.warning("subscriber conversion flag failed for %s: %s", email, e)
        user = user_doc
    token_jwt = create_access_token(user["id"], user["email"], user["role"],
                                    token_version=user.get("token_version", 0))
    set_auth_cookie(response, token_jwt)
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "created_at": user["created_at"],
    }


async def _magic_tokens_cleanup():
    while True:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            res = await db.magic_tokens.delete_many({"expires_at": {"$lt": cutoff}})
            if res.deleted_count:
                logging.info("[magic] purged %d expired tokens", res.deleted_count)
        except Exception as e:
            logging.error("[magic] cleanup error: %s", e)
        await asyncio.sleep(6 * 3600)
