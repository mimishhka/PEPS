"""Interac e-Transfer autodeposit service: Microsoft Graph mailbox polling,
reference/amount extraction, and auto-confirmation of matching orders."""

import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

# `s.<name>` reads the live binding on the server module: configuration, the
# Mongo handle, helpers that stayed behind, and the side-effecting calls that
# callers substitute there. See services/__init__.py.
import server as s


async def _queue_interac_reconciliation_item(msg: dict, text: str, reason: str = "missing_reference") -> bool:
    """Queue an Interac deposit email for manual reconciliation.

    Returns True when the email should be considered handled (new or existing
    queue record), so caller can mark it read.
    """
    message_id = (msg.get("id") or "").strip()
    if not message_id:
        return False
    now_iso = datetime.now(timezone.utc).isoformat()
    from_addr = ((msg.get("from") or {}).get("emailAddress") or {}).get("address") or ""
    subject = msg.get("subject") or ""
    received_at = msg.get("receivedDateTime") or now_iso
    amounts = _parse_amounts(text)
    amount_cad = amounts[0] if amounts else None
    refs = _extract_interac_refs(text)
    preview = re.sub(r"\s+", " ", (text or "").strip())[:2000]

    item = {
        "id": str(uuid.uuid4()),
        "graph_message_id": message_id,
        "provider": "interac",
        "status": "pending",
        "reason": reason,
        "amount_cad": amount_cad,
        "currency": "CAD",
        "from_email": from_addr,
        "subject": subject,
        "refs": refs,
        "preview": preview,
        "received_at": received_at,
        "detected_at": now_iso,
    }

    res = await s.db.interac_reconciliation_queue.update_one(
        {"graph_message_id": message_id},
        {"$setOnInsert": item},
        upsert=True,
    )
    if res.upserted_id:
        asyncio.create_task(s._send_reconciliation_required_admin_alert(item))
        logging.warning("Interac reconciliation queued for message %s (reason=%s)", message_id, reason)
    return True

async def _graph_access_token() -> Optional[str]:
    """Jeton OAuth2 app-only (client credentials) pour Microsoft Graph."""
    if s.INTERAC_AUTOCONFIRM_MODE == "off":
        return None
    if not (s.INTERAC_GRAPH_TENANT_ID and s.INTERAC_GRAPH_CLIENT_ID and s.INTERAC_GRAPH_CLIENT_SECRET):
        return None
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            s._GRAPH_TOKEN_URL.format(tenant=s.INTERAC_GRAPH_TENANT_ID),
            data={
                "grant_type": "client_credentials",
                "client_id": s.INTERAC_GRAPH_CLIENT_ID,
                "client_secret": s.INTERAC_GRAPH_CLIENT_SECRET,
                "scope": "https://graph.microsoft.com/.default",
            },
        )
        r.raise_for_status()
        data = r.json()
    return data.get("access_token")


async def _graph_unread_messages(token: str) -> list:
    """Messages non lus de la boîte Interac (Graph app-only)."""
    async with httpx.AsyncClient(timeout=30) as cx:
        r = await cx.get(
            f"{s._GRAPH_API_URL}/users/{s.INTERAC_GRAPH_USER}/mailFolders/inbox/messages",
            params={
                "$filter": "isRead eq false",
                "$top": 50,
                "$select": "id,subject,from,body,receivedDateTime,internetMessageHeaders",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        data = r.json()
    return data.get("value") or []


async def _graph_mark_read(token: str, message_id: str) -> None:
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.patch(
            f"{s._GRAPH_API_URL}/users/{s.INTERAC_GRAPH_USER}/messages/{message_id}",
            json={"isRead": True},
            headers={"Authorization": f"Bearer {token}"},
        )


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "")


def _extract_interac_refs(text: str) -> list:
    """Références de commande 'FN-XXXXXX-XXXXXX' trouvées dans un texte (dédupliquées)."""
    return sorted({r.upper() for r in re.findall(r"FN-\d{6}-[0-9A-F]{6,8}", text.upper())})


def _parse_amounts(text: str) -> list:
    """Montants '$12.34' / '12.34 CAD' trouvés dans un texte."""
    amounts = []
    for m in re.finditer(r"\$\s?(\d[\d.,]*)|(\d[\d.,]*)\s*CAD", text, re.IGNORECASE):
        raw = m.group(1) or m.group(2)
        raw = raw.replace(",", "")
        try:
            amounts.append(round(float(raw), 2))
        except ValueError:
            continue
    return amounts


def _is_full_payment_match(amounts: list, order_total: float) -> bool:
    """True seulement si un montant détecté correspond exactement au total."""
    expected = round(float(order_total or 0), 2)
    return any(abs(float(a) - expected) <= 0.01 for a in (amounts or []))


def _interac_message_authenticated(message: dict) -> bool:
    headers = {
        str(item.get("name") or "").strip().lower(): str(item.get("value") or "").lower()
        for item in (message.get("internetMessageHeaders") or [])
    }
    auth_results = " ".join(
        value for name, value in headers.items()
        if name in {"authentication-results", "arc-authentication-results"}
    )
    return all(f"{mechanism}=pass" in auth_results for mechanism in ("spf", "dkim", "dmarc"))


async def _process_interac_deposit_emails() -> int:
    if not s.INTERAC_TRUSTED_SENDER:
        logging.error("Interac auto-confirm disabled: INTERAC_TRUSTED_SENDER is not configured")
        return 0
    token = await s._graph_access_token()
    if not token:
        return 0
    try:
        messages = await s._graph_unread_messages(token)
    except Exception as ex:
        logging.error("Interac Graph: lecture de la boîte échouée: %s", ex)
        return 0

    processed = 0
    for msg in messages:
        from_addr = ((msg.get("from") or {}).get("emailAddress") or {}).get("address") or ""
        if from_addr.strip().lower() != s.INTERAC_TRUSTED_SENDER:
            continue  # pas une notification Interac — on laisse en non-lu
        if not _interac_message_authenticated(msg):
            logging.warning("Interac notification rejected: email authentication did not pass")
            continue
        subject = msg.get("subject") or ""
        body = msg.get("body") or {}
        text = f"{subject}\n{_strip_html(body.get('content') or '')}"
        refs = _extract_interac_refs(text)
        acted = False
        if not refs:
            # Missing FN reference in Interac email: queue for manual matching.
            acted = await _queue_interac_reconciliation_item(msg, text, reason="missing_reference")
        for ref in refs:
            order = await s.db.orders.find_one(
                {"order_number": ref, "payment_status": "awaiting_etransfer"}, {"_id": 0}
            )
            if not order:
                # GAP 3 — Détection paiement tardif : la commande peut avoir été
                # auto-annulée avant l'arrivée du dépôt. On journalise l'incident
                # sur la commande pour que l'admin puisse la réouvrir manuellement.
                late = await s.db.orders.find_one(
                    {"order_number": ref, "payment_status": "cancelled"},
                    {"_id": 0, "id": 1, "order_number": 1, "email": 1, "payment_status": 1, "late_payment_flagged": 1},
                )
                if late and not late.get("late_payment_flagged"):
                    flagged = await s._flag_late_cancelled_payment(late, "interac email", ref)
                    if flagged:
                        acted = True
                        break
                continue
            amounts = _parse_amounts(text)
            order_total = float(order.get("total", 0))
            if not amounts or not _is_full_payment_match(amounts, order_total):
                await s.db.orders.update_one({"id": order["id"]}, {"$push": {"notes": {
                    "id": str(uuid.uuid4()),
                    "text": (f"Notification de dépôt Interac reçue (réf {ref}) avec un montant "
                             f"divergent — paiement NON auto-confirmé, à vérifier manuellement."),
                    "author": "system",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }}})
                # Montant divergent : MIS EN FILE pour réconciliation (et non
                # seulement noté) — sinon le dépôt resterait invisible hors de la
                # note de cette seule commande, et l'email serait marqué lu à tort.
                acted = await _queue_interac_reconciliation_item(msg, text, reason="amount_mismatch")
                logging.warning("Interac deposit: montant divergent pour %s — revue manuelle", ref)
                break
            fresh = await s._mark_order_paid(
                order["id"],
                f"Virement Interac confirmé (dépôt auto) — notification de dépôt reçue pour {ref}.",
            )
            if fresh:
                logging.info("Order %s marked paid via Interac Autodeposit notification", ref)
            acted = True
            break
        if acted:
            try:
                await s._graph_mark_read(token, msg["id"])
            except Exception:
                pass
            processed += 1
    return processed

async def _interac_deposit_watchdog() -> None:
    """Toutes les INTERAC_GRAPH_POLL_SECONDS : confirme les commandes Interac
    dont le dépôt (Autodeposit) est notifié par email."""
    while True:
        try:
            await _process_interac_deposit_emails()
        except Exception as ex:  # pragma: no cover
            logging.error("interac deposit watchdog failed: %s", ex)
        await asyncio.sleep(s.INTERAC_GRAPH_POLL_SECONDS)
