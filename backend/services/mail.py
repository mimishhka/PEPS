"""Transactional email service: Resend transport, durable outbox worker,
janitor, and the bilingual template catalogue/rendering engine."""

import asyncio
import html
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from pymongo import ReturnDocument
import resend

# `s.<name>` reads the live binding on the server module: configuration, the
# Mongo handle, helpers that stayed behind, and the side-effecting calls that
# callers substitute there. See services/__init__.py.
import server as s


# ---------------------------------------------------------------------------
# Email helpers (Resend)
# ---------------------------------------------------------------------------
def _items_html(items: list) -> str:
    rows = []
    for it in items:
        rows.append(
            f'<tr><td style="padding:8px 0;border-bottom:1px solid #eee">'
            f'<strong>{it["qty"]}× {it["name_en"]}</strong>'
            f'<div style="font-family:monospace;font-size:11px;color:#888">{it["slug"]}</div>'
            f'</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:bold">'
            f'${it["line_total"]:.2f}</td></tr>'
        )
    return "".join(rows)


def _order_email_html(order: dict, body_intro: str) -> str:
    interac = order["payment_info"].get("instructions") if order["payment_method"] == "interac" else None
    np_info = order["payment_info"].get("provider_response") if order["payment_method"] == "nowpayments" else None

    payment_block = ""
    if interac:
        payment_block = f"""
        <div style="background:#FDF3F2;border:2px solid #C20114;padding:20px;margin:24px 0">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#C20114;font-weight:bold;margin-bottom:12px">⚡ INTERAC E-TRANSFER INSTRUCTIONS</div>
          <table style="width:100%;font-family:monospace;font-size:13px">
            <tr><td style="padding:6px 0;color:#666">Send to:</td><td style="padding:6px 0;font-weight:bold">{interac["send_to"]}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Amount:</td><td style="padding:6px 0;font-weight:bold">${interac["amount_cad"]:.2f} CAD</td></tr>
            <tr><td style="padding:6px 0;color:#666">Reference (required):</td><td style="padding:6px 0;font-weight:bold;color:#C20114">{interac["reference"]}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Security question:</td><td style="padding:6px 0">{interac["security_question"]}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Security answer:</td><td style="padding:6px 0;font-weight:bold">{interac["security_answer_hint"]}</td></tr>
          </table>
        </div>"""
    elif np_info:
        mock_warning = ""
        if np_info.get("mock"):

            mock_warning = '<div style="background:#fffbe6;border:1px solid #FFCC00;padding:10px;margin-bottom:12px;font-size:12px">⚠ DEMO MODE — Configure NOWPAYMENTS_API_KEY for live crypto payments.</div>'
        if np_info.get("invoice_url"):
            payment_block = f"""
        <div style="background:#f5f5f5;border:2px solid #050505;padding:20px;margin:24px 0">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;font-weight:bold;margin-bottom:12px">₿ CRYPTO PAYMENT</div>
          <p style="font-size:13px;margin:0 0 16px">Pay the exact order amount securely via NOWPayments — your order is confirmed automatically once payment is received.</p>
          <a href="{np_info["invoice_url"]}" style="display:inline-block;background:#050505;color:#fff;font-family:monospace;font-size:12px;letter-spacing:2px;padding:12px 24px;text-decoration:none">PAY NOW →</a>
        </div>"""
        else:
            payment_block = f"""
        <div style="background:#f5f5f5;border:2px solid #050505;padding:20px;margin:24px 0">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;font-weight:bold;margin-bottom:12px">₿ CRYPTO PAYMENT INSTRUCTIONS</div>
          {mock_warning}
          <table style="width:100%;font-family:monospace;font-size:13px">
            <tr><td style="padding:6px 0;color:#666">Deposit address:</td><td style="padding:6px 0;font-weight:bold;word-break:break-all">{np_info.get("pay_address","")}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Send exactly:</td><td style="padding:6px 0;font-weight:bold">{np_info.get("pay_amount","")} {str(np_info.get("pay_currency","")).upper()}</td></tr>
          </table>
        </div>"""

    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:'Helvetica Neue',Arial,sans-serif;color:#050505">
  <table style="width:100%;max-width:640px;margin:0 auto;background:#fff;border:1px solid #050505">
    <tr><td style="background:#050505;color:#fff;padding:20px 28px;font-family:monospace;font-size:11px;letter-spacing:3px">// FIRONOVA · ORDER {order["order_number"]}</td></tr>
    <tr><td style="padding:32px 28px">
      <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;letter-spacing:-0.02em;text-transform:uppercase">{body_intro}</h1>
      <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6">Order <strong>{order["order_number"]}</strong> · {len(order["items"])} item(s) · ${order["total"]:.2f} CAD</p>
      {payment_block}
      <table style="width:100%;margin-top:24px;font-size:14px">
        {_items_html(order["items"])}
        <tr><td style="padding:10px 0;color:#666;font-size:12px">Subtotal</td><td style="padding:10px 0;text-align:right">${order["subtotal"]:.2f}</td></tr>
        <tr><td style="padding:4px 0;color:#666;font-size:12px">Shipping</td><td style="padding:4px 0;text-align:right">${order["shipping"]:.2f}</td></tr>
        <tr><td style="padding:14px 0;border-top:2px solid #050505;font-weight:bold;font-size:18px">TOTAL CAD</td><td style="padding:14px 0;border-top:2px solid #050505;text-align:right;font-weight:bold;font-size:18px">${order["total"]:.2f}</td></tr>
      </table>
      <p style="margin:32px 0 0;font-family:monospace;font-size:10px;letter-spacing:2px;color:#999;text-transform:uppercase">For Research Use Only · Not For Human Or Veterinary Consumption</p>
    </td></tr>
    <tr><td style="background:#050505;color:#fff;padding:14px 28px;font-family:monospace;font-size:10px;letter-spacing:2px">FIRONOVA · CANADA · {datetime.now(timezone.utc).strftime("%Y")}</td></tr>
  </table>
</body></html>"""


async def _send_email(to: str | list, subject: str, html: str, from_email: str | None = None) -> None:
    """Persist an email for delivery by the outbox worker."""
    def sanitize_header(value: Any) -> str:
        return re.sub(r"[\r\n]+", " ", str(value or "")).strip()

    to_list = [sanitize_header(value) for value in (to if isinstance(to, list) else [to])]
    safe_subject = sanitize_header(subject)
    safe_from = sanitize_header(from_email or s.SENDER_EMAIL)
    recipient_refs = [s._private_ref(address) for address in to_list]
    if not s.RESEND_API_KEY:
        logging.info("[email] skipped recipients=%s reason=not-configured", recipient_refs)
        return
    try:
        now = datetime.now(timezone.utc)
        await s.db.email_outbox.insert_one({
            "id": str(uuid.uuid4()),
            "status": "pending",
            "from": safe_from,
            "to": to_list,
            "subject": safe_subject,
            "html": html,
            "attempts": 0,
            "available_at": now.isoformat(),
            "created_at": now.isoformat(),
            "expires_at": now + timedelta(days=30),
        })
        logging.info("[email] queued recipients=%s", recipient_refs)
    except Exception as e:
        logging.error("[email] queue failed recipients=%s error_type=%s", recipient_refs, type(e).__name__)


async def _process_email_outbox_job() -> bool:
    if not s.RESEND_API_KEY:
        return False
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    job = await s.db.email_outbox.find_one_and_update(
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
        params = {
            "from": job["from"], "to": job["to"],
            "subject": job["subject"], "html": job["html"],
        }
        result = await asyncio.to_thread(resend.Emails.send, params)
        await s.db.email_outbox.update_one(
            {"id": job["id"], "status": "sending"},
            {"$set": {
                "status": "sent",
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "provider_id": result.get("id") if isinstance(result, dict) else str(result),
            }, "$unset": {"html": "", "lease_expires_at": ""}},
        )
    except Exception as exc:
        attempts = int(job.get("attempts", 1))
        terminal = attempts >= 5
        delay_seconds = min(3600, 30 * (2 ** max(0, attempts - 1)))
        await s.db.email_outbox.update_one(
            {"id": job["id"], "status": "sending"},
            {"$set": {
                "status": "failed" if terminal else "retry",
                "available_at": (datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)).isoformat(),
                "error_type": type(exc).__name__,
            }, "$unset": {"lease_expires_at": ""}},
        )
        logging.error(
            "[email] delivery failed job=%s attempt=%d terminal=%s error_type=%s",
            job["id"], attempts, terminal, type(exc).__name__,
        )
    return True


async def _email_outbox_worker():
    while True:
        try:
            processed = await _process_email_outbox_job()
        except Exception as exc:  # pragma: no cover
            logging.error("[email] outbox worker error_type=%s", type(exc).__name__)
            processed = False
        await asyncio.sleep(0 if processed else 2)


# ---------------------------------------------------------------------------
# Email outbox janitor — safety net (cron 5 min)
# Reprend automatiquement :
#  1. Les jobs "sending" bloqués (lease expiré > 5 min sans reprise par le worker)
#  2. Les jobs "failed" définitifs de plus de 1h (2ᵉ chance après une panne Resend)
# Idempotent + capé (max 100 requeues par tick pour éviter les storms).
# ---------------------------------------------------------------------------
EMAIL_JANITOR_INTERVAL_S = int(os.environ.get("EMAIL_JANITOR_INTERVAL_S", "300"))     # 5 min
EMAIL_FAILED_RETRY_AFTER_S = int(os.environ.get("EMAIL_FAILED_RETRY_AFTER_S", "3600"))  # 1h
EMAIL_JANITOR_MAX_PER_TICK = int(os.environ.get("EMAIL_JANITOR_MAX_PER_TICK", "100"))


async def _email_outbox_janitor_tick() -> dict:
    """Un cycle de nettoyage. Retourne un compteur pour observabilité."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    stuck_cutoff = now_iso                                         # lease déjà expiré
    failed_cutoff = (now - timedelta(seconds=EMAIL_FAILED_RETRY_AFTER_S)).isoformat()

    # 1) Récupère les jobs "sending" abandonnés (lease expiré) → retry immédiat
    stuck = await s.db.email_outbox.update_many(
        {"status": "sending", "lease_expires_at": {"$lte": stuck_cutoff}},
        {"$set": {"status": "retry", "available_at": now_iso},
         "$unset": {"lease_expires_at": ""}},
    )
    # 2) Les jobs "failed" (5 tentatives épuisées) de plus de EMAIL_FAILED_RETRY_AFTER_S
    #    sont ramenés en "retry" avec attempts=0 (2ᵉ chance après panne prolongée).
    #    Cap sur EMAIL_JANITOR_MAX_PER_TICK pour éviter de saturer le worker.
    cursor = s.db.email_outbox.find(
        {"status": "failed", "created_at": {"$lte": failed_cutoff}},
        {"_id": 0, "id": 1},
    ).sort("created_at", 1).limit(EMAIL_JANITOR_MAX_PER_TICK)
    ids = [doc["id"] async for doc in cursor]
    if ids:
        await s.db.email_outbox.update_many(
            {"id": {"$in": ids}, "status": "failed"},
            {"$set": {"status": "retry", "attempts": 0, "available_at": now_iso,
                      "requeued_at": now_iso, "requeued_by": "janitor"}},
        )
    return {"stuck_requeued": stuck.modified_count, "failed_requeued": len(ids)}


async def _email_outbox_janitor():
    while True:
        try:
            report = await _email_outbox_janitor_tick()
            if report["stuck_requeued"] or report["failed_requeued"]:
                logging.info("[email] janitor stuck=%d failed=%d",
                             report["stuck_requeued"], report["failed_requeued"])
        except Exception as e:
            logging.error("[email] janitor tick error_type=%s", type(e).__name__)
        await asyncio.sleep(EMAIL_JANITOR_INTERVAL_S)


# ---------------------------------------------------------------------------
# Admin email outbox panel — inspection et contrôle unitaire de la file.
# Le worker ne prend que pending/retry/sending et le janitor ne cible que
# sending (lease expiré) et failed : un job "cancelled" est donc inerte pour
# les deux, sans garde supplémentaire.
# ---------------------------------------------------------------------------

def _redact_email(email: str) -> str:
    """Masque un destinataire pour la vue liste (le détail reste en clair)."""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    tld = domain.rsplit(".", 1)[-1] if "." in domain else "***"
    return f"{local[:1]}***@{domain[:1]}***.{tld}"


def _redact_recipients(value):
    if isinstance(value, list):
        return [_redact_email(x) for x in value]
    if isinstance(value, str):
        return _redact_email(value)
    return value


async def admin_email_list(status: Optional[str] = None, q: Optional[str] = None,
                           page: int = 0, limit: int = 50) -> dict:
    """Page de la file email. Le corps HTML est exclu (lourd) et les
    destinataires sont masqués : la vue liste n'a pas besoin des adresses."""
    page = max(0, int(page or 0))
    limit = max(1, min(int(limit or 50), 200))

    filt: dict = {}
    if status:
        statuses = [part.strip() for part in status.split(",") if part.strip()]
        if statuses:
            filt["status"] = {"$in": statuses}
    if q:
        needle = re.escape(q)
        filt["$or"] = [
            {"subject": {"$regex": needle, "$options": "i"}},
            {"to": {"$regex": needle, "$options": "i"}},
        ]

    total = await s.db.email_outbox.count_documents(filt)
    cursor = (
        s.db.email_outbox.find(filt, {"_id": 0, "html": 0})
        .sort("created_at", -1).skip(page * limit).limit(limit)
    )
    items = await cursor.to_list(limit)
    for doc in items:
        doc["to"] = _redact_recipients(doc.get("to"))
    return {"items": items, "total": total, "page": page, "limit": limit,
            "has_more": (page + 1) * limit < total}


async def admin_email_get(email_id: str) -> dict:
    """Détail d'un job, HTML rendu et destinataire en clair (vue ciblée)."""
    doc = await s.db.email_outbox.find_one({"id": email_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Email not found")
    return doc


async def admin_email_retry_single(email_id: str) -> dict:
    """Remet un job unique en file, compteur de tentatives remis à zéro."""
    now_iso = datetime.now(timezone.utc).isoformat()
    res = await s.db.email_outbox.update_one(
        {"id": email_id},
        {"$set": {"status": "retry", "attempts": 0, "available_at": now_iso,
                  "requeued_at": now_iso, "requeued_by": "admin_single"},
         "$unset": {"lease_expires_at": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Email not found")
    return {"ok": True}


async def admin_email_cancel(email_id: str) -> dict:
    """Abandon manuel : le job sort des files worker et janitor."""
    res = await s.db.email_outbox.update_one(
        {"id": email_id},
        {"$set": {"status": "cancelled",
                  "cancelled_at": datetime.now(timezone.utc).isoformat(),
                  "cancelled_by": "admin"}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Email not found")
    return {"ok": True}


async def send_order_confirmation(order: dict) -> None:
    if not order.get("email"):
        logging.info("[email] skip customer confirm: no email on order %s", order["order_number"])
    else:
        lang, to, ctx = _order_ctx(order)
        key = "order_confirmation_crypto" if order.get("payment_method") == "nowpayments" else "order_confirmation_interac"
        await s.send_template_email(key, to, lang, ctx, order)

    # Admin notification
    admin_html = _order_email_html(order, "New order received")
    await s._send_email(
        s.ADMIN_NOTIFICATION_EMAIL,
        f"[FIRONOVA ADMIN] New order {order['order_number']} — ${order['total']:.2f} CAD",
        admin_html,
    )


async def send_payment_received(order: dict) -> None:
    if not order.get("email"):
        logging.info("[email] skip payment-received: no email on order %s", order["order_number"])
        return
    lang, to, ctx = _order_ctx(order)
    await s.send_template_email("payment_received", to, lang, ctx, order)


def _simple_order_email_html(order: dict, heading: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:'Helvetica Neue',Arial,sans-serif;color:#050505">
  <table style="width:100%;max-width:640px;margin:0 auto;background:#fff;border:1px solid #050505">
    <tr><td style="background:#050505;color:#fff;padding:20px 28px">
      <div style="font-family:monospace;font-size:12px;letter-spacing:3px">FIRONOVA.</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;margin-top:6px">{heading}</div>
    </td></tr>
    <tr><td style="padding:28px">
      <div style="font-family:monospace;font-size:12px;letter-spacing:2px;color:#666">ORDER {order.get('order_number','')}</div>
      <div style="font-size:14px;line-height:1.7;margin-top:14px">{body_html}</div>
    </td></tr>
    <tr><td style="background:#f5f5f5;padding:16px 28px;font-family:monospace;font-size:10px;letter-spacing:1px;color:#888">
      FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY
    </td></tr>
  </table>
</body></html>"""


def _prelaunch_email_html(heading: str, body_html: str) -> str:
    """Même gabarit que _simple_order_email_html, mais sans numéro de commande
    (un abonné pré-lancement n'en a pas)."""
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:'Helvetica Neue',Arial,sans-serif;color:#050505">
  <table style="width:100%;max-width:640px;margin:0 auto;background:#fff;border:1px solid #050505">
    <tr><td style="background:#050505;color:#fff;padding:20px 28px">
      <div style="font-family:monospace;font-size:12px;letter-spacing:3px">FIRONOVA.</div>
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;margin-top:6px">{heading}</div>
    </td></tr>
    <tr><td style="padding:28px"><div style="font-size:14px;line-height:1.7">{body_html}</div></td></tr>
    <tr><td style="background:#f5f5f5;padding:16px 28px;font-family:monospace;font-size:10px;letter-spacing:1px;color:#888">
      FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY
    </td></tr>
  </table>
</body></html>"""


async def send_prelaunch_welcome(email: str, lang: str = "en", unsubscribe_token: str = "") -> None:
    """CTA → création de compte, pour verrouiller les 15 % au lancement."""
    base = s.PUBLIC_BASE_URL or ""
    register_url = f"{base}/register?ref=launch"
    unsub = f"{base}/api/newsletter/unsubscribe?token={unsubscribe_token}" if unsubscribe_token else ""
    if lang == "fr":
        heading = "Bienvenue sur la liste de lancement"
        body = (
            f"<p>Merci de vous être inscrit à la liste de prélancement FIRONOVA.</p>"
            f"<p>Créez votre compte dès maintenant pour verrouiller <strong>15 % de rabais</strong> "
            f"sur votre première commande au lancement, avec le code "
            f"<strong style='font-family:monospace'>{s.LAUNCH_COUPON_CODE}</strong>.</p>"
            f"<p style='margin-top:20px'><a href='{register_url}' style='display:inline-block;"
            f"background:#C20114;color:#fff;font-family:monospace;font-size:12px;letter-spacing:2px;"
            f"padding:14px 28px;text-decoration:none'>CRÉER MON COMPTE →</a></p>"
        )
        subject = "FIRONOVA — 15 % vous attendent au lancement"
        unsub_txt = "Se désabonner"
    else:
        heading = "Welcome to the launch list"
        body = (
            f"<p>Thanks for joining the FIRONOVA pre-launch list.</p>"
            f"<p>Create your account now to lock in <strong>15% off</strong> your first order "
            f"at launch, with code <strong style='font-family:monospace'>{s.LAUNCH_COUPON_CODE}</strong>.</p>"
            f"<p style='margin-top:20px'><a href='{register_url}' style='display:inline-block;"
            f"background:#C20114;color:#fff;font-family:monospace;font-size:12px;letter-spacing:2px;"
            f"padding:14px 28px;text-decoration:none'>CREATE MY ACCOUNT →</a></p>"
        )
        subject = "FIRONOVA — 15% off waiting at launch"
        unsub_txt = "Unsubscribe"
    if unsub:
        # Lien de désabonnement obligatoire dans chaque envoi commercial (LCAP).
        body += (f"<p style='margin-top:28px;font-size:11px;color:#888'>"
                 f"<a href='{unsub}' style='color:#888'>{unsub_txt}</a></p>")
    await s._send_email(email, subject, _prelaunch_email_html(heading, body))


async def send_shipping_notification(order: dict) -> None:
    """Courriel de suivi bilingue. Aucune mention du contenu (emballage discret)."""
    if not order.get("email"):
        return
    info = order.get("shipping_info") or {}
    pin = info.get("tracking_number", "")
    carrier = info.get("carrier", "Canada Post")
    track_url = f"https://www.canadapost-postescanada.ca/track-reperage/en#/details/{pin}"
    body = (
        f"Your order has shipped via {carrier}. / Votre commande a été expédiée via {carrier}."
        f"<div style='border-left:3px solid #050505;padding:10px 14px;margin-top:12px;background:#fafafa'>"
        f"<div style='font-family:monospace;font-size:12px;letter-spacing:1px;color:#666'>"
        f"TRACKING / SUIVI</div>"
        f"<div style='font-family:monospace;font-size:15px;font-weight:bold;margin-top:4px'>{pin}</div>"
        f"</div>"
        f"<p style='margin-top:16px'><a href='{track_url}' "
        f"style='display:inline-block;background:#050505;color:#fff;font-family:monospace;font-size:12px;"
        f"letter-spacing:2px;padding:12px 24px;text-decoration:none'>TRACK PARCEL / SUIVRE →</a></p>"
    )
    lang, to, ctx = _order_ctx(order)
    ctx["tracking_number"] = pin or ctx.get("tracking_number", "")
    order = {**order, "tracking_number": ctx["tracking_number"]}
    await s.send_template_email("shipping", to, lang, ctx, order)


async def send_customer_note_email(order: dict, note_text: str) -> None:
    if not order.get("email"):
        return
    body = (
        f"A note has been added to your order / Une note a été ajoutée à votre commande :"
        f"<div style='border-left:3px solid #050505;padding:10px 14px;margin-top:12px;background:#fafafa'>{note_text}</div>"
    )
    html = _simple_order_email_html(order, "Note about your order / Note sur votre commande", body)
    await s._send_email(order["email"], f"FIRONOVA — Note about order {order['order_number']}", html)


async def send_refund_email(order: dict, amount: float, total_refunded: float) -> None:
    if not order.get("email"):
        return
    full = total_refunded >= float(order.get("total", 0))
    kind = "Full refund / Remboursement total" if full else "Partial refund / Remboursement partiel"
    body = (
        f"{kind}<br/>"
        f"Refunded amount / Montant remboursé : <b>${amount:.2f} CAD</b><br/>"
        f"Total refunded to date / Total remboursé à ce jour : <b>${total_refunded:.2f} CAD</b> "
        f"(order total / total de la commande : ${float(order.get('total',0)):.2f} CAD)"
    )
    lang, to, ctx = _order_ctx({**order, "_refund_amount": amount})
    ctx["amount"] = f"{amount:.2f} $"
    await s.send_template_email("refund", to, lang, ctx, {**order, "_refund_amount": amount})

# ===== FIRONOVA_EMAILS_NOVA_START =====
def _email_shell(order=None, lang="en"):
    lang = (lang or "en").lower()
    if not order:
        return {"subject": "Order update", "body": "Thank you for your order."}

    if lang == "fr":
        return {
            "subject": "Confirmation de commande",
            "body": "Bonjour, votre commande est confirmée. Merci pour votre confiance.",
            "follow_up": "Vous recevrez un email de suivi dès l'expédition.",
        }
    return {
        "subject": "Order confirmation",
        "body": "Hello, your order is confirmed. Thank you for your trust.",
        "follow_up": "You will receive a shipping update as soon as your order is on the way.",
    }
# ===== FIRONOVA_EMAILS_NOVA_END =====



# ===== FIRONOVA_EMAIL_AUTOMATION_START =====
ABANDON_MIN_HOURS = float(os.environ.get("ABANDON_MIN_HOURS", "4"))
ABANDON_MAX_HOURS = float(os.environ.get("ABANDON_MAX_HOURS", "72"))
ABANDON_COUPON_CODE = os.environ.get("ABANDON_COUPON_CODE", "").strip()
ABANDON_SWEEP_MINUTES = float(os.environ.get("ABANDON_SWEEP_MINUTES", "30"))
_AUTOMATION_BASE = os.environ.get("PUBLIC_BASE_URL", "https://fironova.com").rstrip("/")

# Statuts considérés « non payés » = panier/checkout abandonné
_UNPAID_STATUSES = ["pending", "awaiting_etransfer", "awaiting_crypto"]


def _nova_email_shell(heading_fr: str, heading_en: str, body_html: str,
                      cta_url: str = "", cta_label_fr: str = "", cta_label_en: str = "") -> str:
    """Gabarit email identité NOVA (Nordfjord Blue + Nova Cyan), bilingue."""
    cta = ""
    if cta_url and cta_label_fr:
        cta = f"""
      <div style="margin:28px 0 8px">
        <a href="{cta_url}" style="display:inline-block;background:#00B8D4;color:#0B2E4F;
           font-weight:700;text-decoration:none;padding:14px 32px;border-radius:999px;
           font-size:15px">{cta_label_fr} &nbsp;/&nbsp; {cta_label_en}</a>
      </div>"""
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F7FAFC;font-family:'Helvetica Neue',Arial,sans-serif;color:#0B2E4F">
  <table style="width:100%;max-width:600px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0B2E4F;padding:24px 32px">
      <div style="font-family:'Space Grotesk',Arial,sans-serif;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px">
        FIRONOVA<span style="color:#00B8D4"> ·</span>
      </div>
    </td></tr>
    <tr><td style="padding:32px">
      <div style="font-size:22px;font-weight:800;color:#0B2E4F;letter-spacing:-0.4px;margin-bottom:4px">{heading_fr}</div>
      <div style="font-size:15px;font-style:italic;color:#3E5C76;margin-bottom:20px">{heading_en}</div>
      <div style="font-size:14px;line-height:1.7;color:#1A2A38">{body_html}</div>
      {cta}
    </td></tr>
    <tr><td style="background:#F7FAFC;padding:16px 32px;font-family:monospace;font-size:10px;letter-spacing:1px;color:#94A3B8;border-top:1px solid #E2E8F0">
      PRODUITS DESTINÉS À LA RECHERCHE UNIQUEMENT (RUO) · 18+ · Ne pas consommer.<br>
      FOR RESEARCH USE ONLY (RUO) · 18+ · Not for human consumption.
    </td></tr>
  </table>
</body></html>"""


def _abandoned_items_html(order: dict) -> str:
    rows = ""
    for it in order.get("items", [])[:6]:
        name = it.get("name_en") or it.get("name_fr") or it.get("slug", "")
        qty = it.get("qty", 1)
        rows += (f'<tr><td style="padding:6px 0;color:#1A2A38">{name}</td>'
                 f'<td style="padding:6px 0;text-align:right;color:#3E5C76">× {qty}</td></tr>')
    return f'<table style="width:100%;border-collapse:collapse;margin:8px 0 4px">{rows}</table>'


async def send_abandoned_cart_reminder(order: dict) -> None:
    """Envoie UN rappel de panier abandonné (bilingue, NOVA)."""
    email = order.get("email")
    if not email:
        return
    items_html = _abandoned_items_html(order)
    coupon_html = ""
    if ABANDON_COUPON_CODE:
        coupon_html = (
            f'<div style="margin:16px 0;padding:14px 18px;background:#E6FBFF;border:1px dashed #00B8D4;border-radius:8px">'
            f'<div style="font-size:13px;color:#3E5C76">Utilisez le code / Use code</div>'
            f'<div style="font-size:20px;font-weight:800;color:#0B2E4F;letter-spacing:1px">{ABANDON_COUPON_CODE}</div>'
            f'</div>'
        )
    body = (
        "<p>Votre sélection vous attend toujours. Vos articles sont réservés ci-dessous — "
        "reprenez là où vous vous êtes arrêté·e.</p>"
        "<p style='color:#3E5C76;font-style:italic'>Your selection is still waiting. Your items are saved below — "
        "pick up right where you left off.</p>"
        f"{items_html}{coupon_html}"
    )
    cta_url = f"{_AUTOMATION_BASE}/checkout"
    html = _nova_email_shell(
        "Votre panier vous attend", "Your cart is waiting",
        body, cta_url, "Finaliser ma commande", "Complete my order",
    )
    await s.send_template_email("abandoned_cart", email, "fr", {"customer_name": "", "cart_url": (s.PUBLIC_BASE_URL or "").rstrip("/") + "/cart"})  # noqa: F821


async def welcome_new_user(email: str, name: str = "", lang: str = "fr") -> None:
    """Email de bienvenue à l'inscription (via le centre de gestion des courriels)."""
    if not email:
        return
    await s.send_template_email("welcome", email, lang, {"customer_name": name or ("là" if str(lang).startswith("fr") else "there")})


async def _abandoned_cart_watchdog() -> None:
    """Balaye périodiquement les commandes non payées et relance une seule fois."""
    await asyncio.sleep(60)  # laisse le démarrage se stabiliser
    while True:
        try:
            now = datetime.now(timezone.utc)
            cutoff_recent = (now - timedelta(hours=ABANDON_MIN_HOURS)).isoformat()
            cutoff_old = (now - timedelta(hours=ABANDON_MAX_HOURS)).isoformat()
            query = {
                "payment_status": {"$in": _UNPAID_STATUSES},
                "email": {"$nin": [None, ""]},
                "created_at": {"$lte": cutoff_recent, "$gte": cutoff_old},
                "abandoned_reminder_sent": {"$ne": True},
            }
            cursor = s.db.orders.find(query, {"_id": 0})  # noqa: F821
            async for order in cursor:
                # Marque AVANT l'envoi (idempotence : jamais deux rappels)
                res = await s.db.orders.update_one(  # noqa: F821
                    {"id": order["id"], "abandoned_reminder_sent": {"$ne": True}},
                    {"$set": {"abandoned_reminder_sent": True,
                              "abandoned_reminder_at": now.isoformat()}},
                )
                if res.modified_count == 1:
                    try:
                        await s.send_abandoned_cart_reminder(order)
                        logging.info("[abandoned-cart] rappel envoyé pour %s", order.get("order_number"))
                    except Exception as e:
                        logging.error("[abandoned-cart] échec envoi %s: %s", order.get("id"), e)
        except Exception as e:
            logging.error("[abandoned-cart] watchdog error: %s", e)
        await asyncio.sleep(ABANDON_SWEEP_MINUTES * 60)

# ===== FIRONOVA_SEO_ADMIN_BLOCK_END =====


# ===========================================================================
# ===== FIRONOVA_EMAIL_TEMPLATES_START =====
# Centre de gestion des courriels — 11 types + création de types custom.
# Chaque template : sujet / heading / intro / body / (bloc dynamique) / cta,
# bilingue FR/EN. Rendu via _nova_email_shell. Merge défauts <- surcharges DB.
# Le champ "block" injecte un bloc contextuel (Interac, crypto, items, suivi).
# ===========================================================================

# Blocs dynamiques disponibles (rendus au moment de l'envoi selon la commande).
EMAIL_BLOCKS = ("none", "interac", "crypto", "items", "tracking", "refund_detail")

EMAIL_TEMPLATE_CATALOG = {
    "order_confirmation_interac": {
        "label": "Commande reçue — Interac / Order received — Interac",
        "variables": ["{{order_number}}", "{{customer_name}}", "{{total}}"],
        "block": "interac",
        "default": {
            "subject_fr": "FIRONOVA — Votre commande {{order_number}} est réservée",
            "subject_en": "FIRONOVA — Your order {{order_number}} is reserved",
            "heading_fr": "Merci, {{customer_name}} — votre commande est réservée",
            "heading_en": "Thank you, {{customer_name}} — your order is reserved",
            "intro_fr": "Nous avons bien reçu votre commande <strong>{{order_number}}</strong> et nous la gardons précieusement de côté pour vous. Il ne reste qu'une étape : régler votre virement Interac. Dès sa réception, nous préparons votre colis avec le plus grand soin.",
            "intro_en": "We've received your order <strong>{{order_number}}</strong> and we're keeping it safe for you. Just one step remains: sending your Interac e-transfer. As soon as it arrives, we'll prepare your parcel with the greatest care.",
            "body_fr": "Vous trouverez ci-dessous toutes les informations nécessaires à votre virement. <strong>Un détail essentiel :</strong> pensez à inscrire votre numéro de commande <strong>{{order_number}}</strong> dans la note du virement — c'est ce qui nous permet de vous associer votre paiement rapidement.",
            "body_en": "Below you'll find everything you need to complete your transfer. <strong>One essential detail:</strong> please include your order number <strong>{{order_number}}</strong> in the transfer message — that's how we match your payment to your order quickly.",
            "outro_fr": "Votre commande reste réservée pendant 12 heures. Une question, un doute ? Répondez simplement à ce courriel, une vraie personne vous lira.",
            "outro_en": "Your order stays reserved for 12 hours. Any question or hesitation? Just reply to this email — a real person will read it.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "order_confirmation_crypto": {
        "label": "Commande reçue — Crypto / Order received — Crypto",
        "variables": ["{{order_number}}", "{{customer_name}}", "{{total}}"],
        "block": "crypto",
        "default": {
            "subject_fr": "FIRONOVA — Votre commande {{order_number}} est réservée",
            "subject_en": "FIRONOVA — Your order {{order_number}} is reserved",
            "heading_fr": "Merci, {{customer_name}} — votre commande est réservée",
            "heading_en": "Thank you, {{customer_name}} — your order is reserved",
            "intro_fr": "Nous avons bien reçu votre commande <strong>{{order_number}}</strong> et nous la mettons de côté pour vous. La dernière étape consiste à régler votre paiement en cryptomonnaie à l'aide des instructions ci-dessous.",
            "intro_en": "We've received your order <strong>{{order_number}}</strong> and we're setting it aside for you. The final step is to complete your crypto payment using the instructions below.",
            "body_fr": "Le montant et l'adresse de paiement sont générés spécifiquement pour votre commande. Une fois la transaction confirmée sur la blockchain, votre paiement nous parvient automatiquement — aucune action supplémentaire de votre part.",
            "body_en": "The amount and payment address are generated specifically for your order. Once the transaction is confirmed on the blockchain, your payment reaches us automatically — nothing more for you to do.",
            "outro_fr": "Une question sur le processus ? Répondez à ce courriel, nous sommes là pour vous accompagner.",
            "outro_en": "Any question about the process? Reply to this email — we're here to help.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "payment_reminder": {
        "label": "Rappel de paiement (6h) / Payment reminder (6h)",
        "variables": ["{{order_number}}", "{{customer_name}}", "{{total}}"],
        "block": "interac",
        "default": {
            "subject_fr": "FIRONOVA — Petit rappel pour votre commande {{order_number}}",
            "subject_en": "FIRONOVA — A gentle reminder for order {{order_number}}",
            "heading_fr": "Votre commande vous attend, {{customer_name}}",
            "heading_en": "Your order is waiting, {{customer_name}}",
            "intro_fr": "Un petit mot amical pour vous rappeler que votre commande <strong>{{order_number}}</strong> est toujours réservée. Nous n'avons pas encore reçu votre virement, et nous voulions nous assurer que tout allait bien de votre côté.",
            "intro_en": "Just a friendly note to let you know your order <strong>{{order_number}}</strong> is still reserved. We haven't received your transfer yet, and we wanted to make sure everything's alright on your end.",
            "body_fr": "Il vous reste encore un peu de temps pour finaliser votre virement Interac à l'aide des informations ci-dessous. Passé le délai de 12 heures, la commande sera libérée automatiquement — mais rien n'est perdu, vous pourrez toujours la repasser.",
            "body_en": "There's still a little time to complete your Interac e-transfer using the details below. After the 12-hour window, the order will be released automatically — but nothing is lost, you can always place it again.",
            "outro_fr": "Un empêchement, une hésitation ? Écrivez-nous, nous trouverons une solution ensemble.",
            "outro_en": "Ran into something, or hesitating? Write to us — we'll find a solution together.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "order_expired": {
        "label": "Commande expirée / Order expired",
        "variables": ["{{order_number}}", "{{customer_name}}"],
        "block": "none",
        "default": {
            "subject_fr": "FIRONOVA — Votre commande {{order_number}} a été libérée",
            "subject_en": "FIRONOVA — Your order {{order_number}} has been released",
            "heading_fr": "Pas de souci, {{customer_name}}",
            "heading_en": "No worries, {{customer_name}}",
            "intro_fr": "Comme nous n'avons pas reçu de paiement dans le délai imparti, votre commande <strong>{{order_number}}</strong> a été libérée. C'est parfaitement normal et cela n'entraîne aucun frais.",
            "intro_en": "Since we didn't receive a payment within the allotted time, your order <strong>{{order_number}}</strong> has been released. This is completely normal and carries no charge.",
            "body_fr": "Vos produits vous intéressent toujours ? Ils vous attendent dans notre catalogue, et repasser commande ne prend qu'un instant. Si un problème technique vous a empêché de finaliser, dites-le-nous — nous serons ravis de vous aider.",
            "body_en": "Still interested in your products? They're waiting for you in our catalog, and placing a new order takes just a moment. If a technical issue got in the way, let us know — we'd be glad to help.",
            "outro_fr": "Au plaisir de vous compter bientôt parmi nos chercheurs.",
            "outro_en": "We hope to count you among our researchers again soon.",
            "cta_url": "{{catalog_url}}", "cta_label_fr": "Retourner au catalogue", "cta_label_en": "Back to the catalog",
        },
    },
    "payment_received": {
        "label": "Paiement confirmé / Payment confirmed",
        "variables": ["{{order_number}}", "{{customer_name}}", "{{total}}"],
        "block": "items",
        "default": {
            "subject_fr": "FIRONOVA — Paiement reçu, merci {{customer_name}} !",
            "subject_en": "FIRONOVA — Payment received, thank you {{customer_name}}!",
            "heading_fr": "C'est confirmé — merci pour votre confiance",
            "heading_en": "It's confirmed — thank you for your trust",
            "intro_fr": "Excellente nouvelle : nous avons bien reçu votre paiement pour la commande <strong>{{order_number}}</strong>. Votre confiance nous touche, et nous mettons désormais tout en œuvre pour préparer votre colis.",
            "intro_en": "Great news: we've received your payment for order <strong>{{order_number}}</strong>. Your trust means a lot to us, and we're now putting everything in motion to prepare your parcel.",
            "body_fr": "Voici un récapitulatif de votre commande. Nos équipes procèdent à la préparation avec la rigueur que mérite le matériel de recherche : vérification, emballage discret et soigné. Vous recevrez un nouveau courriel dès l'expédition, avec votre numéro de suivi.",
            "body_en": "Here's a summary of your order. Our team prepares it with the rigor research material deserves: verification, discreet and careful packaging. You'll receive another email as soon as it ships, with your tracking number.",
            "outro_fr": "Merci encore de faire confiance à Fironova. Nous avons hâte que vous receviez votre commande.",
            "outro_en": "Thank you again for trusting Fironova. We can't wait for you to receive your order.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "order_processing": {
        "label": "En préparation / Being prepared",
        "variables": ["{{order_number}}", "{{customer_name}}"],
        "block": "none",
        "default": {
            "subject_fr": "FIRONOVA — Votre commande {{order_number}} est en préparation",
            "subject_en": "FIRONOVA — Your order {{order_number}} is being prepared",
            "heading_fr": "On s'active pour vous, {{customer_name}}",
            "heading_en": "We're on it, {{customer_name}}",
            "intro_fr": "Votre commande <strong>{{order_number}}</strong> vient d'entrer en préparation dans notre atelier. Chaque produit est vérifié et emballé avec soin avant de prendre la route vers vous.",
            "intro_en": "Your order <strong>{{order_number}}</strong> has just entered preparation in our workshop. Each product is checked and packed with care before making its way to you.",
            "body_fr": "Nous accordons une attention particulière à la discrétion et à l'intégrité de chaque envoi. Dès que votre colis quitte nos mains, vous recevrez votre numéro de suivi pour le suivre jusqu'à votre porte.",
            "body_en": "We pay special attention to the discretion and integrity of every shipment. As soon as your parcel leaves our hands, you'll receive your tracking number to follow it all the way to your door.",
            "outro_fr": "Merci pour votre patience — la qualité mérite qu'on prenne le temps de bien faire.",
            "outro_en": "Thank you for your patience — quality is worth taking the time to do right.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "shipping": {
        "label": "Commande expédiée / Order shipped",
        "variables": ["{{order_number}}", "{{customer_name}}", "{{tracking_number}}"],
        "block": "tracking",
        "default": {
            "subject_fr": "FIRONOVA — Votre commande {{order_number}} est en route !",
            "subject_en": "FIRONOVA — Your order {{order_number}} is on its way!",
            "heading_fr": "En route vers vous, {{customer_name}}",
            "heading_en": "On its way to you, {{customer_name}}",
            "intro_fr": "Ça y est : votre commande <strong>{{order_number}}</strong> a quitté notre atelier et voyage désormais vers vous. Nous sommes ravis de vous savoir bientôt équipé pour vos recherches.",
            "intro_en": "Here we go: your order <strong>{{order_number}}</strong> has left our workshop and is now traveling to you. We're delighted to know you'll soon be equipped for your research.",
            "body_fr": "Vous pouvez suivre l'acheminement de votre colis à tout moment grâce au numéro de suivi ci-dessous. Les délais de livraison dépendent ensuite de Postes Canada et de votre région.",
            "body_en": "You can track your parcel's journey at any time using the tracking number below. Delivery times then depend on Canada Post and your region.",
            "outro_fr": "Une question en cours de route ? Nous restons disponibles pour vous. Bonnes recherches !",
            "outro_en": "Any question along the way? We remain available to you. Happy researching!",
            "cta_url": "{{tracking_url}}", "cta_label_fr": "Suivre mon colis", "cta_label_en": "Track my parcel",
        },
    },
    "order_delivered": {
        "label": "Commande livrée / Order delivered",
        "variables": ["{{order_number}}", "{{customer_name}}"],
        "block": "none",
        "default": {
            "subject_fr": "FIRONOVA — Votre commande {{order_number}} est arrivée",
            "subject_en": "FIRONOVA — Your order {{order_number}} has arrived",
            "heading_fr": "Bien arrivée, {{customer_name}} ?",
            "heading_en": "Did it arrive safely, {{customer_name}}?",
            "intro_fr": "D'après notre suivi, votre commande <strong>{{order_number}}</strong> a été livrée. Nous espérons que tout est arrivé en parfait état et conforme à vos attentes.",
            "intro_en": "According to our tracking, your order <strong>{{order_number}}</strong> has been delivered. We hope everything arrived in perfect condition and met your expectations.",
            "body_fr": "Un rappel important : nos produits sont destinés exclusivement à la recherche (RUO) et réservés aux personnes majeures. Si quelque chose ne va pas avec votre colis, contactez-nous sans tarder — nous prenons chaque message au sérieux.",
            "body_en": "An important reminder: our products are strictly for research use (RUO) and reserved for adults. If anything is wrong with your parcel, contact us right away — we take every message seriously.",
            "outro_fr": "Merci d'avoir choisi Fironova pour vos travaux. Ce fut un plaisir de vous servir.",
            "outro_en": "Thank you for choosing Fironova for your work. It was a pleasure to serve you.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "refund": {
        "label": "Remboursement / Refund",
        "variables": ["{{order_number}}", "{{customer_name}}", "{{amount}}"],
        "block": "refund_detail",
        "default": {
            "subject_fr": "FIRONOVA — Remboursement de votre commande {{order_number}}",
            "subject_en": "FIRONOVA — Refund for your order {{order_number}}",
            "heading_fr": "Votre remboursement est en route, {{customer_name}}",
            "heading_en": "Your refund is on its way, {{customer_name}}",
            "intro_fr": "Nous vous confirmons qu'un remboursement a été émis pour votre commande <strong>{{order_number}}</strong>. Selon votre méthode de paiement initiale, le délai avant réception peut varier de quelques heures à quelques jours.",
            "intro_en": "We confirm that a refund has been issued for your order <strong>{{order_number}}</strong>. Depending on your original payment method, the time before you receive it may vary from a few hours to a few days.",
            "body_fr": "Vous trouverez le détail du montant ci-dessous. Si vous avez la moindre question sur ce remboursement, ou si vous n'en voyez pas la trace passé quelques jours, n'hésitez pas à nous écrire — nous suivrons cela personnellement.",
            "body_en": "You'll find the amount details below. If you have any question about this refund, or if you don't see it after a few days, don't hesitate to write to us — we'll follow up personally.",
            "outro_fr": "Nous espérons avoir l'occasion de vous accompagner à nouveau dans le futur.",
            "outro_en": "We hope to have the chance to serve you again in the future.",
            "cta_url": "", "cta_label_fr": "", "cta_label_en": "",
        },
    },
    "welcome": {
        "label": "Bienvenue / Welcome",
        "variables": ["{{customer_name}}"],
        "block": "none",
        "default": {
            "subject_fr": "Bienvenue chez Fironova, {{customer_name}}",
            "subject_en": "Welcome to Fironova, {{customer_name}}",
            "heading_fr": "Ravis de vous accueillir, {{customer_name}}",
            "heading_en": "Delighted to welcome you, {{customer_name}}",
            "intro_fr": "Bienvenue chez Fironova. En créant votre compte, vous rejoignez une communauté de chercheurs qui attendent de leurs peptides une chose avant tout : la rigueur.",
            "intro_en": "Welcome to Fironova. By creating your account, you join a community of researchers who expect one thing above all from their peptides: rigor.",
            "body_fr": "Nous sélectionnons nos composés avec exigence et documentons nos lots avec transparence. Notre catalogue est volontairement restreint : nous préférons faire peu de choses, mais les faire irréprochablement. Nos produits sont destinés à la recherche uniquement (RUO), réservés aux personnes majeures.",
            "body_en": "We select our compounds demandingly and document our lots transparently. Our catalog is deliberately tight: we'd rather do few things, but do them impeccably. Our products are for research use only (RUO), reserved for adults.",
            "outro_fr": "Prenez le temps d'explorer. Et pour toute question, une vraie personne vous répondra toujours.",
            "outro_en": "Take your time to explore. And for any question, a real person will always reply.",
            "cta_url": "{{catalog_url}}", "cta_label_fr": "Découvrir le catalogue", "cta_label_en": "Discover the catalog",
        },
    },
    "abandoned_cart": {
        "label": "Panier abandonné / Abandoned cart",
        "variables": ["{{customer_name}}", "{{cart_url}}"],
        "block": "none",
        "default": {
            "subject_fr": "Votre panier Fironova vous attend, {{customer_name}}",
            "subject_en": "Your Fironova cart is waiting, {{customer_name}}",
            "heading_fr": "Vous avez laissé quelque chose derrière vous",
            "heading_en": "You left something behind",
            "intro_fr": "Nous avons remarqué que vous aviez commencé une commande sans la finaliser. Pas de pression : votre panier est toujours là, exactement comme vous l'avez laissé.",
            "intro_en": "We noticed you started an order without completing it. No pressure: your cart is still here, exactly as you left it.",
            "body_fr": "Si une question vous a retenu — sur un composé, sur nos méthodes de paiement Interac ou crypto, sur la livraison — nous serons heureux d'y répondre. Il suffit de nous écrire.",
            "body_en": "If a question held you back — about a compound, our Interac or crypto payment methods, or delivery — we'd be happy to answer. Just write to us.",
            "outro_fr": "Votre panier reste disponible encore quelque temps. Au plaisir de vous retrouver.",
            "outro_en": "Your cart stays available a little longer. We hope to see you again.",
            "cta_url": "{{cart_url}}", "cta_label_fr": "Reprendre ma commande", "cta_label_en": "Resume my order",
        },
    },
    "restock": {
        "label": "Retour en stock / Back in stock",
        "variables": ["{{product_name}}", "{{product_url}}"],
        "block": "none",
        "default": {
            "subject_fr": "FIRONOVA — {{product_name}} est de retour",
            "subject_en": "FIRONOVA — {{product_name}} is back",
            "heading_fr": "Bonne nouvelle : {{product_name}} est de retour",
            "heading_en": "Good news: {{product_name}} is back",
            "intro_fr": "Vous nous aviez demandé d'être prévenu, et nous tenons parole : <strong>{{product_name}}</strong> est de nouveau disponible dans notre catalogue.",
            "intro_en": "You asked us to let you know, and we're keeping our word: <strong>{{product_name}}</strong> is available again in our catalog.",
            "body_fr": "Les réassorts partent parfois vite. Si ce composé est important pour vos travaux, nous vous invitons à ne pas trop tarder. Comme toujours, il est proposé pour la recherche uniquement (RUO).",
            "body_en": "Restocks sometimes go quickly. If this compound matters for your work, we'd suggest not waiting too long. As always, it's offered for research use only (RUO).",
            "outro_fr": "Merci de votre fidélité et de votre confiance renouvelée.",
            "outro_en": "Thank you for your loyalty and renewed trust.",
            "cta_url": "{{product_url}}", "cta_label_fr": "Voir le produit", "cta_label_en": "View the product",
        },
    },
}
# ===== FIRONOVA_EMAIL_TEMPLATES_END =====

# ===== FIRONOVA_EMAIL_ENGINE_START =====
def _email_defaults(key: str) -> dict:
    meta = EMAIL_TEMPLATE_CATALOG.get(key)
    if not meta:
        return {}
    d = dict(meta["default"])
    d.update({"key": key, "label": meta["label"],
              "variables": meta["variables"], "block": meta.get("block", "none")})
    return d


async def _email_template_get(key: str) -> Optional[dict]:
    """Merge défauts catalogue <- surcharges DB. Gère aussi les types custom
    (créés depuis l'admin) qui n'existent que dans la collection."""
    base = _email_defaults(key)
    doc = await s.db.email_templates.find_one({"key": key}, {"_id": 0})
    if not base and not doc:
        return None
    if not base and doc:  # type entièrement custom
        base = {"key": key, "label": doc.get("label", key),
                "variables": doc.get("variables", []), "block": doc.get("block", "none"),
                "subject_fr": "", "subject_en": "", "heading_fr": "", "heading_en": "",
                "intro_fr": "", "intro_en": "", "body_fr": "", "body_en": "",
                "outro_fr": "", "outro_en": "", "cta_url": "",
                "cta_label_fr": "", "cta_label_en": ""}
    if doc:
        for fld in ("subject_fr", "subject_en", "heading_fr", "heading_en",
                    "intro_fr", "intro_en", "body_fr", "body_en", "outro_fr", "outro_en",
                    "cta_url", "cta_label_fr", "cta_label_en", "label", "block"):
            if doc.get(fld) not in (None, ""):
                base[fld] = doc[fld]
    base.setdefault("custom", bool(doc and key not in EMAIL_TEMPLATE_CATALOG))
    return base


def _render_block(block: str, lang: str, order: Optional[dict]) -> str:
    """Rend le bloc contextuel HTML (infos Interac, crypto, items, suivi)."""
    if not block or block == "none" or not order:
        return ""
    L = (lambda fr, en: fr if str(lang).startswith("fr") else en)

    def _order_recap_html() -> str:
        items = order.get("items", [])
        rows = ""
        for it in items[:12]:
            name = html.escape(str(it.get("name_en") or it.get("name_fr") or it.get("slug", "")))
            qty = it.get("qty", 1)
            rows += (
                f'<tr><td style="padding:6px 0;color:#1A2A38">{name}</td>'
                f'<td style="padding:6px 0;text-align:right;color:#3E5C76">× {qty}</td></tr>'
            )

        subtotal = float(order.get("subtotal", 0) or 0)
        discount = float(order.get("discount", 0) or 0)
        shipping = float(order.get("shipping", 0) or 0)
        total = float(order.get("total", 0) or 0)

        coupon = order.get("coupon") or {}
        coupon_code = html.escape(str(coupon.get("code") or "").strip())
        coupon_line = ""
        if discount > 0:
            label = f'{L("Coupon", "Coupon")} ({coupon_code})' if coupon_code else L("Rabais", "Discount")
            coupon_line = (
                f'<tr><td style="padding:6px 0;color:#3E5C76">{label}</td>'
                f'<td style="padding:6px 0;text-align:right;color:#0B2E4F">- {discount:.2f} $ CAD</td></tr>'
            )

        ship = order.get("shipping_address") or {}
        ship_name = html.escape(str(ship.get("full_name") or ""))
        ship_line1 = html.escape(str(ship.get("address1") or ""))
        ship_line2 = html.escape(str(ship.get("address2") or ""))
        ship_city = html.escape(str(ship.get("city") or ""))
        ship_prov = html.escape(str(ship.get("province") or ""))
        ship_postal = html.escape(str(ship.get("postal_code") or ""))
        shipping_address_html = ""
        if ship_name or ship_line1 or ship_city:
            line_2 = " ".join([p for p in [ship_city, ship_prov, ship_postal] if p]).strip()
            shipping_address_html = f"""
          <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #D1D5DB">
            <div style="font-size:12px;color:#3E5C76;margin-bottom:4px">{L("Livraison vers", "Ship to")}</div>
            <div style="font-size:13px;color:#1A2A38">{ship_name}</div>
            <div style="font-size:13px;color:#1A2A38">{ship_line1}{(' · ' + ship_line2) if ship_line2 else ''}</div>
            <div style="font-size:13px;color:#1A2A38">{line_2}</div>
          </div>"""

        return f"""
        <div style="margin:8px 0 20px;border:1px solid #E2E8F0;border-radius:12px;padding:20px;background:#FBFDFE">
          <table style="width:100%;font-size:14px;border-collapse:collapse">{rows}
            <tr><td style="padding:10px 0 0;border-top:2px solid #0B2E4F;color:#3E5C76">{L("Sous-total", "Subtotal")}</td><td style="padding:10px 0 0;border-top:2px solid #0B2E4F;text-align:right;color:#0B2E4F">{subtotal:.2f} $ CAD</td></tr>
            {coupon_line}
            <tr><td style="padding:6px 0;color:#3E5C76">{L("Livraison", "Shipping")}</td><td style="padding:6px 0;text-align:right;color:#0B2E4F">{shipping:.2f} $ CAD</td></tr>
            <tr><td style="padding:12px 0 0;border-top:2px solid #0B2E4F;font-weight:bold">{L("Total", "Total")}</td><td style="padding:12px 0 0;border-top:2px solid #0B2E4F;text-align:right;font-weight:bold">{total:.2f} $ CAD</td></tr>
          </table>
          {shipping_address_html}
        </div>"""

    if block == "interac":
        pi = (order.get("payment_info") or {}).get("instructions") or {}
        if not pi:
            return ""
        return f"""
        <div style="margin:8px 0 20px;border:2px solid #00B8D4;border-radius:12px;padding:20px;background:#F0FBFD">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#0B2E4F;font-weight:bold;margin-bottom:14px">{L("VIREMENT INTERAC — INFORMATIONS","INTERAC E-TRANSFER — DETAILS")}</div>
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:7px 0;color:#3E5C76">{L("Destinataire","Send to")}</td><td style="padding:7px 0;text-align:right;font-weight:bold;color:#0B2E4F">{pi.get("send_to","")}</td></tr>
            <tr><td style="padding:7px 0;color:#3E5C76">{L("Montant exact","Exact amount")}</td><td style="padding:7px 0;text-align:right;font-weight:bold;color:#0B2E4F">{pi.get("amount_cad",0):.2f} $ CAD</td></tr>
            <tr><td style="padding:7px 0;color:#3E5C76">{L("Référence (à inscrire)","Reference (include it)")}</td><td style="padding:7px 0;text-align:right;font-weight:bold;color:#00838F">{pi.get("reference","")}</td></tr>
            <tr><td style="padding:7px 0;color:#3E5C76">{L("Question de sécurité","Security question")}</td><td style="padding:7px 0;text-align:right;color:#0B2E4F">{pi.get("security_question","")}</td></tr>
            <tr><td style="padding:7px 0;color:#3E5C76">{L("Réponse de sécurité","Security answer")}</td><td style="padding:7px 0;text-align:right;font-weight:bold;color:#0B2E4F">{pi.get("security_answer_hint","")}</td></tr>
          </table>
                </div>
                {_order_recap_html()}"""
    if block == "crypto":
        pi = (order.get("payment_info") or {})
        addr = pi.get("pay_address") or pi.get("address") or ""
        amt = pi.get("pay_amount") or pi.get("amount") or ""
        cur = pi.get("pay_currency") or pi.get("currency") or ""
        url = pi.get("payment_url") or pi.get("invoice_url") or ""
        rows = ""
        if amt: rows += f'<tr><td style="padding:7px 0;color:#3E5C76">{L("Montant","Amount")}</td><td style="padding:7px 0;text-align:right;font-weight:bold">{amt} {str(cur).upper()}</td></tr>'
        if addr: rows += f'<tr><td style="padding:7px 0;color:#3E5C76">{L("Adresse","Address")}</td><td style="padding:7px 0;text-align:right;font-family:monospace;font-size:12px;word-break:break-all">{addr}</td></tr>'
        link = f'<div style="margin-top:14px"><a href="{url}" style="color:#00838F;font-weight:bold">{L("Ouvrir la page de paiement sécurisée","Open the secure payment page")}</a></div>' if url else ""
        return f"""
        <div style="margin:8px 0 20px;border:2px solid #00B8D4;border-radius:12px;padding:20px;background:#F0FBFD">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#0B2E4F;font-weight:bold;margin-bottom:14px">{L("PAIEMENT CRYPTO — INFORMATIONS","CRYPTO PAYMENT — DETAILS")}</div>
          <table style="width:100%;font-size:14px;border-collapse:collapse">{rows}</table>{link}
        </div>
        {_order_recap_html()}"""
    if block == "items":
        return _order_recap_html()
    if block == "tracking":
        tn = order.get("tracking_number") or order.get("tracking") or ""
        if not tn:
            return ""
        return f"""
        <div style="margin:8px 0 20px;border:1px solid #E2E8F0;border-radius:12px;padding:20px;background:#FBFDFE">
          <div style="font-size:13px;color:#3E5C76">{L("Numéro de suivi","Tracking number")}</div>
          <div style="font-family:monospace;font-size:16px;font-weight:bold;color:#0B2E4F;margin-top:4px">{tn}</div>
        </div>"""
    if block == "refund_detail":
        amt = order.get("_refund_amount", order.get("total", 0))
        return f"""
        <div style="margin:8px 0 20px;border:1px solid #E2E8F0;border-radius:12px;padding:20px;background:#FBFDFE">
          <table style="width:100%;font-size:14px"><tr><td style="color:#3E5C76">{L("Montant remboursé","Refunded amount")}</td><td style="text-align:right;font-weight:bold;color:#0B2E4F">{amt:.2f} $ CAD</td></tr></table>
        </div>"""
    return ""


def _email_render(tpl: dict, lang: str, ctx: dict, order: Optional[dict] = None) -> tuple:
    lang = "fr" if str(lang).lower().startswith("fr") else "en"
    def sub(txt):
        out = txt or ""
        for k, v in (ctx or {}).items():
            out = out.replace("{{" + k + "}}", html.escape(str(v)))
        return out
    subject = sub(tpl.get(f"subject_{lang}") or tpl.get("subject_en") or "FIRONOVA")
    parts = []
    intro = sub(tpl.get(f"intro_{lang}") or "")
    if intro: parts.append(f'<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1A2A38">{intro}</p>')
    block_html = _render_block(tpl.get("block", "none"), lang, order)
    if block_html: parts.append(block_html)
    body = sub(tpl.get(f"body_{lang}") or "")
    if body: parts.append(f'<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1A2A38">{body}</p>')
    outro = sub(tpl.get(f"outro_{lang}") or "")
    if outro: parts.append(f'<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#3E5C76">{outro}</p>')
    body_html_shell = "\n".join(parts)
    rendered_html = _nova_email_shell(sub(tpl.get("heading_fr", "")), sub(tpl.get("heading_en", "")),
                             body_html_shell, cta_url=sub(tpl.get("cta_url", "")),
                             cta_label_fr=tpl.get("cta_label_fr", ""), cta_label_en=tpl.get("cta_label_en", ""))
    return subject, rendered_html


async def send_template_email(key: str, to: str, lang: str, ctx: dict, order: Optional[dict] = None):
    """Point d'entrée unifié : rend le template et envoie (respecte on/off via email_key)."""
    tpl = await _email_template_get(key)
    if not tpl:
        logging.warning("[email] template inconnu: %s", key); return
    subject, html = _email_render(tpl, lang, ctx or {}, order)
    await s._send_email(to, subject, html)


class EmailTemplateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject_fr: Optional[str] = None; subject_en: Optional[str] = None
    heading_fr: Optional[str] = None; heading_en: Optional[str] = None
    intro_fr: Optional[str] = None; intro_en: Optional[str] = None
    body_fr: Optional[str] = None; body_en: Optional[str] = None
    outro_fr: Optional[str] = None; outro_en: Optional[str] = None
    cta_url: Optional[str] = None
    cta_label_fr: Optional[str] = None; cta_label_en: Optional[str] = None
    block: Optional[str] = None


class EmailTemplateCreateIn(EmailTemplateIn):
    key: str
    label: Optional[str] = None
    variables: Optional[list] = None

# ===== FIRONOVA_EMAIL_ENGINE_END =====

# ===== FIRONOVA_EMAIL_WIRING_START =====
def _order_ctx(order: dict) -> tuple:
    """Construit (lang, to, ctx) à partir d'une commande."""
    lang = (order.get("lang") or "fr").lower()
    name = order.get("customer_name") or order.get("name") or (order.get("shipping_address") or {}).get("name") or ""
    ctx = {
        "order_number": order.get("order_number", ""),
        "customer_name": name or ("là" if lang.startswith("fr") else "there"),
        "total": f"{order.get('total', 0):.2f} $",
        "amount": f"{order.get('_refund_amount', order.get('total', 0)):.2f} $",
        "tracking_number": order.get("tracking_number") or order.get("tracking") or "",
        "tracking_url": order.get("tracking_url") or "",
        "catalog_url": (s.PUBLIC_BASE_URL or "").rstrip("/") + "/catalog",
        "cart_url": (s.PUBLIC_BASE_URL or "").rstrip("/") + "/cart",
    }
    return lang, order.get("email"), ctx
