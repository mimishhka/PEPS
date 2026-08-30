"""Affiliate program service: tiers, referral attribution, coupon codes and
aliases, metrics, invitations, and payout generation/scheduling."""

import asyncio
import hashlib
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


def _palier_effectif(manuel: Optional[str], theorique: str, entente: bool) -> str:
    """Palier réellement appliqué, selon qu'une entente existe ou non.

    Deux situations que le code confondait :

    — SOUS ENTENTE, le palier est FIGÉ à la valeur convenue. C'est l'engagement
      pris : il ne varie pas avec le volume, et ne redescend jamais seul.

    — SANS ENTENTE, un palier saisi à la main est un COUP DE POUCE, pas un
      plafond. Le code retenait `manuel or theorique`, donc le manuel gagnait
      toujours : quelqu'un ajusté à Bronze qui générait ensuite de quoi valoir
      Gold restait bloqué à Bronze — traité exactement comme un compte sous
      entente, sans en avoir une, et sans que rien ne le signale.

      On retient donc le MEILLEUR des deux. Un geste destiné à avantager
      quelqu'un ne peut pas finir par le pénaliser.
    """
    if not manuel:
        return theorique
    if entente:
        return manuel
    return manuel if _affiliate_tier_index(manuel) >= _affiliate_tier_index(theorique) else theorique


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


# _affiliate_ip_salt() et _affiliate_hash_ip() vivaient ici. Elles servaient à
# comparer « même IP ? » sans stocker l'adresse en clair — utile tant qu'il
# fallait repérer les commandes d'un affilié à lui-même. Cette règle étant
# retirée, plus personne n'appelait ces fonctions et plus aucune empreinte
# n'était lue. Les garder aurait laissé le code prêt à recalculer des
# empreintes que les conditions annoncent désormais ne plus produire.


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
        if await s.db.affiliates.find_one(q, {"_id": 1}) is not None:
            return True
        # LA COLLECTION `coupons` COMPTE AUSSI comme collision.
        #
        # Ce contrôle ne regardait que `affiliates`. Un code généré pouvait donc
        # tomber sur un coupon PROMOTIONNEL existant — « NOEL15 » pour « Noel
        # Nutrition » à 15 %, par exemple. _affiliate_ensure_coupon adopte alors
        # le coupon trouvé sans le marquer : il reste `source: promo`, sans
        # `affiliate_id`. Conséquences en chaîne : _is_affiliate_coupon répond
        # False, donc le contrôle de suspension ne s'applique pas ; le coupon
        # satisfait FILTRE_PROMO, donc il apparaît dans l'écran des promos et y
        # devient modifiable et supprimable. Toute la séparation entre les deux
        # types de coupons tombait pour ce code.
        #
        # La protection existait déjà dans l'autre sens (créer une promo au nom
        # d'un code d'affilié est refusé en 409) : elle n'était bonne que d'un
        # côté.
        return await s.db.coupons.find_one({"code": c}, {"_id": 1}) is not None

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

# ---- Prix réel du jeton stable (CoinMarketCap) --------------------------------
#
# La conversion CAD → USD relève de la Banque du Canada : deux monnaies d'État,
# source officielle, auditable. Ce qui suit règle un problème DIFFÉRENT.
#
# Le versement part en USDT ou USDC, et le code supposait 1 jeton = 1 USD. Cette
# parité tient à moins de 0,1 % en temps normal, mais elle a cédé : USDC est
# tombé à 0,87 en mars 2023, USDT à 0,95 en mai 2022. Sur une commission de
# 250 $, l'affilié recevait alors 217 $ de valeur réelle sans jamais savoir
# pourquoi. La dette étant libellée en dollars canadiens, c'est la QUANTITÉ de
# jetons qui doit s'ajuster, pas la valeur livrée.
#
# BANDE DE SÉCURITÉ, non négociable. Un prix hors de [0,80 ; 1,05] fait ÉCHOUER
# la conversion plutôt que de la calculer. Ce n'est pas de la prudence
# décorative : le chemin d'analyse documenté par le fournisseur mène aussi à
# `market_cap`, qui vaut ~140 milliards. Sans cette borne, une erreur de champ
# multiplierait un versement par cent quarante milliards.
# Endpoint PUBLIC de CoinMarketCap : aucune clé, aucune inscription. Sa
# structure diffère de celle de l'API v1 documentée — `data` et `quote` y sont
# des TABLEAUX, non des objets indexés par symbole.
CMC_PRICE_URL = ("https://pro-api.coinmarketcap.com/public-api/v3"
                 "/cryptocurrency/quotes/latest")

# On interroge par IDENTIFIANT, jamais par symbole. `symbol=USDT` renvoie DEUX
# jetons — le Tether authentique (825) à 0,9998 et un « Bridged USDT » à
# 0,9925. Prendre la première entrée venue donnerait un prix faux un jour sur
# deux, sans que rien ne le signale.
CMC_IDS = {"usdt": 825, "usdc": 3408}

STABLE_PRICE_MIN = 0.80
STABLE_PRICE_MAX = 1.05
_STABLE_CACHE: dict = {}          # symbole -> {"price", "fetched_at", "source"}
_STABLE_CACHE_TTL_S = 15 * 60     # 15 min : un décrochage se joue en heures


async def _fetch_stable_price(symbol: str) -> tuple:
    """Retourne (prix_en_USD, source). (1.0, "assumed_peg") si indisponible.

    Le repli à 1,0 reproduit exactement le comportement antérieur : si le
    service ne répond pas, rien ne change. C'est l'ajout du prix qui est une
    amélioration, pas son absence qui serait une panne.
    """
    import time
    sym = (symbol or "usdt").strip().lower()
    cmc_id = CMC_IDS.get(sym)
    if not cmc_id:
        return 1.0, "assumed_peg"

    now_ts = time.time()
    cached = _STABLE_CACHE.get(sym)
    if cached and (now_ts - cached["fetched_at"]) < _STABLE_CACHE_TTL_S:
        return cached["price"], cached["source"]

    try:
        import httpx
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                CMC_PRICE_URL,
                params={"id": cmc_id, "convert": "USD"},
                headers={"Accept": "application/json", "User-Agent": "Fironova/1.0"},
            )
            r.raise_for_status()
            data = r.json().get("data") or []
            if not data:
                raise ValueError("réponse sans données")
            # « price », et surtout PAS « market_cap » : les deux sont voisins
            # dans le même objet `quote`, et le second vaut ~7,4e10.
            prix = float(data[0]["quote"][0]["price"])
    except Exception as exc:
        logging.warning("[stable] prix %s indisponible error_type=%s — parité supposée",
                        sym.upper(), type(exc).__name__)
        return 1.0, "assumed_peg"

    if not (STABLE_PRICE_MIN <= prix <= STABLE_PRICE_MAX):
        # Hors bande : on ne devine pas. L'appelant décide d'interrompre.
        logging.error("[stable] prix %s hors bande : %.6f — versement suspendu",
                      sym.upper(), prix)
        return prix, "out_of_band"

    _STABLE_CACHE[sym] = {"price": prix, "fetched_at": now_ts, "source": "coinmarketcap"}
    return prix, "coinmarketcap"


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
    # `tier_agreement` FAIT PARTIE du calcul — sans lui, _palier_effectif est
    # appelée en permanence en mode « sans entente ».
    #
    # La projection ne demandait que `manual_tier`. Le champ était donc toujours
    # absent du document, `bool(None)` valait False, et une entente n'a JAMAIS
    # figé quoi que ce soit. C'est cette fonction qui fournit le taux à la
    # création de chaque commission (affiliate_on_order_paid) : la règle était
    # violée sur le chemin de l'argent, et dans un seul sens — un affilié dont
    # le chiffre d'affaires dépassait le palier convenu était payé au-dessus de
    # l'entente. La liste admin, elle, reçoit le document complet et affichait
    # donc le bon palier : les deux écrans se contredisaient sur la même
    # personne, ce qui rendait l'écart indétectable de l'intérieur.
    affiliate = await s.db.affiliates.find_one(
        {"id": affiliate_id}, {"_id": 0, "manual_tier": 1, "tier_agreement": 1}
    )
    manual_tier = str((affiliate or {}).get("manual_tier") or "").strip().lower() or None
    if manual_tier and manual_tier not in {tier[0] for tier in s.AFFILIATE_TIERS}:
        manual_tier = None

    q_start = _affiliate_quarter_start()

    # Agrégation SERVEUR au lieu d'une boucle Python : la note de la fonction
    # voulait additionner les références validées sans jamais les charger toutes
    # en mémoire. L'ancienne boucle transférait la totalité de l'historique d'un
    # affilié vers FastAPI à chaque appel — or cette fonction est invoquée à
    # CHAQUE commande payée (affiliate_on_order_paid) en plus du tableau de bord.
    #
    # Équivalence sémantique STRICTE avec l'ancienne boucle :
    #   - cumulative/validated_orders : seules les ventes approved|paid comptent,
    #     sur base_amount ;
    #   - rolling12/quarter : en plus d'être approved|paid, la date effective
    #     (approved_at sinon created_at) doit SE PARSER et être >= window/q. Un
    #     champ manquant OU illisible est EXCLU de la fenêtre (mais toujours
    #     compté au cumul) — le même repli « prudent » qu'avant, qui préfère
    #     sous-estimer un palier que l'accorder sur une date incertaine ;
    #   - dates lues `$type` date/timestamp directement, sinon `$dateFromString`
    #     (onError/onNull -> null -> hors fenêtre), soit exactement le
    #     comportement de _date_ou_rien().
    pipeline = [
        {"$match": {"affiliate_id": affiliate_id}},
        {"$project": {
            "_id": 0,
            "status": 1,
            "base": {"$ifNull": ["$base_amount", 0.0]},
            "comm": {"$ifNull": ["$commission_amount", 0.0]},
            # Date effective = approved_at sinon created_at (replie sur null).
            "eff": {"$switch": {
                "branches": [
                    {"$case": {"$in": [
                        {"$type": {"$ifNull": ["$approved_at", "$created_at", None]}},
                        ["date", "timestamp"],
                    ]}, "then": {"$ifNull": ["$approved_at", "$created_at", None]}},
                ],
                "default": {"$dateFromString": {
                    "dateString": {"$ifNull": ["$approved_at", "$created_at", None]},
                    "onError": None,
                    "onNull": None,
                }},
            }},
        }},
        {"$group": {
            "_id": None,
            "cumulative": {"$sum": {"$cond": [
                {"$in": ["$status", ["approved", "paid"]]}, "$base", 0.0]}},
            "validated_orders": {"$sum": {"$cond": [
                {"$in": ["$status", ["approved", "paid"]]}, 1, 0]}},
            "rolling12": {"$sum": {"$cond": [
                {"$and": [
                    {"$in": ["$status", ["approved", "paid"]]},
                    {"$gte": ["$eff", window_start]},
                ]}, "$base", 0.0]}},
            "quarter": {"$sum": {"$cond": [
                {"$and": [
                    {"$in": ["$status", ["approved", "paid"]]},
                    {"$gte": ["$eff", q_start]},
                ]}, "$base", 0.0]}},
            "pending_commission": {"$sum": {"$cond": [
                {"$eq": ["$status", "pending"]}, "$comm", 0.0]}},
            "approved_commission": {"$sum": {"$cond": [
                {"$eq": ["$status", "approved"]}, "$comm", 0.0]}},
            "paid_commission": {"$sum": {"$cond": [
                {"$eq": ["$status", "paid"]}, "$comm", 0.0]}},
        }},
    ]
    totals = await s.db.affiliate_referrals.aggregate(pipeline).to_list(1)
    t = totals[0] if totals else {}
    cumulative = float(t.get("cumulative", 0.0))
    rolling12 = float(t.get("rolling12", 0.0))
    quarter = float(t.get("quarter", 0.0))
    pending_commission = float(t.get("pending_commission", 0.0))
    approved_commission = float(t.get("approved_commission", 0.0))
    paid_commission = float(t.get("paid_commission", 0.0))
    validated_orders = int(t.get("validated_orders", 0))

    # Palier selon le CA des 12 derniers mois. Plus de rétrogradation
    # trimestrielle : la fenêtre glissante fait déjà redescendre le total quand
    # l'activité ralentit, progressivement et sans effet de seuil brutal.
    theoretical = _affiliate_tier_for_revenue(rolling12)
    effective = _palier_effectif(manual_tier, theoretical,
                                 bool((affiliate or {}).get("tier_agreement")))

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
    # 365 derniers jours : c'est CETTE fenêtre qui fixe le palier, comme dans
    # _affiliate_compute_metrics(). Cette liste calculait encore sur le cumul à
    # vie avec rétrogradation trimestrielle — une TROISIÈME version de la même
    # règle, donc un palier affiché à l'admin que l'affilié n'avait pas.
    tier_window_start = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
    grouped = {}
    async for row in s.db.affiliate_referrals.aggregate([
        {"$match": {"affiliate_id": {"$in": [affiliate["id"] for affiliate in active]}}},
        {"$group": {
            "_id": "$affiliate_id",
            "cumulative_revenue": {"$sum": {"$cond": [
                {"$in": ["$status", ["approved", "paid"]]},
                {"$ifNull": ["$base_amount", 0]}, 0,
            ]}},
            "rolling12_revenue": {"$sum": {"$cond": [
                {"$and": [
                    {"$in": ["$status", ["approved", "paid"]]},
                    {"$gte": [{"$ifNull": ["$approved_at", "$created_at"]}, tier_window_start]},
                ]},
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
        rolling12 = float(totals.get("rolling12_revenue", 0))
        manual_tier = str(affiliate.get("manual_tier") or "").strip().lower() or None
        if manual_tier not in valid_tiers:
            manual_tier = None
        # Même règle que partout ailleurs, et par le MÊME code : douze mois
        # glissants, entente prioritaire, ajustement manuel traité comme un
        # plancher. Cette ligne recopiait la règle ; la liste admin affichait
        # donc un palier que la fiche de l'affilié pouvait contredire.
        theoretical = _affiliate_tier_for_revenue(rolling12)
        effective = _palier_effectif(manual_tier, theoretical,
                                     bool(affiliate.get("tier_agreement")))
        metrics[affiliate["id"]] = {
            "cumulative_revenue": round(cumulative, 2),
            "quarter_revenue": round(quarter, 2),
            "rolling12_revenue": round(rolling12, 2),
            # Exposé pour que la liste admin distingue un palier FORCÉ d'un
            # palier mérité : sans ce drapeau, une erreur de saisie reste
            # invisible alors qu'elle promet à l'affilié un taux « accordé par
            # entente » qui « ne peut pas redescendre ».
            "manual_tier": manual_tier,
            "tier_is_manual": manual_tier is not None,
            "tier_agreement": bool(affiliate.get("tier_agreement")),
            "tier_theoretical": theoretical,
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
        # Resolu ici plutot que laisse a None : l'ecran affilie s'en sert pour
        # calculer ce qu'une vente rapporte, et un repli code en dur cote
        # interface trahirait tout changement de AFFILIATE_COUPON_PERCENT.
        # Meme regle qu'a la creation du coupon (_affiliate_ensure_coupon).
        # Entente negociee. Seul ce drapeau autorise le libelle engageant cote
        # affilie ; un manual_tier seul fige le taux sans rien promettre.
        "tier_agreement": bool(aff.get("tier_agreement")),
        # Acceptation des conditions. On expose la comparaison faite, pas la
        # version brute : l'interface n'a pas a rejouer la regle, et un ecart
        # entre les deux implementations passerait inapercu. Un texte revise
        # (AFFILIATE_TERMS_VERSION modifiee) repasse ce drapeau a false et
        # redemande l'acceptation.
        # Visite guidee : marqueur porte par la FICHE, pas par le navigateur.
        # Elle doit se donner une fois par personne, pas une fois par appareil.
        "tour_done": bool(aff.get("tour_done")),
        "terms_ok": aff.get("terms_version") == s.AFFILIATE_TERMS_VERSION,
        "terms_version_required": s.AFFILIATE_TERMS_VERSION,
        "terms_accepted_at": aff.get("terms_accepted_at", ""),
        "coupon_percent": (float(aff["coupon_percent"])
                           if aff.get("coupon_percent") is not None
                           else float(s.AFFILIATE_COUPON_PERCENT)),
        # Alias FILTRÉS, et non le tableau brut.
        #
        # _affiliate_public est une liste blanche stricte partout ailleurs ;
        # cette ligne renvoyait le tableau tel quel. Or chaque entrée porte
        # `archived_by` et `toggled_by` — l'adresse courriel de l'employé qui a
        # manipulé la fiche. Une donnée interne traversait donc la frontière
        # vers un partenaire externe, par GET /api/affiliate/me, sans aucun
        # besoin fonctionnel : l'écran n'affiche que les codes et leur état.
        # Une adresse nominative vérifiée est la matière première d'un
        # hameçonnage ciblé.
        "aliases": [
            {"code": a.get("code"),
             "active": a.get("active", True),
             "discount_percent_at_creation": a.get("discount_percent_at_creation"),
             "archived_at": a.get("archived_at")}
            for a in (aff.get("aliases") or [])
        ],
        "activated_at": aff.get("activated_at"),
        "created_at": aff.get("created_at"),
        # Bareme complet des paliers. Expose plutot que recopie cote interface :
        # une echelle ecrite en dur dans le navigateur divergerait de
        # AFFILIATE_TIERS des qu'un seuil bougerait, et l'affilie verrait une
        # marche a franchir qui n'existe plus.
        "tiers": [
            {"name": n, "rate": r, "floor": f, "ceil": c}
            for (n, r, f, c) in s.AFFILIATE_TIERS
        ],
        # Delai de validation d'une commission. Expose pour la meme raison que
        # le seuil : ecrit en dur cote interface, il divergerait de la valeur
        # appliquee des qu'on la changerait, et l'ecran affirmerait un delai que
        # le systeme n'observe plus.
        "approval_hold_days": int(s.AFFILIATE_APPROVAL_HOLD_DAYS),
        # Seuil minimum de versement. Expose parce que l'affilie doit pouvoir
        # situer ses commissions par rapport a lui : sans ce chiffre, un solde
        # de 12 $ qui ne part pas ressemble a une retenue inexpliquee. La regle
        # est appliquee dans _generate_payouts_for_period().
        "payout_min_cad": float(s.AFFILIATE_PAYOUT_MIN_CAD),
    }
    if metrics:
        out.update(metrics)
        out["tier_label"] = s.AFFILIATE_TIER_LABELS.get(
            metrics["tier"], {}).get("fr" if lang.startswith("fr") else "en", metrics["tier"])
    return out


# ===========================================================================
# EMAILS (NOVA identity, cohérent avec _send_magic_email)
# ===========================================================================

def _affiliate_invite_html(name: str, link: str, lang: str,
                           taux_convenu: float | None = None,
                           lien_programme: str = "") -> tuple:
    """Courriel d'accueil. DEUX versions, choisies par `taux_convenu`.

    L'ancien texte annonçait la même chose à tout le monde : « activez votre
    compte pour accéder à votre tableau de bord ». C'était froid, et surtout
    faux pour une partie des destinataires — on écrivait à quelqu'un dont le
    taux avait été négocié comme s'il découvrait un barème.

    Avec entente, on nomme le taux convenu et on dit ce qui compte pour la
    personne : il ne bouge pas tout seul. Sans entente, on présente la
    progression, qui est justement ce qui l'intéresse.

    Ce que les DEUX taisent : l'existence même des ententes. Celui qui n'en a
    pas ne doit pas apprendre qu'il en existe. C'est pourquoi la distinction
    passe par le contenu du message et jamais par une mention du dispositif.
    """
    fr = lang.startswith("fr")
    entente = taux_convenu is not None
    pct = f"{round(float(taux_convenu or 0) * 100):g}"
    jours = s.AFFILIATE_INVITE_TTL_HOURS // 24

    if fr:
        subject = f"Bienvenue chez Fironova, {name}" if name else "Bienvenue chez Fironova"
        expiry = f"Ce lien expire dans {jours} jours et ne sert qu'une fois."
        ignore = ("Une question ? Répondez simplement à ce courriel. "
                  "Si vous n'attendiez pas cette invitation, ignorez-la.")
        cta = "Activer mon compte"
        salut = f"Bonjour {name}," if name else "Bonjour,"
        # Où lire le programme. Volontairement SANS adresse publique : le
        # programme est privé et rien n'en est exposé sur le site. Le détail
        # vit dans l'espace affilié, donc derrière l'activation — laquelle
        # n'engage à rien : l'acceptation des conditions se fait ensuite, à
        # l'écran, après défilement et clic explicite.
        apres = ("Le détail du programme — commissions, attribution, "
                 "paiements — vous attend dans votre espace dès l'activation.")
        acces = ("Pour vos prochaines connexions : utilisez simplement le lien "
                 "magique — un courriel de connexion sera envoyé à cette adresse — ou, "
                 "si vous préférez, définissez un mot de passe depuis votre tableau "
                 "de bord (Paramètres → Mot de passe).")
        if entente:
            heading = "Nous sommes heureux de vous compter parmi nous"
            intro = ("Nous avons convenu ensemble des conditions de votre "
                     "participation. Voici votre accès et tout ce qu'il faut "
                     "pour commencer.")
            mise_en_avant = f"Votre taux convenu — {pct} % sur chaque vente"
            detail = ("Ce taux s'applique à l'ensemble de vos ventes validées. "
                      "Il ne dépend pas de votre volume et ne diminue jamais de "
                      "lui-même ; toute modification vous serait annoncée.")
        else:
            heading = "Votre place vous attend"
            intro = ("Vous êtes invité(e) à rejoindre notre programme "
                     "d'affiliation. Vos contacts économisent avec votre code, "
                     "et chaque vente validée vous revient en commission.")
            mise_en_avant = "Départ à 10 % — jusqu'à 20 %"
            detail = ("Votre taux suit vos ventes des douze derniers mois, sur "
                      "six paliers. Votre tableau de bord vous montre en "
                      "permanence ce qui vous sépare du suivant.")
    else:
        subject = f"Welcome to Fironova, {name}" if name else "Welcome to Fironova"
        expiry = f"This link expires in {jours} days and works only once."
        ignore = ("Any questions? Just reply to this email. "
                  "If you weren't expecting this invitation, you can ignore it.")
        cta = "Activate my account"
        salut = f"Hello {name}," if name else "Hello,"
        apres = ("The full program — commissions, attribution, payouts — is "
                 "waiting in your account as soon as you activate.")
        acces = ("For your next sign-ins: simply use the magic link — a sign-in "
                 "email will be sent to this address — or, if you prefer, set a password "
                 "from your dashboard (Settings → Password).")
        if entente:
            heading = "We're glad to have you with us"
            intro = ("We've agreed together on the terms of your participation. "
                     "Here's your access and everything you need to begin.")
            mise_en_avant = f"Your agreed rate — {pct}% on every sale"
            detail = ("This rate applies to all your approved sales. It doesn't "
                      "depend on your volume and never decreases on its own; "
                      "any change would be announced to you.")
        else:
            heading = "Your place is waiting"
            intro = ("You've been invited to join our affiliate program. Your "
                     "contacts save with your code, and every approved sale "
                     "earns you a commission.")
            mise_en_avant = "Starting at 10% — up to 20%"
            detail = ("Your rate follows your sales over the last twelve months, "
                      "across six tiers. Your dashboard always shows how far you "
                      "are from the next one.")

    # Lire d'abord, activer ensuite.
    #
    # Le bouton menait droit à l'activation : on demandait de s'engager avant
    # d'avoir rien lu. Quand une page de programme est disponible, c'est elle
    # que le bouton ouvre — l'activation s'y trouve, une fois la lecture faite.
    #
    # Le lien direct reste, en second et discret : si cette page échouait, il
    # ne faut pas que l'invitation devienne inutilisable.
    secondaire = ""
    if lien_programme:
        if fr:
            cta = "Découvrir le programme"
            apres = ("Vous pourrez activer votre compte depuis cette page, "
                     "en connaissance de cause.")
            direct = "Ou activer directement"
        else:
            cta = "See the program"
            apres = ("You'll be able to activate your account from that page, "
                     "once you've read it.")
            direct = "Or activate directly"
        secondaire = (f'<p style="margin:14px 0 0;"><a href="{link}" '
                      f'style="color:#64748B;font-size:12px;text-decoration:underline;">'
                      f'{direct}</a></p>')
    cta_href = lien_programme or link

    html = f"""\
<div style="font-family:Inter,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;background:#F7FAFC;padding:40px 24px;">
  <div style="background:#0B2E4F;border-radius:20px 20px 0 0;padding:28px 32px;">
    <span style="font-family:'Space Grotesk',sans-serif;color:#F7FAFC;font-size:20px;font-weight:700;letter-spacing:-0.02em;">FIRONOVA</span>
    <span style="color:#00B8D4;font-size:20px;font-weight:700;"> ·</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:36px 32px;border:1px solid #E2E8F0;border-top:none;">
    <h1 style="font-family:'Space Grotesk',sans-serif;color:#0B2E4F;font-size:24px;font-weight:700;margin:0 0 16px;">{heading}</h1>
    <p style="color:#0B2E4F;font-size:15px;line-height:1.6;margin:0 0 12px;">{salut}</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px;">{intro}</p>
    <p style="display:inline-block;background:#E1F2F5;border:1px solid #00B8D4;border-radius:8px;padding:10px 16px;margin:0 0 20px;color:#00697C;font-size:14px;font-weight:700;font-family:'JetBrains Mono',monospace;">{mise_en_avant}</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 28px;">{detail}</p>
    <a href="{cta_href}" style="display:inline-block;background:#00B8D4;color:#0B2E4F;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;">{cta} &rarr;</a>
    {secondaire}
    <p style="color:#334155;font-size:14px;line-height:1.6;margin:24px 0 0;">{apres}</p>
    <p style="color:#334155;font-size:14px;line-height:1.6;margin:16px 0 0;">{acces}</p>
    <p style="color:#64748B;font-size:12px;line-height:1.6;margin:20px 0 0;font-family:'JetBrains Mono',monospace;">{expiry}</p>
    <p style="color:#94A3B8;font-size:12px;line-height:1.6;margin:8px 0 0;">{ignore}</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px;">
    <p style="color:#94A3B8;font-size:11px;line-height:1.5;margin:0;">Produits destin&eacute;s &agrave; la recherche uniquement (RUO). R&eacute;serv&eacute; aux 19 ans et plus.<br>For Research Use Only. 19+ only.</p>
  </div>
</div>"""
    return subject, html


async def _affiliate_send_invite(email: str, name: str, link: str, lang: str,
                                 taux_convenu: float | None = None,
                                 lien_programme: str = "") -> None:
    # Les deux extras sont optionnels et absents par défaut : un appelant qui
    # ne les passe pas obtient l'ancien courriel, sans entente et menant droit
    # à l'activation. Rien de ce qui marchait ne cesse de marcher.
    subject, html = _affiliate_invite_html(name, link, lang, taux_convenu,
                                           lien_programme)
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
    # `max_age` OMIS quand AFFILIATE_COOKIE_DAYS vaut 0 : le temoin devient un
    # temoin de SESSION, efface a la fermeture du navigateur. Passer max_age=0
    # aurait fait l'inverse de ce qu'on veut — la plupart des navigateurs
    # traitent 0 comme « expire immediatement » et supprimeraient le temoin
    # aussitot pose, donc plus aucune attribution par lien du tout.
    parametres_temoin = {
        "httponly": True, "samesite": "lax", "secure": bool(s.IS_PRODUCTION), "path": "/",
    }
    if s.AFFILIATE_COOKIE_DAYS > 0:
        parametres_temoin["max_age"] = s.AFFILIATE_COOKIE_DAYS * 86400
    response.set_cookie(s.AFFILIATE_COOKIE_NAME, code, **parametres_temoin)
    click_doc = {
        "id": str(uuid.uuid4()),
        "affiliate_id": affiliate["id"],
        "code": code,
        # Plus d'empreinte d'IP sur le clic : elle n'était lue nulle part une
        # fois la détection d'auto-parrainage retirée, et la conserver ferait
        # mentir la politique de confidentialité.
        "user_agent": (request.headers.get("user-agent", "") or "")[:300],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=s.AFFILIATE_CLICK_TTL_DAYS)).isoformat(),
    }
    click_doc["page"] = (page or "")[:300]
    click_doc["referrer"] = (referrer or "")[:300]
    click_doc["device"] = (device or "")[:40]
    await s.db.affiliate_clicks.insert_one(click_doc)


async def affiliate_attach_to_order(order_doc: dict, request: Request) -> None:
    """Attache l'affilié à la commande. DEUX sources, et rien d'autre.

    1. Le cookie fn_ref, posé au clic sur un lien de parrainage.
    2. À défaut, le code de réduction saisi au paiement.

    Le code compte autant que le lien, et c'est nécessaire : un affilié partage
    naturellement son CODE — à l'oral, dans une conversation, sans rien de
    cliquable. Sans cette seconde source, le client obtenait son rabais et
    l'affilié ne touchait rien.

    IL N'Y A PAS DE TROISIÈME SOURCE. La commission récompense un ACTE
    d'apport, et cet acte doit être visible SUR LA COMMANDE.

    Deux notions à ne pas confondre, et la distinction est tout le sujet :

    — L'ATTRIBUTION décide de la commission. Elle exige un lien ou un code sur
      la commande. Rien d'autre n'y donne droit.

    — Le RATTACHEMENT n'est plus qu'un HISTORIQUE : il enregistre qui a amené
      qui, alimente la liste « clients apportés » du tableau de bord, et
      n'ouvre droit à RIEN. Il est écrit ci-dessous, jamais lu ici.

    Conséquences symétriques, et il faut assumer les deux : on ne gagne rien
    sur un client fidèle qui commande sans rien saisir, mais on ne perd jamais
    non plus un client au profit d'un rattachement posé par quelqu'un d'autre.

    Anti auto-parrainage : refuse si l'email de commande == email affilié.
    À appeler DANS checkout() juste avant db.orders.insert_one(order_doc)."""
    order_email = (order_doc.get("email") or "").lower().strip()

    source = "click"
    code = (request.cookies.get(s.AFFILIATE_COOKIE_NAME) or "").strip()
    if not code:
        # Le coupon appliqué porte le code de l'affilié — c'est ainsi que
        # _affiliate_ensure_coupon() le crée. checkout() le range sous
        # order_doc["coupon"], sous forme de dict {"code": …}.
        applied = order_doc.get("coupon") or {}
        code = str(applied.get("code") or "").strip() if isinstance(applied, dict) else ""
        source = "code"

    affiliate = None
    if code:
        # Match sur le code direct OU un alias actif. Les aliases sont créés
        # par l'admin (FITNES100 pour FITNES70, etc.) et doivent attribuer
        # à l'affilié titulaire du code parent — sinon une vente réalisée via
        # un alias ne rapporte rien alors même que le rabais est appliqué.
        code_up = code.upper()
        affiliate = await s.db.affiliates.find_one(
            {"$or": [
                {"code": code_up},
                {"aliases": {"$elemMatch": {"code": code_up, "active": True}}},
            ], "status": "active"},
            {"_id": 0}
        )

    # AUCUN REPLI SUR LE RATTACHEMENT. Sans lien ni code SUR CETTE COMMANDE,
    # il n'y a pas de commission — même si ce client a déjà été amené par cet
    # affilié, et même s'il figure dans sa liste de clients apportés.
    #
    # Le repli existait : il attribuait à l'affilié toutes les commandes
    # futures d'un client, indéfiniment, sans qu'il ait rien fait pour
    # celles-là. Un client apporté une fois rapportait à vie.
    #
    # La table affiliate_bindings continue d'être ALIMENTÉE plus bas — elle
    # enregistre qui a amené qui, ce qui a une valeur d'historique — mais elle
    # n'est plus JAMAIS LUE pour décider d'une commission. Écrire sans lire
    # est ici volontaire, et la différence est tout le sujet.
    if not affiliate:
        return

    # L'AUTO-PARRAINAGE N'EST PLUS BLOQUÉ. Deux gardes se trouvaient ici — même
    # courriel, même compte — et refusaient de rattacher la commande, donc
    # aucune commission. Décision commerciale de ne plus l'interdire : un
    # affilié commande avec son propre code comme n'importe quel client, et
    # cette commande lui rapporte comme les autres.
    #
    # Le rabais, lui, n'a jamais été bloqué : le coupon s'appliquait déjà. Seule
    # l'attribution l'était.
    order_doc["affiliate_id"] = affiliate["id"]
    order_doc["affiliate_code"] = affiliate["code"]
    order_doc["affiliate_source"] = source

    # Premier rattachement seulement : $setOnInsert n'écrase jamais un lien
    # existant, ce qui garantit qu'un client reste acquis à celui qui l'a
    # amené même si un autre affilié déclenche une vente entre-temps.
    # `source` ne vaut plus jamais "binding" : la condition d'origine
    # excluait le cas où l'attribution venait du rattachement lui-même,
    # ce qui ne peut plus se produire.
    if order_email:
        try:
            await s.db.affiliate_bindings.update_one(
                {"email": order_email},
                {"$setOnInsert": {
                    "email": order_email,
                    "affiliate_id": affiliate["id"],
                    "affiliate_code": affiliate["code"],
                    "source": source,
                    "bound_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
        except Exception as exc:  # pragma: no cover
            # Un rattachement raté ne doit jamais faire échouer une commande.
            logging.warning("[affiliate] rattachement non enregistré error_type=%s",
                            type(exc).__name__)

    # Le compte, quand il existe, est ajouté au rattachement SANS l'écraser.
    # Un client commande souvent en invité avant de se créer un compte : c'est
    # à ce moment-là que la seconde clé se pose, et elle survit ensuite à tout
    # changement d'adresse. On n'écrit user_id que s'il manque encore, pour ne
    # jamais réattribuer un rattachement existant à un autre affilié.
    _uid = str(order_doc.get("user_id") or "").strip()
    if _uid and order_email:
        try:
            await s.db.affiliate_bindings.update_one(
                {"email": order_email, "user_id": {"$exists": False}},
                {"$set": {"user_id": _uid}},
            )
        except Exception as exc:  # pragma: no cover
            logging.warning("[affiliate] compte non rattaché error_type=%s",
                            type(exc).__name__)
    # `affiliate_ip_hash` n'est plus posé sur la commande : son unique lecteur
    # était la détection d'auto-parrainage, supprimée.


# _affiliate_is_self_order() et _affiliate_norm_address() vivaient ici. Elles
# comparaient courriel, compte, empreinte d'IP et adresse de livraison pour
# écarter les commandes d'un affilié à lui-même. L'auto-parrainage n'étant plus
# interdit, elles n'avaient plus d'appelant.
#
# Leur disparition entraîne celle du rapprochement d'empreintes d'IP, qui
# n'existait que pour elles : le champ `ip_hash` de l'affilié, celui du clic et
# `affiliate_ip_hash` sur la commande ne sont plus écrits. Les conditions
# annonçaient ce rapprochement — elles sont mises à jour en conséquence.


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

    # Plus d'exclusion pour auto-parrainage : la commande d'un affilié passée
    # avec son propre code est traitée comme toute autre. Le bloc retiré ici
    # mettait le referral en statut « excluded » avec une commission nulle et
    # le motif « self_order » — c'est ce motif que le panneau de risque de
    # l'admin affichait.
    excluded_reason = None
    # Si le hold est nul, la commission est acquise immédiatement à la
    # confirmation de paiement (à condition qu'aucun remboursement ne soit
    # en cours). Sinon la maturation se fera via `_affiliate_approve_matured`
    # une fois le délai `AFFILIATE_APPROVAL_HOLD_DAYS` écoulé.
    refund_in_progress = (order.get("refund_status") or "") in _REMBOURSEMENT_EN_COURS
    auto_approve = (
        float(s.AFFILIATE_APPROVAL_HOLD_DAYS) <= 0
        and order.get("payment_status") == "paid"
        and not refund_in_progress
    )
    status = "approved" if auto_approve else "pending"
    # Taux au palier EFFECTIF courant de l'affilié
    metrics = await _affiliate_compute_metrics(affiliate_id)
    commission = round(base * metrics["commission_rate"], 2)

    # Auto-achat : commande passée par l'affilié avec son propre code/lien.
    # Décision commerciale assumée — le rabais ET la commission sont conservés.
    # On ne fait que FLAGGER pour le suivi admin ; ce n'est pas un signal de
    # risque (le panneau de risque l'ignore, à dessein).
    is_self = (
        (order.get("email") or "").strip().lower() == (affiliate.get("email") or "").strip().lower()
        or (
            bool(order.get("user_id")) and bool(affiliate.get("user_id"))
            and str(order.get("user_id")).strip() == str(affiliate.get("user_id")).strip()
        )
    )

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
        "order_total": round(float(order.get("total") or base), 2),
        "status": status,                       # pending|approved|paid<reversed|excluded
        "excluded_reason": excluded_reason,
        "created_at": now,
        "approved_at": now if status == "approved" else None,
        "paid_at": None,
        "payout_id": None,
        "self_order": is_self,
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

    # LES COMMISSIONS DÉJÀ VERSÉES aussi — elles étaient hors du filtre.
    #
    # Le statut `paid` n'était repris nulle part : vous remboursiez le client,
    # l'affilié gardait sa commission, et le referral continuait d'alimenter son
    # chiffre d'affaires de palier. Rien ne le signalait. Les conditions
    # promettent pourtant la reprise « sur le solde suivant ».
    #
    # Le versement, lui, est irréversible — la cryptomonnaie est partie. On
    # marque donc la commission reprise ET on inscrit la créance
    # (`clawback_amount`, `clawback_pending`), de sorte qu'elle sorte des
    # totaux et du calcul de palier tout en restant chiffrée et retrouvable.
    # Le recouvrement effectif reste un geste humain : aucun mécanisme de solde
    # négatif n'existe, et en inventer un ici irait bien au-delà d'une
    # correction.
    deja_verses = await s.db.affiliate_referrals.find(
        {"order_id": order_id, "status": "paid"},
        {"_id": 0, "id": 1, "affiliate_id": 1, "commission_amount": 1},
    ).to_list(50)
    for r in deja_verses:
        montant = float(r.get("commission_amount") or 0.0)
        await s.db.affiliate_referrals.update_one(
            {"id": r["id"]},
            {"$set": {"status": "reversed", "reversed_at": now,
                      "reversed_after_payout": True,
                      "clawback_amount": montant,
                      "clawback_pending": True}},
        )
        logging.warning(
            "[affiliate] commission DÉJÀ VERSÉE reprise — affilié=%s commande=%s "
            "montant=%.2f : récupération manuelle requise",
            r.get("affiliate_id"), order_id, montant,
        )

#                                    devienne 'approved' (fenêtre refund)


def _date_ou_rien(valeur):
    """Lit une date sans jamais lever : le pilote rend tantôt une chaîne ISO,
    tantôt un datetime, et un champ absent doit simplement valoir « inconnu »."""
    if isinstance(valeur, datetime):
        return valeur if valeur.tzinfo else valeur.replace(tzinfo=timezone.utc)
    if not valeur:
        return None
    try:
        d = datetime.fromisoformat(str(valeur).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


# Une demande de remboursement en cours SUSPEND l'acquisition. Tant que la
# décision n'est pas prise, l'argent peut encore repartir.
_REMBOURSEMENT_EN_COURS = ("requested", "approved")


def _echeance_acquisition(commande, referral_cree_le, jours):
    """Quand cette commission devient-elle acquise ? None = pas encore décidable.

    Un seul point de départ, la COMMANDE, et le même délai pour tous les modes
    de paiement. La date de livraison n'entre pas dans le calcul, même quand
    elle est connue : c'est le prix de la simplicité, et il est assumé — le
    cycle mensuel de versement absorbe largement l'écart.

    Isolée du parcours de la base pour être vérifiable : c'est la règle qui
    décide du versement d'argent, elle ne doit pas dépendre d'un accès Mongo
    pour être testée.

    Le GEL sur demande de remboursement est la protection principale, pas le
    délai. Le délai ne couvre que la réclamation pas encore déposée ; dès
    qu'une demande existe, la commission est bloquée jusqu'à la décision,
    aussi longtemps qu'il le faut.

    None couvre trois situations, toutes traitées pareil — on n'acquiert pas :
      · la commande n'est pas payée ;
      · une demande de remboursement est en cours, donc l'issue est inconnue ;
      · aucune date exploitable, donc aucune échéance calculable.
    """
    if not commande or commande.get("payment_status") != "paid":
        return None
    if (commande.get("refund_status") or "") in _REMBOURSEMENT_EN_COURS:
        return None

    cree_le = _date_ou_rien(referral_cree_le)
    if not cree_le:
        return None
    return cree_le + timedelta(days=float(jours))


async def _affiliate_approve_matured():
    """Passe pending→approved les commissions dont le délai est écoulé.

    Trois conditions, toutes nécessaires :

      1. la commande est payée — quel que soit le mode, Interac ou crypto ;
      2. aucune demande de remboursement n'est en cours — une demande gèle la
         commission jusqu'à la décision, quelle qu'en soit la durée ;
      3. le délai est écoulé, compté depuis la COMMANDE.

    La date de livraison n'intervient plus. Un ancrage sur la livraison serait
    plus précis, mais le cycle mensuel de versement rend l'écart négligeable
    en pratique, et un seul point de départ se vérifie d'un coup d'œil.
    """
    maintenant = datetime.now(timezone.utc)
    now_iso = maintenant.isoformat()

    # Aucune commission créée il y a moins que le délai ne peut être mûre :
    # la borne évite de relire toute la collection à chaque passage.
    cutoff = (maintenant -
              timedelta(days=float(s.AFFILIATE_APPROVAL_HOLD_DAYS))).isoformat()

    candidats = await s.db.affiliate_referrals.find(
        {"status": "pending", "created_at": {"$lte": cutoff}},
        {"_id": 0, "id": 1, "order_id": 1, "created_at": 1},
    ).to_list(None)
    if not candidats:
        return

    order_ids = list({r["order_id"] for r in candidats})
    commandes = {}
    curseur = s.db.orders.find(
        {"id": {"$in": order_ids}},
        {"_id": 0, "id": 1, "payment_status": 1, "refund_status": 1},
    )
    async for o in curseur:
        commandes[o["id"]] = o

    a_approuver = []
    for r in candidats:
        echeance = _echeance_acquisition(
            commandes.get(r["order_id"]), r.get("created_at"),
            s.AFFILIATE_APPROVAL_HOLD_DAYS,
        )
        if echeance is not None and maintenant >= echeance:
            a_approuver.append(r["id"])

    if a_approuver:
        await s.db.affiliate_referrals.update_many(
            {"id": {"$in": a_approuver}, "status": "pending"},
            {"$set": {"status": "approved", "approved_at": now_iso}},
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
        # L'envoi en lot ne porte pas d'entente aujourd'hui — elles se
        # négocient une par une. On lit quand même le champ : le jour où un
        # lot en transporterait une, l'absence de lecture ici enverrait
        # silencieusement le mauvais message.
        await s._affiliate_send_invite(
            job["email"], job.get("name", ""), job["link"], job.get("lang", "fr"),
            taux_convenu=job.get("taux_convenu"),
            lien_programme=job.get("programme_link", ""),
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
        unset_fields = {"lease_expires_at": ""}
        if terminal:
            # Echec definitif : le lien d'invitation (token brut) ne sera plus
            # jamais envoye tel quel. L'effacer evite qu'il reste en base,
            # reutilisable a tout moment ou fuyant (un expediteur de spam qui
            # tombe dessus n'attendrait que ca). Un re-envoi passe toujours par
            # un lien neuf.
            unset_fields["link"] = ""
            unset_fields["programme_link"] = ""
        await s.db.affiliate_email_jobs.update_one(
            {"id": job["id"], "status": "sending"},
            {"$set": {
                "status": "failed" if terminal else "retry",
                "available_at": (datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)).isoformat(),
                "error_type": type(exc).__name__,
            }, "$unset": unset_fields},
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
    # Rattachement durable d'un client à son affilié, clé sur le courriel :
    # c'est le seul identifiant présent sur TOUTES les commandes, invité
    # compris. Unique, car un client n'appartient qu'à un seul affilié.
    # Billets d'assistance. L'index sur (status, updated_at) sert la seule
    # requete qui compte cote admin : « qu'est-ce qui attend une reponse ».
    await s.db.affiliate_tickets.create_index("id", unique=True)
    await s.db.affiliate_tickets.create_index([("affiliate_id", 1), ("updated_at", -1)])
    await s.db.affiliate_tickets.create_index([("status", 1), ("updated_at", -1)])

    await s.db.affiliate_bindings.create_index("email", unique=True)
    await s.db.affiliate_bindings.create_index("affiliate_id")
    # Seconde clé : le compte. Partiel, car la majorité des rattachements
    # n'auront jamais de user_id — une commande invité n'en produit pas — et
    # un index unique ordinaire les ferait tous entrer en collision sur null.
    await s.db.affiliate_bindings.create_index(
        "user_id", unique=True,
        partialFilterExpression={"user_id": {"$type": "string"}},
    )
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
    # Anti-double-compte au niveau BASE : un même compte utilisateur ne doit
    # être lié qu'à UN affilié. La garde existe déjà dans affiliate_join (409),
    # mais relève d'une vérification applicative ; cet index rend la contrainte
    # structurelle. Partiel sur les chaînes pour ne pas faire collisionner les
    # null (les affiliés non liés à un compte). En cas de doublons hérités en
    # prod, la création échoue proprement : on LOG un avertissement au lieu de
    # planter le startup — l'admin déduplique puis relance, l'index prend alors.
    try:
        await s.db.affiliates.create_index(
            "user_id", unique=True,
            partialFilterExpression={"user_id": {"$type": "string"}},
            name="user_id_1_unique_partial",
        )
    except Exception as e:  # pragma: no cover
        logging.warning(
            "[affiliate] index unique user_id non créé (doublons existants ?) : %s",
            e,
        )
    await s.db.affiliate_referrals.create_index("order_id", unique=True)
    await s.db.affiliate_referrals.create_index("affiliate_id")
    await s.db.affiliate_referrals.create_index("status")
    # Index composés : servent les requêtes de calcul les plus chaudes
    # (metrics par affilié, liste du dashboard, pipeline de payout).
    await s.db.affiliate_referrals.create_index(
        [("affiliate_id", 1), ("status", 1)],
    )
    await s.db.affiliate_referrals.create_index(
        [("status", 1), ("payout_id", 1)],
    )
    await s.db.affiliate_clicks.create_index("affiliate_id")
    await s.db.affiliate_clicks.create_index("expires_at", expireAfterSeconds=0)
    await s.db.affiliate_clicks.create_index(
        [("affiliate_id", 1), ("created_at", -1)],
    )
    await s.db.affiliate_payouts.create_index("id", unique=True)
    await s.db.affiliate_payouts.create_index(
        [("affiliate_id", 1), ("period", 1)], unique=True,
    )
    await s.db.affiliate_payouts.create_index("affiliate_id")
    await s.db.affiliate_email_jobs.create_index("id", unique=True)
    await s.db.affiliate_email_jobs.create_index([("status", 1), ("available_at", 1), ("created_at", 1)])
    await s.db.affiliate_email_jobs.create_index("expires_at", expireAfterSeconds=0)
    # Runs de paiement (NP-…) : le tri de l'historique admin et l'unicité du
    # numéro. run_id vient d'un compteur atomique, donc unique est sûr ; on
    # défend quand même le démarrage en cas de doublons hérités.
    await s.db["affiliate_payment_runs"].create_index([("created_at", -1)])
    try:
        await s.db["affiliate_payment_runs"].create_index("run_id", unique=True)
    except Exception as e:  # pragma: no cover
        logging.warning("[affiliate] index unique run_id non créé : %s", e)

# ===========================================================================
# Item 3.2 — Seuil minimum de payout affilié (AFFILIATE_PAYOUT_MIN_CAD)
# ===========================================================================
async def _defer_affiliate_payout_below_threshold(
    aff: dict, period: str, amount_cad: float, referral_count: int,
    threshold_cad: float, motif: str = "seuil",
) -> bool:
    """Enregistre un report de payout et notifie l'affilié UNE seule fois par
    (affiliate_id, period). Idempotent via unique index.

    `motif` distingue les DEUX raisons de reporter, qui n'ont rien à voir :

      "seuil" — le solde est sous AFFILIATE_PAYOUT_MIN_CAD ;
      "prix"  — le prix du stablecoin est hors bande, le versement est suspendu
                par prudence, quel que soit le montant.

    Ce paramètre n'existait pas : le second cas empruntait le message du
    premier. Un affilié à qui l'on devait 340 $ recevait un courriel affirmant
    que 340,00 $ est inférieur à 25,00 $, et qu'il lui restait « 0,00 $ CAD à
    générer » — puisque `max(0, seuil - montant)` vaut zéro quand le montant
    dépasse le seuil. Incompréhensible, et la vraie raison n'apparaissait que
    dans les journaux du serveur.

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
        "motif": motif,
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
    if motif == "prix":
        subject_fr = f"FIRONOVA — Votre paiement d'affilié de {period} est reporté par précaution"
        subject_en = f"FIRONOVA — Your {period} affiliate payout is held as a precaution"
    else:
        subject_fr = f"FIRONOVA — Votre paiement d'affilié de {period} est reporté au prochain cycle"
        subject_en = f"FIRONOVA — Your {period} affiliate payout is deferred to next cycle"
    subject = subject_fr if lang == "fr" else subject_en

    amount_str = f"{amount_cad:.2f} $ CAD"
    threshold_str = f"{threshold_cad:.2f} $ CAD"
    remaining = max(0.0, threshold_cad - amount_cad)
    remaining_str = f"{remaining:.2f} $ CAD"

    hello_fr = f"Bonjour {first_name}," if first_name else "Bonjour,"
    hello_en = f"Hello {first_name}," if first_name else "Hello,"

    _prix_fr = f"""
      <p style="margin:0 0 16px">{hello_fr}</p>
      <p style="margin:0 0 16px">
        Vos commissions pour la période <strong>{period}</strong> s'élèvent à
        <strong>{amount_str}</strong>. Ce montant vous est entièrement dû.
      </p>
      <p style="margin:0 0 16px">
        Le versement est toutefois <strong>suspendu par précaution</strong> : le cours du
        stablecoin utilisé pour les paiements s'écarte trop de sa valeur de référence pour
        que nous puissions convertir votre solde de façon fiable. Envoyer la quantité
        habituelle vous livrerait moins que la somme due.
      </p>
      <p style="margin:0 0 16px">
        <strong>Votre solde reste intégralement à votre crédit</strong> et le versement partira
        dès que le cours sera revenu dans sa bande normale, sans démarche de votre part.
      </p>
      <p style="margin:24px 0 0;color:#666;font-size:12px">
        Cette mesure existe pour vous protéger : nous préférons reporter un paiement
        plutôt que de vous verser moins que ce que nous vous devons.
      </p>
    """
    _prix_en = f"""
      <p style="margin:0 0 16px">{hello_en}</p>
      <p style="margin:0 0 16px">
        Your commissions for period <strong>{period}</strong> total
        <strong>{amount_str}</strong>. That amount is owed to you in full.
      </p>
      <p style="margin:0 0 16px">
        The payout is nonetheless <strong>on hold as a precaution</strong>: the stablecoin used
        for payouts has drifted too far from its reference value for us to convert your
        balance reliably. Sending the usual quantity would deliver you less than you are owed.
      </p>
      <p style="margin:0 0 16px">
        <strong>Your balance stays fully to your credit</strong> and the payout will go out as
        soon as the price is back within its normal band, with nothing for you to do.
      </p>
      <p style="margin:24px 0 0;color:#666;font-size:12px">
        This exists to protect you: we would rather delay a payment than pay you less
        than we owe.
      </p>
    """

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
    # Le motif « prix » remplace les textes du seuil : le montant est dû en
    # entier, c'est la CONVERSION qui est suspendue. On ne parle donc ni de
    # seuil, ni de « ce qu'il reste à générer » — la phrase qui affichait
    # « 0,00 $ CAD » à un affilié créditeur de plusieurs centaines de dollars.
    if motif == "prix":
        body_fr, body_en = _prix_fr, _prix_en

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

            await _run_auto_payout_period(period, reuse_existing_run=False)

            # S6 — rattrapage des runs automatiques échoués. Un run qui a planté
            # laisse la période orpheline : le mois suivant a une période
            # différente, et rien ne rejouait le mois perdu (il ne se rattrapait
            # qu'à la main via force-run). On reprend ici tout run `auto` passé
            # en statut `failed`, sans limite d'ancienneté, pour ne pas laisser
            # de commissions approuvées jamais versées.
            #
            # Contrainte : `payout_runs` porte un index unique (period, auto) —
            # on NE crée donc pas de nouvelle ligne pour une période déjà
            # inscrite ; on réutilise la ligne `failed` existante (reuse_existing_run).
            try:
                failed = await s.db.payout_runs.find(
                    {"auto": True, "status": "failed"},
                    {"_id": 0, "period": 1},
                ).to_list(50)
                for run in failed:
                    rp = run.get("period")
                    if rp and rp != period:
                        await _run_auto_payout_period(rp, reuse_existing_run=True)
            except Exception as e:
                logging.error("[monthly-payouts] retry sweep error: %s", e)
        except Exception as e:
            logging.error("[monthly-payouts] scheduler loop error: %s", e)
            await asyncio.sleep(3600)


async def _run_auto_payout_period(period: str, reuse_existing_run: bool = False) -> None:
    """Exécute le run auto d'une période, en réutilisant le même code pour le
    chemin mensuel et pour le rattrapage des runs échoués (S6).

    - chemin mensuel (`reuse_existing_run=False`) : on réserve la période par
      un INSERT ; l'index unique (period, auto) fait échouer proprement
      l'insert si elle a déjà tourné → skip (anti-double).
    - chemin de rejeu (`reuse_existing_run=True`) : la ligne `failed` existe
      déjà (même index) ; on la remet à `running` et on la réutilise pour ne
      pas créer de doublon (period, auto).

    Les `update` ciblent la ligne de cette période spécifique (et non un id
    généré) pour rester alignés sur l'index unique : une seule ligne par
    période, dont le statut reflète la dernière tentative."""
    if reuse_existing_run:
        reset = await s.db.payout_runs.find_one_and_update(
            {"period": period, "auto": True},
            {"$set": {"status": "running",
                      "started_at": datetime.now(timezone.utc).isoformat(),
                      "error": None}},
            return_document=ReturnDocument.AFTER,
        )
        if not reset:
            logging.info("[monthly-payouts] period %s no failed run to retry, skip", period)
            return
    else:
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
            return

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


async def _affiliate_payout_amounts(payout_currency: str, amount_cad: float,
                                    fx_rate: float):
    """Calcule (amount_target, amount_usd, token_price, price_source, deferred).

    Source unique de vérité pour la quantité de jetons d'un versement, partagée
    par le scheduler mensuel (`_generate_payouts_for_period`) et le run admin
    manuel. La dette est libellée en CAD ; c'est donc la quantité de jetons qui
    s'ajuste au prix du stablecoin — calcul en UN SEUL arrondi depuis le montant
    CANADIEN (jamais depuis amount_usd déjà arrondi), à SIX décimales (précision
    native USDT/USDC sur Ethereum comme sur Tron).

    `deferred=True` indique un prix hors bande : il ne faut PAS verser
    maintenant — la quantité habituelle livrerait moins que la somme due, et
    l'ajuster sur un prix qu'on ne peut pas croire serait pire.
    """
    cur = (payout_currency or "usdt").lower()
    if cur not in s.AFFILIATE_PAYOUT_CURRENCIES:
        return amount_cad, None, 1.0, "n/a", False
    amount_usd = round(amount_cad * fx_rate, 2)
    token_price, price_source = await _fetch_stable_price(cur)
    if price_source == "out_of_band":
        return None, amount_usd, token_price, price_source, True
    amount_target = round(amount_cad * fx_rate / token_price, 6)
    return amount_target, amount_usd, token_price, price_source, False


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
        amount_target, amount_usd, token_price, price_source, deferred = \
            await _affiliate_payout_amounts(payout_currency, amount_cad, fx_rate)

        if deferred:
            # Le jeton a décroché, ou le prix reçu est aberrant. On ne verse
            # pas : envoyer la quantité habituelle livrerait moins que la
            # somme due, et l'ajuster sur un prix qu'on ne peut pas croire
            # serait pire. Le solde reste au crédit de l'affilié.
            logging.error(
                "[payouts] %s suspendu — prix %s hors bande (%.6f)",
                aff.get("code"), payout_currency.upper(), token_price,
            )
            # motif="prix" : le solde peut être très au-dessus du seuil. Sans
            # ce marqueur, l'affilié recevait le message « montant inférieur au
            # seuil minimum », arithmétiquement absurde dans ce cas.
            await _defer_affiliate_payout_below_threshold(
                aff, period, total, len(grp["ids"]), s.AFFILIATE_PAYOUT_MIN_CAD,
                motif="prix",
            )
            continue

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
                # Prix du jeton retenu et sa provenance, conservés pour l'audit :
                # sans eux, impossible de réexpliquer six mois plus tard
                # pourquoi ce versement portait 191 jetons et non 181.
                "token_price_usd": token_price,
                "token_price_source": price_source,
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
        # `payout_id: None` DANS LE FILTRE — il y manquait.
        #
        # L'agregation ci-dessus selectionne les commissions libres, mais
        # l'affectation ne verifiait pas qu'elles le soient ENCORE. Entre les
        # deux, un autre processus peut avoir revendique les memes : le
        # planificateur mensuel tourne sous verrou de worker, tandis que
        # admin_affiliate_run_payouts s'execute hors de ce verrou et sur une
        # periode par defaut differente. L'index unique porte sur
        # (affiliate_id, period) : il ne protege donc PAS deux runs de periodes
        # differentes. Les deux inserts passaient, les deux update_many
        # s'ecrasaient, et deux versements couvraient les memes commissions —
        # double paiement si les deux partaient.
        #
        # La branche de recuperation juste au-dessus filtrait deja correctement.
        revendiquees = await s.db.affiliate_referrals.update_many(
            {"id": {"$in": grp["ids"]}, "payout_id": None},
            {"$set": {"payout_id": payout_id}},
        )
        if revendiquees.modified_count != len(grp["ids"]):
            # On n'a pas obtenu tout ce que le montant du versement suppose.
            # Le laisser en « ready » le rendrait payable tel quel, pour une
            # somme qui ne correspond plus a ce qu'il couvre. « review » le
            # retire des deux chemins d'envoi (execute et lot exigent « ready »)
            # sans rien perdre : un humain tranche.
            await s.db.affiliate_payouts.update_one(
                {"id": payout_id},
                {"$set": {"status": "review",
                          "review_reason": "referrals_partiellement_revendiques",
                          "referral_count_revendique": revendiquees.modified_count}},
            )
            logging.error(
                "[payouts] %s periode=%s : %d commissions revendiquees sur %d "
                "attendues — versement mis en revue, NON envoye",
                aff.get("code"), period, revendiquees.modified_count, len(grp["ids"]),
            )
        count += 1
    return count
