"""NOWPayments service: crypto invoices, IPN verification and handling,
and mass payout batches (auth, create, verify, status)."""

import asyncio
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, Request
import httpx

# `s.<name>` reads the live binding on the server module: configuration, the
# Mongo handle, helpers that stayed behind, and the side-effecting calls that
# callers substitute there. See services/__init__.py.
import server as s


def _verify_nowpayments_signature(raw_body: bytes, signature: str) -> tuple[dict, bytes]:
    try:
        payload = json.loads(raw_body)
    except (TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(400, "Invalid payload")
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid payload")
    canonical_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    expected = hmac.new(
        s.NOWPAYMENTS_IPN_SECRET.encode(),
        canonical_body,
        hashlib.sha512,
    ).hexdigest()
    if not signature or not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Invalid signature")
    return payload, canonical_body

async def _nowpayments_create(order_id: str, total_cad: float, pay_currency: str):
    """Create a NOWPayments invoice (embeddable widget, exact amount). Falls back to mock if no API key."""
    if not s.NOWPAYMENTS_API_KEY:
        return {
            "mock": True,
            "payment_id": f"mock-{order_id[:8]}",
            "pay_address": "TEST_ADDRESS_CONFIGURE_NOWPAYMENTS_API_KEY",
            "pay_amount": round(total_cad / 60000, 8) if pay_currency == "btc" else round(total_cad / 3500, 6),
            "pay_currency": pay_currency,
            "order_id": order_id,
            "payment_status": "waiting",
        }
    body = {
        "price_amount": total_cad,
        "price_currency": "cad",
        "order_id": order_id,
        "order_description": f"FIRONOVA order {order_id}",
    }
    if s.PUBLIC_BASE_URL:
        body["ipn_callback_url"] = f"{s.PUBLIC_BASE_URL}/api/webhook/nowpayments"
        body["success_url"] = f"{s.PUBLIC_BASE_URL}/order/{order_id}"
        body["cancel_url"] = f"{s.PUBLIC_BASE_URL}/order/{order_id}"
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.post(
                f"{s.NOWPAYMENTS_BASE_URL}/invoice",
                headers={"x-api-key": s.NOWPAYMENTS_API_KEY, "Content-Type": "application/json"},
                json=body,
            )
            r.raise_for_status()
            inv = r.json()
            return {
                "invoice_id": inv.get("id"),
                "invoice_url": inv.get("invoice_url"),
                "order_id": order_id,
                "price_amount": total_cad,
                "price_currency": "cad",
                "payment_status": "waiting",
            }
    except Exception as e:
        logging.error("NOWPayments error: %s", e)
        raise HTTPException(502, "Crypto payment provider unavailable")

async def _queue_crypto_reconciliation_item(payload: dict, reason: str) -> bool:
    """Queue a NOWPayments signal for manual reconciliation."""
    raw_order_id = str(payload.get("order_id") or "").strip()
    payment_id = str(payload.get("payment_id") or "").strip()
    dedupe_key = f"np:{raw_order_id or 'none'}:{payment_id or 'none'}:{reason}"
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        amount_cad = float(payload.get("price_amount") or 0)
    except (TypeError, ValueError):
        amount_cad = None
    subject = f"NOWPayments {payload.get('payment_status') or ''}".strip()
    preview = json.dumps(payload, ensure_ascii=True)[:2000]
    item = {
        "id": str(uuid.uuid4()),
        "graph_message_id": dedupe_key,
        "provider": "crypto",
        "status": "pending",
        "reason": reason,
        "amount_cad": amount_cad,
        "currency": str(payload.get("price_currency") or "CAD").upper(),
        "from_email": "nowpayments-ipn",
        "subject": subject,
        "refs": [raw_order_id] if raw_order_id else [],
        "preview": preview,
        "received_at": now_iso,
        "detected_at": now_iso,
        "payment_id": payment_id,
        "raw_order_id": raw_order_id,
    }
    res = await s.db.interac_reconciliation_queue.update_one(
        {"graph_message_id": dedupe_key},
        {"$setOnInsert": item},
        upsert=True,
    )
    if res.upserted_id:
        asyncio.create_task(s._send_reconciliation_required_admin_alert(item))
        logging.warning("Crypto reconciliation queued (reason=%s, key=%s)", reason, dedupe_key)
    return True

async def nowpayments_ipn(request: Request):
    """NOWPayments IPN callback. HMAC-SHA512 signature verified against sorted JSON payload."""
    await s._rate_limit("webhook_nowpayments", s._client_ip(request), s.WEBHOOK_MAX_PER_MINUTE, 60,
                       "Too many webhook requests")
    if not s.NOWPAYMENTS_IPN_SECRET:
        raise HTTPException(503, "IPN not configured")
    raw = await request.body()
    sig = request.headers.get("x-nowpayments-sig", "")
    try:
        payload, canonical_body = _verify_nowpayments_signature(raw, sig)
    except HTTPException as exc:
        if exc.status_code == 401:
            logging.warning("NOWPayments IPN: invalid signature")
        raise
    if not await s._register_webhook_event("nowpayments", sig, canonical_body):
        return {"ok": True, "duplicate": True}
    order_id = payload.get("order_id")
    np_status = payload.get("payment_status", "")
    if not order_id:
        await _queue_crypto_reconciliation_item(payload, reason="missing_order_id")
        return {"ok": True}

    # Défense en profondeur au-delà du HMAC : on n'agit que sur une commande
    # qui existe, qui utilise bien ce moyen de paiement, et dont le montant
    # facturé correspond au nôtre. Un IPN "finished" avec un montant divergent
    # n'est JAMAIS auto-confirmé — il est journalisé pour revue manuelle.
    order = await s.db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("payment_method") != "nowpayments":
        logging.warning("NOWPayments IPN: commande inconnue/incohérente %s — ignorée", order_id)
        await _queue_crypto_reconciliation_item(payload, reason="unknown_or_mismatched_order")
        return {"ok": True}
    try:
        ipn_amount = float(payload.get("price_amount") or 0)
    except (TypeError, ValueError):
        ipn_amount = 0.0
    order_total = float(order.get("total", 0))
    if np_status == "finished" and abs(ipn_amount - order_total) > 0.01:
        logging.warning(
            "NOWPayments IPN: montant divergent commande %s (ipn %.2f vs commande %.2f) — NON marquée payée",
            order_id, ipn_amount, order_total,
        )
        await s.db.orders.update_one({"id": order_id}, {"$push": {"notes": {
            "id": str(uuid.uuid4()),
            "text": (f"IPN 'finished' reçu avec un montant divergent "
                     f"(${ipn_amount:.2f} vs ${order_total:.2f}) — paiement NON auto-confirmé, "
                     f"à vérifier manuellement."),
            "author": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }}})
        await _queue_crypto_reconciliation_item(payload, reason="amount_mismatch")
        return {"ok": True}

    if np_status == "finished" and order.get("payment_status") == "cancelled":
        await s._flag_late_cancelled_payment(order, "nowpayments ipn", str(payload.get("payment_id") or ""))

    updates = {"payment_info.provider_response.payment_status": np_status}
    if payload.get("payment_id"):
        updates["payment_info.provider_response.payment_id"] = str(payload["payment_id"])
    if payload.get("pay_currency"):
        updates["payment_info.provider_response.pay_currency"] = payload["pay_currency"]
    await s.db.orders.update_one({"id": order_id}, {"$set": updates})
    if np_status == "finished":
        fresh = await s._mark_order_paid(
            order_id,
            f"Crypto payment confirmed via NOWPayments IPN (payment_id {payload.get('payment_id')})",
        )
        if fresh:
            logging.info("Order %s marked paid via NOWPayments IPN", order_id)
    return {"ok": True}


async def crypto_status(order_id: str, request: Request):
    """Poll NOWPayments payment status. Marks order paid only when np status is 'finished'."""
    await s._rate_limit(
        "crypto_status", s._client_ip(request), 30, 60,
        "Too many payment status requests. Try again shortly.",
    )
    order = await s.db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("payment_method") != "nowpayments":
        raise HTTPException(404, "Order not found")
    user = await s._resolve_user(request)
    if order.get("user_id"):
        if not user or (user["id"] != order["user_id"] and user.get("role") != "admin"):
            raise HTTPException(403, "Forbidden")
    elif not s._guest_order_accessible(order, request):
        raise HTTPException(403, "Forbidden")
    if order.get("payment_status") == "paid":
        return {"order_id": order_id, "payment_status": "paid", "np_status": "finished"}
    np_info = (order.get("payment_info") or {}).get("provider_response") or {}
    payment_id = np_info.get("payment_id")
    if not payment_id or np_info.get("mock"):
        # Invoice/widget flow (paid state is pushed via IPN) or mock mode: return DB status
        return {
            "order_id": order_id,
            "payment_status": order.get("payment_status"),
            "np_status": np_info.get("payment_status", "waiting"),
            **({"mock": True} if np_info.get("mock") else {}),
        }
    if not s.NOWPAYMENTS_API_KEY:
        raise HTTPException(503, "Crypto provider not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                f"{s.NOWPAYMENTS_BASE_URL}/payment/{payment_id}",
                headers={"x-api-key": s.NOWPAYMENTS_API_KEY},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logging.error("NOWPayments status err: %s", e)
        raise HTTPException(502, "Crypto status unavailable")
    np_status = data.get("payment_status", "waiting")
    if np_status != np_info.get("payment_status"):
        await s.db.orders.update_one(
            {"id": order_id},
            {"$set": {"payment_info.provider_response.payment_status": np_status}},
        )
    if np_status == "finished":
        # Défense en profondeur, alignée sur nowpayments_ipn plus haut. Ce
        # chemin de polling marquait la commande payée sur le seul statut
        # "finished", sans jamais comparer le montant : un paiement partiel
        # refusé par le webhook passait ici. Même contrôle, même tolérance.
        try:
            poll_amount = float(data.get("price_amount") or 0)
        except (TypeError, ValueError):
            poll_amount = 0.0
        poll_order_total = float(order.get("total", 0))
        if abs(poll_amount - poll_order_total) > 0.01:
            logging.warning(
                "NOWPayments poll: montant divergent commande %s (poll %.2f vs commande %.2f) — NON marquée payée",
                order_id, poll_amount, poll_order_total,
            )
            await s.db.orders.update_one({"id": order_id}, {"$push": {"notes": {
                "id": str(uuid.uuid4()),
                "text": (f"Statut crypto 'finished' reçu par sondage avec un montant divergent "
                         f"(${poll_amount:.2f} vs ${poll_order_total:.2f}) — paiement NON auto-confirmé, "
                         f"à vérifier manuellement."),
                "author": "system",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }}})
            await _queue_crypto_reconciliation_item(
                {**data, "order_id": order_id}, reason="amount_mismatch_poll"
            )
            return {"order_id": order_id, "payment_status": order.get("payment_status"),
                    "np_status": np_status, "requires_review": True}
        if order.get("payment_status") == "cancelled":
            await s._flag_late_cancelled_payment(order, "nowpayments poll", str(payment_id or ""))
        fresh = await s._mark_order_paid(
            order_id,
            f"Crypto payment confirmed via NOWPayments status poll (payment_id {payment_id})",
        )
        if fresh:
            logging.info("Order %s marked paid via crypto_status poll", order_id)
        return {"order_id": order_id, "payment_status": "paid", "np_status": np_status}
    return {"order_id": order_id, "payment_status": order.get("payment_status"), "np_status": np_status}

# Cache JWT en mémoire — refresh auto avant expiration (~24h → refresh à 23h).
_NP_JWT_CACHE: dict = {"token": None, "fetched_at": 0.0}
_NP_JWT_TTL_S = 23 * 3600


async def _refresh_np_jwt(force: bool = False) -> str:
    """Retourne un JWT valide pour NOWPayments Mass Payouts.
    - Utilise le JWT env `NOWPAYMENTS_JWT` en priorité (rotation manuelle).
    - Sinon, tente d'obtenir un JWT via `/v1/auth` avec EMAIL + PASSWORD.
    - Cache 23h en mémoire, refresh auto avant expiration.
    - HTTPException 503 si impossible d'obtenir un JWT valide."""
    import time
    now_ts = time.time()

    # Priorité : JWT explicite en env (rotation manuelle)
    if s.NOWPAYMENTS_JWT and not force:
        return s.NOWPAYMENTS_JWT

    # Cache mémoire valide ?
    if (not force
            and _NP_JWT_CACHE["token"]
            and (now_ts - _NP_JWT_CACHE["fetched_at"]) < _NP_JWT_TTL_S):
        return _NP_JWT_CACHE["token"]

    if not (s.NOWPAYMENTS_EMAIL and s.NOWPAYMENTS_PASSWORD):
        raise HTTPException(
            503,
            "NOWPayments JWT non disponible : configurez NOWPAYMENTS_JWT OU "
            "NOWPAYMENTS_EMAIL + NOWPAYMENTS_PASSWORD dans /app/backend/.env",
        )

    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{s.NOWPAYMENTS_BASE_URL}/auth",
                json={"email": s.NOWPAYMENTS_EMAIL, "password": s.NOWPAYMENTS_PASSWORD},
                headers={"Content-Type": "application/json"},
            )
            r.raise_for_status()
            data = r.json()
            token = data.get("token")
            if not token:
                raise HTTPException(503, f"NOWPayments /auth returned no token: {data}")
            _NP_JWT_CACHE.update({"token": token, "fetched_at": now_ts})
            logging.info("[nowpayments] JWT refreshed (expires in ~24h)")
            return token
    except HTTPException:
        raise
    except Exception as e:
        logging.error("NOWPayments JWT refresh failed: %s", type(e).__name__)
        raise HTTPException(503, "NOWPayments authentication unavailable") from e

class NowPaymentsPayoutError(Exception):
    """Erreur explicite côté payout NOWPayments (message sûr pour l'admin)."""


async def _np_auth_token() -> str:
    """Obtient un JWT NOWPayments (valide ~5 min). Requis pour les payouts."""
    if not (s.NOWPAYMENTS_EMAIL and s.NOWPAYMENTS_PASSWORD):
        raise NowPaymentsPayoutError(
            "Identifiants NOWPayments manquants (NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD)."
        )
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.post(
                f"{s.NOWPAYMENTS_BASE_URL}/auth",
                json={"email": s.NOWPAYMENTS_EMAIL, "password": s.NOWPAYMENTS_PASSWORD},
                headers={"Content-Type": "application/json"},
            )
    except httpx.HTTPError as e:
        raise NowPaymentsPayoutError(f"Connexion NOWPayments échouée: {e}")
    if r.status_code != 200:
        raise NowPaymentsPayoutError(f"Auth NOWPayments refusée ({r.status_code}).")
    token = (r.json() or {}).get("token")
    if not token:
        raise NowPaymentsPayoutError("Auth NOWPayments: token absent de la réponse.")
    return token


async def _np_create_payout(withdrawals: list, description: str = "") -> dict:
    """Crée un payout (batch). Renvoie la réponse NOWPayments (contient l'id).
    Un code 2FA est envoyé par NOWPayments à l'email marchand."""
    if not s.NOWPAYMENTS_API_KEY:
        raise NowPaymentsPayoutError("NOWPAYMENTS_API_KEY manquante.")
    token = await s._np_auth_token()
    body = {"withdrawals": withdrawals}
    if description:
        body["payout_description"] = description
    if s.NOWPAYMENTS_IPN_SECRET:
        # callback pour maj auto des statuts (facultatif mais recommandé)
        base = (globals().get("PUBLIC_BASE_URL") or "").rstrip("/")
        if base:
            body["ipn_callback_url"] = f"{base}/api/webhook/nowpayments-payout"
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.post(
                f"{s.NOWPAYMENTS_BASE_URL}/payout",
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "x-api-key": s.NOWPAYMENTS_API_KEY,
                    "Content-Type": "application/json",
                },
            )
    except httpx.HTTPError as e:
        raise NowPaymentsPayoutError(f"Création du payout échouée: {e}")
    if r.status_code not in (200, 201):
        detail = ""
        try:
            detail = (r.json() or {}).get("message", "")
        except Exception:
            detail = r.text[:200]
        raise NowPaymentsPayoutError(f"Payout refusé ({r.status_code}): {detail}")
    return r.json() or {}


async def _np_verify_payout(batch_id: str, verification_code: str) -> dict:
    """Valide un payout avec le code 2FA reçu par email."""
    if not s.NOWPAYMENTS_API_KEY:
        raise NowPaymentsPayoutError("NOWPAYMENTS_API_KEY manquante.")
    token = await s._np_auth_token()
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.post(
                f"{s.NOWPAYMENTS_BASE_URL}/payout/{batch_id}/verify",
                json={"verification_code": verification_code.strip()},
                headers={
                    "Authorization": f"Bearer {token}",
                    "x-api-key": s.NOWPAYMENTS_API_KEY,
                    "Content-Type": "application/json",
                },
            )
    except httpx.HTTPError as e:
        raise NowPaymentsPayoutError(f"Vérification 2FA échouée: {e}")
    if r.status_code != 200:
        detail = ""
        try:
            detail = (r.json() or {}).get("message", "")
        except Exception:
            detail = r.text[:200]
        raise NowPaymentsPayoutError(f"Code 2FA refusé ({r.status_code}): {detail}")
    return r.json() or {}


async def _np_payout_status(batch_id: str) -> dict:
    """Récupère le statut d'un payout (batch)."""
    if not s.NOWPAYMENTS_API_KEY:
        raise NowPaymentsPayoutError("NOWPAYMENTS_API_KEY manquante.")
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.get(
                f"{s.NOWPAYMENTS_BASE_URL}/payout/{batch_id}",
                headers={"x-api-key": s.NOWPAYMENTS_API_KEY},
            )
    except httpx.HTTPError as e:
        raise NowPaymentsPayoutError(f"Statut payout indisponible: {e}")
    if r.status_code != 200:
        raise NowPaymentsPayoutError(f"Statut payout ({r.status_code}).")
    return r.json() or {}

async def nowpayments_payout_ipn(request: Request):
    """IPN payout : NOWPayments notifie les changements de statut.
    Signature HMAC-SHA512 vérifiée (même schéma que l'IPN paiement)."""
    await s._rate_limit("webhook_nowpayments_payout", s._client_ip(request), s.WEBHOOK_MAX_PER_MINUTE, 60, "Too many webhook requests")
    if not s.NOWPAYMENTS_IPN_SECRET:
        raise HTTPException(503, "IPN not configured")
    raw = await request.body()
    sig = request.headers.get("x-nowpayments-sig", "")
    try:
        payload, canonical_body = _verify_nowpayments_signature(raw, sig)
    except HTTPException as exc:
        if exc.status_code == 401:
            logging.warning("NOWPayments payout IPN: signature invalide")
        raise
    if not await s._register_webhook_event("nowpayments_payout", sig, canonical_body):
        return {"ok": True, "duplicate": True}

    batch_id = str(payload.get("id") or payload.get("batch_withdrawal_id") or "")
    np_status = str(payload.get("status", "")).lower()
    if not batch_id:
        return {"ok": True}
    payout = await s.db.affiliate_payouts.find_one({"np_batch_id": batch_id}, {"_id": 0})
    if not payout:
        return {"ok": True}
    now = datetime.now(timezone.utc).isoformat()
    if np_status in ("finished", "sent", "completed"):
        await s.db.affiliate_payouts.update_one({"id": payout["id"]},
            {"$set": {"status": "paid", "np_status": np_status, "paid_at": now, "reference": batch_id}})
        await s.db.affiliate_referrals.update_many(
            {"payout_id": payout["id"], "status": {"$in": ["pending", "approved"]}},
            {"$set": {"status": "paid", "paid_at": now}},
        )
    elif np_status in ("failed", "rejected"):
        await s.db.affiliate_payouts.update_one({"id": payout["id"]},
            {"$set": {"status": "failed", "np_status": np_status, "updated_at": now}})
    else:
        await s.db.affiliate_payouts.update_one({"id": payout["id"]},
            {"$set": {"np_status": np_status, "updated_at": now}})
    return {"ok": True}
