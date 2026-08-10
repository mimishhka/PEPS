# ---------------------------------------------------------------------------
# Magic link natif — auth sans mot de passe sur NOTRE backend (pas Supabase).
# Cohabite avec le login/register classique. Cookie httpOnly identique.
# ---------------------------------------------------------------------------
MAGIC_TOKEN_TTL_MINUTES = 15
MAGIC_REQUEST_MAX = 5
MAGIC_REQUEST_WINDOW = 3600
MAGIC_SENDER_EMAIL = os.environ.get("MAGIC_SENDER_EMAIL", "").strip()


class MagicRequestIn(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    create: bool = False
    lang: str = "fr"


class ForgotPasswordIn(BaseModel):
    email: EmailStr
    lang: str = "fr"


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        return _validate_password_strength(v)


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
    await _send_email(email, subject, html, from_email=MAGIC_SENDER_EMAIL or SENDER_EMAIL)


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


# ---------------------------------------------------------------------------
# Réinitialisation de mot de passe (mot de passe oublié)
# ---------------------------------------------------------------------------
RESET_TOKEN_TTL_MINUTES = 30
RESET_REQUEST_MAX = 5
RESET_REQUEST_WINDOW = 3600


async def _send_reset_email(email: str, link: str, lang: str) -> None:
    fr = lang.startswith("fr")
    if fr:
        subject = "FIRONOVA — Réinitialisation du mot de passe"
        heading = "Réinitialiser votre mot de passe"
        body = "Vous avez demandé à réinitialiser votre mot de passe. Ce lien expire dans 30 minutes."
        cta = "Choisir un nouveau mot de passe"
        ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé."
    else:
        subject = "FIRONOVA — Password reset"
        heading = "Reset your password"
        body = "You requested a password reset. This link expires in 30 minutes."
        cta = "Choose a new password"
        ignore = "If you didn't request this, ignore this email — your password stays unchanged."
    html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0B2E4F">
      <h1 style="font-size:20px;margin:0 0 12px">{heading}</h1>
      <p style="font-size:14px;line-height:1.6;color:#3E5C76;margin:0 0 24px">{body}</p>
      <a href="{link}" style="display:inline-block;background:#00B8D4;color:#0B2E4F;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:9999px;font-size:14px">{cta}</a>
      <p style="font-size:12px;line-height:1.6;color:#7A8CA0;margin:24px 0 0">{ignore}</p>
      <p style="font-size:11px;color:#A0AEC0;margin:16px 0 0">For Research Use Only · Réservé à la recherche</p>
    </div>"""
    from_addr = MAGIC_SENDER_EMAIL or SENDER_EMAIL
    await _send_email(email, subject, html, from_email=from_addr)


@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, request: Request):
    """Émet un lien de réinitialisation. Réponse uniforme (anti-énumération)."""
    email = payload.email.lower().strip()
    _rate_limit_email("reset_request", email, RESET_REQUEST_MAX,
                      RESET_REQUEST_WINDOW, "Trop de demandes. Réessayez plus tard.")
    user = await db.users.find_one({"email": email})
    if user and not user.get("passwordless", False):
        raw = secrets.token_urlsafe(32)
        await db.magic_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "token_hash": _hash_magic_token(raw),
            "purpose": "reset",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)).isoformat(),
            "used_at": None,
            "ip": _client_ip(request),
        })
        base = _trusted_public_base_url()
        link = f"{base}/reset-password?token={raw}"
        await _send_reset_email(email, link, payload.lang or "fr")
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn, response: Response, request: Request):
    token_hash = _hash_magic_token(payload.token.strip())
    rec = await db.magic_tokens.find_one({"token_hash": token_hash, "purpose": "reset"})
    if not rec:
        raise HTTPException(400, "Invalid or expired reset link")
    if rec.get("used_at"):
        raise HTTPException(400, "This reset link has already been used")
    expires_at = datetime.fromisoformat(rec["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "This reset link has expired")
    claimed = await db.magic_tokens.update_one(
        {"_id": rec["_id"], "used_at": None},
        {"$set": {"used_at": datetime.now(timezone.utc).isoformat()}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(400, "This reset link has already been used")
    user = await db.users.find_one({"email": rec["email"]})
    if not user:
        raise HTTPException(400, "Invalid or expired reset link")
    new_hash = hash_password(payload.password)
    new_tv = user.get("token_version", 0) + 1
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash, "token_version": new_tv, "passwordless": False}},
    )
    await db.magic_tokens.delete_many({"email": rec["email"], "purpose": "reset", "used_at": None})
    token_jwt = create_access_token(user["id"], user["email"], user["role"], token_version=new_tv)
    set_auth_cookie(response, token_jwt, request)
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
