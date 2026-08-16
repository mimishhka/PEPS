"""Canada Post service: rating, shipment/label creation (SOAP + OpenAPI),
manifests, artifact download, voiding, and delivery tracking sync."""

import asyncio
import logging
import os
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional, TYPE_CHECKING

from fastapi import HTTPException
import httpx

# `s.<name>` reads the live binding on the server module: configuration, the
# Mongo handle, helpers that stayed behind, and the side-effecting calls that
# callers substitute there. See services/__init__.py.
import server as s


if TYPE_CHECKING:  # only referenced from string annotations
    from server import CartItem


# ---------------------------------------------------------------------------
# Canada Post (Postes Canada) — live rating & tracking.
# Gracefully returns nothing when not configured, so callers fall back to the
# existing flat-rate shipping_zones/shipping_methods system (same pattern used
# for NOWPayments' mock mode above).
# ---------------------------------------------------------------------------
_CP_RATE_NS = {"cp": "http://www.canadapost.ca/ws/ship/rate-v4"}
_CP_TRACK_NS = {"cp": "http://www.canadapost.ca/ws/track"}
_CP_SHIP_NS = {"cp": "http://www.canadapost.ca/ws/ncshipment-v4"}
_CP_CSHIP_NS = {"cp": "http://www.canadapost.ca/ws/shipment-v8"}
_CP_MANIFEST_NS = {"cp": "http://www.canadapost.ca/ws/manifest-v8"}

_CP_OAUTH_TOKEN: str = ""
_CP_OAUTH_EXPIRES_AT: Optional[datetime] = None


def _cp_use_openapi() -> bool:
    mode = s.CANADA_POST_API_MODE
    if mode == "openapi":
        return True
    if mode == "legacy":
        return False
    return bool(s.CANADA_POST_OAUTH_CLIENT_ID and s.CANADA_POST_OAUTH_CLIENT_SECRET)


def _cp_path_customers() -> tuple[str, str]:
    mailed_by = (s.CANADA_POST_MAILED_BY or s.CANADA_POST_CUSTOMER_NUMBER or "").strip()
    mobo = (s.CANADA_POST_MOBO or s.CANADA_POST_CUSTOMER_NUMBER or "").strip()
    return mailed_by, mobo


def _cp_openapi_headers(token: str, accept: str = "application/json") -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": accept,
        "Accept-Language": "en-CA",
    }
    if s.CANADA_POST_PLATFORM_ID:
        headers["platform-id"] = s.CANADA_POST_PLATFORM_ID
    return headers


def _cp_safe_json(response: httpx.Response) -> dict:
    try:
        data = response.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _cp_error_detail(response: httpx.Response) -> str:
    payload = _cp_safe_json(response)
    title = str(payload.get("title") or "").strip()
    detail = str(payload.get("detail") or "").strip()
    errors = payload.get("errors") if isinstance(payload.get("errors"), list) else []
    first = errors[0] if errors else {}
    code = str(first.get("errorCode") or "").strip()
    msg = str(first.get("message") or first.get("description") or "").strip()
    parts = [p for p in [title, detail, f"{code} {msg}".strip()] if p]
    if parts:
        return " | ".join(parts)
    return (response.text or "").strip()[:500]


async def _cp_get_oauth_token(force_refresh: bool = False) -> str:
    global _CP_OAUTH_TOKEN, _CP_OAUTH_EXPIRES_AT
    now = datetime.now(timezone.utc)
    if (not force_refresh and _CP_OAUTH_TOKEN and _CP_OAUTH_EXPIRES_AT
            and _CP_OAUTH_EXPIRES_AT > now + timedelta(seconds=30)):
        return _CP_OAUTH_TOKEN

    data = {"grant_type": "client_credentials", "scope": "merchant"}
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.post(
                s.CANADA_POST_OAUTH_TOKEN_URL,
                data=data,
                auth=(s.CANADA_POST_OAUTH_CLIENT_ID, s.CANADA_POST_OAUTH_CLIENT_SECRET),
                headers={"Accept": "application/json"},
            )
    except Exception as ex:
        logging.error("Canada Post OAuth token request failed: %s", type(ex).__name__)
        raise HTTPException(502, "Canada Post OAuth token endpoint unreachable")

    if r.status_code >= 400:
        logging.error("Canada Post OAuth token status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
        raise HTTPException(502, f"Canada Post OAuth rejected credentials ({r.status_code})")

    payload = _cp_safe_json(r)
    token = str(payload.get("access_token") or "")
    expires_in = int(payload.get("expires_in") or 300)
    if not token:
        raise HTTPException(502, "Canada Post OAuth returned no access token")

    _CP_OAUTH_TOKEN = token
    _CP_OAUTH_EXPIRES_AT = now + timedelta(seconds=max(30, expires_in))
    return _CP_OAUTH_TOKEN


async def _cp_openapi_call(method: str, url_or_path: str, *, json_body: Optional[dict] = None,
                           accept: str = "application/json") -> httpx.Response:
    token = await s._cp_get_oauth_token()
    url = url_or_path if url_or_path.startswith("http") else f"{s.CANADA_POST_OPENAPI_BASE_URL}{url_or_path}"
    headers = _cp_openapi_headers(token, accept=accept)
    if json_body is not None:
        headers["Content-Type"] = "application/json"

    # follow_redirects=True est INDISPENSABLE : Canada Post renvoie l'artifact
    # (le PDF de l'étiquette) via une redirection 302 vers l'URL réelle. Sans
    # suivre la redirection, on écrit la réponse 302 vide -> étiquette blanche.
    async with httpx.AsyncClient(timeout=45, follow_redirects=True) as cx:
        r = await cx.request(method, url, json=json_body, headers=headers)
        if r.status_code == 401:
            token = await s._cp_get_oauth_token(force_refresh=True)
            headers = _cp_openapi_headers(token, accept=accept)
            if json_body is not None:
                headers["Content-Type"] = "application/json"
            r = await cx.request(method, url, json=json_body, headers=headers)
    return r


async def _estimate_parcel_weight_kg(items: Optional[List["CartItem"]]) -> float:
    if not items:
        return 0.5
    product_ids = list({item.product_id for item in items})
    products = {
        product["id"]: product
        async for product in s.db.products.find(
            {"id": {"$in": product_ids}},
            {"_id": 0},
        )
    }
    total_g = 0.0
    for it in items:
        p = products.get(it.product_id)
        if not p:
            continue
        v = s._resolve_variant(p, it.variant_id)
        total_g += float(v.get("weight_grams") or 50.0) * it.qty
    return max(0.1, round(total_g / 1000.0, 3))


async def _canada_post_get_rates(destination_postal_code: str, destination_country: str, weight_kg: float) -> list:
    """Calls Canada Post's Rating API (rate-v4). Returns [] if not configured or on any error —
    callers must fall back to the flat-rate system in that case."""
    if not (s.CANADA_POST_API_KEY and s.CANADA_POST_CUSTOMER_NUMBER and s.CANADA_POST_ORIGIN_POSTAL_CODE):
        return []

    origin_pc = s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(" ", "").upper()
    dest_pc = (destination_postal_code or "").replace(" ", "").upper()
    weight_kg = max(0.1, round(weight_kg, 3))

    if destination_country == "CA":
        destination_xml = f"<domestic><postal-code>{dest_pc}</postal-code></domestic>"
    elif destination_country == "US":
        destination_xml = f"<united-states><zip-code>{dest_pc}</zip-code></united-states>"
    else:
        destination_xml = f"<international><country-code>{destination_country}</country-code></international>"

    contract_xml = f"<contract-id>{s.CANADA_POST_CONTRACT_ID}</contract-id>" if s.CANADA_POST_CONTRACT_ID else ""
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<mailing-scenario xmlns="http://www.canadapost.ca/ws/ship/rate-v4">'
        f"<customer-number>{s.CANADA_POST_CUSTOMER_NUMBER}</customer-number>"
        f"{contract_xml}"
        f"<parcel-characteristics><weight>{weight_kg}</weight></parcel-characteristics>"
        f"<origin-postal-code>{origin_pc}</origin-postal-code>"
        f"<destination>{destination_xml}</destination>"
        "</mailing-scenario>"
    )
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.post(
                f"{s.CANADA_POST_BASE_URL}/rs/ship/price",
                content=body.encode("utf-8"),
                auth=_cp_auth_tuple(),
                headers={
                    "Accept": "application/vnd.cpc.ship.rate-v4+xml",
                    "Content-Type": "application/vnd.cpc.ship.rate-v4+xml",
                },
            )
            if r.status_code >= 400:
                logging.error("Canada Post rating status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
                return []
            root = ET.fromstring(r.text)
            quotes = []
            for pq in root.findall("cp:price-quote", _CP_RATE_NS):
                due_el = pq.find("cp:price-details/cp:due", _CP_RATE_NS)
                quotes.append({
                    "carrier": "Canada Post",
                    "service_code": pq.findtext("cp:service-code", default="", namespaces=_CP_RATE_NS),
                    "service_name": pq.findtext("cp:service-name", default="", namespaces=_CP_RATE_NS),
                    "cost_cad": float(due_el.text) if due_el is not None and due_el.text else None,
                    "eta_days": pq.findtext(
                        "cp:service-standard/cp:expected-transit-time", default="", namespaces=_CP_RATE_NS
                    ),
                })
            return [q for q in quotes if q["cost_cad"] is not None]
    except Exception as e:
        logging.error("Canada Post rating request failed: %s", e)
        return []


async def _canada_post_track(pin: str) -> Optional[dict]:
    """Live tracking lookup by PIN. Returns None if not configured or on any error."""
    if not s.CANADA_POST_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                f"{s.CANADA_POST_BASE_URL}/vis/track/pin/{pin}/detail",
                auth=_cp_auth_tuple(),
                headers={"Accept": "application/vnd.cpc.track+xml"},
            )
            if r.status_code >= 400:
                logging.error("Canada Post tracking status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
                return None
            root = ET.fromstring(r.text)
            events = []
            for ev in root.findall(".//cp:occurrence", _CP_TRACK_NS):
                events.append({
                    "date": ev.findtext("cp:event-date", default="", namespaces=_CP_TRACK_NS),
                    "time": ev.findtext("cp:event-time", default="", namespaces=_CP_TRACK_NS),
                    "description": ev.findtext("cp:event-description", default="", namespaces=_CP_TRACK_NS),
                    "location": ev.findtext("cp:event-site", default="", namespaces=_CP_TRACK_NS),
                })
            summary = root.findtext(".//cp:significant-status/cp:description", default="", namespaces=_CP_TRACK_NS)
            return {"pin": pin, "summary": summary, "events": events}
    except Exception as e:
        logging.error("Canada Post tracking request failed: %s", e)
        return None


def _cp_tracking_indicates_delivered(track_data: Optional[dict]) -> tuple[bool, str]:
    """Heuristique prudente pour détecter une livraison confirmée via repérage CP.
    Retourne (is_delivered, evidence_text)."""
    if not isinstance(track_data, dict):
        return False, ""
    texts: list[str] = []
    summary = str(track_data.get("summary") or "").strip()
    if summary:
        texts.append(summary)
    events = track_data.get("events") if isinstance(track_data.get("events"), list) else []
    for ev in events:
        if not isinstance(ev, dict):
            continue
        desc = str(ev.get("description") or "").strip()
        if desc:
            texts.append(desc)

    # Mots-clés de livraison finale (évite "out for delivery" / "en cours de livraison").
    delivered_re = re.compile(
        r"\b(delivered|item delivered|successfully delivered|livr[ée]e?|colis livr[ée]|livraison effectu[ée])\b",
        re.IGNORECASE,
    )
    for txt in texts:
        if delivered_re.search(txt):
            return True, txt
    return False, ""


def _sandbox_fallback_ready(shipped_at_iso: str) -> bool:
    """En sandbox uniquement: autorise un passage auto à delivered après délai,
    si le tracking CP est indisponible."""
    if not (s.CANADA_POST_ENVIRONMENT == "dev" and s.CANADA_POST_SANDBOX_DELIVERY_FALLBACK):
        return False
    if not shipped_at_iso:
        return False
    try:
        dt = datetime.fromisoformat(shipped_at_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
        return age >= timedelta(hours=max(1, s.CANADA_POST_SANDBOX_DELIVER_AFTER_HOURS))
    except Exception:
        return False


def is_canada_post_configured() -> bool:
    """Vrai seulement si les trois éléments indispensables sont présents.
    Sinon TOUT retombe proprement sur le tarif fixe / le suivi manuel."""
    if s._cp_use_openapi():
        mailed_by, mobo = _cp_path_customers()
        return bool(
            mailed_by
            and mobo
            and s.CANADA_POST_ORIGIN_POSTAL_CODE
            and s.CANADA_POST_OAUTH_CLIENT_ID
            and s.CANADA_POST_OAUTH_CLIENT_SECRET
        )
    return bool(s.CANADA_POST_API_KEY and s.CANADA_POST_CUSTOMER_NUMBER and s.CANADA_POST_ORIGIN_POSTAL_CODE)


# Source de vérité UNIQUE pour « étiquettes non transmises ». La bannière de la
# page Commandes et la barre rouge du layout lisaient deux requêtes différentes
# et pouvaient afficher deux nombres contradictoires.
UNTRANSMITTED_MATCH = {
    "shipping_info.label_url": {"$nin": [None, ""]},
    "shipping_info.cp_transmitted": {"$ne": True},
}


async def pending_manifest_state() -> dict:
    """Étiquettes créées et pas encore transmises à Postes Canada.

    Séparé en deux seaux, parce qu'ils n'appellent pas la même action :
      - `groups` : possèdent un cp_group_id, donc transmissibles — c'est ce que
        le bouton « Transmit manifest » traite.
      - `orphans` : étiquette sans cp_group_id. La transmission ne les voit pas
        (elle filtre sur le groupe), donc les compter sans le dire laissait la
        bannière allumée en permanence, sans aucun bouton capable de l'éteindre.
        Il faut les annuler (void) puis recréer l'étiquette.

    Le comptage reste un $group côté Mongo : ramener un document par commande
    pour les compter en Python ne tient pas à 2 000+ étiquettes.
    """
    rows = await s._cursor_all(s.db.orders.aggregate([
        {"$match": UNTRANSMITTED_MATCH},
        {"$group": {"_id": {"$ifNull": ["$shipping_info.cp_group_id", ""]},
                    "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]))

    groups: list[dict] = []
    orphan_count = 0
    for row in rows:
        count = int(row.get("count", 0))
        group_id = (row.get("_id") or "").strip()
        if group_id:
            groups.append({"group_id": group_id, "count": count})
        else:
            orphan_count += count

    # Échantillon borné, seulement pour nommer les commandes à corriger.
    orphans: list[str] = []
    if orphan_count:
        cursor = s.db.orders.find(
            {"$and": [UNTRANSMITTED_MATCH, {"$or": [
                {"shipping_info.cp_group_id": {"$in": [None, ""]}},
                {"shipping_info.cp_group_id": {"$exists": False}},
            ]}]},
            {"_id": 0, "order_number": 1},
        ).limit(50)
        orphans = [doc.get("order_number") or "?" async for doc in cursor]

    transmittable = sum(g["count"] for g in groups)
    return {
        "configured": is_canada_post_configured(),
        # Total affiché : tout ce qui expose au surcoût de 2 $/article.
        "pending_count": transmittable + orphan_count,
        "transmittable_count": transmittable,
        "groups": groups,
        "orphan_count": orphan_count,
        "orphans": sorted(orphans),
    }


def _cp_auth_tuple() -> tuple[str, str]:
    """Supporte "user:password" (recommandé CP) et token seul (legacy)."""
    raw = (s.CANADA_POST_API_KEY or "").strip()
    if ":" in raw:
        user, pwd = raw.split(":", 1)
        return user.strip(), pwd.strip()
    return raw, ""


def _cp_xml_escape(v: str) -> str:
    """Une apostrophe dans un nom de rue casse le XML — et un chevron l'injecte."""
    return (str(v or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


def _cp_intended_method() -> str:
    if s.CANADA_POST_INTENDED_METHOD:
        return s.CANADA_POST_INTENDED_METHOD
    return "Account" if s.CANADA_POST_CONTRACT_ID.strip() else "CreditCard"


async def _canada_post_create_shipment_openapi(order: dict, service_code: str, weight_kg: float) -> dict:
    ship = order.get("shipping_address") or {}
    # Contenant configuré (tare + dimensions) — améliore la justesse du tarif.
    box = await s._select_box_for_order(order)
    box_dims = None
    if box:
        weight_kg = round(weight_kg + float(box.get("tare_grams") or 0) / 1000.0, 3)
        box_dims = {
            "length": round(float(box["length_cm"]), 1),
            "width": round(float(box["width_cm"]), 1),
            "height": round(float(box["height_cm"]), 1),
        }
    dest_pc = str(ship.get("postal_code", "")).replace(" ", "").upper()
    origin_pc = s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(" ", "").upper()
    mailed_by, mobo = _cp_path_customers()
    group_id = f"FN-{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    settlement = {
        "paidByCustomer": mobo,
        "intendedMethodOfPayment": _cp_intended_method(),
    }
    contract = s.CANADA_POST_CONTRACT_ID.strip()
    if contract:
        settlement["contractId"] = contract

    payload: dict[str, Any] = {
        "groupId": group_id,
        "requestedShippingPoint": origin_pc,
        "cpcPickupIndicator": True,
        "deliverySpec": {
            "serviceCode": service_code,
            "sender": {
                "name": s.CANADA_POST_SENDER_NAME,
                "company": s.CANADA_POST_SENDER_NAME,
                "contactPhone": s.CANADA_POST_SENDER_PHONE,
                "addressDetails": {
                    "addressLine1": s.CANADA_POST_SENDER_ADDRESS,
                    "city": s.CANADA_POST_SENDER_CITY,
                    "provState": s.CANADA_POST_SENDER_PROVINCE,
                    "countryCode": "CA",
                    "postalZipCode": origin_pc,
                },
            },
            "destination": {
                "name": str(ship.get("full_name") or "").strip()[:44],
                "addressDetails": {
                    "addressLine1": ship.get("address1") or "",
                    "addressLine2": ship.get("address2") or "",
                    "city": ship.get("city") or "",
                    "provState": ship.get("province") or "",
                    "countryCode": ship.get("country") or "CA",
                    "postalZipCode": dest_pc,
                },
            },
            "parcelCharacteristics": {
                "weight": max(0.1, round(weight_kg, 3)),
                **({"dimensions": box_dims} if box_dims else {}),
            },
            "printPreferences": {
                "outputFormat": os.environ.get("CANADA_POST_LABEL_FORMAT", "4x6"),
                "encoding": "PDF",
            },
            "preferences": {
                "showPackingInstructions": False,
                "showPostageRate": False,
                "showInsuredValue": False,
            },
            "settlementInfo": settlement,
        },
    }

    r = await s._cp_openapi_call("POST", f"/{mailed_by}/{mobo}/shipments", json_body=payload)
    if r.status_code >= 400:
        detail = _cp_error_detail(r)
        logging.error("Canada Post OpenAPI create-shipment %s: %s", r.status_code, detail)
        raise HTTPException(502, f"Canada Post rejected the shipment ({r.status_code})")

    data = _cp_safe_json(r)
    links = data.get("links") if isinstance(data.get("links"), list) else []
    label_href = ""
    for link in links:
        if isinstance(link, dict) and link.get("rel") == "label" and link.get("href"):
            label_href = str(link.get("href"))
            break
    return {
        "pin": str(data.get("trackingPin") or ""),
        "label_href": label_href,
        "shipment_id": str(data.get("shipmentId") or ""),
        "group_id": group_id,
    }


async def _canada_post_get_artifact_openapi(href: str, order_id: str) -> Optional[str]:
    if not href:
        return None
    try:
        r = await s._cp_openapi_call("GET", href, accept="application/pdf")
    except HTTPException:
        return None
    except Exception as ex:
        logging.error("Canada Post OpenAPI get-artifact failed: %s", ex)
        return None
    if r.status_code >= 400:
        logging.error("Canada Post OpenAPI get-artifact status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
        return None
    fname = f"{order_id}-{uuid.uuid4().hex[:8]}.pdf"
    (s.LABEL_UPLOAD_DIR / fname).write_bytes(r.content)
    return f"/api/admin/shipping-labels/{fname}"


async def _canada_post_get_manifest_artifact_openapi(href: str, date_str: str) -> Optional[str]:
    """Télécharge le PDF du manifeste via le flux en 2 étapes du devportal CP:
    1) GET {manifest_href} Accept:application/json  → obtient le lien "artifact"
    2) GET {artifact_href} Accept:application/pdf   → télécharge le PDF réel.
    """
    if not href:
        return None
    try:
        # Étape 1: récupérer le JSON du manifeste pour trouver le lien artifact
        r_json = await s._cp_openapi_call("GET", href, accept="application/json")
        if r_json.status_code >= 400:
            logging.error("CP manifest-artifact step1 status=%s response_ref=%s", r_json.status_code, s._private_ref(r_json.text))
            return None
        manifest_data = _cp_safe_json(r_json)
        links = manifest_data.get("links") or []
        artifact_href = next(
            (l.get("href") for l in links
             if isinstance(l, dict) and l.get("rel") == "artifact" and l.get("href")),
            None,
        )
        if not artifact_href:
            logging.error("CP manifest-artifact: no artifact link found in manifest %s", href)
            return None

        # Étape 2: télécharger le PDF via le lien artifact
        r_pdf = await s._cp_openapi_call("GET", artifact_href, accept="application/pdf")
        if r_pdf.status_code >= 400:
            logging.error("CP manifest-artifact step2 status=%s response_ref=%s", r_pdf.status_code, s._private_ref(r_pdf.text))
            return None
        if r_pdf.content[:4] != b"%PDF":
            logging.error("CP manifest-artifact: response is not a PDF (%d bytes)", len(r_pdf.content))
            return None
        fname = f"manifest-{date_str}-{uuid.uuid4().hex[:8]}.pdf"
        (s.LABEL_UPLOAD_DIR / fname).write_bytes(r_pdf.content)
        logging.info("CP manifest PDF saved: %s", fname)
        return f"/api/admin/shipping-labels/{fname}"
    except HTTPException:
        return None
    except Exception as ex:
        logging.error("Canada Post OpenAPI get-manifest-artifact failed: %s", ex)
        return None


async def _canada_post_shipment_price(shipment_id: str, preferred_service_code: Optional[str] = None) -> Optional[dict]:
    """Coût réel facturé par Postes Canada pour un envoi (Get Shipment Price).
    C'est ce qui permet de comparer ce qu'on PAIE à ce qu'on FACTURE au client."""
    if not shipment_id or not s._cp_use_openapi():
        return None
    mailed_by, mobo = _cp_path_customers()
    try:
        r = await s._cp_openapi_call("GET", f"/{mailed_by}/{mobo}/shipments/{shipment_id}/price")
    except Exception as ex:
        logging.error("Canada Post get-price failed (%s): %s", shipment_id, ex)
        return None
    if r.status_code >= 400:
        logging.error("Canada Post get-price status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
        return None
    # L'endpoint /price retourne une LISTE de devis, pas un objet unique.
    # _cp_safe_json() ne gère que les dicts; on parse directement ici.
    try:
        raw = r.json()
    except Exception:
        logging.error("Canada Post get-price: JSON parse failed for %s", shipment_id)
        return None
    quotes: list[dict] = []
    if isinstance(raw, list):
        quotes = [q for q in raw if isinstance(q, dict)]
    elif isinstance(raw, dict):
        quotes = [raw]
    if not quotes:
        logging.error("Canada Post get-price unexpected payload shipment_ref=%s response_ref=%s", s._private_ref(shipment_id), s._private_ref(raw))
        return None

    selected = None
    preferred = str(preferred_service_code or "").strip().upper()
    if preferred:
        selected = next((q for q in quotes if str(q.get("serviceCode") or "").upper() == preferred), None)
    if selected is None:
        selected = quotes[0]

    std = selected.get("serviceStandard") or {}
    return {
        "service_code": selected.get("serviceCode"),
        "base_amount": selected.get("baseAmount"),
        "pre_tax_amount": selected.get("preTaxAmount"),
        "gst": selected.get("gstAmount"),
        "pst": selected.get("pstAmount"),
        "hst": selected.get("hstAmount"),
        "due_amount": selected.get("dueAmount"),
        "rated_weight_kg": selected.get("ratedWeight"),
        "expected_delivery": std.get("expectedDeliveryDate"),
        "expected_transit_days": std.get("expectedTransitTime"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


async def _canada_post_estimate_openapi(order: dict, service_code: str, weight_kg: float) -> Optional[dict]:
    """Estimation du coût via OpenAPI sans transmission:
    on crée un envoi temporaire, on lit son prix, puis on l'annule (void)."""
    if not (s._cp_use_openapi() and s.is_canada_post_configured()):
        return None
    shipment_id = ""
    try:
        # Réutilise le payload officiel déjà accepté en prod par la création
        # d'étiquette normale pour éviter les erreurs de schéma.
        created = await s._canada_post_create_shipment_openapi(order, service_code, weight_kg)
        shipment_id = str(created.get("shipment_id") or "")
        if not shipment_id:
            return None

        price = await s._canada_post_shipment_price(shipment_id, preferred_service_code=service_code)

        if not price:
            return None

        due = price.get("due_amount")
        eta = price.get("expected_transit_days")
        svc = price.get("service_code")

        return {
            "service_code": svc,
            "cost_cad": float(due) if due is not None else None,
            "eta_days": eta,
        }
    except Exception as ex:
        logging.error("Canada Post OpenAPI estimate failed: %s", ex)
        return None

    finally:
        if shipment_id:
            await s._canada_post_void_openapi(shipment_id)


async def _canada_post_manifest_details(manifest_href: str) -> Optional[dict]:
    """Détails de coût d'un manifeste (Get Manifest Details) : total réellement
    facturé pour la journée, pour le rapprochement comptable."""
    if not manifest_href:
        return None
    href = manifest_href.rstrip("/")
    if not href.endswith("/details"):
        href = f"{href}/details"
    try:
        r = await s._cp_openapi_call("GET", href)
    except Exception as ex:
        logging.error("Canada Post manifest-details failed: %s", ex)
        return None
    if r.status_code >= 400:
        logging.error("Canada Post manifest-details status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
        return None
    d = _cp_safe_json(r) or {}
    p = d.get("manifestPricingInfo") or {}
    return {
        "po_number": d.get("poNumber"),
        "manifest_date": d.get("manifestDate"),
        "manifest_time": d.get("manifestTime"),
        "base_cost": p.get("baseCost"),
        "options_and_surcharges": p.get("optionsAndSurcharges"),
        "gst": p.get("gst"),
        "pst": p.get("pst"),
        "hst": p.get("hst"),
        "total_due": p.get("totalDueCpc"),
    }


async def _canada_post_transmit_openapi(group_id: str) -> list:
    mailed_by, mobo = _cp_path_customers()
    origin_pc = s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(" ", "").upper()
    payload = {
        "groupIds": [group_id],
        "requestedShippingPoint": origin_pc,
        "cpcPickupIndicator": True,
        "detailedManifests": True,
        "methodOfPayment": _cp_intended_method(),
        "manifestAddress": {
            "manifestCompany": s.CANADA_POST_SENDER_NAME,
            "manifestName": s.CANADA_POST_SENDER_NAME,
            "phoneNumber": s.CANADA_POST_SENDER_PHONE,
            "addressDetails": {
                "addressLine1": s.CANADA_POST_SENDER_ADDRESS,
                "city": s.CANADA_POST_SENDER_CITY,
                "provState": s.CANADA_POST_SENDER_PROVINCE,
                "countryCode": "CA",
                "postalZipCode": origin_pc,
            },
        },
    }
    r = await s._cp_openapi_call("POST", f"/{mailed_by}/{mobo}/manifests", json_body=payload)
    if r.status_code >= 400:
        detail = _cp_error_detail(r)
        logging.error("Canada Post OpenAPI transmit %s: %s", r.status_code, detail)
        raise HTTPException(502, f"Canada Post rejected the transmission ({r.status_code})")

    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else []
    hrefs = []
    if isinstance(data, list):
        for link in data:
            if isinstance(link, dict) and link.get("rel") == "manifest" and link.get("href"):
                hrefs.append(str(link.get("href")))
    return hrefs


async def _canada_post_void_openapi(shipment_id: str) -> bool:
    if not shipment_id:
        return False
    mailed_by, mobo = _cp_path_customers()
    try:
        r = await s._cp_openapi_call("DELETE", f"/{mailed_by}/{mobo}/shipments/{shipment_id}")
        return r.status_code < 400
    except Exception as ex:
        logging.error("Canada Post OpenAPI void failed: %s", ex)
        return False


async def _canada_post_create_shipment(order: dict, service_code: str, weight_kg: float) -> dict:
    """Create Shipment (non-contractuel par défaut) → tracking PIN + lien étiquette.

    Retourne {"pin", "label_href", "shipment_id", "group_id"} ou lève HTTPException.
    """
    if not s.is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")
    if s._cp_use_openapi():
        return await s._canada_post_create_shipment_openapi(order, service_code, weight_kg)

    cust = s.CANADA_POST_CUSTOMER_NUMBER
    contract = s.CANADA_POST_CONTRACT_ID.strip()
    # Le groupe sert au manifeste : un groupe par jour d'expédition.
    group_id = f"FN-{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    ship = order.get("shipping_address") or {}
    weight_kg = max(0.1, round(weight_kg, 3))
    e = _cp_xml_escape

    dest_pc = str(ship.get("postal_code", "")).replace(" ", "").upper()
    if contract:
        ns = "http://www.canadapost.ca/ws/shipment-v8"
        path = f"/rs/{cust}/{cust}/shipment"
        ctype = "application/vnd.cpc.shipment-v8+xml"
        root_tag = "shipment"
        extra = f"<contract-id>{e(contract)}</contract-id>"
    else:
        ns = "http://www.canadapost.ca/ws/ncshipment-v4"
        path = f"/rs/{cust}/ncshipment"
        ctype = "application/vnd.cpc.ncshipment-v4+xml"
        root_tag = "non-contract-shipment"
        extra = ""

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<{root_tag} xmlns="{ns}">'
        f"<requested-shipping-point>{e(s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</requested-shipping-point>"
        f"<group-id>{e(group_id)}</group-id>"
        f"{extra}"
        "<delivery-spec>"
        f"<service-code>{e(service_code)}</service-code>"
        "<sender>"
        f"<name>{e(s.CANADA_POST_SENDER_NAME)}</name>"
        f"<company>{e(s.CANADA_POST_SENDER_NAME)}</company>"
        f"<contact-phone>{e(s.CANADA_POST_SENDER_PHONE)}</contact-phone>"
        "<address-details>"
        f"<address-line-1>{e(s.CANADA_POST_SENDER_ADDRESS)}</address-line-1>"
        f"<city>{e(s.CANADA_POST_SENDER_CITY)}</city>"
        f"<prov-state>{e(s.CANADA_POST_SENDER_PROVINCE)}</prov-state>"
        f"<postal-zip-code>{e(s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</postal-zip-code>"
        "</address-details>"
        "</sender>"
        "<destination>"
        f"<name>{e(ship.get('full_name'))}</name>"
        "<address-details>"
        f"<address-line-1>{e(ship.get('address1'))}</address-line-1>"
        f"<address-line-2>{e(ship.get('address2'))}</address-line-2>"
        f"<city>{e(ship.get('city'))}</city>"
        f"<prov-state>{e(ship.get('province'))}</prov-state>"
        f"<country-code>{e(ship.get('country') or 'CA')}</country-code>"
        f"<postal-zip-code>{e(dest_pc)}</postal-zip-code>"
        "</address-details>"
        "</destination>"
        # Contenu volontairement non décrit : emballage neutre.
        f"<parcel-characteristics><weight>{weight_kg}</weight></parcel-characteristics>"
        "<preferences><show-packing-instructions>false</show-packing-instructions></preferences>"
        "</delivery-spec>"
        f"</{root_tag}>"
    )

    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.post(
                f"{s.CANADA_POST_BASE_URL}{path}",
                content=body.encode("utf-8"),
                auth=_cp_auth_tuple(),
                headers={"Accept": ctype, "Content-Type": ctype, "Accept-language": "en-CA"},
            )
    except Exception as ex:
        logging.error("Canada Post create-shipment request failed: %s", ex)
        raise HTTPException(502, "Canada Post unreachable")

    if r.status_code >= 400:
        logging.error("Canada Post create-shipment status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
        raise HTTPException(502, f"Canada Post rejected the shipment ({r.status_code})")

    root = ET.fromstring(r.text)

    def _find(tag: str) -> str:
        for ns_map in (_CP_SHIP_NS, _CP_CSHIP_NS):
            v = root.findtext(f"cp:{tag}", default="", namespaces=ns_map)
            if v:
                return v
        # Repli sans namespace
        el = root.find(f".//{{*}}{tag}")
        return el.text if el is not None and el.text else ""

    pin = _find("tracking-pin")
    shipment_id = _find("shipment-id") or _find("non-contract-shipment-id")

    label_href = ""
    for link in root.findall(".//{*}link"):
        if link.get("rel") == "label":
            label_href = link.get("href", "")
            break

    if not pin:
        logging.error("Canada Post create-shipment missing tracking-pin response_ref=%s", s._private_ref(r.text))
        raise HTTPException(502, "Canada Post returned no tracking number")

    return {"pin": pin, "label_href": label_href, "shipment_id": shipment_id, "group_id": group_id}


async def _canada_post_get_artifact(href: str, order_id: str) -> Optional[str]:
    """Get Artifact → télécharge le PDF de l'étiquette, le stocke, renvoie son URL."""
    if not href:
        return None
    if s._cp_use_openapi():
        return await s._canada_post_get_artifact_openapi(href, order_id)
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.get(href, auth=_cp_auth_tuple(), headers={"Accept": "application/pdf"})
            if r.status_code >= 400:
                logging.error("Canada Post get-artifact status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
                return None
            fname = f"{order_id}-{uuid.uuid4().hex[:8]}.pdf"
            (s.LABEL_UPLOAD_DIR / fname).write_bytes(r.content)
            return f"/api/admin/shipping-labels/{fname}"
    except Exception as ex:
        logging.error("Canada Post get-artifact failed: %s", ex)
        return None


async def _canada_post_transmit(group_id: str) -> list:
    """Transmit Shipments → manifeste(s). SANS CET APPEL, Postes Canada facture
    tous les envois non payés AVEC une surcharge de 2 $/article et retire le
    rabais d'automatisation. C'est l'étape la plus coûteuse à oublier."""
    if not s.is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")
    if s._cp_use_openapi():
        return await s._canada_post_transmit_openapi(group_id)
    cust = s.CANADA_POST_CUSTOMER_NUMBER
    e = _cp_xml_escape
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<transmit-set xmlns="http://www.canadapost.ca/ws/manifest-v8">'
        f"<group-ids><group-id>{e(group_id)}</group-id></group-ids>"
        f"<cpc-pickup-indicator>true</cpc-pickup-indicator>"
        f"<requested-shipping-point>{e(s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</requested-shipping-point>"
        "<detailed-manifests>true</detailed-manifests>"
        "<method-of-payment>Account</method-of-payment>"
        "<manifest-address>"
        f"<manifest-company>{e(s.CANADA_POST_SENDER_NAME)}</manifest-company>"
        f"<phone-number>{e(s.CANADA_POST_SENDER_PHONE)}</phone-number>"
        "<address-details>"
        f"<address-line-1>{e(s.CANADA_POST_SENDER_ADDRESS)}</address-line-1>"
        f"<city>{e(s.CANADA_POST_SENDER_CITY)}</city>"
        f"<prov-state>{e(s.CANADA_POST_SENDER_PROVINCE)}</prov-state>"
        f"<postal-zip-code>{e(s.CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</postal-zip-code>"
        "</address-details>"
        "</manifest-address>"
        "</transmit-set>"
    )
    ctype = "application/vnd.cpc.manifest-v8+xml"
    try:
        async with httpx.AsyncClient(timeout=45) as cx:
            r = await cx.post(
                f"{s.CANADA_POST_BASE_URL}/rs/{cust}/{cust}/manifest",
                content=body.encode("utf-8"),
                auth=_cp_auth_tuple(),
                headers={"Accept": ctype, "Content-Type": ctype, "Accept-language": "en-CA"},
            )
    except Exception as ex:
        logging.error("Canada Post transmit request failed: %s", ex)
        raise HTTPException(502, "Canada Post unreachable")

    if r.status_code >= 400:
        logging.error("Canada Post transmit status=%s response_ref=%s", r.status_code, s._private_ref(r.text))
        raise HTTPException(502, f"Canada Post rejected the transmission ({r.status_code})")

    root = ET.fromstring(r.text)
    hrefs = [l.get("href") for l in root.findall(".//{*}link") if l.get("rel") == "manifest"]
    return [h for h in hrefs if h]


async def _canada_post_void(shipment_id: str) -> bool:
    """Void Shipment — annule une étiquette gâchée NON transmise."""
    if not (s.is_canada_post_configured() and shipment_id):
        return False
    if s._cp_use_openapi():
        return await s._canada_post_void_openapi(shipment_id)
    cust = s.CANADA_POST_CUSTOMER_NUMBER
    path = (f"/rs/{cust}/{cust}/shipment/{shipment_id}" if s.CANADA_POST_CONTRACT_ID.strip()
            else f"/rs/{cust}/ncshipment/{shipment_id}")
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.delete(f"{s.CANADA_POST_BASE_URL}{path}", auth=_cp_auth_tuple(),
                                headers={"Accept": "application/vnd.cpc.shipment-v8+xml"})
            return r.status_code < 400
    except Exception as ex:
        logging.error("Canada Post void failed: %s", ex)
        return False


async def void_untransmitted_labels(admin_email: str = "", limit: int = 100) -> dict:
    """Annule en lot les étiquettes créées mais pas encore transmises.

    Même contrat unitaire que admin_void_label, répété : on n'annule que ce qui
    n'est pas transmis (au-delà, Postes Canada refuse), et on ne remet la
    commande en `processing` que si le transporteur a bien confirmé.

    Les commandes sans cp_shipment_id ne peuvent pas être annulées côté
    transporteur — elles sont rapportées à part plutôt que nettoyées en douce,
    parce qu'une étiquette peut exister chez Postes Canada malgré tout.
    """
    orders = await s.db.orders.find(
        UNTRANSMITTED_MATCH,
        {"_id": 0, "id": 1, "order_number": 1, "shipping_info": 1},
    ).limit(max(1, min(int(limit or 100), 500))).to_list(500)

    voided: list[str] = []
    failed: list[str] = []
    no_shipment_id: list[str] = []

    for order in orders:
        info = order.get("shipping_info") or {}
        number = order.get("order_number") or order.get("id")
        shipment_id = (info.get("cp_shipment_id") or "").strip()
        if not shipment_id:
            no_shipment_id.append(number)
            continue
        if not await s._canada_post_void(shipment_id):
            failed.append(number)
            continue
        await s.db.orders.update_one(
            {"id": order["id"]},
            {"$set": {"shipping_info": {"carrier": "", "tracking_number": "", "shipped_at": None},
                      "fulfillment_status": "processing"},
             "$push": {"notes": {
                 "id": str(uuid.uuid4()),
                 "text": f"Étiquette Postes Canada annulée (void en lot) par {admin_email or 'admin'}.",
                 "author": "system",
                 "created_at": datetime.now(timezone.utc).isoformat(),
             }}},
        )
        voided.append(number)

    return {
        "ok": True,
        "voided": len(voided),
        "voided_orders": voided,
        "failed": failed,
        "no_shipment_id": no_shipment_id,
    }


async def _auto_create_dispatch_label(order_id: str, service_code: Optional[str] = None) -> Optional[dict]:
    order = await s.db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return None
    if order.get("payment_status") != "paid":
        return None
    info = order.get("shipping_info") or {}
    if info.get("label_url") and info.get("tracking_number"):
        return info
    if not s.is_canada_post_configured():
        return None

    svc = (service_code or info.get("service_code") or s.CANADA_POST_DEFAULT_SERVICE_CODE or "DOM.EP").strip()
    try:
        res = await s._canada_post_create_shipment(order, svc, s._order_weight_kg(order))
        label_url = await s._canada_post_get_artifact(res["label_href"], order["id"])
        now = datetime.now(timezone.utc).isoformat()
        shipping_info = {
            **info,
            "carrier": "Canada Post",
            "tracking_number": res["pin"],
            "label_url": label_url,
            "cp_shipment_id": res["shipment_id"],
            "cost": await s._canada_post_shipment_price(res["shipment_id"], preferred_service_code=svc),
            "cp_group_id": res["group_id"],
            "cp_transmitted": False,
            "service_code": svc,
            "shipped_at": now,
        }
        await s.db.orders.update_one(
            {"id": order["id"]},
            {"$set": {"shipping_info": shipping_info, "fulfillment_status": "shipped"},
             "$push": {"notes": {
                 "id": str(uuid.uuid4()),
                 "text": f"Étiquette Postes Canada créée automatiquement — suivi {res['pin']}.",
                 "author": "system",
                 "created_at": now,
             }}},
        )
        fresh = await s.db.orders.find_one({"id": order["id"]}, {"_id": 0})
        asyncio.create_task(s.send_shipping_notification(fresh))
        return shipping_info
    except Exception as ex:
        logging.error("auto label failed for %s: %s", order["order_number"], ex)
        return None


async def _auto_label_paid_orders_once() -> int:
    cursor = s.db.orders.find(
        {
            "payment_status": "paid",
            "fulfillment_status": {"$in": ["processing", "pending"]},
            "shipping_info.label_url": {"$in": [None, ""]},
            "shipping_info.tracking_number": {"$in": [None, ""]},
        },
        {"_id": 0, "id": 1},
    ).sort("paid_at", 1)
    n = 0
    async for order in cursor:
        result = await _auto_create_dispatch_label(order["id"])
        if result:
            n += 1
    return n


async def _auto_label_paid_orders_watchdog() -> None:
    while True:
        try:
            count = await _auto_label_paid_orders_once()
            if count:
                logging.info("auto label watchdog: %d label(s) created", count)
        except Exception as ex:  # pragma: no cover
            logging.error("auto label watchdog failed: %s", ex)
        await asyncio.sleep(max(15, s.CANADA_POST_AUTO_LABEL_INTERVAL_SECONDS))


async def _auto_sync_delivered_orders_once(limit: int = 200) -> int:
    """Passe automatiquement en 'delivered' les commandes expédiées dont le
    repérage Canada Post confirme la livraison."""
    if not s.CANADA_POST_API_KEY:
        return 0
    rows = await s.db.orders.find(
        {
            "fulfillment_status": "shipped",
            "shipping_info.tracking_number": {"$nin": [None, ""]},
        },
        {"_id": 0, "id": 1, "order_number": 1, "shipping_info": 1},
    ).sort([
        ("shipping_info.delivery_checked_at", 1),
        ("shipping_info.shipped_at", 1),
    ]).to_list(max(1, min(limit, 1000)))

    updated = 0
    for order in rows:
        info = order.get("shipping_info") or {}
        pin = str(info.get("tracking_number") or "").strip()
        if not pin:
            continue

        checked_at = datetime.now(timezone.utc).isoformat()
        await s.db.orders.update_one(
            {"id": order["id"], "fulfillment_status": "shipped"},
            {"$set": {"shipping_info.delivery_checked_at": checked_at}},
        )

        live = await s._canada_post_track(pin)
        delivered, evidence = s._cp_tracking_indicates_delivered(live)
        source = "canada_post_tracking_auto"
        if not delivered:
            shipped_at = str(info.get("shipped_at") or "")
            if s._sandbox_fallback_ready(shipped_at):
                delivered = True
                evidence = "sandbox fallback after delay"
                source = "sandbox_time_fallback_auto"
        if not delivered:
            continue

        now = datetime.now(timezone.utc).isoformat()
        res = await s.db.orders.update_one(
            {"id": order["id"], "fulfillment_status": "shipped"},
            {
                "$set": {
                    "fulfillment_status": "delivered",
                    "shipping_info.delivered_at": now,
                    "shipping_info.delivery_checked_at": checked_at,
                    "shipping_info.delivery_source": source,
                },
                "$push": {
                    "notes": {
                        "id": str(uuid.uuid4()),
                        "text": f"Statut livré auto-confirmé par repérage Canada Post ({pin}) — {evidence or 'delivered'}.",
                        "author": "system",
                        "created_at": now,
                    }
                },
            },
        )
        if res.modified_count:
            updated += 1
    return updated


async def _auto_sync_delivered_orders_watchdog() -> None:
    while True:
        try:
            count = await _auto_sync_delivered_orders_once()
            if count:
                logging.info("auto delivery watchdog: %d order(s) marked delivered", count)
        except Exception as ex:  # pragma: no cover
            logging.error("auto delivery watchdog failed: %s", ex)
        await asyncio.sleep(max(60, s.CANADA_POST_AUTO_DELIVERY_SYNC_SECONDS))
