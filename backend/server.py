from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict


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


class ProductIn(BaseModel):
    slug: str
    name_en: str
    name_fr: str
    category: str  # healing | gh-secretagogues | weight-loss | cognitive | longevity
    sequence: Optional[str] = ""
    purity: str = "≥ 99%"
    dosage_mg: float
    description_en: str
    description_fr: str
    price_cad: float
    stock: int = 100
    image_url: str = ""
    lab_tested: bool = True
    active: bool = True


class ProductOut(ProductIn):
    id: str
    created_at: str


class CartItem(BaseModel):
    product_id: str
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
    payment_method: Literal["interac", "nowpayments"]
    pay_currency: Optional[str] = "btc"  # used only for nowpayments
    accept_terms: bool
    confirm_age: bool
    confirm_research_use: bool


# ---------------------------------------------------------------------------
# Tax rates by province (combined GST/HST/QST/PST for 2025-2026)
# ---------------------------------------------------------------------------
PROVINCE_TAX = {
    "AB": 0.05, "BC": 0.12, "MB": 0.12, "NB": 0.15, "NL": 0.15,
    "NS": 0.15, "NT": 0.05, "NU": 0.05, "ON": 0.13, "PE": 0.15,
    "QC": 0.14975, "SK": 0.11, "YT": 0.05,
}
SHIPPING_FLAT_CAD = 18.00


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
async def list_products(category: Optional[str] = None, q: Optional[str] = None):
    filt: dict = {"active": True}
    if category and category != "all":
        filt["category"] = category
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


@api.post("/admin/products")
async def admin_create_product(payload: ProductIn, _admin: dict = Depends(get_admin_user)):
    existing = await db.products.find_one({"slug": payload.slug})
    if existing:
        raise HTTPException(409, "Slug already exists")
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/products/{product_id}")
async def admin_update_product(product_id: str, payload: ProductIn, _admin: dict = Depends(get_admin_user)):
    update = payload.model_dump()
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
async def _build_order_totals(items: List[CartItem], province: str):
    line_items = []
    subtotal = 0.0
    for it in items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            raise HTTPException(400, f"Product {it.product_id} not found")
        if not p.get("active"):
            raise HTTPException(400, f"Product {p['name_en']} unavailable")
        line_total = round(p["price_cad"] * it.qty, 2)
        line_items.append({
            "product_id": p["id"],
            "slug": p["slug"],
            "name_en": p["name_en"],
            "name_fr": p["name_fr"],
            "price_cad": p["price_cad"],
            "qty": it.qty,
            "line_total": line_total,
            "image_url": p.get("image_url", ""),
        })
        subtotal += line_total
    subtotal = round(subtotal, 2)
    tax_rate = PROVINCE_TAX.get(province.upper(), 0.05)
    shipping = SHIPPING_FLAT_CAD
    tax = round(subtotal * tax_rate, 2)
    total = round(subtotal + tax + shipping, 2)
    return line_items, subtotal, tax_rate, tax, shipping, total


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


@api.post("/checkout")
async def checkout(payload: CheckoutIn, request: Request):
    if not (payload.accept_terms and payload.confirm_age and payload.confirm_research_use):
        raise HTTPException(400, "All compliance confirmations are required")
    if not payload.items:
        raise HTTPException(400, "Cart is empty")

    user = await _resolve_user(request)

    line_items, subtotal, tax_rate, tax, shipping, total = await _build_order_totals(
        payload.items, payload.shipping.province
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
    else:
        np = await _nowpayments_create(order_id, total, payload.pay_currency or "btc")
        payment_info = {"type": "nowpayments", "provider_response": np}
        payment_status = "awaiting_crypto"

    order_doc = {
        "id": order_id,
        "order_number": order_number,
        "user_id": user["id"] if user else None,
        "email": user["email"] if user else None,
        "items": line_items,
        "subtotal": subtotal,
        "tax_rate": tax_rate,
        "tax": tax,
        "shipping": shipping,
        "total": total,
        "currency": "CAD",
        "shipping_address": payload.shipping.model_dump(),
        "payment_method": payload.payment_method,
        "payment_status": payment_status,
        "payment_info": payment_info,
        "fulfillment_status": "pending",
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
    res = await db.orders.update_one({"id": order_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


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
        "revenue_cad": round(revenue, 2),
    }


# ---------------------------------------------------------------------------
# Public meta
# ---------------------------------------------------------------------------
@api.get("/meta")
async def meta():
    return {
        "store": "NORDPEP",
        "currency": "CAD",
        "shipping_flat_cad": SHIPPING_FLAT_CAD,
        "provinces": list(PROVINCE_TAX.keys()),
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
    for p in SEED_PRODUCTS:
        await db.products.update_one(
            {"slug": p["slug"]},
            {"$setOnInsert": {**p, "id": str(uuid.uuid4()),
                              "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )


@app.on_event("startup")
async def startup_event():
    await seed_admin_and_products()


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
