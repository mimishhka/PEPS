"""Stock service: atomic reservation/release, restock on cancellation,
back-in-stock notifications, and low-stock admin alerts."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

# `s.<name>` reads the live binding on the server module: configuration, the
# Mongo handle, helpers that stayed behind, and the side-effecting calls that
# callers substitute there. See services/__init__.py.
import server as s


# ---------------------------------------------------------------------------
# Réservation atomique du stock.
# Remplace le pattern check-then-act (lecture dans _build_order_totals,
# écriture historiquement ~200 lignes plus loin dans checkout). Le filtre
# $gte dans le update_one garantit qu'aucune décrémentation ne peut passer
# sous zéro, même avec N workers concurrents sur le dernier flacon.
# ---------------------------------------------------------------------------
async def _reserve_stock_atomic(line_items: list) -> list:
    """
    Décrémente le stock de chaque ligne non-preorder de façon atomique.
    Les précommandes ne consomment pas le stock au checkout ; elles le
    réservent au moment de leur libération vers processing, ce qui évite les
    surventes sans changer le comportement produit attendu.
    Retourne la liste des lignes effectivement réservées (pour rollback).
    Lève HTTPException(400) et rollback si une ligne échoue.
    """
    reserved: list = []
    for it in line_items:
        if it.get("preorder"):
            continue
        qty = it["qty"]
        vid = it.get("variant_id")

        if vid in (None, "", "_default"):
            res = await s.db.products.update_one(
                {"id": it["product_id"], "stock": {"$gte": qty}},
                {"$inc": {"stock": -qty}},
            )
        else:
            res = await s.db.products.update_one(
                {"id": it["product_id"],
                 "variants": {"$elemMatch": {"id": vid, "stock": {"$gte": qty}}}},
                {"$inc": {"variants.$[v].stock": -qty}},
                array_filters=[{"v.id": vid}],
            )

        if res.modified_count != 1:
            await s._release_stock_atomic(reserved)
            raise HTTPException(
                400,
                f"Insufficient stock for {it.get('name_en', it['product_id'])}"
                f"{(' (' + it['variant_name'] + ')') if it.get('variant_name') else ''}",
            )
        reserved.append(it)
    return reserved


async def _release_stock_atomic(line_items: list) -> None:
    """Rollback d'une réservation partielle. Ne notifie pas le restock
    (la marchandise n'a jamais réellement quitté le stock)."""
    for it in line_items:
        if it.get("preorder"):
            continue
        qty = it["qty"]
        vid = it.get("variant_id")
        if vid in (None, "", "_default"):
            await s.db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": qty}})
        else:
            await s.db.products.update_one(
                {"id": it["product_id"], "variants.id": vid},
                {"$inc": {"variants.$.stock": qty}},
            )

# ---------------------------------------------------------------------------
# Back-in-stock notifications
# ---------------------------------------------------------------------------
def _restock_email_html(product: dict, variant: Optional[dict]) -> str:
    name = product.get("name_en", product.get("slug", ""))
    variant_label = f" — {variant['name']}" if variant and variant.get("name") else ""
    slug = product.get("slug", "")
    link = f"{s.PUBLIC_BASE_URL}/product/{slug}" if s.PUBLIC_BASE_URL else f"/product/{slug}"
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:'Helvetica Neue',Arial,sans-serif;color:#050505">
  <table style="width:100%;max-width:640px;margin:0 auto;background:#fff;border:1px solid #050505">
    <tr><td style="background:#050505;color:#fff;padding:20px 28px;font-family:monospace;font-size:11px;letter-spacing:3px">// FIRONOVA · BACK IN STOCK</td></tr>
    <tr><td style="padding:32px 28px">
      <h1 style="margin:0 0 12px;font-size:24px;font-weight:900;letter-spacing:-0.02em;text-transform:uppercase">{name}{variant_label}</h1>
      <p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.6">
        Good news — the product you were tracking is available again.<br/>
        Bonne nouvelle — le produit que vous suiviez est de nouveau en stock.
      </p>
      <a href="{link}" style="display:inline-block;background:#050505;color:#fff;font-family:monospace;font-size:12px;letter-spacing:2px;padding:12px 24px;text-decoration:none">VIEW PRODUCT / VOIR LE PRODUIT →</a>
      <p style="margin:32px 0 0;font-family:monospace;font-size:10px;letter-spacing:2px;color:#999;text-transform:uppercase">For Research Use Only · Not For Human Or Veterinary Consumption</p>
    </td></tr>
    <tr><td style="background:#050505;color:#fff;padding:14px 28px;font-family:monospace;font-size:10px;letter-spacing:2px">FIRONOVA · CANADA · {datetime.now(timezone.utc).strftime("%Y")}</td></tr>
  </table>
</body></html>"""


async def _send_restock_email(to_email: str, product: dict, variant: Optional[dict]) -> None:
    name = product.get("name_en", product.get("slug", ""))
    html = _restock_email_html(product, variant)
    await s.send_template_email("restock", to_email, "en", {"product_name": name, "product_url": (s.PUBLIC_BASE_URL or "").rstrip("/") + f"/product/{product.get('slug','')}"})


async def _maybe_notify_restock(product_id: str, variant_id: Optional[str] = None) -> None:
    """Checks current stock for a product/variant; if positive, emails every pending
    subscriber for that exact product/variant and marks them notified (one-shot)."""
    product = await s.db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        return
    variant = None
    if variant_id and variant_id not in ("", "_default"):
        variant = next((v for v in product.get("variants", []) if v.get("id") == variant_id), None)
        current_stock = variant.get("stock", 0) if variant else 0
    else:
        variant_id = None  # normalize "" / "_default" to None for legacy/product-level match
        current_stock = product.get("stock", 0)
    if current_stock <= 0:
        return

    pending = s.db.stock_notifications.find(
        {"product_id": product_id, "variant_id": variant_id, "notified": False},
        {"_id": 0},
    ).sort("created_at", 1)
    async for sub in pending:
        claimed = await s.db.stock_notifications.update_one(
            {"id": sub["id"], "notified": False},
            {"$set": {"notified": True, "notified_at": datetime.now(timezone.utc).isoformat()}},
        )
        if claimed.modified_count:
            asyncio.create_task(s._send_restock_email(sub["email"], product, variant))

# ===========================================================================
# Low stock alert — email admin quand une variante tombe sous son seuil
# ===========================================================================
async def _check_low_stock_alerts(product_id: str, variant_ids) -> None:
    """Vérifie chaque variante affectée d'un produit contre son seuil bas.
    - Si stock <= threshold ET pas d'alerte active → queue email admin + set flag.
    - Si stock > threshold ET alerte active → clear flag (permet ré-alertes futures).
    Idempotent via collection `low_stock_alerts` (unique par variant)."""
    try:
        product = await s.db.products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            return
        threshold = int(product.get("low_stock_threshold") or 10)
        variants = product.get("variants") or []
        for v in variants:
            vid = v.get("id")
            if variant_ids and vid not in variant_ids and None not in variant_ids:
                continue
            stock = int(v.get("stock") or 0)
            alert_key = {"product_id": product_id, "variant_id": vid}
            existing = await s.db.low_stock_alerts.find_one(alert_key, {"_id": 0, "active": 1})
            if stock <= threshold:
                if existing and existing.get("active"):
                    continue   # déjà alerté, on ne spamme pas
                # Nouvelle alerte
                await s.db.low_stock_alerts.update_one(
                    alert_key,
                    {"$set": {**alert_key, "active": True, "stock": stock,
                              "threshold": threshold,
                              "triggered_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
                await s._send_low_stock_admin_email(product, v, stock, threshold)
            else:
                if existing and existing.get("active"):
                    await s.db.low_stock_alerts.update_one(
                        alert_key,
                        {"$set": {"active": False,
                                  "cleared_at": datetime.now(timezone.utc).isoformat()}},
                    )
        # Cas produit sans variantes : évaluer product.stock
        if not variants:
            stock = int(product.get("stock") or 0)
            alert_key = {"product_id": product_id, "variant_id": None}
            existing = await s.db.low_stock_alerts.find_one(alert_key, {"_id": 0, "active": 1})
            if stock <= threshold:
                if not (existing and existing.get("active")):
                    await s.db.low_stock_alerts.update_one(
                        alert_key,
                        {"$set": {**alert_key, "active": True, "stock": stock,
                                  "threshold": threshold,
                                  "triggered_at": datetime.now(timezone.utc).isoformat()}},
                        upsert=True,
                    )
                    await s._send_low_stock_admin_email(product, None, stock, threshold)
            elif existing and existing.get("active"):
                await s.db.low_stock_alerts.update_one(
                    alert_key,
                    {"$set": {"active": False,
                              "cleared_at": datetime.now(timezone.utc).isoformat()}},
                )
    except Exception as e:
        logging.error("[low-stock] check failed product=%s err=%s", product_id, type(e).__name__)


async def low_stock_alerts_enriched(limit: int = 500) -> dict:
    """Alertes de stock bas actives, enrichies du nom produit/variante.

    L'enrichissement se fait ici plutôt que côté client : une seule requête
    products couvre toutes les alertes, là où le widget dashboard ferait un
    N+1 (une requête par ligne affichée).
    """
    docs = await s.db.low_stock_alerts.find(
        {"active": True}, {"_id": 0}
    ).sort("triggered_at", -1).to_list(limit)
    if not docs:
        return {"items": [], "count": 0}

    product_ids = list({d["product_id"] for d in docs})
    products = await s.db.products.find(
        {"id": {"$in": product_ids}},
        {"_id": 0, "id": 1, "name_en": 1, "name_fr": 1, "slug": 1,
         "variants.id": 1, "variants.name": 1, "variants.sku": 1},
    ).to_list(len(product_ids))
    pmap = {p["id"]: p for p in products}

    for d in docs:
        p = pmap.get(d["product_id"], {})
        d["product_name"] = p.get("name_en") or p.get("name_fr") or p.get("slug") or "?"
        d["product_slug"] = p.get("slug")
        variant = next(
            (v for v in (p.get("variants") or []) if v.get("id") == d.get("variant_id")),
            {},
        )
        d["variant_name"] = variant.get("name")
        d["variant_sku"] = variant.get("sku")
    return {"items": docs, "count": len(docs)}


async def _send_low_stock_admin_email(product: dict, variant: Optional[dict],
                                       stock: int, threshold: int) -> None:
    name = product.get("name_en") or product.get("name_fr") or product.get("slug") or "?"
    variant_label = variant.get("name") if variant else "—"
    slug = product.get("slug") or ""
    base = (s.PUBLIC_BASE_URL or "").rstrip("/")
    subject = f"FIRONOVA — Stock bas : {name} · {variant_label} ({stock} restants)"
    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F5F1EA;font-family:'Inter',Arial,sans-serif;color:#0B2E4F">
  <table style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #E5DED0;border-radius:8px;overflow:hidden">
    <tr><td style="background:#B85E00;color:#fff;padding:20px 28px;font-family:monospace;letter-spacing:3px;font-size:14px">FIRONOVA · LOW STOCK ALERT</td></tr>
    <tr><td style="padding:32px 28px;font-size:14px;line-height:1.6">
      <p style="margin:0 0 12px"><strong>{name}</strong> — {variant_label}</p>
      <p style="margin:0 0 20px">Stock restant : <strong style="color:#B85E00;font-size:20px">{stock}</strong> (seuil : {threshold})</p>
      <p style="margin:0 0 12px;color:#666;font-size:12px">Ce produit tombe sous son seuil bas. Pensez à commander auprès du fournisseur.</p>
      <p style="margin:24px 0 0"><a href="{base}/ops-portal-fn7k2q/products" style="background:#0B2E4F;color:#fff;padding:12px 20px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase">Ouvrir l'admin →</a></p>
    </td></tr>
    <tr><td style="background:#0B2E4F;color:#fff;padding:14px 28px;font-family:monospace;font-size:10px;letter-spacing:2px">FIRONOVA · CANADA</td></tr>
  </table>
</body></html>"""
    try:
        await s._send_email(s.ADMIN_NOTIFICATION_EMAIL, subject, html)
    except Exception as e:
        logging.error("[low-stock] email queue failed err=%s", type(e).__name__)

async def _restock_order_items(order: dict):
    for it in order.get("items", []):
        if it.get("preorder"):
            continue
        if it.get("variant_id") in (None, "", "_default"):
            await s.db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": it["qty"]}})
            asyncio.create_task(s._maybe_notify_restock(it["product_id"], None))
            continue
        await s.db.products.update_one(
            {"id": it["product_id"], "variants.id": it["variant_id"]},
            {"$inc": {"variants.$.stock": it["qty"]}},
        )
        asyncio.create_task(s._maybe_notify_restock(it["product_id"], it["variant_id"]))
