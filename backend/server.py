from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import uuid
import logging
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import httpx
import resend
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors as rl_colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days for ecommerce UX
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@nordpep.ca")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "NordpepAdmin2026!")
INTERAC_EMAIL = os.environ.get("INTERAC_EMAIL", "orders@nordpep.ca")
INTERAC_PASSWORD_HINT = os.environ.get("INTERAC_PASSWORD_HINT", "NORDPEP")
NOWPAYMENTS_API_KEY = os.environ.get("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_BASE_URL = "https://api.nowpayments.io/v1"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "orders@nordpep.ca")
ADMIN_NOTIFICATION_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "admin@nordpep.ca")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
SHIPPING_FLAT_CAD = float(os.environ.get("SHIPPING_FLAT_CAD", "20.00"))
FREE_SHIPPING_THRESHOLD_CAD = float(os.environ.get("FREE_SHIPPING_THRESHOLD_CAD", "200.00"))
UNPAID_ORDER_TTL_HOURS = float(os.environ.get("UNPAID_ORDER_TTL_HOURS", "48"))

try:
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    _STRIPE_AVAILABLE = True
except Exception:
    _STRIPE_AVAILABLE = False
    StripeCheckout = None
    CheckoutSessionRequest = None

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="NORDPEP API", version="1.0.0")
api = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Helpers: password & JWT
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_MINUTES * 60,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")


async def _resolve_user(request: Request) -> Optional[dict]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        return user
    except jwt.PyJWTError:
        return None


async def get_current_user(request: Request) -> dict:
    user = await _resolve_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def get_admin_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str
    created_at: str


class ProductVariant(BaseModel):
    id: Optional[str] = None  # generated server-side if missing
    name: str  # "5mg", "10mg", "500mcg"
    price: float
    stock: int = 0
    sku: str = ""
    badge_coa_available: bool = False
    badge_coa_pending: bool = False
    badge_coming_soon: bool = False
    preorder_enabled: bool = False
    preorder_delay_message: str = ""
    preorder_price: Optional[float] = None
    preorder_note: str = ""


class ProductIn(BaseModel):
    slug: str
    name_en: str
    name_fr: str
    category: str  # healing | gh-secretagogues | weight-loss | cognitive | longevity
    sequence: Optional[str] = ""
    purity: str = "≥ 99%"
    dosage_mg: float = 0.0  # informational only — variants drive actual pricing/stock
    description_en: str
    description_fr: str
    price_cad: float = 0.0  # legacy/fallback (= price of first variant)
    stock: int = 0  # legacy/fallback (= total across variants)
    low_stock_threshold: int = 10
    image_url: str = ""
    lab_tested: bool = True
    active: bool = True
    featured: bool = False
    preorder_allowed: bool = False  # legacy product-level (variants override)
    coa_url: Optional[str] = ""
    coa_lot: Optional[str] = ""
    coa_date: Optional[str] = ""
    variants: List[ProductVariant] = []


class ProductOut(ProductIn):
    id: str
    created_at: str


class CartItem(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    qty: int = Field(ge=1)


class ShippingAddress(BaseModel):
    full_name: str
    address1: str
    address2: Optional[str] = ""
    city: str
    province: str  # QC, ON, BC, AB, ...
    postal_code: str
    country: str = "CA"
    phone: Optional[str] = ""


class CheckoutIn(BaseModel):
    items: List[CartItem]
    shipping: ShippingAddress
    email: Optional[EmailStr] = None  # guest email; auth user's email is used if logged in
    payment_method: Literal["interac", "nowpayments", "stripe"]
    pay_currency: Optional[str] = "btc"  # used only for nowpayments
    coupon_code: Optional[str] = None
    origin_url: Optional[str] = None  # used by stripe to build success/cancel URLs
    accept_terms: bool
    confirm_age: bool
    confirm_research_use: bool


class CouponIn(BaseModel):
    code: str
    discount_type: Literal["percent", "fixed"]
    value: float = Field(gt=0)  # percent 1-100 or absolute CAD
    min_subtotal: float = 0.0
    usage_limit: Optional[int] = None  # None = unlimited
    active: bool = True
    expires_at: Optional[str] = None  # ISO string


class OrderNoteIn(BaseModel):
    text: str = Field(min_length=1)


class ShippingInfoIn(BaseModel):
    carrier: Optional[str] = ""
    tracking_number: Optional[str] = ""
    shipped_at: Optional[str] = None  # ISO; defaults to now() if not provided


class StockAdjustIn(BaseModel):
    delta: int  # positive to add, negative to subtract


class ShippingZoneIn(BaseModel):
    name: str
    countries: List[str] = []  # e.g., ["CA"], ["US"], ["INTL"]
    provinces: List[str] = []  # optional sub-region restriction (Canadian provinces)


class ShippingMethodIn(BaseModel):
    zone_id: str
    name: str  # e.g., "Canada Post Xpresspost", "Expedited", "International Tracked"
    cost_cad: float
    eta_days: str = ""  # e.g., "2-3 business days"
    active: bool = True


# ---------------------------------------------------------------------------
# Tax & shipping (no tax — shipping flat-rate)
# ---------------------------------------------------------------------------
PROVINCES_CA = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name.strip(),
        "password_hash": hash_password(payload.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], email, "user")
    set_auth_cookie(response, token)
    return {
        "id": user_doc["id"],
        "email": email,
        "name": user_doc["name"],
        "role": "user",
        "created_at": user_doc["created_at"],
        "token": token,
    }


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    set_auth_cookie(response, token)
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"],
        "token": token,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Product endpoints
# ---------------------------------------------------------------------------
@api.get("/products")
async def list_products(category: Optional[str] = None, q: Optional[str] = None, featured: Optional[bool] = None):
    filt: dict = {"active": True}
    if category and category != "all":
        filt["category"] = category
    if featured is True:
        filt["featured"] = True
    if q:
        filt["$or"] = [
            {"name_en": {"$regex": q, "$options": "i"}},
            {"name_fr": {"$regex": q, "$options": "i"}},
            {"slug": {"$regex": q, "$options": "i"}},
        ]
    products = await db.products.find(filt, {"_id": 0}).sort("name_en", 1).to_list(500)
    return products


@api.get("/products/{slug}")
async def get_product(slug: str):
    product = await db.products.find_one({"slug": slug}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    return product


def _ensure_variant_ids(payload_doc: dict) -> dict:
    """Ensure every variant has an id. Sync legacy price_cad/stock from first variant if variants present."""
    variants = payload_doc.get("variants") or []
    out_variants = []
    for v in variants:
        v = dict(v)
        if not v.get("id"):
            v["id"] = str(uuid.uuid4())
        out_variants.append(v)
    payload_doc["variants"] = out_variants
    # Sync legacy fields for backward compat / cart fallback
    if out_variants:
        payload_doc["price_cad"] = float(out_variants[0].get("price", 0.0))
        payload_doc["stock"] = sum(int(v.get("stock", 0)) for v in out_variants)
    return payload_doc


@api.post("/admin/products")
async def admin_create_product(payload: ProductIn, _admin: dict = Depends(get_admin_user)):
    existing = await db.products.find_one({"slug": payload.slug})
    if existing:
        raise HTTPException(409, "Slug already exists")
    doc = payload.model_dump()
    doc = _ensure_variant_ids(doc)
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/products/{product_id}")
async def admin_update_product(product_id: str, payload: ProductIn, _admin: dict = Depends(get_admin_user)):
    update = payload.model_dump()
    update = _ensure_variant_ids(update)
    res = await db.products.update_one({"id": product_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, _admin: dict = Depends(get_admin_user)):
    res = await db.products.delete_one({"id": product_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Product not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Order / Checkout
# ---------------------------------------------------------------------------
def _resolve_variant(p: dict, variant_id: Optional[str]) -> dict:
    """Return the selected variant subdoc. Falls back to first variant or builds a synthetic one from legacy fields."""
    variants = p.get("variants") or []
    if variant_id:
        for v in variants:
            if v.get("id") == variant_id:
                return v
        raise HTTPException(400, f"Variant {variant_id} not found for product {p['slug']}")
    if variants:
        return variants[0]
    # Legacy synthetic variant
    return {
        "id": "_default",
        "name": f"{p.get('dosage_mg', 0)}mg" if p.get("dosage_mg") else "Default",
        "price": p.get("price_cad", 0.0),
        "stock": p.get("stock", 0),
        "sku": p["slug"].upper(),
        "preorder_enabled": p.get("preorder_allowed", False),
        "preorder_delay_message": "",
        "preorder_price": None,
        "preorder_note": "",
        "badge_coa_available": bool(p.get("coa_url")),
        "badge_coa_pending": not bool(p.get("coa_url")),
        "badge_coming_soon": False,
    }


def _variant_effective_price(v: dict, is_preorder: bool) -> float:
    if is_preorder and v.get("preorder_price"):
        return float(v["preorder_price"])
    return float(v.get("price", 0.0))


async def _build_order_totals(items: List[CartItem], coupon_code: Optional[str] = None):
    line_items = []
    subtotal = 0.0
    has_preorder = False
    for it in items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            raise HTTPException(400, f"Product {it.product_id} not found")
        if not p.get("active"):
            raise HTTPException(400, f"Product {p['name_en']} unavailable")

        v = _resolve_variant(p, it.variant_id)
        is_preorder = False
        if v.get("stock", 0) < it.qty:
            if v.get("preorder_enabled") or p.get("preorder_allowed"):
                is_preorder = True
                has_preorder = True
            else:
                raise HTTPException(400, f"Insufficient stock for {p['name_en']} ({v.get('name','')})")

        unit_price = _variant_effective_price(v, is_preorder)
        line_total = round(unit_price * it.qty, 2)
        line_items.append({
            "product_id": p["id"],
            "variant_id": v.get("id"),
            "variant_name": v.get("name", ""),
            "slug": p["slug"],
            "sku": v.get("sku", p["slug"].upper()),
            "name_en": p["name_en"],
            "name_fr": p["name_fr"],
            "price_cad": unit_price,
            "qty": it.qty,
            "line_total": line_total,
            "image_url": p.get("image_url", ""),
            "preorder": is_preorder,
        })
        subtotal += line_total
    subtotal = round(subtotal, 2)

    # Apply coupon (unchanged logic)
    discount = 0.0
    applied_coupon = None
    if coupon_code:
        coupon = await db.coupons.find_one({"code": coupon_code.upper().strip()}, {"_id": 0})
        if not coupon or not coupon.get("active"):
            raise HTTPException(400, "Invalid coupon code")
        if coupon.get("expires_at"):
            try:
                if datetime.fromisoformat(coupon["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
                    raise HTTPException(400, "Coupon expired")
            except ValueError:
                pass
        if coupon.get("usage_limit") and coupon.get("used_count", 0) >= coupon["usage_limit"]:
            raise HTTPException(400, "Coupon usage limit reached")
        if subtotal < coupon.get("min_subtotal", 0):
            raise HTTPException(400, f"Minimum subtotal of ${coupon['min_subtotal']:.2f} required for this coupon")
        if coupon["discount_type"] == "percent":
            discount = round(subtotal * (coupon["value"] / 100.0), 2)
        else:
            discount = round(min(coupon["value"], subtotal), 2)
        applied_coupon = {"code": coupon["code"], "discount_type": coupon["discount_type"], "value": coupon["value"], "discount_amount": discount}

    tax_rate = 0.0
    shipping = 0.0 if (subtotal - discount) >= FREE_SHIPPING_THRESHOLD_CAD else SHIPPING_FLAT_CAD
    tax = 0.0
    total = round(max(0, subtotal - discount) + shipping, 2)
    return line_items, subtotal, tax_rate, tax, shipping, total, discount, applied_coupon, has_preorder


async def _nowpayments_create(order_id: str, total_cad: float, pay_currency: str):
    """Create a NOWPayments invoice. Falls back to mock if no API key."""
    if not NOWPAYMENTS_API_KEY:
        return {
            "mock": True,
            "payment_id": f"mock-{order_id[:8]}",
            "pay_address": "TEST_ADDRESS_CONFIGURE_NOWPAYMENTS_API_KEY",
            "pay_amount": round(total_cad / 60000, 8) if pay_currency == "btc" else round(total_cad / 3500, 6),
            "pay_currency": pay_currency,
            "order_id": order_id,
            "payment_status": "waiting",
        }
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.post(
                f"{NOWPAYMENTS_BASE_URL}/payment",
                headers={"x-api-key": NOWPAYMENTS_API_KEY, "Content-Type": "application/json"},
                json={
                    "price_amount": total_cad,
                    "price_currency": "cad",
                    "pay_currency": pay_currency,
                    "order_id": order_id,
                    "order_description": f"NORDPEP order {order_id}",
                },
            )
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logging.error("NOWPayments error: %s", e)
        raise HTTPException(502, "Crypto payment provider unavailable")


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
        <div style="background:#fef2f2;border:2px solid #E51919;padding:20px;margin:24px 0">
          <div style="font-family:monospace;font-size:11px;letter-spacing:2px;color:#E51919;font-weight:bold;margin-bottom:12px">⚡ INTERAC E-TRANSFER INSTRUCTIONS</div>
          <table style="width:100%;font-family:monospace;font-size:13px">
            <tr><td style="padding:6px 0;color:#666">Send to:</td><td style="padding:6px 0;font-weight:bold">{interac["send_to"]}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Amount:</td><td style="padding:6px 0;font-weight:bold">${interac["amount_cad"]:.2f} CAD</td></tr>
            <tr><td style="padding:6px 0;color:#666">Reference (required):</td><td style="padding:6px 0;font-weight:bold;color:#E51919">{interac["reference"]}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Security question:</td><td style="padding:6px 0">{interac["security_question"]}</td></tr>
            <tr><td style="padding:6px 0;color:#666">Security answer:</td><td style="padding:6px 0;font-weight:bold">{interac["security_answer_hint"]}</td></tr>
          </table>
        </div>"""
    elif np_info:
        mock_warning = ""
        if np_info.get("mock"):
            mock_warning = '<div style="background:#fffbe6;border:1px solid #FFCC00;padding:10px;margin-bottom:12px;font-size:12px">⚠ DEMO MODE — Configure NOWPAYMENTS_API_KEY for live crypto payments.</div>'
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
    <tr><td style="background:#050505;color:#fff;padding:20px 28px;font-family:monospace;font-size:11px;letter-spacing:3px">// NORDPEP · ORDER {order["order_number"]}</td></tr>
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
    <tr><td style="background:#050505;color:#fff;padding:14px 28px;font-family:monospace;font-size:10px;letter-spacing:2px">NORDPEP · CANADA · {datetime.now(timezone.utc).strftime("%Y")}</td></tr>
  </table>
</body></html>"""


async def _send_email(to: str | list, subject: str, html: str) -> None:
    """Sends via Resend; logs and continues silently on any failure (no API key, send error, etc.)."""
    to_list = to if isinstance(to, list) else [to]
    if not RESEND_API_KEY:
        logging.info("[email-log] would send to %s subj=%r (no RESEND_API_KEY configured)", to_list, subject)
        return
    try:
        params = {"from": SENDER_EMAIL, "to": to_list, "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info("[email] sent id=%s to=%s", result.get("id") if isinstance(result, dict) else result, to_list)
    except Exception as e:
        logging.error("[email] failed to send to=%s err=%s", to_list, e)


async def send_order_confirmation(order: dict) -> None:
    if not order.get("email"):
        logging.info("[email] skip customer confirm: no email on order %s", order["order_number"])
    else:
        html = _order_email_html(order, "Order received")
        await _send_email(order["email"], f"NORDPEP — Order {order['order_number']} received", html)

    # Admin notification
    admin_html = _order_email_html(order, "New order received")
    await _send_email(
        ADMIN_NOTIFICATION_EMAIL,
        f"[NORDPEP ADMIN] New order {order['order_number']} — ${order['total']:.2f} CAD",
        admin_html,
    )


async def send_payment_received(order: dict) -> None:
    if not order.get("email"):
        logging.info("[email] skip payment-received: no email on order %s", order["order_number"])
        return
    html = _order_email_html(order, "Payment received")
    await _send_email(order["email"], f"NORDPEP — Payment received for {order['order_number']}", html)


@api.post("/checkout")
async def checkout(payload: CheckoutIn, request: Request):
    if not (payload.accept_terms and payload.confirm_age and payload.confirm_research_use):
        raise HTTPException(400, "All compliance confirmations are required")
    if not payload.items:
        raise HTTPException(400, "Cart is empty")

    user = await _resolve_user(request)

    line_items, subtotal, tax_rate, tax, shipping, total, discount, applied_coupon, has_preorder = await _build_order_totals(
        payload.items, payload.coupon_code
    )

    order_id = str(uuid.uuid4())
    order_number = f"NP-{datetime.now(timezone.utc).strftime('%y%m%d')}-{order_id[:6].upper()}"

    payment_info: dict = {}
    if payload.payment_method == "interac":
        payment_info = {
            "type": "interac",
            "instructions": {
                "send_to": INTERAC_EMAIL,
                "amount_cad": total,
                "reference": order_number,
                "security_question": "What is the brand name? (lowercase)",
                "security_answer_hint": INTERAC_PASSWORD_HINT.lower(),
            },
        }
        payment_status = "awaiting_etransfer"
    elif payload.payment_method == "stripe":
        if not _STRIPE_AVAILABLE or not STRIPE_API_KEY:
            raise HTTPException(503, "Stripe not configured")
        origin = (payload.origin_url or "").rstrip("/")
        if not origin:
            raise HTTPException(400, "origin_url is required for Stripe checkout")
        success_url = f"{origin}/order/{order_id}?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/checkout"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/webhook/stripe")
        try:
            req = CheckoutSessionRequest(
                amount=float(total),
                currency="cad",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={"order_id": order_id, "order_number": order_number,
                          "user_id": user["id"] if user else "guest"},
            )
            session = await stripe_checkout.create_checkout_session(req)
        except Exception as e:
            logging.error("Stripe checkout session error: %s", e)
            raise HTTPException(502, "Stripe checkout unavailable")
        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "session_id": session.session_id,
            "amount": total,
            "currency": "cad",
            "metadata": {"order_number": order_number},
            "payment_status": "pending",
            "status": "initiated",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        payment_info = {
            "type": "stripe",
            "session_id": session.session_id,
            "checkout_url": session.url,
        }
        payment_status = "awaiting_stripe"
    else:
        np = await _nowpayments_create(order_id, total, payload.pay_currency or "btc")
        payment_info = {"type": "nowpayments", "provider_response": np}
        payment_status = "awaiting_crypto"

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "user_id": user["id"] if user else None,
        "email": (user["email"] if user else None) or (payload.email.lower() if payload.email else None),
        "items": line_items,
        "subtotal": subtotal,
        "discount": discount,
        "coupon": applied_coupon,
        "tax_rate": tax_rate,
        "tax": tax,
        "shipping": shipping,
        "total": total,
        "currency": "CAD",
        "shipping_address": payload.shipping.model_dump(),
        "shipping_info": {"carrier": "", "tracking_number": "", "shipped_at": None},
        "payment_method": payload.payment_method,
        "payment_status": payment_status,
        "payment_info": payment_info,
        "fulfillment_status": "preorder" if has_preorder else "pending",
        "has_preorder": has_preorder,
        "notes": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "compliance": {
            "accept_terms": True,
            "confirm_age": True,
            "confirm_research_use": True,
            "ip": request.client.host if request.client else None,
        },
    }
    await db.orders.insert_one(order_doc)
    order_doc.pop("_id", None)

    # Decrement variant stock for available units (preorder items don't decrement below 0)
    for it in line_items:
        if it.get("preorder") or it.get("variant_id") == "_default":
            # Legacy/synthetic — fall back to product-level stock decrement
            if not it.get("preorder"):
                await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": -it["qty"]}})
            continue
        await db.products.update_one(
            {"id": it["product_id"], "variants.id": it["variant_id"]},
            {"$inc": {"variants.$.stock": -it["qty"]}},
        )

    # Track coupon usage
    if applied_coupon:
        await db.coupons.update_one({"code": applied_coupon["code"]}, {"$inc": {"used_count": 1}})

    # Fire-and-forget order confirmation + admin notification
    asyncio.create_task(send_order_confirmation(order_doc))

    return order_doc


@api.get("/orders/mine")
async def my_orders(user: dict = Depends(get_current_user)):
    items = await db.orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    # Anonymous orders are visible if order_id known; owned orders require auth match or admin
    user = await _resolve_user(request)
    if order.get("user_id"):
        if not user or (user["id"] != order["user_id"] and user.get("role") != "admin"):
            raise HTTPException(403, "Forbidden")
    return order


@api.get("/admin/orders")
async def admin_orders(_admin: dict = Depends(get_admin_user)):
    return await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.put("/admin/orders/{order_id}/status")
async def admin_update_order(
    order_id: str,
    payment_status: Optional[str] = None,
    fulfillment_status: Optional[str] = None,
    _admin: dict = Depends(get_admin_user),
):
    update: dict = {}
    if payment_status:
        update["payment_status"] = payment_status
    if fulfillment_status:
        update["fulfillment_status"] = fulfillment_status
    if not update:
        raise HTTPException(400, "No fields to update")

    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Order not found")

    # Auto-transition: when payment becomes paid, move fulfillment to processing
    if (
        payment_status == "paid"
        and existing.get("payment_status") != "paid"
        and existing.get("fulfillment_status") in ("pending", "preorder", None)
    ):
        update["fulfillment_status"] = "processing"

    await db.orders.update_one({"id": order_id}, {"$set": update})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})

    # Trigger payment-received email when payment transitions to "paid"
    if (
        payment_status == "paid"
        and existing.get("payment_status") != "paid"
        and updated.get("email")
    ):
        asyncio.create_task(send_payment_received(updated))

    return updated


@api.post("/admin/orders/{order_id}/confirm-payment")
async def admin_confirm_payment(order_id: str, _admin: dict = Depends(get_admin_user)):
    """One-click 'Mark as Paid' — atomically marks order as paid + processing + sends email."""
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Order not found")
    if existing.get("payment_status") == "paid":
        return existing  # idempotent
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": "paid",
            "fulfillment_status": "processing",
            "paid_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if updated.get("email"):
        asyncio.create_task(send_payment_received(updated))
    return updated


@api.get("/admin/customers")
async def admin_customers(_admin: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users


@api.get("/admin/stats")
async def admin_stats(_admin: dict = Depends(get_admin_user)):
    total_orders = await db.orders.count_documents({})
    pending = await db.orders.count_documents({"fulfillment_status": "pending"})
    paid = await db.orders.count_documents({"payment_status": "paid"})
    users = await db.users.count_documents({"role": "user"})
    products = await db.products.count_documents({})
    low_stock = await db.products.count_documents(
        {"$expr": {"$lte": ["$stock", {"$ifNull": ["$low_stock_threshold", 10]}]}, "active": True}
    )
    revenue_cursor = db.orders.aggregate([
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ])
    revenue_doc = await revenue_cursor.to_list(1)
    revenue = revenue_doc[0]["total"] if revenue_doc else 0
    return {
        "total_orders": total_orders,
        "pending_orders": pending,
        "paid_orders": paid,
        "customers": users,
        "products": products,
        "low_stock": low_stock,
        "revenue_cad": round(revenue, 2),
    }


# ---------------------------------------------------------------------------
# Admin — order notes & shipping & stock
# ---------------------------------------------------------------------------
@api.post("/admin/orders/{order_id}/notes")
async def admin_add_order_note(order_id: str, payload: OrderNoteIn, admin: dict = Depends(get_admin_user)):
    note = {
        "text": payload.text,
        "admin_email": admin["email"],
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.orders.update_one({"id": order_id}, {"$push": {"notes": note}})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api.put("/admin/orders/{order_id}/shipping")
async def admin_set_shipping_info(order_id: str, payload: ShippingInfoIn, _admin: dict = Depends(get_admin_user)):
    shipped_at = payload.shipped_at or (datetime.now(timezone.utc).isoformat() if payload.tracking_number else None)
    shipping_info = {
        "carrier": payload.carrier or "",
        "tracking_number": payload.tracking_number or "",
        "shipped_at": shipped_at,
    }
    update = {"shipping_info": shipping_info}
    if payload.tracking_number:
        update["fulfillment_status"] = "shipped"
    res = await db.orders.update_one({"id": order_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api.put("/admin/products/{product_id}/stock")
async def admin_adjust_stock(product_id: str, payload: StockAdjustIn, _admin: dict = Depends(get_admin_user)):
    res = await db.products.update_one({"id": product_id}, {"$inc": {"stock": payload.delta}})
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    return await db.products.find_one({"id": product_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Admin — coupons
# ---------------------------------------------------------------------------
@api.get("/admin/coupons")
async def admin_list_coupons(_admin: dict = Depends(get_admin_user)):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/coupons")
async def admin_create_coupon(payload: CouponIn, _admin: dict = Depends(get_admin_user)):
    code = payload.code.upper().strip()
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(409, "Coupon code already exists")
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "discount_type": payload.discount_type,
        "value": payload.value,
        "min_subtotal": payload.min_subtotal,
        "usage_limit": payload.usage_limit,
        "used_count": 0,
        "active": payload.active,
        "expires_at": payload.expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/coupons/{coupon_id}")
async def admin_update_coupon(coupon_id: str, payload: CouponIn, _admin: dict = Depends(get_admin_user)):
    update = payload.model_dump()
    update["code"] = update["code"].upper().strip()
    res = await db.coupons.update_one({"id": coupon_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Coupon not found")
    return await db.coupons.find_one({"id": coupon_id}, {"_id": 0})


@api.delete("/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, _admin: dict = Depends(get_admin_user)):
    res = await db.coupons.delete_one({"id": coupon_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Coupon not found")
    return {"ok": True}


@api.post("/coupons/validate")
async def validate_coupon(code: str, subtotal: float):
    coupon = await db.coupons.find_one({"code": code.upper().strip()}, {"_id": 0})
    if not coupon or not coupon.get("active"):
        raise HTTPException(400, "Invalid coupon code")
    if coupon.get("expires_at"):
        try:
            if datetime.fromisoformat(coupon["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
                raise HTTPException(400, "Coupon expired")
        except ValueError:
            pass
    if coupon.get("usage_limit") and coupon.get("used_count", 0) >= coupon["usage_limit"]:
        raise HTTPException(400, "Coupon usage limit reached")
    if subtotal < coupon.get("min_subtotal", 0):
        raise HTTPException(400, f"Minimum subtotal of ${coupon['min_subtotal']:.2f} required")
    if coupon["discount_type"] == "percent":
        discount = round(subtotal * (coupon["value"] / 100.0), 2)
    else:
        discount = round(min(coupon["value"], subtotal), 2)
    return {"code": coupon["code"], "discount_type": coupon["discount_type"],
            "value": coupon["value"], "discount_amount": discount, "min_subtotal": coupon.get("min_subtotal", 0)}


# ---------------------------------------------------------------------------
# Admin — shipping zones & methods
# ---------------------------------------------------------------------------
@api.get("/admin/shipping/zones")
async def admin_list_zones(_admin: dict = Depends(get_admin_user)):
    zones = await db.shipping_zones.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    # attach methods
    out = []
    for z in zones:
        methods = await db.shipping_methods.find({"zone_id": z["id"]}, {"_id": 0}).to_list(200)
        z["methods"] = methods
        out.append(z)
    return out


@api.post("/admin/shipping/zones")
async def admin_create_zone(payload: ShippingZoneIn, _admin: dict = Depends(get_admin_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.shipping_zones.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/shipping/zones/{zone_id}")
async def admin_update_zone(zone_id: str, payload: ShippingZoneIn, _admin: dict = Depends(get_admin_user)):
    res = await db.shipping_zones.update_one({"id": zone_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Zone not found")
    return await db.shipping_zones.find_one({"id": zone_id}, {"_id": 0})


@api.delete("/admin/shipping/zones/{zone_id}")
async def admin_delete_zone(zone_id: str, _admin: dict = Depends(get_admin_user)):
    await db.shipping_methods.delete_many({"zone_id": zone_id})
    res = await db.shipping_zones.delete_one({"id": zone_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Zone not found")
    return {"ok": True}


@api.post("/admin/shipping/methods")
async def admin_create_method(payload: ShippingMethodIn, _admin: dict = Depends(get_admin_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.shipping_methods.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/shipping/methods/{method_id}")
async def admin_update_method(method_id: str, payload: ShippingMethodIn, _admin: dict = Depends(get_admin_user)):
    res = await db.shipping_methods.update_one({"id": method_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Method not found")
    return await db.shipping_methods.find_one({"id": method_id}, {"_id": 0})


@api.delete("/admin/shipping/methods/{method_id}")
async def admin_delete_method(method_id: str, _admin: dict = Depends(get_admin_user)):
    res = await db.shipping_methods.delete_one({"id": method_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Method not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin — Analytics
# ---------------------------------------------------------------------------
@api.get("/admin/analytics")
async def admin_analytics(_admin: dict = Depends(get_admin_user)):
    # Revenue per day (last 30 days)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    daily_cursor = db.orders.aggregate([
        {"$match": {"payment_status": "paid", "created_at": {"$gte": since}}},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "revenue": {"$sum": "$total"},
            "orders": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ])
    daily = await daily_cursor.to_list(60)
    daily = [{"date": d["_id"], "revenue": round(d["revenue"], 2), "orders": d["orders"]} for d in daily]

    # Top products
    top_cursor = db.orders.aggregate([
        {"$match": {"payment_status": "paid"}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.slug",
            "name_en": {"$first": "$items.name_en"},
            "units_sold": {"$sum": "$items.qty"},
            "revenue": {"$sum": "$items.line_total"},
        }},
        {"$sort": {"units_sold": -1}},
        {"$limit": 10},
    ])
    top = await top_cursor.to_list(10)
    top = [{"slug": t["_id"], "name_en": t["name_en"], "units_sold": t["units_sold"], "revenue": round(t["revenue"], 2)} for t in top]

    # Recent orders
    recent = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)

    return {"daily_revenue": daily, "top_products": top, "recent_orders": recent}


# ---------------------------------------------------------------------------
# Admin — CSV exports
# ---------------------------------------------------------------------------
def _csv_response(rows: list, filename: str) -> StreamingResponse:
    buf = io.StringIO()
    if not rows:
        buf.write("\n")
    else:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.get("/admin/orders.csv")
async def admin_orders_csv(_admin: dict = Depends(get_admin_user)):
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    rows = []
    for o in orders:
        addr = o.get("shipping_address", {})
        rows.append({
            "order_number": o.get("order_number", ""),
            "created_at": o.get("created_at", ""),
            "email": o.get("email") or "",
            "customer": addr.get("full_name", ""),
            "city": addr.get("city", ""),
            "province": addr.get("province", ""),
            "postal_code": addr.get("postal_code", ""),
            "country": addr.get("country", ""),
            "payment_method": o.get("payment_method", ""),
            "payment_status": o.get("payment_status", ""),
            "fulfillment_status": o.get("fulfillment_status", ""),
            "items_count": len(o.get("items", [])),
            "subtotal_cad": o.get("subtotal", 0),
            "discount_cad": o.get("discount", 0),
            "shipping_cad": o.get("shipping", 0),
            "total_cad": o.get("total", 0),
            "tracking_number": (o.get("shipping_info") or {}).get("tracking_number", ""),
            "carrier": (o.get("shipping_info") or {}).get("carrier", ""),
        })
    return _csv_response(rows, f"nordpep-orders-{datetime.now().strftime('%Y%m%d')}.csv")


@api.get("/admin/products.csv")
async def admin_products_csv(_admin: dict = Depends(get_admin_user)):
    products = await db.products.find({}, {"_id": 0}).sort("name_en", 1).to_list(2000)
    rows = []
    for p in products:
        rows.append({
            "slug": p.get("slug", ""),
            "name_en": p.get("name_en", ""),
            "name_fr": p.get("name_fr", ""),
            "category": p.get("category", ""),
            "sequence": p.get("sequence", ""),
            "purity": p.get("purity", ""),
            "dosage_mg": p.get("dosage_mg", 0),
            "price_cad": p.get("price_cad", 0),
            "stock": p.get("stock", 0),
            "low_stock_threshold": p.get("low_stock_threshold", 10),
            "featured": p.get("featured", False),
            "preorder_allowed": p.get("preorder_allowed", False),
            "lab_tested": p.get("lab_tested", False),
            "coa_url": p.get("coa_url", ""),
            "coa_lot": p.get("coa_lot", ""),
            "coa_date": p.get("coa_date", ""),
            "active": p.get("active", True),
        })
    return _csv_response(rows, f"nordpep-products-{datetime.now().strftime('%Y%m%d')}.csv")


# ---------------------------------------------------------------------------
# PDF Invoice
# ---------------------------------------------------------------------------
def _generate_invoice_pdf(order: dict) -> bytes:
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=LETTER)
    w, h = LETTER

    # Header band
    c.setFillColor(rl_colors.black)
    c.rect(0, h - 18 * mm, w, 18 * mm, fill=1, stroke=0)
    c.setFillColor(rl_colors.white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, h - 13 * mm, "NORDPEP")
    c.setFillColor(rl_colors.HexColor("#E51919"))
    c.circle(20 * mm + 41 * mm, h - 13 * mm + 1.5 * mm, 1.5 * mm, fill=1, stroke=0)
    c.setFillColor(rl_colors.white)
    c.setFont("Courier", 8)
    c.drawRightString(w - 20 * mm, h - 9 * mm, "// INVOICE")
    c.drawRightString(w - 20 * mm, h - 14 * mm, f"ORDER {order.get('order_number','')}")

    # Meta
    y = h - 30 * mm
    c.setFillColor(rl_colors.black)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, y, "INVOICE")
    c.setFont("Helvetica", 9)
    y -= 6 * mm
    c.drawString(20 * mm, y, f"Order #: {order.get('order_number','')}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Date: {(order.get('created_at') or '')[:10]}")
    y -= 4 * mm
    c.drawString(20 * mm, y, f"Status: {order.get('payment_status','')} / {order.get('fulfillment_status','')}")

    # Bill to
    addr = order.get("shipping_address") or {}
    c.setFont("Helvetica-Bold", 10)
    c.drawString(110 * mm, h - 36 * mm, "SHIP TO")
    c.setFont("Helvetica", 9)
    sy = h - 42 * mm
    for line in [
        addr.get("full_name", ""),
        addr.get("address1", ""),
        addr.get("address2", "") or None,
        f"{addr.get('city','')}, {addr.get('province','')} {addr.get('postal_code','')}",
        addr.get("country", ""),
        order.get("email") or "",
    ]:
        if line:
            c.drawString(110 * mm, sy, str(line))
            sy -= 4 * mm

    # Items table
    y -= 20 * mm
    c.setFillColor(rl_colors.black)
    c.rect(20 * mm, y - 1, w - 40 * mm, 7 * mm, fill=1, stroke=0)
    c.setFillColor(rl_colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(22 * mm, y + 1.5 * mm, "ITEM")
    c.drawString(110 * mm, y + 1.5 * mm, "QTY")
    c.drawRightString(150 * mm, y + 1.5 * mm, "UNIT")
    c.drawRightString(w - 22 * mm, y + 1.5 * mm, "TOTAL")
    y -= 6 * mm
    c.setFillColor(rl_colors.black)
    c.setFont("Helvetica", 9)
    for it in order.get("items", []):
        y -= 6 * mm
        c.drawString(22 * mm, y, f"{it.get('name_en','')} ({it.get('slug','')})")
        c.drawString(110 * mm, y, str(it.get("qty", 0)))
        c.drawRightString(150 * mm, y, f"${it.get('price_cad',0):.2f}")
        c.drawRightString(w - 22 * mm, y, f"${it.get('line_total',0):.2f}")
        c.setStrokeColor(rl_colors.HexColor("#e0e0e0"))
        c.line(20 * mm, y - 2 * mm, w - 20 * mm, y - 2 * mm)

    # Totals
    y -= 12 * mm
    c.setFont("Helvetica", 9)
    c.drawRightString(150 * mm, y, "Subtotal")
    c.drawRightString(w - 22 * mm, y, f"${order.get('subtotal',0):.2f}")
    if order.get("discount", 0) > 0:
        y -= 4 * mm
        c.drawRightString(150 * mm, y, f"Discount ({(order.get('coupon') or {}).get('code','')})")
        c.drawRightString(w - 22 * mm, y, f"-${order.get('discount',0):.2f}")
    y -= 4 * mm
    c.drawRightString(150 * mm, y, "Shipping")
    c.drawRightString(w - 22 * mm, y, f"${order.get('shipping',0):.2f}")
    y -= 6 * mm
    c.setStrokeColor(rl_colors.black)
    c.line(110 * mm, y + 2 * mm, w - 20 * mm, y + 2 * mm)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(150 * mm, y - 3 * mm, "TOTAL CAD")
    c.drawRightString(w - 22 * mm, y - 3 * mm, f"${order.get('total',0):.2f}")

    # Footer disclaimer
    c.setFont("Courier", 7)
    c.setFillColor(rl_colors.HexColor("#666666"))
    c.drawCentredString(w / 2, 20 * mm, "FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY")
    c.drawCentredString(w / 2, 16 * mm, f"NORDPEP · CANADA · INVOICE GENERATED {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf.getvalue()


@api.get("/orders/{order_id}/invoice.pdf")
async def order_invoice_pdf(order_id: str, request: Request):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    user = await _resolve_user(request)
    if order.get("user_id"):
        if not user or (user["id"] != order["user_id"] and user.get("role") != "admin"):
            raise HTTPException(403, "Forbidden")
    pdf = _generate_invoice_pdf(order)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="invoice-{order.get("order_number","order")}.pdf"'},
    )


@api.get("/payments/stripe/status/{session_id}")
async def stripe_status(session_id: str, request: Request):
    """Poll Stripe checkout session status. Updates payment_transactions + order atomically once paid."""
    if not _STRIPE_AVAILABLE or not STRIPE_API_KEY:
        raise HTTPException(503, "Stripe not configured")
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(404, "Session not found")
    # Idempotent: if already paid in our DB, return cached
    if txn.get("payment_status") == "paid":
        return {"session_id": session_id, "payment_status": "paid", "status": "complete"}

    origin = str(request.base_url).rstrip("/")
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/webhook/stripe")
    try:
        status_resp = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        logging.error("Stripe status err: %s", e)
        raise HTTPException(502, "Stripe status unavailable")

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"payment_status": status_resp.payment_status, "status": status_resp.status,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    # If paid and our order is not yet paid, mark it paid + processing + send email (idempotent)
    if status_resp.payment_status == "paid":
        order = await db.orders.find_one({"id": txn["order_id"]}, {"_id": 0})
        if order and order.get("payment_status") != "paid":
            await db.orders.update_one(
                {"id": txn["order_id"]},
                {"$set": {
                    "payment_status": "paid",
                    "fulfillment_status": "processing",
                    "paid_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            order = await db.orders.find_one({"id": txn["order_id"]}, {"_id": 0})
            if order.get("email"):
                asyncio.create_task(send_payment_received(order))
    return {
        "session_id": session_id,
        "payment_status": status_resp.payment_status,
        "status": status_resp.status,
        "amount_total": status_resp.amount_total,
        "currency": status_resp.currency,
    }


@api.get("/payments/crypto/status/{order_id}")
async def crypto_status(order_id: str):
    """Poll NOWPayments payment status. Marks order paid only when np status is 'finished'."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("payment_method") != "nowpayments":
        raise HTTPException(404, "Order not found")
    if order.get("payment_status") == "paid":
        return {"order_id": order_id, "payment_status": "paid", "np_status": "finished"}
    np_info = (order.get("payment_info") or {}).get("provider_response") or {}
    payment_id = np_info.get("payment_id")
    if not payment_id or np_info.get("mock"):
        return {"order_id": order_id, "payment_status": order.get("payment_status"), "np_status": "waiting", "mock": True}
    if not NOWPAYMENTS_API_KEY:
        raise HTTPException(503, "Crypto provider not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                f"{NOWPAYMENTS_BASE_URL}/payment/{payment_id}",
                headers={"x-api-key": NOWPAYMENTS_API_KEY},
            )
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logging.error("NOWPayments status err: %s", e)
        raise HTTPException(502, "Crypto status unavailable")
    np_status = data.get("payment_status", "waiting")
    if np_status != np_info.get("payment_status"):
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"payment_info.provider_response.payment_status": np_status}},
        )
    if np_status == "finished":
        res = await db.orders.update_one(
            {"id": order_id, "payment_status": {"$ne": "paid"}},
            {"$set": {
                "payment_status": "paid",
                "fulfillment_status": "processing",
                "paid_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        if res.modified_count:
            fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
            if fresh.get("email"):
                asyncio.create_task(send_payment_received(fresh))
        return {"order_id": order_id, "payment_status": "paid", "np_status": np_status}
    return {"order_id": order_id, "payment_status": order.get("payment_status"), "np_status": np_status}


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events to mark orders as paid."""
    if not _STRIPE_AVAILABLE or not STRIPE_API_KEY:
        return {"ok": False, "reason": "stripe_disabled"}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    origin = str(request.base_url).rstrip("/")
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/webhook/stripe")
    try:
        evt = await stripe_checkout.handle_webhook(body, sig)
    except Exception as e:
        logging.error("Stripe webhook err: %s", e)
        return {"ok": False}
    if evt.payment_status == "paid" and evt.session_id:
        txn = await db.payment_transactions.find_one({"session_id": evt.session_id})
        if txn:
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"payment_status": "paid", "status": "complete",
                          "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            order = await db.orders.find_one({"id": txn["order_id"]}, {"_id": 0})
            if order and order.get("payment_status") != "paid":
                await db.orders.update_one(
                    {"id": txn["order_id"]},
                    {"$set": {"payment_status": "paid", "fulfillment_status": "processing",
                              "paid_at": datetime.now(timezone.utc).isoformat()}},
                )
                order = await db.orders.find_one({"id": txn["order_id"]}, {"_id": 0})
                if order.get("email"):
                    asyncio.create_task(send_payment_received(order))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public meta
# ---------------------------------------------------------------------------
@api.get("/meta")
async def meta():
    return {
        "store": "NORDPEP",
        "currency": "CAD",
        "shipping_flat_cad": SHIPPING_FLAT_CAD,
        "provinces": PROVINCES_CA,
        "min_age": 19,
        "interac_email": INTERAC_EMAIL,
    }


@api.get("/")
async def root():
    return {"service": "nordpep-api", "status": "ok"}


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
SEED_PRODUCTS = [
    {
        "slug": "bpc-157-5mg",
        "name_en": "BPC-157",
        "name_fr": "BPC-157",
        "category": "healing",
        "sequence": "GEPPPGKPADDAGLV",
        "purity": "≥ 99.3%",
        "dosage_mg": 5.0,
        "description_en": "Body Protection Compound, a 15-amino-acid synthetic peptide derived from gastric protein. Widely studied in research models for tissue repair pathways.",
        "description_fr": "Composé de protection corporelle, peptide synthétique de 15 acides aminés dérivé d'une protéine gastrique. Étudié dans des modèles de recherche sur les voies de réparation tissulaire.",
        "price_cad": 64.99,
        "stock": 120,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "tb-500-5mg",
        "name_en": "TB-500",
        "name_fr": "TB-500",
        "category": "healing",
        "sequence": "Ac-SDKPDMAEI",
        "purity": "≥ 99.1%",
        "dosage_mg": 5.0,
        "description_en": "Synthetic fragment of Thymosin Beta-4. Investigated in research for actin sequestration and cellular migration studies.",
        "description_fr": "Fragment synthétique de la thymosine bêta-4. Étudié en recherche pour la séquestration de l'actine et les études de migration cellulaire.",
        "price_cad": 79.99,
        "stock": 90,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "semaglutide-5mg",
        "name_en": "Semaglutide",
        "name_fr": "Sémaglutide",
        "category": "weight-loss",
        "sequence": "GLP-1 analog",
        "purity": "≥ 99.0%",
        "dosage_mg": 5.0,
        "description_en": "GLP-1 receptor agonist analog under extensive research in metabolic studies.",
        "description_fr": "Analogue agoniste du récepteur GLP-1 largement étudié dans les recherches métaboliques.",
        "price_cad": 189.99,
        "stock": 60,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "tirzepatide-10mg",
        "name_en": "Tirzepatide",
        "name_fr": "Tirzépatide",
        "category": "weight-loss",
        "sequence": "Dual GIP/GLP-1",
        "purity": "≥ 99.2%",
        "dosage_mg": 10.0,
        "description_en": "Dual GIP and GLP-1 receptor agonist used in research for glucose and lipid pathway studies.",
        "description_fr": "Double agoniste des récepteurs GIP et GLP-1 utilisé en recherche sur le métabolisme du glucose et des lipides.",
        "price_cad": 259.99,
        "stock": 40,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "ipamorelin-5mg",
        "name_en": "Ipamorelin",
        "name_fr": "Ipamoréline",
        "category": "gh-secretagogues",
        "sequence": "Aib-His-D-2-Nal-D-Phe-Lys-NH2",
        "purity": "≥ 99.5%",
        "dosage_mg": 5.0,
        "description_en": "Selective growth hormone secretagogue used in pituitary research.",
        "description_fr": "Sécrétagogue sélectif de l'hormone de croissance utilisé en recherche hypophysaire.",
        "price_cad": 54.99,
        "stock": 150,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "cjc-1295-no-dac-5mg",
        "name_en": "CJC-1295 No-DAC",
        "name_fr": "CJC-1295 Sans-DAC",
        "category": "gh-secretagogues",
        "sequence": "DAC-modified GHRH",
        "purity": "≥ 99.0%",
        "dosage_mg": 5.0,
        "description_en": "GHRH analog used in research on growth hormone release pulses.",
        "description_fr": "Analogue de la GHRH utilisé en recherche sur les pulsations de libération de l'hormone de croissance.",
        "price_cad": 59.99,
        "stock": 110,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "selank-5mg",
        "name_en": "Selank",
        "name_fr": "Sélank",
        "category": "cognitive",
        "sequence": "TKPRPGP",
        "purity": "≥ 99.4%",
        "dosage_mg": 5.0,
        "description_en": "Heptapeptide investigated in cognitive and anxiolytic research models.",
        "description_fr": "Heptapeptide étudié dans les modèles de recherche cognitive et anxiolytique.",
        "price_cad": 74.99,
        "stock": 80,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "semax-10mg",
        "name_en": "Semax",
        "name_fr": "Sémax",
        "category": "cognitive",
        "sequence": "MEHFPGP",
        "purity": "≥ 99.0%",
        "dosage_mg": 10.0,
        "description_en": "ACTH-derived peptide studied in neuroprotective and cognitive research.",
        "description_fr": "Peptide dérivé de l'ACTH étudié en recherche neuroprotectrice et cognitive.",
        "price_cad": 89.99,
        "stock": 65,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "ghk-cu-50mg",
        "name_en": "GHK-Cu",
        "name_fr": "GHK-Cu",
        "category": "longevity",
        "sequence": "Gly-His-Lys + Cu²⁺",
        "purity": "≥ 99.0%",
        "dosage_mg": 50.0,
        "description_en": "Copper-binding tripeptide widely studied for skin and tissue research.",
        "description_fr": "Tripeptide liant le cuivre largement étudié en recherche sur la peau et les tissus.",
        "price_cad": 49.99,
        "stock": 200,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "epitalon-10mg",
        "name_en": "Epitalon",
        "name_fr": "Épitalon",
        "category": "longevity",
        "sequence": "Ala-Glu-Asp-Gly",
        "purity": "≥ 99.3%",
        "dosage_mg": 10.0,
        "description_en": "Tetrapeptide studied in telomere and pineal gland research models.",
        "description_fr": "Tétrapeptide étudié dans les modèles de recherche sur les télomères et la glande pinéale.",
        "price_cad": 69.99,
        "stock": 100,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "melanotan-ii-10mg",
        "name_en": "Melanotan II",
        "name_fr": "Mélanotan II",
        "category": "longevity",
        "sequence": "Cyclic α-MSH analog",
        "purity": "≥ 99.0%",
        "dosage_mg": 10.0,
        "description_en": "Synthetic analog of α-MSH studied in pigmentation research models.",
        "description_fr": "Analogue synthétique de l'α-MSH étudié dans les modèles de recherche sur la pigmentation.",
        "price_cad": 44.99,
        "stock": 130,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "pt-141-10mg",
        "name_en": "PT-141",
        "name_fr": "PT-141",
        "category": "longevity",
        "sequence": "Ac-Nle-c[Asp-His-D-Phe-Arg-Trp-Lys]-OH",
        "purity": "≥ 99.1%",
        "dosage_mg": 10.0,
        "description_en": "Bremelanotide, a melanocortin agonist studied in neurological response research.",
        "description_fr": "Brémélanotide, agoniste de la mélanocortine étudié dans la recherche sur la réponse neurologique.",
        "price_cad": 99.99,
        "stock": 75,
        "image_url": "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
        "lab_tested": True,
        "active": True,
    },
]


async def seed_admin_and_products():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.products.create_index("slug", unique=True)
    await db.orders.create_index("order_number")
    await db.orders.create_index("user_id")

    # Admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    hashed = hash_password(ADMIN_PASSWORD)
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower(),
            "name": "NORDPEP Admin",
            "password_hash": hashed,
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one({"email": ADMIN_EMAIL.lower()},
                                  {"$set": {"password_hash": hashed, "role": "admin"}})

    # Products
    featured_slugs = {"bpc-157-5mg", "semaglutide-5mg", "tirzepatide-10mg", "ipamorelin-5mg", "ghk-cu-50mg", "epitalon-10mg"}
    for p in SEED_PRODUCTS:
        default_variant = {
            "id": str(uuid.uuid4()),
            "name": f"{p['dosage_mg']}mg",
            "price": p["price_cad"],
            "stock": p["stock"],
            "sku": p["slug"].upper(),
            "badge_coa_available": True,
            "badge_coa_pending": False,
            "badge_coming_soon": False,
            "preorder_enabled": False,
            "preorder_delay_message": "",
            "preorder_price": None,
            "preorder_note": "",
        }
        defaults = {
            **p,
            "id": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "featured": p["slug"] in featured_slugs,
            "preorder_allowed": False,
            "low_stock_threshold": 10,
            "coa_url": "",
            "coa_lot": "",
            "coa_date": "",
            "variants": [default_variant],
        }
        await db.products.update_one({"slug": p["slug"]}, {"$setOnInsert": defaults}, upsert=True)
        # Backfill featured / new fields on existing docs
        await db.products.update_one(
            {"slug": p["slug"]},
            {"$set": {"featured": p["slug"] in featured_slugs}},
        )
        for field, value in {"preorder_allowed": False, "low_stock_threshold": 10,
                              "coa_url": "", "coa_lot": "", "coa_date": ""}.items():
            await db.products.update_one(
                {"slug": p["slug"], field: {"$exists": False}},
                {"$set": {field: value}},
            )
        # Ensure at least one variant exists on legacy products
        await db.products.update_one(
            {"slug": p["slug"], "$or": [{"variants": {"$exists": False}}, {"variants": []}]},
            {"$set": {"variants": [default_variant]}},
        )

    # Default shipping zone: Canada
    if await db.shipping_zones.count_documents({}) == 0:
        canada_zone_id = str(uuid.uuid4())
        await db.shipping_zones.insert_one({
            "id": canada_zone_id,
            "name": "Canada",
            "countries": ["CA"],
            "provinces": PROVINCES_CA,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        intl_zone_id = str(uuid.uuid4())
        await db.shipping_zones.insert_one({
            "id": intl_zone_id,
            "name": "International",
            "countries": ["INTL"],
            "provinces": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.shipping_methods.insert_many([
            {
                "id": str(uuid.uuid4()),
                "zone_id": canada_zone_id,
                "name": "Canada Post Xpresspost",
                "cost_cad": 20.0,
                "eta_days": "2-3 business days",
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "zone_id": canada_zone_id,
                "name": "Canada Post Expedited",
                "cost_cad": 12.0,
                "eta_days": "5-7 business days",
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "zone_id": intl_zone_id,
                "name": "International Tracked",
                "cost_cad": 45.0,
                "eta_days": "10-20 business days",
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ])


async def _restock_order_items(order: dict):
    for it in order.get("items", []):
        if it.get("preorder"):
            continue
        if it.get("variant_id") in (None, "", "_default"):
            await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": it["qty"]}})
            continue
        await db.products.update_one(
            {"id": it["product_id"], "variants.id": it["variant_id"]},
            {"$inc": {"variants.$.stock": it["qty"]}},
        )


async def cancel_stale_unpaid_orders():
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=UNPAID_ORDER_TTL_HOURS)).isoformat()
    stale = await db.orders.find(
        {
            "payment_status": {"$in": ["awaiting_etransfer", "awaiting_crypto", "awaiting_stripe"]},
            "created_at": {"$lt": cutoff},
        },
        {"_id": 0},
    ).to_list(500)
    for order in stale:
        note = {
            "id": str(uuid.uuid4()),
            "text": f"Auto-cancelled: payment not received within {int(UNPAID_ORDER_TTL_HOURS)}h",
            "author": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await db.orders.update_one(
            {"id": order["id"], "payment_status": order["payment_status"]},
            {"$set": {"payment_status": "cancelled", "fulfillment_status": "cancelled"},
             "$push": {"notes": note}},
        )
        if res.modified_count:
            await _restock_order_items(order)
            logging.info("Auto-cancelled unpaid order %s", order.get("order_number", order["id"]))
    return len(stale)


async def _unpaid_orders_watchdog():
    while True:
        try:
            await cancel_stale_unpaid_orders()
        except Exception as e:
            logging.error("Unpaid order watchdog error: %s", e)
        await asyncio.sleep(3600)


@app.on_event("startup")
async def startup_event():
    await seed_admin_and_products()
    asyncio.create_task(_unpaid_orders_watchdog())


@app.on_event("shutdown")
async def shutdown_event():
    client.close()


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,  # Using Bearer token from frontend; cookies SameSite=None still set as backup
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
