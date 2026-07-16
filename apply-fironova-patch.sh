#!/usr/bin/env bash
# =============================================================================
#  FIRONOVA — patch complet (22 fichiers)
#  securite · redesign · categories · menus · prelancement · Postes Canada
#  A COLLER DANS LE TERMINAL DU VS CODE EMERGENT (/app)
# =============================================================================
set -euo pipefail
APP="${APP_DIR:-/app}"; cd "$APP"
echo "==> Cible : $(pwd)"
[ -f backend/server.py ] || { echo "ERREUR: lance depuis /app (ou APP_DIR=...)" >&2; exit 1; }
STAMP=$(date +%Y%m%d-%H%M%S); BK=".backup-$STAMP"; mkdir -p "$BK"
echo "==> Sauvegarde -> $BK/"

[ -f "backend/server.py" ] && install -D "backend/server.py" "$BK/backend/server.py" || true
[ -f "design_guidelines.json" ] && install -D "design_guidelines.json" "$BK/design_guidelines.json" || true
[ -f "frontend/src/App.js" ] && install -D "frontend/src/App.js" "$BK/frontend/src/App.js" || true
[ -f "frontend/src/lib/api.js" ] && install -D "frontend/src/lib/api.js" "$BK/frontend/src/lib/api.js" || true
[ -f "frontend/src/lib/i18n.js" ] && install -D "frontend/src/lib/i18n.js" "$BK/frontend/src/lib/i18n.js" || true
[ -f "frontend/src/contexts/AuthContext.jsx" ] && install -D "frontend/src/contexts/AuthContext.jsx" "$BK/frontend/src/contexts/AuthContext.jsx" || true
[ -f "frontend/src/contexts/SiteConfigContext.jsx" ] && install -D "frontend/src/contexts/SiteConfigContext.jsx" "$BK/frontend/src/contexts/SiteConfigContext.jsx" || true
[ -f "frontend/src/pages/Account.jsx" ] && install -D "frontend/src/pages/Account.jsx" "$BK/frontend/src/pages/Account.jsx" || true
[ -f "frontend/src/pages/StaffAccept.jsx" ] && install -D "frontend/src/pages/StaffAccept.jsx" "$BK/frontend/src/pages/StaffAccept.jsx" || true
[ -f "frontend/src/pages/Home.jsx" ] && install -D "frontend/src/pages/Home.jsx" "$BK/frontend/src/pages/Home.jsx" || true
[ -f "frontend/src/pages/Catalog.jsx" ] && install -D "frontend/src/pages/Catalog.jsx" "$BK/frontend/src/pages/Catalog.jsx" || true
[ -f "frontend/src/pages/ComingSoon.jsx" ] && install -D "frontend/src/pages/ComingSoon.jsx" "$BK/frontend/src/pages/ComingSoon.jsx" || true
[ -f "frontend/src/pages/admin/AdminLayout.jsx" ] && install -D "frontend/src/pages/admin/AdminLayout.jsx" "$BK/frontend/src/pages/admin/AdminLayout.jsx" || true
[ -f "frontend/src/pages/admin/sections/AdminOrders.jsx" ] && install -D "frontend/src/pages/admin/sections/AdminOrders.jsx" "$BK/frontend/src/pages/admin/sections/AdminOrders.jsx" || true
[ -f "frontend/src/pages/admin/sections/AdminCategories.jsx" ] && install -D "frontend/src/pages/admin/sections/AdminCategories.jsx" "$BK/frontend/src/pages/admin/sections/AdminCategories.jsx" || true
[ -f "frontend/src/pages/admin/sections/AdminMenus.jsx" ] && install -D "frontend/src/pages/admin/sections/AdminMenus.jsx" "$BK/frontend/src/pages/admin/sections/AdminMenus.jsx" || true
[ -f "frontend/src/pages/admin/sections/AdminSubscribers.jsx" ] && install -D "frontend/src/pages/admin/sections/AdminSubscribers.jsx" "$BK/frontend/src/pages/admin/sections/AdminSubscribers.jsx" || true
[ -f "frontend/src/components/Header.jsx" ] && install -D "frontend/src/components/Header.jsx" "$BK/frontend/src/components/Header.jsx" || true
[ -f "frontend/src/components/Footer.jsx" ] && install -D "frontend/src/components/Footer.jsx" "$BK/frontend/src/components/Footer.jsx" || true
[ -f "frontend/src/components/AgeGate.jsx" ] && install -D "frontend/src/components/AgeGate.jsx" "$BK/frontend/src/components/AgeGate.jsx" || true
[ -f "frontend/src/components/ProductCard.jsx" ] && install -D "frontend/src/components/ProductCard.jsx" "$BK/frontend/src/components/ProductCard.jsx" || true
[ -f "frontend/src/styles/tokens.css" ] && install -D "frontend/src/styles/tokens.css" "$BK/frontend/src/styles/tokens.css" || true

if [ -f frontend/styles/tokens.css ]; then
  install -D frontend/styles/tokens.css "$BK/frontend/styles/tokens.css"
  rm -f frontend/styles/tokens.css; rmdir frontend/styles 2>/dev/null || true
  echo "==> Supprime doublon frontend/styles/tokens.css"
fi
echo "==> Ecriture..."
mkdir -p "$(dirname backend/server.py)"
cat > backend/server.py << 'FN_EOF_09E2A4ED'
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import re
import csv
import json
import hmac
import hashlib
import uuid
import logging
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import xml.etree.ElementTree as ET

import bcrypt
import jwt
import httpx
import resend
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
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
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@fironova.ca")
# Aucun défaut : un mot de passe admin en dur dans le repo est un mot de passe public.
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError(
        "ADMIN_PASSWORD est obligatoire. Définissez-le dans l'environnement "
        "avant de démarrer le serveur."
    )
INTERAC_EMAIL = os.environ.get("INTERAC_EMAIL", "orders@fironova.ca")

# Code d'accès facultatif demandé AVANT même l'écran de login admin, côté SPA
# publique. Ne remplace pas l'auth (JWT + rôle restent la vraie barrière sur
# /api/admin/*) — sert seulement à ce qu'un visiteur qui tombe sur l'URL admin
# obscure par hasard ne voie même pas d'écran de login. Si non défini, la
# passerelle est désactivée (aucun blocage).
ADMIN_GATE_CODE = os.environ.get("ADMIN_GATE_CODE")
INTERAC_PASSWORD_HINT = os.environ.get("INTERAC_PASSWORD_HINT", "FIRONOVA")
NOWPAYMENTS_API_KEY = os.environ.get("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_IPN_SECRET = os.environ.get("NOWPAYMENTS_IPN_SECRET", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
NOWPAYMENTS_BASE_URL = "https://api.nowpayments.io/v1"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "orders@fironova.ca")
ADMIN_NOTIFICATION_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "admin@fironova.ca")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
SHIPPING_FLAT_CAD = float(os.environ.get("SHIPPING_FLAT_CAD", "20.00"))
FREE_SHIPPING_THRESHOLD_CAD = float(os.environ.get("FREE_SHIPPING_THRESHOLD_CAD", "200.00"))
UNPAID_ORDER_TTL_HOURS = float(os.environ.get("UNPAID_ORDER_TTL_HOURS", "24"))

# Feature flags — toggle without deploying new code, just flip the env var and restart.
COA_PAGE_ENABLED = os.environ.get("COA_PAGE_ENABLED", "false").strip().lower() == "true"

# --- Prélancement (BLOC 3) --------------------------------------------------
# Défaut sûr : la boutique reste OUVERTE si la variable est absente.
PRELAUNCH_ENABLED = os.environ.get("PRELAUNCH_ENABLED", "false").strip().lower() == "true"
PRELAUNCH_PREVIEW_TOKEN = os.environ.get("PRELAUNCH_PREVIEW_TOKEN", "")  # ?preview=<token> contourne la porte
LAUNCH_COUPON_CODE = os.environ.get("LAUNCH_COUPON_CODE", "LAUNCH15").strip().upper()

# File uploads (COA PDFs). Served statically at /uploads/coa/<file>.
UPLOAD_DIR = ROOT_DIR / "uploads"
COA_UPLOAD_DIR = UPLOAD_DIR / "coa"
COA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_COA_UPLOAD_MB = float(os.environ.get("MAX_COA_UPLOAD_MB", "10"))

# Étiquettes d'expédition Postes Canada — servies à /uploads/labels/<file>.
LABEL_UPLOAD_DIR = UPLOAD_DIR / "labels"
LABEL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Postes Canada (Canada Post) rating/tracking API — leave blank to keep using the flat-rate
# shipping_zones/shipping_methods system already in place.
CANADA_POST_API_KEY = os.environ.get("CANADA_POST_API_KEY", "")
CANADA_POST_CUSTOMER_NUMBER = os.environ.get("CANADA_POST_CUSTOMER_NUMBER", "")
CANADA_POST_CONTRACT_ID = os.environ.get("CANADA_POST_CONTRACT_ID", "")
CANADA_POST_ORIGIN_POSTAL_CODE = os.environ.get("CANADA_POST_ORIGIN_POSTAL_CODE", "")
# Expéditeur pour la création d'étiquettes. Emballage neutre : aucune mention
# du contenu ne figure sur l'étiquette (politique d'emballage discret).
CANADA_POST_SENDER_NAME = os.environ.get("CANADA_POST_SENDER_NAME", "FIRONOVA")
CANADA_POST_SENDER_ADDRESS = os.environ.get("CANADA_POST_SENDER_ADDRESS", "")
CANADA_POST_SENDER_CITY = os.environ.get("CANADA_POST_SENDER_CITY", "Montreal")
CANADA_POST_SENDER_PROVINCE = os.environ.get("CANADA_POST_SENDER_PROVINCE", "QC")
CANADA_POST_SENDER_PHONE = os.environ.get("CANADA_POST_SENDER_PHONE", "")
CANADA_POST_ENVIRONMENT = os.environ.get("CANADA_POST_ENVIRONMENT", "dev")  # "dev" (soa-gw) or "prod" (soa-gw prod host)
CANADA_POST_BASE_URL = (
    "https://ct.soa-gw.canadapost.ca" if CANADA_POST_ENVIRONMENT == "dev"
    else "https://soa-gw.canadapost.ca"
)

# ---------------------------------------------------------------------------
# Dispatch batch (fenêtre de traitement des commandes)
# Cutoff 13h heure de l'Est, jours ouvrables seulement (week-ends + fériés exclus).
# ---------------------------------------------------------------------------
from zoneinfo import ZoneInfo
try:
    import holidays as _holidays_lib
    _CA_HOLIDAYS = _holidays_lib.Canada()  # fériés fédéraux canadiens
except Exception:  # pragma: no cover - lib absente => aucun férié bloqué
    _CA_HOLIDAYS = set()

ORDER_CUTOFF_HOUR = int(os.environ.get("ORDER_CUTOFF_HOUR", "13"))
ORDER_CUTOFF_TZ = os.environ.get("ORDER_CUTOFF_TZ", "America/Toronto")


def _is_business_day(d) -> bool:
    """False les samedis, dimanches et jours fériés fédéraux canadiens."""
    if d.weekday() >= 5:  # 5 = samedi, 6 = dimanche
        return False
    return d not in _CA_HOLIDAYS


def compute_dispatch_batch(paid_at) -> str:
    """
    Retourne la date du lot d'expédition (prochain jour ouvrable) au format
    'YYYY-MM-DD' en date locale (ORDER_CUTOFF_TZ), à partir d'un horodatage de
    paiement (datetime aware UTC, ou string ISO).
    Règle : payé avant le cutoff un jour ouvrable => jour même, sinon jour
    suivant ; puis on avance jusqu'au prochain jour ouvrable.
    """
    if isinstance(paid_at, str):
        paid_at = datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
    if paid_at.tzinfo is None:
        paid_at = paid_at.replace(tzinfo=timezone.utc)
    local = paid_at.astimezone(ZoneInfo(ORDER_CUTOFF_TZ))
    candidate = local.date()
    if not (local.hour < ORDER_CUTOFF_HOUR and _is_business_day(candidate)):
        candidate = candidate + timedelta(days=1)
    while not _is_business_day(candidate):
        candidate = candidate + timedelta(days=1)
    return candidate.isoformat()

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

app = FastAPI(title="FIRONOVA API", version="1.0.0")
api = APIRouter(prefix="/api")

# Serve uploaded files (COA PDFs, etc.) at /uploads/...
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


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


def create_access_token(user_id: str, email: str, role: str, token_version: int = 0) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "tv": token_version,  # doit correspondre à users.token_version — sinon token révoqué
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
        if not user:
            return None
        # Révocation : si le token_version du JWT ne correspond plus à celui
        # stocké sur l'utilisateur (changement de mot de passe, changement
        # d'email confirmé, déconnexion globale, suppression de compte),
        # le token est considéré invalide même s'il n'a pas expiré.
        if payload.get("tv", 0) != user.get("token_version", 0):
            return None
        user.pop("token_version", None)  # détail interne, pas exposé à l'API
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
# Rôles & permissions granulaires — inspiré du modèle de règles par entité
# vu sur Base44 (Créateur uniquement / Tous les utilisateurs / etc.), adapté
# à un admin e-commerce : trois rôles (user, staff, admin), et pour les
# comptes "staff", un niveau d'accès par zone fonctionnelle.
#   - "admin"  : accès complet à tout, y compris la gestion des autres
#                membres staff (équivalent "Owner" chez Base44).
#   - "staff"  : accès limité aux zones et niveaux qui lui sont accordés.
#   - "user"   : client normal, aucun accès admin.
# Niveaux par zone : none < view < manage (manage inclut view).
# ---------------------------------------------------------------------------
STAFF_AREAS = ["orders", "products", "coupons", "customers", "subscribers", "shipping", "dashboard"]
_PERMISSION_ORDER = {"none": 0, "view": 1, "manage": 2}


def require_area(area: str, level: str = "view"):
    """Dépendance FastAPI paramétrée : autorise si role == admin (accès total),
    ou si role == staff ET permissions[area] >= level demandé.
    Journalise automatiquement toute action de niveau "manage" (= mutation) —
    couvre les 35 endpoints admin existants sans qu'il faille les modifier
    un par un."""
    async def _dep(request: Request, user: dict = Depends(get_current_user)) -> dict:
        allowed = False
        if user.get("role") == "admin":
            allowed = True
        elif user.get("role") == "staff":
            perms = user.get("permissions") or {}
            have = _PERMISSION_ORDER.get(perms.get(area, "none"), 0)
            need = _PERMISSION_ORDER.get(level, 1)
            allowed = have >= need
        if not allowed:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        if level == "manage":
            asyncio.create_task(_log_action(
                user, action=f"{request.method} {request.url.path}", area=area,
            ))
        return user
    return _dep


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
    coa_url: str = ""
    sale_price: Optional[float] = None  # special/discount price (must be < price to apply)
    preorder_enabled: bool = False
    preorder_delay_message: str = ""
    preorder_price: Optional[float] = None
    preorder_note: str = ""
    weight_grams: float = 50.0  # used to estimate parcel weight for live Canada Post rating


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
    visible_to_customer: bool = False


class RefundIn(BaseModel):
    amount: float = Field(gt=0)


class ShippingInfoIn(BaseModel):
    carrier: Optional[str] = ""
    tracking_number: Optional[str] = ""
    shipped_at: Optional[str] = None  # ISO; defaults to now() if not provided


class CreateLabelIn(BaseModel):
    service_code: str = Field(min_length=1, max_length=40)  # ex. "DOM.EP"


class StockAdjustIn(BaseModel):
    delta: int  # positive to add, negative to subtract


class StockNotifyIn(BaseModel):
    email: EmailStr
    product_id: str
    variant_id: Optional[str] = None


# --- Catégories (BLOC 1) ----------------------------------------------------
# Les produits référencent une catégorie par SLUG (string), pas par id : aucune
# migration de données sur les produits existants.
_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


class CategoryIn(BaseModel):
    slug: str = Field(min_length=1, max_length=60)
    name_en: str = Field(min_length=1, max_length=120)
    name_fr: str = Field(min_length=1, max_length=120)
    published: bool = True
    display_order: int = 0

    @field_validator("slug")
    @classmethod
    def _check_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("slug must match ^[a-z0-9-]+$")
        return v


class CategoryOut(CategoryIn):
    id: str
    created_at: str


# --- Menus (BLOC 2) ---------------------------------------------------------
class MenuItemIn(BaseModel):
    id: Optional[str] = None  # généré côté serveur si absent
    label_en: str = Field(min_length=1, max_length=120)
    label_fr: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=500)
    published: bool = True
    display_order: int = 0
    open_new_tab: bool = False


class MenuIn(BaseModel):
    slug: str = Field(min_length=1, max_length=60)
    name_en: str = Field(min_length=1, max_length=120)
    name_fr: str = Field(min_length=1, max_length=120)
    location: Literal["header", "footer"]
    published: bool = True
    display_order: int = 0
    items: List[MenuItemIn] = []

    @field_validator("slug")
    @classmethod
    def _check_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("slug must match ^[a-z0-9-]+$")
        return v


class MenuOut(MenuIn):
    id: str
    created_at: str


class NewsletterSubscribeIn(BaseModel):
    email: EmailStr
    lang: Optional[Literal["en", "fr"]] = "en"
    source: Optional[str] = "footer"  # d'où vient l'inscription (footer, popup, checkout…)


# --- Mon Compte -------------------------------------------------------------
class ProfileUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class EmailChangeRequestIn(BaseModel):
    new_email: EmailStr
    current_password: str  # exigé : empêche un token volé de détourner le compte


class SavedAddressIn(BaseModel):
    label: Optional[str] = ""  # "Maison", "Labo", …
    full_name: str
    address1: str
    address2: Optional[str] = ""
    city: str
    province: str
    postal_code: str
    country: str = "CA"
    phone: Optional[str] = ""
    is_default: bool = False


class AccountDeleteIn(BaseModel):
    current_password: str  # confirmation forte avant action irréversible


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


class ShippingRateRequest(BaseModel):
    postal_code: str
    country: str = "CA"
    items: Optional[List[CartItem]] = None  # used to estimate parcel weight; omit for a default estimate


# ---------------------------------------------------------------------------
# Tax & shipping (no tax — shipping flat-rate)
# ---------------------------------------------------------------------------
PROVINCES_CA = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response, request: Request):
    _rate_limit("register", _client_ip(request), 5, 3600, "Too many registration attempts. Try again later.")
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name.strip(),
        "password_hash": hash_password(payload.password),
        "role": "user",
        "token_version": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    # Un abonné pré-lancement qui crée son compte : on marque la conversion.
    # N'interrompt jamais l'inscription si ça échoue.
    try:
        await db.subscribers.update_one({"email": email}, {"$set": {"converted": True}})
    except Exception as e:  # pragma: no cover
        logging.warning("subscriber conversion flag failed for %s: %s", email, e)
    token = create_access_token(user_doc["id"], email, "user", token_version=0)
    set_auth_cookie(response, token)
    return {
        "id": user_doc["id"],
        "email": email,
        "name": user_doc["name"],
        "role": "user",
        "created_at": user_doc["created_at"],
        # NOTE: le token n'est volontairement PAS renvoyé dans le body —
        # l'auth passe uniquement par le cookie httpOnly, donc une XSS
        # future ne peut pas exfiltrer la session.
    }


# In-memory brute-force protection: max 5 failed attempts per IP+email in a 15-min window
_LOGIN_ATTEMPTS: dict = {}
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 900


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _login_throttle_check(key: str):
    now = datetime.now(timezone.utc).timestamp()
    attempts = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < _LOGIN_WINDOW_SECONDS]
    _LOGIN_ATTEMPTS[key] = attempts
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")


# In-memory rate limiting for public write endpoints (same pattern as login throttle).
_RATE_BUCKETS: dict = {}
_RATE_LAST_SWEEP = {"t": 0.0}


def _sweep_rate_buckets(now: float, window_seconds: int) -> None:
    """Purge les clés expirées. Sans ça, chaque IP unique laissait une entrée
    permanente dans le dict → croissance mémoire linéaire au trafic."""
    if now - _RATE_LAST_SWEEP["t"] < 300:
        return
    _RATE_LAST_SWEEP["t"] = now
    for bname, b in list(_RATE_BUCKETS.items()):
        for k, ts in list(b.items()):
            if not [t for t in ts if now - t < window_seconds]:
                b.pop(k, None)
        if not b:
            _RATE_BUCKETS.pop(bname, None)
    for k, ts in list(_LOGIN_ATTEMPTS.items()):
        if not [t for t in ts if now - t < _LOGIN_WINDOW_SECONDS]:
            _LOGIN_ATTEMPTS.pop(k, None)


def _rate_limit(bucket: str, key: str, max_hits: int, window_seconds: int, detail: str):
    now = datetime.now(timezone.utc).timestamp()
    _sweep_rate_buckets(now, window_seconds)
    b = _RATE_BUCKETS.setdefault(bucket, {})
    hits = [t for t in b.get(key, []) if now - t < window_seconds]
    if len(hits) >= max_hits:
        b[key] = hits
        raise HTTPException(status_code=429, detail=detail)
    hits.append(now)
    b[key] = hits


class AdminGateIn(BaseModel):
    code: str


class TrashIdsIn(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=200)


# ---------------------------------------------------------------------------
# Corbeille générique — même principe pour toutes les données supprimables :
# suppression douce (deleted_at posé, rien n'est perdu), restauration en un
# clic, purge automatique après 30 jours (SAUF les commandes — voir note).
#
# ⚠️ Les commandes ne sont PAS purgées automatiquement : une commande payée
# est une pièce comptable. Elle reste en corbeille indéfiniment jusqu'à une
# purge manuelle explicite par un owner. Tous les autres types (produits,
# coupons, zones/méthodes de livraison) suivent la règle des 30 jours.
# ---------------------------------------------------------------------------
TRASH_RESOURCES = {
    "products":         {"collection": "products",         "area": "products",  "has_active": True,  "auto_purge_days": 30},
    "coupons":          {"collection": "coupons",           "area": "coupons",   "has_active": True,  "auto_purge_days": 30},
    "shipping_zones":   {"collection": "shipping_zones",    "area": "shipping",  "has_active": False, "auto_purge_days": 30},
    "shipping_methods": {"collection": "shipping_methods",  "area": "shipping",  "has_active": True,  "auto_purge_days": 30},
    "orders":           {"collection": "orders",            "area": "orders",    "has_active": False, "auto_purge_days": None},
}


async def _soft_delete(resource: str, item_id: str, admin: dict) -> dict:
    cfg = TRASH_RESOURCES[resource]
    coll = getattr(db, cfg["collection"])
    doc = await coll.find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"{resource[:-1].capitalize()} not found")
    update = {"deleted_at": datetime.now(timezone.utc).isoformat(), "deleted_by": admin.get("id")}
    if cfg["has_active"]:
        update["_pre_delete_active"] = doc.get("active", True)
        update["active"] = False
    await coll.update_one({"id": item_id}, {"$set": update})
    await _log_action(admin, f"{resource}.delete", area=cfg["area"], detail=f"Moved {resource[:-1]} {item_id} to trash")
    return {"ok": True}


@api.get("/admin/trash/{resource}")
async def admin_list_trash(resource: str, admin: dict = Depends(get_admin_user)):
    if resource not in TRASH_RESOURCES:
        raise HTTPException(status_code=404, detail="Unknown resource")
    coll = getattr(db, TRASH_RESOURCES[resource]["collection"])
    items = await coll.find({"deleted_at": {"$ne": None}}, {"_id": 0}).sort("deleted_at", -1).to_list(500)
    return items


@api.post("/admin/trash/{resource}/restore")
async def admin_restore_trash(resource: str, payload: TrashIdsIn, admin: dict = Depends(get_admin_user)):
    if resource not in TRASH_RESOURCES:
        raise HTTPException(status_code=404, detail="Unknown resource")
    cfg = TRASH_RESOURCES[resource]
    coll = getattr(db, cfg["collection"])
    restored = 0
    for item_id in payload.ids:
        doc = await coll.find_one({"id": item_id, "deleted_at": {"$ne": None}})
        if not doc:
            continue
        update = {}
        if cfg["has_active"]:
            update["active"] = doc.get("_pre_delete_active", True)
        unset = {"deleted_at": "", "deleted_by": "", "_pre_delete_active": ""}
        await coll.update_one({"id": item_id}, {"$set": update, "$unset": unset} if update else {"$unset": unset})
        restored += 1
    await _log_action(admin, f"{resource}.restore", area=cfg["area"], detail=f"Restored {restored} {resource}")
    return {"ok": True, "restored": restored}


@api.post("/admin/trash/{resource}/purge")
async def admin_purge_trash(resource: str, payload: TrashIdsIn, admin: dict = Depends(get_admin_user)):
    """Suppression DÉFINITIVE et immédiate des éléments sélectionnés — action
    irréversible, y compris pour les commandes (purge manuelle uniquement)."""
    if resource not in TRASH_RESOURCES:
        raise HTTPException(status_code=404, detail="Unknown resource")
    cfg = TRASH_RESOURCES[resource]
    coll = getattr(db, cfg["collection"])
    res = await coll.delete_many({"id": {"$in": payload.ids}, "deleted_at": {"$ne": None}})
    await _log_action(admin, f"{resource}.purge", area=cfg["area"],
                      detail=f"Permanently deleted {res.deleted_count} {resource}")
    return {"ok": True, "purged": res.deleted_count}


async def _trash_auto_purge_watchdog():
    """Purge automatiquement après 30 jours — sauf les commandes (auto_purge_days=None).
    Tourne dans le même worker verrouillé que les autres tâches de fond."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            for resource, cfg in TRASH_RESOURCES.items():
                if cfg["auto_purge_days"] is None:
                    continue
                cutoff = (now - timedelta(days=cfg["auto_purge_days"])).isoformat()
                coll = getattr(db, cfg["collection"])
                res = await coll.delete_many({"deleted_at": {"$ne": None, "$lt": cutoff}})
                if res.deleted_count:
                    logging.info("[trash] auto-purged %d %s older than %d days",
                                res.deleted_count, resource, cfg["auto_purge_days"])
        except Exception as e:
            logging.error("[trash] auto-purge watchdog error: %s", e)
        await asyncio.sleep(6 * 3600)  # toutes les 6h


class StaffPermissionsIn(BaseModel):
    orders: Literal["none", "view", "manage"] = "none"
    products: Literal["none", "view", "manage"] = "none"
    coupons: Literal["none", "view", "manage"] = "none"
    customers: Literal["none", "view", "manage"] = "none"
    subscribers: Literal["none", "view", "manage"] = "none"
    shipping: Literal["none", "view", "manage"] = "none"
    dashboard: Literal["none", "view", "manage"] = "none"


class StaffInviteIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    permissions: StaffPermissionsIn
    as_owner: bool = False  # invite directement comme admin (owner) — accès total


class StaffAcceptIn(BaseModel):
    token: str
    password: str = Field(min_length=8)


@api.post("/admin/gate/verify")
async def admin_gate_verify(payload: AdminGateIn, request: Request):
    """Passerelle avant le login admin — voir ADMIN_GATE_CODE plus haut.
    Rate-limit distinct et plus strict que le login (pas de compte à protéger
    ici, juste dissuader le brute-force du code lui-même)."""
    if not ADMIN_GATE_CODE:
        return {"ok": True}  # passerelle désactivée si aucun code configuré
    _rate_limit("admin_gate", _client_ip(request), 5, 3600, "Too many attempts. Try again later.")
    if not secrets.compare_digest(payload.code, ADMIN_GATE_CODE):
        raise HTTPException(status_code=403, detail="Invalid code")
    return {"ok": True}


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response, request: Request):
    email = payload.email.lower().strip()
    throttle_key = f"{_client_ip(request)}:{email}"
    _login_throttle_check(throttle_key)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        _LOGIN_ATTEMPTS.setdefault(throttle_key, []).append(datetime.now(timezone.utc).timestamp())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _LOGIN_ATTEMPTS.pop(throttle_key, None)
    token = create_access_token(user["id"], user["email"], user["role"], token_version=user.get("token_version", 0))
    set_auth_cookie(response, token)
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"],
        # NOTE: auth cookie-only — pas de token dans le body.
    }


@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@api.post("/auth/logout-all")
async def logout_all_devices(response: Response, user: dict = Depends(get_current_user)):
    """Révoque tous les tokens émis avant cet appel, sur tous les appareils.
    Utile après un changement de mot de passe suspect ou une perte d'appareil."""
    await db.users.update_one({"id": user["id"]}, {"$inc": {"token_version": 1}})
    clear_auth_cookie(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Mon Compte — profil, mot de passe, changement d'email (double opt-in),
# adresses sauvegardées, suppression de compte avec anonymisation.
# ---------------------------------------------------------------------------
EMAIL_CHANGE_TTL_HOURS = 24


@api.put("/account/profile")
async def account_update_profile(payload: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    name = payload.name.strip()
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": name}})
    return {"ok": True, "name": name}


@api.put("/account/password")
async def account_change_password(payload: PasswordChangeIn, response: Response,
                                  user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not verify_password(payload.current_password, doc["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    new_tv = doc.get("token_version", 0) + 1
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "token_version": new_tv}},
    )
    # On révoque tous les anciens tokens (token_version+1) mais on ré-émet
    # immédiatement un token frais pour CET appareil : l'utilisateur qui vient
    # de changer son mot de passe ne doit pas être déconnecté lui-même.
    token = create_access_token(doc["id"], doc["email"], doc["role"], token_version=new_tv)
    set_auth_cookie(response, token)
    # Le cookie httpOnly frais suffit — pas de token dans le body.
    return {"ok": True}


def _email_change_html(confirm_url: str, lang: str = "fr") -> str:
    if lang == "fr":
        heading = "Confirmez votre nouvelle adresse email"
        body = ("Vous avez demandé à changer l'adresse email de votre compte FIRONOVA. "
                "Cliquez sur le bouton ci-dessous pour confirmer. "
                f"Ce lien expire dans {EMAIL_CHANGE_TTL_HOURS} heures. "
                "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.")
        btn = "Confirmer mon email"
    else:
        heading = "Confirm your new email address"
        body = ("You requested to change the email on your FIRONOVA account. "
                "Click the button below to confirm. "
                f"This link expires in {EMAIL_CHANGE_TTL_HOURS} hours. "
                "If you didn't request this, you can safely ignore this message.")
        btn = "Confirm my email"
    return f"""
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;color:#3A0A08;background:#FFFAF6">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">FIRONOVA<span style="color:#C20114">.</span></div>
      <h2 style="margin-top:24px">{heading}</h2>
      <p style="line-height:1.6">{body}</p>
      <a href="{confirm_url}" style="display:inline-block;margin-top:16px;background:#3A0A08;color:#fff;
         padding:14px 28px;text-decoration:none;font-family:monospace;font-size:12px;
         letter-spacing:0.2em;text-transform:uppercase">{btn} →</a>
      <p style="margin-top:24px;font-size:12px;color:#6B0504">{confirm_url}</p>
    </div>
    """


@api.post("/account/email/request-change")
async def account_request_email_change(payload: EmailChangeRequestIn, request: Request,
                                       user: dict = Depends(get_current_user)):
    _rate_limit("email_change", user["id"], 3, 3600, "Too many email change requests. Try again later.")
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not verify_password(payload.current_password, doc["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    new_email = payload.new_email.lower().strip()
    if new_email == doc["email"]:
        raise HTTPException(status_code=400, detail="This is already your email address")
    if await db.users.find_one({"email": new_email}):
        raise HTTPException(status_code=409, detail="Email already in use")

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.email_change_requests.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "new_email": new_email,
        "token": token,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=EMAIL_CHANGE_TTL_HOURS)).isoformat(),
        "used": False,
    })
    base = PUBLIC_BASE_URL or str(request.base_url).rstrip("/")
    confirm_url = f"{base}/api/account/email/confirm?token={token}"
    lang = "fr"  # les emails transactionnels suivent la langue du site ; FR par défaut au Québec
    asyncio.create_task(_send_email(new_email, "FIRONOVA — Confirmez votre nouvelle adresse email",
                                    _email_change_html(confirm_url, lang)))
    return {"ok": True, "sent_to": new_email}


@api.get("/account/email/confirm")
async def account_confirm_email_change(token: str):
    """Lien cliqué depuis l'email — pas d'authentification (l'utilisateur peut
    ouvrir le lien sur un autre appareil). Le token à usage unique + TTL fait
    office de preuve."""
    now = datetime.now(timezone.utc).isoformat()
    req = await db.email_change_requests.find_one({"token": token, "used": False})
    if not req or req["expires_at"] < now:
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation link")
    # Re-vérifier l'unicité : l'email a pu être pris entre la demande et le clic.
    if await db.users.find_one({"email": req["new_email"]}):
        raise HTTPException(status_code=409, detail="Email already in use")
    user = await db.users.find_one({"id": req["user_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.users.update_one(
        {"id": req["user_id"]},
        {"$set": {"email": req["new_email"]},
         "$inc": {"token_version": 1}},  # révoque les sessions liées à l'ancien email
    )
    await db.email_change_requests.update_one({"token": token}, {"$set": {"used": True, "used_at": now}})
    # Réponse HTML minimale : le lien est ouvert dans un navigateur, pas via l'app.
    return Response(
        content=f"""<!doctype html><html><body style="font-family:Georgia,serif;background:#FFFAF6;color:#3A0A08;
        display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center"><div style="font-size:22px;font-weight:800">FIRONOVA<span style="color:#C20114">.</span></div>
        <h2>Email confirmé ✓ / Email confirmed ✓</h2>
        <p>Reconnectez-vous avec votre nouvelle adresse.<br/>Please sign in again with your new address.</p>
        </div></body></html>""",
        media_type="text/html",
    )


# --- Adresses sauvegardées ---------------------------------------------------
@api.get("/account/addresses")
async def account_list_addresses(user: dict = Depends(get_current_user)):
    return await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)


@api.post("/account/addresses")
async def account_add_address(payload: SavedAddressIn, user: dict = Depends(get_current_user)):
    count = await db.addresses.count_documents({"user_id": user["id"]})
    if count >= 10:
        raise HTTPException(status_code=400, detail="Address limit reached (10)")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Première adresse = défaut automatique ; sinon respecter le flag envoyé.
    if count == 0:
        doc["is_default"] = True
    elif doc["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/account/addresses/{address_id}")
async def account_update_address(address_id: str, payload: SavedAddressIn,
                                 user: dict = Depends(get_current_user)):
    existing = await db.addresses.find_one({"id": address_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Address not found")
    doc = payload.model_dump()
    if doc["is_default"]:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    await db.addresses.update_one({"id": address_id, "user_id": user["id"]}, {"$set": doc})
    fresh = await db.addresses.find_one({"id": address_id}, {"_id": 0})
    return fresh


@api.delete("/account/addresses/{address_id}")
async def account_delete_address(address_id: str, user: dict = Depends(get_current_user)):
    res = await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Address not found")
    # Si on vient de supprimer l'adresse par défaut, promouvoir la plus récente.
    remaining_default = await db.addresses.find_one({"user_id": user["id"], "is_default": True})
    if not remaining_default:
        newest = await db.addresses.find_one({"user_id": user["id"]}, sort=[("created_at", -1)])
        if newest:
            await db.addresses.update_one({"id": newest["id"]}, {"$set": {"is_default": True}})
    return {"ok": True}


# --- Suppression de compte (PIPEDA / Loi 25) ---------------------------------
@api.post("/account/delete")
async def account_delete(payload: AccountDeleteIn, response: Response,
                         user: dict = Depends(get_current_user)):
    """Suppression du compte + anonymisation des commandes.
    Les commandes sont CONSERVÉES (obligations comptables/fiscales) mais toutes
    les données personnelles y sont remplacées. Irréversible."""
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not verify_password(payload.current_password, doc["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    if doc.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts cannot be self-deleted")

    now = datetime.now(timezone.utc).isoformat()
    anon = f"deleted-user-{doc['id'][:8]}"

    # 1. Anonymiser les commandes (on garde montants, items, dates — pas l'identité)
    await db.orders.update_many(
        {"user_id": doc["id"]},
        {"$set": {
            "email": f"{anon}@anonymized.invalid",
            "shipping_address.full_name": "[deleted]",
            "shipping_address.address1": "[deleted]",
            "shipping_address.address2": "",
            "shipping_address.phone": "",
            "anonymized_at": now,
        }},
    )
    # 2. Purger les données annexes
    await db.addresses.delete_many({"user_id": doc["id"]})
    await db.stock_notifications.delete_many({"email": doc["email"]})
    await db.subscribers.delete_one({"email": doc["email"]})
    await db.email_change_requests.delete_many({"user_id": doc["id"]})
    # 3. Supprimer l'utilisateur
    await db.users.delete_one({"id": doc["id"]})
    clear_auth_cookie(response)
    logging.info("Account deleted + orders anonymized for user %s", anon)
    return {"ok": True}


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
        # Neutralise les métacaractères regex : sans ça, un `q` du type
        # "(a+)+$" est injecté tel quel dans MongoDB → ReDoS / scan complet.
        q_safe = re.escape(q.strip())
        filt["$or"] = [
            {"name_en": {"$regex": q_safe, "$options": "i"}},
            {"name_fr": {"$regex": q_safe, "$options": "i"}},
            {"slug": {"$regex": q_safe, "$options": "i"}},
        ]
    products = await db.products.find(filt, {"_id": 0}).sort("name_en", 1).to_list(500)
    return products


@api.get("/products/{slug}")
async def get_product(slug: str):
    product = await db.products.find_one({"slug": slug}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    return product


@api.post("/notify-stock")
async def notify_stock_request(payload: StockNotifyIn, request: Request):
    _rate_limit("notify_stock", _client_ip(request), 10, 3600, "Too many requests. Try again later.")
    """Public endpoint — a visitor asks to be emailed once a sold-out product/variant is back."""
    product = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Product not found")
    variant_id = payload.variant_id
    if variant_id and not any(v.get("id") == variant_id for v in product.get("variants", [])):
        raise HTTPException(400, "Variant not found for this product")
    email = payload.email.lower().strip()
    existing = await db.stock_notifications.find_one({
        "email": email, "product_id": payload.product_id, "variant_id": variant_id, "notified": False,
    })
    if existing:
        return {"ok": True, "already_subscribed": True}
    await db.stock_notifications.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "product_id": payload.product_id,
        "variant_id": variant_id,
        "notified": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "already_subscribed": False}


# ---------------------------------------------------------------------------
# BLOC 1 — Catégories : collection réelle + CRUD admin + publication.
# Les produits continuent de référencer une catégorie par slug (string) : aucune
# migration produit, aucune rupture des 12 produits seedés.
# ---------------------------------------------------------------------------
@api.get("/categories")
async def list_categories():
    """Vitrine : uniquement les catégories publiées."""
    return await db.categories.find({"published": True}, {"_id": 0}).sort("display_order", 1).to_list(200)


@api.get("/admin/categories")
async def admin_list_categories(_admin: dict = Depends(get_admin_user)):
    return await db.categories.find({}, {"_id": 0}).sort("display_order", 1).to_list(200)


@api.post("/admin/categories")
async def admin_create_category(payload: CategoryIn, _admin: dict = Depends(get_admin_user)):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.categories.insert_one(dict(doc))
    except DuplicateKeyError:
        raise HTTPException(409, f"A category with slug '{doc['slug']}' already exists")
    doc.pop("_id", None)
    return doc


@api.put("/admin/categories/{cat_id}")
async def admin_update_category(cat_id: str, payload: CategoryIn, _admin: dict = Depends(get_admin_user)):
    existing = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Category not found")
    new = payload.model_dump()
    old_slug, new_slug = existing["slug"], new["slug"]

    if new_slug != old_slug and await db.categories.find_one({"slug": new_slug, "id": {"$ne": cat_id}}):
        raise HTTPException(409, f"A category with slug '{new_slug}' already exists")

    await db.categories.update_one({"id": cat_id}, {"$set": new})

    # Cascade : renommer un slug ne doit jamais orpheliner les produits.
    migrated = 0
    if new_slug != old_slug:
        res = await db.products.update_many({"category": old_slug}, {"$set": {"category": new_slug}})
        migrated = res.modified_count

    out = {**existing, **new}
    out["products_migrated"] = migrated
    return out


@api.delete("/admin/categories/{cat_id}")
async def admin_delete_category(cat_id: str, _admin: dict = Depends(get_admin_user)):
    cat = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    if not cat:
        raise HTTPException(404, "Category not found")
    in_use = await db.products.count_documents({"category": cat["slug"]})
    if in_use:
        # Même principe que le soft-delete produit lié à des commandes : on masque.
        await db.categories.update_one({"id": cat_id}, {"$set": {"published": False}})
        raise HTTPException(
            409,
            f"Category in use by {in_use} product(s); it has been hidden instead of deleted.",
        )
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True, "deleted": True}


# ---------------------------------------------------------------------------
# BLOC 2 — Menus : navigation header/footer pilotée depuis l'admin.
# ---------------------------------------------------------------------------
def _normalize_menu_items(items: list) -> list:
    out = []
    for it in items:
        d = dict(it)
        if not d.get("id"):
            d["id"] = str(uuid.uuid4())
        out.append(d)
    return out


@api.get("/menus")
async def list_menus(location: Optional[str] = None):
    """Vitrine : menus publiés, items non publiés retirés."""
    filt: dict = {"published": True}
    if location:
        filt["location"] = location
    menus = await db.menus.find(filt, {"_id": 0}).sort("display_order", 1).to_list(50)
    for m in menus:
        m["items"] = sorted(
            [i for i in m.get("items", []) if i.get("published", True)],
            key=lambda i: i.get("display_order", 0),
        )
    return menus


@api.get("/admin/menus")
async def admin_list_menus(_admin: dict = Depends(get_admin_user)):
    return await db.menus.find({}, {"_id": 0}).sort("display_order", 1).to_list(50)


@api.post("/admin/menus")
async def admin_create_menu(payload: MenuIn, _admin: dict = Depends(get_admin_user)):
    doc = payload.model_dump()
    doc["items"] = _normalize_menu_items(doc.get("items") or [])
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.menus.insert_one(dict(doc))
    except DuplicateKeyError:
        raise HTTPException(409, f"A menu with slug '{doc['slug']}' already exists")
    doc.pop("_id", None)
    return doc


@api.put("/admin/menus/{menu_id}")
async def admin_update_menu(menu_id: str, payload: MenuIn, _admin: dict = Depends(get_admin_user)):
    existing = await db.menus.find_one({"id": menu_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Menu not found")
    new = payload.model_dump()
    if new["slug"] != existing["slug"] and await db.menus.find_one({"slug": new["slug"], "id": {"$ne": menu_id}}):
        raise HTTPException(409, f"A menu with slug '{new['slug']}' already exists")
    # Les ids d'items existants sont conservés ; seuls les nouveaux en reçoivent un.
    new["items"] = _normalize_menu_items(new.get("items") or [])
    await db.menus.update_one({"id": menu_id}, {"$set": new})
    return {**existing, **new}


@api.delete("/admin/menus/{menu_id}")
async def admin_delete_menu(menu_id: str, _admin: dict = Depends(get_admin_user)):
    res = await db.menus.delete_one({"id": menu_id})
    if not res.deleted_count:
        raise HTTPException(404, "Menu not found")
    return {"ok": True, "deleted": True}


# ---------------------------------------------------------------------------
# BLOC 3 — Prélancement : vérification du jeton d'aperçu.
# Le jeton n'est JAMAIS exposé via /meta — seule cette comparaison serveur existe.
# ---------------------------------------------------------------------------
@api.get("/prelaunch/preview")
async def prelaunch_preview(token: str, request: Request):
    _rate_limit("prelaunch_preview", _client_ip(request), 20, 3600, "Too many attempts. Try again later.")
    if not PRELAUNCH_PREVIEW_TOKEN:
        return {"ok": False}
    return {"ok": hmac.compare_digest(token or "", PRELAUNCH_PREVIEW_TOKEN)}


# ---------------------------------------------------------------------------
# Newsletter / subscribers — conforme LCAP (CASL) : on conserve la preuve de
# consentement (date, IP, source) pour chaque inscription, et un lien de
# désabonnement fonctionne sans authentification (obligatoire par la loi).
# ---------------------------------------------------------------------------
@api.post("/newsletter/subscribe")
async def newsletter_subscribe(payload: NewsletterSubscribeIn, request: Request):
    _rate_limit("newsletter_subscribe", _client_ip(request), 10, 3600, "Too many requests. Try again later.")
    email = payload.email.lower().strip()
    now = datetime.now(timezone.utc).isoformat()
    ip = _client_ip(request)

    existing = await db.subscribers.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("status") == "subscribed":
        return {"ok": True, "already_subscribed": True}

    if existing:
        # Ancien désabonné qui se réinscrit : nouveau consentement, nouvelle preuve.
        await db.subscribers.update_one(
            {"email": email},
            {"$set": {
                "status": "subscribed",
                "lang": payload.lang,
                "source": payload.source,
                "consent_at": now,
                "consent_ip": ip,
                "unsubscribed_at": None,
            }},
        )
    else:
        await db.subscribers.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "lang": payload.lang,
            "source": payload.source,
            "status": "subscribed",
            "consent_at": now,
            "consent_ip": ip,
            "unsubscribe_token": str(uuid.uuid4()),
            "unsubscribed_at": None,
            "created_at": now,
            "converted": False,  # bascule à True à la création de compte
        })
    fresh = await db.subscribers.find_one({"email": email}, {"_id": 0})
    asyncio.create_task(
        send_prelaunch_welcome(email, payload.lang or "en", (fresh or {}).get("unsubscribe_token", ""))
    )
    return {"ok": True, "already_subscribed": False}


@api.get("/newsletter/unsubscribe")
async def newsletter_unsubscribe(token: str):
    """Aucune authentification requise — un lien de désabonnement doit
    fonctionner en un clic, sans login, exigence CASL/LCAP."""
    res = await db.subscribers.update_one(
        {"unsubscribe_token": token, "status": "subscribed"},
        {"$set": {"status": "unsubscribed", "unsubscribed_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not res.matched_count:
        # Idempotent : déjà désabonné ou token invalide → même réponse,
        # on ne révèle pas si l'email existe.
        return {"ok": True}
    return {"ok": True}


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
async def admin_create_product(payload: ProductIn, _admin: dict = Depends(require_area("products", "manage"))):
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
async def admin_update_product(product_id: str, payload: ProductIn, _admin: dict = Depends(require_area("products", "manage"))):
    before = await db.products.find_one({"id": product_id}, {"_id": 0})
    update = payload.model_dump()
    update = _ensure_variant_ids(update)
    res = await db.products.update_one({"id": product_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    after = await db.products.find_one({"id": product_id}, {"_id": 0})

    # Back-in-stock: fire for any variant (or legacy product-level stock) that went from <=0 to >0.
    if before:
        before_variant_stock = {v.get("id"): v.get("stock", 0) for v in before.get("variants", [])}
        for v in after.get("variants", []):
            vid = v.get("id")
            if before_variant_stock.get(vid, 0) <= 0 < v.get("stock", 0):
                asyncio.create_task(_maybe_notify_restock(product_id, vid))
        if before.get("stock", 0) <= 0 < after.get("stock", 0):
            asyncio.create_task(_maybe_notify_restock(product_id, None))

    return after


@api.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin: dict = Depends(require_area("products", "manage"))):
    return await _soft_delete("products", product_id, admin)


@api.post("/admin/upload/coa")
async def admin_upload_coa(file: UploadFile = File(...), _admin: dict = Depends(require_area("products", "manage"))):
    """Uploads a Certificate of Analysis PDF and returns a URL to paste into a
    product's or variant's coa_url field. Storage is local disk under UPLOAD_DIR,
    served statically at /uploads/coa/<file>."""
    filename = file.filename or ""
    is_pdf = (file.content_type == "application/pdf") or filename.lower().endswith(".pdf")
    if not is_pdf:
        raise HTTPException(400, "Only PDF files are allowed")

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_COA_UPLOAD_MB:
        raise HTTPException(400, f"File too large — max {MAX_COA_UPLOAD_MB:.0f} MB")
    if not contents.startswith(b"%PDF"):
        raise HTTPException(400, "File is not a valid PDF")

    safe_name = f"{uuid.uuid4().hex}.pdf"
    dest = COA_UPLOAD_DIR / safe_name
    with open(dest, "wb") as f:
        f.write(contents)

    rel_path = f"/uploads/coa/{safe_name}"
    url = f"{PUBLIC_BASE_URL}{rel_path}" if PUBLIC_BASE_URL else rel_path
    return {"url": url, "original_filename": filename, "size_bytes": len(contents)}


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
        "coa_url": p.get("coa_url", "") or "",
        "sale_price": None,
    }


def _variant_effective_price(v: dict, is_preorder: bool) -> float:
    if is_preorder and v.get("preorder_price"):
        return float(v["preorder_price"])
    sale = v.get("sale_price")
    if sale and float(sale) < float(v.get("price", 0.0)):
        return float(sale)
    return float(v.get("price", 0.0))


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
            res = await db.products.update_one(
                {"id": it["product_id"], "stock": {"$gte": qty}},
                {"$inc": {"stock": -qty}},
            )
        else:
            res = await db.products.update_one(
                {"id": it["product_id"],
                 "variants": {"$elemMatch": {"id": vid, "stock": {"$gte": qty}}}},
                {"$inc": {"variants.$[v].stock": -qty}},
                array_filters=[{"v.id": vid}],
            )

        if res.modified_count != 1:
            await _release_stock_atomic(reserved)
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
            await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": qty}})
        else:
            await db.products.update_one(
                {"id": it["product_id"], "variants.id": vid},
                {"$inc": {"variants.$.stock": qty}},
            )


async def _build_order_totals(items: List[CartItem], coupon_code: Optional[str] = None):
    line_items = []
    subtotal = 0.0
    has_preorder = False

    # Un seul aller-retour Mongo au lieu de N (le panier moyen faisait N find_one
    # séquentiels, chacun un RTT réseau complet).
    _ids = list({it.product_id for it in items})
    _docs = await db.products.find({"id": {"$in": _ids}}, {"_id": 0}).to_list(len(_ids))
    _by_id = {d["id"]: d for d in _docs}

    for it in items:
        p = _by_id.get(it.product_id)
        if not p:
            raise HTTPException(400, f"Product {it.product_id} not found")
        if not p.get("active"):
            raise HTTPException(400, f"Product {p['name_en']} unavailable")

        v = _resolve_variant(p, it.variant_id)
        is_preorder = False
        coa_coming = bool(v.get("badge_coa_pending") or v.get("badge_coming_soon"))
        if v.get("preorder_enabled") and (coa_coming or v.get("stock", 0) < it.qty):
            is_preorder = True
            has_preorder = True
        elif v.get("stock", 0) < it.qty:
            if p.get("preorder_allowed"):
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
            # Poids figé à l'achat : l'étiquette doit refléter ce qui a été vendu,
            # même si la fiche produit change ensuite. Les commandes antérieures
            # sans ce champ retombent sur 50 g/unité dans _order_weight_kg().
            "weight_grams": float(v.get("weight_grams") or 50.0),
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
    """Create a NOWPayments invoice (embeddable widget, exact amount). Falls back to mock if no API key."""
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
    body = {
        "price_amount": total_cad,
        "price_currency": "cad",
        "order_id": order_id,
        "order_description": f"FIRONOVA order {order_id}",
    }
    if PUBLIC_BASE_URL:
        body["ipn_callback_url"] = f"{PUBLIC_BASE_URL}/api/webhook/nowpayments"
        body["success_url"] = f"{PUBLIC_BASE_URL}/order/{order_id}"
        body["cancel_url"] = f"{PUBLIC_BASE_URL}/order/{order_id}"
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.post(
                f"{NOWPAYMENTS_BASE_URL}/invoice",
                headers={"x-api-key": NOWPAYMENTS_API_KEY, "Content-Type": "application/json"},
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


async def _estimate_parcel_weight_kg(items: Optional[List["CartItem"]]) -> float:
    if not items:
        return 0.5
    total_g = 0.0
    for it in items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p:
            continue
        v = _resolve_variant(p, it.variant_id)
        total_g += float(v.get("weight_grams") or 50.0) * it.qty
    return max(0.1, round(total_g / 1000.0, 3))


async def _canada_post_get_rates(destination_postal_code: str, destination_country: str, weight_kg: float) -> list:
    """Calls Canada Post's Rating API (rate-v4). Returns [] if not configured or on any error —
    callers must fall back to the flat-rate system in that case."""
    if not (CANADA_POST_API_KEY and CANADA_POST_CUSTOMER_NUMBER and CANADA_POST_ORIGIN_POSTAL_CODE):
        return []

    origin_pc = CANADA_POST_ORIGIN_POSTAL_CODE.replace(" ", "").upper()
    dest_pc = (destination_postal_code or "").replace(" ", "").upper()
    weight_kg = max(0.1, round(weight_kg, 3))

    if destination_country == "CA":
        destination_xml = f"<domestic><postal-code>{dest_pc}</postal-code></domestic>"
    elif destination_country == "US":
        destination_xml = f"<united-states><zip-code>{dest_pc}</zip-code></united-states>"
    else:
        destination_xml = f"<international><country-code>{destination_country}</country-code></international>"

    contract_xml = f"<contract-id>{CANADA_POST_CONTRACT_ID}</contract-id>" if CANADA_POST_CONTRACT_ID else ""
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<mailing-scenario xmlns="http://www.canadapost.ca/ws/ship/rate-v4">'
        f"<customer-number>{CANADA_POST_CUSTOMER_NUMBER}</customer-number>"
        f"{contract_xml}"
        f"<parcel-characteristics><weight>{weight_kg}</weight></parcel-characteristics>"
        f"<origin-postal-code>{origin_pc}</origin-postal-code>"
        f"<destination>{destination_xml}</destination>"
        "</mailing-scenario>"
    )
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.post(
                f"{CANADA_POST_BASE_URL}/rs/ship/price",
                content=body.encode("utf-8"),
                auth=(CANADA_POST_API_KEY, ""),
                headers={
                    "Accept": "application/vnd.cpc.ship.rate-v4+xml",
                    "Content-Type": "application/vnd.cpc.ship.rate-v4+xml",
                },
            )
            if r.status_code >= 400:
                logging.error("Canada Post rating error %s: %s", r.status_code, r.text[:500])
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
    if not CANADA_POST_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as cx:
            r = await cx.get(
                f"{CANADA_POST_BASE_URL}/vis/track/pin/{pin}/detail",
                auth=(CANADA_POST_API_KEY, ""),
                headers={"Accept": "application/vnd.cpc.track+xml"},
            )
            if r.status_code >= 400:
                logging.error("Canada Post tracking error %s: %s", r.status_code, r.text[:400])
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


def is_canada_post_configured() -> bool:
    """Vrai seulement si les trois éléments indispensables sont présents.
    Sinon TOUT retombe proprement sur le tarif fixe / le suivi manuel."""
    return bool(CANADA_POST_API_KEY and CANADA_POST_CUSTOMER_NUMBER and CANADA_POST_ORIGIN_POSTAL_CODE)


def _cp_xml_escape(v: str) -> str:
    """Une apostrophe dans un nom de rue casse le XML — et un chevron l'injecte."""
    return (str(v or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


async def _canada_post_create_shipment(order: dict, service_code: str, weight_kg: float) -> dict:
    """Create Shipment (non-contractuel par défaut) → tracking PIN + lien étiquette.

    Retourne {"pin", "label_href", "shipment_id", "group_id"} ou lève HTTPException.
    """
    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")

    cust = CANADA_POST_CUSTOMER_NUMBER
    contract = CANADA_POST_CONTRACT_ID.strip()
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
        f"<requested-shipping-point>{e(CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</requested-shipping-point>"
        f"<group-id>{e(group_id)}</group-id>"
        f"{extra}"
        "<delivery-spec>"
        f"<service-code>{e(service_code)}</service-code>"
        "<sender>"
        f"<name>{e(CANADA_POST_SENDER_NAME)}</name>"
        f"<company>{e(CANADA_POST_SENDER_NAME)}</company>"
        f"<contact-phone>{e(CANADA_POST_SENDER_PHONE)}</contact-phone>"
        "<address-details>"
        f"<address-line-1>{e(CANADA_POST_SENDER_ADDRESS)}</address-line-1>"
        f"<city>{e(CANADA_POST_SENDER_CITY)}</city>"
        f"<prov-state>{e(CANADA_POST_SENDER_PROVINCE)}</prov-state>"
        f"<postal-zip-code>{e(CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</postal-zip-code>"
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
                f"{CANADA_POST_BASE_URL}{path}",
                content=body.encode("utf-8"),
                auth=(CANADA_POST_API_KEY, ""),
                headers={"Accept": ctype, "Content-Type": ctype, "Accept-language": "en-CA"},
            )
    except Exception as ex:
        logging.error("Canada Post create-shipment request failed: %s", ex)
        raise HTTPException(502, "Canada Post unreachable")

    if r.status_code >= 400:
        logging.error("Canada Post create-shipment %s: %s", r.status_code, r.text[:800])
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
        logging.error("Canada Post create-shipment: no tracking-pin in response: %s", r.text[:600])
        raise HTTPException(502, "Canada Post returned no tracking number")

    return {"pin": pin, "label_href": label_href, "shipment_id": shipment_id, "group_id": group_id}


async def _canada_post_get_artifact(href: str, order_id: str) -> Optional[str]:
    """Get Artifact → télécharge le PDF de l'étiquette, le stocke, renvoie son URL."""
    if not href:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.get(href, auth=(CANADA_POST_API_KEY, ""), headers={"Accept": "application/pdf"})
            if r.status_code >= 400:
                logging.error("Canada Post get-artifact %s: %s", r.status_code, r.text[:300])
                return None
            fname = f"{order_id}-{uuid.uuid4().hex[:8]}.pdf"
            (LABEL_UPLOAD_DIR / fname).write_bytes(r.content)
            return f"/uploads/labels/{fname}"
    except Exception as ex:
        logging.error("Canada Post get-artifact failed: %s", ex)
        return None


async def _canada_post_transmit(group_id: str) -> list:
    """Transmit Shipments → manifeste(s). SANS CET APPEL, Postes Canada facture
    tous les envois non payés AVEC une surcharge de 2 $/article et retire le
    rabais d'automatisation. C'est l'étape la plus coûteuse à oublier."""
    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")
    cust = CANADA_POST_CUSTOMER_NUMBER
    e = _cp_xml_escape
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<transmit-set xmlns="http://www.canadapost.ca/ws/manifest-v8">'
        f"<group-ids><group-id>{e(group_id)}</group-id></group-ids>"
        f"<cpc-pickup-indicator>true</cpc-pickup-indicator>"
        f"<requested-shipping-point>{e(CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</requested-shipping-point>"
        "<detailed-manifests>true</detailed-manifests>"
        "<method-of-payment>Account</method-of-payment>"
        "<manifest-address>"
        f"<manifest-company>{e(CANADA_POST_SENDER_NAME)}</manifest-company>"
        f"<phone-number>{e(CANADA_POST_SENDER_PHONE)}</phone-number>"
        "<address-details>"
        f"<address-line-1>{e(CANADA_POST_SENDER_ADDRESS)}</address-line-1>"
        f"<city>{e(CANADA_POST_SENDER_CITY)}</city>"
        f"<prov-state>{e(CANADA_POST_SENDER_PROVINCE)}</prov-state>"
        f"<postal-zip-code>{e(CANADA_POST_ORIGIN_POSTAL_CODE.replace(' ', '').upper())}</postal-zip-code>"
        "</address-details>"
        "</manifest-address>"
        "</transmit-set>"
    )
    ctype = "application/vnd.cpc.manifest-v8+xml"
    try:
        async with httpx.AsyncClient(timeout=45) as cx:
            r = await cx.post(
                f"{CANADA_POST_BASE_URL}/rs/{cust}/{cust}/manifest",
                content=body.encode("utf-8"),
                auth=(CANADA_POST_API_KEY, ""),
                headers={"Accept": ctype, "Content-Type": ctype, "Accept-language": "en-CA"},
            )
    except Exception as ex:
        logging.error("Canada Post transmit request failed: %s", ex)
        raise HTTPException(502, "Canada Post unreachable")

    if r.status_code >= 400:
        logging.error("Canada Post transmit %s: %s", r.status_code, r.text[:800])
        raise HTTPException(502, f"Canada Post rejected the transmission ({r.status_code})")

    root = ET.fromstring(r.text)
    hrefs = [l.get("href") for l in root.findall(".//{*}link") if l.get("rel") == "manifest"]
    return [h for h in hrefs if h]


async def _canada_post_void(shipment_id: str) -> bool:
    """Void Shipment — annule une étiquette gâchée NON transmise."""
    if not (is_canada_post_configured() and shipment_id):
        return False
    cust = CANADA_POST_CUSTOMER_NUMBER
    path = (f"/rs/{cust}/{cust}/shipment/{shipment_id}" if CANADA_POST_CONTRACT_ID.strip()
            else f"/rs/{cust}/ncshipment/{shipment_id}")
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.delete(f"{CANADA_POST_BASE_URL}{path}", auth=(CANADA_POST_API_KEY, ""),
                                headers={"Accept": "application/vnd.cpc.shipment-v8+xml"})
            return r.status_code < 400
    except Exception as ex:
        logging.error("Canada Post void failed: %s", ex)
        return False


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
        await _send_email(order["email"], f"FIRONOVA — Order {order['order_number']} received", html)

    # Admin notification
    admin_html = _order_email_html(order, "New order received")
    await _send_email(
        ADMIN_NOTIFICATION_EMAIL,
        f"[FIRONOVA ADMIN] New order {order['order_number']} — ${order['total']:.2f} CAD",
        admin_html,
    )


async def send_payment_received(order: dict) -> None:
    if not order.get("email"):
        logging.info("[email] skip payment-received: no email on order %s", order["order_number"])
        return
    html = _order_email_html(order, "Payment received")
    await _send_email(order["email"], f"FIRONOVA — Payment received for {order['order_number']}", html)


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
    base = PUBLIC_BASE_URL or ""
    register_url = f"{base}/register?ref=launch"
    unsub = f"{base}/api/newsletter/unsubscribe?token={unsubscribe_token}" if unsubscribe_token else ""
    if lang == "fr":
        heading = "Bienvenue sur la liste de lancement"
        body = (
            f"<p>Merci de vous être inscrit à la liste de prélancement FIRONOVA.</p>"
            f"<p>Créez votre compte dès maintenant pour verrouiller <strong>15 % de rabais</strong> "
            f"sur votre première commande au lancement, avec le code "
            f"<strong style='font-family:monospace'>{LAUNCH_COUPON_CODE}</strong>.</p>"
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
            f"at launch, with code <strong style='font-family:monospace'>{LAUNCH_COUPON_CODE}</strong>.</p>"
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
    await _send_email(email, subject, _prelaunch_email_html(heading, body))


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
    html = _simple_order_email_html(order, "Your order has shipped / Votre commande est expédiée", body)
    await _send_email(order["email"], f"FIRONOVA — Order {order['order_number']} shipped / expédiée", html)


async def send_customer_note_email(order: dict, note_text: str) -> None:
    if not order.get("email"):
        return
    body = (
        f"A note has been added to your order / Une note a été ajoutée à votre commande :"
        f"<div style='border-left:3px solid #050505;padding:10px 14px;margin-top:12px;background:#fafafa'>{note_text}</div>"
    )
    html = _simple_order_email_html(order, "Note about your order / Note sur votre commande", body)
    await _send_email(order["email"], f"FIRONOVA — Note about order {order['order_number']}", html)


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
    html = _simple_order_email_html(order, "Order refunded / Commande remboursée", body)
    await _send_email(order["email"], f"FIRONOVA — Refund for order {order['order_number']}", html)


# ---------------------------------------------------------------------------
# Back-in-stock notifications
# ---------------------------------------------------------------------------
def _restock_email_html(product: dict, variant: Optional[dict]) -> str:
    name = product.get("name_en", product.get("slug", ""))
    variant_label = f" — {variant['name']}" if variant and variant.get("name") else ""
    slug = product.get("slug", "")
    link = f"{PUBLIC_BASE_URL}/product/{slug}" if PUBLIC_BASE_URL else f"/product/{slug}"
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
    await _send_email(to_email, f"FIRONOVA — {name} is back in stock", html)


async def _maybe_notify_restock(product_id: str, variant_id: Optional[str] = None) -> None:
    """Checks current stock for a product/variant; if positive, emails every pending
    subscriber for that exact product/variant and marks them notified (one-shot)."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
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

    pending = await db.stock_notifications.find(
        {"product_id": product_id, "variant_id": variant_id, "notified": False},
        {"_id": 0},
    ).to_list(1000)
    if not pending:
        return
    for sub in pending:
        asyncio.create_task(_send_restock_email(sub["email"], product, variant))
    await db.stock_notifications.update_many(
        {"product_id": product_id, "variant_id": variant_id, "notified": False},
        {"$set": {"notified": True, "notified_at": datetime.now(timezone.utc).isoformat()}},
    )


@api.post("/shipping/rates")
async def get_shipping_rates(payload: ShippingRateRequest):
    """Live Canada Post rates when CANADA_POST_API_KEY is configured; otherwise falls back
    to the existing flat-rate shipping_zones/shipping_methods (same zones used at checkout)."""
    weight_kg = await _estimate_parcel_weight_kg(payload.items)
    live_rates = await _canada_post_get_rates(payload.postal_code, payload.country, weight_kg)
    if live_rates:
        return {"source": "canada_post_live", "weight_kg": weight_kg, "rates": live_rates}

    zones = await db.shipping_zones.find({"deleted_at": None}, {"_id": 0}).to_list(50)
    zone = next((z for z in zones if payload.country in z.get("countries", [])), None)
    if not zone:
        zone = next((z for z in zones if "INTL" in z.get("countries", [])), None)
    methods = []
    if zone:
        methods = await db.shipping_methods.find(
            {"zone_id": zone["id"], "active": True, "deleted_at": None}, {"_id": 0}
        ).to_list(50)
    rates = [
        {"carrier": m["name"], "service_code": None, "service_name": m["name"],
         "cost_cad": m["cost_cad"], "eta_days": m["eta_days"]}
        for m in methods
    ] or [{"carrier": "FIRONOVA", "service_code": None, "service_name": "Standard",
           "cost_cad": SHIPPING_FLAT_CAD, "eta_days": "3-7 business days"}]
    return {"source": "flat_rate_fallback", "weight_kg": weight_kg, "rates": rates}


# ---------------------------------------------------------------------------
# Confirmation de paiement — point d'entrée UNIQUE et idempotent.
# Le filtre {"payment_status": {"$ne": "paid"}} dans le update_one garantit
# qu'un seul appelant gagne, même si le webhook Stripe et le polling frontend
# arrivent à la milliseconde près. Le coupon est décompté ici (et pas à la
# création) : un panier abandonné ne doit jamais consommer un usage_limit.
# ---------------------------------------------------------------------------
async def _mark_order_paid(order_id: str, note_text: Optional[str] = None) -> Optional[dict]:
    """Retourne l'order fraîche si CET appel a fait la transition, sinon None."""
    paid_at = datetime.now(timezone.utc).isoformat()
    update: dict = {
        "$set": {
            "payment_status": "paid",
            "fulfillment_status": "processing",
            "paid_at": paid_at,
            "dispatch_batch": compute_dispatch_batch(paid_at),
        }
    }
    if note_text:
        update["$push"] = {"notes": {
            "id": str(uuid.uuid4()),
            "text": note_text,
            "author": "system",
            "created_at": paid_at,
        }}

    res = await db.orders.update_one(
        {"id": order_id, "payment_status": {"$ne": "paid"}},
        update,
    )
    if not res.modified_count:
        return None  # déjà payée : un autre chemin a gagné la course

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return None

    # Décompte du coupon au paiement confirmé, une seule fois.
    coupon = order.get("coupon")
    if coupon and coupon.get("code") and not order.get("coupon_counted"):
        await db.coupons.update_one({"code": coupon["code"]}, {"$inc": {"used_count": 1}})
        await db.orders.update_one({"id": order_id}, {"$set": {"coupon_counted": True}})

    if order.get("email"):
        asyncio.create_task(send_payment_received(order))
    return order


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

    # Réservation atomique AVANT tout appel réseau au PSP. Ferme la fenêtre
    # check-then-act qui laissait deux clients acheter le même dernier flacon.
    reserved = await _reserve_stock_atomic(line_items)

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
        except HTTPException:
            await _release_stock_atomic(reserved)
            raise
        except Exception as e:
            await _release_stock_atomic(reserved)
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
        try:
            np = await _nowpayments_create(order_id, total, payload.pay_currency or "btc")
        except Exception:
            await _release_stock_atomic(reserved)
            raise
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

    # Le stock est déjà réservé atomiquement plus haut (_reserve_stock_atomic),
    # avant l'appel au PSP. Rien à faire ici.
    # Le coupon n'est PAS décompté ici : il l'est à la confirmation de paiement
    # (_mark_order_paid), sinon les paniers abandonnés épuisent l'usage_limit.

    # Fire-and-forget order confirmation + admin notification
    asyncio.create_task(send_order_confirmation(order_doc))

    return order_doc


@api.get("/orders/mine")
async def my_orders(user: dict = Depends(get_current_user)):
    items = await db.orders.find(
        {"user_id": user["id"], "deleted_at": None}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
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
    if not (user and user.get("role") == "admin"):
        if isinstance(order.get("compliance"), dict):
            order["compliance"].pop("ip", None)
        order["notes"] = [n for n in (order.get("notes") or []) if n.get("visible_to_customer")]
    return order


@api.get("/orders/{order_id}/tracking")
async def order_tracking(order_id: str, request: Request):
    """Live Canada Post tracking for the order's tracking_number, when configured."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    user = await _resolve_user(request)
    if order.get("user_id"):
        if not user or (user["id"] != order["user_id"] and user.get("role") != "admin"):
            raise HTTPException(403, "Forbidden")
    pin = (order.get("shipping_info") or {}).get("tracking_number")
    if not pin:
        return {"tracked": False, "reason": "no_tracking_number"}
    live = await _canada_post_track(pin)
    if live:
        return {"tracked": True, "source": "canada_post_live", **live}
    return {"tracked": False, "reason": "unavailable_or_not_configured", "pin": pin}


_ORDER_STATUS_GROUPS = {
    "active": {"fulfillment_status": {"$nin": ["delivered", "cancelled", "failed"]}},
    "completed": {"fulfillment_status": "delivered"},
    "cancelled": {"fulfillment_status": {"$in": ["cancelled", "failed"]}},
}


def _status_group_filter(status_group: Optional[str]) -> dict:
    return dict(_ORDER_STATUS_GROUPS.get(status_group or "", {}))


@api.get("/admin/orders")
async def admin_orders(status_group: Optional[str] = None, _admin: dict = Depends(require_area("orders", "view"))):
    filt = _status_group_filter(status_group)
    filt["deleted_at"] = None
    return await db.orders.find(filt, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, admin: dict = Depends(require_area("orders", "manage"))):
    """Suppression douce — la commande va en corbeille, restaurable, et n'est
    PAS purgée automatiquement (contrairement aux autres types de données),
    car une commande payée est une pièce comptable."""
    return await _soft_delete("orders", order_id, admin)


@api.get("/admin/orders/counts")
async def admin_order_counts(_admin: dict = Depends(require_area("orders", "view"))):
    out = {}
    for group, filt in _ORDER_STATUS_GROUPS.items():
        out[group] = await db.orders.count_documents(filt)
    out["all"] = await db.orders.count_documents({})
    return out


@api.get("/admin/orders/dispatch-batch")
async def admin_dispatch_batch(
    date: Optional[str] = None, _admin: dict = Depends(require_area("orders", "view"))
):
    """
    Commandes du lot d'expédition d'un jour donné (défaut : prochain jour
    ouvrable courant). Payées, non annulées/expédiées/livrées, triées par paiement.
    """
    if not date:
        date = compute_dispatch_batch(datetime.now(timezone.utc))
    filt = {
        "dispatch_batch": date,
        "payment_status": "paid",
        "fulfillment_status": {"$nin": ["cancelled", "failed", "shipped", "delivered"]},
    }
    orders = (
        await db.orders.find(filt, {"_id": 0}).sort("paid_at", 1).to_list(500)
    )
    return {"batch_date": date, "count": len(orders), "orders": orders}


@api.put("/admin/orders/{order_id}/status")
async def admin_update_order(
    order_id: str,
    payment_status: Optional[str] = None,
    fulfillment_status: Optional[str] = None,
    _admin: dict = Depends(require_area("orders", "manage")),
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

    # Affecte le lot d'expédition au moment du paiement (idempotent).
    if (
        payment_status == "paid"
        and existing.get("payment_status") != "paid"
        and not existing.get("dispatch_batch")
    ):
        _paid_ref = update.get("paid_at") or existing.get("paid_at") or datetime.now(timezone.utc).isoformat()
        update["dispatch_batch"] = compute_dispatch_batch(_paid_ref)

    # Restock inventory when moving into cancelled/failed from a non-terminal state
    if (
        update.get("fulfillment_status") in ("cancelled", "failed")
        and existing.get("fulfillment_status") not in ("cancelled", "failed")
    ):
        await _restock_order_items(existing)

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
async def admin_confirm_payment(order_id: str, _admin: dict = Depends(require_area("orders", "manage"))):
    """One-click 'Mark as Paid' — atomically marks order as paid + processing + sends email."""
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Order not found")
    if existing.get("payment_status") == "paid":
        return existing  # idempotent
    updated = await _mark_order_paid(order_id, "Payment manually confirmed by admin")
    return updated or existing


# ---------------------------------------------------------------------------
# Gestion des membres staff — réservé au rôle "admin" (owner). Un staff ne
# peut jamais modifier ses propres permissions ni celles d'un autre membre.
# ---------------------------------------------------------------------------
STAFF_INVITE_TTL_HOURS = 72


# ---------------------------------------------------------------------------
# Journal d'audit — qui a fait quoi, quand. Deux sources d'entrées :
#  1. Automatique : toute action "manage" (mutation) passée par require_area()
#     est journalisée génériquement (méthode + route + zone + auteur).
#  2. Explicite : les actions sensibles sur les membres (invite, promotion,
#     permissions, révocation) sont journalisées avec un détail lisible,
#     puisqu'elles ne passent pas par require_area() (réservées owner-only).
# ---------------------------------------------------------------------------
async def _log_action(user: dict, action: str, detail: str = "", area: str = "") -> None:
    try:
        await db.admin_audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user.get("id"),
            "user_email": user.get("email"),
            "user_name": user.get("name"),
            "role": user.get("role"),
            "area": area,
            "action": action,
            "detail": detail,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logging.error("[audit] failed to log action=%s: %s", action, e)


def _staff_invite_html(accept_url: str, inviter_name: str, lang: str = "fr") -> str:
    if lang == "fr":
        heading = "Vous êtes invité·e à rejoindre l'équipe FIRONOVA"
        body = (f"{inviter_name} vous invite à accéder au panneau d'administration FIRONOVA. "
                f"Cliquez ci-dessous pour créer votre mot de passe et activer votre accès. "
                f"Ce lien expire dans {STAFF_INVITE_TTL_HOURS} heures.")
        btn = "Activer mon accès"
    else:
        heading = "You've been invited to the FIRONOVA team"
        body = (f"{inviter_name} invited you to access the FIRONOVA admin panel. "
                f"Click below to set your password and activate your access. "
                f"This link expires in {STAFF_INVITE_TTL_HOURS} hours.")
        btn = "Activate my access"
    return f"""
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px;color:#3A0A08;background:#FFFAF6">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">FIRONOVA<span style="color:#C20114">.</span></div>
      <h2 style="margin-top:24px">{heading}</h2>
      <p style="line-height:1.6">{body}</p>
      <a href="{accept_url}" style="display:inline-block;margin-top:16px;background:#3A0A08;color:#fff;
         padding:14px 28px;text-decoration:none;font-family:monospace;font-size:12px;
         letter-spacing:0.2em;text-transform:uppercase">{btn} →</a>
      <p style="margin-top:24px;font-size:12px;color:#6B0504">{accept_url}</p>
    </div>
    """


@api.get("/admin/staff")
async def admin_list_staff(_admin: dict = Depends(get_admin_user)):
    """Membres actifs (admin + staff) — les clients normaux (role=user) sont exclus."""
    staff = await db.users.find(
        {"role": {"$in": ["admin", "staff"]}},
        {"_id": 0, "password_hash": 0, "token_version": 0},
    ).sort("created_at", -1).to_list(200)
    return staff


@api.get("/admin/staff/invites")
async def admin_list_staff_invites(_admin: dict = Depends(get_admin_user)):
    """Invitations en attente — équivalent de l'onglet 'Demandes en attente'."""
    now = datetime.now(timezone.utc).isoformat()
    invites = await db.staff_invites.find(
        {"used": False, "expires_at": {"$gt": now}}, {"_id": 0, "token": 0}
    ).sort("created_at", -1).to_list(100)
    return invites


@api.post("/admin/staff/invite")
async def admin_invite_staff(payload: StaffInviteIn, request: Request, admin: dict = Depends(get_admin_user)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    _rate_limit("staff_invite", admin["id"], 20, 3600, "Too many invitations sent. Try again later.")

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.staff_invites.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name.strip(),
        "permissions": payload.permissions.model_dump(),
        "as_owner": payload.as_owner,
        "invited_by": admin["id"],
        "token": token,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=STAFF_INVITE_TTL_HOURS)).isoformat(),
        "used": False,
    })
    base = PUBLIC_BASE_URL or str(request.base_url).rstrip("/")
    accept_url = f"{base}/staff-accept?token={token}"
    asyncio.create_task(_send_email(
        email, "FIRONOVA — Invitation à rejoindre l'équipe",
        _staff_invite_html(accept_url, admin.get("name", "L'équipe FIRONOVA")),
    ))
    await _log_action(admin, "staff.invite", detail=f"Invited {email} as {'owner' if payload.as_owner else 'staff'}")
    return {"ok": True, "sent_to": email}


@api.delete("/admin/staff/invites/{invite_id}")
async def admin_cancel_staff_invite(invite_id: str, admin: dict = Depends(get_admin_user)):
    res = await db.staff_invites.delete_one({"id": invite_id, "used": False})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Invite not found")
    await _log_action(admin, "staff.invite_cancel", detail=f"Cancelled invite {invite_id}")
    return {"ok": True}


@api.post("/staff/accept")
async def staff_accept_invite(payload: StaffAcceptIn, response: Response):
    """Lien cliqué depuis l'email — pas d'authentification préalable, le
    token à usage unique + TTL sert de preuve. Crée le compte staff (ou
    owner, si l'invitation le précisait)."""
    now = datetime.now(timezone.utc).isoformat()
    invite = await db.staff_invites.find_one({"token": payload.token, "used": False})
    if not invite or invite["expires_at"] < now:
        raise HTTPException(status_code=400, detail="Invalid or expired invitation")
    if await db.users.find_one({"email": invite["email"]}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    as_owner = invite.get("as_owner", False)
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": invite["email"],
        "name": invite["name"],
        "password_hash": hash_password(payload.password),
        "role": "admin" if as_owner else "staff",
        "token_version": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if not as_owner:
        user_doc["permissions"] = invite["permissions"]
    await db.users.insert_one(user_doc)
    await db.staff_invites.update_one({"token": payload.token}, {"$set": {"used": True, "used_at": now}})

    role = user_doc["role"]
    token = create_access_token(user_doc["id"], user_doc["email"], role, token_version=0)
    set_auth_cookie(response, token)
    return {
        "id": user_doc["id"], "email": user_doc["email"], "name": user_doc["name"],
        "role": role, "permissions": user_doc.get("permissions"),
        # NOTE: auth cookie-only — pas de token dans le body.
    }


@api.put("/admin/staff/{user_id}/permissions")
async def admin_update_staff_permissions(user_id: str, payload: StaffPermissionsIn,
                                         admin: dict = Depends(get_admin_user)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot restrict another admin's access this way")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": "staff", "permissions": payload.model_dump()},
         "$inc": {"token_version": 1}},  # les changements de droits prennent effet immédiatement
    )
    await _log_action(admin, "staff.permissions_update",
                      detail=f"Updated permissions for {target.get('email')}: {payload.model_dump()}")
    return {"ok": True}


@api.post("/admin/staff/{user_id}/promote")
async def admin_promote_to_owner(user_id: str, admin: dict = Depends(get_admin_user)):
    """Fait passer un membre staff au rang de owner (accès total, y compris
    la gestion des autres membres). Réversible uniquement en révoquant puis
    ré-invitant — il n'y a volontairement pas de 'rétrograder un owner' pour
    éviter qu'un owner en soit accidentellement privé de son propre accès."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="This user is already an owner")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": "admin"}, "$unset": {"permissions": ""}, "$inc": {"token_version": 1}},
    )
    await _log_action(admin, "staff.promote_to_owner", detail=f"Promoted {target.get('email')} to owner")
    return {"ok": True}


@api.delete("/admin/staff/{user_id}")
async def admin_revoke_staff(user_id: str, admin: dict = Depends(get_admin_user)):
    """Révoque l'accès admin — le compte redevient un compte client normal,
    n'est PAS supprimé (historique de commandes éventuel préservé)."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot revoke your own access")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot revoke another admin this way")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"role": "user"}, "$unset": {"permissions": ""}, "$inc": {"token_version": 1}},
    )
    await _log_action(admin, "staff.revoke", detail=f"Revoked access for {target.get('email')}")
    return {"ok": True}


@api.get("/admin/audit-log")
async def admin_audit_log(limit: int = 200, admin: dict = Depends(get_admin_user)):
    """Journal d'audit — owner only. Couvre automatiquement toute action
    'manage' (mutation) sur les 35 endpoints admin, plus les actions
    explicites de gestion d'équipe (invite/promotion/permissions/révocation)."""
    limit = max(1, min(limit, 1000))
    entries = await db.admin_audit_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return entries


@api.get("/admin/customers")
async def admin_customers(_admin: dict = Depends(require_area("customers", "view"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "token_version": 0}).sort("created_at", -1).to_list(500)
    return users


@api.get("/admin/subscribers")
async def admin_list_subscribers(status: Optional[str] = None, _admin: dict = Depends(require_area("subscribers", "view"))):
    query = {"status": status} if status else {}
    subs = await db.subscribers.find(
        query, {"_id": 0, "unsubscribe_token": 0}
    ).sort("created_at", -1).to_list(5000)
    return subs


@api.get("/admin/subscribers.csv")
async def admin_subscribers_csv(status: Optional[str] = None, _admin: dict = Depends(require_area("subscribers", "view"))):
    query = {"status": status} if status else {}
    subs = await db.subscribers.find(query, {"_id": 0, "unsubscribe_token": 0}).to_list(5000)
    rows = [
        {
            "email": s.get("email", ""),
            "lang": s.get("lang", ""),
            "source": s.get("source", ""),
            "status": s.get("status", ""),
            "consent_at": s.get("consent_at", ""),
            "consent_ip": s.get("consent_ip", ""),
            "unsubscribed_at": s.get("unsubscribed_at") or "",
        }
        for s in subs
    ]
    return _csv_response(rows, f"fironova-subscribers-{datetime.now().strftime('%Y%m%d')}.csv")


@api.get("/admin/stats")
async def admin_stats(_admin: dict = Depends(require_area("dashboard", "view"))):
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
async def admin_add_order_note(order_id: str, payload: OrderNoteIn, admin: dict = Depends(require_area("orders", "manage"))):
    note = {
        "text": payload.text,
        "admin_email": admin["email"],
        "visible_to_customer": payload.visible_to_customer,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.orders.update_one({"id": order_id}, {"$push": {"notes": note}})
    if res.matched_count == 0:
        raise HTTPException(404, "Order not found")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if payload.visible_to_customer and order.get("email"):
        asyncio.create_task(send_customer_note_email(order, payload.text))
    return order


@api.post("/admin/orders/{order_id}/refund")
async def admin_refund_order(order_id: str, payload: RefundIn, admin: dict = Depends(require_area("orders", "manage"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    already = float(order.get("refunded_amount", 0) or 0)
    total = float(order.get("total", 0))
    amount = round(payload.amount, 2)
    if already + amount > total + 0.001:
        raise HTTPException(400, f"Refund exceeds order total (already refunded ${already:.2f} of ${total:.2f})")
    new_refunded = round(already + amount, 2)
    update = {"refunded_amount": new_refunded}
    if new_refunded >= total:
        update["payment_status"] = "refunded"
        update["fulfillment_status"] = "refunded"
    note = {
        "text": f"Refund issued: ${amount:.2f} CAD (total refunded ${new_refunded:.2f} / ${total:.2f})",
        "admin_email": admin["email"],
        "visible_to_customer": False,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await db.orders.update_one({"id": order_id}, {"$set": update, "$push": {"notes": note}})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if updated.get("email"):
        asyncio.create_task(send_refund_email(updated, amount, new_refunded))
    return updated


@api.post("/admin/orders/{order_id}/resend-email")
async def admin_resend_order_email(order_id: str, _admin: dict = Depends(require_area("orders", "manage"))):
    """Re-sends the order details / payment-instructions email to the customer."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if not order.get("email"):
        raise HTTPException(400, "Order has no customer email")
    heading = "Payment received" if order.get("payment_status") == "paid" else "Order received"
    html = _order_email_html(order, heading)
    await _send_email(order["email"], f"FIRONOVA — Order {order['order_number']} details", html)
    return {"ok": True, "sent_to": order["email"]}


@api.put("/admin/orders/{order_id}/shipping")
async def admin_set_shipping_info(order_id: str, payload: ShippingInfoIn, _admin: dict = Depends(require_area("orders", "manage"))):
    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0, "shipping_info": 1})
    if not existing_order:
        raise HTTPException(404, "Order not found")
    prev = existing_order.get("shipping_info") or {}

    shipped_at = payload.shipped_at or (datetime.now(timezone.utc).isoformat() if payload.tracking_number else None)
    # PIÈGE : ce PUT remplaçait shipping_info EN BLOC, ce qui effaçait label_url,
    # cp_group_id et surtout cp_transmitted. La commande sortait alors de la
    # requête du manifeste → surcharge de 2 $/article encourue en silence.
    # On repart donc de l'état existant et on ne surcharge que les champs manuels.
    shipping_info = {
        **prev,
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


# ---------------------------------------------------------------------------
# BLOC 4 — Postes Canada : étiquettes, manifeste, annulation.
# Le tarif live et le suivi existaient déjà. Ce qui manquait : générer
# l'étiquette, et surtout TRANSMETTRE LE MANIFESTE. Sans manifeste, Postes
# Canada facture chaque envoi non payé avec 2 $ de surcharge par article et
# retire le rabais d'automatisation.
# ---------------------------------------------------------------------------
def _order_weight_kg(order: dict) -> float:
    """Poids d'après les line_items figés sur la commande (pas de relecture produit :
    le poids doit refléter ce qui a été vendu, même si la fiche a changé depuis)."""
    total_g = 0.0
    for it in order.get("line_items") or []:
        total_g += float(it.get("weight_grams") or 50.0) * int(it.get("qty") or 1)
    return max(0.1, round(total_g / 1000.0, 3)) if total_g else 0.5


@api.get("/admin/orders/{order_id}/shipping-rates")
async def admin_order_shipping_rates(order_id: str, _admin: dict = Depends(require_area("orders", "view"))):
    """Services disponibles pour CETTE commande, afin de peupler le sélecteur admin."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    if not is_canada_post_configured():
        return {"configured": False, "rates": []}
    ship = order.get("shipping_address") or {}
    rates = await _canada_post_get_rates(
        ship.get("postal_code", ""), ship.get("country") or "CA", _order_weight_kg(order)
    )
    return {"configured": True, "rates": rates}


@api.post("/admin/orders/{order_id}/create-label")
async def admin_create_label(order_id: str, payload: CreateLabelIn,
                             _admin: dict = Depends(require_area("orders", "manage"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")

    info = order.get("shipping_info") or {}
    # Idempotence exigée : ne jamais recréer une étiquette déjà émise —
    # sinon on paie deux fois le même colis.
    if info.get("label_url") and info.get("tracking_number"):
        return {"already_existed": True, "shipping_info": info}

    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")

    res = await _canada_post_create_shipment(order, payload.service_code, _order_weight_kg(order))
    label_url = await _canada_post_get_artifact(res["label_href"], order_id)

    now = datetime.now(timezone.utc).isoformat()
    shipping_info = {
        **info,
        "carrier": "Canada Post",
        "tracking_number": res["pin"],
        "label_url": label_url,
        "cp_shipment_id": res["shipment_id"],
        "cp_group_id": res["group_id"],
        "cp_transmitted": False,   # tant que False → surcharge de 2 $ encourue
        "service_code": payload.service_code,
        "shipped_at": now,
    }
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"shipping_info": shipping_info, "fulfillment_status": "shipped"},
         "$push": {"notes": {
             "id": str(uuid.uuid4()),
             "text": f"Étiquette Postes Canada créée — suivi {res['pin']} (lot {res['group_id']}).",
             "author": "system",
             "created_at": now,
         }}},
    )
    fresh = await db.orders.find_one({"id": order_id}, {"_id": 0})
    asyncio.create_task(send_shipping_notification(fresh))
    return {"already_existed": False, "shipping_info": shipping_info}


@api.post("/admin/orders/{order_id}/void-label")
async def admin_void_label(order_id: str, _admin: dict = Depends(require_area("orders", "manage"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")
    info = order.get("shipping_info") or {}
    if info.get("cp_transmitted"):
        raise HTTPException(400, "Label already transmitted to Canada Post — it can no longer be voided.")
    ok = await _canada_post_void(info.get("cp_shipment_id", ""))
    if not ok:
        raise HTTPException(502, "Canada Post refused to void this label")
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"shipping_info": {"carrier": "", "tracking_number": "", "shipped_at": None},
                  "fulfillment_status": "processing"},
         "$push": {"notes": {
             "id": str(uuid.uuid4()),
             "text": "Étiquette Postes Canada annulée (void).",
             "author": "system",
             "created_at": datetime.now(timezone.utc).isoformat(),
         }}},
    )
    return {"ok": True, "voided": True}


@api.get("/admin/shipping/pending-manifest")
async def admin_pending_manifest(_admin: dict = Depends(require_area("orders", "view"))):
    """Alimente la bannière rouge de l'admin : combien d'étiquettes non transmises."""
    cursor = db.orders.find(
        {"shipping_info.cp_group_id": {"$nin": [None, ""]}, "shipping_info.cp_transmitted": False},
        {"_id": 0, "id": 1, "order_number": 1, "shipping_info": 1},
    )
    pending = await cursor.to_list(2000)
    groups: dict = {}
    for o in pending:
        gid = (o.get("shipping_info") or {}).get("cp_group_id")
        groups.setdefault(gid, 0)
        groups[gid] += 1
    return {
        "configured": is_canada_post_configured(),
        "pending_count": len(pending),
        "groups": [{"group_id": g, "count": c} for g, c in sorted(groups.items())],
    }


@api.post("/admin/shipping/transmit")
async def admin_transmit_manifest(_admin: dict = Depends(require_area("orders", "manage"))):
    """À faire CHAQUE JOUR. Oublier = 2 $/article de surcharge + perte du rabais."""
    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")
    pending = await db.orders.find(
        {"shipping_info.cp_group_id": {"$nin": [None, ""]}, "shipping_info.cp_transmitted": False},
        {"_id": 0, "id": 1, "shipping_info": 1},
    ).to_list(2000)
    if not pending:
        return {"ok": True, "transmitted_groups": [], "manifests": [], "orders_marked": 0}

    group_ids = sorted({(o["shipping_info"] or {}).get("cp_group_id") for o in pending if (o["shipping_info"] or {}).get("cp_group_id")})
    manifests: list = []
    done_groups: list = []
    for gid in group_ids:
        try:
            hrefs = await _canada_post_transmit(gid)
        except HTTPException:
            logging.error("Transmission du manifeste échouée pour le lot %s", gid)
            continue
        manifests.extend(hrefs)
        done_groups.append(gid)

    marked = 0
    if done_groups:
        res = await db.orders.update_many(
            {"shipping_info.cp_group_id": {"$in": done_groups}, "shipping_info.cp_transmitted": False},
            {"$set": {"shipping_info.cp_transmitted": True,
                      "shipping_info.cp_transmitted_at": datetime.now(timezone.utc).isoformat()}},
        )
        marked = res.modified_count
        await db.manifests.insert_one({
            "id": str(uuid.uuid4()),
            "group_ids": done_groups,
            "manifest_links": manifests,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    if not done_groups:
        raise HTTPException(502, "No manifest could be transmitted — check the Canada Post logs.")
    return {"ok": True, "transmitted_groups": done_groups, "manifests": manifests, "orders_marked": marked}


@api.put("/admin/products/{product_id}/stock")
async def admin_adjust_stock(product_id: str, payload: StockAdjustIn, _admin: dict = Depends(require_area("products", "manage"))):
    res = await db.products.update_one({"id": product_id}, {"$inc": {"stock": payload.delta}})
    if res.matched_count == 0:
        raise HTTPException(404, "Product not found")
    if payload.delta > 0:
        asyncio.create_task(_maybe_notify_restock(product_id, None))
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@api.get("/admin/stock-notifications")
async def admin_list_stock_notifications(_admin: dict = Depends(require_area("products", "view"))):
    """Overview of pending back-in-stock subscriptions, grouped implicitly by product/variant."""
    pending = await db.stock_notifications.find({"notified": False}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return pending


# ---------------------------------------------------------------------------
# Admin — coupons
# ---------------------------------------------------------------------------
@api.get("/admin/coupons")
async def admin_list_coupons(_admin: dict = Depends(require_area("coupons", "view"))):
    return await db.coupons.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.post("/admin/coupons")
async def admin_create_coupon(payload: CouponIn, _admin: dict = Depends(require_area("coupons", "manage"))):
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
async def admin_update_coupon(coupon_id: str, payload: CouponIn, _admin: dict = Depends(require_area("coupons", "manage"))):
    update = payload.model_dump()
    update["code"] = update["code"].upper().strip()
    res = await db.coupons.update_one({"id": coupon_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Coupon not found")
    return await db.coupons.find_one({"id": coupon_id}, {"_id": 0})


@api.delete("/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, admin: dict = Depends(require_area("coupons", "manage"))):
    return await _soft_delete("coupons", coupon_id, admin)


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
async def admin_list_zones(_admin: dict = Depends(require_area("shipping", "view"))):
    zones = await db.shipping_zones.find({"deleted_at": None}, {"_id": 0}).sort("name", 1).to_list(200)
    # attach methods
    out = []
    for z in zones:
        methods = await db.shipping_methods.find({"zone_id": z["id"], "deleted_at": None}, {"_id": 0}).to_list(200)
        z["methods"] = methods
        out.append(z)
    return out


@api.post("/admin/shipping/zones")
async def admin_create_zone(payload: ShippingZoneIn, _admin: dict = Depends(require_area("shipping", "manage"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.shipping_zones.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/shipping/zones/{zone_id}")
async def admin_update_zone(zone_id: str, payload: ShippingZoneIn, _admin: dict = Depends(require_area("shipping", "manage"))):
    res = await db.shipping_zones.update_one({"id": zone_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Zone not found")
    return await db.shipping_zones.find_one({"id": zone_id}, {"_id": 0})


@api.delete("/admin/shipping/zones/{zone_id}")
async def admin_delete_zone(zone_id: str, admin: dict = Depends(require_area("shipping", "manage"))):
    # Cascade : les méthodes de cette zone vont aussi en corbeille, pour
    # pouvoir tout restaurer ensemble si la suppression était une erreur.
    methods = await db.shipping_methods.find({"zone_id": zone_id, "deleted_at": None}, {"_id": 0}).to_list(200)
    for m in methods:
        await _soft_delete("shipping_methods", m["id"], admin)
    return await _soft_delete("shipping_zones", zone_id, admin)


@api.post("/admin/shipping/methods")
async def admin_create_method(payload: ShippingMethodIn, _admin: dict = Depends(require_area("shipping", "manage"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.shipping_methods.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/shipping/methods/{method_id}")
async def admin_update_method(method_id: str, payload: ShippingMethodIn, _admin: dict = Depends(require_area("shipping", "manage"))):
    res = await db.shipping_methods.update_one({"id": method_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Method not found")
    return await db.shipping_methods.find_one({"id": method_id}, {"_id": 0})


@api.delete("/admin/shipping/methods/{method_id}")
async def admin_delete_method(method_id: str, admin: dict = Depends(require_area("shipping", "manage"))):
    return await _soft_delete("shipping_methods", method_id, admin)


# ---------------------------------------------------------------------------
# Admin — Analytics
# ---------------------------------------------------------------------------
@api.get("/admin/analytics")
async def admin_analytics(_admin: dict = Depends(require_area("dashboard", "view"))):
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
async def admin_orders_csv(status_group: Optional[str] = None, _admin: dict = Depends(require_area("orders", "view"))):
    orders = await db.orders.find(_status_group_filter(status_group), {"_id": 0}).sort("created_at", -1).to_list(5000)
    return _csv_response(_orders_export_rows(orders), f"fironova-orders-{datetime.now().strftime('%Y%m%d')}.csv")


def _orders_export_rows(orders: list) -> list:
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
            "refunded_cad": o.get("refunded_amount", 0),
            "tracking_number": (o.get("shipping_info") or {}).get("tracking_number", ""),
            "carrier": (o.get("shipping_info") or {}).get("carrier", ""),
        })
    return rows


def _xlsx_response(rows: list, filename: str) -> Response:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    wb = Workbook()
    ws = wb.active
    headers = list(rows[0].keys()) if rows else ["no_data"]
    ws.append(headers)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="050505", end_color="050505", fill_type="solid")
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
    for r in rows:
        ws.append([r.get(h, "") for h in headers])
    for col_idx, h in enumerate(headers, start=1):
        width = max([len(str(h))] + [len(str(r.get(h, ""))) for r in rows[:500]]) + 2
        ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = min(width, 50)
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.get("/admin/orders.xlsx")
async def admin_orders_xlsx(status_group: Optional[str] = None, _admin: dict = Depends(require_area("orders", "view"))):
    orders = await db.orders.find(_status_group_filter(status_group), {"_id": 0}).sort("created_at", -1).to_list(5000)
    return _xlsx_response(_orders_export_rows(orders), f"fironova-orders-{datetime.now().strftime('%Y%m%d')}.xlsx")


@api.get("/admin/products.csv")
async def admin_products_csv(_admin: dict = Depends(require_area("products", "view"))):
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
    return _csv_response(rows, f"fironova-products-{datetime.now().strftime('%Y%m%d')}.csv")


@api.get("/admin/products.xlsx")
async def admin_products_xlsx(_admin: dict = Depends(require_area("products", "view"))):
    products = await db.products.find({}, {"_id": 0}).sort("name_en", 1).to_list(2000)
    rows = []
    for p in products:
        rows.append({
            "slug": p.get("slug", ""),
            "name_en": p.get("name_en", ""),
            "name_fr": p.get("name_fr", ""),
            "category": p.get("category", ""),
            "purity": p.get("purity", ""),
            "dosage_mg": p.get("dosage_mg", 0),
            "price_cad": p.get("price_cad", 0),
            "stock": p.get("stock", 0),
            "variants": "; ".join(
                f"{v.get('name','')} ${v.get('price',0)} stock={v.get('stock',0)}" for v in (p.get("variants") or [])
            ),
            "low_stock_threshold": p.get("low_stock_threshold", 10),
            "featured": p.get("featured", False),
            "lab_tested": p.get("lab_tested", False),
            "active": p.get("active", True),
        })
    return _xlsx_response(rows, f"fironova-products-{datetime.now().strftime('%Y%m%d')}.xlsx")


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
    c.drawString(20 * mm, h - 13 * mm, "FIRONOVA")
    c.setFillColor(rl_colors.HexColor("#C20114"))
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
    c.drawCentredString(w / 2, 16 * mm, f"FIRONOVA · CANADA · INVOICE GENERATED {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")

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
    # If paid, mark it paid via the single idempotent entry point. Safe even if
    # the Stripe webhook already did it concurrently — only one caller wins.
    if status_resp.payment_status == "paid":
        await _mark_order_paid(txn["order_id"], "Payment confirmed via Stripe checkout status")
    # Expired Stripe session = active payment failure → "failed" (distinct from voluntary "cancelled")
    if status_resp.status == "expired":
        order = await db.orders.find_one({"id": txn["order_id"]}, {"_id": 0})
        if order and order.get("payment_status") not in ("paid",) and order.get("fulfillment_status") not in ("cancelled", "failed"):
            await db.orders.update_one(
                {"id": txn["order_id"]},
                {"$set": {"payment_status": "failed", "fulfillment_status": "failed"},
                 "$push": {"notes": {
                     "id": str(uuid.uuid4()),
                     "text": "Payment failed: Stripe checkout session expired",
                     "author": "system",
                     "created_at": datetime.now(timezone.utc).isoformat(),
                 }}},
            )
            await _restock_order_items(order)
    return {
        "session_id": session_id,
        "payment_status": status_resp.payment_status,
        "status": status_resp.status,
        "amount_total": status_resp.amount_total,
        "currency": status_resp.currency,
    }


@api.post("/webhook/nowpayments")
async def nowpayments_ipn(request: Request):
    """NOWPayments IPN callback. HMAC-SHA512 signature verified against sorted JSON payload."""
    if not NOWPAYMENTS_IPN_SECRET:
        raise HTTPException(503, "IPN not configured")
    raw = await request.body()
    sig = request.headers.get("x-nowpayments-sig", "")
    try:
        payload = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid payload")
    expected = hmac.new(
        NOWPAYMENTS_IPN_SECRET.encode(),
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(),
        hashlib.sha512,
    ).hexdigest()
    if not sig or not hmac.compare_digest(expected, sig):
        logging.warning("NOWPayments IPN: invalid signature")
        raise HTTPException(401, "Invalid signature")
    order_id = payload.get("order_id")
    np_status = payload.get("payment_status", "")
    if not order_id:
        return {"ok": True}

    # Défense en profondeur au-delà du HMAC : on n'agit que sur une commande
    # qui existe, qui utilise bien ce moyen de paiement, et dont le montant
    # facturé correspond au nôtre. Un IPN "finished" avec un montant divergent
    # n'est JAMAIS auto-confirmé — il est journalisé pour revue manuelle.
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order or order.get("payment_method") != "nowpayments":
        logging.warning("NOWPayments IPN: commande inconnue/incohérente %s — ignorée", order_id)
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
        await db.orders.update_one({"id": order_id}, {"$push": {"notes": {
            "id": str(uuid.uuid4()),
            "text": (f"IPN 'finished' reçu avec un montant divergent "
                     f"(${ipn_amount:.2f} vs ${order_total:.2f}) — paiement NON auto-confirmé, "
                     f"à vérifier manuellement."),
            "author": "system",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }}})
        return {"ok": True}

    updates = {"payment_info.provider_response.payment_status": np_status}
    if payload.get("payment_id"):
        updates["payment_info.provider_response.payment_id"] = str(payload["payment_id"])
    if payload.get("pay_currency"):
        updates["payment_info.provider_response.pay_currency"] = payload["pay_currency"]
    await db.orders.update_one({"id": order_id}, {"$set": updates})
    if np_status == "finished":
        fresh = await _mark_order_paid(
            order_id,
            f"Crypto payment confirmed via NOWPayments IPN (payment_id {payload.get('payment_id')})",
        )
        if fresh:
            logging.info("Order %s marked paid via NOWPayments IPN", order_id)
    return {"ok": True}


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
        # Invoice/widget flow (paid state is pushed via IPN) or mock mode: return DB status
        return {
            "order_id": order_id,
            "payment_status": order.get("payment_status"),
            "np_status": np_info.get("payment_status", "waiting"),
            **({"mock": True} if np_info.get("mock") else {}),
        }
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
                "paid_at": (_pa := datetime.now(timezone.utc).isoformat()),
                "dispatch_batch": compute_dispatch_batch(_pa),
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
            # Point d'entrée unique et idempotent : que ce webhook arrive avant,
            # après, ou en même temps que le polling stripe_status, un seul des
            # deux fera la transition (garde $ne "paid" dans _mark_order_paid).
            await _mark_order_paid(txn["order_id"], "Payment confirmed via Stripe webhook")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public meta
# ---------------------------------------------------------------------------
@api.get("/meta")
async def meta():
    return {
        "store": "FIRONOVA",
        "currency": "CAD",
        "shipping_flat_cad": SHIPPING_FLAT_CAD,
        "provinces": PROVINCES_CA,
        "min_age": 19,
        "interac_email": INTERAC_EMAIL,
        "coa_page_enabled": COA_PAGE_ENABLED,
        "canada_post_enabled": bool(CANADA_POST_API_KEY and CANADA_POST_CUSTOMER_NUMBER),
        "prelaunch_enabled": PRELAUNCH_ENABLED,
        "launch_coupon_code": LAUNCH_COUPON_CODE,
        # PRELAUNCH_PREVIEW_TOKEN n'est JAMAIS exposé ici — il ne se vérifie que
        # côté serveur via GET /prelaunch/preview.
    }


@api.get("/")
async def root():
    return {"service": "fironova-api", "status": "ok"}


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
    await db.users.create_index("id", unique=True)
    await db.products.create_index("slug", unique=True)
    await db.products.create_index("id", unique=True)
    await db.products.create_index([("active", 1), ("category", 1)])
    await db.products.create_index([("active", 1), ("featured", 1)])
    await db.orders.create_index("order_number")
    await db.orders.create_index("user_id")
    await db.orders.create_index("id", unique=True)
    # Écrans admin & watchdog : sans ces index, chaque poll = COLLSCAN complet.
    await db.orders.create_index([("payment_status", 1), ("created_at", -1)])
    await db.orders.create_index([("fulfillment_status", 1), ("created_at", -1)])
    await db.orders.create_index([("dispatch_batch", 1), ("payment_status", 1)])
    await db.orders.create_index([("created_at", -1)])
    await db.coupons.create_index("code", unique=True)
    await db.payment_transactions.create_index("session_id", unique=True)
    await db.payment_transactions.create_index("order_id")
    await db.stock_notifications.create_index([("product_id", 1), ("variant_id", 1), ("notified", 1)])
    await db.subscribers.create_index("email", unique=True)
    await db.subscribers.create_index("unsubscribe_token", unique=True)
    await db.subscribers.create_index("status")
    await db.addresses.create_index([("user_id", 1), ("created_at", -1)])
    await db.categories.create_index("slug", unique=True)
    await db.menus.create_index("slug", unique=True)
    await db.menus.create_index([("location", 1), ("published", 1), ("display_order", 1)])
    # Bannière « manifeste non transmis » : sans index, chaque chargement de
    # l'admin scanne toute la collection orders.
    await db.orders.create_index([("shipping_info.cp_transmitted", 1), ("shipping_info.cp_group_id", 1)])
    await db.email_change_requests.create_index("token", unique=True)
    await db.email_change_requests.create_index("user_id")
    await db.staff_invites.create_index("token", unique=True)
    await db.staff_invites.create_index("email")
    await db.admin_audit_log.create_index([("created_at", -1)])
    await db.admin_audit_log.create_index("user_id")
    await db.products.create_index("deleted_at")
    await db.coupons.create_index("deleted_at")
    await db.shipping_zones.create_index("deleted_at")
    await db.shipping_methods.create_index("deleted_at")
    await db.orders.create_index("deleted_at")

    # Admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    hashed = hash_password(ADMIN_PASSWORD)
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL.lower(),
            "name": "FIRONOVA Admin",
            "password_hash": hashed,
            "role": "admin",
            "token_version": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        # Rotation de mot de passe détectée (ADMIN_PASSWORD changé côté env) :
        # on incrémente token_version pour révoquer immédiatement toute
        # session admin ouverte avec l'ancien mot de passe.
        await db.users.update_one(
            {"email": ADMIN_EMAIL.lower()},
            {"$set": {"password_hash": hashed, "role": "admin"},
             "$inc": {"token_version": 1}},
        )

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
            asyncio.create_task(_maybe_notify_restock(it["product_id"], None))
            continue
        await db.products.update_one(
            {"id": it["product_id"], "variants.id": it["variant_id"]},
            {"$inc": {"variants.$.stock": it["qty"]}},
        )
        asyncio.create_task(_maybe_notify_restock(it["product_id"], it["variant_id"]))


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
            # Rendre l'usage du coupon s'il avait été décompté (garde de sécurité :
            # avec le nouveau flux, le coupon n'est normalement compté qu'au
            # paiement confirmé, donc coupon_counted ne devrait jamais être True
            # ici — sauf commandes créées avant ce correctif).
            c = order.get("coupon")
            if c and c.get("code") and order.get("coupon_counted"):
                await db.coupons.update_one(
                    {"code": c["code"], "used_count": {"$gt": 0}},
                    {"$inc": {"used_count": -1}},
                )
                await db.orders.update_one({"id": order["id"]}, {"$set": {"coupon_counted": False}})
            logging.info("Auto-cancelled unpaid order %s", order.get("order_number", order["id"]))
    return len(stale)


async def _unpaid_orders_watchdog():
    while True:
        try:
            await cancel_stale_unpaid_orders()
        except Exception as e:
            logging.error("Unpaid order watchdog error: %s", e)
        await asyncio.sleep(3600)


async def _acquire_worker_lock(name: str, ttl_seconds: int = 120) -> bool:
    """Verrou coopératif Mongo : un seul worker exécute les tâches de fond.
    Sans ça, N workers uvicorn lancent N boucles concurrentes sur les mêmes
    commandes (auto-cancel, backfill)."""
    now = datetime.now(timezone.utc)
    try:
        await db.locks.update_one(
            {"_id": name, "expires_at": {"$lt": now.isoformat()}},
            {"$set": {"expires_at": (now + timedelta(seconds=ttl_seconds)).isoformat(),
                      "owner": str(uuid.uuid4())}},
            upsert=True,
        )
        return True
    except Exception:
        return False  # duplicate key = un autre worker détient déjà le verrou


async def _seed_categories_from_products() -> None:
    """Dérive les catégories réelles à partir des slugs déjà portés par les produits.
    Idempotent ($setOnInsert) : une catégorie éditée ensuite par l'admin n'est
    jamais réécrite au redéploiement. Aucun produit n'est touché."""
    try:
        slugs = [x for x in await db.products.distinct("category") if x and _SLUG_RE.match(str(x))]
        # Libellés par défaut alignés sur les clés i18n existantes.
        labels = {
            "healing": ("Healing & Recovery", "Guérison et récupération"),
            "weight-loss": ("Weight Management", "Gestion du poids"),
            "gh-secretagogues": ("GH Secretagogues", "Sécrétagogues de GH"),
            "cognitive": ("Cognitive", "Cognitif"),
            "longevity": ("Longevity", "Longévité"),
        }
        for i, slug in enumerate(sorted(slugs)):
            en, fr = labels.get(slug, (slug.replace("-", " ").title(), slug.replace("-", " ").title()))
            await db.categories.update_one(
                {"slug": slug},
                {"$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "slug": slug,
                    "name_en": en,
                    "name_fr": fr,
                    "published": True,
                    "display_order": i,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
        if slugs:
            logging.info("categories seed: %d slug(s) vérifié(s)", len(slugs))
    except Exception as e:  # pragma: no cover
        logging.error("categories seed failed: %s", e)


async def _seed_default_menus() -> None:
    """Reproduit à l'identique la navigation actuellement codée en dur, pour que
    rien ne bouge visuellement au premier déploiement. $setOnInsert uniquement."""
    defaults = [
        {
            "slug": "main-navigation", "name_en": "Main navigation", "name_fr": "Navigation principale",
            "location": "header", "display_order": 0,
            "items": [
                {"label_en": "Catalog", "label_fr": "Catalogue", "url": "/catalog", "display_order": 0},
                {"label_en": "Lab", "label_fr": "Labo", "url": "/lab", "display_order": 1},
                {"label_en": "About", "label_fr": "À propos", "url": "/about", "display_order": 2},
            ],
        },
        {
            "slug": "footer-shop", "name_en": "Shop", "name_fr": "Boutique",
            "location": "footer", "display_order": 1,
            "items": [
                {"label_en": "Catalog", "label_fr": "Catalogue", "url": "/catalog", "display_order": 0},
                {"label_en": "Healing & Recovery", "label_fr": "Guérison et récupération", "url": "/catalog?cat=healing", "display_order": 1},
                {"label_en": "Weight Management", "label_fr": "Gestion du poids", "url": "/catalog?cat=weight-loss", "display_order": 2},
                {"label_en": "Cognitive", "label_fr": "Cognitif", "url": "/catalog?cat=cognitive", "display_order": 3},
            ],
        },
        {
            "slug": "footer-legal", "name_en": "Legal", "name_fr": "Légal",
            "location": "footer", "display_order": 2,
            "items": [
                {"label_en": "Terms", "label_fr": "Conditions", "url": "/compliance", "display_order": 0},
                {"label_en": "Privacy", "label_fr": "Confidentialité", "url": "/privacy", "display_order": 1},
                {"label_en": "Shipping", "label_fr": "Expédition", "url": "/compliance#shipping", "display_order": 2},
                {"label_en": "FAQ", "label_fr": "FAQ", "url": "/faq", "display_order": 3},
            ],
        },
    ]
    try:
        for m in defaults:
            items = []
            for it in m["items"]:
                items.append({
                    "id": str(uuid.uuid4()), "published": True, "open_new_tab": False, **it,
                })
            await db.menus.update_one(
                {"slug": m["slug"]},
                {"$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "slug": m["slug"], "name_en": m["name_en"], "name_fr": m["name_fr"],
                    "location": m["location"], "published": True,
                    "display_order": m["display_order"], "items": items,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
    except Exception as e:  # pragma: no cover
        logging.error("menus seed failed: %s", e)


async def _seed_launch_coupon() -> None:
    """Provisionne le coupon de lancement 15 %. $setOnInsert : si tu l'édites
    ensuite dans l'admin, le redéploiement ne l'écrase pas."""
    try:
        await db.coupons.update_one(
            {"code": LAUNCH_COUPON_CODE},
            {"$setOnInsert": {
                "id": str(uuid.uuid4()),
                "code": LAUNCH_COUPON_CODE,
                "discount_type": "percent",
                "value": 15.0,
                "min_subtotal": 0.0,
                "usage_limit": None,
                "used_count": 0,
                "active": True,
                "expires_at": None,
                "deleted_at": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as e:  # pragma: no cover
        logging.error("launch coupon seed failed: %s", e)


@app.on_event("startup")
async def startup_event():
    await seed_admin_and_products()
    await _seed_categories_from_products()
    await _seed_default_menus()
    await _seed_launch_coupon()
    if await _acquire_worker_lock("background_tasks"):
        asyncio.create_task(_unpaid_orders_watchdog())
        asyncio.create_task(_backfill_dispatch_batch())
        asyncio.create_task(_trash_auto_purge_watchdog())


async def _backfill_dispatch_batch():
    """Renseigne dispatch_batch pour les commandes payées qui n'en ont pas (non destructif)."""
    try:
        cursor = db.orders.find(
            {"payment_status": "paid", "paid_at": {"$ne": None},
             "dispatch_batch": {"$in": [None, ""]}},
            {"_id": 0, "id": 1, "paid_at": 1},
        )
        n = 0
        async for o in cursor:
            batch = compute_dispatch_batch(o["paid_at"])
            await db.orders.update_one({"id": o["id"]}, {"$set": {"dispatch_batch": batch}})
            n += 1
        if n:
            logging.info("dispatch_batch backfill: %d commande(s) mise(s) à jour", n)
    except Exception as e:  # pragma: no cover
        logging.error("dispatch_batch backfill failed: %s", e)


@app.on_event("shutdown")
async def shutdown_event():
    client.close()


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api)

# CORS crédentialé : le navigateur refuse Access-Control-Allow-Origin: * dès
# que des cookies sont envoyés. On échoue vite en cas de mauvaise config.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
if "*" in _cors_origins:
    raise RuntimeError(
        "CORS_ORIGINS doit lister des origines explicites (ex. https://app.fironova.ca) — "
        "'*' est interdit avec une auth par cookie (credentialed)."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,  # Auth cookie-only : le cookie httpOnly access_token doit traverser
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
FN_EOF_09E2A4ED
echo "    backend/server.py"
mkdir -p "$(dirname design_guidelines.json)"
cat > design_guidelines.json << 'FN_EOF_D242D386'
{
  "project_name": "FIRONOVA",
  "_status": "SOURCE DE VÉRITÉ UI. Aligné sur frontend/src/styles/tokens.css (v1.0.0 « LE SIGNAL »), frontend/tailwind.config.js et frontend/src/index.css. Toute modification ici doit être répercutée dans ces trois fichiers — et inversement. Remplace l'ancienne spec NORDPEP / Archetype 4 (Swiss & High-Contrast), qui est OBSOLÈTE et ne doit plus être appliquée.",
  "theme_and_archetype": {
    "theme": "light",
    "archetype": "Maison de luxe editorial — « LE SIGNAL »",
    "description": "Papier chaud, encre oxblood, filet copper, et un unique rouge signal qui trace LA LIGNE. Langage de formes DOUX et éditorial : cartes arrondies, boutons en pilule, ombres chaudes, panneaux grenat arrondis. Crédibilité scientifique exprimée par la donnée (chromatogramme HPLC, lots, pureté en mono) plutôt que par le brutalisme. Précision de laboratoire présentée comme un objet de maison de luxe.",
    "explicitly_not": [
      "PAS de brutalisme suisse monochrome (rounded-none, hard shadows, noir/blanc pur, bordures noires pleine largeur)",
      "PAS de bleu ou navy pharma (#1E3A5F et dérivés) — c'est l'ancienne direction « Nordic Clinical », abandonnée",
      "PAS de dégradés bleu/violet",
      "PAS de Cabinet Grotesk / Satoshi (polices non licenciées, non chargées)",
      "PAS de couleurs Tailwind par défaut (bg-red-600, bg-orange-500, text-white…) — uniquement les tokens FIRONOVA",
      "PAS de photo glaciaire nordique en héros — le chromatogramme HPLC est la signature"
    ]
  },
  "global_rules": [
    "Le rouge signal #C20114 est réservé à LA LIGNE (trait HPLC) et au CTA primaire. Rien d'autre.",
    "Toute surface est du papier #FFFAF6. Le blanc pur #FFFFFF n'est pas une couleur de la marque.",
    "La donnée (lots, pureté, prix, séquences, dosages, SKU, n° de commande) est TOUJOURS en JetBrains Mono, tabular-nums, couleur copper.",
    "Rayons via tokens : rounded-sm 8px (contrôles) / rounded-md 12px (chips, tuiles data) / rounded-lg 16px (cartes, panneaux, modales). Les CTA et badges sont en PILULE (rounded-full). Jamais rounded-none par défaut.",
    "Ombres chaudes uniquement (.shadow-luxe / .shadow-luxe-lg / .card-hover). Aucune hard shadow brutaliste.",
    "Bordures : 1px solid var(--fn-faint) (#E9DED4). Pas de border noir.",
    "Règle « two rooms, one person » : .font-display = Space Grotesk (voix boutique). Instrument Serif = .font-social, voix feed/social UNIQUEMENT, jamais dans l'UI boutique.",
    "Tout élément interactif DOIT porter un data-testid (kebab-case, orienté rôle). Les testIds existants dans frontend/src/constants/testIds/ sont contractuels : ne jamais les renommer ni les supprimer.",
    "Bilingue FR/EN non négociable : toute chaîne visible passe par useLang()/t() et i18n.js. Le toggle FR/EN reste accessible dans le header et persiste en localStorage (fironova_lang).",
    "Un seul mouvement signature : le tracé qui se dessine (.hplc-trace / .fn-line-draw). Tout est sous prefers-reduced-motion.",
    "Mention RUO (« For Research Use Only / Usage recherche uniquement ») visible en pied de page sur chaque écran (.fn-ruo).",
    "Surfaces claires = bg-paper. Surfaces profondes = bg-garnet avec texte text-paper. Ne jamais écrire bg-white / text-white : ce sont des couleurs hors marque.",
    "Les couleurs Tailwind par défaut sont interdites. Tout passe par la palette étendue (paper, ink, garnet, copper, copperlight, signal, faint, inkmuted, success, warning)."
  ],
  "typography": {
    "fonts": {
      "display_store": "Space Grotesk (700) — voix boutique, titres et H1/H2",
      "social": "Instrument Serif — voix feed/social uniquement",
      "body": "Inter",
      "data": "JetBrains Mono — lots, pureté, prix, séquences, IDs"
    },
    "scale": {
      "t1": "12px — data, légal, captions (mono)",
      "t2": "14px — UI, boutons",
      "t3": "16px — body",
      "t4": "21px — chapô",
      "t5": "28px — H2 / titres de carte",
      "t6": "42px — titres de section",
      "t7": "76px — hero display"
    },
    "hierarchy": {
      "h1": "font-display text-[clamp(2.5rem,6vw,76px)] font-bold tracking-[-0.01em] leading-[0.95]",
      "h2": "font-display text-[42px] font-bold tracking-[-0.01em]",
      "h3": "font-display text-[28px] font-medium",
      "body": "font-sans text-base leading-relaxed",
      "labels_and_overline": "font-mono text-[12px] uppercase tracking-[0.18em] text-[color:var(--fn-copper)]"
    },
    "instructions": "Ne jamais utiliser Instrument Serif pour titrer la boutique. Les chiffres passent en font-mono avec font-variant-numeric: tabular-nums (classe utilitaire .fn-data)."
  },
  "colors": {
    "tokens": {
      "--fn-paper": "#FFFAF6",
      "--fn-ink": "#3A0A08",
      "--fn-garnet": "#6B0504",
      "--fn-copper": "#B06C49",
      "--fn-signal": "#C20114",
      "--fn-faint": "#E9DED4",
      "--fn-muted": "#8A6F63",
      "--fn-success": "#2E7D52",
      "--fn-warning": "#B8860B",
      "--fn-error": "#C20114",
      "--fn-compliance": "#B06C49"
    },
    "semantic_hsl_in_index_css": {
      "background": "27 100% 98%  /* paper */",
      "foreground": "4 76% 13%    /* oxblood ink */",
      "primary": "1 93% 22%       /* garnet */",
      "accent": "22 42% 55%       /* copper */",
      "destructive": "358 98% 38% /* signal */",
      "ring": "358 98% 38%",
      "border": "20 35% 86%",
      "radius": "12px"
    },
    "usage": {
      "ink": "texte courant, wordmark, fonds inversés",
      "garnet": "sections profondes, bandeau conformité, tuiles social",
      "copper": "voix data, captions, filets, badges conformité (outline)",
      "signal": "LA LIGNE + CTA primaire — nulle part ailleurs",
      "warning": "#B8860B pour les avis fonctionnels — jamais un jaune vif brand"
    }
  },
  "spacing_and_layout": {
    "philosophy": "Respiration éditoriale. Grille 8px stricte.",
    "scale": "8 / 16 / 24 / 32 / 48 / 64 / 96 / 120px (--fn-s1..s8)",
    "containers": "max-w-7xl centré, px-6 sm:px-8",
    "sections": "py-24 à py-32. Séparation par un filet copper (.rule-copper), pas par une bordure noire."
  },
  "components": {
    "buttons": "PILULE (rounded-full). Primaire = bg-signal + text-paper + shadow-luxe (hover: shadow-luxe-lg). Secondaire = bg-paper + border-faint + text-ink (hover: border-copper). Tertiaire/neutre = bg-ink + text-paper (hover: bg-garnet). Label en font-mono uppercase tracking-[0.25em].",
    "cards": "bg-paper, border border-faint, rounded-lg (16px), overflow-hidden. Hover via .card-hover (translateY(-4px) + ombre chaude). Aucune hard shadow.",
    "inputs_and_forms": "Shadcn. rounded-sm, bordure faint, focus ring signal. Labels en font-mono uppercase tracking-[0.18em] copper.",
    "modals_and_sheets": "Surface paper, rounded-lg, shadow-luxe-lg. Backdrop : backdrop-blur-xl bg-[#3A0A08]/60 (oxblood, pas noir).",
    "badges": "PILULE (rounded-full), font-mono 10-12px uppercase tracking-[0.2em]. Data/dosage : bg-paper/90 backdrop-blur + border-faint + text-copper. COA vérifié : bg-garnet + text-paper. Promo : bg-signal + text-paper. Précommande : outline copper sur paper (JAMAIS un orange Tailwind). Conformité/RUO : .fn-ruo (outline copper).",
    "status_badges_admin": "Pending = muted #8A6F63 · Paid = success #2E7D52 · Shipped = copper #B06C49 · Delivered = garnet #6B0504 · Cancelled = signal #C20114. Tous en font-mono uppercase.",
    "icons": "lucide-react, stroke-width 1.5.",
    "signature_elements": {
      "hplc_trace": ".hplc-trace — tracé SVG signal qui se dessine (800ms, cubic-bezier(.6,0,.2,1)). Élément héros.",
      "seal": ".animate-seal — sceau de certification SVG en rotation lente (24s).",
      "grain": ".grain::before — texture bruit 4% en multiply, sur les grandes surfaces papier.",
      "live_dot": ".fn-dot-live — pulsation d'un point (statut live / injection)."
    },
    "deep_panels": "Marquee de confiance, bloc newsletter, bandeau conformité du footer : bg-garnet, text-paper, rounded-lg, shadow-luxe, à l'intérieur du max-w-7xl (panneau flottant, pas de bande pleine largeur)."
  },
  "pages_and_flows": {
    "global_header": "Sticky, bg-paper/85 backdrop-blur, filet border-faint en bas. Gauche : wordmark FIRONOVA (font-display, ink, point signal). Centre : navigation. Droite : boutons pilule — toggle [FR/EN] (outline faint), panier (badge pilule signal), compte. AUCUN identifiant admin en dur, AUCUN auto-login : l'entrée admin redirige vers /login?next=ADMIN_PATH. Cette faille a été corrigée — ne jamais la réintroduire.",
    "age_verification_modal": "Bloc centré, surface paper, rounded-lg, shadow-luxe-lg. Titre : « ACCÈS RESTREINT / RESTRICTED ACCESS ». Corps : 19+ requis, usage recherche uniquement. CTA primaire signal « J'AI 19 ANS OU PLUS », secondaire outline « QUITTER ». Persisté en localStorage (fironova_age_confirmed).",
    "homepage": "Hero éditorial 2 colonnes. Gauche : pilule overline (point signal pulsé) + H1 font-display avec second membre en copper + CTA pilule signal + 3 chips data (lot / pureté / licence). Droite : carte COA rounded-lg shadow-luxe-lg contenant le chromatogramme HPLC animé (LA LIGNE) — PAS de photo d'archive. Sceau .animate-seal en surimpression. Puis : marquee grenat arrondi, produits vedettes, tuiles catégories (voile grenat), panneau newsletter grenat.",
    "product_catalog": "Sidebar catégories à gauche, grille produits à droite. Cartes en .card-hover, séparées par des gouttières (pas de border-collapse brutaliste).",
    "product_detail": "2 colonnes. Gauche : visuel sticky + COA téléchargeable. Droite : données en mono (lot, pureté, séquence, masse molaire). Bandeau conformité garnet « USAGE RECHERCHE UNIQUEMENT — NON DESTINÉ À LA CONSOMMATION HUMAINE ».",
    "cart_drawer": "Sheet depuis la droite, surface paper, totaux en mono, CTA checkout ancré en bas.",
    "checkout": "Formulaires Shadcn. Case obligatoire « J'accepte les conditions et je confirme avoir 19 ans ou plus ». Onglets moyens de paiement : Interac e-Transfer / Stripe / NOWPayments (crypto). Adresses enregistrées du compte proposées en un clic.",
    "admin_dashboard": "Sidebar + tables Shadcn. Mono pour IDs de commande, SKU, lots. Badges statut selon la palette ci-dessus. Le lot d'expédition (dispatch batch, cut-off 13 h Est) est affiché sur chaque commande payée.",
    "compliance_footer": "py-24, fond garnet, texte paper. Bandeau RUO bilingue (.fn-ruo). Avis Santé Canada. Liens légaux : Confidentialité (PIPEDA / Loi 25), CASL/LCAP, conditions.",
    "newsletter": "Panneau grenat arrondi. Champ + CTA dans une pilule bg-paper. Consentement LCAP/CASL via case à cocher data-testid=\"newsletter-consent\", JAMAIS pré-cochée, avec texte de consentement explicite (i18n home.newsletterConsent). Soumission → POST /api/newsletter/subscribe {email, lang, source}. Retour via toast sonner. Lien de désabonnement obligatoire dans chaque envoi."
  },
  "media": {
    "note": "Le chromatogramme HPLC et le sceau de certification sont des SVG inline — ce sont eux la signature visuelle, pas la photographie. Les photos de catégories restent des visuels labo/santé sous voile grenat (from-garnet/85). Pas de filtre grayscale (direction NORDPEP), pas de photo glaciaire nordique."
  },
  "tech_stack_instructions": {
    "frontend": "React (CRA + craco), Tailwind, Shadcn UI, axios.",
    "backend": "FastAPI + MongoDB (Motor), backend/server.py.",
    "auth": "Cookie httpOnly `access_token` UNIQUEMENT. Ne jamais renvoyer le JWT dans le corps d'une réponse, ne jamais l'écrire dans localStorage. axios : withCredentials: true, aucun intercepteur Authorization. CORS : origines explicites via CORS_ORIGINS, allow_credentials=True, '*' interdit.",
    "language_toggle": "LanguageContext + i18n.js, persistance localStorage (fironova_lang).",
    "ui_library": "Shadcn, mais avec les tokens FIRONOVA — ne pas rétablir rounded-none ni les bordures noires.",
    "testing": "data-testid sur tout élément interactif ; registres dans frontend/src/constants/testIds/."
  }
}
FN_EOF_D242D386
echo "    design_guidelines.json"
mkdir -p "$(dirname frontend/src/App.js)"
cat > frontend/src/App.js << 'FN_EOF_48BB2E3E'
import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";

import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";
import { SiteConfigProvider, useSiteConfig } from "./contexts/SiteConfigContext";
import api from "./lib/api";

import Header from "./components/Header";
import Footer from "./components/Footer";
import AgeGate from "./components/AgeGate";
import CartDrawer from "./components/CartDrawer";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminGate from "./components/AdminGate";

import Home from "./pages/Home";
import ComingSoon from "./pages/ComingSoon";
import Catalog from "./pages/Catalog";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Account from "./pages/Account";
import About from "./pages/About";
import Lab from "./pages/Lab";
import Compliance from "./pages/Compliance";
import Privacy from "./pages/Privacy";
import Faq from "./pages/Faq";
import NotFound from "./pages/NotFound";

// Chargé à la demande (chunk séparé) — le code du panneau admin n'est PLUS
// téléchargé par un visiteur du site public tant qu'il ne visite pas cette
// route précise. Avant ce changement, tout le bundle admin (React.lazy absent)
// était livré à chaque visiteur, même caché derrière /admin.
const Admin = lazy(() => import("./pages/admin/AdminLayout"));

// ⚠️ À PERSONNALISER avant mise en prod : remplacer par un chemin que toi
// seul(e) et ton équipe connaissez. Ne JAMAIS le mettre dans robots.txt,
// le sitemap, ou un lien visible — sa confidentialité EST la protection.
const ADMIN_PATH = "/ops-portal-fn7k2q";

import "./index.css";

function Shell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <AgeGate />
      <Header />
      <CartDrawer />
      <main className="flex-1">{children}</main>
      <Footer />
      <Toaster position="bottom-right" />
    </div>
  );
}

// La page d'attente se suffit à elle-même : ni header boutique, ni panier,
// ni footer — sinon le prélancement laisse fuiter toute la navigation.
function GatedApp() {
  const { loaded, prelaunchEnabled } = useSiteConfig();
  const { user, checking: authLoading } = useAuth();
  const location = useLocation();
  const [previewOk, setPreviewOk] = useState(false);
  const [previewChecked, setPreviewChecked] = useState(false);
  const token = new URLSearchParams(location.search).get("preview");

  useEffect(() => {
    let cancelled = false;
    if (!token) { setPreviewChecked(true); return; }
    api.get("/prelaunch/preview", { params: { token } })
      .then((r) => { if (!cancelled) setPreviewOk(!!r.data.ok); })
      .catch(() => { if (!cancelled) setPreviewOk(false); })
      .finally(() => { if (!cancelled) setPreviewChecked(true); });
    return () => { cancelled = true; };
  }, [token]);

  if (!loaded || authLoading || !previewChecked) return null;

  const bypass =
    !prelaunchEnabled ||
    user?.role === "admin" ||
    user?.role === "staff" ||
    previewOk ||
    ["/login", "/register", "/account"].some((p) => location.pathname.startsWith(p)) ||
    location.pathname.startsWith(ADMIN_PATH);

  if (!bypass) return <><ComingSoon /><Toaster position="bottom-right" /></>;
  return <Shell><AppRoutes /></Shell>;
}

// The COA/Lab page is hidden until the backend flag COA_PAGE_ENABLED is turned on
// (env var, no code change needed). Direct navigation to /lab redirects home while
// the flag is off, so the page can be re-enabled later without touching routing code.
function LabRoute() {
  const { loaded, coaPageEnabled } = useSiteConfig();
  if (!loaded) return null;
  return coaPageEnabled ? <Lab /> : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/product/:slug" element={<ProductDetail />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/order/:id" element={<OrderConfirmation />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
      <Route path="/about" element={<About />} />
      <Route path="/lab" element={<LabRoute />} />
      <Route path="/compliance" element={<Compliance />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/faq" element={<Faq />} />
      <Route
        path={`${ADMIN_PATH}/*`}
        element={
          <AdminGate>
            <Suspense fallback={null}>
              <ProtectedRoute adminOnly>
                <Admin basePath={ADMIN_PATH} />
              </ProtectedRoute>
            </Suspense>
          </AdminGate>
        }
      />
      {/* L'ancien /admin ne mène plus nulle part de spécial — traité comme
          n'importe quelle URL inconnue, comme si le panneau n'avait jamais
          existé à cet endroit. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteConfigProvider>
        <LanguageProvider>
          <AuthProvider>
            <CartProvider>
              <GatedApp />
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </SiteConfigProvider>
    </BrowserRouter>
  );
}
FN_EOF_48BB2E3E
echo "    frontend/src/App.js"
mkdir -p "$(dirname frontend/src/lib/api.js)"
cat > frontend/src/lib/api.js << 'FN_EOF_917C4161'
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  // Auth = cookie httpOnly `access_token` uniquement. Aucun token ne transite
  // par un stockage accessible au JS, donc une XSS ne peut pas voler la session.
  withCredentials: true,
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
FN_EOF_917C4161
echo "    frontend/src/lib/api.js"
mkdir -p "$(dirname frontend/src/lib/i18n.js)"
cat > frontend/src/lib/i18n.js << 'FN_EOF_9A192F8B'
export const dict = {
  en: {
    nav: {
      catalog: "Catalog",
      lab: "Lab & COA",
      about: "About",
      cart: "Cart",
      login: "Sign in",
      logout: "Sign out",
      account: "Account",
      admin: "Admin",
    },
    common: {
      addToCart: "Add to cart",
      buyNow: "Buy now",
      learnMore: "Learn more",
      readMore: "Read more",
      viewAll: "View all",
      back: "Back",
      continue: "Continue",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      edit: "Edit",
      loading: "Loading…",
      total: "Total",
      subtotal: "Subtotal",
      tax: "Tax",
      shipping: "Shipping",
      empty: "Empty",
      qty: "Qty",
      remove: "Remove",
      checkout: "Checkout",
      search: "Search…",
      filter: "Filter",
      all: "All",
    },
    home: {
      heroOverline: "RESEARCH PEPTIDES · MADE IN CANADA",
      heroTitle: "Precision peptides for Canadian research.",
      heroSub: "Independently lab-tested. 99%+ purity. Ships discreetly from Canadian soil.",
      heroCta: "Browse the catalog",
      heroCta2: "View lab reports",
      featuredTitle: "Featured compounds",
      featuredSub: "Most requested by research labs across Canada.",
      trustTested: "3rd-Party Lab Tested",
      trustCanada: "Ships from Canada",
      trustPurity: "99%+ Purity",
      trustDiscreet: "Discreet Packaging",
      categoriesTitle: "Browse by research category",
      newsletterTitle: "Stay current on lab batches",
      newsletterSub: "New COAs, restocks and research notes. No spam.",
      newsletterPlaceholder: "your@email.com",
      subscribe: "Subscribe",
      newsletterConsent: "I agree to receive research notes, COA releases and restock alerts from FIRONOVA by email. I can withdraw my consent at any time via the unsubscribe link.",
      newsletterConsentRequired: "Please confirm your consent before subscribing.",
      newsletterOk: "Confirmed — you're on the list.",
      newsletterAlready: "This address is already subscribed.",
      newsletterError: "Subscription failed. Please try again.",
    },
    age: {
      title: "Restricted Access",
      body: "These products are sold strictly for in-vitro laboratory research and are not for human or veterinary use. You must be 19+ to enter this site.",
      confirm: "I am 19+ and I understand",
      exit: "Exit",
    },
    catalog: {
      title: "Catalog",
      sub: "Reference compounds for in-vitro laboratory research.",
      sortBy: "Sort by",
      sortName: "Name",
      sortPriceAsc: "Price · Low → High",
      sortPriceDesc: "Price · High → Low",
      empty: "No products match your filters.",
    },
    prelaunch: {
      title: "Something measurable is coming.",
      body: "FIRONOVA is preparing its first release of research peptides — third-party tested, shipped from Canada. Join the list and lock in 15% off your first order at launch.",
      cta: "Join",
      confirmedTag: "// CONFIRMED",
      confirmed: "Check your inbox — create your account from the email to lock in 15% off at launch with code:",
    },
    categories: {
      all: "All categories",
      healing: "Healing & Recovery",
      "gh-secretagogues": "GH Secretagogues",
      "weight-loss": "Metabolic",
      cognitive: "Cognitive",
      longevity: "Longevity",
    },
    product: {
      sku: "SKU",
      sequence: "Sequence",
      purity: "Purity",
      dosage: "Dosage",
      stock: "In stock",
      outOfStock: "Out of stock",
      researchOnly: "For Research Use Only — Not For Human Consumption",
      labReport: "Download COA / Lab Report",
      addedToCart: "Added to cart",
    },
    cart: {
      title: "Your cart",
      empty: "Your cart is empty.",
      keepShopping: "Keep shopping",
      proceed: "Proceed to checkout",
    },
    checkout: {
      savedAddresses: "Saved addresses",
      title: "Checkout",
      contact: "Contact",
      shipping: "Shipping address",
      payment: "Payment method",
      review: "Review & confirm",
      fullName: "Full name",
      email: "Email",
      phone: "Phone (optional)",
      address1: "Address",
      address2: "Apt / Suite (optional)",
      city: "City",
      province: "Province",
      postal: "Postal code",
      country: "Country",
      interac: "Interac e-Transfer",
      interacDesc: "Manual e-Transfer in CAD. We confirm receipt within 24h.",
      crypto: "Crypto · NOWPayments",
      cryptoDesc: "BTC, ETH, USDT, LTC and more. Instant on-chain.",
      payCurrency: "Pay with",
      ack1: "I confirm I am 19 years of age or older.",
      ack2: "I understand these products are for laboratory research only and not for human or veterinary consumption.",
      ack3: "I accept the Terms & Conditions and Privacy Policy.",
      placeOrder: "Place order",
      processing: "Processing…",
    },
    confirmation: {
      title: "Order received",
      sub: "Save your order number — you'll need it to complete the payment.",
      orderNumber: "Order number",
      interacHeading: "Interac e-Transfer instructions",
      interacStep1: "Send your e-Transfer to:",
      interacStep2: "Amount:",
      interacStep3: "Message / Reference (required):",
      interacStep4: "Security question:",
      interacStep5: "Security answer:",
      interacFooter: "We'll email you within 24 hours of receiving your transfer to confirm and ship your order.",
      cryptoHeading: "Crypto payment instructions",
      cryptoAddress: "Deposit address",
      cryptoAmount: "Send exactly",
      cryptoNetwork: "Network",
      cryptoFooter: "Payment is automatically detected on-chain. Status will update once confirmed.",
      copyClipboard: "Copy",
      copied: "Copied",
      backHome: "Back to home",
    },
    auth: {
      signin: "Sign in",
      signup: "Create account",
      email: "Email",
      password: "Password",
      name: "Full name",
      noAccount: "No account?",
      hasAccount: "Already have an account?",
      welcome: "Welcome to FIRONOVA",
      welcomeSub: "Sign in to track orders and access lab reports.",
      registerSub: "Create an account to checkout faster and view order history.",
    },
    account: {
      title: "Account",
      orders: "Orders",
      noOrders: "You don't have any orders yet.",
      status: "Status",
      date: "Date",
      total: "Total",
      orderNumber: "Order",
      profile: "Profile",
      addresses: "Addresses",
      security: "Security",
      fullName: "Full name",
      profileSaved: "Profile updated",
      changeEmail: "Change email",
      newEmail: "New email address",
      currentPassword: "Current password",
      sendConfirmation: "Send confirmation link",
      emailChangeHint: "A confirmation link will be sent to your new address. Your email only changes once you click it.",
      emailSentTitle: "Check your inbox",
      emailSentBody: "A confirmation link was sent to",
      addAddress: "Add address",
      noAddresses: "No saved addresses yet. Add one to check out faster.",
      addressLabel: "Label (Home, Lab…)",
      addressSaved: "Address saved",
      addressDeleteConfirm: "Delete this address?",
      defaultAddress: "Use as default address",
      default: "Default",
      makeDefault: "Make default",
      changePassword: "Change password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordMismatch: "Passwords don't match",
      passwordChanged: "Password changed. Other devices were signed out.",
      passwordHint: "Changing your password signs you out of all other devices.",
      sessions: "Sessions",
      sessionsHint: "Sign out everywhere — useful if you've used a shared or lost device.",
      logoutAll: "Sign out of all devices",
      dangerZone: "Danger zone",
      deleteAccount: "Delete my account",
      deleteHint: "Deletes your account and anonymizes your personal data. Order records are kept without your identity for accounting purposes. This cannot be undone.",
      deleteConfirm: "This is permanent. Delete your account?",
      deleteForever: "Delete forever",
      deleted: "Your account has been deleted.",
    },
    admin: {
      title: "Admin Console",
      products: "Products",
      orders: "Orders",
      customers: "Customers",
      stats: "Overview",
      revenue: "Revenue",
      totalOrders: "Orders",
      pendingOrders: "Pending",
      customersCount: "Customers",
      productsCount: "Products",
      newProduct: "New product",
      paymentStatus: "Payment",
      fulfillmentStatus: "Fulfillment",
    },
    footer: {
      compliance: "FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY",
      tagline: "Independent Canadian peptide reference supplier. Research only.",
      shop: "Shop",
      company: "Company",
      legal: "Information",
      terms: "Terms & Conditions",
      privacy: "Privacy Policy",
      shipping: "Shipping & Returns",
      faq: "FAQ",
      contact: "Contact",
      rights: "All rights reserved.",
    },
  },
  fr: {
    nav: {
      catalog: "Catalogue",
      lab: "Lab & COA",
      about: "À propos",
      cart: "Panier",
      login: "Connexion",
      logout: "Déconnexion",
      account: "Compte",
      admin: "Admin",
    },
    common: {
      addToCart: "Ajouter au panier",
      buyNow: "Acheter",
      learnMore: "En savoir plus",
      readMore: "Lire la suite",
      viewAll: "Tout voir",
      back: "Retour",
      continue: "Continuer",
      cancel: "Annuler",
      save: "Enregistrer",
      delete: "Supprimer",
      edit: "Modifier",
      loading: "Chargement…",
      total: "Total",
      subtotal: "Sous-total",
      tax: "Taxes",
      shipping: "Livraison",
      empty: "Vide",
      qty: "Qté",
      remove: "Retirer",
      checkout: "Paiement",
      search: "Recherche…",
      filter: "Filtre",
      all: "Tous",
    },
    home: {
      heroOverline: "PEPTIDES DE RECHERCHE · FAIT AU CANADA",
      heroTitle: "Peptides de précision pour la recherche canadienne.",
      heroSub: "Testés en laboratoire indépendant. Pureté ≥99 %. Expédition discrète depuis le Canada.",
      heroCta: "Voir le catalogue",
      heroCta2: "Voir les rapports",
      featuredTitle: "Composés en vedette",
      featuredSub: "Les plus demandés par les laboratoires canadiens.",
      trustTested: "Testé en laboratoire tiers",
      trustCanada: "Expédié du Canada",
      trustPurity: "Pureté ≥ 99 %",
      trustDiscreet: "Emballage discret",
      categoriesTitle: "Parcourir par catégorie de recherche",
      newsletterTitle: "Restez informé des nouveaux lots",
      newsletterSub: "Nouveaux COA, réapprovisionnements et notes de recherche. Pas de spam.",
      newsletterPlaceholder: "votre@email.com",
      subscribe: "S'abonner",
      newsletterConsent: "J'accepte de recevoir par courriel les notes de recherche, les nouveaux COA et les avis de réapprovisionnement de FIRONOVA. Je peux retirer mon consentement à tout moment via le lien de désabonnement.",
      newsletterConsentRequired: "Veuillez confirmer votre consentement avant de vous abonner.",
      newsletterOk: "Confirmé — vous êtes inscrit.",
      newsletterAlready: "Cette adresse est déjà abonnée.",
      newsletterError: "L'inscription a échoué. Veuillez réessayer.",
    },
    age: {
      title: "Accès restreint",
      body: "Ces produits sont vendus strictement pour la recherche de laboratoire in vitro et ne sont pas destinés à un usage humain ou vétérinaire. Vous devez avoir 19 ans ou plus pour accéder à ce site.",
      confirm: "J'ai 19 ans ou plus et je comprends",
      exit: "Quitter",
    },
    catalog: {
      title: "Catalogue",
      sub: "Composés de référence pour la recherche de laboratoire in vitro.",
      sortBy: "Trier par",
      sortName: "Nom",
      sortPriceAsc: "Prix · Bas → Haut",
      sortPriceDesc: "Prix · Haut → Bas",
      empty: "Aucun produit ne correspond à vos filtres.",
    },
    prelaunch: {
      title: "Un changement mesurable approche.",
      body: "FIRONOVA prépare sa première série de peptides de recherche — analysés en laboratoire tiers, expédiés du Canada. Inscrivez-vous et verrouillez 15 % de rabais sur votre première commande au lancement.",
      cta: "S'inscrire",
      confirmedTag: "// CONFIRMÉ",
      confirmed: "Vérifiez votre boîte de réception — créez votre compte depuis le courriel pour verrouiller 15 % de rabais au lancement avec le code :",
    },
    categories: {
      all: "Toutes les catégories",
      healing: "Guérison & Récupération",
      "gh-secretagogues": "Sécrétagogues GH",
      "weight-loss": "Métabolique",
      cognitive: "Cognitif",
      longevity: "Longévité",
    },
    product: {
      sku: "SKU",
      sequence: "Séquence",
      purity: "Pureté",
      dosage: "Dosage",
      stock: "En stock",
      outOfStock: "Rupture",
      researchOnly: "Usage de recherche uniquement — Pas pour consommation humaine",
      labReport: "Télécharger le COA / Rapport",
      addedToCart: "Ajouté au panier",
    },
    cart: {
      title: "Votre panier",
      empty: "Votre panier est vide.",
      keepShopping: "Continuer mes achats",
      proceed: "Passer à la caisse",
    },
    checkout: {
      savedAddresses: "Adresses enregistrées",
      title: "Paiement",
      contact: "Contact",
      shipping: "Adresse de livraison",
      payment: "Méthode de paiement",
      review: "Vérifier et confirmer",
      fullName: "Nom complet",
      email: "Courriel",
      phone: "Téléphone (optionnel)",
      address1: "Adresse",
      address2: "App / Bureau (optionnel)",
      city: "Ville",
      province: "Province",
      postal: "Code postal",
      country: "Pays",
      interac: "Virement Interac",
      interacDesc: "Virement manuel en CAD. Confirmation sous 24h.",
      crypto: "Crypto · NOWPayments",
      cryptoDesc: "BTC, ETH, USDT, LTC et plus. Instantané sur la chaîne.",
      payCurrency: "Payer avec",
      ack1: "Je confirme avoir 19 ans ou plus.",
      ack2: "Je comprends que ces produits sont destinés à la recherche en laboratoire et non à la consommation humaine ou vétérinaire.",
      ack3: "J'accepte les Conditions Générales et la Politique de confidentialité.",
      placeOrder: "Confirmer la commande",
      processing: "Traitement…",
    },
    confirmation: {
      title: "Commande reçue",
      sub: "Conservez votre numéro de commande — vous en aurez besoin pour compléter le paiement.",
      orderNumber: "Numéro de commande",
      interacHeading: "Instructions de virement Interac",
      interacStep1: "Envoyez votre virement Interac à :",
      interacStep2: "Montant :",
      interacStep3: "Message / Référence (obligatoire) :",
      interacStep4: "Question de sécurité :",
      interacStep5: "Réponse de sécurité :",
      interacFooter: "Nous vous écrirons dans les 24 h suivant la réception du virement pour confirmer et expédier votre commande.",
      cryptoHeading: "Instructions de paiement crypto",
      cryptoAddress: "Adresse de dépôt",
      cryptoAmount: "Envoyez exactement",
      cryptoNetwork: "Réseau",
      cryptoFooter: "Le paiement est détecté automatiquement sur la chaîne. Le statut sera mis à jour une fois confirmé.",
      copyClipboard: "Copier",
      copied: "Copié",
      backHome: "Retour à l'accueil",
    },
    auth: {
      signin: "Connexion",
      signup: "Créer un compte",
      email: "Courriel",
      password: "Mot de passe",
      name: "Nom complet",
      noAccount: "Pas de compte ?",
      hasAccount: "Vous avez un compte ?",
      welcome: "Bienvenue chez FIRONOVA",
      welcomeSub: "Connectez-vous pour suivre vos commandes et accéder aux rapports.",
      registerSub: "Créez un compte pour acheter plus rapidement et voir l'historique.",
    },
    account: {
      title: "Compte",
      orders: "Commandes",
      noOrders: "Vous n'avez aucune commande.",
      status: "Statut",
      date: "Date",
      total: "Total",
      orderNumber: "Commande",
      profile: "Profil",
      addresses: "Adresses",
      security: "Sécurité",
      fullName: "Nom complet",
      profileSaved: "Profil mis à jour",
      changeEmail: "Changer d'email",
      newEmail: "Nouvelle adresse email",
      currentPassword: "Mot de passe actuel",
      sendConfirmation: "Envoyer le lien de confirmation",
      emailChangeHint: "Un lien de confirmation sera envoyé à votre nouvelle adresse. L'email ne change qu'après avoir cliqué dessus.",
      emailSentTitle: "Vérifiez votre boîte de réception",
      emailSentBody: "Un lien de confirmation a été envoyé à",
      addAddress: "Ajouter une adresse",
      noAddresses: "Aucune adresse enregistrée. Ajoutez-en une pour commander plus vite.",
      addressLabel: "Étiquette (Maison, Labo…)",
      addressSaved: "Adresse enregistrée",
      addressDeleteConfirm: "Supprimer cette adresse ?",
      defaultAddress: "Utiliser comme adresse par défaut",
      default: "Par défaut",
      makeDefault: "Définir par défaut",
      changePassword: "Changer le mot de passe",
      newPassword: "Nouveau mot de passe",
      confirmPassword: "Confirmer le nouveau mot de passe",
      passwordMismatch: "Les mots de passe ne correspondent pas",
      passwordChanged: "Mot de passe changé. Les autres appareils ont été déconnectés.",
      passwordHint: "Changer votre mot de passe vous déconnecte de tous les autres appareils.",
      sessions: "Sessions",
      sessionsHint: "Se déconnecter partout — utile après un appareil partagé ou perdu.",
      logoutAll: "Déconnecter tous les appareils",
      dangerZone: "Zone dangereuse",
      deleteAccount: "Supprimer mon compte",
      deleteHint: "Supprime votre compte et anonymise vos données personnelles. Les commandes sont conservées sans votre identité pour la comptabilité. Irréversible.",
      deleteConfirm: "Cette action est permanente. Supprimer votre compte ?",
      deleteForever: "Supprimer définitivement",
      deleted: "Votre compte a été supprimé.",
    },
    admin: {
      title: "Console Admin",
      products: "Produits",
      orders: "Commandes",
      customers: "Clients",
      stats: "Aperçu",
      revenue: "Revenus",
      totalOrders: "Commandes",
      pendingOrders: "En attente",
      customersCount: "Clients",
      productsCount: "Produits",
      newProduct: "Nouveau produit",
      paymentStatus: "Paiement",
      fulfillmentStatus: "Exécution",
    },
    footer: {
      compliance: "USAGE EN LABORATOIRE UNIQUEMENT · PAS POUR CONSOMMATION HUMAINE OU VÉTÉRINAIRE · 19+ SEULEMENT",
      tagline: "Fournisseur canadien indépendant de peptides de référence. Recherche uniquement.",
      shop: "Boutique",
      company: "Entreprise",
      legal: "Informations",
      terms: "Conditions Générales",
      privacy: "Politique de confidentialité",
      shipping: "Livraison & Retours",
      faq: "FAQ",
      contact: "Contact",
      rights: "Tous droits réservés.",
    },
  },
};

export function t(lang, path) {
  const parts = path.split(".");
  let node = dict[lang] || dict.en;
  for (const p of parts) {
    if (node == null) return path;
    node = node[p];
  }
  return node ?? path;
}
FN_EOF_9A192F8B
echo "    frontend/src/lib/i18n.js"
mkdir -p "$(dirname frontend/src/contexts/AuthContext.jsx)"
cat > frontend/src/contexts/AuthContext.jsx << 'FN_EOF_1232B1CC'
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import api, { formatApiError } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser({ id: data.id, email: data.email, name: data.name, role: data.role, created_at: data.created_at });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, []);

  const register = useCallback(async (name, email, password) => {
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      setUser({ id: data.id, email: data.email, name: data.name, role: data.role, created_at: data.created_at });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: formatApiError(e.response?.data?.detail) || e.message };
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    // Nettoie un éventuel token résiduel des builds pré-auth-cookie.
    localStorage.removeItem("fironova_token");
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, checking, login, register, logout, refresh }),
                        [user, checking, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
FN_EOF_1232B1CC
echo "    frontend/src/contexts/AuthContext.jsx"
mkdir -p "$(dirname frontend/src/contexts/SiteConfigContext.jsx)"
cat > frontend/src/contexts/SiteConfigContext.jsx << 'FN_EOF_5D4BF946'
import { createContext, useContext, useEffect, useState, useMemo } from "react";
import api from "../lib/api";

const SiteConfigContext = createContext(null);

const DEFAULTS = {
  loaded: false,
  store: "FIRONOVA",
  currency: "CAD",
  shippingFlatCad: 20,
  provinces: [],
  minAge: 19,
  interacEmail: "",
  coaPageEnabled: false, // hidden by default until explicitly enabled server-side
  canadaPostEnabled: false,
  // Défaut sûr : si /meta échoue, la boutique reste OUVERTE. Un défaut à true
  // mettrait tout le site derrière la page d'attente au moindre hoquet réseau.
  prelaunchEnabled: false,
  launchCouponCode: "LAUNCH15",
};

export function SiteConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/meta")
      .then((r) => {
        if (cancelled) return;
        setConfig({
          loaded: true,
          store: r.data.store,
          currency: r.data.currency,
          shippingFlatCad: r.data.shipping_flat_cad,
          provinces: r.data.provinces || [],
          minAge: r.data.min_age,
          interacEmail: r.data.interac_email,
          coaPageEnabled: !!r.data.coa_page_enabled,
          canadaPostEnabled: !!r.data.canada_post_enabled,
          prelaunchEnabled: !!r.data.prelaunch_enabled,
          launchCouponCode: r.data.launch_coupon_code || "LAUNCH15",
        });
      })
      .catch(() => {
        // Network/API hiccup: keep safe defaults (COA page stays hidden).
        if (!cancelled) setConfig((c) => ({ ...c, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => config, [config]);
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) throw new Error("useSiteConfig must be used within SiteConfigProvider");
  return ctx;
}
FN_EOF_5D4BF946
echo "    frontend/src/contexts/SiteConfigContext.jsx"
mkdir -p "$(dirname frontend/src/pages/Account.jsx)"
cat > frontend/src/pages/Account.jsx << 'FN_EOF_4F76AE54'
// frontend/src/pages/Account.jsx — Mon Compte étendu.
// Onglets : Commandes / Profil / Adresses / Sécurité.
// Remplace ENTIÈREMENT l'ancien Account.jsx.
import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

const statusColor = {
  awaiting_etransfer: "bg-secondary",
  awaiting_crypto: "bg-secondary",
  paid: "bg-ink text-white",
  shipped: "bg-warning",
  delivered: "bg-ink text-white",
  pending: "bg-secondary",
};

const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

const EMPTY_ADDRESS = {
  label: "", full_name: "", address1: "", address2: "",
  city: "", province: "QC", postal_code: "", country: "CA", phone: "", is_default: false,
};

export default function Account() {
  useDocumentHead({ title: "My Account", path: "/account", noindex: true });
  const { user, logout, refresh } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState("orders");

  return (
    <div className="max-w-6xl mx-auto px-6 py-16" data-testid="account-page">
      <div className="flex items-end justify-between border-b border-ink pb-6 mb-8">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ACCOUNT</div>
          <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-2" data-testid="account-name">
            {user?.name}
          </h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{user?.email}</p>
        </div>
        <button onClick={logout} data-testid="account-logout" className="font-mono text-xs uppercase tracking-[0.25em] link-underline">
          {t("nav.logout")} →
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-ink/20 mb-10" data-testid="account-tabs">
        {[
          ["orders", t("account.orders")],
          ["profile", t("account.profile")],
          ["addresses", t("account.addresses")],
          ["security", t("account.security")],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-testid={`account-tab-${key}`}
            className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-3 -mb-px border-b-2 transition-colors ${
              tab === key ? "border-ink font-bold" : "border-transparent text-foreground/60 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && <OrdersTab t={t} />}
      {tab === "profile" && <ProfileTab t={t} user={user} refresh={refresh} />}
      {tab === "addresses" && <AddressesTab t={t} />}
      {tab === "security" && <SecurityTab t={t} logout={logout} navigate={navigate} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Orders */
function OrdersTab({ t }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api.get("/orders/mine").then((r) => setOrders(r.data)).catch(() => setOrders([]));
  }, []);
  if (orders === null) {
    return <p className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/50">{t("common.loading")}</p>;
  }
  if (orders.length === 0) {
    return (
      <div className="border border-ink p-8 text-center" data-testid="account-no-orders">
        <p className="text-foreground/70">{t("account.noOrders")}</p>
        <Link to="/catalog" className="inline-block mt-4 bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
          {t("nav.catalog")} →
        </Link>
      </div>
    );
  }
  return (
    <div className="border border-ink overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <thead className="bg-ink text-white">
          <tr>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.orderNumber")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.date")}</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Items</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.status")}</th>
            <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">{t("account.total")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-ink/15 hover:bg-secondary" data-testid={`order-row-${o.order_number}`}>
              <td className="px-4 py-4">
                <Link to={`/order/${o.id}`} className="font-bold link-underline">{o.order_number}</Link>
              </td>
              <td className="px-4 py-4 text-foreground/70">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-4">{o.items.length}</td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 uppercase tracking-[0.15em] text-[10px] ${statusColor[o.payment_status] || "bg-secondary"}`}>
                  {o.payment_status}
                </span>
              </td>
              <td className="px-4 py-4 text-right font-bold">${o.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------- Profile */
function ProfileTab({ t, user, refresh }) {
  const [name, setName] = useState(user?.name || "");
  const [busy, setBusy] = useState(false);
  const [emailForm, setEmailForm] = useState({ new_email: "", current_password: "" });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState("");

  const saveName = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/account/profile", { name });
      await refresh();
      toast.success(t("account.profileSaved"));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const requestEmailChange = async (e) => {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const { data } = await api.post("/account/email/request-change", emailForm);
      setEmailSentTo(data.sent_to);
      setEmailForm({ new_email: "", current_password: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-12 max-w-4xl">
      <form onSubmit={saveName} className="space-y-5" data-testid="profile-form">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.profile")}</h2>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.fullName")}
          </label>
          <input
            required value={name} onChange={(e) => setName(e.target.value)}
            data-testid="profile-name"
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
          />
        </div>
        <button type="submit" disabled={busy} data-testid="profile-save"
          className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
          {busy ? "…" : t("common.save")}
        </button>
      </form>

      <form onSubmit={requestEmailChange} className="space-y-5" data-testid="email-change-form">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.changeEmail")}</h2>
        {emailSentTo ? (
          <div className="border border-ink p-5 text-sm" data-testid="email-change-sent">
            <p className="font-bold">{t("account.emailSentTitle")}</p>
            <p className="text-foreground/70 mt-1">
              {t("account.emailSentBody")} <span className="font-mono">{emailSentTo}</span>
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
                {t("account.newEmail")}
              </label>
              <input
                type="email" required value={emailForm.new_email}
                onChange={(e) => setEmailForm({ ...emailForm, new_email: e.target.value })}
                data-testid="email-change-new"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
                {t("account.currentPassword")}
              </label>
              <input
                type="password" required value={emailForm.current_password}
                onChange={(e) => setEmailForm({ ...emailForm, current_password: e.target.value })}
                data-testid="email-change-password"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
              />
            </div>
            <button type="submit" disabled={emailBusy} data-testid="email-change-submit"
              className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 hover:bg-ink hover:text-white disabled:opacity-50">
              {emailBusy ? "…" : t("account.sendConfirmation")}
            </button>
            <p className="text-xs text-foreground/60">{t("account.emailChangeHint")}</p>
          </>
        )}
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- Addresses */
function AddressesTab({ t }) {
  const [addresses, setAddresses] = useState(null);
  const [editing, setEditing] = useState(null); // null | {…EMPTY_ADDRESS} | existing
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/account/addresses").then((r) => setAddresses(r.data)).catch(() => setAddresses([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing.id) await api.put(`/account/addresses/${editing.id}`, editing);
      else await api.post("/account/addresses", editing);
      setEditing(null);
      load();
      toast.success(t("account.addressSaved"));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t("account.addressDeleteConfirm"))) return;
    try {
      await api.delete(`/account/addresses/${id}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const setDefault = async (a) => {
    try {
      await api.put(`/account/addresses/${a.id}`, { ...a, is_default: true });
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  if (addresses === null) {
    return <p className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/50">{t("common.loading")}</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.addresses")}</h2>
        {!editing && (
          <button onClick={() => setEditing({ ...EMPTY_ADDRESS })} data-testid="address-add"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3">
            + {t("account.addAddress")}
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="border border-ink p-6 mb-8 grid sm:grid-cols-2 gap-4" data-testid="address-form">
          <Field label={t("account.addressLabel")} value={editing.label}
                 onChange={(v) => setEditing({ ...editing, label: v })} testid="address-label" />
          <Field label={t("checkout.fullName")} value={editing.full_name} required
                 onChange={(v) => setEditing({ ...editing, full_name: v })} testid="address-fullname" />
          <Field label={t("checkout.address1")} value={editing.address1} required className="sm:col-span-2"
                 onChange={(v) => setEditing({ ...editing, address1: v })} testid="address-address1" />
          <Field label={t("checkout.address2")} value={editing.address2} className="sm:col-span-2"
                 onChange={(v) => setEditing({ ...editing, address2: v })} testid="address-address2" />
          <Field label={t("checkout.city")} value={editing.city} required
                 onChange={(v) => setEditing({ ...editing, city: v })} testid="address-city" />
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
              {t("checkout.province")}
            </label>
            <select value={editing.province} data-testid="address-province"
              onChange={(e) => setEditing({ ...editing, province: e.target.value })}
              className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none">
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Field label={t("checkout.postal")} value={editing.postal_code} required
                 onChange={(v) => setEditing({ ...editing, postal_code: v })} testid="address-postal" />
          <Field label={t("checkout.phone")} value={editing.phone}
                 onChange={(v) => setEditing({ ...editing, phone: v })} testid="address-phone" />
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] sm:col-span-2">
            <input type="checkbox" checked={editing.is_default} data-testid="address-default"
              onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
            {t("account.defaultAddress")}
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} data-testid="address-save"
              className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
              {busy ? "…" : t("common.save")}
            </button>
            <button type="button" onClick={() => setEditing(null)} data-testid="address-cancel"
              className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !editing ? (
        <div className="border border-ink p-8 text-center text-foreground/70" data-testid="addresses-empty">
          {t("account.noAddresses")}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {addresses.map((a) => (
            <div key={a.id} className={`border p-5 ${a.is_default ? "border-ink" : "border-ink/30"}`}
                 data-testid={`address-card-${a.id}`}>
              <div className="flex items-start justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                  {a.label || t("account.addressLabel")}
                  {a.is_default && <span className="ml-2 bg-ink text-white px-1.5 py-0.5">{t("account.default")}</span>}
                </div>
              </div>
              <div className="mt-2 text-sm">
                <div className="font-bold">{a.full_name}</div>
                <div>{a.address1}{a.address2 ? `, ${a.address2}` : ""}</div>
                <div>{a.city}, {a.province} {a.postal_code}</div>
                {a.phone && <div className="text-foreground/60">{a.phone}</div>}
              </div>
              <div className="flex gap-4 mt-4 font-mono text-[10px] uppercase tracking-[0.2em]">
                <button onClick={() => setEditing(a)} className="link-underline" data-testid={`address-edit-${a.id}`}>
                  {t("common.edit")}
                </button>
                {!a.is_default && (
                  <button onClick={() => setDefault(a)} className="link-underline" data-testid={`address-setdefault-${a.id}`}>
                    {t("account.makeDefault")}
                  </button>
                )}
                <button onClick={() => remove(a.id)} className="link-underline text-signal" data-testid={`address-delete-${a.id}`}>
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required = false, className = "", testid }) {
  return (
    <div className={className}>
      <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">{label}</label>
      <input
        required={required} value={value || ""} onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal"
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Security */
function SecurityTab({ t, logout, navigate }) {
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) {
      toast.error(t("account.passwordMismatch"));
      return;
    }
    setPwBusy(true);
    try {
      await api.put("/account/password", {
        current_password: pw.current_password,
        new_password: pw.new_password,
      });
      // Le backend révoque toutes les autres sessions et repose un cookie
      // httpOnly frais pour CET appareil — rien à stocker côté JS.
      setPw({ current_password: "", new_password: "", confirm: "" });
      toast.success(t("account.passwordChanged"));
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const logoutAll = async () => {
    try {
      await api.post("/auth/logout-all");
    } catch { /* ignore */ }
    localStorage.removeItem("fironova_token");
    logout();
    navigate("/login");
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    if (!window.confirm(t("account.deleteConfirm"))) return;
    setDelBusy(true);
    try {
      await api.post("/account/delete", { current_password: delPassword });
      localStorage.removeItem("fironova_token");
      toast.success(t("account.deleted"));
      logout();
      navigate("/");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-14">
      <form onSubmit={changePassword} className="space-y-5 max-w-md" data-testid="password-form">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{t("account.changePassword")}</h2>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.currentPassword")}
          </label>
          <input type="password" required value={pw.current_password} data-testid="password-current"
            onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.newPassword")}
          </label>
          <input type="password" required minLength={8} value={pw.new_password} data-testid="password-new"
            onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
            {t("account.confirmPassword")}
          </label>
          <input type="password" required minLength={8} value={pw.confirm} data-testid="password-confirm"
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
        </div>
        <button type="submit" disabled={pwBusy} data-testid="password-save"
          className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
          {pwBusy ? "…" : t("account.changePassword")}
        </button>
        <p className="text-xs text-foreground/60">{t("account.passwordHint")}</p>
      </form>

      <div className="max-w-md">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight mb-3">{t("account.sessions")}</h2>
        <p className="text-sm text-foreground/70 mb-4">{t("account.sessionsHint")}</p>
        <button onClick={logoutAll} data-testid="logout-all"
          className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 hover:bg-ink hover:text-white">
          {t("account.logoutAll")}
        </button>
      </div>

      <div className="max-w-md border-t border-signal/40 pt-10">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-signal mb-3">
          {t("account.dangerZone")}
        </h2>
        <p className="text-sm text-foreground/70 mb-4">{t("account.deleteHint")}</p>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} data-testid="delete-account-reveal"
            className="border border-signal text-signal font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 hover:bg-signal hover:text-white">
            {t("account.deleteAccount")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="space-y-4" data-testid="delete-account-form">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/60 mb-1">
                {t("account.currentPassword")}
              </label>
              <input type="password" required value={delPassword} data-testid="delete-account-password"
                onChange={(e) => setDelPassword(e.target.value)}
                className="w-full border-b border-signal px-1 py-3 bg-transparent focus:outline-none" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={delBusy} data-testid="delete-account-confirm"
                className="bg-signal text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
                {delBusy ? "…" : t("account.deleteForever")}
              </button>
              <button type="button" onClick={() => { setShowDelete(false); setDelPassword(""); }}
                className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
FN_EOF_4F76AE54
echo "    frontend/src/pages/Account.jsx"
mkdir -p "$(dirname frontend/src/pages/StaffAccept.jsx)"
cat > frontend/src/pages/StaffAccept.jsx << 'FN_EOF_ED77312D'
// frontend/src/pages/StaffAccept.jsx — NOUVEAU fichier, route publique.
// Page ouverte depuis le lien d'invitation reçu par email. Le token à usage
// unique + TTL (72h côté backend) sert de preuve — pas besoin d'être connecté.
import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import useDocumentHead from "../hooks/useDocumentHead";

export default function StaffAccept() {
  useDocumentHead({ title: "Accept invitation", path: "/staff-accept", noindex: true });
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/staff/accept", { token, password });
      // Session posée par le cookie httpOnly renvoyé par /staff/accept.
      setDone(true);
      await refresh();
      setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (err) {
      toast.error(err.response?.data?.detail || "This invitation link is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" data-testid="staff-accept-missing-token">
        <p className="text-foreground/60">This link is missing its invitation code.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6" data-testid="staff-accept-page">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <div className="font-display font-extrabold text-2xl tracking-tight mb-1">
          FIRONOVA<span style={{ color: "#C20114" }}>.</span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-8">
          // Team invitation
        </div>
        {done ? (
          <p className="text-foreground/70" data-testid="staff-accept-success">
            Access activated. Redirecting…
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-foreground/70">Set a password to activate your access.</p>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                data-testid="staff-accept-password"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Confirm password</label>
              <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                data-testid="staff-accept-confirm"
                className="w-full border-b border-ink px-1 py-3 bg-transparent focus:outline-none focus:border-signal" />
            </div>
            <button type="submit" disabled={busy} data-testid="staff-accept-submit"
              className="w-full bg-ink text-white font-mono text-xs uppercase tracking-[0.3em] py-4 hover:bg-foreground/85 disabled:opacity-50">
              {busy ? "…" : "Activate access →"}
            </button>
          </div>
        )}
        <Link to="/" className="block mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/40 link-underline">
          ← Back to fironova.ca
        </Link>
      </form>
    </div>
  );
}
FN_EOF_ED77312D
echo "    frontend/src/pages/StaffAccept.jsx"
mkdir -p "$(dirname frontend/src/pages/Home.jsx)"
cat > frontend/src/pages/Home.jsx << 'FN_EOF_A05FC3D3'
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, MapPin, FlaskConical, Package } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard";

/* Chromatogramme HPLC — LA LIGNE. Signature visuelle FIRONOVA : c'est la
   donnee elle-meme qui fait l'image de marque, pas une photo d'archive. */
function Chromatogram() {
  return (
    <svg viewBox="0 0 520 400" className="absolute inset-0 w-full h-full" role="img" aria-label="HPLC chromatogram">
      <defs>
        <linearGradient id="fn-hero-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6B0504" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#3A0A08" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <rect width="520" height="400" fill="url(#fn-hero-wash)" />
      {[80, 140, 200, 260, 320].map((y) => (
        <line key={y} x1="40" y1={y} x2="480" y2={y} stroke="#E9DED4" strokeWidth="1" />
      ))}
      <line x1="40" y1="320" x2="480" y2="320" stroke="#B06C49" strokeWidth="1.5" />
      <path
        className="hplc-trace"
        d="M40 318 L120 316 L150 314 L168 300 L180 96 L196 306 L214 314 L262 312 L280 232 L296 310 L340 313 L356 268 L372 312 L440 315 L480 316"
        fill="none"
        stroke="#C20114"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="180" cy="96" r="3.5" fill="#C20114" className="fn-dot-live" />
      <text x="192" y="92" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill="#B06C49">99.4%</text>
      <text x="40" y="344" fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#B06C49" letterSpacing="1.6">RT 0.0</text>
      <text x="428" y="344" fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#B06C49" letterSpacing="1.6">12.0 MIN</text>
    </svg>
  );
}

export default function Home() {
  const { t, lang } = useLang();
  const { coaPageEnabled } = useSiteConfig();
  const [products, setProducts] = useState([]);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [subBusy, setSubBusy] = useState(false);

  useEffect(() => {
    api.get("/products", { params: { featured: true } })
      .then((r) => setProducts(r.data.slice(0, 6)))
      .catch(() => {});
  }, []);

  /* LCAP/CASL : consentement expres obligatoire, case jamais pre-cochee. */
  const subscribe = async (e) => {
    e.preventDefault();
    if (!consent) {
      toast.error(t("home.newsletterConsentRequired"));
      return;
    }
    setSubBusy(true);
    try {
      const { data } = await api.post("/newsletter/subscribe", {
        email: email.trim(),
        lang,
        source: "home",
      });
      toast.success(data.already_subscribed ? t("home.newsletterAlready") : t("home.newsletterOk"));
      setEmail("");
      setConsent(false);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally {
      setSubBusy(false);
    }
  };

  const trustItems = [
    { icon: FlaskConical, label: t("home.trustTested") },
    { icon: MapPin, label: t("home.trustCanada") },
    { icon: ShieldCheck, label: t("home.trustPurity") },
    { icon: Package, label: t("home.trustDiscreet") },
  ];

  const categories = [
    { key: "healing", label: t("categories.healing"), img: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&w=600&q=80" },
    { key: "weight-loss", label: t("categories.weight-loss"), img: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=600&q=80" },
    { key: "gh-secretagogues", label: t("categories.gh-secretagogues"), img: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=600&q=80" },
    { key: "cognitive", label: t("categories.cognitive"), img: "https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=600&q=80" },
    { key: "longevity", label: t("categories.longevity"), img: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=600&q=80" },
  ];

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative overflow-hidden grain" data-testid="hero-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-14 lg:pt-20 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-faint bg-paper px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-copper">
              <span className="w-1.5 h-1.5 rounded-full bg-signal fn-dot-live" />
              {t("home.heroOverline")}
            </div>
            <h1
              className="mt-8 font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.02em] leading-[1.02] text-ink"
              data-testid="hero-title"
            >
              {lang === "fr" ? (
                <>Peptides de précision <span className="text-copper">pour la recherche.</span></>
              ) : (
                <>Precision peptides <span className="text-copper">for research.</span></>
              )}
            </h1>
            <p className="mt-6 text-base sm:text-lg max-w-md text-inkmuted leading-relaxed">
              {t("home.heroSub")}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/catalog"
                data-testid="hero-cta-catalog"
                className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.25em] px-7 py-4 inline-flex items-center gap-3 shadow-luxe hover:shadow-luxe-lg transition-shadow"
              >
                {t("home.heroCta")} <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
              {coaPageEnabled && (
                <Link
                  to="/lab"
                  data-testid="hero-cta-lab"
                  className="rounded-full border border-faint bg-paper font-mono text-xs uppercase tracking-[0.25em] px-7 py-4 inline-flex items-center gap-3 text-ink hover:border-copper transition-colors"
                >
                  {t("home.heroCta2")}
                </Link>
              )}
            </div>
            <div className="mt-12 grid grid-cols-3 gap-3 max-w-md">
              {["LOT · 2026Q1", "≥ 99% PURITY", "BIO-RX-CA"].map((s) => (
                <div
                  key={s}
                  className="rounded-md border border-faint bg-paper px-3 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-copper text-center"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Le COA est la piece hero — pas une note de bas de page. */}
          <div className="relative animate-fade-up-delay-1">
            <div className="relative rounded-lg overflow-hidden aspect-[4/5] lg:aspect-[5/6] bg-paper border border-faint shadow-luxe-lg">
              <Chromatogram />
              <div className="absolute top-5 left-5 rounded-full font-mono text-[10px] uppercase tracking-[0.25em] bg-paper/90 backdrop-blur border border-faint px-4 py-2 text-copper">
                HPLC · LOT 2026Q1-004
              </div>
              <div className="absolute bottom-5 right-5 rounded-full font-mono text-[10px] uppercase tracking-[0.25em] bg-garnet text-paper px-4 py-2">
                MADE IN CANADA
              </div>
              <svg viewBox="0 0 120 120" className="absolute bottom-5 left-5 w-16 h-16 animate-seal" aria-hidden="true">
                <defs>
                  <path id="fn-seal-path" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
                </defs>
                <circle cx="60" cy="60" r="52" fill="none" stroke="#B06C49" strokeWidth="1" opacity="0.5" />
                <text fontFamily="'JetBrains Mono', monospace" fontSize="11" fill="#B06C49" letterSpacing="2.4">
                  <textPath href="#fn-seal-path">THIRD-PARTY VERIFIED · ANALYSÉ EN LABO TIERS · </textPath>
                </text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST MARQUEE */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8" data-testid="trust-marquee">
        <div className="rounded-lg bg-garnet text-paper overflow-hidden shadow-luxe">
          <div className="marquee-track py-5">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex items-center gap-16 pr-16 font-mono text-xs uppercase tracking-[0.3em]">
                {trustItems.map((it, i) => (
                  <span key={i} className="flex items-center gap-3 whitespace-nowrap">
                    <it.icon size={14} strokeWidth={1.5} /> {it.label}
                    <span className="text-copperlight/50">/</span>
                  </span>
                ))}
                {trustItems.map((it, i) => (
                  <span key={`b-${i}`} className="flex items-center gap-3 whitespace-nowrap">
                    <it.icon size={14} strokeWidth={1.5} /> {it.label}
                    <span className="text-copperlight/50">/</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8" data-testid="featured-products">
        <div className="pt-24 pb-12 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copper">02 — FEATURED</div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.01em] mt-3 text-ink">
              {t("home.featuredTitle")}
            </h2>
            <div className="rule-copper mt-5 w-24" />
            <p className="mt-4 max-w-xl text-inkmuted">{t("home.featuredSub")}</p>
          </div>
          <Link
            to="/catalog"
            data-testid="view-all-catalog"
            className="font-mono text-xs uppercase tracking-[0.25em] link-underline text-ink"
          >
            {t("common.viewAll")} →
          </Link>
        </div>
        <div className="pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((p, i) => (
              <ProductCard product={p} key={p.id} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8" data-testid="categories-section">
        <div className="pb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copper">03 — CATEGORIES</div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.01em] mt-3 text-ink">
            {t("home.categoriesTitle")}
          </h2>
          <div className="rule-copper mt-5 w-24" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {categories.map((c, idx) => (
            <Link
              key={c.key}
              to={`/catalog?cat=${c.key}`}
              data-testid={`category-${c.key}`}
              className="relative aspect-[3/4] rounded-lg group overflow-hidden card-hover border border-faint"
            >
              <img
                src={c.img}
                alt={c.label}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-garnet/85 via-garnet/35 to-garnet/10 group-hover:from-garnet/75 transition-colors" />
              <div className="relative h-full p-5 flex flex-col justify-between text-paper">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] bg-paper/15 backdrop-blur rounded-full w-fit px-3 py-1">
                  0{idx + 1}
                </div>
                <div>
                  <div className="font-display text-xl sm:text-2xl font-bold tracking-[-0.01em] leading-tight">{c.label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] mt-2 text-copperlight">EXPLORE →</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* NEWSLETTER — LCAP/CASL */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24" data-testid="newsletter-section">
        <div className="rounded-lg bg-garnet text-paper px-8 lg:px-14 py-14 grid lg:grid-cols-2 gap-12 items-start overflow-hidden relative shadow-luxe-lg">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-paper/5 pointer-events-none" />
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copperlight">04 — RESEARCH NOTES</div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.01em] mt-3">
              {t("home.newsletterTitle")}
            </h2>
            <p className="mt-4 max-w-md text-paper/70">{t("home.newsletterSub")}</p>
          </div>
          <form onSubmit={subscribe} className="relative" data-testid="newsletter-form">
            <div className="flex rounded-full bg-paper p-1.5 shadow-luxe">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("home.newsletterPlaceholder")}
                className="flex-1 px-5 py-3 bg-transparent font-mono text-sm text-ink focus:outline-none min-w-0 rounded-full"
                data-testid="newsletter-input"
              />
              <button
                type="submit"
                disabled={subBusy}
                className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-60 whitespace-nowrap"
                data-testid="newsletter-submit"
              >
                {t("home.subscribe")} →
              </button>
            </div>
            {/* Case JAMAIS pre-cochee — exigence LCAP (consentement expres). */}
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                data-testid="newsletter-consent"
                className="mt-0.5 w-4 h-4 shrink-0 accent-[#C20114]"
              />
              <span className="text-[11px] leading-relaxed text-paper/70">{t("home.newsletterConsent")}</span>
            </label>
          </form>
        </div>
      </section>
    </div>
  );
}
FN_EOF_A05FC3D3
echo "    frontend/src/pages/Home.jsx"
mkdir -p "$(dirname frontend/src/pages/Catalog.jsx)"
cat > frontend/src/pages/Catalog.jsx << 'FN_EOF_0CAE7575'
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import ProductCard from "../components/ProductCard";

// Repli : si GET /categories échoue ou ne renvoie rien, on garde exactement
// la liste historique — le catalogue ne doit jamais perdre ses filtres.
const FALLBACK_CATEGORIES = ["all", "healing", "gh-secretagogues", "weight-loss", "cognitive", "longevity"];

// Libellé : nom stocké en base d'abord, puis clé i18n historique en repli
// (on ne supprime pas les clés i18n : elles servent aux slugs d'origine).
function catLabel(c, lang, t) {
  const stored = lang === "fr" ? c.name_fr : c.name_en;
  if (stored) return stored;
  const key = `categories.${c.slug}`;
  const translated = t(key);
  return translated === key ? c.slug.replace(/-/g, " ") : translated;
}

export default function Catalog() {
  useDocumentHead({ title: "Catalog", description: "Browse Fironova research peptides. Certificate-of-analysis documentation. For Research Use Only.", path: "/catalog" });
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("name");
  const [cats, setCats] = useState(null); // null = pas encore chargé

  const active = params.get("cat") || "all";

  // Catégories pilotées par l'admin. Masquer une catégorie la retire d'ici.
  useEffect(() => {
    let cancelled = false;
    api.get("/categories")
      .then((r) => { if (!cancelled) setCats(Array.isArray(r.data) && r.data.length ? r.data : []); })
      .catch(() => { if (!cancelled) setCats([]); });
    return () => { cancelled = true; };
  }, []);

  // Chips affichés : "all" synthétique + catégories publiées, ou repli.
  const chips = useMemo(() => {
    if (cats && cats.length) {
      return [{ slug: "all", name_en: null, name_fr: null }, ...cats];
    }
    return FALLBACK_CATEGORIES.map((c) => ({ slug: c, name_en: null, name_fr: null }));
  }, [cats]);

  useEffect(() => {
    setLoading(true);
    api.get("/products", { params: active !== "all" ? { category: active } : {} })
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, [active]);

  const sorted = useMemo(() => {
    const arr = [...products];
    if (sort === "price-asc") arr.sort((a, b) => a.price_cad - b.price_cad);
    if (sort === "price-desc") arr.sort((a, b) => b.price_cad - a.price_cad);
    if (sort === "name") arr.sort((a, b) => a.name_en.localeCompare(b.name_en));
    return arr;
  }, [products, sort]);

  return (
    <div data-testid="catalog-page">
      <div className="border-b border-ink px-6 lg:px-12 py-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// CATALOG</div>
        <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight mt-3">
          {t("catalog.title")}
        </h1>
        <p className="mt-4 max-w-xl text-foreground/70">{t("catalog.sub")}</p>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-ink p-6 lg:p-8" data-testid="catalog-sidebar">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mb-4">
            {t("common.filter")}
          </div>
          <ul className="space-y-2">
            {chips.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => setParams(c.slug === "all" ? {} : { cat: c.slug })}
                  data-testid={`filter-${c.slug}`}
                  className={`text-left w-full font-mono text-xs uppercase tracking-[0.2em] py-2 border-b border-transparent ${
                    active === c.slug ? "border-ink font-bold" : "text-foreground/70 hover:text-ink"
                  }`}
                >
                  {catLabel(c, lang, t)}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mb-3">
              {t("catalog.sortBy")}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              data-testid="catalog-sort"
              className="w-full border border-ink px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] bg-white"
            >
              <option value="name">{t("catalog.sortName")}</option>
              <option value="price-asc">{t("catalog.sortPriceAsc")}</option>
              <option value="price-desc">{t("catalog.sortPriceDesc")}</option>
            </select>
          </div>
        </aside>
        <section>
          {loading ? (
            <div className="p-16 font-mono text-xs uppercase tracking-[0.25em] text-foreground/60">
              {t("common.loading")}
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-16 font-mono text-xs uppercase tracking-[0.25em] text-foreground/60" data-testid="catalog-empty">
              {t("catalog.empty")}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-l border-ink/15">
              {sorted.map((p, i) => <ProductCard product={p} key={p.id} index={i} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
FN_EOF_0CAE7575
echo "    frontend/src/pages/Catalog.jsx"
mkdir -p "$(dirname frontend/src/pages/ComingSoon.jsx)"
cat > frontend/src/pages/ComingSoon.jsx << 'FN_EOF_B52A92DE'
import { useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";

export default function ComingSoon() {
  const { t, lang } = useLang();
  const { launchCouponCode } = useSiteConfig();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    // LCAP : consentement exprès obligatoire, case jamais pré-cochée.
    if (!consent) {
      toast.error(t("home.newsletterConsentRequired"));
      return;
    }
    setBusy(true);
    try {
      await api.post("/newsletter/subscribe", { email: email.trim(), lang, source: "prelaunch" });
      setDone(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper grain flex items-center justify-center px-6 py-16" data-testid="coming-soon-page">
      <div className="w-full max-w-xl text-center">
        <div className="font-display font-bold text-3xl tracking-[-0.01em] text-ink">
          FIRONOVA<span className="text-signal">.</span>
        </div>

        <svg viewBox="0 0 520 120" className="w-full h-24 mt-10" role="img" aria-label="HPLC chromatogram">
          <line x1="20" y1="100" x2="500" y2="100" stroke="#B06C49" strokeWidth="1.5" />
          <path
            className="hplc-trace"
            d="M20 98 L120 96 L150 94 L168 84 L180 20 L196 90 L214 96 L280 94 L300 52 L318 95 L400 97 L420 74 L438 96 L500 97"
            fill="none" stroke="#C20114" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          />
        </svg>

        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.02em] text-ink mt-8">
          {t("prelaunch.title")}
        </h1>
        <div className="rule-copper mx-auto mt-6 w-24" />
        <p className="mt-6 text-inkmuted leading-relaxed max-w-md mx-auto">{t("prelaunch.body")}</p>

        {done ? (
          <div
            className="mt-10 rounded-lg border border-copper bg-paper px-6 py-8 shadow-luxe"
            data-testid="coming-soon-success"
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-copper">
              {t("prelaunch.confirmedTag")}
            </div>
            <p className="mt-3 text-ink">{t("prelaunch.confirmed")}</p>
            <div className="mt-4 inline-block rounded-full border border-faint px-4 py-2 font-mono text-sm text-signal tracking-[0.1em]">
              {launchCouponCode}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-10 text-left max-w-md mx-auto" data-testid="coming-soon-form">
            <div className="flex rounded-full bg-paper border border-faint p-1.5 shadow-luxe">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("home.newsletterPlaceholder")}
                className="flex-1 px-5 py-3 bg-transparent font-mono text-sm text-ink focus:outline-none min-w-0 rounded-full"
                data-testid="coming-soon-input"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-60 whitespace-nowrap"
                data-testid="coming-soon-submit"
              >
                {t("prelaunch.cta")} →
              </button>
            </div>
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                data-testid="coming-soon-consent"
                className="mt-0.5 w-4 h-4 shrink-0 accent-[#C20114]"
              />
              <span className="text-[11px] leading-relaxed text-inkmuted">{t("home.newsletterConsent")}</span>
            </label>
          </form>
        )}

        <p className="mt-12 fn-ruo inline-block">
          FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT · 19+
        </p>
      </div>
    </div>
  );
}
FN_EOF_B52A92DE
echo "    frontend/src/pages/ComingSoon.jsx"
mkdir -p "$(dirname frontend/src/pages/admin/AdminLayout.jsx)"
cat > frontend/src/pages/admin/AdminLayout.jsx << 'FN_EOF_151FE764'
import { useEffect, useMemo, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Ticket, Users, Truck, Settings as Cog,
  LogOut, Download, Search, X, Plus, Edit, Trash2, FileText, CheckCircle2, AlertCircle, Clock, UserCog,
  History, FolderTree, ListTree, Mail,
} from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLang } from "../../contexts/LanguageContext";

import AdminDashboard from "./sections/AdminDashboard";
import AdminOrders from "./sections/AdminOrders";
import AdminProducts from "./sections/AdminProducts";
import AdminCoupons from "./sections/AdminCoupons";
import AdminCustomers from "./sections/AdminCustomers";
import AdminShipping from "./sections/AdminShipping";
import AdminStaff from "./sections/AdminStaff";
import AdminTrash from "./sections/AdminTrash";
import AdminAuditLog from "./sections/AdminAuditLog";
import AdminCategories from "./sections/AdminCategories";
import AdminMenus from "./sections/AdminMenus";
import AdminSubscribers from "./sections/AdminSubscribers";

// Un membre "staff" ne voit dans le menu que les sections où il a au moins
// un accès "view". Le rôle "admin" (owner) voit tout, sans exception. Cette
// liste côté UI n'est qu'un confort d'affichage — la vraie barrière reste
// le contrôle serveur (require_area) sur chaque appel API.
function hasAccess(user, area) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") return (user.permissions?.[area] || "none") !== "none";
  return false;
}

export default function AdminLayout({ basePath = "/admin" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const nav = useMemo(() => {
    const all = [
      { to: basePath, label: "Dashboard", icon: LayoutDashboard, end: true, area: "dashboard" },
      { to: `${basePath}/orders`, label: "Orders", icon: ShoppingCart, area: "orders" },
      { to: `${basePath}/products`, label: "Products", icon: Package, area: "products" },
      { to: `${basePath}/coupons`, label: "Coupons", icon: Ticket, area: "coupons" },
      { to: `${basePath}/customers`, label: "Customers", icon: Users, area: "customers" },
      { to: `${basePath}/shipping`, label: "Shipping", icon: Truck, area: "shipping" },
      { to: `${basePath}/subscribers`, label: "Subscribers", icon: Mail, area: "subscribers" },
    ];
    const filtered = all.filter((n) => hasAccess(user, n.area));
    // Gestion des membres, corbeille et journal d'audit sont réservés aux
    // "admin" (owner) — actions à fort impact ou de gouvernance, jamais
    // déléguées à un staff même avec accès "manage" complet.
    if (user?.role === "admin") {
      filtered.push({ to: `${basePath}/categories`, label: "Categories", icon: FolderTree, area: "categories" });
      filtered.push({ to: `${basePath}/menus`, label: "Menus", icon: ListTree, area: "menus" });
      filtered.push({ to: `${basePath}/staff`, label: "Team", icon: UserCog, area: "staff" });
      filtered.push({ to: `${basePath}/trash`, label: "Trash", icon: Trash2, area: "trash" });
      filtered.push({ to: `${basePath}/audit-log`, label: "Activity log", icon: History, area: "audit" });
    }
    return filtered;
  }, [user, basePath]);

  // Première section accessible — sert de redirection si l'utilisateur
  // n'a pas accès au dashboard (ex. staff avec uniquement "orders").
  const landingPath = nav[0]?.to || basePath;

  return (
    <div className="min-h-screen bg-[#f7f7f7] -mt-px" data-testid="admin-shell">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-ink/10 min-h-screen sticky top-0 hidden lg:flex flex-col" data-testid="admin-sidebar">
          <div className="px-6 py-6 border-b border-ink/10">
            <div className="font-display font-extrabold text-xl tracking-tight">
              FIRONOVA<span style={{ color: "#C20114" }}>.</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mt-1">// Admin</div>
          </div>
          <nav className="flex-1 py-4">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={`admin-nav-${n.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                    isActive ? "bg-ink text-white" : "text-foreground/70 hover:bg-secondary"
                  }`
                }
              >
                <n.icon size={16} strokeWidth={1.6} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-ink/10 p-4 space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
              {user?.email}
            </div>
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="w-full flex items-center justify-center gap-2 border border-ink py-2 text-xs font-mono uppercase tracking-[0.2em] hover:bg-ink hover:text-white"
              data-testid="admin-logout"
            >
              <LogOut size={12} /> Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="bg-white border-b border-ink/10 px-8 py-4 flex items-center justify-between" data-testid="admin-topbar">
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/60">
              FOR LABORATORY RESEARCH USE ONLY · 19+
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
              {new Date().toLocaleDateString("en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
          </div>
          <Routes>
            <Route index element={hasAccess(user, "dashboard") ? <AdminDashboard /> : <Navigate to={landingPath} replace />} />
            <Route path="orders" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="orders/:id" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="products" element={hasAccess(user, "products") ? <AdminProducts /> : <Navigate to={landingPath} replace />} />
            <Route path="coupons" element={hasAccess(user, "coupons") ? <AdminCoupons /> : <Navigate to={landingPath} replace />} />
            <Route path="customers" element={hasAccess(user, "customers") ? <AdminCustomers /> : <Navigate to={landingPath} replace />} />
            <Route path="shipping" element={hasAccess(user, "shipping") ? <AdminShipping /> : <Navigate to={landingPath} replace />} />
            <Route path="subscribers" element={hasAccess(user, "subscribers") ? <AdminSubscribers /> : <Navigate to={landingPath} replace />} />
            <Route path="categories" element={user?.role === "admin" ? <AdminCategories /> : <Navigate to={landingPath} replace />} />
            <Route path="menus" element={user?.role === "admin" ? <AdminMenus /> : <Navigate to={landingPath} replace />} />
            <Route path="staff" element={user?.role === "admin" ? <AdminStaff /> : <Navigate to={landingPath} replace />} />
            <Route path="trash" element={user?.role === "admin" ? <AdminTrash /> : <Navigate to={landingPath} replace />} />
            <Route path="audit-log" element={user?.role === "admin" ? <AdminAuditLog /> : <Navigate to={landingPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

// Shared utilities for sections to import
export const StatusBadge = ({ status }) => {
  const map = {
    paid: { bg: "#0d9d57", color: "#fff", icon: CheckCircle2 },
    awaiting_etransfer: { bg: "#f59e0b", color: "#fff", icon: Clock },
    awaiting_crypto: { bg: "#f59e0b", color: "#fff", icon: Clock },
    refunded: { bg: "#6b7280", color: "#fff", icon: AlertCircle },
    pending: { bg: "#f3f4f6", color: "#111", icon: Clock },
    processing: { bg: "#3b82f6", color: "#fff", icon: Package },
    shipped: { bg: "#7c3aed", color: "#fff", icon: Truck },
    delivered: { bg: "#10b981", color: "#fff", icon: CheckCircle2 },
    cancelled: { bg: "#ef4444", color: "#fff", icon: X },
    preorder: { bg: "#f97316", color: "#fff", icon: Clock },
  };
  const conf = map[status] || { bg: "#f3f4f6", color: "#111", icon: Clock };
  const Icon = conf.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em]"
      style={{ background: conf.bg, color: conf.color }}
      data-testid={`status-${status}`}
    >
      <Icon size={11} strokeWidth={2} />
      {status?.replace(/_/g, " ")}
    </span>
  );
};

export { useAdminApi } from "./hooks";
FN_EOF_151FE764
echo "    frontend/src/pages/admin/AdminLayout.jsx"
mkdir -p "$(dirname frontend/src/pages/admin/sections/AdminOrders.jsx)"
cat > frontend/src/pages/admin/sections/AdminOrders.jsx << 'FN_EOF_9B5D2C30'
import { useEffect, useMemo, useState } from "react";
import { Download, Search, X, FileText, CheckCircle2, Save, Truck, MessageSquarePlus, Mail, Undo2, Trash2, AlertTriangle, Send, Tag } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";

const FULFILLMENT_OPTS = ["pending", "preorder", "processing", "shipped", "delivered", "cancelled", "failed", "refunded"];
const PAYMENT_OPTS = ["awaiting_etransfer", "awaiting_crypto", "paid", "refunded", "cancelled", "failed"];
const TABS = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFulfill, setFilterFulfill] = useState("all");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("active");
  const [counts, setCounts] = useState({});
  const [manifest, setManifest] = useState(null);   // {configured, pending_count, groups}
  const [txBusy, setTxBusy] = useState(false);

  // Étiquettes créées mais non transmises = 2 $/article de surcharge et perte
  // du rabais d'automatisation. On le met sous les yeux, en haut de l'écran.
  const loadManifest = () => {
    api.get("/admin/shipping/pending-manifest")
      .then((r) => setManifest(r.data))
      .catch(() => setManifest(null));
  };
  useEffect(() => { loadManifest(); }, []);

  const transmitManifest = async () => {
    if (!window.confirm("Transmit today's manifest to Canada Post? This closes the shipments for billing.")) return;
    setTxBusy(true);
    try {
      const { data } = await api.post("/admin/shipping/transmit");
      toast.success(`Manifest transmitted — ${data.orders_marked} shipment(s) closed.`);
      if (data.manifests?.length) {
        toast.info(`${data.manifests.length} manifest document(s) available from Canada Post.`);
      }
      loadManifest();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setTxBusy(false);
    }
  };

  const load = () => {
    const qs = tab === "all" ? "" : `?status_group=${tab}`;
    api.get(`/admin/orders${qs}`).then((r) => setOrders(r.data));
    api.get("/admin/orders/counts").then((r) => setCounts(r.data));
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filterPayment !== "all" && o.payment_status !== filterPayment) return false;
      if (filterFulfill !== "all" && o.fulfillment_status !== filterFulfill) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${o.order_number} ${o.email || ""} ${o.shipping_address?.full_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, query, filterPayment, filterFulfill]);

  return (
    <div className="p-8" data-testid="admin-orders">
      {manifest?.configured && manifest.pending_count > 0 && (
        <div
          className="mb-6 border-2 border-red-600 bg-red-50 px-5 py-4 flex flex-wrap items-center justify-between gap-4"
          data-testid="manifest-warning"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-red-700 font-bold">
                {manifest.pending_count} label(s) created but not transmitted
              </div>
              <div className="text-sm text-red-800 mt-1">
                Transmit the manifest before end of day. Canada Post bills untransmitted shipments
                with a <strong>$2 surcharge per item</strong> and removes the automation discount.
              </div>
            </div>
          </div>
          <button
            onClick={transmitManifest}
            disabled={txBusy}
            data-testid="transmit-manifest-btn"
            className="bg-red-600 text-white font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 flex items-center gap-2 disabled:opacity-50 shrink-0"
          >
            <Send size={14} /> {txBusy ? "Transmitting…" : "Transmit manifest"}
          </button>
        </div>
      )}
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ORDERS</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Orders</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{filtered.length} of {orders.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${API_BASE}/admin/orders.csv${tab === "all" ? "" : `?status_group=${tab}`}`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-orders-csv"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
          >
            <Download size={14} /> CSV
          </a>
          <a
            href={`${API_BASE}/admin/orders.xlsx${tab === "all" ? "" : `?status_group=${tab}`}`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-orders-xlsx"
            className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-ink hover:text-white"
          >
            <Download size={14} /> Excel
          </a>
        </div>
      </div>

      {/* Status group tabs */}
      <div className="flex gap-0 mb-4 border border-ink/15 bg-white w-fit" data-testid="orders-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`orders-tab-${t.key}`}
            className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 flex items-center gap-2 ${tab === t.key ? "bg-ink text-white" : "hover:bg-secondary"}`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 ${tab === t.key ? "bg-white/20" : "bg-secondary"}`} data-testid={`orders-count-${t.key}`}>
              {counts[t.key] ?? "…"}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-ink/10 p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="orders-filters">
        <div className="flex items-center gap-2 border border-ink/15 px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-foreground/50" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, email, name…"
            data-testid="orders-search"
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>
        <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-payment">
          <option value="all">All payments</option>
          {PAYMENT_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterFulfill} onChange={(e) => setFilterFulfill(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-fulfill">
          <option value="all">All fulfillments</option>
          {FULFILLMENT_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Order</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Customer</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Method</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Payment</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Fulfillment</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]">Total</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-t border-ink/5 hover:bg-secondary/40" data-testid={`order-row-${o.order_number}`}>
                <td className="px-6 py-3">
                  <div className="font-mono font-bold text-xs">{o.order_number}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{(o.created_at || "").slice(0, 10)}</div>
                  {o.dispatch_batch && (
                    <div className="font-mono text-[10px] text-copper" data-testid={`dispatch-batch-${o.order_number}`}>
                      LOT {o.dispatch_batch}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="text-sm">{o.shipping_address?.full_name || "—"}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{o.email || "guest"}</div>
                </td>
                <td className="px-6 py-3 font-mono text-xs uppercase">{o.payment_method}</td>
                <td className="px-6 py-3"><StatusBadge status={o.payment_status} /></td>
                <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} /></td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${o.total?.toFixed(2)}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setSelected(o)}
                    data-testid={`open-order-${o.order_number}`}
                    className="font-mono text-xs uppercase tracking-[0.2em] border border-ink px-3 py-1.5 hover:bg-ink hover:text-white"
                  >
                    Open →
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={7} className="px-6 py-12 text-center font-mono text-xs text-foreground/50">No orders match the filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} onUpdate={() => { load(); api.get(`/admin/orders`).then(r => setSelected(r.data.find(x => x.id === selected.id) || null)); }} />}
    </div>
  );
}

function OrderDetail({ order, onClose, onUpdate }) {
  const deleteOrder = async () => {
    if (!window.confirm(`Move order ${order.order_number} to trash? It stays recoverable there — nothing is lost.`)) return;
    try {
      await api.delete(`/admin/orders/${order.id}`);
      toast.success("Order moved to trash");
      onUpdate();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };
  const [tracking, setTracking] = useState(order.shipping_info?.tracking_number || "");
  const [carrier, setCarrier] = useState(order.shipping_info?.carrier || "Canada Post");
  const [cpRates, setCpRates] = useState(null);       // null = pas chargé, [] = non configuré
  const [cpService, setCpService] = useState("");
  const [cpBusy, setCpBusy] = useState(false);
  const [shipInfo, setShipInfo] = useState(order.shipping_info || {});

  useEffect(() => { setShipInfo(order.shipping_info || {}); }, [order.shipping_info]);

  // Services disponibles pour CETTE destination.
  useEffect(() => {
    let cancelled = false;
    api.get(`/admin/orders/${order.id}/shipping-rates`)
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.rates || [];
        setCpRates(r.data?.configured ? list : []);
        if (list.length) setCpService((v) => v || list[0].service_code);
      })
      .catch(() => { if (!cancelled) setCpRates([]); });
    return () => { cancelled = true; };
  }, [order.id]);

  const createLabel = async () => {
    if (!cpService) { toast.error("Select a shipping service first."); return; }
    setCpBusy(true);
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/create-label`, { service_code: cpService });
      setShipInfo(data.shipping_info);
      setTracking(data.shipping_info.tracking_number || "");
      setCarrier(data.shipping_info.carrier || "Canada Post");
      // Idempotent côté serveur : un 2e clic ne facture pas un 2e colis.
      toast.success(data.already_existed
        ? "A label already exists for this order — reusing it."
        : `Label created — tracking ${data.shipping_info.tracking_number}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setCpBusy(false);
    }
  };

  const voidLabel = async () => {
    if (!window.confirm("Void this Canada Post label? Only possible before the manifest is transmitted.")) return;
    setCpBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/void-label`);
      setShipInfo({});
      setTracking("");
      toast.success("Label voided.");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setCpBusy(false);
    }
  };
  const [noteText, setNoteText] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirmPayment = async () => {
    try {
      await api.post(`/admin/orders/${order.id}/confirm-payment`);
      toast.success("Payment confirmed — moved to Processing");
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const updateStatus = async (field, value) => {
    try {
      await api.put(`/admin/orders/${order.id}/status?${field}=${value}`);
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveShipping = async () => {
    try {
      await api.put(`/admin/orders/${order.id}/shipping`, { carrier, tracking_number: tracking });
      toast.success("Tracking saved — order marked as shipped");
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/admin/orders/${order.id}/notes`, { text: noteText, visible_to_customer: noteVisible });
      if (noteVisible) toast.success("Note added — email sent to customer");
      setNoteText(""); setNoteVisible(false); onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const issueRefund = async () => {
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid refund amount"); return; }
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/refund`, { amount: amt });
      toast.success(`Refunded $${amt.toFixed(2)} — total refunded $${data.refunded_amount?.toFixed(2)}`);
      setRefundAmount(""); onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const resendEmail = async () => {
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/resend-email`);
      toast.success(`Order email re-sent to ${data.sent_to}`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addr = order.shipping_address || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div className="bg-[#fafafa] w-full max-w-3xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="order-detail-drawer">
        <div className="bg-ink text-white px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em]">// ORDER</div>
            <div className="font-display text-xl font-bold tracking-tight" data-testid="order-detail-number">{order.order_number}</div>
            {order.dispatch_batch && (
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-copperlight" data-testid="order-detail-dispatch-batch">
                LOT D'EXPÉDITION · {order.dispatch_batch}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={deleteOrder} data-testid="delete-order-btn" title="Move to trash"
              className="text-white/60 hover:text-white">
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} aria-label="Close" data-testid="close-order-detail"><X size={20} /></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={order.payment_status} />
            <StatusBadge status={order.fulfillment_status} />
            {order.payment_status !== "paid" && (
              <button
                onClick={confirmPayment}
                data-testid="confirm-payment-btn"
                className="bg-emerald-600 text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-emerald-700"
              >
                <CheckCircle2 size={14} /> Confirm Payment
              </button>
            )}
            <a
              href={`${API_BASE}/orders/${order.id}/invoice.pdf`}
              target="_blank" rel="noopener noreferrer"
              data-testid="download-invoice-pdf"
              className="border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white"
            >
              <FileText size={14} /> Invoice PDF
            </a>
            {order.email && (
              <button
                onClick={resendEmail}
                data-testid="resend-email-btn"
                className="border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white"
              >
                <Mail size={14} /> Resend Email
              </button>
            )}
          </div>

          {/* Customer + Address */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white border border-ink/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">Customer</div>
              <div className="font-bold mt-1">{addr.full_name || "—"}</div>
              <div className="text-sm text-foreground/70">{order.email || "Guest"}</div>
              {addr.phone && <div className="text-sm text-foreground/70">{addr.phone}</div>}
            </div>
            <div className="bg-white border border-ink/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">Ship to</div>
              <div className="text-sm mt-1">{addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}</div>
              <div className="text-sm">{addr.city}, {addr.province} {addr.postal_code}</div>
              <div className="text-sm">{addr.country}</div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border border-ink/10">
            <div className="px-4 py-3 border-b border-ink/10 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">Items</div>
            <table className="w-full text-sm">
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.product_id} className="border-t border-ink/5">
                    <td className="px-4 py-3">
                      <div className="font-bold">{it.name_en}</div>
                      <div className="font-mono text-[10px] text-foreground/50">{it.slug} · {it.qty}× @ ${it.price_cad?.toFixed(2)}</div>
                      {it.preorder && <span className="inline-block mt-1 text-[10px] font-mono uppercase tracking-[0.15em] bg-orange-500 text-white px-2 py-0.5">PRE-ORDER</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">${it.line_total?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/50">
                <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">Subtotal</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.subtotal?.toFixed(2)}</td></tr>
                {order.discount > 0 && (
                  <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">Discount {order.coupon?.code && `(${order.coupon.code})`}</td><td className="px-4 py-1 text-right text-sm tabular-nums text-emerald-700">-${order.discount?.toFixed(2)}</td></tr>
                )}
                <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">Shipping</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.shipping?.toFixed(2)}</td></tr>
                <tr><td className="px-4 py-2 text-right font-bold uppercase">Total CAD</td><td className="px-4 py-2 text-right font-display font-extrabold text-lg tabular-nums" data-testid="order-total">${order.total?.toFixed(2)}</td></tr>
              </tfoot>
            </table>
          </div>

          {/* Shipping */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><Truck size={12} /> Shipping & Tracking</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Carrier</label>
                <input value={carrier} onChange={(e) => setCarrier(e.target.value)} data-testid="shipping-carrier" className="w-full border border-ink/20 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Tracking Number</label>
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} data-testid="shipping-tracking" className="w-full border border-ink/20 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={saveShipping} data-testid="save-shipping-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-foreground/80">
                <Save size={14} /> Save & Mark Shipped
              </button>
            </div>
            {order.shipping_info?.shipped_at && (
              <div className="font-mono text-[10px] text-foreground/50 mt-2">Shipped at: {order.shipping_info.shipped_at}</div>
            )}

            {/* Postes Canada — le champ manuel ci-dessus reste le repli si
                l'API n'est pas configurée. */}
            <div className="mt-4 pt-4 border-t border-ink/10">
              {cpRates === null && (
                <div className="font-mono text-[10px] text-foreground/50">Checking Canada Post…</div>
              )}
              {cpRates !== null && cpRates.length === 0 && (
                <div className="font-mono text-[10px] text-foreground/50">
                  Canada Post not configured — use the manual tracking field above.
                </div>
              )}
              {cpRates !== null && cpRates.length > 0 && (
                <>
                  {shipInfo?.label_url ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={`${API_BASE.replace(/\/api$/, "")}${shipInfo.label_url}`}
                        target="_blank" rel="noopener noreferrer"
                        data-testid="download-label-btn"
                        className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 inline-flex items-center gap-2"
                      >
                        <Download size={14} /> Download label PDF
                      </a>
                      <span className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                        shipInfo.cp_transmitted ? "border-green-600 text-green-700" : "border-red-600 text-red-700"}`}>
                        {shipInfo.cp_transmitted ? "Manifest transmitted" : "Not transmitted"}
                      </span>
                      {!shipInfo.cp_transmitted && (
                        <button onClick={voidLabel} disabled={cpBusy} data-testid="void-label-btn"
                          className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 disabled:opacity-50">
                          Void label
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex-1 min-w-[220px]">
                        <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Canada Post service</label>
                        <select
                          value={cpService}
                          onChange={(e) => setCpService(e.target.value)}
                          data-testid="cp-service-select"
                          className="w-full border border-ink/20 px-3 py-2 text-sm bg-white"
                        >
                          {cpRates.map((r) => (
                            <option key={r.service_code} value={r.service_code}>
                              {r.service_name} — ${Number(r.cost_cad).toFixed(2)}
                              {r.eta_days ? ` (${r.eta_days}d)` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={createLabel}
                        disabled={cpBusy}
                        data-testid="create-label-btn"
                        className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 inline-flex items-center gap-2 disabled:opacity-50"
                      >
                        <Tag size={14} /> {cpBusy ? "Working…" : "Generate label"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Status quick switches */}
          <div className="bg-white border border-ink/10 p-4 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Payment Status</label>
              <select value={order.payment_status} onChange={(e) => updateStatus("payment_status", e.target.value)} data-testid="payment-status-select" className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
                {PAYMENT_OPTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Fulfillment Status</label>
              <select value={order.fulfillment_status} onChange={(e) => updateStatus("fulfillment_status", e.target.value)} data-testid="fulfillment-status-select" className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
                {FULFILLMENT_OPTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Refund */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><Undo2 size={12} /> Refund</div>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="number" min="0.01" step="0.01"
                value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}
                placeholder={`Amount (max $${(order.total - (order.refunded_amount || 0)).toFixed(2)})`}
                data-testid="refund-amount-input"
                className="border border-ink/20 px-3 py-2 text-sm w-56"
              />
              <button onClick={issueRefund} data-testid="issue-refund-btn" className="bg-red-600 text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:bg-red-700">
                Issue Refund
              </button>
              <div className="font-mono text-[10px] text-foreground/60" data-testid="refunded-so-far">
                Refunded so far: ${(order.refunded_amount || 0).toFixed(2)} / ${order.total?.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><MessageSquarePlus size={12} /> Order Notes</div>
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {(order.notes || []).map((n, i) => (
                <div key={i} className={`text-sm border-l-2 pl-3 py-1 ${n.visible_to_customer ? "border-emerald-500" : "border-ink/30"}`} data-testid={`note-${i}`}>
                  <div className="text-foreground/85">{n.text}</div>
                  <div className="font-mono text-[10px] text-foreground/50 mt-1">
                    {n.admin_email || n.author} · {((n.ts || n.created_at) || "").slice(0, 16).replace("T", " ")}
                    {n.visible_to_customer && <span className="ml-2 text-emerald-600 font-bold">CUSTOMER</span>}
                  </div>
                </div>
              ))}
              {!order.notes?.length && <div className="font-mono text-[10px] text-foreground/50">No notes yet.</div>}
            </div>
            <div className="flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" data-testid="note-input" className="flex-1 border border-ink/20 px-3 py-2 text-sm" />
              <button onClick={addNote} data-testid="add-note-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4">Add</button>
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={noteVisible} onChange={(e) => setNoteVisible(e.target.checked)} data-testid="note-visible-checkbox" />
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">Visible to customer (sends email)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
FN_EOF_9B5D2C30
echo "    frontend/src/pages/admin/sections/AdminOrders.jsx"
mkdir -p "$(dirname frontend/src/pages/admin/sections/AdminCategories.jsx)"
cat > frontend/src/pages/admin/sections/AdminCategories.jsx << 'FN_EOF_095417FD'
import { useCallback, useEffect, useState } from "react";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";

const EMPTY = { slug: "", name_en: "", name_fr: "", published: true, display_order: 0 };

export default function AdminCategories() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {…category} | EMPTY
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/categories");
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = {
        slug: (editing.slug || "").trim().toLowerCase(),
        name_en: editing.name_en,
        name_fr: editing.name_fr,
        published: !!editing.published,
        display_order: Number(editing.display_order) || 0,
      };
      if (editing.id) {
        const { data } = await api.put(`/admin/categories/${editing.id}`, body);
        // Renommer un slug déplace les produits : on le dit, sinon l'admin
        // ne saura jamais que 8 fiches viennent de changer de catégorie.
        if (data.products_migrated > 0) {
          toast.success(`Category updated — ${data.products_migrated} product(s) moved to "${body.slug}".`);
        } else {
          toast.success("Category updated.");
        }
      } else {
        await api.post("/admin/categories", body);
        toast.success("Category created.");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (row) => {
    try {
      await api.put(`/admin/categories/${row.id}`, { ...row, published: !row.published });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete category "${row.name_en}"?`)) return;
    try {
      await api.delete(`/admin/categories/${row.id}`);
      toast.success("Category deleted.");
      load();
    } catch (e) {
      // 409 = catégorie encore utilisée : le serveur l'a masquée au lieu de
      // la supprimer, pour ne jamais orpheliner un produit.
      const msg = formatApiError(e.response?.data?.detail);
      if (e.response?.status === 409) toast.warning(msg);
      else toast.error(msg);
      load();
    }
  };

  return (
    <div data-testid="admin-categories">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Categories</h1>
          <p className="text-sm text-inkmuted mt-1">
            Products reference categories by slug. Renaming a slug moves every product using it.
          </p>
        </div>
        <button
          data-testid="category-add"
          onClick={() => setEditing({ ...EMPTY, display_order: rows.length })}
          className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 inline-flex items-center gap-2"
        >
          <Plus size={14} /> New
        </button>
      </div>

      <div className="bg-paper border border-faint rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-faint font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
              <th className="text-left px-4 py-3">Name (EN)</th>
              <th className="text-left px-4 py-3">Slug</th>
              <th className="text-left px-4 py-3">Order</th>
              <th className="text-left px-4 py-3">Published</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-inkmuted">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-inkmuted">No categories yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-faint last:border-0" data-testid={`category-row-${r.slug}`}>
                <td className="px-4 py-3 text-ink">{r.name_en}</td>
                <td className="px-4 py-3 font-mono text-xs text-copper">{r.slug}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">{r.display_order}</td>
                <td className="px-4 py-3">
                  <button
                    data-testid={`category-toggle-${r.slug}`}
                    onClick={() => togglePublished(r)}
                    className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1 border ${
                      r.published ? "bg-garnet text-paper border-garnet" : "border-faint text-inkmuted"
                    }`}
                  >
                    {r.published ? "Published" : "Hidden"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button data-testid={`category-edit-${r.slug}`} onClick={() => setEditing(r)} className="p-2 hover:text-garnet">
                    <Edit size={15} strokeWidth={1.5} />
                  </button>
                  <button data-testid={`category-delete-${r.slug}`} onClick={() => remove(r)} className="p-2 hover:text-signal">
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3A0A08]/60 backdrop-blur-xl px-4">
          <div className="w-full max-w-md bg-paper border border-faint rounded-lg shadow-luxe-lg" data-testid="category-dialog">
            <div className="flex items-center justify-between px-6 py-4 border-b border-faint">
              <div className="font-display font-bold text-ink">{editing.id ? "Edit category" : "New category"}</div>
              <button onClick={() => setEditing(null)} className="p-1"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { k: "name_en", label: "Name (EN)" },
                { k: "name_fr", label: "Nom (FR)" },
                { k: "slug", label: "Slug — lowercase, digits, hyphens only" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">{f.label}</label>
                  <input
                    data-testid={`category-field-${f.k}`}
                    value={editing[f.k] || ""}
                    onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })}
                    className="w-full mt-1 rounded-sm border border-faint bg-paper px-3 py-2 text-sm focus:outline-none focus:border-copper"
                  />
                </div>
              ))}
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">Display order</label>
                <input
                  type="number"
                  data-testid="category-field-display_order"
                  value={editing.display_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, display_order: e.target.value })}
                  className="w-full mt-1 rounded-sm border border-faint bg-paper px-3 py-2 text-sm font-mono focus:outline-none focus:border-copper"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="category-field-published"
                  checked={!!editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                  className="w-4 h-4 accent-[#C20114]"
                />
                <span className="text-sm text-ink">Published (visible on the storefront)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-faint">
              <button onClick={() => setEditing(null)} className="rounded-full border border-faint px-5 py-2 font-mono text-xs uppercase tracking-[0.2em]">
                Cancel
              </button>
              <button
                data-testid="category-save"
                disabled={busy}
                onClick={save}
                className="rounded-full bg-signal text-paper px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
FN_EOF_095417FD
echo "    frontend/src/pages/admin/sections/AdminCategories.jsx"
mkdir -p "$(dirname frontend/src/pages/admin/sections/AdminMenus.jsx)"
cat > frontend/src/pages/admin/sections/AdminMenus.jsx << 'FN_EOF_61313986'
import { useCallback, useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";

const EMPTY_MENU = {
  slug: "", name_en: "", name_fr: "", location: "header",
  published: true, display_order: 0, items: [],
};
const EMPTY_ITEM = {
  label_en: "", label_fr: "", url: "", published: true, display_order: 0, open_new_tab: false,
};

export default function AdminMenus() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/menus");
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      // Round-trip : on renvoie TOUS les champs d'item, y compris ceux que le
      // formulaire ne montre pas, sinon le PUT les efface silencieusement.
      const body = {
        slug: (editing.slug || "").trim().toLowerCase(),
        name_en: editing.name_en,
        name_fr: editing.name_fr,
        location: editing.location,
        published: !!editing.published,
        display_order: Number(editing.display_order) || 0,
        items: (editing.items || []).map((it, i) => ({
          id: it.id || null,
          label_en: it.label_en,
          label_fr: it.label_fr,
          url: it.url,
          published: it.published !== false,
          display_order: Number(it.display_order ?? i),
          open_new_tab: !!it.open_new_tab,
        })),
      };
      if (editing.id) await api.put(`/admin/menus/${editing.id}`, body);
      else await api.post("/admin/menus", body);
      toast.success(editing.id ? "Menu updated." : "Menu created.");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete menu "${row.name_en}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/menus/${row.id}`);
      toast.success("Menu deleted.");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const setItem = (idx, patch) =>
    setEditing((m) => ({ ...m, items: m.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  return (
    <div data-testid="admin-menus">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Menus</h1>
          <p className="text-sm text-inkmuted mt-1">
            Header and footer navigation. If this list is empty the storefront falls back to the built-in links.
          </p>
        </div>
        <button
          data-testid="menu-add"
          onClick={() => setEditing({ ...EMPTY_MENU, display_order: rows.length })}
          className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 inline-flex items-center gap-2"
        >
          <Plus size={14} /> New
        </button>
      </div>

      <div className="bg-paper border border-faint rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-faint font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Location</th>
              <th className="text-left px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Published</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-inkmuted">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-inkmuted">No menus.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-faint last:border-0" data-testid={`menu-row-${r.slug}`}>
                <td className="px-4 py-3 text-ink">{r.name_en}</td>
                <td className="px-4 py-3 font-mono text-xs text-copper uppercase">{r.location}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">
                  {(r.items || []).filter((i) => i.published !== false).length}/{(r.items || []).length}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1 border ${
                    r.published ? "bg-garnet text-paper border-garnet" : "border-faint text-inkmuted"}`}>
                    {r.published ? "Published" : "Hidden"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button data-testid={`menu-edit-${r.slug}`} onClick={() => setEditing(JSON.parse(JSON.stringify(r)))} className="p-2 hover:text-garnet">
                    <Edit size={15} strokeWidth={1.5} />
                  </button>
                  <button data-testid={`menu-delete-${r.slug}`} onClick={() => remove(r)} className="p-2 hover:text-signal">
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3A0A08]/60 backdrop-blur-xl px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-3xl bg-paper border border-faint rounded-lg shadow-luxe-lg my-auto" data-testid="menu-dialog">
            <div className="flex items-center justify-between px-6 py-4 border-b border-faint">
              <div className="font-display font-bold text-ink">{editing.id ? "Edit menu" : "New menu"}</div>
              <button onClick={() => setEditing(null)} className="p-1"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {[{ k: "name_en", l: "Name (EN)" }, { k: "name_fr", l: "Nom (FR)" }, { k: "slug", l: "Slug" }].map((f) => (
                  <div key={f.k}>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">{f.l}</label>
                    <input
                      data-testid={`menu-field-${f.k}`}
                      value={editing[f.k] || ""}
                      onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })}
                      className="w-full mt-1 rounded-sm border border-faint bg-paper px-3 py-2 text-sm focus:outline-none focus:border-copper"
                    />
                  </div>
                ))}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">Location</label>
                  <select
                    data-testid="menu-field-location"
                    value={editing.location}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    className="w-full mt-1 rounded-sm border border-faint bg-paper px-3 py-2 text-sm focus:outline-none focus:border-copper"
                  >
                    <option value="header">header</option>
                    <option value="footer">footer</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="menu-field-published"
                  checked={!!editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                  className="w-4 h-4 accent-[#C20114]"
                />
                <span className="text-sm text-ink">Menu published</span>
              </label>

              <div className="pt-4 border-t border-faint">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">Items</div>
                  <button
                    data-testid="menu-item-add"
                    onClick={() =>
                      setEditing({ ...editing, items: [...(editing.items || []), { ...EMPTY_ITEM, display_order: (editing.items || []).length }] })
                    }
                    className="rounded-full border border-faint px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] inline-flex items-center gap-1.5"
                  >
                    <Plus size={12} /> Add item
                  </button>
                </div>

                <div className="space-y-3">
                  {(editing.items || []).map((it, i) => (
                    <div key={it.id || i} className="border border-faint rounded-md p-3" data-testid={`menu-item-${i}`}>
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-inkmuted mt-2 shrink-0" />
                        <div className="grid sm:grid-cols-3 gap-2 flex-1">
                          <input placeholder="Label EN" value={it.label_en || ""} onChange={(e) => setItem(i, { label_en: e.target.value })}
                            className="rounded-sm border border-faint bg-paper px-2 py-1.5 text-sm focus:outline-none focus:border-copper" />
                          <input placeholder="Libellé FR" value={it.label_fr || ""} onChange={(e) => setItem(i, { label_fr: e.target.value })}
                            className="rounded-sm border border-faint bg-paper px-2 py-1.5 text-sm focus:outline-none focus:border-copper" />
                          <input placeholder="/catalog" value={it.url || ""} onChange={(e) => setItem(i, { url: e.target.value })}
                            className="rounded-sm border border-faint bg-paper px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-copper" />
                        </div>
                        <button onClick={() => setEditing({ ...editing, items: editing.items.filter((_, j) => j !== i) })}
                          className="p-1.5 hover:text-signal shrink-0" data-testid={`menu-item-remove-${i}`}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-5 mt-2 pl-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={it.published !== false} onChange={(e) => setItem(i, { published: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#C20114]" data-testid={`menu-item-published-${i}`} />
                          <span className="text-xs text-inkmuted">Published</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!it.open_new_tab} onChange={(e) => setItem(i, { open_new_tab: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#C20114]" />
                          <span className="text-xs text-inkmuted">New tab</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-xs text-inkmuted">Order</span>
                          <input type="number" value={it.display_order ?? i} onChange={(e) => setItem(i, { display_order: e.target.value })}
                            className="w-16 rounded-sm border border-faint bg-paper px-2 py-1 text-xs font-mono" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-faint">
              <button onClick={() => setEditing(null)} className="rounded-full border border-faint px-5 py-2 font-mono text-xs uppercase tracking-[0.2em]">
                Cancel
              </button>
              <button data-testid="menu-save" disabled={busy} onClick={save}
                className="rounded-full bg-signal text-paper px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] disabled:opacity-60">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
FN_EOF_61313986
echo "    frontend/src/pages/admin/sections/AdminMenus.jsx"
mkdir -p "$(dirname frontend/src/pages/admin/sections/AdminSubscribers.jsx)"
cat > frontend/src/pages/admin/sections/AdminSubscribers.jsx << 'FN_EOF_50C55F22'
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Mail } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";

export default function AdminSubscribers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/subscribers", {
        params: status === "all" ? {} : { status },
      });
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const subscribed = rows.filter((r) => r.status === "subscribed").length;
    const converted = rows.filter((r) => r.converted).length;
    // Taux de conversion = abonnés ayant créé un compte. C'est la seule
    // métrique qui dit si la promesse des 15 % fonctionne.
    const rate = rows.length ? Math.round((converted / rows.length) * 100) : 0;
    return { total: rows.length, subscribed, converted, rate };
  }, [rows]);

  return (
    <div className="p-8" data-testid="admin-subscribers">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copper">// SUBSCRIBERS</div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.01em] mt-2 text-ink">Launch list</h1>
        </div>
        <a
          href={`${API_BASE}/admin/subscribers.csv${status === "all" ? "" : `?status=${status}`}`}
          target="_blank" rel="noopener noreferrer"
          data-testid="export-subscribers-csv"
          className="rounded-full bg-ink text-paper font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2"
        >
          <Download size={14} /> CSV
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Total", v: stats.total },
          { l: "Subscribed", v: stats.subscribed },
          { l: "Converted", v: stats.converted },
          { l: "Conversion", v: `${stats.rate}%` },
        ].map((c) => (
          <div key={c.l} className="bg-paper border border-faint rounded-md px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">{c.l}</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-ink mt-1">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {["all", "subscribed", "unsubscribed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            data-testid={`subscribers-filter-${s}`}
            className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-1.5 border ${
              status === s ? "bg-garnet text-paper border-garnet" : "border-faint text-inkmuted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-paper border border-faint rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-faint font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Lang</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Account</th>
              <th className="text-left px-4 py-3">Consent (CASL)</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-inkmuted">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-inkmuted">
                <Mail size={18} className="inline mr-2" /> No subscribers yet.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-faint last:border-0" data-testid={`subscriber-row-${r.id}`}>
                <td className="px-4 py-3 font-mono text-xs text-ink">{r.email}</td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-inkmuted">{r.lang}</td>
                <td className="px-4 py-3 font-mono text-xs text-inkmuted">{r.source || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 border ${
                    r.status === "subscribed" ? "bg-garnet text-paper border-garnet" : "border-faint text-inkmuted"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.converted
                    ? <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--fn-success)]">Registered</span>
                    : <span className="font-mono text-[10px] text-inkmuted">—</span>}
                </td>
                {/* consent_at + consent_ip = la preuve exigée en cas de plainte CASL */}
                <td className="px-4 py-3 font-mono text-[10px] text-inkmuted">
                  {r.consent_at ? `${String(r.consent_at).slice(0, 10)} · ${r.consent_ip || "—"}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
FN_EOF_50C55F22
echo "    frontend/src/pages/admin/sections/AdminSubscribers.jsx"
mkdir -p "$(dirname frontend/src/components/Header.jsx)"
cat > frontend/src/components/Header.jsx << 'FN_EOF_F1E9E203'
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ShoppingBag, User, Menu, X, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";

export default function Header() {
  const { lang, toggle, t } = useLang();
  const { user, logout } = useAuth();
  const { count, setOpen } = useCart();
  const { coaPageEnabled } = useSiteConfig();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  // NOTE: keep in sync with ADMIN_PATH in App.js
  const ADMIN_PATH = "/ops-portal-fn7k2q";

  const enterAdmin = async () => {
    if (user?.role === "admin") {
      navigate(ADMIN_PATH);
      return;
    }
    navigate(`/login?next=${encodeURIComponent(ADMIN_PATH)}`);
  };

  // Navigation par défaut — sert aussi de REPLI si /menus échoue ou est vide.
  // Une nav vide serait pire que des liens en dur.
  const fallbackNav = [
    { to: "/catalog", label: t("nav.catalog") },
    ...(coaPageEnabled ? [{ to: "/lab", label: t("nav.lab") }] : []),
    { to: "/about", label: t("nav.about") },
  ];

  const [menuNav, setMenuNav] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get("/menus", { params: { location: "header" } })
      .then((r) => {
        if (cancelled) return;
        const menu = Array.isArray(r.data) ? r.data[0] : null;
        setMenuNav(menu?.items?.length ? menu.items : []);
      })
      .catch(() => { if (!cancelled) setMenuNav([]); });
    return () => { cancelled = true; };
  }, []);

  const navItems =
    menuNav && menuNav.length
      ? menuNav
          // Le lien /lab reste gouverné par le drapeau COA, même s'il est publié
          // dans le menu : le flag serveur reste l'autorité.
          .filter((it) => (it.url === "/lab" ? coaPageEnabled : true))
          .map((it) => ({
            to: it.url,
            label: lang === "fr" ? it.label_fr : it.label_en,
            newTab: it.open_new_tab,
          }))
      : fallbackNav;

  return (
    <>
      <div className="compliance-band font-mono uppercase tracking-[0.25em] text-center py-2 px-4">
        <span data-testid="header-compliance-band">{t("footer.compliance")}</span>
      </div>
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur border-b border-faint">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" data-testid="header-logo" className="font-display font-extrabold text-xl tracking-tight">
            FIRONOVA<span className="text-signal">.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-link-${n.to.slice(1)}`}
                className={({ isActive }) =>
                  `font-mono text-xs uppercase tracking-[0.2em] link-underline ${
                    isActive ? "text-ink" : "text-foreground/70 hover:text-ink"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              data-testid="admin-quick-access"
              onClick={enterAdmin}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full font-mono text-[11px] uppercase tracking-[0.25em] bg-ink text-paper px-3.5 py-1.5 hover:bg-garnet transition-colors"
              aria-label="Admin dashboard"
            >
              <Lock size={11} strokeWidth={2} />
              ADMIN
            </button>
            <button
              data-testid="lang-toggle"
              onClick={toggle}
              className="rounded-full font-mono text-xs uppercase tracking-[0.25em] border border-faint px-3 py-1.5 text-ink hover:border-copper transition-colors"
              aria-label="Toggle language"
            >
              {lang === "en" ? "EN · FR" : "FR · EN"}
            </button>
            <button
              data-testid="cart-button"
              onClick={() => setOpen(true)}
              className="relative font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2 hover:text-ink/70 pr-3"
            >
              <span className="relative inline-flex">
                <ShoppingBag size={18} strokeWidth={1.5} />
                {count > 0 && (
                  <span
                    data-testid="cart-count-badge"
                    className="absolute -top-2 -right-3 rounded-full bg-signal text-paper text-[10px] font-mono leading-none px-1.5 py-1 min-w-[18px] text-center"
                    style={{ background: "#C20114" }}
                  >
                    {count}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline">{t("nav.cart")}</span>
            </button>
            {user ? (
              <div className="hidden md:flex items-center gap-3">
                {user.role === "admin" && (
                  <Link
                    to={ADMIN_PATH}
                    data-testid="nav-admin"
                    className="rounded-full font-mono text-[11px] uppercase tracking-[0.2em] bg-ink text-paper px-3.5 py-1.5"
                  >
                    {t("nav.admin")}
                  </Link>
                )}
                <Link to="/account" data-testid="nav-account" className="font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <User size={16} strokeWidth={1.5} /> {user.name?.split(" ")[0] || t("nav.account")}
                </Link>
                <button
                  onClick={logout}
                  data-testid="nav-logout"
                  className="font-mono text-xs uppercase tracking-[0.2em] text-inkmuted hover:text-ink"
                >
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                data-testid="nav-login"
                className="hidden md:inline font-mono text-xs uppercase tracking-[0.2em] text-ink hover:text-garnet"
              >
                {t("nav.login")} →
              </Link>
            )}
            <button
              className="md:hidden"
              data-testid="mobile-menu-toggle"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-faint bg-paper px-6 py-4" data-testid="mobile-menu">
            <nav className="flex flex-col gap-3">
              {navItems.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMobileOpen(false)}
                  className="font-mono text-xs uppercase tracking-[0.2em] py-2"
                >
                  {n.label}
                </Link>
              ))}
              <button
                onClick={() => { setMobileOpen(false); enterAdmin(); }}
                data-testid="admin-quick-access-mobile"
                className="rounded-full font-mono text-xs uppercase tracking-[0.2em] py-2 text-left bg-ink text-paper px-4 inline-flex items-center gap-2 w-fit"
              >
                <Lock size={11} strokeWidth={2} /> ADMIN
              </button>
              {user ? (
                <>
                  {user.role === "admin" && (
                    <Link to={ADMIN_PATH} onClick={() => setMobileOpen(false)} className="font-mono text-xs uppercase tracking-[0.2em] py-2">
                      {t("nav.admin")}
                    </Link>
                  )}
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="font-mono text-xs uppercase tracking-[0.2em] py-2">
                    {t("nav.account")}
                  </Link>
                  <button onClick={() => { logout(); setMobileOpen(false); }} className="font-mono text-xs uppercase tracking-[0.2em] py-2 text-left">
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={() => setMobileOpen(false)} className="font-mono text-xs uppercase tracking-[0.2em] py-2">
                  {t("nav.login")} →
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
FN_EOF_F1E9E203
echo "    frontend/src/components/Header.jsx"
mkdir -p "$(dirname frontend/src/components/Footer.jsx)"
cat > frontend/src/components/Footer.jsx << 'FN_EOF_0E02C474'
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";

// Colonnes de repli — reproduisent exactement les liens historiques. Utilisées
// si /menus échoue ou ne renvoie aucun menu footer publié.
const FALLBACK_COLS = [
  { key: "shop", titleKey: "footer.shop", links: [
    { to: "/catalog", labelKey: "nav.catalog" },
    { to: "/catalog?cat=healing", labelKey: "categories.healing" },
    { to: "/catalog?cat=weight-loss", labelKey: "categories.weight-loss" },
    { to: "/catalog?cat=cognitive", labelKey: "categories.cognitive" },
  ]},
  { key: "legal", titleKey: "footer.legal", links: [
    { to: "/compliance", labelKey: "footer.terms" },
    { to: "/privacy", labelKey: "footer.privacy" },
    { to: "/compliance#shipping", labelKey: "footer.shipping" },
    { to: "/faq", labelKey: "footer.faq" },
  ]},
];

export default function Footer() {
  const { t, lang } = useLang();
  const [cols, setCols] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get("/menus", { params: { location: "footer" } })
      .then((r) => {
        if (cancelled) return;
        const menus = Array.isArray(r.data) ? r.data : [];
        setCols(menus.length ? menus.map((m) => ({
          key: m.slug,
          title: lang === "fr" ? m.name_fr : m.name_en,
          links: (m.items || []).map((it) => ({
            to: it.url,
            label: lang === "fr" ? it.label_fr : it.label_en,
            newTab: it.open_new_tab,
          })),
        })) : []);
      })
      .catch(() => { if (!cancelled) setCols([]); });
    return () => { cancelled = true; };
  }, [lang]);

  const columns = (cols && cols.length)
    ? cols
    : FALLBACK_COLS.map((c) => ({
        key: c.key,
        title: t(c.titleKey),
        links: c.links.map((l) => ({ to: l.to, label: t(l.labelKey), newTab: false })),
      }));
  const { user } = useAuth();
  const navigate = useNavigate();

  // NOTE: keep in sync with ADMIN_PATH in App.js
  const ADMIN_PATH = "/ops-portal-fn7k2q";

  const adminBypass = async () => {
    // If already admin, just go.
    if (user?.role === "admin") {
      navigate(ADMIN_PATH);
      return;
    }
    // Hidden admin entry — requires normal authentication.
    navigate(`/login?next=${encodeURIComponent(ADMIN_PATH)}`);
  };

  return (
    <footer className="mt-32" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="rounded-lg bg-garnet text-paper px-8 lg:px-14 py-14 shadow-luxe">
          <p className="font-display text-2xl sm:text-3xl font-bold tracking-[-0.01em] leading-[1.15]" data-testid="footer-disclaimer">
            FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-paper/60 max-w-3xl">
            By accessing this website you confirm you are a qualified researcher and assume full responsibility for the proper handling, storage, and disposal of these compounds in accordance with all applicable provincial and federal regulations.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2">
          <div className="font-display font-bold text-xl text-ink">FIRONOVA<span className="text-signal">.</span></div>
          <p className="mt-4 text-sm text-inkmuted max-w-sm">{t("footer.tagline")}</p>
          <p className="mt-6 fn-ruo inline-block">FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT</p>
        </div>
        {columns.map((col) => (
          <div key={col.key} data-testid={`footer-col-${col.key}`}>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] mb-4 text-copper">{col.title}</div>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.to + l.label}>
                  {l.newTab ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className="link-underline">{l.label}</a>
                  ) : (
                    <Link to={l.to} className="link-underline">{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-faint">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-inkmuted">
            © {new Date().getFullYear()} FIRONOVA · {t("footer.rights")}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60 flex items-center gap-2">
            CAD · Canada ·
            <button
              onClick={adminBypass}
              aria-label="•"
              title=""
              data-testid="hidden-admin-trigger"
              className="inline-block w-2 h-2 rounded-full bg-inkmuted/40 hover:bg-signal transition-colors"
            />
            BIO-RX-CA-2026
          </p>
        </div>
      </div>
    </footer>
  );
}
FN_EOF_0E02C474
echo "    frontend/src/components/Footer.jsx"
mkdir -p "$(dirname frontend/src/components/AgeGate.jsx)"
cat > frontend/src/components/AgeGate.jsx << 'FN_EOF_FCF1247A'
import { useEffect, useState } from "react";
import { useLang } from "../contexts/LanguageContext";

export default function AgeGate() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("fironova_age_confirmed");
    if (!accepted) setOpen(true);
  }, []);

  if (!open) return null;

  const confirm = () => {
    localStorage.setItem("fironova_age_confirmed", "1");
    setOpen(false);
  };

  const exit = () => {
    window.location.href = "https://www.canada.ca/en/health-canada.html";
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#3A0A08]/70 backdrop-blur-xl px-4"
      data-testid="age-gate-modal"
    >
      <div className="relative w-full max-w-lg rounded-lg overflow-hidden bg-paper border border-faint shadow-luxe-lg">
        <div className="bg-garnet px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-paper flex items-center justify-between">
          <span data-testid="age-gate-tag">// RESTRICTED · FIRONOVA</span>
          <span className="text-copperlight">19+</span>
        </div>
        <div className="p-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.01em] text-ink" data-testid="age-gate-title">
            {t("age.title")}
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-inkmuted" data-testid="age-gate-body">
            {t("age.body")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              data-testid="age-gate-confirm"
              onClick={confirm}
              className="flex-1 rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.2em] py-4 shadow-luxe hover:shadow-luxe-lg transition-shadow"
            >
              {t("age.confirm")} →
            </button>
            <button
              data-testid="age-gate-exit"
              onClick={exit}
              className="flex-1 rounded-full border border-faint text-ink font-mono text-xs uppercase tracking-[0.2em] py-4 hover:border-copper transition-colors"
            >
              {t("age.exit")}
            </button>
          </div>
          <p className="mt-6 fn-ruo block text-center">
            FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT
          </p>
        </div>
      </div>
    </div>
  );
}
FN_EOF_FCF1247A
echo "    frontend/src/components/AgeGate.jsx"
mkdir -p "$(dirname frontend/src/components/ProductCard.jsx)"
cat > frontend/src/components/ProductCard.jsx << 'FN_EOF_5F56B6E1'
import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";

export default function ProductCard({ product, index = 0 }) {
  const { lang, t } = useLang();
  const { add } = useCart();
  const name = lang === "fr" ? product.name_fr : product.name_en;

  const variants = product.variants || [];
  const priced = variants.map((v) => {
    const coaComing = v.badge_coa_pending || v.badge_coming_soon;
    const isPre = v.preorder_enabled && (v.stock <= 0 || coaComing);
    const sale = v.sale_price && v.sale_price < v.price;
    const eff = isPre && v.preorder_price ? v.preorder_price : sale ? v.sale_price : v.price;
    return { ...v, eff, isPre, sale };
  });
  const cheapest = priced.length ? priced.reduce((m, v) => (v.eff < m.eff ? v : m), priced[0]) : null;
  const displayPrice = cheapest ? cheapest.eff : product.price_cad;
  const displayOriginal = cheapest && cheapest.eff < cheapest.price ? cheapest.price : null;
  const anyPreorder = priced.some((v) => v.isPre);
  const anySale = priced.some((v) => v.sale && !v.isPre);

  return (
    <div
      className="group bg-paper border border-faint rounded-lg overflow-hidden flex flex-col card-hover"
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/product/${product.slug}`} className="block relative bg-secondary aspect-[4/5] overflow-hidden">
        <img
          src={product.image_url}
          alt={name}
          loading={index < 4 ? "eager" : "lazy"}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-paper/90 backdrop-blur border border-faint px-3 py-1.5 text-copper">
          {product.dosage_mg}MG
        </div>
        {product.lab_tested && (
          <div className="absolute top-3 right-3 rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-garnet text-paper px-3 py-1.5">
            COA ✓
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {anySale && (
            <span
              className="rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-signal text-paper px-3 py-1.5"
              data-testid={`sale-badge-${product.slug}`}
            >
              {lang === "fr" ? "PROMO" : "SALE"}
            </span>
          )}
          {anyPreorder && (
            <span
              className="rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-paper/90 backdrop-blur border border-copper text-copper px-3 py-1.5"
              data-testid={`preorder-badge-${product.slug}`}
            >
              {lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"}
            </span>
          )}
        </div>
      </Link>
      <div className="p-5 flex flex-col gap-2.5 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-copper">
          {product.slug}
        </div>
        <Link
          to={`/product/${product.slug}`}
          className="font-display text-xl font-bold tracking-[-0.01em] text-ink hover:text-garnet transition-colors"
        >
          {name}
        </Link>
        {product.sequence && (
          <div className="font-mono text-[10px] text-inkmuted line-clamp-1">{product.sequence}</div>
        )}
        <div className="flex items-end justify-between pt-2 mt-auto">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-inkmuted">
              {variants.length > 1 ? (lang === "fr" ? "DÈS · CAD" : "FROM · CAD") : "CAD"}
            </div>
            <div className="flex items-baseline gap-2">
              {displayOriginal && (
                <span
                  className="font-mono text-sm line-through text-inkmuted"
                  data-testid={`card-original-price-${product.slug}`}
                >
                  ${displayOriginal.toFixed(2)}
                </span>
              )}
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${displayOriginal ? "text-signal" : "text-ink"}`}
                data-testid={`card-price-${product.slug}`}
              >
                ${(displayPrice ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
            {product.purity}
          </div>
        </div>
      </div>
      <div className="p-4 pt-0">
        <button
          data-testid={`add-to-cart-${product.slug}`}
          onClick={() => add(product)}
          className="w-full rounded-full bg-ink text-paper font-mono text-xs uppercase tracking-[0.25em] py-3.5 hover:bg-garnet transition-colors"
        >
          {t("common.addToCart")} +
        </button>
      </div>
    </div>
  );
}
FN_EOF_5F56B6E1
echo "    frontend/src/components/ProductCard.jsx"
mkdir -p "$(dirname frontend/src/styles/tokens.css)"
cat > frontend/src/styles/tokens.css << 'FN_EOF_D52153D5'
/* NOTE: ce fichier a été déplacé depuis frontend/styles/ (hors de src/, donc
   jamais compilé par CRA). Les var(--fn-*) utilisées dans index.css étaient
   toutes non résolues. */
/* ============================================================
   FIRONOVA — Design Tokens · LE SIGNAL
   Drop into frontend/src/styles/tokens.css and import once in index.css
   ============================================================ */

:root {
  /* ---------- COLOR · ground & ink ---------- */
  --fn-paper:   #FFFAF6;  /* every surface */
  --fn-ink:     #3A0A08;  /* oxblood — text, wordmark, inverted grounds */
  --fn-garnet:  #6B0504;  /* deep sections, social tile grounds */
  --fn-copper:  #B06C49;  /* data voice, captions, secondary detail */
  --fn-signal:  #C20114;  /* THE LINE + primary CTA. Nothing else. */
  --fn-faint:   #E9DED4;  /* rules, borders, chromatogram baselines */
  --fn-muted:   #8A6F63;  /* secondary text on paper */

  /* ---------- COLOR · functional (never brand) ---------- */
  --fn-success: #2E7D52;
  --fn-warning: #B8860B;
  --fn-error:   #C20114;  /* signal red, form/system contexts only */
  --fn-compliance: #B06C49; /* copper outline badges */

  /* ---------- TYPE · families ---------- */
  --fn-font-social: 'Instrument Serif', Georgia, serif;   /* feed voice — never in store UI */
  --fn-font-store:  'Space Grotesk', sans-serif;          /* store voice — never headlines a post */
  --fn-font-body:   'Inter', system-ui, sans-serif;
  --fn-font-data:   'JetBrains Mono', monospace;          /* lots, purity, prices — EVERYWHERE */

  /* ---------- TYPE · 7-step scale ---------- */
  --fn-t1: 12px;   /* data, legal, captions — mono */
  --fn-t2: 14px;   /* UI, buttons */
  --fn-t3: 16px;   /* body */
  --fn-t4: 21px;   /* ledes */
  --fn-t5: 28px;   /* H2 / card titles */
  --fn-t6: 42px;   /* section titles */
  --fn-t7: 76px;   /* hero display */

  /* ---------- SPACE · 8px grid ---------- */
  --fn-s1: 8px;  --fn-s2: 16px; --fn-s3: 24px; --fn-s4: 32px;
  --fn-s5: 48px; --fn-s6: 64px; --fn-s7: 96px; --fn-s8: 120px;

  /* ---------- SHAPE ---------- */
  --fn-radius-sm: 8px;
  --fn-radius-md: 12px;
  --fn-radius-lg: 16px;
  --fn-border: 1px solid var(--fn-faint);

  /* ---------- MOTION · one signature ---------- */
  --fn-draw-duration: 800ms;
  --fn-draw-ease: cubic-bezier(.6, 0, .2, 1);
  --fn-ui-duration: 160ms;
}

/* ---------- The line draws itself (signature motion) ---------- */
.fn-line-draw {
  stroke-dasharray: 1200;
  stroke-dashoffset: 1200;
  animation: fn-draw var(--fn-draw-duration) var(--fn-draw-ease) forwards;
}
@keyframes fn-draw { to { stroke-dashoffset: 0; } }

/* ---------- Live/injection dot pulse ---------- */
.fn-dot-live { animation: fn-pulse 2.2s ease-in-out infinite; }
@keyframes fn-pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .fn-line-draw { animation: none; stroke-dashoffset: 0; }
  .fn-dot-live  { animation: none; }
}

/* ---------- Data voice utility ---------- */
.fn-data {
  font-family: var(--fn-font-data);
  font-variant-numeric: tabular-nums;
  color: var(--fn-copper);
}

/* ---------- RUO strip (bilingual, every footer) ---------- */
.fn-ruo {
  font-family: var(--fn-font-data);
  font-size: var(--fn-t1);
  letter-spacing: .04em;
  color: var(--fn-copper);
  border: 1.5px solid var(--fn-copper);
  border-radius: var(--fn-radius-sm);
  padding: 12px 18px;
}
FN_EOF_D52153D5
echo "    frontend/src/styles/tokens.css"

echo "==> Verification MD5..."
FAIL=0
[ "$(md5sum "backend/server.py" | cut -d" " -f1)" = "08e705602875e29136573e4efe300ef0" ] || { echo "    ECHEC backend/server.py"; FAIL=1; }
[ "$(md5sum "design_guidelines.json" | cut -d" " -f1)" = "272e79aefe34fea16858d4f22cff3917" ] || { echo "    ECHEC design_guidelines.json"; FAIL=1; }
[ "$(md5sum "frontend/src/App.js" | cut -d" " -f1)" = "0d3d967296952e2cb51fa9d0b1506a23" ] || { echo "    ECHEC frontend/src/App.js"; FAIL=1; }
[ "$(md5sum "frontend/src/lib/api.js" | cut -d" " -f1)" = "a99423a8f93eed8904a075b5446ef3e8" ] || { echo "    ECHEC frontend/src/lib/api.js"; FAIL=1; }
[ "$(md5sum "frontend/src/lib/i18n.js" | cut -d" " -f1)" = "6bdb52e5f8f5f21e83eee79ee4d32831" ] || { echo "    ECHEC frontend/src/lib/i18n.js"; FAIL=1; }
[ "$(md5sum "frontend/src/contexts/AuthContext.jsx" | cut -d" " -f1)" = "31a342c7fb6eb14947a646257d2c94c0" ] || { echo "    ECHEC frontend/src/contexts/AuthContext.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/contexts/SiteConfigContext.jsx" | cut -d" " -f1)" = "c60ca228be1b514003c0178767c3ba62" ] || { echo "    ECHEC frontend/src/contexts/SiteConfigContext.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/Account.jsx" | cut -d" " -f1)" = "056b3178c767d7184200a654943fa209" ] || { echo "    ECHEC frontend/src/pages/Account.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/StaffAccept.jsx" | cut -d" " -f1)" = "140a4402d30e2eec0708d12dfb81ad81" ] || { echo "    ECHEC frontend/src/pages/StaffAccept.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/Home.jsx" | cut -d" " -f1)" = "ddfddeadc5838b50e1bb27067d57cbca" ] || { echo "    ECHEC frontend/src/pages/Home.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/Catalog.jsx" | cut -d" " -f1)" = "e752b0d4322db28eefd77aab91287575" ] || { echo "    ECHEC frontend/src/pages/Catalog.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/ComingSoon.jsx" | cut -d" " -f1)" = "6bb65d4dd6f6f4351393ea86bf2aa1df" ] || { echo "    ECHEC frontend/src/pages/ComingSoon.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/admin/AdminLayout.jsx" | cut -d" " -f1)" = "81631d3232b83ceb69a0c2853876f330" ] || { echo "    ECHEC frontend/src/pages/admin/AdminLayout.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/admin/sections/AdminOrders.jsx" | cut -d" " -f1)" = "7fa81f13e781953dec081bd4d7ce5ac4" ] || { echo "    ECHEC frontend/src/pages/admin/sections/AdminOrders.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/admin/sections/AdminCategories.jsx" | cut -d" " -f1)" = "2c369ea3a8afa81400cfbcff74457276" ] || { echo "    ECHEC frontend/src/pages/admin/sections/AdminCategories.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/admin/sections/AdminMenus.jsx" | cut -d" " -f1)" = "6df203c15fa2457023d2ba81e830f372" ] || { echo "    ECHEC frontend/src/pages/admin/sections/AdminMenus.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/pages/admin/sections/AdminSubscribers.jsx" | cut -d" " -f1)" = "10f03b9f9e7fbd13c2401ba2247a86a3" ] || { echo "    ECHEC frontend/src/pages/admin/sections/AdminSubscribers.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/components/Header.jsx" | cut -d" " -f1)" = "0d2c3a4f08b58077dbe353ff2d6752fd" ] || { echo "    ECHEC frontend/src/components/Header.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/components/Footer.jsx" | cut -d" " -f1)" = "92804e732ac5dd7653a8ea1e4e243fa1" ] || { echo "    ECHEC frontend/src/components/Footer.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/components/AgeGate.jsx" | cut -d" " -f1)" = "afe0f51918150f97971925e9f1b0fcb6" ] || { echo "    ECHEC frontend/src/components/AgeGate.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/components/ProductCard.jsx" | cut -d" " -f1)" = "2ed837d2902f0b3358bdae01fdfe7a46" ] || { echo "    ECHEC frontend/src/components/ProductCard.jsx"; FAIL=1; }
[ "$(md5sum "frontend/src/styles/tokens.css" | cut -d" " -f1)" = "c45d16b6a5380222db63ef0eb893e635" ] || { echo "    ECHEC frontend/src/styles/tokens.css"; FAIL=1; }
[ "$FAIL" -eq 0 ] && echo "    22/22 conformes" || { echo "!! Restaurer : cp -r $BK/. ." >&2; exit 1; }
python3 -c "import ast;ast.parse(open('backend/server.py').read())" && echo "    backend compile"
python3 -c "import json;json.load(open('design_guidelines.json'))" && echo "    design_guidelines valide"
grep -rqi "nordpep" backend/server.py frontend/src/components && { echo "    ECHEC residu nordpep"; exit 1; } || echo "    aucun residu NORDPEP"
cat <<'B'

=============================================================================
  PATCH APPLIQUE
=============================================================================
  A POSER (backend/.env) :
    CORS_ORIGINS=https://peptide-ca.preview.emergentagent.com,https://fironova.ca
    PUBLIC_BASE_URL=https://fironova.ca
  Optionnel :
    PRELAUNCH_ENABLED=false
    PRELAUNCH_PREVIEW_TOKEN=<secret>
    CANADA_POST_SENDER_ADDRESS / _PHONE / _ORIGIN_POSTAL_CODE

  !! ROTATION du mot de passe admin (admin@nordpep.ca est VIVANT).
  !! MANIFESTE : Admin > Orders, banniere rouge. CHAQUE JOUR.

  sudo supervisorctl restart all && git add -A && git commit && git push
=============================================================================
B
