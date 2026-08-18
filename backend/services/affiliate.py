"""Affiliate program service: tiers, referral attribution, coupon codes and
aliases, metrics, invitations, and payout generation/scheduling."""

import asyncio
import hashlib
import hmac
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request, Response
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

# `s.<name>` reads the live binding on the server module: configuration, the
# Mongo handle, helpers that stayed behind, and the side-effecting calls that
# callers substitute there. See services/__init__.py.
import server as s


def _affiliate_tier_for_revenue(cumulative_revenue: float) -> str:
    """Palier théorique pour un CA cumulé donné (sans plancher trimestriel)."""
    rev = float(cumulative_revenue or 0.0)
    tier = "standard"
    for name, _rate, floor, _ceil in s.AFFILIATE_TIERS:
        if rev >= floor:
            tier = name
    return tier


def _affiliate_rate_for_tier(tier: str) -> float:
    for name, rate, _floor, _ceil in s.AFFILIATE_TIERS:
        if name == tier:
            return rate
    return 0.10


def _affiliate_tier_index(tier: str) -> int:
    for i, (name, _r, _f, _c) in enumerate(s.AFFILIATE_TIERS):
        if name == tier:
            return i
    return 0


def _affiliate_tier_bounds(tier: str):
    for name, _r, floor, ceil in s.AFFILIATE_TIERS:
        if name == tier:
            return floor, ceil
    return 0.0, 2000.0


def _affiliate_next_tier(tier: str):
    idx = _affiliate_tier_index(tier)
    if idx + 1 < len(s.AFFILIATE_TIERS):
        n = s.AFFILIATE_TIERS[idx + 1]
        return {"tier": n[0], "rate": n[1], "floor": n[2]}
    return None


# ===========================================================================
# HACHAGE : token d'invitation + IP salée
# ===========================================================================

def _affiliate_hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _affiliate_ip_salt() -> bytes:
    # Dérivé de JWT_SECRET (déjà obligatoire) — pas de nouvelle variable d'env
    # requise. Permet de comparer "même IP ?" sans jamais stocker l'IP en clair.
    secret = os.environ.get("JWT_SECRET", "fironova-fallback-salt")
    return hashlib.sha256(("aff-ip::" + secret).encode("utf-8")).digest()


def _affiliate_hash_ip(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    return hmac.new(_affiliate_ip_salt(), ip.encode("utf-8"), hashlib.sha256).hexdigest()


def _affiliate_referrer_domain(url: str) -> str:
    """Réduit un référent URL à son domaine (netloc) pour l'analyse des sources."""
    url = (url or "").strip()
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        net = (urlparse(url if "://" in url else "//" + url).netloc or "").lower()
        return net[4:] if net.startswith("www.") else net
    except Exception:
        return url[:120]


def _affiliate_gen_code() -> str:
    # Code de parrainage lisible : FN + 6 caractères base32 sans ambiguïté.
    # (Conservé pour la génération legacy et le fallback anti-collision.)
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "FN" + "".join(secrets.choice(alphabet) for _ in range(6))


# ===========================================================================
# GÉNÉRATEUR DE CODE V2 — base + suffixe rabais
# Ex.: prénom "Marie" + rabais 10% → "MARIE10"
#      entreprise "Fitness & Nutrition" + rabais 15% → "FITNESS15"
# Anti-collision déterministe basé sur le hash email (2 chars ajoutés).
# ===========================================================================
_AFFILIATE_SAFE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _affiliate_slugify_base(raw: str, max_len: int = 6) -> str:
    """Normalise un prénom ou nom d'entreprise en base ASCII majuscule
    alphanumérique, tronquée à `max_len`. Ex.: "Jean-Baptiste" → "JEANBA",
    "Fitness & Nutrition" → "FITNES". Retourne "AFF" si la string est vide."""
    if not raw:
        return "AFF"
    import unicodedata
    s = unicodedata.normalize("NFKD", str(raw))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^A-Za-z0-9]", "", s).upper()
    return (s[:max_len] or "AFF")


def _affiliate_normalize_custom_code(raw: str) -> str:
    code = str(raw or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{4,20}", code):
        raise HTTPException(400, "Affiliate code must contain 4-20 ASCII letters or digits")
    return code


def _affiliate_collision_suffix(email: str) -> str:
    """2 chars alphanum stables issus du hash email — même email = même suffixe.
    Utile pour désambiguïser deux Marie avec le même prénom (base identique)."""
    h = hashlib.sha256((email or "").lower().encode("utf-8")).digest()
    a = _AFFILIATE_SAFE_ALPHABET[h[0] % len(_AFFILIATE_SAFE_ALPHABET)]
    b = _AFFILIATE_SAFE_ALPHABET[h[1] % len(_AFFILIATE_SAFE_ALPHABET)]
    return a + b


async def _affiliate_gen_code_v2(base_source: str, discount_percent: float,
                                 email: str = "", exclude_id: Optional[str] = None) -> str:
    """Génère un code affilié `BASE + PCT`, avec anti-collision déterministe.
    - base_source: prénom OU entreprise (déjà choisi par l'appelant)
    - discount_percent: 0-100 (int(round))
    - email: pour le suffixe anti-collision stable
    - exclude_id: ne compte pas ce document comme collision (utile au rename)
    """
    base = _affiliate_slugify_base(base_source, 6)
    pct = int(round(max(0.0, min(100.0, float(discount_percent or 0)))))
    pct_str = f"{pct}" if pct >= 10 else f"0{pct}"
    candidate = f"{base}{pct_str}"

    async def _exists(c: str) -> bool:
        q = {
            "$or": [{"code": c}, {"aliases.code": c}],
        }
        if exclude_id:
            q["id"] = {"$ne": exclude_id}
        return await s.db.affiliates.find_one(q, {"_id": 1}) is not None

    if not await _exists(candidate):
        return candidate

    # Collision → append suffixe déterministe email
    suffix = _affiliate_collision_suffix(email)
    candidate = f"{base}{pct_str}{suffix}"
    if not await _exists(candidate):
        return candidate

    # Encore collision → append 2 chars aléatoires jusqu'à 5 essais
    for _ in range(5):
        rnd = "".join(secrets.choice(_AFFILIATE_SAFE_ALPHABET) for _ in range(2))
        candidate = f"{base}{pct_str}{rnd}"
        if not await _exists(candidate):
            return candidate

    # Extrême rare : fallback legacy random
    return _affiliate_gen_code()

# ---- Taux CAD → USD (Bank of Canada Valet API — gratuit, source officielle) ---
_CAD_USD_CACHE: dict = {"rate": None, "fetched_at": 0.0, "source": ""}
_CAD_USD_CACHE_TTL_S = 4 * 3600  # 4h


async def _fetch_cad_to_usd_rate() -> tuple:
    """Retourne (rate_cad_to_usd, source_str) — combien vaut 1 CAD en USD.
    Utilise le Valet API de la Banque du Canada (source officielle CAD).
    Cache 4h en mémoire. Fallback conservateur 0.72 si l'API échoue."""
    import time
    now_ts = time.time()
    if (_CAD_USD_CACHE["rate"] is not None
            and (now_ts - _CAD_USD_CACHE["fetched_at"]) < _CAD_USD_CACHE_TTL_S):
        return _CAD_USD_CACHE["rate"], _CAD_USD_CACHE["source"]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1",
                headers={"User-Agent": "Fironova/1.0"},
            )
            r.raise_for_status()
            data = r.json()
            obs = (data.get("observations") or [])
            if obs:
                # FXUSDCAD = combien de CAD pour 1 USD. Inverse pour CAD→USD.
                usd_to_cad = float(obs[-1]["FXUSDCAD"]["v"])
                cad_to_usd = round(1.0 / usd_to_cad, 6)
                _CAD_USD_CACHE.update({
                    "rate": cad_to_usd, "fetched_at": now_ts, "source": "bank_of_canada",
                })
                return cad_to_usd, "bank_of_canada"
    except Exception as e:
        logging.warning("[fx] Bank of Canada FX fetch failed: %s", e)
    # Fallback conservateur : 1 CAD ≈ 0.72 USD (l'affilié ne perd jamais si l'API tombe)
    _CAD_USD_CACHE.update({
        "rate": 0.72, "fetched_at": now_ts, "source": "fallback",
    })
    return 0.72, "fallback"


def _keccak256(data: bytes) -> bytes:
    """Keccak-256 (variante Ethereum, distincte de SHA3-256 finalisé).
    Pure-Python, uniquement appelée à la validation d'une adresse — donc rare."""
    RC = [0x1, 0x8082, 0x800000000000808A, 0x8000000080008000, 0x808B,
          0x80000001, 0x8000000080008081, 0x8000000000008009, 0x8A, 0x88,
          0x80008009, 0x8000000A, 0x8000808B, 0x800000000000008B,
          0x8000000000008089, 0x8000000000008003, 0x8000000000008002,
          0x8000000000000080, 0x800A, 0x800000008000000A,
          0x8000000080008081, 0x8000000000008080, 0x80000001,
          0x8000000080008008]
    R = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
         [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]

    def rol(x, n):
        return ((x << n) | (x >> (64 - n))) & 0xFFFFFFFFFFFFFFFF

    rate = 136
    st = [[0] * 5 for _ in range(5)]
    msg = bytearray(data)
    msg.append(0x01)
    while len(msg) % rate != 0:
        msg.append(0)
    msg[-1] |= 0x80
    for off in range(0, len(msg), rate):
        blk = msg[off:off + rate]
        for i in range(rate // 8):
            st[i % 5][i // 5] ^= int.from_bytes(blk[i * 8:i * 8 + 8], "little")
        for rnd in range(24):
            C = [st[x][0] ^ st[x][1] ^ st[x][2] ^ st[x][3] ^ st[x][4] for x in range(5)]
            D = [C[(x - 1) % 5] ^ rol(C[(x + 1) % 5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    st[x][y] ^= D[x]
            B = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    B[y][(2 * x + 3 * y) % 5] = rol(st[x][y], R[x][y])
            for x in range(5):
                for y in range(5):
                    st[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])
            st[0][0] ^= RC[rnd]
    out = b""
    for i in range(4):
        out += st[i % 5][i // 5].to_bytes(8, "little")
    return out[:32]


def _eth_to_checksum(addr40_lower: str) -> str:
    """Applique le checksum EIP-55 à 40 hex minuscules (sans le préfixe 0x)."""
    h = _keccak256(addr40_lower.encode()).hex()
    return "0x" + "".join(
        c.upper() if int(h[i], 16) >= 8 else c
        for i, c in enumerate(addr40_lower)
    )


def _is_valid_eth_address(addr: str) -> bool:
    """Valide une adresse Ethereum (ERC-20). Format 0x + 40 hex."""
    if not isinstance(addr, str):
        return False
    addr = addr.strip()
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", addr):
        return False
    body = addr[2:]
    if body == body.lower() or body == body.upper():
        return True
    return addr == _eth_to_checksum(body.lower())


# Base58 sans les caractères ambigus (0, O, I, l).
_TRON_BASE58_RE = re.compile(r"^T[1-9A-HJ-NP-Za-km-z]{33}$")


def _is_valid_tron_address(addr: str) -> bool:
    """Valide une adresse Tron (TRC-20). Format T + 33 base58 (34 total).

    Note : on ne vérifie pas le checksum SHA256 (double), le format regex
    couvre déjà 99% des collisions accidentelles et NOWPayments rejettera
    à l'exécution si le checksum est invalide.
    """
    if not isinstance(addr, str):
        return False
    return bool(_TRON_BASE58_RE.fullmatch(addr.strip()))


def _detect_payout_network(addr: str) -> Optional[str]:
    """Retourne 'erc20', 'trc20' ou None selon le format de l'adresse."""
    a = (addr or "").strip()
    if _is_valid_eth_address(a):
        return "erc20"
    if _is_valid_tron_address(a):
        return "trc20"
    return None


def _normalize_payout(address: str, currency: str) -> tuple:
    """Valide (devise, adresse) pour un payout affilié. HTTPException 422 sinon.

    Retourne (adresse_normalisée, devise_normalisée, network).
    - USDT / USDC acceptent Ethereum (ERC-20, checksum EIP-55) ou Tron (TRC-20).
    - network est 'erc20' ou 'trc20', propagé au CSV NOWPayments Mass Payouts.
    """
    cur = (currency or "").strip().lower()
    if cur not in s.AFFILIATE_PAYOUT_CURRENCIES:
        raise HTTPException(
            422,
            "Devise de versement non supportée. Choix : USDT ou USDC (Ethereum ou Tron).",
        )
    addr = (address or "").strip()
    # Adresse vide = pas encore configurée, ce qui est l'état normal d'un
    # affilié qui vient d'être créé. La rejeter faisait échouer TOUTE la
    # requête de mise à jour — y compris un simple changement de palier —
    # avec un message parlant d'adresse invalide alors qu'aucune n'existait.
    # Le versement, lui, reste bloqué tant qu'elle n'est pas renseignée :
    # c'est là que l'exigence a du sens, pas à l'enregistrement d'une fiche.
    if not addr:
        return "", cur, ""
    network = _detect_payout_network(addr)
    if network == "erc20":
        body = addr[2:]
        canonical = addr if (body != body.lower() and body != body.upper()) \
            else _eth_to_checksum(body.lower())
        return canonical, cur, "erc20"
    if network == "trc20":
        return addr, cur, "trc20"
    raise HTTPException(
        422,
        "Adresse invalide. Attendu : ERC-20 (0x + 40 hex, checksum EIP-55) "
        "ou TRC-20 (T + 33 caractères base58) pour USDT/USDC.",
    )


def _affiliate_quarter_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    q_month = 3 * ((now.month - 1) // 3) + 1
    return now.replace(month=q_month, day=1, hour=0, minute=0,
                       second=0, microsecond=0)


def _affiliate_next_quarter_start(now: Optional[datetime] = None) -> datetime:
    qs = _affiliate_quarter_start(now)
    # +3 mois
    month = qs.month + 3
    year = qs.year + (1 if month > 12 else 0)
    month = month - 12 if month > 12 else month
    return qs.replace(year=year, month=month)


def _affiliate_prev_quarter_start(now: Optional[datetime] = None) -> datetime:
    qs = _affiliate_quarter_start(now)
    month = qs.month - 3
    year = qs.year
    if month <= 0:
        month += 12
        year -= 1
    return qs.replace(year=year, month=month)

# ===========================================================================
# CALCUL DES MÉTRIQUES D'UN AFFILIÉ
# ===========================================================================

async def _affiliate_compute_metrics(affiliate_id: str) -> dict:
    """Agrège les référrals validés (approved|paid) et calcule le palier.

    Le palier repose sur une FENÊTRE GLISSANTE DE 12 MOIS : à chaque instant on
    additionne le CA généré sur les 365 derniers jours. La fenêtre avance toute
    seule — le mois écoulé entre, celui d'il y a un an sort — donc le palier
    monte quand l'activité monte et redescend quand elle ralentit, sans date de
    révision ni décision manuelle.

    Remplace un modèle « cumul à vie + rétrogradation trimestrielle » qui était
    mal calibré : il comparait le CA d'UN trimestre au plancher CUMULATIF du
    palier. Conserver Bronze exigeait donc 2 001 $ tous les 90 jours alors que
    l'atteindre n'avait demandé que 2 001 $ au total. Un affilié régulier
    restait bloqué un palier sous celui qu'il avait mérité, indéfiniment.
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(days=365)
    affiliate = await s.db.affiliates.find_one(
        {"id": affiliate_id}, {"_id": 0, "manual_tier": 1}
    )
    manual_tier = str((affiliate or {}).get("manual_tier") or "").strip().lower() or None
    if manual_tier and manual_tier not in {tier[0] for tier in s.AFFILIATE_TIERS}:
        manual_tier = None

    q_start = _affiliate_quarter_start()
    cumulative = 0.0      # depuis toujours — informatif, affiché à l'affilié
    rolling12 = 0.0       # 365 derniers jours — c'est LUI qui fixe le palier
    quarter = 0.0         # trimestre en cours — informatif uniquement désormais
    pending_commission = 0.0
    approved_commission = 0.0
    paid_commission = 0.0
    validated_orders = 0

    cursor = s.db.affiliate_referrals.find(
        {"affiliate_id": affiliate_id}, {"_id": 0}
    )
    async for r in cursor:
        status = r.get("status")
        base = float(r.get("base_amount", 0.0))       # produits HT
        comm = float(r.get("commission_amount", 0.0))
        if status in ("approved", "paid"):
            cumulative += base
            validated_orders += 1
            created = r.get("approved_at") or r.get("created_at")
            if created:
                try:
                    dt = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    if dt >= window_start:
                        rolling12 += base
                    if dt >= q_start:
                        quarter += base
                except Exception:
                    # Date illisible : la vente compte au cumul mais pas dans la
                    # fenêtre. Prudent — mieux vaut sous-estimer un palier que
                    # l'accorder sur une donnée qu'on ne sait pas dater.
                    logging.warning("[affiliate] date de referral illisible (%r) — hors fenetre 12 mois",
                                    created)
        if status == "pending":
            pending_commission += comm
        elif status == "approved":
            approved_commission += comm
        elif status == "paid":
            paid_commission += comm

    # Palier selon le CA des 12 derniers mois. Plus de rétrogradation
    # trimestrielle : la fenêtre glissante fait déjà redescendre le total quand
    # l'activité ralentit, progressivement et sans effet de seuil brutal.
    theoretical = _affiliate_tier_for_revenue(rolling12)
    effective = manual_tier or theoretical

    rate = _affiliate_rate_for_tier(effective)
    nxt = _affiliate_next_tier(effective)
    remaining = None
    progress = None
    if nxt:
        # Mesuré sur la MÊME base que le palier, sinon l'objectif affiché ne
        # correspond pas à la règle appliquée.
        remaining = max(0.0, nxt["floor"] - rolling12)
        span = nxt["floor"] - _affiliate_tier_bounds(effective)[0]
        if span > 0:
            progress = min(1.0, max(0.0,
                           (rolling12 - _affiliate_tier_bounds(effective)[0]) / span))

    # Le garde-fou trimestriel est supprimé : plus de rétrogradation, donc plus
    # d'alerte à afficher. Les champs quarter_* restent renseignés — le CA du
    # trimestre garde son intérêt informatif — mais quarter_warning vaut
    # désormais toujours False : plus rien ne menace le palier acquis.
    floor, _ceil = _affiliate_tier_bounds(effective)
    quarter_target = None
    quarter_progress = None
    quarter_warning = False

    return {
        "cumulative_revenue": round(cumulative, 2),
        "rolling12_revenue": round(rolling12, 2),
        "tier_basis": "rolling_12m",
        "quarter_revenue": round(quarter, 2),
        "validated_orders": validated_orders,
        "tier": effective,
        "tier_theoretical": theoretical,
        "manual_tier": manual_tier,
        "tier_is_manual": manual_tier is not None,
        "commission_rate": rate,
        "next_tier": nxt,
        "remaining_to_next": round(remaining, 2) if remaining is not None else None,
        "progress_to_next": round(progress, 4) if progress is not None else None,
        "pending_commission": round(pending_commission, 2),
        "approved_commission": round(approved_commission, 2),
        "paid_commission": round(paid_commission, 2),
        "next_review": _affiliate_next_quarter_start().isoformat(),
        "quarter_target": quarter_target,
        "quarter_progress": round(quarter_progress, 4) if quarter_progress is not None else None,
        "quarter_warning": quarter_warning,
    }


async def _affiliate_compute_list_metrics(affiliates: list[dict]) -> dict[str, dict]:
    active = [affiliate for affiliate in affiliates if affiliate.get("status") == "active"]
    if not active:
        return {}

    quarter_start = _affiliate_quarter_start().isoformat()
    grouped = {}
    async for row in s.db.affiliate_referrals.aggregate([
        {"$match": {"affiliate_id": {"$in": [affiliate["id"] for affiliate in active]}}},
        {"$group": {
            "_id": "$affiliate_id",
            "cumulative_revenue": {"$sum": {"$cond": [
                {"$in": ["$status", ["approved", "paid"]]},
                {"$ifNull": ["$base_amount", 0]}, 0,
            ]}},
            "quarter_revenue": {"$sum": {"$cond": [
                {"$and": [
                    {"$in": ["$status", ["approved", "paid"]]},
                    {"$gte": [{"$ifNull": ["$approved_at", "$created_at"]}, quarter_start]},
                ]},
                {"$ifNull": ["$base_amount", 0]}, 0,
            ]}},
            "pending_commission": {"$sum": {"$cond": [
                {"$eq": ["$status", "pending"]}, {"$ifNull": ["$commission_amount", 0]}, 0,
            ]}},
            "approved_commission": {"$sum": {"$cond": [
                {"$eq": ["$status", "approved"]}, {"$ifNull": ["$commission_amount", 0]}, 0,
            ]}},
            "paid_commission": {"$sum": {"$cond": [
                {"$eq": ["$status", "paid"]}, {"$ifNull": ["$commission_amount", 0]}, 0,
            ]}},
        }},
    ]):
        grouped[row["_id"]] = row

    metrics = {}
    valid_tiers = {tier[0] for tier in s.AFFILIATE_TIERS}
    for affiliate in active:
        totals = grouped.get(affiliate["id"], {})
        cumulative = float(totals.get("cumulative_revenue", 0))
        quarter = float(totals.get("quarter_revenue", 0))
        manual_tier = str(affiliate.get("manual_tier") or "").strip().lower() or None
        if manual_tier not in valid_tiers:
            manual_tier = None
        theoretical = _affiliate_tier_for_revenue(cumulative)
        effective = manual_tier or theoretical
        floor, _ceil = _affiliate_tier_bounds(theoretical)
        if not manual_tier and quarter < floor and _affiliate_tier_index(theoretical) > 0:
            effective = s.AFFILIATE_TIERS[_affiliate_tier_index(theoretical) - 1][0]
        metrics[affiliate["id"]] = {
            "cumulative_revenue": round(cumulative, 2),
            "quarter_revenue": round(quarter, 2),
            "tier": effective,
            "commission_rate": _affiliate_rate_for_tier(effective),
            "pending_commission": round(float(totals.get("pending_commission", 0)), 2),
            "approved_commission": round(float(totals.get("approved_commission", 0)), 2),
            "paid_commission": round(float(totals.get("paid_commission", 0)), 2),
        }
    return metrics


def _affiliate_public(aff: dict, metrics: Optional[dict] = None, lang: str = "fr") -> dict:
    """Représentation exposée à l'affilié (jamais de champs internes sensibles)."""
    out = {
        "id": aff.get("id"),
        "code": aff.get("code"),
        "coupon_code": aff.get("code"),
        "name": aff.get("name"),
        "first_name": aff.get("first_name", ""),
        "last_name": aff.get("last_name", ""),
        "company": aff.get("company", ""),
        "email": aff.get("email"),
        "status": aff.get("status"),
        "compliance_status": aff.get("compliance_status", "compliant"),
        "payout_currency": aff.get("payout_currency", "usdt"),
        "payout_address": aff.get("payout_address", ""),
        "payout_network": aff.get("payout_network", ""),
        "payout_configured": bool(
            (aff.get("payout_address") or "").strip()
            and _detect_payout_network(aff.get("payout_address") or "")
        ),
        "coupon_percent": aff.get("coupon_percent"),
        "aliases": aff.get("aliases", []),
        "activated_at": aff.get("activated_at"),
        "created_at": aff.get("created_at"),
    }
    if metrics:
        out.update(metrics)
        out["tier_label"] = s.AFFILIATE_TIER_LABELS.get(
            metrics["tier"], {}).get("fr" if lang.startswith("fr") else "en", metrics["tier"])
    return out


# ===========================================================================
# EMAILS (NOVA identity, cohérent avec _send_magic_email)
# ===========================================================================

def _affiliate_invite_html(name: str, link: str, lang: str) -> tuple:
    fr = lang.startswith("fr")
    if fr:
        subject = "Invitation — Programme d'affiliation Fironova"
        heading = "Vous êtes invité(e)"
        intro = (f"Bonjour {name}, vous avez été invité(e) à rejoindre le "
                 "programme d'affiliation privé de Fironova. Activez votre "
                 "compte pour accéder à votre tableau de bord.")
        cta = "Activer mon compte affilié"
        expiry = f"Ce lien expire dans {s.AFFILIATE_INVITE_TTL_HOURS // 24} jours et ne sert qu'une fois."
        ignore = "Si vous n'attendiez pas cette invitation, ignorez cet email."
    else:
        subject = "Invitation — Fironova Affiliate Program"
        heading = "You're invited"
        intro = (f"Hi {name}, you've been invited to join Fironova's private "
                 "affiliate program. Activate your account to access your dashboard.")
        cta = "Activate my affiliate account"
        expiry = f"This link expires in {s.AFFILIATE_INVITE_TTL_HOURS // 24} days and works only once."
        ignore = "If you weren't expecting this invitation, you can ignore this email."
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
    return subject, html


async def _affiliate_send_invite(email: str, name: str, link: str, lang: str) -> None:
    subject, html = _affiliate_invite_html(name, link, lang)
    # globals() lisait les variables de CE module, où MAGIC_SENDER_EMAIL et
    # SENDER_EMAIL n'ont jamais été définis : les deux lookups renvoyaient None
    # et l'expéditeur retombait toujours sur "orders@fironova.com" codé en dur,
    # en ignorant la configuration. Si cette adresse n'est pas vérifiée chez le
    # fournisseur d'envoi, TOUTES les invitations échouent — alors que le reste
    # des courriels, qui passe par s.SENDER_EMAIL, part normalement.
    #
    # AFFILIATE_SENDER_EMAIL d'abord : une invitation à un partenariat n'a pas
    # à partir de l'adresse des commandes.
    from_addr = s.AFFILIATE_SENDER_EMAIL or s.MAGIC_SENDER_EMAIL or s.SENDER_EMAIL
    await s._send_email(email, subject, html, from_email=from_addr)  # noqa: F821


# ===========================================================================
# ATTRIBUTION — appelée depuis checkout() et _mark_order_paid() / refund
# ===========================================================================


async def _affiliate_ensure_coupon(affiliate_code: str, affiliate_id: str,
                                    percent: Optional[float] = None) -> Optional[dict]:
    """Crée un coupon de rabais lié au code affilié (idempotent).
    - percent explicite (nouveau flux) : pourcentage à créer ;
    - percent None : fallback vers AFFILIATE_COUPON_PERCENT (legacy).
    Si <=0 → aucune création. Le coupon reste éditable/désactivable en admin."""
    effective = float(percent) if (percent is not None) else float(s.AFFILIATE_COUPON_PERCENT)
    if effective <= 0:
        return None
    code = (affiliate_code or "").upper().strip()
    if not code:
        return None
    existing = await s.db.coupons.find_one({"code": code}, {"_id": 0})
    if existing:
        return existing
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "discount_type": "percent",
        "value": effective,
        "min_subtotal": 0.0,
        "usage_limit": None,
        "used_count": 0,
        "active": True,
        "expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "affiliate_id": affiliate_id,
        "source": "affiliate",
    }
    await s.db.coupons.insert_one(doc)
    doc.pop("_id", None)
    logging.info("[affiliate] coupon %s créé (%.0f%%) pour affilié %s",
                 code, effective, affiliate_id)
    return doc


async def affiliate_capture_click(request: Request, response: Response, code: str,
                                  page: str = "", referrer: str = "", device: str = "") -> None:
    """Pose le cookie d'attribution (httpOnly) + journalise le clic.
    Attribution au PREMIER clic : si un cookie fn_ref valide est déjà posé,
    on le conserve (le référent d'origine garde la commande).
    page/referrer/device sont des métadonnées d'analyse de sources (optionnelles)."""
    code = (code or "").strip().upper()
    if not code:
        return
    existing = request.cookies.get(s.AFFILIATE_COOKIE_NAME)
    if existing and existing.strip().upper():
        return  # premier clic conservé — pas d'écrasement
    affiliate = await s.db.affiliates.find_one(
        {
            "status": "active",
            "$or": [
                {"code": code},
                {"aliases": {"$elemMatch": {"code": code, "active": True}}},
            ],
        },
        {"_id": 0, "id": 1, "code": 1},
    )
    if not affiliate:
        return
    now = datetime.now(timezone.utc)
    response.set_cookie(
        s.AFFILIATE_COOKIE_NAME, code,
        max_age=s.AFFILIATE_COOKIE_DAYS * 86400,
        httponly=True, samesite="lax", secure=True, path="/",
    )
    click_doc = {
        "id": str(uuid.uuid4()),
        "affiliate_id": affiliate["id"],
        "code": code,
        "ip_hash": _affiliate_hash_ip(s._client_ip(request)),  # noqa: F821
        "user_agent": (request.headers.get("user-agent", "") or "")[:300],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=s.AFFILIATE_CLICK_TTL_DAYS)).isoformat(),
    }
    click_doc["page"] = (page or "")[:300]
    click_doc["referrer"] = (referrer or "")[:300]
    click_doc["device"] = (device or "")[:40]
    await s.db.affiliate_clicks.insert_one(click_doc)


async def affiliate_attach_to_order(order_doc: dict, request: Request) -> None:
    """Lit le cookie fn_ref et attache l'affilié à la commande (champ additif).
    Anti auto-parrainage : refuse si l'email de commande == email affilié.
    À appeler DANS checkout() juste avant db.orders.insert_one(order_doc)."""
    code = request.cookies.get(s.AFFILIATE_COOKIE_NAME)
    if not code:
        return
    code = code.strip().upper()
    affiliate = await s.db.affiliates.find_one(
        {"code": code, "status": "active"}, {"_id": 0}
    )
    if not affiliate:
        return
    order_email = (order_doc.get("email") or "").lower().strip()
    affiliate_user_id = str(affiliate.get("user_id") or "").strip()
    order_user_id = str(order_doc.get("user_id") or "").strip()
    # Auto-parrainage direct (même email ou même compte utilisateur) : bloqué.
    if order_email and order_email == (affiliate.get("email") or "").lower().strip():
        return
    if affiliate_user_id and order_user_id and affiliate_user_id == order_user_id:
        return
    order_doc["affiliate_id"] = affiliate["id"]
    order_doc["affiliate_code"] = affiliate["code"]
    order_doc["affiliate_ip_hash"] = _affiliate_hash_ip(s._client_ip(request))  # noqa: F821


async def _affiliate_is_self_order(affiliate: dict, order: dict) -> bool:
    """self-order = email OU adresse de livraison OU IP hachée en commun avec
    l'affilié ou avec une commande antérieure déjà marquée self-order."""
    aff_email = (affiliate.get("email") or "").lower().strip()
    order_email = (order.get("email") or "").lower().strip()
    if aff_email and order_email and aff_email == order_email:
        return True

    aff_user_id = str(affiliate.get("user_id") or "").strip()
    order_user_id = str(order.get("user_id") or "").strip()
    if aff_user_id and order_user_id and aff_user_id == order_user_id:
        return True

    # IP du clic/commande == IP connue de l'affilié (invite/activation)
    order_ip_hash = order.get("affiliate_ip_hash")
    if order_ip_hash and order_ip_hash == affiliate.get("ip_hash"):
        return True

    # Adresse de livraison identique à une adresse connue de l'affilié
    addr = order.get("shipping_address") or {}
    norm = _affiliate_norm_address(addr)
    if norm and norm in (affiliate.get("known_addresses") or []):
        return True
    return False


def _affiliate_norm_address(addr: dict) -> str:
    if not addr:
        return ""
    parts = [
        (addr.get("address1") or "").lower().strip(),
        (addr.get("postal_code") or "").lower().replace(" ", ""),
    ]
    return "|".join(p for p in parts if p)


async def affiliate_on_order_paid(order: dict) -> None:
    """Crée la commission 'pending' au paiement confirmé.
    À appeler DANS _mark_order_paid(), après la transition réussie.
    Idempotent : index unique sur order_id empêche le double comptage."""
    affiliate_id = order.get("affiliate_id")
    if not affiliate_id:
        return
    affiliate = await s.db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
    if not affiliate or affiliate.get("status") != "active":
        return

    # Base = sous-total produits HT (hors port, hors taxes), net de remise.
    subtotal = float(order.get("subtotal", 0.0))
    discount = float(order.get("discount", 0.0))
    base = max(0.0, round(subtotal - discount, 2))
    if base <= 0:
        return

    # Exclusion self-order
    if await _affiliate_is_self_order(affiliate, order):
        excluded_reason = "self_order"
        status = "excluded"
        commission = 0.0
    else:
        excluded_reason = None
        status = "pending"
        # Taux au palier EFFECTIF courant de l'affilié
        metrics = await _affiliate_compute_metrics(affiliate_id)
        commission = round(base * metrics["commission_rate"], 2)

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "affiliate_id": affiliate_id,
        "affiliate_code": affiliate.get("code"),
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_email": order.get("email"),
        "base_amount": base,
        "commission_amount": commission,
        "status": status,                       # pending|approved|paid<reversed|excluded
        "excluded_reason": excluded_reason,
        "created_at": now,
        "approved_at": None,
        "paid_at": None,
        "payout_id": None,
    }
    try:
        await s.db.affiliate_referrals.insert_one(doc)
    except Exception as e:
        # index unique (order_id) → déjà comptée, on ignore silencieusement
        logging.info("[affiliate] referral already exists for order %s (%s)",
                     order.get("order_number"), e)


async def affiliate_on_order_reversed(order_id: str, full: bool = True) -> None:
    """Passe la commission liée à 'reversed' lors d'un remboursement total /
    chargeback. À appeler depuis admin_refund_order() quand new_refunded>=total,
    et depuis le webhook chargeback si présent."""
    if not full:
        return
    now = datetime.now(timezone.utc).isoformat()
    await s.db.affiliate_referrals.update_many(
        {"order_id": order_id, "status": {"$in": ["pending", "approved"]}},
        {"$set": {"status": "reversed", "reversed_at": now}},
    )

#                                    devienne 'approved' (fenêtre refund)


async def _affiliate_approve_matured():
    """Passe pending→approved les commissions dont l'ordre est payé depuis
    plus de AFFILIATE_APPROVAL_HOLD_DAYS jours et non remboursé."""
    cutoff = (datetime.now(timezone.utc) -
              timedelta(days=s.AFFILIATE_APPROVAL_HOLD_DAYS)).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    matured = await s.db.affiliate_referrals.find(
        {"status": "pending", "created_at": {"$lte": cutoff}},
        {"_id": 0, "id": 1, "order_id": 1},
    ).to_list(None)
    if not matured:
        return
    order_ids = list({r["order_id"] for r in matured})
    paid_cursor = s.db.orders.find(
        {"id": {"$in": order_ids}, "payment_status": "paid"}, {"_id": 0, "id": 1}
    )
    paid_ids = {o["id"] async for o in paid_cursor}
    approve_ids = [r["id"] for r in matured if r["order_id"] in paid_ids]
    if approve_ids:
        await s.db.affiliate_referrals.update_many(
            {"id": {"$in": approve_ids}, "status": "pending"},
            {"$set": {"status": "approved", "approved_at": now}},
        )


async def _affiliate_clicks_cleanup():
    """Purge des clics expirés (rétention limitée — proportionnalité Loi 25)."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        await s.db.affiliate_clicks.delete_many({"expires_at": {"$lt": now}})
    except Exception as e:  # pragma: no cover
        logging.error("[affiliate] clicks cleanup failed: %s", e)


async def affiliate_maintenance_watchdog():
    """Boucle de maintenance (à lancer au startup si worker lock acquis)."""
    while True:
        try:
            await _affiliate_approve_matured()
            await _affiliate_clicks_cleanup()
        except Exception as e:  # pragma: no cover
            logging.error("[affiliate] maintenance error: %s", e)
        await asyncio.sleep(3600)  # toutes les heures


async def _process_affiliate_email_job() -> bool:
    """Claim and process one durable affiliate email job."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    job = await s.db.affiliate_email_jobs.find_one_and_update(
        {"$or": [
            {"status": {"$in": ["pending", "retry"]}, "available_at": {"$lte": now_iso}},
            {"status": "sending", "lease_expires_at": {"$lte": now_iso}},
        ]},
        {"$set": {
            "status": "sending",
            "started_at": now_iso,
            "lease_expires_at": (now + timedelta(minutes=5)).isoformat(),
        }, "$inc": {"attempts": 1}},
        sort=[("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )
    if not job:
        return False

    try:
        await s._affiliate_send_invite(
            job["email"], job.get("name", ""), job["link"], job.get("lang", "fr")
        )
        await s.db.affiliate_email_jobs.update_one(
            {"id": job["id"], "status": "sending"},
            {"$set": {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()},
             "$unset": {"link": "", "lease_expires_at": ""}},
        )
    except Exception as exc:
        attempts = int(job.get("attempts", 1))
        terminal = attempts >= 5
        delay_seconds = min(3600, 30 * (2 ** max(0, attempts - 1)))
        await s.db.affiliate_email_jobs.update_one(
            {"id": job["id"], "status": "sending"},
            {"$set": {
                "status": "failed" if terminal else "retry",
                "available_at": (datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)).isoformat(),
                "error_type": type(exc).__name__,
            }, "$unset": {"lease_expires_at": ""}},
        )
        logging.warning(
            "[affiliate] queued email failed job=%s attempt=%d error_type=%s",
            job["id"], attempts, type(exc).__name__,
        )
    return True


async def _affiliate_email_worker():
    while True:
        try:
            processed = await _process_affiliate_email_job()
        except Exception as exc:  # pragma: no cover
            logging.error("[affiliate] email worker error_type=%s", type(exc).__name__)
            processed = False
        await asyncio.sleep(0 if processed else 2)


async def affiliate_ensure_indexes():
    """Index — à appeler dans seed_admin_and_products() ou au startup."""
    await s.db.affiliates.create_index("id", unique=True)
    # Unique uniquement quand `code` est présent et de type string : permet
    # plusieurs invités concurrents avec code:null sans conflit d'index.
    try:
        # Purge l'ancien index strict s'il existe (migration one-shot).
        info = await s.db.affiliates.index_information()
        if "code_1" in info and not info["code_1"].get("partialFilterExpression"):
            await s.db.affiliates.drop_index("code_1")
    except Exception:
        pass
    await s.db.affiliates.create_index(
        "code", unique=True,
        partialFilterExpression={"code": {"$type": "string"}},
        name="code_1_partial",
    )
    await s.db.affiliates.create_index("email", unique=True)
    await s.db.affiliates.create_index("user_id", sparse=True)
    await s.db.affiliate_referrals.create_index("order_id", unique=True)
    await s.db.affiliate_referrals.create_index("affiliate_id")
    await s.db.affiliate_referrals.create_index("status")
    await s.db.affiliate_clicks.create_index("affiliate_id")
    await s.db.affiliate_clicks.create_index("expires_at")
    await s.db.affiliate_payouts.create_index("id", unique=True)
    await s.db.affiliate_payouts.create_index(
        [("affiliate_id", 1), ("period", 1)], unique=True,
    )
    await s.db.affiliate_payouts.create_index("affiliate_id")
    await s.db.affiliate_email_jobs.create_index("id", unique=True)
    await s.db.affiliate_email_jobs.create_index([("status", 1), ("available_at", 1), ("created_at", 1)])
    await s.db.affiliate_email_jobs.create_index("expires_at", expireAfterSeconds=0)

# ===========================================================================
# Item 3.2 — Seuil minimum de payout affilié (AFFILIATE_PAYOUT_MIN_CAD)
# ===========================================================================
async def _defer_affiliate_payout_below_threshold(
    aff: dict, period: str, amount_cad: float, referral_count: int,
    threshold_cad: float,
) -> bool:
    """Enregistre un report de payout (montant < seuil) et notifie l'affilié
    UNE seule fois par (affiliate_id, period). Idempotent via unique index.

    Retourne True si un email a été mis en file d'attente (premier report),
    False si déjà notifié pour cette période (re-run scheduler)."""
    now = datetime.now(timezone.utc)
    deferral_doc = {
        "id": str(uuid.uuid4()),
        "affiliate_id": aff.get("id"),
        "affiliate_code": aff.get("code"),
        "affiliate_email": aff.get("email"),
        "period": period,
        "amount_cad": round(float(amount_cad), 2),
        "threshold_cad": round(float(threshold_cad), 2),
        "referral_count": int(referral_count),
        "created_at": now.isoformat(),
        "email_status": "pending",
    }
    try:
        await s.db.affiliate_payout_deferrals.insert_one(deferral_doc)
    except DuplicateKeyError:
        # Déjà notifié pour cette période — no-op (re-run scheduler)
        return False

    email = (aff.get("email") or "").strip()
    if not email:
        await s.db.affiliate_payout_deferrals.update_one(
            {"id": deferral_doc["id"]},
            {"$set": {"email_status": "skipped_no_email"}},
        )
        return False

    lang = (aff.get("preferred_lang") or "fr").lower()
    first_name = aff.get("first_name") or aff.get("name") or ""
    subject_fr = f"FIRONOVA — Votre paiement d'affilié de {period} est reporté au prochain cycle"
    subject_en = f"FIRONOVA — Your {period} affiliate payout is deferred to next cycle"
    subject = subject_fr if lang == "fr" else subject_en

    amount_str = f"{amount_cad:.2f} $ CAD"
    threshold_str = f"{threshold_cad:.2f} $ CAD"
    remaining = max(0.0, threshold_cad - amount_cad)
    remaining_str = f"{remaining:.2f} $ CAD"

    hello_fr = f"Bonjour {first_name}," if first_name else "Bonjour,"
    hello_en = f"Hello {first_name}," if first_name else "Hello,"

    body_fr = f"""
      <p style="margin:0 0 16px">{hello_fr}</p>
      <p style="margin:0 0 16px">
        Vos commissions cumulées pour la période <strong>{period}</strong> s'élèvent à
        <strong>{amount_str}</strong>, ce qui est inférieur à notre seuil minimum de
        paiement de <strong>{threshold_str}</strong>.
      </p>
      <p style="margin:0 0 16px">
        <strong>Bonne nouvelle :</strong> vos commissions ne sont pas perdues. Elles restent
        à votre crédit et seront automatiquement additionnées au prochain cycle mensuel.
      </p>
      <p style="margin:0 0 16px">
        Il vous reste <strong>{remaining_str}</strong> à générer pour atteindre le seuil et
        déclencher un paiement. Merci pour votre partenariat &mdash; continuez sur votre lancée !
      </p>
      <p style="margin:24px 0 0;color:#666;font-size:12px">
        Pourquoi un seuil ? Les frais de réseau blockchain (gas) rendent inefficace l'envoi
        de très petits montants. Regrouper les paiements maximise ce que vous recevez réellement.
      </p>
    """
    body_en = f"""
      <p style="margin:0 0 16px">{hello_en}</p>
      <p style="margin:0 0 16px">
        Your accumulated commissions for period <strong>{period}</strong> total
        <strong>{amount_str}</strong>, which is below our minimum payout threshold of
        <strong>{threshold_str}</strong>.
      </p>
      <p style="margin:0 0 16px">
        <strong>Good news:</strong> your commissions are not lost. They stay to your credit
        and will automatically roll over to the next monthly cycle.
      </p>
      <p style="margin:0 0 16px">
        You need <strong>{remaining_str}</strong> more to reach the threshold and trigger a
        payout. Thanks for your partnership &mdash; keep it up!
      </p>
      <p style="margin:24px 0 0;color:#666;font-size:12px">
        Why a threshold? Blockchain network fees (gas) make sending very small amounts
        inefficient. Grouping payouts maximizes what you actually receive.
      </p>
    """
    body = body_fr if lang == "fr" else body_en

    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F5F1EA;font-family:'Inter',Arial,sans-serif;color:#0B2E4F">
  <table style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #E5DED0;border-radius:8px;overflow:hidden">
    <tr><td style="background:#0B2E4F;color:#fff;padding:20px 28px;font-family:monospace;letter-spacing:3px;font-size:14px">FIRONOVA · AFFILIATE PROGRAM</td></tr>
    <tr><td style="padding:32px 28px;font-size:14px;line-height:1.6">
      {body}
    </td></tr>
    <tr><td style="background:#0B2E4F;color:#fff;padding:14px 28px;font-family:monospace;font-size:10px;letter-spacing:2px">FIRONOVA · CANADA · {now.strftime("%Y")}</td></tr>
  </table>
</body></html>"""

    try:
        await s._send_email(email, subject, html)
        await s.db.affiliate_payout_deferrals.update_one(
            {"id": deferral_doc["id"]},
            {"$set": {"email_status": "queued",
                      "email_queued_at": datetime.now(timezone.utc).isoformat()}},
        )
        return True
    except Exception as e:
        await s.db.affiliate_payout_deferrals.update_one(
            {"id": deferral_doc["id"]},
            {"$set": {"email_status": "failed", "email_error": type(e).__name__}},
        )
        logging.error("[payout-deferral] email queue failed affiliate=%s period=%s",
                      aff.get("id"), period)
        return False

# ---- Scheduler mensuel (America/Toronto minuit local) ------------------------
async def _monthly_payouts_scheduler():
    """Génère automatiquement les payouts le 1er de chaque mois à minuit
    America/Toronto (heure locale québécoise). Anti-double via collection
    `payout_runs`."""
    from zoneinfo import ZoneInfo
    tz_montreal = ZoneInfo("America/Toronto")

    # Assure l'index unique (idempotent)
    try:
        await s.db.payout_runs.create_index([("period", 1), ("auto", 1)], unique=True)
    except Exception:
        pass

    while True:
        try:
            now_local = datetime.now(tz_montreal)
            # Prochain 1er du mois à 00:05 locale (buffer 5 min pour éviter jitter cron)
            if now_local.month == 12:
                next_run = now_local.replace(year=now_local.year + 1, month=1, day=1,
                                              hour=0, minute=5, second=0, microsecond=0)
            else:
                next_run = now_local.replace(month=now_local.month + 1, day=1,
                                              hour=0, minute=5, second=0, microsecond=0)
            wait_s = (next_run - now_local).total_seconds()
            logging.info("[monthly-payouts] next auto-run: %s (in %.0f min)",
                         next_run.isoformat(), wait_s / 60)
            await asyncio.sleep(max(60, wait_s))

            # Le mois qu'on paie est le PRÉCÉDENT
            paid_local = datetime.now(tz_montreal)
            if paid_local.month == 1:
                period = f"{paid_local.year - 1}-12"
            else:
                period = f"{paid_local.year}-{paid_local.month - 1:02d}"

            try:
                await s.db.payout_runs.insert_one({
                    "id": str(uuid.uuid4()),
                    "period": period,
                    "auto": True,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "status": "running",
                })
            except Exception:
                logging.info("[monthly-payouts] period %s already ran, skip", period)
                continue

            try:
                # Appelle la génération existante (crée les payouts 'ready')
                fx_rate, fx_source = await _fetch_cad_to_usd_rate()
                fx_captured_at = datetime.now(timezone.utc).isoformat()
                await _generate_payouts_for_period(period, fx_rate, fx_source, fx_captured_at)
                await s.db.payout_runs.update_one(
                    {"period": period, "auto": True},
                    {"$set": {"status": "done",
                              "ended_at": datetime.now(timezone.utc).isoformat()}},
                )
                logging.info("[monthly-payouts] period %s generated", period)
            except Exception as e:
                await s.db.payout_runs.update_one(
                    {"period": period, "auto": True},
                    {"$set": {"status": "failed", "error": str(e)}},
                )
                logging.error("[monthly-payouts] period %s failed: %s", period, e)
        except Exception as e:
            logging.error("[monthly-payouts] scheduler loop error: %s", e)
            await asyncio.sleep(3600)


async def _generate_payouts_for_period(period: str, fx_rate: float,
                                        fx_source: str, fx_captured_at: str) -> int:
    """Extraction du corps de admin_affiliate_run_payouts en fonction réutilisable
    par le scheduler."""
    now = datetime.now(timezone.utc)
    pipeline = [
        {"$match": {"status": "approved", "payout_id": None}},
        {"$group": {"_id": "$affiliate_id",
                    "total": {"$sum": "$commission_amount"},
                    "ids": {"$push": "$id"}}},
    ]
    count = 0
    async for grp in s.db.affiliate_referrals.aggregate(pipeline):
        affiliate_id = grp["_id"]
        total = round(float(grp["total"]), 2)
        if total <= 0:
            continue
        aff = await s.db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
        if not aff or aff.get("status") != "active":
            continue
        # ---- Item 3.2 : seuil minimum de payout (skip + notification) --------
        if total < s.AFFILIATE_PAYOUT_MIN_CAD:
            await _defer_affiliate_payout_below_threshold(
                aff, period, total, len(grp["ids"]), s.AFFILIATE_PAYOUT_MIN_CAD,
            )
            continue
        payout_currency = (aff.get("payout_currency") or "usdt").lower()
        amount_cad = total
        if payout_currency in s.AFFILIATE_PAYOUT_CURRENCIES:
            amount_usd = round(amount_cad * fx_rate, 2)
            amount_target = amount_usd
        else:
            amount_usd = None
            amount_target = amount_cad
        payout_id = str(uuid.uuid4())
        try:
            await s.db.affiliate_payouts.insert_one({
                "id": payout_id,
                "affiliate_id": affiliate_id,
                "affiliate_code": aff.get("code"),
                "period": period,
                "amount": amount_target,
                "amount_cad": amount_cad,
                "amount_usd": amount_usd,
                "currency": payout_currency,
                "fx_rate_cad_to_usd": fx_rate if payout_currency in s.AFFILIATE_PAYOUT_CURRENCIES else None,
                "fx_source": fx_source if payout_currency in s.AFFILIATE_PAYOUT_CURRENCIES else None,
                "fx_captured_at": fx_captured_at,
                "payout_address": aff.get("payout_address", ""),
                "referral_ids": grp["ids"],
                "referral_count": len(grp["ids"]),
                "status": "ready",
                "reference": None,
                "note": "",
                "created_at": now.isoformat(),
                "paid_at": None,
                "auto_generated": True,
            })
        except DuplicateKeyError:
            existing_payout = await s.db.affiliate_payouts.find_one(
                {"affiliate_id": affiliate_id, "period": period},
                {"_id": 0, "id": 1, "referral_ids": 1},
            )
            recover_ids = list(set(grp["ids"]) & set((existing_payout or {}).get("referral_ids", [])))
            if existing_payout and recover_ids:
                await s.db.affiliate_referrals.update_many(
                    {"id": {"$in": recover_ids}, "payout_id": None},
                    {"$set": {"payout_id": existing_payout["id"]}},
                )
            continue
        await s.db.affiliate_referrals.update_many(
            {"id": {"$in": grp["ids"]}},
            {"$set": {"payout_id": payout_id}},
        )
        count += 1
    return count
