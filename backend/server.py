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
import ipaddress
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any

import xml.etree.ElementTree as ET

import bcrypt
import jwt
import httpx
import resend
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, UploadFile, File, Body
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from PIL import Image as PILImage
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
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@nordpep.ca")
# Aucun défaut : un mot de passe admin en dur dans le repo est un mot de passe public.
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise RuntimeError(
        "ADMIN_PASSWORD est obligatoire. Définissez-le dans l'environnement "
        "avant de démarrer le serveur."
    )
INTERAC_EMAIL = os.environ.get("INTERAC_EMAIL", "orders@fironova.com")
# Confirmation automatique des virements Interac (Autodeposit) via Microsoft
# Graph API (app-only / client credentials). Boîte surveillée = INTERAC_EMAIL.
INTERAC_GRAPH_TENANT_ID = os.environ.get("INTERAC_GRAPH_TENANT_ID", "")
INTERAC_GRAPH_CLIENT_ID = os.environ.get("INTERAC_GRAPH_CLIENT_ID", "")
INTERAC_GRAPH_CLIENT_SECRET = os.environ.get("INTERAC_GRAPH_CLIENT_SECRET", "")
INTERAC_GRAPH_USER = os.environ.get("INTERAC_GRAPH_USER", "").strip().lower() or INTERAC_EMAIL.lower()

# Strip placeholder values like <TENANT_ID> that were never replaced.
def _strip_placeholder(v: str) -> str:
    return "" if (v.startswith("<") and v.endswith(">")) else v

INTERAC_GRAPH_TENANT_ID = _strip_placeholder(INTERAC_GRAPH_TENANT_ID)
INTERAC_GRAPH_CLIENT_ID = _strip_placeholder(INTERAC_GRAPH_CLIENT_ID)
INTERAC_GRAPH_CLIENT_SECRET = _strip_placeholder(INTERAC_GRAPH_CLIENT_SECRET)

# Code d'accès facultatif demandé AVANT même l'écran de login admin, côté SPA
# publique. Ne remplace pas l'auth (JWT + rôle restent la vraie barrière sur
# /api/admin/*) — sert seulement à ce qu'un visiteur qui tombe sur l'URL admin
# obscure par hasard ne voie même pas d'écran de login. Si non défini, la
# passerelle est désactivée (aucun blocage).
ADMIN_GATE_CODE = os.environ.get("ADMIN_GATE_CODE")
TRUST_PROXY_IPS = {
    ip.strip()
    for ip in os.environ.get("TRUST_PROXY_IPS", "127.0.0.1,::1").split(",")
    if ip.strip()
}
INTERAC_PASSWORD_HINT = os.environ.get("INTERAC_PASSWORD_HINT", "FIRONOVA")
NOWPAYMENTS_API_KEY = os.environ.get("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_IPN_SECRET = os.environ.get("NOWPAYMENTS_IPN_SECRET", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
APP_ENV = os.environ.get("APP_ENV", os.environ.get("ENV", os.environ.get("ENVIRONMENT", ""))).strip().lower()
IS_PRODUCTION = APP_ENV in {"prod", "production"}
if IS_PRODUCTION and not PUBLIC_BASE_URL:
    raise RuntimeError(
        "PUBLIC_BASE_URL est obligatoire en production. Définissez-la avant de démarrer le serveur."
    )
NOWPAYMENTS_BASE_URL = "https://api.nowpayments.io/v1"
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "orders@fironova.com")
MAGIC_SENDER_EMAIL = os.environ.get("MAGIC_SENDER_EMAIL", "")
ADMIN_NOTIFICATION_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "admin@fironova.com")
SHIPPING_FLAT_CAD = float(os.environ.get("SHIPPING_FLAT_CAD", "20.00"))
FREE_SHIPPING_THRESHOLD_CAD = float(os.environ.get("FREE_SHIPPING_THRESHOLD_CAD", "200.00"))
UNPAID_ORDER_TTL_HOURS = float(os.environ.get("UNPAID_ORDER_TTL_HOURS", "24"))
PREORDER_RELEASE_INTERVAL_SECONDS = int(os.environ.get("PREORDER_RELEASE_INTERVAL_SECONDS", "300"))
# Rabais % du coupon auto-lié à chaque affilié (0 = pas de coupon auto).
AFFILIATE_COUPON_PERCENT = float(os.environ.get("AFFILIATE_COUPON_PERCENT", "10"))
_STANDARD_COUPON_MAX_PERCENT_RAW = os.environ.get("STANDARD_COUPON_MAX_PERCENT", "").strip()
STANDARD_COUPON_MAX_PERCENT = (
    float(_STANDARD_COUPON_MAX_PERCENT_RAW) if _STANDARD_COUPON_MAX_PERCENT_RAW else None
)
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").strip().lower() == "true"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none").strip().lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    COOKIE_SAMESITE = "none"
# Browsers reject SameSite=None when Secure=false. Fallback keeps local HTTP usable.
if not COOKIE_SECURE and COOKIE_SAMESITE == "none":
    COOKIE_SAMESITE = "lax"

# Si l'API est derrière un reverse-proxy, renseigner les CIDR de confiance ; sinon X-Forwarded-For est ignoré et le rate-limiting se basera sur l'IP partagée du proxy.
TRUSTED_PROXIES: list[str] = [
    e for e in (os.environ.get("TRUSTED_PROXIES", "") or "").split(",") if e.strip()
]

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

# Product images. Served statically at /uploads/images/<file>.
IMAGE_UPLOAD_DIR = UPLOAD_DIR / "images"
IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_UPLOAD_MB = float(os.environ.get("MAX_IMAGE_UPLOAD_MB", "5"))
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_IMAGE_FORMAT_EXT = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp", "GIF": "gif"}

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
# New Shipping OpenAPI (OAuth2) support. Modes:
# - legacy: existing XML/basic-auth flow
# - openapi: OAuth2 + JSON flow from the shipping v1 OpenAPI spec
# - auto: openapi if OAuth creds are present, otherwise legacy
CANADA_POST_API_MODE = os.environ.get("CANADA_POST_API_MODE", "auto").strip().lower()
CANADA_POST_OPENAPI_BASE_URL = os.environ.get(
    "CANADA_POST_OPENAPI_BASE_URL",
    "https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/shipping/v1",
).rstrip("/")
CANADA_POST_OAUTH_TOKEN_URL = os.environ.get(
    "CANADA_POST_OAUTH_TOKEN_URL",
    "https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/cpc-api-native-oauth-provider/oauth2/token",
).strip()
CANADA_POST_OAUTH_CLIENT_ID = os.environ.get("CANADA_POST_OAUTH_CLIENT_ID", "").strip()
CANADA_POST_OAUTH_CLIENT_SECRET = os.environ.get("CANADA_POST_OAUTH_CLIENT_SECRET", "").strip()
CANADA_POST_PLATFORM_ID = os.environ.get("CANADA_POST_PLATFORM_ID", "").strip()
CANADA_POST_MAILED_BY = os.environ.get("CANADA_POST_MAILED_BY", CANADA_POST_CUSTOMER_NUMBER).strip()
CANADA_POST_MOBO = os.environ.get("CANADA_POST_MOBO", CANADA_POST_CUSTOMER_NUMBER).strip()
CANADA_POST_INTENDED_METHOD = os.environ.get("CANADA_POST_INTENDED_METHOD", "").strip()
CANADA_POST_DEFAULT_SERVICE_CODE = os.environ.get("CANADA_POST_DEFAULT_SERVICE_CODE", "DOM.EP").strip() or "DOM.EP"
CANADA_POST_AUTO_LABEL_INTERVAL_SECONDS = int(os.environ.get("CANADA_POST_AUTO_LABEL_INTERVAL_SECONDS", "60"))
CANADA_POST_AUTO_DELIVERY_SYNC_SECONDS = int(os.environ.get("CANADA_POST_AUTO_DELIVERY_SYNC_SECONDS", "900"))
CANADA_POST_SANDBOX_DELIVERY_FALLBACK = os.environ.get("CANADA_POST_SANDBOX_DELIVERY_FALLBACK", "false").strip().lower() == "true"
CANADA_POST_SANDBOX_DELIVER_AFTER_HOURS = int(os.environ.get("CANADA_POST_SANDBOX_DELIVER_AFTER_HOURS", "24"))

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

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="FIRONOVA API", version="1.0.0")
api = APIRouter(prefix="/api")

# Serve uploaded files (COA PDFs, images, etc.) at /uploads/...
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
# Also serve under /api/uploads so assets pass the platform ingress (only /api is
# routed to the backend on Emergent). Product/COA URLs use the /api/uploads form.
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads-api")


# ---------------------------------------------------------------------------
# Helpers: password & JWT
# ---------------------------------------------------------------------------
PASSWORD_COMPLEXITY_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def _validate_password_strength(password: str) -> str:
    if not PASSWORD_COMPLEXITY_RE.match(password):
        raise ValueError("Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character")
    return password


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


def _cookie_secure_for_request(request: Optional[Request]) -> bool:
    """Keep secure cookies in production, but allow local HTTP development.

    Browsers reject `Secure` cookies on plain HTTP, which breaks local auth
    flows (admin upload endpoints rely on that auth cookie).
    """
    if not COOKIE_SECURE:
        return False
    if request is None:
        return COOKIE_SECURE
    host = (request.headers.get("host") or "").split(":", 1)[0].strip().lower()
    proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "").lower()
    if proto != "https" and host in {"localhost", "127.0.0.1"}:
        return False
    return COOKIE_SECURE


def set_auth_cookie(response: Response, token: str, request: Optional[Request] = None) -> None:
    secure_flag = _cookie_secure_for_request(request)
    samesite_flag = COOKIE_SAMESITE
    if not secure_flag and samesite_flag == "none":
        samesite_flag = "lax"
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure_flag,
        samesite=samesite_flag,
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


def _public_user_payload(user: Optional[dict]) -> dict:
    if not user:
        return {}
    payload = {
        k: v for k, v in user.items()
        if k not in {"password_hash", "token_version"}
    }
    # Ne pas exposer les permissions internes pour les comptes clients.
    if payload.get("role") not in {"staff", "admin"}:
        payload.pop("permissions", None)
    return payload


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
STAFF_AREAS = ["orders", "products", "coupons", "customers", "subscribers", "shipping", "dashboard", "settings"]
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
    name: str = Field(min_length=1, max_length=80)
    website: str = ""  # honeypot anti-bot — doit rester vide

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return _validate_password_strength(v)


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
    # COA status — single source of truth per variant (replaces the two legacy
    # booleans badge_coa_available / badge_coa_pending which could contradict).
    #   "available" : a COA exists for this lot (coa_url should be set).
    #   "pending"   : COA not ready yet but coming — shown for transparency.
    #                 The variant stays purchasable, with a visible warning.
    #   "none"      : nothing shown.
    coa_status: str = "none"  # "available" | "pending" | "none"
    # Legacy booleans kept for backward-compat / rollback; no longer read for display.
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
    # --- SCIENTIFIC DATA (10 new fields) ---
    molecular_formula: str = ""        # ex. "C62H98N16O22"
    molecular_weight: Optional[float] = None   # ex. 1419.5 (Da)
    cas_number: str = ""               # ex. "137525-51-0"
    sequence_length: Optional[int] = None # ex. 31 (derivable from sequence but explicit here)
    storage: str = ""                  # ex. "-20°C, à l'abri de la lumière"
    solubility: str = ""               # ex. "Soluble dans l'eau, acide acétique 0,1%"
    appearance: str = ""               # ex. "Poudre lyophilisée blanche"
    mechanism: str = ""                # ex. "Potentialise la libération d'hormone de croissance"
    research_areas: List[str] = []     # ex. ["Réparation tissulaire", "Anti-inflammatoire"]
    synonyms: List[str] = []           # ex. ["Sermorelin", "GRF 1-29"]
    meta_title_en: str = ""
    meta_title_fr: str = ""
    meta_description_en: str = ""
    meta_description_fr: str = ""
    og_image_url: str = ""
    images: List[str] = []  # galerie : image_url reste la couverture (images[0] ou saisie manuelle)
    variants: List[ProductVariant] = []


class ProductOut(ProductIn):
    id: str
    created_at: str


class CartItem(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    qty: int = Field(ge=1, le=1000)


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
    payment_method: Literal["interac", "nowpayments"]
    pay_currency: Optional[str] = "btc"  # used only for nowpayments
    coupon_code: Optional[str] = None
    idempotency_key: Optional[str] = None  # optionally passed in body to avoid CORS preflight from a custom header
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
    # --- Avance (tous optionnels ; vides/desactives = comportement de base) ---
    start_at: Optional[str] = None
    allowed_emails: List[str] = []
    per_customer_limit: Optional[int] = None
    first_order_only: bool = False
    max_discount_cad: Optional[float] = None
    restrict_products: List[str] = []
    restrict_categories: List[str] = []


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
    current_password: Optional[str] = None
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class EmailChangeRequestIn(BaseModel):
    new_email: EmailStr
    current_password: Optional[str] = None


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
    current_password: Optional[str] = None


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
    name = payload.name.strip()

    # Honeypot : les robots remplissent ce champ, les humains non.
    if (payload.website or "").strip():
        return {"ok": True, "verification_sent": True}

    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": name,
        "password_hash": hash_password(payload.password),
        "role": "user",
        "token_version": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "email_verified": False,
    }
    try:
        await db.users.insert_one(user_doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email already registered") from exc

    try:
        await db.subscribers.update_one({"email": email}, {"$set": {"converted": True}})
    except Exception as e:  # pragma: no cover
        logging.warning("subscriber conversion flag failed for %s: %s", email, e)

    raw = await _issue_magic_token(email, name, is_signup=True, lang="fr", ip=_client_ip(request))
    base = (PUBLIC_BASE_URL or str(request.base_url).rstrip("/"))
    link = f"{base}/auth/callback?token={raw}"
    await _send_magic_email(email, link, "fr", is_signup=True)

    return {
        "id": user_doc["id"],
        "email": email,
        "name": user_doc["name"],
        "role": "user",
        "created_at": user_doc["created_at"],
        "email_verified": False,
        "verification_sent": True,
    }


# In-memory brute-force protection: max 5 failed attempts per IP+email in a 15-min window
_LOGIN_ATTEMPTS: dict = {}
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW_SECONDS = 900


def _client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"

    # Cloudflare : header `CF-Connecting-IP` inséré par CF et strippé sur les
    # requêtes externes. Il porte l'IP réelle du visiteur. Priorité absolue
    # car il masque le peer (edge CF) qui rendrait le rate-limit inefficace.
    cf_ip = (request.headers.get("cf-connecting-ip") or "").strip()
    if cf_ip:
        try:
            ipaddress.ip_address(cf_ip)
            return cf_ip
        except ValueError:
            pass

    if not TRUSTED_PROXIES:
        # X-Forwarded-For défini par un proxy en amont (Kubernetes ingress).
        # Sans liste de proxys de confiance, on prend prudemment le premier
        # bond seulement si le peer semble être une IP privée / interne
        # (indicateur qu'un proxy nous parle réellement).
        try:
            peer_addr = ipaddress.ip_address(peer)
            if peer_addr.is_private or peer_addr.is_loopback:
                xff = (request.headers.get("x-forwarded-for") or "").strip()
                if xff:
                    first = xff.split(",")[0].strip()
                    try:
                        ipaddress.ip_address(first)
                        return first
                    except ValueError:
                        pass
        except ValueError:
            pass
        return peer

    try:
        peer_addr = ipaddress.ip_address(peer)
        trusted = False
        for entry in TRUSTED_PROXIES:
            entry = entry.strip()
            if not entry:
                continue
            try:
                if "/" in entry:
                    trusted = peer_addr in ipaddress.ip_network(entry, strict=False)
                else:
                    trusted = peer.lower() == entry.lower()
            except ValueError:
                continue
            if trusted:
                break
    except ValueError:
        return peer
    if not trusted:
        return peer
    xff = request.headers.get("x-forwarded-for", "").strip()
    if not xff:
        return peer
    return xff.split(",")[0].strip() or peer


def _login_throttle_check(key: str):
    now = datetime.now(timezone.utc).timestamp()
    attempts = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < _LOGIN_WINDOW_SECONDS]
    _LOGIN_ATTEMPTS[key] = attempts
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")


# In-memory rate limiting for public write endpoints (same pattern as login throttle).
_RATE_BUCKETS: dict = {}


def _sweep_rate_buckets(now: float, window_seconds: int) -> None:
    """Purge immédiatement les clés expirées pour éviter la croissance mémoire."""
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


def _rate_limit_email(bucket: str, email: str, max_hits: int, window_seconds: int, detail: str):
    _rate_limit(bucket, f"email:{email.lower().strip()}", max_hits, window_seconds, detail)


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
    "shipping_boxes":   {"collection": "shipping_boxes",    "area": "shipping",  "has_active": True,  "auto_purge_days": 30},
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
    # Zones additionnelles — alignées sur la nav admin frontend pour qu'un
    # compte staff puisse réellement se voir accorder l'accès à chacune.
    categories: Literal["none", "view", "manage"] = "none"
    menus: Literal["none", "view", "manage"] = "none"
    affiliates: Literal["none", "view", "manage"] = "none"
    seo: Literal["none", "view", "manage"] = "none"
    emails: Literal["none", "view", "manage"] = "none"
    audit: Literal["none", "view", "manage"] = "none"
    trash: Literal["none", "view", "manage"] = "none"
    staff: Literal["none", "view", "manage"] = "none"


class StaffInviteIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    permissions: StaffPermissionsIn
    as_owner: bool = False  # invite directement comme admin (owner) — accès total


class StaffAcceptIn(BaseModel):
    token: str
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return _validate_password_strength(v)


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


@api.get("/admin/autologin")
async def admin_autologin(_admin: dict = Depends(get_admin_user)):
    """Autologin de la porte admin : si une session admin valide existe déjà
    (cookie httpOnly access_token), la porte est levée côté frontend sans
    ressaisir le code — AdminGate.jsx appelle cette route à l'ouverture."""
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
    # Comptes sans le champ (antérieurs) sont considérés vérifiés.
    if user.get("email_verified", True) is False:
        raise HTTPException(status_code=403, detail="Veuillez vérifier votre adresse email pour activer votre compte. / Please verify your email address to activate your account.")
    _LOGIN_ATTEMPTS.pop(throttle_key, None)
    token = create_access_token(user["id"], user["email"], user["role"], token_version=user.get("token_version", 0))
    set_auth_cookie(response, token, request)
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user["created_at"],
        # Token also returned so the frontend can fall back to Bearer auth in
        # environments where the browser blocks the cookie (preview iframes,
        # third-party cookie restrictions, private mode). Cookie remains the
        # primary mechanism; the token acts as a safety net.
        "access_token": token,
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
async def me(request: Request):
    """Returns the current user or null (200) for guests, instead of 401.
    Cette version évite les erreurs 401 bruyantes dans la console browser
    lorsque le frontend interroge la session au chargement pour un visiteur
    anonyme — c'est un pattern standard pour un endpoint 'who am I'."""
    user = await _resolve_user(request)
    if not user:
        return None
    return _public_user_payload(user)


# ---------------------------------------------------------------------------
# Magic link natif — auth sans mot de passe sur NOTRE backend (pas Supabase).
# Cohabite avec le login/register classique. Cookie httpOnly identique.
# ---------------------------------------------------------------------------
MAGIC_TOKEN_TTL_MINUTES = 15
MAGIC_REQUEST_MAX = 5
MAGIC_REQUEST_WINDOW = 3600
MAGIC_VERIFY_MAX = 300
MAGIC_VERIFY_WINDOW = 3600


class MagicRequestIn(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    create: bool = False
    lang: str = "fr"
    website: str = ""  # honeypot anti-bot — doit rester vide


class ForgotPasswordIn(BaseModel):
    email: EmailStr
    lang: str = "fr"


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        return _validate_password_strength(v)


def _hash_magic_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _issue_magic_token(email: str, name: str, is_signup: bool,
                             lang: str, ip: str) -> str:
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.magic_tokens.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "token_hash": _hash_magic_token(raw),
        "is_signup": is_signup,
        "name": (name or "").strip()[:120],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=MAGIC_TOKEN_TTL_MINUTES)).isoformat(),
        "used_at": None,
        "ip": ip,
        "lang": lang,
    })
    return raw


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _trusted_public_base_url() -> str:
    """Source unique des liens email; ne jamais utiliser request.base_url (Host header)."""
    base = (PUBLIC_BASE_URL or "").rstrip("/")
    if not base:
        raise HTTPException(503, "PUBLIC_BASE_URL is required for email links")
    return base


async def _send_magic_email(email: str, link: str, lang: str, is_signup: bool) -> None:
    fr = lang.startswith("fr")
    if fr:
        subject = "Votre lien de connexion Fironova"
        heading = "Bienvenue chez Fironova" if is_signup else "Connexion à Fironova"
        intro = ("Confirmez votre adresse pour activer votre compte."
                 if is_signup else "Cliquez pour vous connecter sans mot de passe.")
        cta = "Activer mon compte" if is_signup else "Me connecter"
        expiry = f"Ce lien expire dans {MAGIC_TOKEN_TTL_MINUTES} minutes et ne sert qu'une fois."
        ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."
    else:
        subject = "Your Fironova sign-in link"
        heading = "Welcome to Fironova" if is_signup else "Sign in to Fironova"
        intro = ("Confirm your address to activate your account."
                 if is_signup else "Click to sign in without a password.")
        cta = "Activate my account" if is_signup else "Sign me in"
        expiry = f"This link expires in {MAGIC_TOKEN_TTL_MINUTES} minutes and works only once."
        ignore = "If you didn't request this, you can safely ignore this email."
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
    from_addr = MAGIC_SENDER_EMAIL or SENDER_EMAIL
    await _send_email(email, subject, html, from_email=from_addr)


@api.post("/auth/magic/request")
async def magic_request(payload: MagicRequestIn, request: Request):
    """Émet un lien magique. Réponse uniforme : ne révèle jamais si l'email existe."""
    email = payload.email.lower().strip()
    _rate_limit_email("magic_request", email, MAGIC_REQUEST_MAX,
                      MAGIC_REQUEST_WINDOW, "Trop de demandes. Réessayez plus tard.")

    # Honeypot : réponse neutre sans effet.
    if (payload.website or "").strip():
        return {"ok": True}

    existing = await db.users.find_one({"email": email})
    is_signup = payload.create and not existing
    # Login demandé sur un email inconnu -> réponse neutre, aucun email (anti-énumération).
    if not payload.create and not existing:
        return {"ok": True}

    raw = await _issue_magic_token(email, payload.name or "", is_signup,
                                   payload.lang or "fr", _client_ip(request))
    base = _trusted_public_base_url()
    link = f"{base}/auth/callback?token={raw}"
    await _send_magic_email(email, link, payload.lang or "fr", is_signup)
    return {"ok": True}


@api.post("/auth/magic/verify")
async def magic_verify(response: Response, request: Request, token: str = Body(..., embed=True)):
    """Vérifie le token (usage unique + TTL), crée le compte si signup, pose le cookie."""
    _rate_limit("magic_verify", _client_ip(request), MAGIC_VERIFY_MAX,
                MAGIC_VERIFY_WINDOW, "Trop de tentatives. Réessayez plus tard.")
    token_hash = _hash_magic_token((token or "").strip())
    rec = await db.magic_tokens.find_one({"token_hash": token_hash})
    now = datetime.now(timezone.utc)
    invalid = HTTPException(status_code=400, detail="Lien invalide ou expiré.")
    if not rec or rec.get("used_at"):
        raise invalid
    try:
        if datetime.fromisoformat(rec["expires_at"]) < now:
            raise invalid
    except HTTPException:
        raise
    except Exception:
        raise invalid
    claimed = await db.magic_tokens.update_one(
        {"_id": rec["_id"], "used_at": None},
        {"$set": {"used_at": now.isoformat()}},
    )
    if claimed.modified_count != 1:
        raise invalid
    email = rec["email"]
    is_signup = bool(rec.get("is_signup"))
    user = await db.users.find_one({"email": email})
    if not user:
        user_doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": rec.get("name") or email.split("@")[0],
            "password_hash": hash_password(secrets.token_urlsafe(32)),
            "role": "user",
            "token_version": 0,
            "created_at": now.isoformat(),
            "passwordless": True,
            "email_verified": True,
        }
        await db.users.insert_one(user_doc)
        try:
            await db.subscribers.update_one({"email": email}, {"$set": {"converted": True}})
        except Exception as e:  # pragma: no cover
            logging.warning("subscriber conversion flag failed for %s: %s", email, e)
        asyncio.create_task(welcome_new_user(email, user_doc["name"], "fr"))
        user = user_doc
    else:
        await db.users.update_one({"email": email}, {"$set": {"email_verified": True}})
        if is_signup:
            asyncio.create_task(welcome_new_user(email, user.get("name", ""), "fr"))
        user = {**user, "email_verified": True}
    token_jwt = create_access_token(user["id"], user["email"], user["role"],
                                    token_version=user.get("token_version", 0))
    set_auth_cookie(response, token_jwt)
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "created_at": user["created_at"],
    }


# ---------------------------------------------------------------------------
# Réinitialisation de mot de passe (mot de passe oublié)
# ---------------------------------------------------------------------------
RESET_TOKEN_TTL_MINUTES = 30
RESET_REQUEST_MAX = 5
RESET_REQUEST_WINDOW = 3600


async def _send_reset_email(email: str, link: str, lang: str) -> None:
    fr = lang.startswith("fr")
    if fr:
        subject = "FIRONOVA — Réinitialisation du mot de passe"
        heading = "Réinitialiser votre mot de passe"
        body = "Vous avez demandé à réinitialiser votre mot de passe. Ce lien expire dans 30 minutes."
        cta = "Choisir un nouveau mot de passe"
        ignore = "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre mot de passe reste inchangé."
    else:
        subject = "FIRONOVA — Password reset"
        heading = "Reset your password"
        body = "You requested a password reset. This link expires in 30 minutes."
        cta = "Choose a new password"
        ignore = "If you didn't request this, ignore this email — your password stays unchanged."
    html = f"""<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0B2E4F">
      <h1 style="font-size:20px;margin:0 0 12px">{heading}</h1>
      <p style="font-size:14px;line-height:1.6;color:#3E5C76;margin:0 0 24px">{body}</p>
      <a href="{link}" style="display:inline-block;background:#00B8D4;color:#0B2E4F;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:9999px;font-size:14px">{cta}</a>
      <p style="font-size:12px;line-height:1.6;color:#7A8CA0;margin:24px 0 0">{ignore}</p>
      <p style="font-size:11px;color:#A0AEC0;margin:16px 0 0">For Research Use Only · Réservé à la recherche</p>
    </div>"""
    from_addr = MAGIC_SENDER_EMAIL or SENDER_EMAIL
    await _send_email(email, subject, html, from_email=from_addr)


@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, request: Request):
    """Émet un lien de réinitialisation. Réponse uniforme (anti-énumération)."""
    email = payload.email.lower().strip()
    _rate_limit_email("reset_request", email, RESET_REQUEST_MAX,
                      RESET_REQUEST_WINDOW, "Trop de demandes. Réessayez plus tard.")
    user = await db.users.find_one({"email": email})
    if user and not user.get("passwordless", False):
        raw = secrets.token_urlsafe(32)
        await db.magic_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "token_hash": _hash_magic_token(raw),
            "purpose": "reset",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)).isoformat(),
            "used_at": None,
            "ip": _client_ip(request),
        })
        base = _trusted_public_base_url()
        link = f"{base}/reset-password?token={raw}"
        await _send_reset_email(email, link, payload.lang or "fr")
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn, response: Response, request: Request):
    token_hash = _hash_magic_token(payload.token.strip())
    rec = await db.magic_tokens.find_one({"token_hash": token_hash, "purpose": "reset"})
    if not rec:
        raise HTTPException(400, "Invalid or expired reset link")
    if rec.get("used_at"):
        raise HTTPException(400, "This reset link has already been used")
    expires_at = datetime.fromisoformat(rec["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(400, "This reset link has expired")
    claimed = await db.magic_tokens.update_one(
        {"_id": rec["_id"], "used_at": None},
        {"$set": {"used_at": datetime.now(timezone.utc).isoformat()}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(400, "This reset link has already been used")
    user = await db.users.find_one({"email": rec["email"]})
    if not user:
        raise HTTPException(400, "Invalid or expired reset link")
    new_hash = hash_password(payload.password)
    new_tv = user.get("token_version", 0) + 1
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash, "token_version": new_tv, "passwordless": False}},
    )
    await db.magic_tokens.delete_many({"email": rec["email"], "purpose": "reset", "used_at": None})
    token_jwt = create_access_token(user["id"], user["email"], user["role"], token_version=new_tv)
    set_auth_cookie(response, token_jwt, request)
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "created_at": user["created_at"],
    }


async def _magic_tokens_cleanup():
    while True:
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            res = await db.magic_tokens.delete_many({"expires_at": {"$lt": cutoff}})
            if res.deleted_count:
                logging.info("[magic] purged %d expired tokens", res.deleted_count)
        except Exception as e:
            logging.error("[magic] cleanup error: %s", e)
        try:
            unverified_cutoff = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
            res2 = await db.users.delete_many({
                "email_verified": False,
                "created_at": {"$lte": unverified_cutoff},
            })
            if res2.deleted_count:
                logging.info("[magic] purged %d unactivated accounts", res2.deleted_count)
        except Exception as e:
            logging.error("[magic] unactivated account purge error: %s", e)
        await asyncio.sleep(6 * 3600)



# ---------------------------------------------------------------------------
# Mon Compte — profil, mot de passe, changement d'email (double opt-in),
# adresses sauvegardées, suppression de compte avec anonymisation.
# ---------------------------------------------------------------------------
EMAIL_CHANGE_TTL_HOURS = 24
GUEST_ORDER_ACCESS_TTL_MINUTES = 60 * 24 * 7


@api.put("/account/profile")
async def account_update_profile(payload: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    name = payload.name.strip()
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": name}})
    return {"ok": True, "name": name}


def _assert_current_password(doc: dict, provided: Optional[str]) -> None:
    """Vérifie le mot de passe actuel, sauf pour un compte passwordless où
    l'auth cookie (déjà exigée) fait foi."""
    if doc.get("passwordless", False):
        return
    if not provided or not verify_password(provided, doc["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect")


@api.put("/account/password")
async def account_change_password(payload: PasswordChangeIn, response: Response,
                                  user: dict = Depends(get_current_user)):
    _rate_limit_email("account_password", user["email"], 5, 900, "Too many password attempts. Try again later.")
    doc = await db.users.find_one({"id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    _assert_current_password(doc, payload.current_password)
    new_tv = doc.get("token_version", 0) + 1
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password),
                  "token_version": new_tv, "passwordless": False}},
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
    _rate_limit_email("email_change", user["email"], 3, 3600, "Too many email change requests. Try again later.")
    doc = await db.users.find_one({"id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    _assert_current_password(doc, payload.current_password)
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
        "token_hash": _hash_token(token),
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=EMAIL_CHANGE_TTL_HOURS)).isoformat(),
        "used": False,
    })
    base = _trusted_public_base_url()
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
    token_hash = _hash_token(token)
    req = await db.email_change_requests.find_one({"token_hash": token_hash, "used": False})
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
    await db.email_change_requests.update_one({"token_hash": token_hash}, {"$set": {"used": True, "used_at": now}})
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
    _rate_limit_email("account_delete", user["email"], 3, 900, "Too many account deletion attempts. Try again later.")
    doc = await db.users.find_one({"id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Account not found")
    _assert_current_password(doc, payload.current_password)
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
            "shipping_address.city": "[deleted]",
            "shipping_address.province": "[deleted]",
            "shipping_address.postal_code": "[deleted]",
            "shipping_address.phone": "",
            "anonymized_at": now,
        }},
    )
    # 2. Purger les données annexes et tokens liés au compte
    await db.addresses.delete_many({"user_id": doc["id"]})
    await db.stock_notifications.delete_many({"email": doc["email"]})
    await db.subscribers.delete_one({"email": doc["email"]})
    await db.email_change_requests.delete_many({"user_id": doc["id"]})
    await db.magic_tokens.delete_many({"email": doc["email"]})
    await db.wishlist.delete_many({"user_id": doc["id"]})
    if hasattr(db, "coupons"):
        await db.coupons.update_many(
            {"used_by.email": doc["email"].lower().strip()},
            {"$pull": {"used_by": {"email": doc["email"].lower().strip()}}},
        )
    order_cursor = db.orders.find({"user_id": doc["id"]}, {"_id": 0, "id": 1})
    order_ids = [o.get("id") for o in order_cursor.to_list(1000) if o.get("id")]
    if order_ids:
        await db.order_access_tokens.delete_many({"order_id": {"$in": order_ids}})
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


def _normalize_images(payload_doc: dict) -> dict:
    """Keeps image_url as cover; always first in gallery; caps at 8 entries."""
    image_url = str(payload_doc.get("image_url") or "").strip()
    raw = [str(u) for u in (payload_doc.get("images") or []) if u and isinstance(u, str) and u.strip()]
    images = raw[:8]
    if image_url and image_url not in images:
        images = [image_url] + images[:7]
    if not images and image_url:
        images = [image_url]
    if images:
        payload_doc["images"] = images[:8]
        if not image_url or image_url not in images:
            payload_doc["image_url"] = images[0]
    else:
        payload_doc["images"] = []
        payload_doc["image_url"] = ""
    return payload_doc


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
    doc = _normalize_images(doc)
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
    update = _normalize_images(update)
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

    # Re-evaluate preorders whenever stock or COA/coming-soon badges change.
    asyncio.create_task(_release_ready_preorder_orders())

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

    rel_path = f"/api/uploads/coa/{safe_name}"
    url = f"{PUBLIC_BASE_URL}{rel_path}" if PUBLIC_BASE_URL else rel_path
    return {"url": url, "original_filename": filename, "size_bytes": len(contents)}


@api.post("/admin/upload/image")
async def admin_upload_image(file: UploadFile = File(...), _admin: dict = Depends(require_area("products", "manage"))):
    """Uploads a product image (PNG, JPEG, WebP, GIF) and returns a URL to use in
    the image_url field. Storage is local disk under UPLOAD_DIR/images, served
    statically at /uploads/images/<file>."""
    filename = file.filename or ""

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_IMAGE_UPLOAD_MB:
        raise HTTPException(400, f"File too large — max {MAX_IMAGE_UPLOAD_MB:.0f} MB")

    # Validation PAR LE CONTENU (magic bytes), pas par le Content-Type déclaré
    # par le client : un Content-Type est triviable, un header de fichier ne l'est pas.
    _IMAGE_FORMAT_EXT = {
        "PNG": "png",
        "JPEG": "jpg",
        "WEBP": "webp",
        "GIF": "gif",
    }
    try:
        prev_max = PILImage.MAX_IMAGE_PIXELS
        PILImage.MAX_IMAGE_PIXELS = 50_000_000  # borne anti-decompression-bomb
        try:
            with PILImage.open(io.BytesIO(contents)) as im:
                fmt = (im.format or "").upper()
                im.verify()
        finally:
            PILImage.MAX_IMAGE_PIXELS = prev_max
    except Exception:
        raise HTTPException(400, "File is not a valid image")

    ext = _IMAGE_FORMAT_EXT.get(fmt)
    if not ext:
        raise HTTPException(400, "Only PNG, JPEG, WebP, and GIF images are allowed")

    safe_name = f"{uuid.uuid4().hex}.{ext}"
    dest = IMAGE_UPLOAD_DIR / safe_name
    with open(dest, "wb") as f:
        f.write(contents)

    rel_path = f"/api/uploads/images/{safe_name}"
    return {"url": rel_path, "original_filename": filename, "size_bytes": len(contents)}


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
        "coa_status": "available" if p.get("coa_url") else "none",
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


def _coupon_usage_for_email(coupon: dict, email: str) -> int:
    """Nombre d'utilisations d'un coupon par un email donne (tableau used_by)."""
    for entry in coupon.get("used_by") or []:
        if entry and entry.get("email") == email:
            try:
                return int(entry.get("count", 0))
            except (TypeError, ValueError):
                return 0
    return 0


def _is_affiliate_coupon(coupon: dict) -> bool:
    return bool(coupon.get("affiliate_id")) or coupon.get("source") == "affiliate"


def _enforce_standard_coupon_percent_limit(discount_type: str, value: float, is_affiliate: bool) -> None:
    if is_affiliate or STANDARD_COUPON_MAX_PERCENT is None:
        return
    if discount_type == "percent" and float(value) > STANDARD_COUPON_MAX_PERCENT:
        raise HTTPException(400, f"Standard coupon percent cannot exceed {STANDARD_COUPON_MAX_PERCENT:.2f}")


async def _coupon_discount(coupon: dict, subtotal: float,
                           line_items: Optional[list] = None,
                           email: Optional[str] = None) -> tuple[float, dict]:
    """Valide un coupon et retourne (discount, applied_coupon). Leve 400 si invalide.

    Les restrictions contextuelles (emails autorises, premier achat, limite par
    client, restriction produit/categorie) ne sont verifiees QUE si le contexte
    est fourni : le checkout le fournit toujours ; le point public /coupons/validate
    sans email ni items reste strictement retrocompatible."""
    if not coupon or not coupon.get("active"):
        raise HTTPException(400, "Invalid coupon code")
    if coupon.get("expires_at"):
        try:
            if datetime.fromisoformat(coupon["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
                raise HTTPException(400, "Coupon expired")
        except ValueError:
            pass
    if coupon.get("start_at"):
        try:
            if datetime.fromisoformat(coupon["start_at"].replace("Z", "+00:00")) > datetime.now(timezone.utc):
                raise HTTPException(400, "Coupon not active yet")
        except ValueError:
            pass
    if coupon.get("usage_limit") and coupon.get("used_count", 0) >= coupon["usage_limit"]:
        raise HTTPException(400, "Coupon usage limit reached")
    if subtotal < coupon.get("min_subtotal", 0):
        raise HTTPException(400, f"Minimum subtotal of ${coupon['min_subtotal']:.2f} required for this coupon")

    email_norm = (email or "").strip().lower()
    allowed = [e.lower().strip() for e in (coupon.get("allowed_emails") or []) if e and e.strip()]
    if allowed and email_norm:
        if email_norm not in allowed:
            raise HTTPException(400, "This coupon is not valid for this account")
    if coupon.get("first_order_only") and email_norm:
        prior = await db.orders.count_documents({"email": email_norm, "payment_status": "paid"})
        if prior > 0:
            raise HTTPException(400, "This coupon is valid for first orders only")
    per_limit = coupon.get("per_customer_limit")
    if per_limit and email_norm:
        if _coupon_usage_for_email(coupon, email_norm) >= int(per_limit):
            raise HTTPException(400, "Coupon usage limit reached for this account")

    restrict_products = [p for p in (coupon.get("restrict_products") or []) if p]
    restrict_categories = [c for c in (coupon.get("restrict_categories") or []) if c]
    if line_items and (restrict_products or restrict_categories):
        for it in line_items:
            if restrict_products and str(it.get("product_id", "")) not in restrict_products:
                raise HTTPException(400, "This coupon does not apply to all items in your cart")
            if restrict_categories and (it.get("category") or "") not in restrict_categories:
                    raise HTTPException(400, "This coupon does not apply to all items in your cart")

    _enforce_standard_coupon_percent_limit(
        coupon.get("discount_type", ""),
        float(coupon.get("value", 0)),
        _is_affiliate_coupon(coupon),
    )

    if coupon["discount_type"] == "percent":
        discount = round(subtotal * (coupon["value"] / 100.0), 2)
    else:
        discount = round(min(coupon["value"], subtotal), 2)
    max_disc = coupon.get("max_discount_cad")
    if max_disc is not None:
        discount = round(min(discount, float(max_disc)), 2)

    applied = {
        "code": coupon["code"],
        "discount_type": coupon["discount_type"],
        "value": coupon["value"],
        "discount_amount": discount,
    }
    return discount, applied


async def _build_order_totals(items: List[CartItem], coupon_code: Optional[str] = None, customer_email: Optional[str] = None):
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
        # badge_coa_pending (COA not yet available) also forces preorder path,
        # matching the frontend rule (badge_coa_pending || badge_coming_soon).
        coa_coming = bool(v.get("badge_coming_soon") or v.get("badge_coa_pending"))
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

    discount = 0.0
    applied_coupon = None
    if coupon_code:
        coupon = await db.coupons.find_one({"code": coupon_code.upper().strip()}, {"_id": 0})
        discount, applied_coupon = await _coupon_discount(
            coupon, subtotal, line_items=line_items, email=customer_email
        )

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

_CP_OAUTH_TOKEN: str = ""
_CP_OAUTH_EXPIRES_AT: Optional[datetime] = None


def _cp_use_openapi() -> bool:
    mode = CANADA_POST_API_MODE
    if mode == "openapi":
        return True
    if mode == "legacy":
        return False
    return bool(CANADA_POST_OAUTH_CLIENT_ID and CANADA_POST_OAUTH_CLIENT_SECRET)


def _cp_path_customers() -> tuple[str, str]:
    mailed_by = (CANADA_POST_MAILED_BY or CANADA_POST_CUSTOMER_NUMBER or "").strip()
    mobo = (CANADA_POST_MOBO or CANADA_POST_CUSTOMER_NUMBER or "").strip()
    return mailed_by, mobo


def _cp_openapi_headers(token: str, accept: str = "application/json") -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": accept,
        "Accept-Language": "en-CA",
    }
    if CANADA_POST_PLATFORM_ID:
        headers["platform-id"] = CANADA_POST_PLATFORM_ID
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
                CANADA_POST_OAUTH_TOKEN_URL,
                data=data,
                auth=(CANADA_POST_OAUTH_CLIENT_ID, CANADA_POST_OAUTH_CLIENT_SECRET),
                headers={"Accept": "application/json"},
            )
    except Exception as ex:
        logging.error("Canada Post OAuth token request failed: %s", ex)
        raise HTTPException(502, "Canada Post OAuth token endpoint unreachable")

    if r.status_code >= 400:
        logging.error("Canada Post OAuth token %s: %s", r.status_code, r.text[:800])
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
    token = await _cp_get_oauth_token()
    url = url_or_path if url_or_path.startswith("http") else f"{CANADA_POST_OPENAPI_BASE_URL}{url_or_path}"
    headers = _cp_openapi_headers(token, accept=accept)
    if json_body is not None:
        headers["Content-Type"] = "application/json"

    # follow_redirects=True est INDISPENSABLE : Canada Post renvoie l'artifact
    # (le PDF de l'étiquette) via une redirection 302 vers l'URL réelle. Sans
    # suivre la redirection, on écrit la réponse 302 vide -> étiquette blanche.
    async with httpx.AsyncClient(timeout=45, follow_redirects=True) as cx:
        r = await cx.request(method, url, json=json_body, headers=headers)
        if r.status_code == 401:
            token = await _cp_get_oauth_token(force_refresh=True)
            headers = _cp_openapi_headers(token, accept=accept)
            if json_body is not None:
                headers["Content-Type"] = "application/json"
            r = await cx.request(method, url, json=json_body, headers=headers)
    return r


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
                auth=_cp_auth_tuple(),
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
                auth=_cp_auth_tuple(),
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
    if not (CANADA_POST_ENVIRONMENT == "dev" and CANADA_POST_SANDBOX_DELIVERY_FALLBACK):
        return False
    if not shipped_at_iso:
        return False
    try:
        dt = datetime.fromisoformat(shipped_at_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
        return age >= timedelta(hours=max(1, CANADA_POST_SANDBOX_DELIVER_AFTER_HOURS))
    except Exception:
        return False


def is_canada_post_configured() -> bool:
    """Vrai seulement si les trois éléments indispensables sont présents.
    Sinon TOUT retombe proprement sur le tarif fixe / le suivi manuel."""
    if _cp_use_openapi():
        mailed_by, mobo = _cp_path_customers()
        return bool(
            mailed_by
            and mobo
            and CANADA_POST_ORIGIN_POSTAL_CODE
            and CANADA_POST_OAUTH_CLIENT_ID
            and CANADA_POST_OAUTH_CLIENT_SECRET
        )
    return bool(CANADA_POST_API_KEY and CANADA_POST_CUSTOMER_NUMBER and CANADA_POST_ORIGIN_POSTAL_CODE)


def _cp_auth_tuple() -> tuple[str, str]:
    """Supporte "user:password" (recommandé CP) et token seul (legacy)."""
    raw = (CANADA_POST_API_KEY or "").strip()
    if ":" in raw:
        user, pwd = raw.split(":", 1)
        return user.strip(), pwd.strip()
    return raw, ""


def _cp_xml_escape(v: str) -> str:
    """Une apostrophe dans un nom de rue casse le XML — et un chevron l'injecte."""
    return (str(v or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


def _cp_intended_method() -> str:
    if CANADA_POST_INTENDED_METHOD:
        return CANADA_POST_INTENDED_METHOD
    return "Account" if CANADA_POST_CONTRACT_ID.strip() else "CreditCard"


async def _canada_post_create_shipment_openapi(order: dict, service_code: str, weight_kg: float) -> dict:
    ship = order.get("shipping_address") or {}
    # Contenant configuré (tare + dimensions) — améliore la justesse du tarif.
    box = await _select_box_for_order(order)
    box_dims = None
    if box:
        weight_kg = round(weight_kg + float(box.get("tare_grams") or 0) / 1000.0, 3)
        box_dims = {
            "length": round(float(box["length_cm"]), 1),
            "width": round(float(box["width_cm"]), 1),
            "height": round(float(box["height_cm"]), 1),
        }
    dest_pc = str(ship.get("postal_code", "")).replace(" ", "").upper()
    origin_pc = CANADA_POST_ORIGIN_POSTAL_CODE.replace(" ", "").upper()
    mailed_by, mobo = _cp_path_customers()
    group_id = f"FN-{datetime.now(timezone.utc).strftime('%Y%m%d')}"

    settlement = {
        "paidByCustomer": mobo,
        "intendedMethodOfPayment": _cp_intended_method(),
    }
    contract = CANADA_POST_CONTRACT_ID.strip()
    if contract:
        settlement["contractId"] = contract

    payload: dict[str, Any] = {
        "groupId": group_id,
        "requestedShippingPoint": origin_pc,
        "cpcPickupIndicator": True,
        "deliverySpec": {
            "serviceCode": service_code,
            "sender": {
                "name": CANADA_POST_SENDER_NAME,
                "company": CANADA_POST_SENDER_NAME,
                "contactPhone": CANADA_POST_SENDER_PHONE,
                "addressDetails": {
                    "addressLine1": CANADA_POST_SENDER_ADDRESS,
                    "city": CANADA_POST_SENDER_CITY,
                    "provState": CANADA_POST_SENDER_PROVINCE,
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

    r = await _cp_openapi_call("POST", f"/{mailed_by}/{mobo}/shipments", json_body=payload)
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
        r = await _cp_openapi_call("GET", href, accept="application/pdf")
    except HTTPException:
        return None
    except Exception as ex:
        logging.error("Canada Post OpenAPI get-artifact failed: %s", ex)
        return None
    if r.status_code >= 400:
        logging.error("Canada Post OpenAPI get-artifact %s: %s", r.status_code, _cp_error_detail(r))
        return None
    fname = f"{order_id}-{uuid.uuid4().hex[:8]}.pdf"
    (LABEL_UPLOAD_DIR / fname).write_bytes(r.content)
    return f"/uploads/labels/{fname}"


async def _canada_post_get_manifest_artifact_openapi(href: str, date_str: str) -> Optional[str]:
    """Télécharge le PDF du manifeste via le flux en 2 étapes du devportal CP:
    1) GET {manifest_href} Accept:application/json  → obtient le lien "artifact"
    2) GET {artifact_href} Accept:application/pdf   → télécharge le PDF réel.
    """
    if not href:
        return None
    try:
        # Étape 1: récupérer le JSON du manifeste pour trouver le lien artifact
        r_json = await _cp_openapi_call("GET", href, accept="application/json")
        if r_json.status_code >= 400:
            logging.error("CP manifest-artifact step1 %s: %s", r_json.status_code, _cp_error_detail(r_json))
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
        r_pdf = await _cp_openapi_call("GET", artifact_href, accept="application/pdf")
        if r_pdf.status_code >= 400:
            logging.error("CP manifest-artifact step2 %s: %s", r_pdf.status_code, _cp_error_detail(r_pdf))
            return None
        if r_pdf.content[:4] != b"%PDF":
            logging.error("CP manifest-artifact: response is not a PDF (%d bytes)", len(r_pdf.content))
            return None
        fname = f"manifest-{date_str}-{uuid.uuid4().hex[:8]}.pdf"
        (LABEL_UPLOAD_DIR / fname).write_bytes(r_pdf.content)
        logging.info("CP manifest PDF saved: %s", fname)
        return f"/uploads/labels/{fname}"
    except HTTPException:
        return None
    except Exception as ex:
        logging.error("Canada Post OpenAPI get-manifest-artifact failed: %s", ex)
        return None


async def _canada_post_shipment_price(shipment_id: str, preferred_service_code: Optional[str] = None) -> Optional[dict]:
    """Coût réel facturé par Postes Canada pour un envoi (Get Shipment Price).
    C'est ce qui permet de comparer ce qu'on PAIE à ce qu'on FACTURE au client."""
    if not shipment_id or not _cp_use_openapi():
        return None
    mailed_by, mobo = _cp_path_customers()
    try:
        r = await _cp_openapi_call("GET", f"/{mailed_by}/{mobo}/shipments/{shipment_id}/price")
    except Exception as ex:
        logging.error("Canada Post get-price failed (%s): %s", shipment_id, ex)
        return None
    if r.status_code >= 400:
        logging.error("Canada Post get-price %s: %s", r.status_code, _cp_error_detail(r))
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
        logging.error("Canada Post get-price: unexpected payload for %s: %s", shipment_id, str(raw)[:200])
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
    if not (_cp_use_openapi() and is_canada_post_configured()):
        return None
    shipment_id = ""
    try:
        # Réutilise le payload officiel déjà accepté en prod par la création
        # d'étiquette normale pour éviter les erreurs de schéma.
        created = await _canada_post_create_shipment_openapi(order, service_code, weight_kg)
        shipment_id = str(created.get("shipment_id") or "")
        if not shipment_id:
            return None

        price = await _canada_post_shipment_price(shipment_id, preferred_service_code=service_code)

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
            await _canada_post_void_openapi(shipment_id)


async def _canada_post_manifest_details(manifest_href: str) -> Optional[dict]:
    """Détails de coût d'un manifeste (Get Manifest Details) : total réellement
    facturé pour la journée, pour le rapprochement comptable."""
    if not manifest_href:
        return None
    href = manifest_href.rstrip("/")
    if not href.endswith("/details"):
        href = f"{href}/details"
    try:
        r = await _cp_openapi_call("GET", href)
    except Exception as ex:
        logging.error("Canada Post manifest-details failed: %s", ex)
        return None
    if r.status_code >= 400:
        logging.error("Canada Post manifest-details %s: %s", r.status_code, _cp_error_detail(r))
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
    origin_pc = CANADA_POST_ORIGIN_POSTAL_CODE.replace(" ", "").upper()
    payload = {
        "groupIds": [group_id],
        "requestedShippingPoint": origin_pc,
        "cpcPickupIndicator": True,
        "detailedManifests": True,
        "methodOfPayment": _cp_intended_method(),
        "manifestAddress": {
            "manifestCompany": CANADA_POST_SENDER_NAME,
            "manifestName": CANADA_POST_SENDER_NAME,
            "phoneNumber": CANADA_POST_SENDER_PHONE,
            "addressDetails": {
                "addressLine1": CANADA_POST_SENDER_ADDRESS,
                "city": CANADA_POST_SENDER_CITY,
                "provState": CANADA_POST_SENDER_PROVINCE,
                "countryCode": "CA",
                "postalZipCode": origin_pc,
            },
        },
    }
    r = await _cp_openapi_call("POST", f"/{mailed_by}/{mobo}/manifests", json_body=payload)
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
        r = await _cp_openapi_call("DELETE", f"/{mailed_by}/{mobo}/shipments/{shipment_id}")
        return r.status_code < 400
    except Exception as ex:
        logging.error("Canada Post OpenAPI void failed: %s", ex)
        return False


async def _canada_post_create_shipment(order: dict, service_code: str, weight_kg: float) -> dict:
    """Create Shipment (non-contractuel par défaut) → tracking PIN + lien étiquette.

    Retourne {"pin", "label_href", "shipment_id", "group_id"} ou lève HTTPException.
    """
    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")
    if _cp_use_openapi():
        return await _canada_post_create_shipment_openapi(order, service_code, weight_kg)

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
                auth=_cp_auth_tuple(),
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
    if _cp_use_openapi():
        return await _canada_post_get_artifact_openapi(href, order_id)
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.get(href, auth=_cp_auth_tuple(), headers={"Accept": "application/pdf"})
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
    if _cp_use_openapi():
        return await _canada_post_transmit_openapi(group_id)
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
                auth=_cp_auth_tuple(),
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
    if _cp_use_openapi():
        return await _canada_post_void_openapi(shipment_id)
    cust = CANADA_POST_CUSTOMER_NUMBER
    path = (f"/rs/{cust}/{cust}/shipment/{shipment_id}" if CANADA_POST_CONTRACT_ID.strip()
            else f"/rs/{cust}/ncshipment/{shipment_id}")
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.delete(f"{CANADA_POST_BASE_URL}{path}", auth=_cp_auth_tuple(),
                                headers={"Accept": "application/vnd.cpc.shipment-v8+xml"})
            return r.status_code < 400
    except Exception as ex:
        logging.error("Canada Post void failed: %s", ex)
        return False


async def _auto_create_dispatch_label(order_id: str, service_code: Optional[str] = None) -> Optional[dict]:
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return None
    if order.get("payment_status") != "paid":
        return None
    info = order.get("shipping_info") or {}
    if info.get("label_url") and info.get("tracking_number"):
        return info
    if not is_canada_post_configured():
        return None

    svc = (service_code or info.get("service_code") or CANADA_POST_DEFAULT_SERVICE_CODE or "DOM.EP").strip()
    try:
        res = await _canada_post_create_shipment(order, svc, _order_weight_kg(order))
        label_url = await _canada_post_get_artifact(res["label_href"], order["id"])
        now = datetime.now(timezone.utc).isoformat()
        shipping_info = {
            **info,
            "carrier": "Canada Post",
            "tracking_number": res["pin"],
            "label_url": label_url,
            "cp_shipment_id": res["shipment_id"],
            "cost": await _canada_post_shipment_price(res["shipment_id"], preferred_service_code=svc),
            "cp_group_id": res["group_id"],
            "cp_transmitted": False,
            "service_code": svc,
            "shipped_at": now,
        }
        await db.orders.update_one(
            {"id": order["id"]},
            {"$set": {"shipping_info": shipping_info, "fulfillment_status": "shipped"},
             "$push": {"notes": {
                 "id": str(uuid.uuid4()),
                 "text": f"Étiquette Postes Canada créée automatiquement — suivi {res['pin']}.",
                 "author": "system",
                 "created_at": now,
             }}},
        )
        fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        asyncio.create_task(send_shipping_notification(fresh))
        return shipping_info
    except Exception as ex:
        logging.error("auto label failed for %s: %s", order["order_number"], ex)
        return None


async def _auto_label_paid_orders_once() -> int:
    cursor = db.orders.find(
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
        await asyncio.sleep(max(15, CANADA_POST_AUTO_LABEL_INTERVAL_SECONDS))


async def _auto_sync_delivered_orders_once(limit: int = 200) -> int:
    """Passe automatiquement en 'delivered' les commandes expédiées dont le
    repérage Canada Post confirme la livraison."""
    if not CANADA_POST_API_KEY:
        return 0
    rows = await db.orders.find(
        {
            "fulfillment_status": "shipped",
            "shipping_info.tracking_number": {"$nin": [None, ""]},
        },
        {"_id": 0, "id": 1, "order_number": 1, "shipping_info": 1},
    ).sort("shipping_info.shipped_at", 1).to_list(max(1, min(limit, 1000)))

    updated = 0
    for order in rows:
        info = order.get("shipping_info") or {}
        pin = str(info.get("tracking_number") or "").strip()
        if not pin:
            continue

        live = await _canada_post_track(pin)
        delivered, evidence = _cp_tracking_indicates_delivered(live)
        source = "canada_post_tracking_auto"
        if not delivered:
            shipped_at = str(info.get("shipped_at") or "")
            if _sandbox_fallback_ready(shipped_at):
                delivered = True
                evidence = "sandbox fallback after delay"
                source = "sandbox_time_fallback_auto"
        if not delivered:
            continue

        now = datetime.now(timezone.utc).isoformat()
        res = await db.orders.update_one(
            {"id": order["id"], "fulfillment_status": "shipped"},
            {
                "$set": {
                    "fulfillment_status": "delivered",
                    "shipping_info.delivered_at": now,
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
        await asyncio.sleep(max(60, CANADA_POST_AUTO_DELIVERY_SYNC_SECONDS))


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
    """Sends via Resend; logs and continues silently on any failure (no API key, send error, etc.).
    from_email permet de surcharger l'expéditeur (ex. auth vs commandes). Défaut : SENDER_EMAIL."""
    to_list = to if isinstance(to, list) else [to]
    if not RESEND_API_KEY:
        logging.info("[email-log] would send to %s subj=%r (no RESEND_API_KEY configured)", to_list, subject)
        return
    try:
        params = {"from": from_email or SENDER_EMAIL, "to": to_list, "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logging.info("[email] sent id=%s to=%s", result.get("id") if isinstance(result, dict) else result, to_list)
    except Exception as e:
        logging.error("[email] failed to send to=%s err=%s", to_list, e)


async def send_order_confirmation(order: dict) -> None:
    if not order.get("email"):
        logging.info("[email] skip customer confirm: no email on order %s", order["order_number"])
    else:
        lang, to, ctx = _order_ctx(order)
        key = "order_confirmation_crypto" if order.get("payment_method") == "nowpayments" else "order_confirmation_interac"
        await send_template_email(key, to, lang, ctx, order)

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
    lang, to, ctx = _order_ctx(order)
    await send_template_email("payment_received", to, lang, ctx, order)


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
    lang, to, ctx = _order_ctx(order)
    ctx["tracking_number"] = pin or ctx.get("tracking_number", "")
    order = {**order, "tracking_number": ctx["tracking_number"]}
    await send_template_email("shipping", to, lang, ctx, order)


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
    lang, to, ctx = _order_ctx({**order, "_refund_amount": amount})
    ctx["amount"] = f"{amount:.2f} $"
    await send_template_email("refund", to, lang, ctx, {**order, "_refund_amount": amount})


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
    await send_template_email("restock", to_email, "en", {"product_name": name, "product_url": (PUBLIC_BASE_URL or "").rstrip("/") + f"/product/{product.get('slug','')}"})


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
# Le filtre bloque les statuts terminaux (cancelled/failed/refunded) et
# empêche une confirmation tardive de réactiver une commande déjà clôturée.
# Le filtre {"payment_status": {"$nin": [...]}} dans le update_one garantit
# qu'un seul appelant gagne, même avec des callbacks/pollings concurrents
# arrivent à la milliseconde près. Le coupon est décompté ici (et pas à la
# création) : un panier abandonné ne doit jamais consommer un usage_limit.
# ---------------------------------------------------------------------------
async def _mark_order_paid(order_id: str, note_text: Optional[str] = None) -> Optional[dict]:
    """Retourne l'order fraîche si CET appel a fait la transition, sinon None."""
    paid_at = datetime.now(timezone.utc).isoformat()
    terminal_statuses = {"paid", "cancelled", "failed", "refunded"}
    # Preorder orders retain 'preorder' fulfillment_status until items ship.
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0, "has_preorder": 1, "payment_status": 1})
    if not existing or existing.get("payment_status") in terminal_statuses:
        return None
    new_fulfillment = "preorder" if existing.get("has_preorder") else "processing"
    update: dict = {
        "$set": {
            "payment_status": "paid",
            "fulfillment_status": new_fulfillment,
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
        {"id": order_id, "payment_status": {"$nin": list(terminal_statuses)}},
        update,
    )
    if not res.modified_count:
        return None  # déjà payée : un autre chemin a gagné la course

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return None

    # Décompte du coupon au paiement confirmé, une seule fois (global + par client).
    coupon = order.get("coupon")
    if coupon and coupon.get("code") and not order.get("coupon_counted"):
        code = coupon["code"]
        await db.coupons.update_one({"code": code}, {"$inc": {"used_count": 1}})
        email_norm = (order.get("email") or "").strip().lower()
        if email_norm:
            res2 = await db.coupons.update_one(
                {"code": code, "used_by.email": email_norm},
                {"$inc": {"used_by.$.count": 1}},
            )
            if res2.matched_count == 0:
                await db.coupons.update_one({"code": code}, {"$push": {"used_by": {"email": email_norm, "count": 1}}})
        await db.orders.update_one({"id": order_id}, {"$set": {"coupon_counted": True}})

    if order.get("email"):
        asyncio.create_task(send_payment_received(order))
    # Dispatch manuel : l'étiquette n'est PLUS créée automatiquement au paiement.
    # La commande attend dans « À étiqueter » et l'admin génère l'étiquette
    # depuis l'écran Dispatch.
    # asyncio.create_task(_auto_create_dispatch_label(order_id))
    # --- AFFILIATE: commission pending au paiement confirme ---
    await affiliate_on_order_paid(order)
    return order


@api.post("/checkout")
async def checkout(payload: CheckoutIn, request: Request):
    if not (payload.accept_terms and payload.confirm_age and payload.confirm_research_use):
        raise HTTPException(400, "All compliance confirmations are required")
    if not payload.items:
        raise HTTPException(400, "Cart is empty")

    # Priorité au body (évite un préflight CORS déclenché par un en-tête
    # personnalisé, qui échoue derrière certains ingress) — l'en-tête reste
    # accepté pour rétro-compatibilité.
    idem_key = (payload.idempotency_key or request.headers.get("Idempotency-Key", "")).strip()
    lock_doc = None
    if idem_key:
        try:
            lock_doc = {"_id": idem_key, "status": "processing", "created_at": datetime.now(timezone.utc).isoformat()}
            await db.idempotency.insert_one(lock_doc)
        except DuplicateKeyError:
            cached = await db.idempotency.find_one({"_id": idem_key}, {"_id": 0, "response": 1, "status": 1})
            if cached and cached.get("response"):
                return cached["response"]
            for _ in range(50):
                await asyncio.sleep(0.05)
                cached = await db.idempotency.find_one({"_id": idem_key}, {"_id": 0, "response": 1, "status": 1})
                if cached and cached.get("response"):
                    return cached["response"]
            raise HTTPException(409, "Checkout already in progress")

    user = await _resolve_user(request)
    customer_email = ((user["email"] if user else None) or (payload.email.lower().strip() if payload.email else None))

    try:
        line_items, subtotal, tax_rate, tax, shipping, total, discount, applied_coupon, has_preorder = await _build_order_totals(
            payload.items, payload.coupon_code, customer_email=customer_email
        )
    except TypeError as e:
        # Compat legacy pour les doubles/mocks de tests qui n'acceptent pas le
        # nouvel argument optionnel customer_email.
        if "customer_email" not in str(e):
            raise
        line_items, subtotal, tax_rate, tax, shipping, total, discount, applied_coupon, has_preorder = await _build_order_totals(
            payload.items, payload.coupon_code
        )

    order_id = str(uuid.uuid4())
    # Numérotation Fironova : FN-AAMMJJ-XXXXXX (l'ancien préfixe NP- venait
    # de NORDPEP ; les commandes existantes gardent leur numéro).
    order_number = f"FN-{datetime.now(timezone.utc).strftime('%y%m%d')}-{order_id[:6].upper()}"

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
    elif payload.payment_method == "nowpayments":
        try:
            np = await _nowpayments_create(order_id, total, payload.pay_currency or "btc")
        except Exception:
            await _release_stock_atomic(reserved)
            raise
        payment_info = {"type": "nowpayments", "provider_response": np}
        payment_status = "awaiting_crypto"
    else:  # defensive guard if a client sends an unsupported value
        await _release_stock_atomic(reserved)
        raise HTTPException(400, "Unsupported payment method")

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
        "payment_ttl_hours": UNPAID_ORDER_TTL_HOURS,
        "payment_deadline": (datetime.now(timezone.utc) + timedelta(hours=UNPAID_ORDER_TTL_HOURS)).isoformat(),
        "compliance": {
            "accept_terms": True,
            "confirm_age": True,
            "confirm_research_use": True,
            "ip": request.client.host if request.client else None,
        },
    }
    # --- AFFILIATE: attribution depuis le cookie fn_ref (champ additif) ---
    created_order = False
    try:
        await affiliate_attach_to_order(order_doc, request)
        await db.orders.insert_one(order_doc)
        created_order = True
        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "session_id": idem_key or order_id,
            "status": payment_status,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        if created_order:
            await db.orders.delete_one({"id": order_id})
        await _release_stock_atomic(reserved)
        if idem_key:
            await db.idempotency.delete_one({"_id": idem_key})
        raise
    order_doc.pop("_id", None)

    # Persist idempotency key so replay returns same order without re-processing.
    if idem_key:
        try:
            await db.idempotency.update_one(
                {"_id": idem_key},
                {"$set": {"response": order_doc, "status": "completed"}},
            )
        except Exception:
            pass

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

    user = await _resolve_user(request)
    if order.get("user_id"):
        if not user or (user["id"] != order["user_id"] and user.get("role") != "admin"):
            raise HTTPException(403, "Forbidden")
        if not (user and user.get("role") == "admin"):
            if isinstance(order.get("compliance"), dict):
                order["compliance"].pop("ip", None)
            order["notes"] = [n for n in (order.get("notes") or []) if n.get("visible_to_customer")]
        return order

    access_token = (request.query_params.get("access_token") or "").strip()
    if not access_token:
        raise HTTPException(403, "Forbidden")

    token_hash = _hash_token(access_token)
    token_doc = await db.order_access_tokens.find_one({"token_hash": token_hash, "order_id": order_id, "used": False})
    if not token_doc:
        raise HTTPException(403, "Forbidden")
    if datetime.fromisoformat(token_doc["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(403, "Forbidden")

    await db.order_access_tokens.update_one({"_id": token_doc["_id"]}, {"$set": {"used": True}})
    if isinstance(order.get("compliance"), dict):
        order["compliance"].pop("ip", None)
    order["notes"] = [n for n in (order.get("notes") or []) if n.get("visible_to_customer")]
    order["guest_access_used"] = True
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


@api.post("/admin/orders/{order_id}/sync-delivery")
async def admin_sync_delivery_status(order_id: str,
                                     _admin: dict = Depends(require_area("orders", "manage"))):
    """Vérifie le repérage CP et passe la commande à 'delivered' si la livraison
    est confirmée par le transporteur."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")

    info = order.get("shipping_info") or {}
    pin = str(info.get("tracking_number") or "").strip()
    if not pin:
        raise HTTPException(400, "No tracking number on this order")

    live = await _canada_post_track(pin)
    if not live:
        # Sandbox: fallback temporel pour permettre les tests E2E malgré
        # l'auth tracking CP indisponible.
        shipped_at = str(info.get("shipped_at") or "")
        if _sandbox_fallback_ready(shipped_at):
            now = datetime.now(timezone.utc).isoformat()
            await db.orders.update_one(
                {"id": order_id, "fulfillment_status": "shipped"},
                {
                    "$set": {
                        "fulfillment_status": "delivered",
                        "shipping_info.delivered_at": now,
                        "shipping_info.delivery_source": "sandbox_time_fallback_manual",
                    },
                    "$push": {
                        "notes": {
                            "id": str(uuid.uuid4()),
                            "text": f"Statut livré (fallback sandbox après délai) — {pin}.",
                            "author": "system",
                            "created_at": now,
                        }
                    },
                },
            )
            updated = await db.orders.find_one({"id": order_id}, {"_id": 0, "fulfillment_status": 1, "shipping_info": 1})
            return {
                "ok": True,
                "tracked": False,
                "delivered": True,
                "updated": True,
                "reason": "sandbox_fallback",
                "fulfillment_status": (updated or {}).get("fulfillment_status"),
                "shipping_info": (updated or {}).get("shipping_info") or {},
            }
        return {
            "ok": True,
            "tracked": False,
            "updated": False,
            "reason": "tracking_unavailable",
            "fulfillment_status": order.get("fulfillment_status"),
        }

    delivered, evidence = _cp_tracking_indicates_delivered(live)
    if not delivered:
        return {
            "ok": True,
            "tracked": True,
            "delivered": False,
            "updated": False,
            "reason": "not_delivered_yet",
            "fulfillment_status": order.get("fulfillment_status"),
            "summary": live.get("summary"),
        }

    # Déjà livré -> rien à changer.
    if str(order.get("fulfillment_status") or "").lower() == "delivered":
        return {
            "ok": True,
            "tracked": True,
            "delivered": True,
            "updated": False,
            "reason": "already_delivered",
            "fulfillment_status": "delivered",
            "summary": live.get("summary"),
        }

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "fulfillment_status": "delivered",
                "shipping_info.delivered_at": now,
                "shipping_info.delivery_source": "canada_post_tracking",
            },
            "$push": {
                "notes": {
                    "id": str(uuid.uuid4()),
                    "text": f"Statut livré confirmé par repérage Canada Post ({pin}) — {evidence or 'delivered'}.",
                    "author": "system",
                    "created_at": now,
                }
            },
        },
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0, "fulfillment_status": 1, "shipping_info": 1})
    return {
        "ok": True,
        "tracked": True,
        "delivered": True,
        "updated": True,
        "fulfillment_status": (updated or {}).get("fulfillment_status"),
        "shipping_info": (updated or {}).get("shipping_info") or {},
        "summary": live.get("summary"),
    }


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
    valid_payment_statuses = {"awaiting_etransfer", "awaiting_crypto", "paid", "cancelled", "failed", "refunded"}
    if payment_status is not None and payment_status not in valid_payment_statuses:
        raise HTTPException(400, f"Invalid payment status: {payment_status}")

    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Order not found")

    if payment_status == "paid":
        updated = await _mark_order_paid(order_id)
        if fulfillment_status:
            await db.orders.update_one({"id": order_id}, {"$set": {"fulfillment_status": fulfillment_status}})
            updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
        return updated or existing

    update: dict = {}
    if payment_status:
        update["payment_status"] = payment_status
    if fulfillment_status:
        update["fulfillment_status"] = fulfillment_status
    if not update:
        raise HTTPException(400, "No fields to update")

    # GAP 1 & 2 — Effets de bord unifiés lorsque la commande passe à un
    # statut d'annulation. Restock + coupon + reverse de la commission
    # affiliée sont désormais centralisés dans `_cancel_order_side_effects()`
    # pour garantir la cohérence avec l'auto-cancel.
    now_iso = datetime.now(timezone.utc).isoformat()
    cancel_terminal = {"cancelled", "failed", "refunded"}
    payment_going_terminal = (
        payment_status in cancel_terminal
        and existing.get("payment_status") not in cancel_terminal
    )
    fulfillment_going_cancelled = (
        update.get("fulfillment_status") in ("cancelled", "failed")
        and existing.get("fulfillment_status") not in ("cancelled", "failed")
    )
    if payment_going_terminal or fulfillment_going_cancelled:
        # Reverse la commission uniquement si la commande était réellement
        # payée avant cette transition (cancel d'un awaiting → pas de commission).
        was_paid = existing.get("payment_status") == "paid"
        await _cancel_order_side_effects(existing, reverse_affiliate=was_paid)
        # Métadonnées pour audit / réouverture éventuelle
        if payment_going_terminal:
            update["cancelled_at"] = now_iso
            update["cancelled_reason"] = "admin_manual"
            update["prev_payment_status"] = existing.get("payment_status")

    await db.orders.update_one({"id": order_id}, {"$set": update})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
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


class ReopenOrderIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    mark_paid: bool = False
    note: Optional[str] = ""


@api.post("/admin/orders/{order_id}/reopen")
async def admin_reopen_order(
    order_id: str,
    payload: ReopenOrderIn,
    admin: dict = Depends(require_area("orders", "manage")),
):
    """GAP 3 — Réouvre une commande annulée après réception tardive du paiement.
    - Ré-décrémente le stock (échoue si un item n'est plus disponible → conseille
      au staff de contacter le client).
    - Rétablit le compteur du coupon (best-effort, respecte usage_limit).
    - Restaure `payment_status` à sa valeur pré-annulation (`prev_payment_status`)
      ou passe directement à "paid" si `mark_paid=True`.
    - Enregistre une note d'audit avec l'auteur et le motif fourni."""
    existing = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Order not found")
    if existing.get("payment_status") != "cancelled":
        raise HTTPException(400, "Only cancelled orders can be reopened")

    # 1) Ré-décrément atomique du stock
    reserved: list[dict] = []
    for it in (existing.get("items") or []):
        if it.get("preorder"):
            continue
        qty = int(it.get("qty", 1))
        vid = it.get("variant_id")
        if vid in (None, "", "_default"):
            res = await db.products.update_one(
                {"id": it["product_id"], "stock": {"$gte": qty}},
                {"$inc": {"stock": -qty}},
            )
        else:
            res = await db.products.update_one(
                {"id": it["product_id"], "variants": {"$elemMatch": {"id": vid, "stock": {"$gte": qty}}}},
                {"$inc": {"variants.$[v].stock": -qty}},
                array_filters=[{"v.id": vid}],
            )
        if res.modified_count != 1:
            # Rollback des réservations déjà faites
            for rb in reserved:
                rb_qty = int(rb.get("qty", 1))
                rb_vid = rb.get("variant_id")
                if rb_vid in (None, "", "_default"):
                    await db.products.update_one({"id": rb["product_id"]}, {"$inc": {"stock": rb_qty}})
                else:
                    await db.products.update_one(
                        {"id": rb["product_id"], "variants.id": rb_vid},
                        {"$inc": {"variants.$.stock": rb_qty}},
                    )
            raise HTTPException(
                409,
                f"Cannot reopen: insufficient stock for '{it.get('name_en') or it.get('slug') or 'item'}'",
            )
        reserved.append(it)

    # 2) Rétablir le compteur du coupon si applicable
    c = existing.get("coupon")
    if c and c.get("code") and not existing.get("coupon_counted"):
        code = c["code"]
        coupon_doc = await db.coupons.find_one({"code": code}, {"_id": 0, "usage_limit": 1, "used_count": 1})
        if coupon_doc:
            limit = coupon_doc.get("usage_limit")
            used = int(coupon_doc.get("used_count", 0) or 0)
            if limit is None or used < int(limit):
                await db.coupons.update_one({"code": code}, {"$inc": {"used_count": 1}})
                email_norm = (existing.get("email") or "").strip().lower()
                if email_norm:
                    r2 = await db.coupons.update_one(
                        {"code": code, "used_by.email": email_norm},
                        {"$inc": {"used_by.$.count": 1}},
                    )
                    if r2.matched_count == 0:
                        await db.coupons.update_one(
                            {"code": code},
                            {"$push": {"used_by": {"email": email_norm, "count": 1}}},
                        )
                await db.orders.update_one({"id": order_id}, {"$set": {"coupon_counted": True}})

    # 3) Rétablir le statut
    prev = existing.get("prev_payment_status") or "awaiting_etransfer"
    if prev not in {"awaiting_etransfer", "awaiting_crypto"}:
        prev = "awaiting_etransfer"
    now_iso = datetime.now(timezone.utc).isoformat()
    reopened_note_text = (
        f"Order reopened by {admin['email']}"
        + (f" — {payload.note.strip()}" if payload.note and payload.note.strip() else "")
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "payment_status": prev,
            "fulfillment_status": "processing" if existing.get("has_preorder") is False else existing.get("fulfillment_status") or "processing",
            "reopened_at": now_iso,
            "late_payment_flagged": False,
         },
         "$unset": {"cancelled_at": "", "cancelled_reason": "", "prev_payment_status": ""},
         "$push": {"notes": {
            "id": str(uuid.uuid4()),
            "text": reopened_note_text,
            "author": admin["email"],
            "created_at": now_iso,
         }}},
    )

    # 4) Si mark_paid, on confirme immédiatement le paiement
    if payload.mark_paid:
        paid = await _mark_order_paid(order_id, f"Paid confirmed at reopen by {admin['email']}")
        return paid or await db.orders.find_one({"id": order_id}, {"_id": 0})

    return await db.orders.find_one({"id": order_id}, {"_id": 0})


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
    base = _trusted_public_base_url()
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
    """Clients enrichis : dépenses cumulées, nb de commandes payées, dernière commande,
    et segment de rétention déterministe (nouveau / actif / fidèle / à risque / inactif)."""
    users = await db.users.find(
        {"role": {"$ne": "admin"}},
        {"_id": 0, "password_hash": 0, "token_version": 0},
    ).sort("created_at", -1).to_list(2000)

    # Agrégation des commandes payées par email (une seule passe)
    agg = db.orders.aggregate([
        {"$match": {"payment_status": "paid", "email": {"$ne": None}}},
        {"$group": {
            "_id": "$email",
            "orders": {"$sum": 1},
            "spent": {"$sum": "$total"},
            "last_order": {"$max": "$created_at"},
        }},
    ])
    stats = {}
    async for row in agg:
        if row["_id"]:
            stats[row["_id"].lower()] = row

    now = datetime.now(timezone.utc)

    def _segment(orders, last_iso):
        if orders == 0:
            return "prospect"
        days = 999
        if last_iso:
            try:
                days = (now - datetime.fromisoformat(last_iso.replace("Z", "+00:00"))).days
            except Exception:
                days = 999
        if orders >= 3:
            return "loyal" if days <= 120 else "at_risk"
        if days <= 45:
            return "active"
        if days <= 120:
            return "cooling"
        return "dormant"

    out = []
    for u in users:
        st = stats.get((u.get("email") or "").lower())
        orders = st["orders"] if st else 0
        spent = round(st["spent"], 2) if st else 0.0
        last_order = st["last_order"] if st else None
        u["orders_count"] = orders
        u["total_spent"] = spent
        u["last_order_at"] = last_order
        u["segment"] = _segment(orders, last_order)
        out.append(u)

    # Compte par segment (pour les filtres UI)
    seg_counts = {}
    for u in out:
        seg_counts[u["segment"]] = seg_counts.get(u["segment"], 0) + 1

    return {"customers": out, "segment_counts": seg_counts, "total": len(out)}


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
    await affiliate_on_order_reversed(order_id, full=(new_refunded >= total))
    # Coupon decrement on full refund.
    if new_refunded >= total:
        c = order.get("coupon")
        if c and c.get("code") and order.get("coupon_counted"):
            await db.coupons.update_one(
                {"code": c["code"], "used_count": {"$gt": 0}},
                {"$inc": {"used_count": -1}},
            )
            email_norm = (order.get("email") or "").strip().lower()
            if email_norm:
                await db.coupons.update_one(
                    {"code": c["code"], "used_by.email": email_norm, "used_by.count": {"$gt": 0}},
                    {"$inc": {"used_by.$.count": -1}},
                )
            await db.orders.update_one({"id": order_id}, {"$set": {"coupon_counted": False}})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    provider_refund_id = (
        updated.get("provider_refund_id")
        or (updated.get("payment_info") or {}).get("provider_refund_id")
        or ((updated.get("payment_info") or {}).get("provider_response") or {}).get("refund_id")
    )
    if updated.get("email") and provider_refund_id:
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
    for it in _order_items(order):
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
        # Coût réel de l'étiquette côté transporteur (pas le montant client).
        "cost": await _canada_post_shipment_price(res["shipment_id"], preferred_service_code=payload.service_code),
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


@api.get("/admin/shipping/config-status")
async def admin_shipping_config_status(_admin: dict = Depends(require_area("shipping", "view"))):
    """Expose un état lisible de la config Postes Canada (sans secrets)
    pour faciliter le diagnostic côté interface admin."""
    using_openapi = _cp_use_openapi()
    mailed_by, mobo = _cp_path_customers()
    missing_required = []
    if using_openapi:
        if not mailed_by:
            missing_required.append("CANADA_POST_MAILED_BY/CANADA_POST_CUSTOMER_NUMBER")
        if not mobo:
            missing_required.append("CANADA_POST_MOBO/CANADA_POST_CUSTOMER_NUMBER")
        if not CANADA_POST_ORIGIN_POSTAL_CODE:
            missing_required.append("CANADA_POST_ORIGIN_POSTAL_CODE")
        if not CANADA_POST_OAUTH_CLIENT_ID:
            missing_required.append("CANADA_POST_OAUTH_CLIENT_ID")
        if not CANADA_POST_OAUTH_CLIENT_SECRET:
            missing_required.append("CANADA_POST_OAUTH_CLIENT_SECRET")
    else:
        if not CANADA_POST_API_KEY:
            missing_required.append("CANADA_POST_API_KEY")
        if not CANADA_POST_CUSTOMER_NUMBER:
            missing_required.append("CANADA_POST_CUSTOMER_NUMBER")
        if not CANADA_POST_ORIGIN_POSTAL_CODE:
            missing_required.append("CANADA_POST_ORIGIN_POSTAL_CODE")

    return {
        "configured": is_canada_post_configured(),
        "api_mode": CANADA_POST_API_MODE,
        "using_openapi": using_openapi,
        "environment": CANADA_POST_ENVIRONMENT,
        "base_url": CANADA_POST_OPENAPI_BASE_URL if using_openapi else CANADA_POST_BASE_URL,
        "has_legacy_api_key": bool(CANADA_POST_API_KEY),
        "has_customer_number": bool(CANADA_POST_CUSTOMER_NUMBER),
        "has_origin_postal_code": bool(CANADA_POST_ORIGIN_POSTAL_CODE),
        "has_oauth_client_id": bool(CANADA_POST_OAUTH_CLIENT_ID),
        "has_oauth_client_secret": bool(CANADA_POST_OAUTH_CLIENT_SECRET),
        "has_platform_id": bool(CANADA_POST_PLATFORM_ID),
        "has_mailed_by": bool(mailed_by),
        "has_mobo": bool(mobo),
        "missing_required": missing_required,
    }


@api.post("/admin/shipping/backfill-label-costs")
async def admin_backfill_label_costs(limit: int = 300,
                                     force: bool = False,
                                     _admin: dict = Depends(require_area("shipping", "manage"))):
    """Récupère le coût réel des étiquettes existantes via shipment_id.

    - force=False: ne traite que les commandes sans shipping_info.cost
    - force=True: recalcule même si un coût est déjà présent
    """
    if not _cp_use_openapi():
        raise HTTPException(400, "Label cost backfill requires Canada Post OpenAPI mode")

    safe_limit = max(1, min(int(limit or 1), 2000))
    base_filter = {
        "shipping_info.cp_shipment_id": {"$nin": [None, ""]},
    }
    if not force:
        base_filter["$or"] = [
            {"shipping_info.cost": {"$exists": False}},
            {"shipping_info.cost": None},
            {"shipping_info.cost": {}},
        ]

    rows = await db.orders.find(
        base_filter,
        {"_id": 0, "id": 1, "order_number": 1, "shipping_info": 1},
    ).sort("created_at", -1).to_list(safe_limit)

    updated = 0
    unchanged = 0
    failed = []
    for o in rows:
        info = o.get("shipping_info") or {}
        shipment_id = info.get("cp_shipment_id")
        if not shipment_id:
            unchanged += 1
            continue

        try:
            price = await _canada_post_shipment_price(str(shipment_id))
            if not price:
                unchanged += 1
                continue

            await db.orders.update_one(
                {"id": o["id"]},
                {"$set": {"shipping_info.cost": price,
                          "shipping_info.cost_refreshed_at": datetime.now(timezone.utc).isoformat()}},
            )
            updated += 1
        except Exception as ex:
            failed.append({
                "order_id": o.get("id"),
                "order_number": o.get("order_number"),
                "error": str(ex),
            })

    return {
        "ok": True,
        "processed": len(rows),
        "updated": updated,
        "unchanged": unchanged,
        "failed": failed,
        "limit": safe_limit,
        "force": force,
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
        # Détails de coût du manifeste : total réellement facturé par Postes
        # Canada pour la journée (rapprochement comptable).
        cost_details = None
        for href in manifests:
            cost_details = await _canada_post_manifest_details(href)
            if cost_details:
                break
        await db.manifests.insert_one({
            "id": str(uuid.uuid4()),
            "group_ids": done_groups,
            "manifest_links": manifests,
            "cost": cost_details,
            # Date du lot (TZ cutoff) : permet de retrouver le manifeste du jour.
            "dispatch_date": _local_today_iso(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    if not done_groups:
        raise HTTPException(502, "No manifest could be transmitted — check the Canada Post logs.")
    return {"ok": True, "transmitted_groups": done_groups, "manifests": manifests, "orders_marked": marked}


@api.get("/admin/dispatch/{date}/manifest.pdf")
async def admin_dispatch_manifest_pdf(date: str,
                                      _admin: dict = Depends(require_area("orders", "view"))):
    """Manifeste(s) transmis pour la date donnée.
    Priorité: 1) PDF local sauvegardé, 2) hrefs CP en direct, 3) récapitulatif interne."""
    docs = await db.manifests.find({"dispatch_date": date}, {"_id": 0}).sort("created_at", 1).to_list(50)
    if not docs:
        raise HTTPException(404, "Aucun manifeste transmis pour cette date.")

    # 1) PDF déjà téléchargé localement (par retry-manifest)
    for d in docs:
        local_url = d.get("local_pdf_url") or ""
        if local_url and local_url.startswith("/uploads/labels/"):
            fpath = LABEL_UPLOAD_DIR / local_url.split("/")[-1]
            if fpath.exists():
                return Response(
                    content=fpath.read_bytes(),
                    media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="manifeste-{date}.pdf"'},
                )

    # 2) Hrefs CP disponibles — tentative de téléchargement direct
    hrefs = []
    for d in docs:
        for h in (d.get("manifest_links") or []):
            if h and h not in hrefs:
                hrefs.append(h)

    pdfs = []
    for href in hrefs:
        try:
            r = await _cp_openapi_call("GET", href, accept="application/pdf")
            if r.status_code < 400 and r.content:
                pdfs.append(r.content)
        except Exception as ex:  # pragma: no cover
            logging.error("manifest artifact failed (%s): %s", href, ex)

    if pdfs:
        merged = _merge_pdfs(pdfs) if len(pdfs) > 1 else pdfs[0]
        return Response(
            content=merged,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="manifeste-{date}.pdf"'},
        )

    # 3) Fallback : récapitulatif interne des commandes du lot
    orders = await db.orders.find(
        {"payment_status": "paid", "dispatch_batch": date,
         "shipping_info.label_url": {"$nin": [None, ""]}},
        {"_id": 0, "order_number": 1, "shipping_info": 1, "shipping_address": 1, "total": 1},
    ).sort("created_at", 1).to_list(500)
    if not orders:
        raise HTTPException(404, "Aucune commande étiquetée pour cette date.")

    lines = [
        f"<h1>Manifeste — lot du {date}</h1>",
        f"<p style='font-size:11px;color:#888'>Récapitulatif interne — utilisez « Récupérer manifeste CP » pour le document officiel</p>",
        "<table style='width:100%;border-collapse:collapse;font-family:monospace;font-size:11px'>",
        "<tr style='background:#f0f0f0'><th style='padding:4px;border:1px solid #ccc'>Commande</th>"
        "<th style='padding:4px;border:1px solid #ccc'>Destinataire</th>"
        "<th style='padding:4px;border:1px solid #ccc'>Suivi</th>"
        "<th style='padding:4px;border:1px solid #ccc'>Total</th></tr>",
    ]
    total_sum = 0.0
    for o in orders:
        info = o.get("shipping_info") or {}
        addr = o.get("shipping_address") or {}
        dest = f"{addr.get('full_name', '')} — {addr.get('city', '')}, {addr.get('province', '')}"
        pin = info.get("tracking_number", "")
        total = o.get("total") or 0
        total_sum += float(total)
        lines.append(
            f"<tr><td style='padding:4px;border:1px solid #ccc'>{o.get('order_number','')}</td>"
            f"<td style='padding:4px;border:1px solid #ccc'>{dest}</td>"
            f"<td style='padding:4px;border:1px solid #ccc'>{pin}</td>"
            f"<td style='padding:4px;border:1px solid #ccc;text-align:right'>${float(total):.2f}</td></tr>"
        )
    lines += [
        f"<tr style='font-weight:bold'><td colspan='3' style='padding:4px;border:1px solid #ccc;text-align:right'>Total</td>"
        f"<td style='padding:4px;border:1px solid #ccc;text-align:right'>${total_sum:.2f}</td></tr>",
        "</table>",
        f"<p style='font-size:10px;margin-top:12px'>{len(orders)} envoi(s) · Postes Canada — transmis le {date}</p>",
    ]
    html = (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<style>body{font-family:sans-serif;margin:24px;color:#111}</style></head>"
        f"<body>{''.join(lines)}</body></html>"
    )
    from weasyprint import HTML as WP
    try:
        pdf_bytes = WP(string=html).write_pdf()
    except Exception:
        return Response(
            content=html.encode("utf-8"),
            media_type="text/html",
            headers={"Content-Disposition": f'inline; filename="manifeste-{date}.html"'},
        )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="manifeste-{date}.pdf"'},
    )


@api.post("/admin/dispatch/{date}/retry-manifest")
async def admin_retry_manifest(date: str,
                               _admin: dict = Depends(require_area("orders", "manage"))):
    """Récupère le manifeste officiel Postes Canada pour la date donnée.
    Appelle GET /manifests pour lister les vrais hrefs existants, puis
    télécharge le PDF via le flux en 2 étapes (JSON → artifact → PDF).
    N'essaie pas de re-transmettre les lots déjà transmis."""
    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")
    if not _cp_use_openapi():
        raise HTTPException(400, "retry-manifest nécessite le mode OpenAPI")

    mailed_by, mobo = _cp_path_customers()

    # Étape 1: lister les manifests existants via GET /manifests
    try:
        r = await _cp_openapi_call("GET", f"/{mailed_by}/{mobo}/manifests")
    except Exception as ex:
        raise HTTPException(502, f"Impossible de contacter Canada Post: {ex}")
    if r.status_code >= 400:
        raise HTTPException(502, f"Canada Post GET /manifests {r.status_code}: {_cp_error_detail(r)}")

    raw = r.json() if r.headers.get("content-type","").startswith("application/json") else []
    if not isinstance(raw, list):
        raw = []
    manifest_hrefs = [l.get("href") for l in raw
                      if isinstance(l, dict) and l.get("rel") == "manifest" and l.get("href")]
    if not manifest_hrefs:
        # Fallback: essayer aussi les hrefs stockés en base pour cette date
        manifest_doc = await db.manifests.find_one({"dispatch_date": date}, {"_id": 0})
        stored_hrefs = [h for h in (manifest_doc or {}).get("manifest_links", [])
                        if h and "workgroup1" not in h and "0000000001" not in h]
        manifest_hrefs = stored_hrefs

    if not manifest_hrefs:
        raise HTTPException(404, "Aucun manifeste trouvé auprès de Canada Post pour cette date.")

    # Étape 2: télécharger le PDF de chaque manifest et sauvegarder le premier valide
    local_pdf_url: Optional[str] = None
    for href in manifest_hrefs:
        pdf_url = await _canada_post_get_manifest_artifact_openapi(href, date)
        if pdf_url:
            local_pdf_url = pdf_url
            logging.info("Manifest PDF saved for %s: %s", date, pdf_url)
            break

    # Mettre à jour le document manifeste en base
    now = datetime.now(timezone.utc).isoformat()
    group_ids = await db.orders.distinct(
        "shipping_info.cp_group_id",
        {"payment_status": "paid", "dispatch_batch": date,
         "shipping_info.cp_group_id": {"$nin": [None, ""]}}
    )
    await db.manifests.update_one(
        {"dispatch_date": date},
        {"$set": {
            "manifest_links": manifest_hrefs,
            "local_pdf_url": local_pdf_url,
            "refreshed_at": now,
            **({"group_ids": group_ids} if group_ids else {}),
        }},
        upsert=True,
    )

    return {
        "ok": True,
        "date": date,
        "manifest_hrefs": manifest_hrefs,
        "local_pdf_url": local_pdf_url,
        "pdf_source": "cp" if local_pdf_url else "fallback",
    }


@api.get("/admin/dispatch/{date}/manifest-status")
async def admin_dispatch_manifest_status(date: str,
                                         _admin: dict = Depends(require_area("orders", "view"))):
    """Indique si un manifeste a été transmis pour cette date (pilote le bouton
    de téléchargement dans l'écran Dispatch)."""
    count = await db.manifests.count_documents({"dispatch_date": date})
    # Vérifie aussi si le PDF manifeste est déjà sauvegardé localement
    doc = await db.manifests.find_one({"dispatch_date": date}, {"_id": 0})
    local_pdf = (doc or {}).get("local_pdf_url")
    return {"date": date, "transmitted": count > 0, "manifests": count, "local_pdf_url": local_pdf}


# ---------------------------------------------------------------------------
# Dispatch batch — traitement des commandes payées par fenêtre journalière
# (cutoff 13h ET). Modèle ShipStation : on regroupe par dispatch_batch, on
# génère toutes les étiquettes d'un lot en une passe, puis on transmet le
# manifeste une fois par jour (voir /admin/shipping/transmit).
# ---------------------------------------------------------------------------
def _iso_day_shift(day: str, delta: int) -> str:
    """Renvoie la date ISO décalée de <delta> jours (bornes de recherche UTC)."""
    try:
        d = datetime.strptime(day, "%Y-%m-%d").date() + timedelta(days=delta)
        return d.isoformat()
    except Exception:
        return day


def _local_today_iso() -> str:
    """Date locale (ORDER_CUTOFF_TZ) au format YYYY-MM-DD."""
    return datetime.now(ZoneInfo(ORDER_CUTOFF_TZ)).date().isoformat()


class DispatchLabelsIn(BaseModel):
    service_code: str = Field(default="DOM.EP", min_length=1, max_length=40)


@api.get("/admin/dispatch/today")
async def admin_dispatch_today(date: Optional[str] = None,
                               service_code: Optional[str] = None,
                               _admin: dict = Depends(require_area("orders", "view"))):
    """File d'expédition du jour : commandes payées dont le dispatch_batch
    tombe le <date> (défaut = aujourd'hui, TZ cutoff)."""
    day = date or _local_today_iso()
    cursor = db.orders.find(
        {
            "payment_status": "paid",
            "$or": [
                {
                    # File de travail : ce qui reste à traiter pour ce lot.
                    "dispatch_batch": day,
                    "fulfillment_status": {"$in": ["processing", "pending", "packed", "shipped"]},
                },
                {
                    # HISTORIQUE : étiquettes réellement émises ce jour-là.
                    # Indispensable car le report de minuit modifie
                    # dispatch_batch, alors que shipped_at ne bouge jamais.
                    # Fenêtre élargie (J-1 → J+1) car shipped_at est en UTC :
                    # le tri fin par heure locale est fait plus bas.
                    "shipping_info.shipped_at": {"$gte": _iso_day_shift(day, -1),
                                                 "$lte": _iso_day_shift(day, 1) + "T23:59:59"},
                },
            ],
        },
        {"_id": 0},
    ).sort("created_at", 1)
    orders = await cursor.to_list(2000)

    to_label, labeled = [], []
    selected_service = (service_code or CANADA_POST_DEFAULT_SERVICE_CODE or "DOM.EP").strip().upper()
    rate_cache: dict[tuple, Any] = {}

    # Charger les emballages actifs une seule fois pour tout le lot.
    available_boxes = await db.shipping_boxes.find(
        {"deleted_at": None, "active": True}, {"_id": 0}
    ).sort("max_units", 1).to_list(200)

    for o in orders:
        info = o.get("shipping_info") or {}
        cost_due = (info.get("cost") or {}).get("due_amount")
        row = {
            "id": o["id"],
            "order_number": o.get("order_number"),
            "email": o.get("email"),
            "items": len(o.get("items", [])),
            "total": o.get("total"),
            "shipping_charged": o.get("shipping"),
            "city": (o.get("shipping_address") or {}).get("city"),
            "province": (o.get("shipping_address") or {}).get("province"),
            "tracking_number": info.get("tracking_number") or "",
            "label_url": info.get("label_url") or "",
            "cp_transmitted": bool(info.get("cp_transmitted")),
            # Coût réel facturé par Postes Canada pour cette étiquette.
            "cost_due": cost_due,
            "rated_weight_kg": (info.get("cost") or {}).get("rated_weight_kg"),
            # Champ unifié pour affichage ligne par ligne dans Dispatch.
            "line_label_cost": cost_due,
            "line_label_cost_source": "actual_cp" if cost_due is not None else None,
        }
        # « Étiquetées » = étiquettes émises CE JOUR (shipped_at), pas les
        # Critère principal : dispatch_batch == day (lot commandé ce jour).
        # Critère secondaire : shipped_at tombe ce jour en heure locale.
        # Les deux sont valides — évite la perte silencieuse des commandes dont
        # shipped_at est en UTC (ex. 00h32 UTC = veille en heure locale).
        shipped_at = info.get("shipped_at") or ""
        labeled_today = o.get("dispatch_batch") == day  # critère primaire
        if not labeled_today and shipped_at:
            try:
                shipped_dt = datetime.fromisoformat(shipped_at.replace("Z", "+00:00"))
                if shipped_dt.tzinfo is None:
                    shipped_dt = shipped_dt.replace(tzinfo=timezone.utc)
                labeled_today = shipped_dt.astimezone(ZoneInfo(ORDER_CUTOFF_TZ)).date().isoformat() == day
            except Exception:
                labeled_today = shipped_at.startswith(day)
        if row["label_url"] and row["tracking_number"]:
            if labeled_today:
                labeled.append(row)
        else:
            # Estimation du prix Canada Post (avant création réelle d'étiquette)
            # selon le service sélectionné dans l'écran Dispatch.
            row["estimated_cost_due"] = None
            row["estimated_eta_days"] = None
            if is_canada_post_configured():
                ship = o.get("shipping_address") or {}
                dest_pc = str(ship.get("postal_code") or "").replace(" ", "").upper()
                dest_country = str(ship.get("country") or "CA").upper()
                weight_kg = _order_weight_kg(o)
                if _cp_use_openapi():
                    cache_key = ("openapi", o.get("id"), selected_service)
                    if cache_key not in rate_cache:
                        rate_cache[cache_key] = await _canada_post_estimate_openapi(o, selected_service, weight_kg)
                    chosen = rate_cache.get(cache_key)
                    if chosen is not None:
                        row["estimated_cost_due"] = chosen.get("cost_cad")
                        row["estimated_eta_days"] = chosen.get("eta_days")
                        row["line_label_cost"] = chosen.get("cost_cad")
                        chosen_code = str(chosen.get("service_code") or "").upper()
                        row["line_label_cost_source"] = (
                            "estimated_cp"
                            if (not chosen_code) or (chosen_code == selected_service)
                            else "estimated_cp_alt"
                        )
                else:
                    cache_key = (dest_pc, dest_country, weight_kg)
                    if cache_key not in rate_cache:
                        rate_cache[cache_key] = await _canada_post_get_rates(dest_pc, dest_country, weight_kg)
                    rates = rate_cache.get(cache_key) or []
                    chosen = next((r for r in rates if str(r.get("service_code") or "").upper() == selected_service), None)
                    # Si le service exact n'est pas renvoyé, on prend un devis CP
                    # alternatif plutôt qu'un montant checkout interne.
                    if chosen is None and rates:
                        chosen = rates[0]
                    if chosen is not None:
                        row["estimated_cost_due"] = chosen.get("cost_cad")
                        row["estimated_eta_days"] = chosen.get("eta_days")
                        row["line_label_cost"] = chosen.get("cost_cad")
                        chosen_code = str(chosen.get("service_code") or "").upper()
                        row["line_label_cost_source"] = (
                            "estimated_cp"
                            if chosen_code == selected_service
                            else "estimated_cp_alt"
                        )
            # Emballage sélectionné (auto ou override) pour cette commande.
            chosen_box = await _select_box_for_order(o, all_boxes=available_boxes)
            row["box_id"] = chosen_box.get("id") if chosen_box else None
            row["box_name"] = chosen_box.get("name") if chosen_box else None
            to_label.append(row)

    overdue = await db.orders.count_documents({
        "payment_status": "paid",
        "dispatch_batch": {"$lt": day},
        "fulfillment_status": {"$in": ["processing", "pending"]},
    })
    # Bilan financier du jour (règle métier Dispatch) :
    # - estimated_labels_total: somme des coûts par ligne de commande affichée
    #   dans Dispatch ("à étiqueter" + "étiquetées").
    # - customer_charged_total: somme des frais facturés aux clients (champ shipping de la facture)
    # - gap_total: écart = manifeste total dû - facturé aux clients
    dispatch_lines = [*to_label, *labeled]
    estimated_labels_total = round(
        sum(float(r.get("line_label_cost") or 0) for r in dispatch_lines if r.get("line_label_cost") is not None),
        2,
    )
    customer_charged_total = round(sum(float(r.get("shipping_charged") or 0) for r in labeled), 2)
    manifest_doc = await db.manifests.find_one({"dispatch_date": day}, {"_id": 0}, sort=[("created_at", -1)])
    manifest_total_due = None
    try:
        manifest_total_due = float(((manifest_doc or {}).get("cost") or {}).get("total_due"))
    except Exception:
        manifest_total_due = None
    gap_total = (round(manifest_total_due - customer_charged_total, 2)
                 if manifest_total_due is not None else None)
    return {
        "date": day,
        "configured": is_canada_post_configured(),
        "totals": {
            "labels_cost": estimated_labels_total,
            "shipping_charged": round(sum(float(r.get("cost_due") or 0) for r in labeled), 2),
            "customer_shipping_charged": customer_charged_total,
            "margin": gap_total,
            "manifest": (manifest_doc or {}).get("cost"),
        },
        "counts": {"to_label": len(to_label), "labeled": len(labeled), "overdue": overdue},
        "to_label": to_label,
        "labeled": labeled,
        "available_boxes": [
            {"id": b.get("id"), "name": b.get("name"), "max_units": b.get("max_units"),
             "tare_grams": b.get("tare_grams"), "length_cm": b.get("length_cm"),
             "width_cm": b.get("width_cm"), "height_cm": b.get("height_cm")}
            for b in available_boxes
        ],
    }


class OrderShippingBoxIn(BaseModel):
    box_id: Optional[str] = None  # None = réinitialiser à la sélection automatique


@api.patch("/admin/orders/{order_id}/shipping-box")
async def admin_order_set_shipping_box(
    order_id: str,
    payload: OrderShippingBoxIn,
    _admin: dict = Depends(require_area("orders", "manage")),
):
    """Définit (ou réinitialise) l'emballage d'une commande en vue de l'étiquetage."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")

    if payload.box_id:
        box = await db.shipping_boxes.find_one({"id": payload.box_id, "active": True, "deleted_at": None}, {"_id": 0})
        if not box:
            raise HTTPException(404, "Packaging not found or inactive")
        await db.orders.update_one({"id": order_id}, {"$set": {"shipping_box_override_id": payload.box_id}})
        return {"order_id": order_id, "box_id": payload.box_id, "box_name": box.get("name")}
    else:
        await db.orders.update_one({"id": order_id}, {"$unset": {"shipping_box_override_id": ""}})
        return {"order_id": order_id, "box_id": None, "box_name": None}


@api.post("/admin/orders/{order_id}/dispatch/refresh-estimate")
async def admin_order_refresh_dispatch_estimate(
    order_id: str,
    service_code: Optional[str] = None,
    _admin: dict = Depends(require_area("orders", "view")),
):
    """Recalcule l'estimation CP d'une ligne Dispatch avec le poids produits + tare emballage."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Order not found")

    selected_service = (service_code or CANADA_POST_DEFAULT_SERVICE_CODE or "DOM.EP").strip().upper()
    chosen_box = await _select_box_for_order(order)
    products_weight_kg = _order_weight_kg(order)
    box_tare_kg = round(float((chosen_box or {}).get("tare_grams") or 0.0) / 1000.0, 3)
    total_weight_kg = max(0.1, round(products_weight_kg + box_tare_kg, 3))

    out = {
        "order_id": order_id,
        "service_requested": selected_service,
        "line_label_cost": None,
        "line_label_cost_source": None,
        "estimated_cost_due": None,
        "estimated_eta_days": None,
        "box_id": (chosen_box or {}).get("id"),
        "box_name": (chosen_box or {}).get("name"),
        "products_weight_kg": products_weight_kg,
        "box_tare_kg": box_tare_kg,
        "packaged_weight_kg": total_weight_kg,
    }

    if not is_canada_post_configured():
        return out

    ship = order.get("shipping_address") or {}
    dest_pc = str(ship.get("postal_code") or "").replace(" ", "").upper()
    dest_country = str(ship.get("country") or "CA").upper()

    if _cp_use_openapi():
        chosen = await _canada_post_estimate_openapi(order, selected_service, products_weight_kg)
    else:
        rates = await _canada_post_get_rates(dest_pc, dest_country, total_weight_kg)
        chosen = next((r for r in rates if str(r.get("service_code") or "").upper() == selected_service), None)
        if chosen is None and rates:
            chosen = rates[0]

    if chosen is None:
        return out

    out["estimated_cost_due"] = chosen.get("cost_cad")
    out["estimated_eta_days"] = chosen.get("eta_days")
    out["line_label_cost"] = chosen.get("cost_cad")
    chosen_code = str(chosen.get("service_code") or "").upper()
    out["line_label_cost_source"] = "estimated_cp" if (not chosen_code) or (chosen_code == selected_service) else "estimated_cp_alt"
    return out


@api.post("/admin/dispatch/{date}/labels")
async def admin_dispatch_labels(date: str, payload: DispatchLabelsIn,
                                _admin: dict = Depends(require_area("orders", "manage"))):
    """Génère en une passe les étiquettes des commandes payées du lot <date>
    qui n'en ont pas encore. Idempotent : commande déjà étiquetée = sautée."""
    if not is_canada_post_configured():
        raise HTTPException(503, "Canada Post is not configured")

    orders = await db.orders.find(
        {
            "payment_status": "paid",
            "dispatch_batch": date,
            "fulfillment_status": {"$in": ["processing", "pending", "packed"]},
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(2000)

    created, skipped, failed = [], [], []
    for order in orders:
        info = order.get("shipping_info") or {}
        if info.get("label_url") and info.get("tracking_number"):
            skipped.append({"order_number": order.get("order_number"),
                            "tracking_number": info["tracking_number"],
                            "label_url": info["label_url"]})
            continue
        try:
            res = await _canada_post_create_shipment(order, payload.service_code, _order_weight_kg(order))
            label_url = await _canada_post_get_artifact(res["label_href"], order["id"])
            now = datetime.now(timezone.utc).isoformat()
            shipping_info = {
                **info,
                "carrier": "Canada Post",
                "tracking_number": res["pin"],
                "label_url": label_url,
                "cp_shipment_id": res["shipment_id"],
                "cost": await _canada_post_shipment_price(res["shipment_id"], preferred_service_code=payload.service_code),
                "cp_group_id": res["group_id"],
                "cp_transmitted": False,
                "service_code": payload.service_code,
                "shipped_at": now,
            }
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {"shipping_info": shipping_info, "fulfillment_status": "shipped"},
                 "$push": {"notes": {
                     "id": str(uuid.uuid4()),
                     "text": f"Étiquette Postes Canada créée (lot {date}) — suivi {res['pin']}.",
                     "author": "system",
                     "created_at": now,
                 }}},
            )
            fresh = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
            asyncio.create_task(send_shipping_notification(fresh))
            created.append({"order_number": order.get("order_number"),
                            "tracking_number": res["pin"],
                            "label_url": label_url})
        except HTTPException as ex:
            failed.append({"order_number": order.get("order_number"), "error": ex.detail})
        except Exception as ex:
            logging.error("[dispatch] label failed for %s: %s", order.get("order_number"), ex)
            failed.append({"order_number": order.get("order_number"), "error": str(ex)})

    all_labels = [c["label_url"] for c in created] + [s["label_url"] for s in skipped]
    return {
        "date": date,
        "created": created,
        "skipped": skipped,
        "failed": failed,
        "label_urls": all_labels,
        "counts": {"created": len(created), "skipped": len(skipped), "failed": len(failed)},
    }


def _merge_pdfs(pdf_bytes_list: list) -> bytes:
    """Fusionne plusieurs PDF en un seul. Requiert pypdf."""
    from pypdf import PdfWriter, PdfReader
    import io
    writer = PdfWriter()
    for b in pdf_bytes_list:
        if not b:
            continue
        reader = PdfReader(io.BytesIO(b))
        for page in reader.pages:
            writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


async def _dispatch_labeled_orders(date: str) -> list:
    """Commandes du lot <date> déjà étiquetées (label_url présent), triées."""
    return await db.orders.find(
        {
            "payment_status": "paid",
            "dispatch_batch": date,
            "shipping_info.label_url": {"$nin": [None, ""]},
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(2000)


@api.get("/admin/dispatch/{date}/labels.pdf")
async def admin_dispatch_labels_pdf(date: str, _admin: dict = Depends(require_area("orders", "view"))):
    """Toutes les étiquettes du lot fusionnées en UN pdf 4x6 (imprimante thermique)."""
    orders = await _dispatch_labeled_orders(date)
    pdfs = []
    for o in orders:
        url = (o.get("shipping_info") or {}).get("label_url") or ""
        if url.startswith("/uploads/labels/"):
            fpath = LABEL_UPLOAD_DIR / url.split("/")[-1]
            if fpath.exists():
                pdfs.append(fpath.read_bytes())
    if not pdfs:
        raise HTTPException(404, "Aucune étiquette pour ce lot.")
    merged = _merge_pdfs(pdfs)
    return Response(
        content=merged,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="etiquettes-{date}.pdf"'},
    )


@api.get("/admin/dispatch/{date}/packing-slips.pdf")
async def admin_dispatch_slips_pdf(date: str, _admin: dict = Depends(require_area("orders", "view"))):
    """Tous les bons de commande du lot fusionnés en UN pdf (imprimante papier)."""
    orders = await _dispatch_labeled_orders(date)
    pdfs = [_generate_invoice_pdf(o) for o in orders]
    pdfs = [p for p in pdfs if p]
    if not pdfs:
        raise HTTPException(404, "Aucun bon de commande pour ce lot.")
    merged = _merge_pdfs(pdfs)
    return Response(
        content=merged,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="bons-{date}.pdf"'},
    )


# ===========================================================================
# POSTE D'EXPÉDITION « FIRONOVA FULFILLMENT » — Phase 1 (v2, amélioré)
#   payé → processing (à préparer) → packing → packed → shipped (étiqueté)
# Améliorations v2 :
#  - capte aussi les commandes payées SANS dispatch_batch (rétro-remplissage
#    à la volée) : plus de commande « fantôme » invisible dans Journée ;
#  - avance groupée d'une colonne entière ;
#  - retards remontés en tête de colonne.
# ===========================================================================
FULFILLMENT_FLOW = ["processing", "packing", "packed", "shipped", "delivered"]
FULFILLMENT_LABELS = {
    "processing": {"fr": "À préparer", "en": "To prepare"},
    "packing":    {"fr": "En préparation", "en": "Preparing"},
    "packed":     {"fr": "Empaquetée", "en": "Packed"},
    "shipped":    {"fr": "Étiquetée", "en": "Labeled"},
    "delivered":  {"fr": "Livrée", "en": "Delivered"},
}


class FulfillmentTransitionIn(BaseModel):
    to: str = Field(min_length=1)


class FulfillmentBulkIn(BaseModel):
    date: str = Field(min_length=1)
    from_status: str = Field(min_length=1)
    to: str = Field(min_length=1)


def _order_items(order: dict) -> list:
    """Articles d'une commande. Les commandes sont stockées avec la clé
    "items" ; on accepte aussi "line_items" par compatibilité."""
    return order.get("items") or order.get("line_items") or []


def _picking_lines(order: dict) -> list:
    out = []
    for it in _order_items(order):
        out.append({
            "sku": it.get("sku") or "",
            "slug": it.get("slug") or "",
            "name_en": it.get("name_en") or "",
            "name_fr": it.get("name_fr") or "",
            "variant_name": it.get("variant_name") or "",
            "qty": int(it.get("qty") or 1),
        })
    return out


async def _fulfillment_backfill_batches(day: str) -> None:
    """Répare les commandes payées sans dispatch_batch (créées avant la logique
    de lot, ou par un flux qui ne l'a pas posé). Sans ça elles restent
    invisibles dans Journée."""
    cursor = db.orders.find(
        {
            "payment_status": "paid",
            "fulfillment_status": {"$in": ["processing", "packing", "packed"]},
            "$or": [{"dispatch_batch": {"$in": [None, ""]}}, {"dispatch_batch": {"$exists": False}}],
        },
        {"_id": 0, "id": 1, "paid_at": 1, "created_at": 1},
    )
    async for o in cursor:
        ref = o.get("paid_at") or o.get("created_at") or datetime.now(timezone.utc).isoformat()
        try:
            batch = compute_dispatch_batch(ref)
        except Exception:
            batch = day
        await db.orders.update_one({"id": o["id"]}, {"$set": {"dispatch_batch": batch}})


@api.get("/admin/fulfillment/day")
async def admin_fulfillment_day(date: Optional[str] = None,
                                _admin: dict = Depends(require_area("orders", "view"))):
    """Tableau de bord « Journée » : lot du jour ventilé par étape physique."""
    def _is_local_day(ts: str, target_day: str) -> bool:
        if not ts:
            return False
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(ZoneInfo(ORDER_CUTOFF_TZ)).date().isoformat() == target_day
        except Exception:
            return ts.startswith(target_day)

    day = date or _local_today_iso()
    await _fulfillment_backfill_batches(day)

    # Étapes en cours : on inclut les retards (<= jour) pour ne rien perdre.
    # Historique journalier : bornes calculées dans le fuseau local métier,
    # puis converties en UTC pour interroger les timestamps stockés.
    local_tz = ZoneInfo(ORDER_CUTOFF_TZ)
    day_local_start = datetime.fromisoformat(day).replace(tzinfo=local_tz)
    day_local_end = day_local_start + timedelta(days=1)
    day_start_utc = day_local_start.astimezone(timezone.utc).isoformat()
    day_end_utc = day_local_end.astimezone(timezone.utc).isoformat()
    orders = await db.orders.find(
        {
            "payment_status": "paid",
            "$or": [
                {
                    # À préparer / en préparation : retards inclus pour qu'une
                    # commande oubliée ne disparaisse jamais de l'écran.
                    "dispatch_batch": {"$lte": day},
                    "fulfillment_status": {"$in": ["processing", "packing"]},
                },
                {
                    # Empaquetée : historique du jour. On se base sur packed_at
                    # (et non sur le statut) pour que la commande RESTE visible
                    # même après l'émission de son étiquette dans Dispatch.
                    "packed_at": {"$gte": day_start_utc, "$lt": day_end_utc},
                },
                {
                    # Commandes étiquetées ce jour dans Dispatch (même logique
                    # métier que l'écran Dispatch pour éviter les écarts de
                    # comptage entre les deux vues).
                    "dispatch_batch": day,
                    "fulfillment_status": "shipped",
                    "shipping_info.label_url": {"$nin": [None, ""]},
                    "shipping_info.tracking_number": {"$nin": [None, ""]},
                    "shipping_info.shipped_at": {"$gte": day_start_utc, "$lt": day_end_utc},
                },
            ],
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(3000)

    buckets = {"processing": [], "packing": [], "packed": []}
    for o in orders:
        st = o.get("fulfillment_status")
        info = o.get("shipping_info") or {}
        has_label = bool(info.get("label_url") and info.get("tracking_number"))
        packed_today = _is_local_day(o.get("packed_at") or "", day)
        labeled_today = has_label and _is_local_day(info.get("shipped_at") or "", day)
        # Une commande empaquetée aujourd'hui reste dans « Empaquetée » même
        # une fois étiquetée (shipped) : c'est l'historique de la journée.
        if packed_today or labeled_today:
            st = "packed"
        if st not in buckets:
            continue
        addr = o.get("shipping_address") or {}
        buckets[st].append({
            "id": o["id"],
            "order_number": o.get("order_number"),
            "email": o.get("email"),
            "created_at": o.get("created_at"),
            "dispatch_batch": o.get("dispatch_batch"),
            "units": sum(int(i.get("qty") or 1) for i in _order_items(o)),
            "items": len(_order_items(o)),
            "total": o.get("total"),
            "city": addr.get("city"),
            "province": addr.get("province"),
            "tracking_number": info.get("tracking_number") or "",
            "label_url": info.get("label_url") or "",
            "picking": _picking_lines(o),
            "is_overdue": bool(o.get("dispatch_batch") and o["dispatch_batch"] < day),
        })

    # Retards en tête de chaque colonne.
    for k in buckets:
        buckets[k].sort(key=lambda r: (not r["is_overdue"], r["created_at"] or ""))

    counts = {k: len(v) for k, v in buckets.items()}
    counts["total"] = sum(counts.values())
    counts["overdue"] = sum(1 for k in buckets for r in buckets[k] if r["is_overdue"])
    return {
        "date": day,
        "configured": is_canada_post_configured(),
        "labels": {k: FULFILLMENT_LABELS[k] for k in buckets},
        "counts": counts,
        "buckets": buckets,
    }


async def _advance_one(order: dict, target: str, admin_email: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    ts_field = {"packing": "packing_at", "packed": "packed_at"}.get(target)
    update = {"fulfillment_status": target}
    if ts_field:
        update[ts_field] = now
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": update,
         "$push": {"notes": {
             "id": str(uuid.uuid4()),
             "text": f"Préparation : {FULFILLMENT_LABELS.get(target, {}).get('fr', target)}.",
             "author": admin_email,
             "created_at": now,
         }}},
    )


@api.post("/admin/fulfillment/{order_id}/advance")
async def admin_fulfillment_advance(order_id: str, payload: FulfillmentTransitionIn,
                                    _admin: dict = Depends(require_area("orders", "manage"))):
    """Fait avancer une commande dans le flux physique (jusqu'à empaquetée)."""
    target = payload.to
    if target not in {"processing", "packing", "packed"}:
        raise HTTPException(400, "Étape gérée par l'étiquetage (Dispatch), pas ici.")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Commande introuvable")
    if order.get("payment_status") != "paid":
        raise HTTPException(400, "La commande doit être payée avant préparation.")
    await _advance_one(order, target, _admin.get("email", "system"))
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


@api.post("/admin/fulfillment/bulk-advance")
async def admin_fulfillment_bulk(payload: FulfillmentBulkIn,
                                 _admin: dict = Depends(require_area("orders", "manage"))):
    """Avance TOUTES les commandes d'une colonne (ex. tout passer « en
    préparation » d'un coup)."""
    if payload.to not in {"packing", "packed"}:
        raise HTTPException(400, "Cible invalide.")
    orders = await db.orders.find(
        {
            "payment_status": "paid",
            "dispatch_batch": {"$lte": payload.date},
            "fulfillment_status": payload.from_status,
        },
        {"_id": 0},
    ).to_list(3000)
    for o in orders:
        await _advance_one(o, payload.to, _admin.get("email", "system"))
    return {"advanced": len(orders), "to": payload.to}


@api.get("/admin/fulfillment/{date}/picking-list.pdf")
async def admin_fulfillment_picking_pdf(date: str,
                                        _admin: dict = Depends(require_area("orders", "view"))):
    """Liste de prélèvement consolidée : total par article à sortir du stock."""
    orders = await db.orders.find(
        {
            "payment_status": "paid",
            "dispatch_batch": {"$lte": date},
            "fulfillment_status": {"$in": ["processing", "packing"]},
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(3000)

    totals: dict = {}
    for o in orders:
        for it in _order_items(o):
            key = (it.get("sku") or it.get("slug") or "?", it.get("variant_name") or "")
            if key not in totals:
                totals[key] = {"sku": it.get("sku") or "",
                               "name": it.get("name_fr") or it.get("name_en") or it.get("slug") or "",
                               "variant_name": it.get("variant_name") or "", "qty": 0}
            totals[key]["qty"] += int(it.get("qty") or 1)
    if not totals:
        raise HTTPException(404, "Aucune commande à préparer pour ce lot.")

    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas as _canvas
    import io as _io
    buf = _io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=letter)
    w, h = letter
    y = h - 60
    c.setFont("Helvetica-Bold", 16); c.drawString(50, y, f"Liste de prélèvement — lot {date}")
    c.setFont("Helvetica", 9); y -= 18
    c.drawString(50, y, "FIRONOVA · FOR LABORATORY RESEARCH USE ONLY · 19+"); y -= 30
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, "Qté"); c.drawString(90, y, "SKU"); c.drawString(220, y, "Produit"); y -= 6
    c.line(50, y, w - 50, y); y -= 18
    c.setFont("Helvetica", 10)
    for row in sorted(totals.values(), key=lambda r: r["name"]):
        if y < 60:
            c.showPage(); y = h - 60; c.setFont("Helvetica", 10)
        label = row["name"] + (f" — {row['variant_name']}" if row["variant_name"] else "")
        c.drawString(50, y, f"{row['qty']}×"); c.drawString(90, y, (row["sku"] or "")[:22])
        c.drawString(220, y, label[:60]); y -= 18
    c.showPage(); c.save(); buf.seek(0)
    return Response(content=buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="prelevement-{date}.pdf"'})


# ---------------------------------------------------------------------------
# Report des étiquettes non imprimées + signaux de navigation
# ---------------------------------------------------------------------------
@api.post("/admin/dispatch/{date}/mark-printed")
async def admin_dispatch_mark_printed(date: str,
                                      _admin: dict = Depends(require_area("orders", "manage"))):
    """Marque les étiquettes du lot comme imprimées. Une étiquette imprimée
    n'est plus reportée au lendemain par le report de minuit."""
    now = datetime.now(timezone.utc).isoformat()
    res = await db.orders.update_many(
        {
            "payment_status": "paid",
            "dispatch_batch": date,
            "shipping_info.label_url": {"$nin": [None, ""]},
        },
        {"$set": {"shipping_info.label_printed_at": now}},
    )
    return {"ok": True, "marked": res.modified_count, "date": date}


async def _rollover_unprinted_labels() -> int:
    """Reporte au prochain jour ouvrable les commandes d'un lot passé dont
    l'étiquette n'a pas été imprimée. Évite qu'un lot oublié disparaisse."""
    today = _local_today_iso()
    cursor = db.orders.find(
        {
            "payment_status": "paid",
            "dispatch_batch": {"$lt": today},
            "fulfillment_status": {"$in": ["processing", "pending", "packing", "packed", "shipped"]},
            "$or": [
                {"shipping_info.label_printed_at": {"$in": [None, ""]}},
                {"shipping_info.label_printed_at": {"$exists": False}},
            ],
        },
        {"_id": 0, "id": 1, "order_number": 1},
    )
    moved = 0
    async for o in cursor:
        await db.orders.update_one(
            {"id": o["id"]},
            {"$set": {"dispatch_batch": today},
             "$push": {"notes": {
                 "id": str(uuid.uuid4()),
                 "text": f"Reportée au lot {today} — étiquette non imprimée.",
                 "author": "system",
                 "created_at": datetime.now(timezone.utc).isoformat(),
             }}},
        )
        moved += 1
    if moved:
        logging.info("[rollover] %d commande(s) reportée(s) au lot %s", moved, today)
    return moved


async def _rollover_watchdog() -> None:
    """Passe une fois par heure : à la première exécution après minuit, les
    lots non imprimés de la veille basculent sur le jour courant."""
    last_day = None
    while True:
        try:
            today = _local_today_iso()
            if last_day != today:
                await _rollover_unprinted_labels()
                last_day = today
        except Exception as ex:  # pragma: no cover
            logging.error("rollover watchdog failed: %s", ex)
        await asyncio.sleep(3600)


@api.get("/admin/ops/signals")
async def admin_ops_signals(_admin: dict = Depends(require_area("orders", "view"))):
    """Compteurs pour les pastilles de navigation (Journée / Dispatch) et
    l'alerte manifeste du tableau de bord."""
    day = _local_today_iso()
    to_prepare = await db.orders.count_documents({
        "payment_status": "paid",
        "dispatch_batch": {"$lte": day},
        "fulfillment_status": {"$in": ["processing", "packing"]},
    })
    to_label = await db.orders.count_documents({
        "payment_status": "paid",
        "dispatch_batch": day,
        "fulfillment_status": {"$in": ["processing", "pending", "packed"]},
        "$or": [
            {"shipping_info.label_url": {"$in": [None, ""]}},
            {"shipping_info.label_url": {"$exists": False}},
        ],
    })
    to_print = await db.orders.count_documents({
        "payment_status": "paid",
        "dispatch_batch": day,
        "shipping_info.label_url": {"$nin": [None, ""]},
        "$or": [
            {"shipping_info.label_printed_at": {"$in": [None, ""]}},
            {"shipping_info.label_printed_at": {"$exists": False}},
        ],
    })
    pending_manifest = await db.orders.count_documents({
        "shipping_info.label_url": {"$nin": [None, ""]},
        "shipping_info.cp_transmitted": {"$ne": True},
    })
    # Retards : lots antérieurs encore non expédiés.
    overdue = await db.orders.count_documents({
        "payment_status": "paid",
        "dispatch_batch": {"$lt": day},
        "fulfillment_status": {"$in": ["processing", "pending", "packing", "packed"]},
    })
    return {
        "date": day,
        "fulfillment": to_prepare,
        # Le badge Dispatch signale ce qui reste À ÉTIQUETER (+ retards),
        # pas les étiquettes déjà créées en attente d'impression.
        "dispatch": to_label + overdue,
        "overdue": overdue,
        "to_label": to_label,
        "to_print": to_print,
        "pending_manifest": pending_manifest,
    }


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
    _enforce_standard_coupon_percent_limit(payload.discount_type, payload.value, is_affiliate=False)
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["code"] = code
    doc["allowed_emails"] = [e.lower().strip() for e in (doc.get("allowed_emails") or []) if e and e.strip()]
    doc["restrict_products"] = [p for p in (doc.get("restrict_products") or []) if p]
    doc["restrict_categories"] = [c for c in (doc.get("restrict_categories") or []) if c]
    doc["used_count"] = 0
    doc["used_by"] = []
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/coupons/{coupon_id}")
async def admin_update_coupon(coupon_id: str, payload: CouponIn, _admin: dict = Depends(require_area("coupons", "manage"))):
    # exclude_unset : seuls les champs envoyes par le formulaire sont appliques,
    # les compteurs (used_count/used_by) et champs avances absents sont preserves.
    update = payload.model_dump(exclude_unset=True)
    existing = await db.coupons.find_one({"id": coupon_id}, {"_id": 0, "affiliate_id": 1, "source": 1})
    if not existing:
        raise HTTPException(404, "Coupon not found")
    _enforce_standard_coupon_percent_limit(
        update.get("discount_type", payload.discount_type),
        float(update.get("value", payload.value)),
        _is_affiliate_coupon(existing),
    )
    if "code" in update:
        update["code"] = update["code"].upper().strip()
    if "allowed_emails" in update:
        update["allowed_emails"] = [e.lower().strip() for e in (update["allowed_emails"] or []) if e and e.strip()]
    if "restrict_products" in update:
        update["restrict_products"] = [p for p in (update["restrict_products"] or []) if p]
    if "restrict_categories" in update:
        update["restrict_categories"] = [c for c in (update["restrict_categories"] or []) if c]
    res = await db.coupons.update_one({"id": coupon_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Coupon not found")
    return await db.coupons.find_one({"id": coupon_id}, {"_id": 0})


@api.delete("/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, admin: dict = Depends(require_area("coupons", "manage"))):
    return await _soft_delete("coupons", coupon_id, admin)


@api.post("/coupons/validate")
async def validate_coupon(code: str, subtotal: float,
                          email: Optional[str] = None,
                          items: Optional[str] = None):
    """Validation cote client. email et items (JSON) sont OPTIONNELS : sans eux,
    seules les regles de base sont verifiees (retrocompatible avec l'appel actuel).
    La validation finale complete est toujours faite au checkout."""
    coupon = await db.coupons.find_one({"code": code.upper().strip()}, {"_id": 0})
    line_items = None
    if items:
        try:
            raw = json.loads(items)
            if isinstance(raw, list):
                ids = [str(x.get("product_id")) for x in raw if isinstance(x, dict) and x.get("product_id")]
                docs = await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
                by_id = {d["id"]: d for d in docs}
                line_items = [
                    {"product_id": str(x.get("product_id")),
                     "category": (by_id.get(str(x.get("product_id"))) or {}).get("category", "")}
                    for x in raw if isinstance(x, dict) and x.get("product_id")
                ]
        except Exception:
            line_items = None
    discount, applied = await _coupon_discount(coupon, subtotal, line_items=line_items, email=email)
    return {
        "code": coupon["code"], "discount_type": coupon["discount_type"],
        "value": coupon["value"], "discount_amount": discount,
        "min_subtotal": coupon.get("min_subtotal", 0),
        "restricted": bool(coupon.get("allowed_emails") or coupon.get("first_order_only")
                           or coupon.get("per_customer_limit")
                           or coupon.get("restrict_products") or coupon.get("restrict_categories")),
    }


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
# Contenants d'expédition (enveloppes / boîtes) configurables depuis l'admin.
# Chaque contenant a des dimensions (cm), un poids à vide (tare, g) et une
# capacité max en nombre d'unités. Le calcul de colis choisit le plus petit
# contenant dont la capacité >= nombre total d'unités de la commande, ajoute
# sa tare au poids des produits, et transmet ses dimensions à Canada Post
# (nécessaire pour le poids volumétrique).
# ---------------------------------------------------------------------------
class ShippingBoxIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)      # ex. "Enveloppe à bulles"
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(default=2.0, gt=0)          # épaisseur (enveloppe ~2 cm)
    tare_grams: float = Field(default=20.0, ge=0)        # poids à vide du contenant
    max_units: int = Field(default=10, ge=1)             # capacité en nombre d'articles
    active: bool = True


@api.get("/admin/shipping/boxes")
async def admin_list_boxes(_admin: dict = Depends(require_area("shipping", "view"))):
    return await db.shipping_boxes.find({"deleted_at": None}, {"_id": 0}).sort("max_units", 1).to_list(200)


@api.post("/admin/shipping/boxes")
async def admin_create_box(payload: ShippingBoxIn, _admin: dict = Depends(require_area("shipping", "manage"))):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["deleted_at"] = None
    await db.shipping_boxes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/admin/shipping/boxes/{box_id}")
async def admin_update_box(box_id: str, payload: ShippingBoxIn, _admin: dict = Depends(require_area("shipping", "manage"))):
    res = await db.shipping_boxes.update_one({"id": box_id}, {"$set": payload.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Box not found")
    return await db.shipping_boxes.find_one({"id": box_id}, {"_id": 0})


@api.delete("/admin/shipping/boxes/{box_id}")
async def admin_delete_box(box_id: str, admin: dict = Depends(require_area("shipping", "manage"))):
    return await _soft_delete("shipping_boxes", box_id, admin)


async def _select_box_for_order(order: dict, all_boxes: Optional[list] = None) -> Optional[dict]:
    """Plus petit contenant actif dont la capacité >= nb total d'unités.
    Si shipping_box_override_id est défini sur la commande, on l'utilise en priorité."""
    boxes = all_boxes
    if boxes is None:
        boxes = await db.shipping_boxes.find(
            {"deleted_at": None, "active": True}, {"_id": 0}
        ).sort("max_units", 1).to_list(200)

    override_id = order.get("shipping_box_override_id")
    if override_id:
        for b in boxes:
            if b.get("id") == override_id:
                return b

    units = 0
    for it in _order_items(order):
        units += int(it.get("qty") or 1)
    units = max(1, units)
    for b in sorted(boxes, key=lambda b: int(b.get("max_units") or 0)):
        if int(b.get("max_units") or 0) >= units:
            return b
    return boxes[-1] if boxes else None


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
            # Scientific data fields (new)
            "molecular_formula": p.get("molecular_formula", ""),
            "molecular_weight": p.get("molecular_weight", ""),
            "cas_number": p.get("cas_number", ""),
            "sequence_length": p.get("sequence_length", ""),
            "storage": p.get("storage", ""),
            "solubility": p.get("solubility", ""),
            "appearance": p.get("appearance", ""),
            "mechanism": p.get("mechanism", ""),
            "research_areas": "; ".join(p.get("research_areas", [])),
            "synonyms": "; ".join(p.get("synonyms", [])),
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
            # Scientific data fields (new)
            "molecular_formula": p.get("molecular_formula", ""),
            "molecular_weight": p.get("molecular_weight", ""),
            "cas_number": p.get("cas_number", ""),
            "sequence_length": p.get("sequence_length", ""),
            "storage": p.get("storage", ""),
            "solubility": p.get("solubility", ""),
            "appearance": p.get("appearance", ""),
            "mechanism": p.get("mechanism", ""),
            "research_areas": "; ".join(p.get("research_areas", [])),
            "synonyms": "; ".join(p.get("synonyms", [])),
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
        raw,
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
        fresh = await _mark_order_paid(
            order_id,
            f"Crypto payment confirmed via NOWPayments status poll (payment_id {payment_id})",
        )
        if fresh:
            logging.info("Order %s marked paid via crypto_status poll", order_id)
        return {"order_id": order_id, "payment_status": "paid", "np_status": np_status}
    return {"order_id": order_id, "payment_status": order.get("payment_status"), "np_status": np_status}


# ---------------------------------------------------------------------------
# Interac Autodeposit — confirmation automatique via Microsoft Graph API
# ---------------------------------------------------------------------------

_GRAPH_TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
_GRAPH_API_URL = "https://graph.microsoft.com/v1.0"


async def _graph_access_token() -> Optional[str]:
    """Jeton OAuth2 app-only (client credentials) pour Microsoft Graph."""
    if not (INTERAC_GRAPH_TENANT_ID and INTERAC_GRAPH_CLIENT_ID and INTERAC_GRAPH_CLIENT_SECRET):
        return None
    async with httpx.AsyncClient(timeout=20) as cx:
        r = await cx.post(
            _GRAPH_TOKEN_URL.format(tenant=INTERAC_GRAPH_TENANT_ID),
            data={
                "grant_type": "client_credentials",
                "client_id": INTERAC_GRAPH_CLIENT_ID,
                "client_secret": INTERAC_GRAPH_CLIENT_SECRET,
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
            f"{_GRAPH_API_URL}/users/{INTERAC_GRAPH_USER}/mailFolders/inbox/messages",
            params={
                "$filter": "isRead eq false",
                "$top": 50,
                "$select": "id,subject,from,body,receivedDateTime",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        data = r.json()
    return data.get("value") or []


async def _graph_mark_read(token: str, message_id: str) -> None:
    async with httpx.AsyncClient(timeout=20) as cx:
        await cx.patch(
            f"{_GRAPH_API_URL}/users/{INTERAC_GRAPH_USER}/messages/{message_id}",
            json={"isRead": True},
            headers={"Authorization": f"Bearer {token}"},
        )


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "")


def _extract_interac_refs(text: str) -> list:
    """Références de commande 'FN-XXXXXX-XXXXXX' trouvées dans un texte (dédupliquées)."""
    return sorted({r.upper() for r in re.findall(r"FN-\d{6}-[0-9A-F]{6}", text.upper())})


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


async def _process_interac_deposit_emails() -> int:
    token = await _graph_access_token()
    if not token:
        return 0
    try:
        messages = await _graph_unread_messages(token)
    except Exception as ex:
        logging.error("Interac Graph: lecture de la boîte échouée: %s", ex)
        return 0

    processed = 0
    for msg in messages:
        from_addr = ((msg.get("from") or {}).get("emailAddress") or {}).get("address") or ""
        if "interac" not in from_addr.lower():
            continue  # pas une notification Interac — on laisse en non-lu
        subject = msg.get("subject") or ""
        body = msg.get("body") or {}
        text = f"{subject}\n{_strip_html(body.get('content') or '')}"
        refs = _extract_interac_refs(text)
        acted = False
        for ref in refs:
            order = await db.orders.find_one(
                {"order_number": ref, "payment_status": "awaiting_etransfer"}, {"_id": 0}
            )
            if not order:
                # GAP 3 — Détection paiement tardif : la commande peut avoir été
                # auto-annulée avant l'arrivée du dépôt. On journalise l'incident
                # sur la commande pour que l'admin puisse la réouvrir manuellement.
                late = await db.orders.find_one(
                    {"order_number": ref, "payment_status": "cancelled"},
                    {"_id": 0, "id": 1, "order_number": 1, "email": 1, "late_payment_flagged": 1},
                )
                if late and not late.get("late_payment_flagged"):
                    await db.orders.update_one(
                        {"id": late["id"]},
                        {"$set": {
                            "late_payment_flagged": True,
                            "late_payment_flagged_at": datetime.now(timezone.utc).isoformat(),
                            "late_payment_reference": ref,
                        },
                         "$push": {"notes": {
                            "id": str(uuid.uuid4()),
                            "text": (f"⚠️ PAIEMENT TARDIF détecté sur commande annulée — "
                                     f"notification Interac reçue (réf {ref}). "
                                     f"Vérifier manuellement avant réouverture éventuelle."),
                            "author": "system",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                         }}},
                    )
                    logging.warning("Late payment detected on cancelled order %s (ref %s)", late.get("id"), ref)
                    acted = True
                    break
                continue
            amounts = _parse_amounts(text)
            order_total = float(order.get("total", 0))
            if not amounts or not any(abs(a - order_total) <= 0.01 for a in amounts):
                await db.orders.update_one({"id": order["id"]}, {"$push": {"notes": {
                    "id": str(uuid.uuid4()),
                    "text": (f"Notification de dépôt Interac reçue (réf {ref}) avec un montant "
                             f"divergent — paiement NON auto-confirmé, à vérifier manuellement."),
                    "author": "system",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }}})
                logging.warning("Interac deposit: montant divergent pour %s — revue manuelle", ref)
                acted = True
                break
            fresh = await _mark_order_paid(
                order["id"],
                f"Virement Interac confirmé (dépôt auto) — notification de dépôt reçue pour {ref}.",
            )
            if fresh:
                logging.info("Order %s marked paid via Interac Autodeposit notification", ref)
            acted = True
            break
        if acted:
            try:
                await _graph_mark_read(token, msg["id"])
            except Exception:
                pass
            processed += 1
    return processed


INTERAC_GRAPH_POLL_SECONDS = int(os.environ.get("INTERAC_GRAPH_POLL_SECONDS", "120"))


async def _interac_deposit_watchdog() -> None:
    """Toutes les INTERAC_GRAPH_POLL_SECONDS : confirme les commandes Interac
    dont le dépôt (Autodeposit) est notifié par email."""
    while True:
        try:
            await _process_interac_deposit_emails()
        except Exception as ex:  # pragma: no cover
            logging.error("interac deposit watchdog failed: %s", ex)
        await asyncio.sleep(INTERAC_GRAPH_POLL_SECONDS)


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
        "canada_post_enabled": is_canada_post_configured(),
        "prelaunch_enabled": PRELAUNCH_ENABLED,
        "launch_coupon_code": LAUNCH_COUPON_CODE,
        "seo": await _seo_get_settings(),
        # PRELAUNCH_PREVIEW_TOKEN n'est JAMAIS exposé ici — il ne se vérifie que
        # côté serveur via GET /prelaunch/preview.
    }


@api.get("/")
async def root():
    return {"service": "fironova-api", "status": "ok"}


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
# =============================================================================
# FIRONOVA — Catalogue produits (19 peptides de recherche)
# Données scientifiques vérifiées (PubChem, ChemicalBook, Sigma-Aldrich).
# active: True  → 5 produits au lancement
# active: False → 14 produits, à activer depuis l'admin
# image_url: "" → à remplir via POST /admin/upload/image
# =============================================================================
SEED_PRODUCTS = [
    {
        "slug": "bpc-157-5mg",
        "name_en": "BPC-157",
        "name_fr": "BPC-157",
        "category": "healing",
        "sequence": "GEPPPGKPADDAGLV",
        "molecular_formula": "C62H98N16O22",
        "molecular_weight": 1419.55,
        "cas_number": "137525-51-0",
        "sequence_length": 15,
        "purity": "≥ 99.0%",
        "dosage_mg": 5.0,
        "description_en": "Body Protection Compound, a 15-amino-acid synthetic peptide derived from gastric protein. Widely studied in research models for tissue repair pathways.",
        "description_fr": "Composé de protection corporelle, peptide synthétique de 15 acides aminés dérivé d'une protéine gastrique. Étudié dans des modèles de recherche sur les voies de réparation tissulaire.",
        "price_cad": 64.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "tb-500-5mg",
        "name_en": "TB-500",
        "name_fr": "TB-500",
        "category": "healing",
        "sequence": "Ac-SDKPDMAEIEKFDKSKLKKTETQEKNPLPSKETIEQEKQAGES",
        "molecular_formula": "C212H350N56O78S",
        "molecular_weight": 4963.44,
        "cas_number": "77591-33-4",
        "sequence_length": 43,
        "purity": "≥ 99.0%",
        "dosage_mg": 5.0,
        "description_en": "Full-length Thymosin Beta-4 (43 amino acids). Investigated in research for actin sequestration and cellular migration studies.",
        "description_fr": "Thymosine bêta-4 complète (43 acides aminés). Étudiée en recherche pour la séquestration de l'actine et les études de migration cellulaire.",
        "price_cad": 79.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "semaglutide-5mg",
        "name_en": "Semaglutide",
        "name_fr": "Sémaglutide",
        "category": "weight-loss",
        "sequence": "GLP-1 analog (31 aa, C18 diacid modified)",
        "molecular_formula": "C187H291N45O59",
        "molecular_weight": 4113.58,
        "cas_number": "910463-68-2",
        "sequence_length": 31,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "GLP-1 receptor agonist analog under extensive research in metabolic studies.",
        "description_fr": "Analogue agoniste du récepteur GLP-1 largement étudié dans les recherches métaboliques.",
        "price_cad": 189.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "tirzepatide-10mg",
        "name_en": "Tirzepatide",
        "name_fr": "Tirzépatide",
        "category": "weight-loss",
        "sequence": "GIP/GLP-1 dual agonist (39 aa, C20 diacid modified)",
        "molecular_formula": "C225H348N48O68",
        "molecular_weight": 4813.45,
        "cas_number": "2023788-19-2",
        "sequence_length": 39,
        "purity": "≥ 98.0%",
        "dosage_mg": 10.0,
        "description_en": "Dual GIP and GLP-1 receptor agonist studied in metabolic and body-weight research models.",
        "description_fr": "Double agoniste des récepteurs GIP et GLP-1 étudié dans les modèles de recherche métabolique et pondérale.",
        "price_cad": 219.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "ipamorelin-5mg",
        "name_en": "Ipamorelin",
        "name_fr": "Ipamoréline",
        "category": "cognitive",
        "sequence": "Aib-His-D-2-Nal-D-Phe-Lys-NH2",
        "molecular_formula": "C38H49N9O5",
        "molecular_weight": 711.85,
        "cas_number": "170851-70-4",
        "sequence_length": 5,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "Selective growth hormone secretagogue (ghrelin receptor agonist) studied in endocrine research.",
        "description_fr": "Sécrétagogue sélectif de l'hormone de croissance (agoniste du récepteur de la ghréline) étudié en recherche endocrinienne.",
        "price_cad": 74.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": True,
    },
    {
        "slug": "cjc-1295-no-dac-5mg",
        "name_en": "CJC-1295 No-DAC",
        "name_fr": "CJC-1295 sans DAC",
        "category": "cognitive",
        "sequence": "Tyr-D-Ala-Asp-Ala-Ile-Phe-Thr-Gln-Ser-Tyr-Arg-Lys-Val-Leu-Ala-Gln-Leu-Ser-Ala-Arg-Lys-Leu-Leu-Gln-Asp-Ile-Leu-Ser-Arg-NH2",
        "molecular_formula": "C152H252N44O42",
        "molecular_weight": 3367.9,
        "cas_number": "863288-34-0",
        "sequence_length": 29,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "Modified GRF (1-29), a GHRH analog studied for pulsatile growth-hormone-release research.",
        "description_fr": "GRF modifié (1-29), analogue de la GHRH étudié pour la recherche sur la libération pulsatile de l'hormone de croissance.",
        "price_cad": 69.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "selank-5mg",
        "name_en": "Selank",
        "name_fr": "Sélank",
        "category": "cognitive",
        "sequence": "Thr-Lys-Pro-Arg-Pro-Gly-Pro",
        "molecular_formula": "C33H57N11O9",
        "molecular_weight": 751.87,
        "cas_number": "129954-34-3",
        "sequence_length": 7,
        "purity": "≥ 99.0%",
        "dosage_mg": 5.0,
        "description_en": "Synthetic heptapeptide derived from tuftsin, studied for anxiolytic and nootropic pathways.",
        "description_fr": "Heptapeptide synthétique dérivé de la tuftsine, étudié pour les voies anxiolytiques et nootropiques.",
        "price_cad": 59.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "semax-10mg",
        "name_en": "Semax",
        "name_fr": "Sémax",
        "category": "cognitive",
        "sequence": "Met-Glu-His-Phe-Pro-Gly-Pro",
        "molecular_formula": "C37H51N9O10S",
        "molecular_weight": 813.92,
        "cas_number": "80714-61-0",
        "sequence_length": 7,
        "purity": "≥ 99.0%",
        "dosage_mg": 10.0,
        "description_en": "Synthetic heptapeptide ACTH(4-7) analog studied for BDNF modulation and neuroprotection.",
        "description_fr": "Heptapeptide synthétique analogue de l'ACTH(4-7) étudié pour la modulation du BDNF et la neuroprotection.",
        "price_cad": 84.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "ghk-cu-50mg",
        "name_en": "GHK-Cu",
        "name_fr": "GHK-Cu",
        "category": "healing",
        "sequence": "Gly-His-Lys · Cu(II)",
        "molecular_formula": "C14H22CuN6O4",
        "molecular_weight": 403.93,
        "cas_number": "89030-95-5",
        "sequence_length": 3,
        "purity": "≥ 99.0%",
        "dosage_mg": 50.0,
        "description_en": "Copper(II) complex of the tripeptide Gly-His-Lys, studied for collagen synthesis and matrix remodeling.",
        "description_fr": "Complexe cuivre(II) du tripeptide Gly-His-Lys, étudié pour la synthèse du collagène et le remodelage matriciel.",
        "price_cad": 89.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "retatrutide-10mg",
        "name_en": "Retatrutide",
        "name_fr": "Rétatrutide",
        "category": "weight-loss",
        "sequence": "GIP/GLP-1/GCGR triple agonist (39 aa, lipid diacid modified)",
        "molecular_formula": "C221H342N46O68",
        "molecular_weight": 4731.33,
        "cas_number": "2381089-83-2",
        "sequence_length": 39,
        "purity": "≥ 98.0%",
        "dosage_mg": 10.0,
        "description_en": "Triple GIP/GLP-1/glucagon receptor agonist studied in metabolic and body-weight research.",
        "description_fr": "Triple agoniste des récepteurs GIP/GLP-1/glucagon étudié en recherche métabolique et pondérale.",
        "price_cad": 249.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "pt-141-10mg",
        "name_en": "PT-141",
        "name_fr": "PT-141",
        "category": "cognitive",
        "sequence": "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-OH",
        "molecular_formula": "C50H68N14O10",
        "molecular_weight": 1025.18,
        "cas_number": "189691-06-3",
        "sequence_length": 7,
        "purity": "≥ 98.0%",
        "dosage_mg": 10.0,
        "description_en": "Cyclic melanocortin receptor agonist (bremelanotide) studied in neuroscience research.",
        "description_fr": "Agoniste cyclique des récepteurs de la mélanocortine (bremélanotide) étudié en recherche en neurosciences.",
        "price_cad": 79.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "melanotan-2-10mg",
        "name_en": "Melanotan-2",
        "name_fr": "Mélanotan-2",
        "category": "cognitive",
        "sequence": "Ac-Nle-cyclo[Asp-His-D-Phe-Arg-Trp-Lys]-NH2",
        "molecular_formula": "C50H69N15O9",
        "molecular_weight": 1024.18,
        "cas_number": "121062-08-6",
        "sequence_length": 7,
        "purity": "≥ 98.0%",
        "dosage_mg": 10.0,
        "description_en": "Cyclic heptapeptide α-MSH analog and non-selective melanocortin receptor agonist studied in research.",
        "description_fr": "Heptapeptide cyclique analogue de l'α-MSH et agoniste non sélectif des récepteurs de la mélanocortine étudié en recherche.",
        "price_cad": 69.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "mots-c-10mg",
        "name_en": "MOTS-c",
        "name_fr": "MOTS-c",
        "category": "weight-loss",
        "sequence": "Met-Arg-Trp-Gln-Glu-Met-Gly-Tyr-Ile-Phe-Tyr-Pro-Arg-Lys-Leu-Arg",
        "molecular_formula": "C101H152N28O22S2",
        "molecular_weight": 2174.6,
        "cas_number": "1627580-64-6",
        "sequence_length": 16,
        "purity": "≥ 98.0%",
        "dosage_mg": 10.0,
        "description_en": "Mitochondrial-derived 16-amino-acid peptide studied for AMPK-linked metabolic regulation.",
        "description_fr": "Peptide mitochondrial de 16 acides aminés étudié pour la régulation métabolique liée à l'AMPK.",
        "price_cad": 99.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "epithalon-10mg",
        "name_en": "Epithalon",
        "name_fr": "Épithalon",
        "category": "healing",
        "sequence": "Ala-Glu-Asp-Gly",
        "molecular_formula": "C14H22N4O9",
        "molecular_weight": 390.35,
        "cas_number": "307297-39-8",
        "sequence_length": 4,
        "purity": "≥ 99.0%",
        "dosage_mg": 10.0,
        "description_en": "Synthetic tetrapeptide (AEDG) studied for telomerase activity and circadian gene expression.",
        "description_fr": "Tétrapeptide synthétique (AEDG) étudié pour l'activité télomérase et l'expression des gènes circadiens.",
        "price_cad": 64.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "tesamorelin-5mg",
        "name_en": "Tesamorelin",
        "name_fr": "Tésamoréline",
        "category": "weight-loss",
        "sequence": "trans-3-hexenoyl-GRF(1-44)-NH2 (44 aa)",
        "molecular_formula": "C221H366N72O67S",
        "molecular_weight": 5135.86,
        "cas_number": "218949-48-5",
        "sequence_length": 44,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "Stabilized GHRH(1-44) analog studied in metabolic and adipose-tissue research models.",
        "description_fr": "Analogue stabilisé de la GHRH(1-44) étudié dans les modèles de recherche métabolique et adipeuse.",
        "price_cad": 179.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "hexarelin-5mg",
        "name_en": "Hexarelin",
        "name_fr": "Hexaréline",
        "category": "cognitive",
        "sequence": "His-D-2-Me-Trp-Ala-Trp-D-Phe-Lys-NH2",
        "molecular_formula": "C47H58N12O6",
        "molecular_weight": 887.04,
        "cas_number": "140703-51-1",
        "sequence_length": 6,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "Synthetic hexapeptide growth hormone secretagogue (GHS-R agonist) studied in endocrine research.",
        "description_fr": "Hexapeptide synthétique sécrétagogue de l'hormone de croissance (agoniste GHS-R) étudié en recherche endocrinienne.",
        "price_cad": 74.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "ghrp-2-5mg",
        "name_en": "GHRP-2",
        "name_fr": "GHRP-2",
        "category": "cognitive",
        "sequence": "D-Ala-D-2-Nal-Ala-Trp-D-Phe-Lys-NH2",
        "molecular_formula": "C45H55N9O6",
        "molecular_weight": 817.97,
        "cas_number": "158861-67-7",
        "sequence_length": 6,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "Synthetic hexapeptide (pralmorelin) growth hormone secretagogue studied in endocrine research.",
        "description_fr": "Hexapeptide synthétique (pralmoréline) sécrétagogue de l'hormone de croissance étudié en recherche endocrinienne.",
        "price_cad": 69.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "ghrp-6-5mg",
        "name_en": "GHRP-6",
        "name_fr": "GHRP-6",
        "category": "cognitive",
        "sequence": "His-D-Trp-Ala-Trp-D-Phe-Lys-NH2",
        "molecular_formula": "C46H56N12O6",
        "molecular_weight": 873.03,
        "cas_number": "87616-84-0",
        "sequence_length": 6,
        "purity": "≥ 98.0%",
        "dosage_mg": 5.0,
        "description_en": "Synthetic hexapeptide growth hormone secretagogue and ghrelin receptor agonist studied in research.",
        "description_fr": "Hexapeptide synthétique sécrétagogue de l'hormone de croissance et agoniste du récepteur de la ghréline étudié en recherche.",
        "price_cad": 64.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
    {
        "slug": "aod-9604-5mg",
        "name_en": "AOD-9604",
        "name_fr": "AOD-9604",
        "category": "weight-loss",
        "sequence": "Tyr-Leu-Arg-Ile-Val-Gln-Cys-Arg-Ser-Val-Glu-Gly-Ser-Cys-Gly-Phe (disulfide Cys7-Cys14)",
        "molecular_formula": "C78H123N23O23S2",
        "molecular_weight": 1815.1,
        "cas_number": "221231-10-3",
        "sequence_length": 16,
        "purity": "≥ 99.0%",
        "dosage_mg": 5.0,
        "description_en": "Modified hGH fragment (176-191) with N-terminal tyrosine, studied in lipid-metabolism research.",
        "description_fr": "Fragment modifié de l'hGH (176-191) avec tyrosine N-terminale, étudié en recherche sur le métabolisme lipidique.",
        "price_cad": 89.99,
        "stock": 0,
        "image_url": "",
        "lab_tested": True,
        "active": False,
    },
]


async def seed_admin_and_products():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.products.create_index("slug", unique=True)
    await affiliate_ensure_indexes()
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
    featured_slugs = {"bpc-157-5mg", "semaglutide-5mg", "tirzepatide-10mg", "ipamorelin-5mg", "ghk-cu-50mg", "epithalon-10mg"}
    for p in SEED_PRODUCTS:
        default_variant = {
            "id": str(uuid.uuid4()),
            "name": f"{p['dosage_mg']}mg",
            "price": p["price_cad"],
            "stock": p["stock"],
            "sku": p["slug"].upper(),
            "coa_status": "available",
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
        # Backfill featured flag and scientific fields on existing docs (non-destructive)
        sci_backfill = {k: p[k] for k in (
            "molecular_formula", "molecular_weight", "cas_number", "sequence_length",
            "sequence", "purity", "description_en", "description_fr",
        ) if k in p}
        sci_backfill["featured"] = p["slug"] in featured_slugs
        await db.products.update_one(
            {"slug": p["slug"]},
            {"$set": sci_backfill},
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

    # ------------------------------------------------------------------
    # MIGRATION — variant.coa_status (single source of truth)
    # Converts legacy per-variant booleans to the new coa_status field, once,
    # only on variants that don't yet have it. Non-destructive: legacy booleans
    # are left in place for rollback. Mapping:
    #   coa_url present OR badge_coa_available  -> "available"
    #   else badge_coa_pending                  -> "pending"
    #   else                                    -> "none"
    # ------------------------------------------------------------------
    async for prod in db.products.find({"variants": {"$exists": True, "$ne": []}}, {"variants": 1}):
        vs = prod.get("variants") or []
        changed = False
        for v in vs:
            if "coa_status" in v and v["coa_status"] in ("available", "pending", "none"):
                continue
            if v.get("coa_url") or v.get("badge_coa_available"):
                v["coa_status"] = "available"
            elif v.get("badge_coa_pending"):
                v["coa_status"] = "pending"
            else:
                v["coa_status"] = "none"
            changed = True
        if changed:
            await db.products.update_one({"_id": prod["_id"]}, {"$set": {"variants": vs}})


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


async def _decrement_coupon_usage(order: dict) -> bool:
    """Rend l'usage global + par-client d'un coupon compté. Idempotent via
    le flag `coupon_counted` sur la commande. Retourne True si un décrément
    a réellement eu lieu."""
    c = order.get("coupon")
    if not (c and c.get("code") and order.get("coupon_counted")):
        return False
    code = c["code"]
    await db.coupons.update_one(
        {"code": code, "used_count": {"$gt": 0}},
        {"$inc": {"used_count": -1}},
    )
    email_norm = (order.get("email") or "").strip().lower()
    if email_norm:
        await db.coupons.update_one(
            {"code": code, "used_by.email": email_norm, "used_by.count": {"$gt": 0}},
            {"$inc": {"used_by.$.count": -1}},
        )
    await db.orders.update_one(
        {"id": order["id"]},
        {"$set": {"coupon_counted": False}},
    )
    return True


async def _cancel_order_side_effects(order: dict, *, reverse_affiliate: bool = True) -> None:
    """Effets de bord standards d'une annulation :
      1. Restock des lignes non-preorder
      2. Décrément du coupon (si compté)
      3. Reverse de la commission affiliée (si commande était payée)

    Idempotent — sûr à appeler plusieurs fois grâce aux gardes internes.
    À utiliser depuis TOUS les chemins d'annulation (auto-cancel, cancel
    manuel admin, refund complet) pour garantir cohérence."""
    await _restock_order_items(order)
    await _decrement_coupon_usage(order)
    if reverse_affiliate and order.get("payment_status") == "paid":
        try:
            await affiliate_on_order_reversed(order["id"], full=True)  # noqa: F821
        except Exception as e:
            logging.warning("[cancel] affiliate reverse failed for %s: %s", order.get("id"), e)


PAYMENT_REMINDER_HOURS = float(os.environ.get("PAYMENT_REMINDER_HOURS", "6"))

async def send_payment_reminders():
    """Envoie un rappel unique aux commandes impayées ayant dépassé la moitié
    du délai d'expiration, avant leur annulation automatique."""
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=PAYMENT_REMINDER_HOURS)).isoformat()
    floor = (now - timedelta(hours=UNPAID_ORDER_TTL_HOURS)).isoformat()
    pending = await db.orders.find(
        {
            "payment_status": {"$in": ["awaiting_etransfer", "awaiting_crypto"]},
            "created_at": {"$lt": cutoff, "$gte": floor},
            "payment_reminder_sent": {"$ne": True},
        }, {"_id": 0}
    ).to_list(500)
    for order in pending:
        marked = await db.orders.update_one(
            {"id": order["id"], "payment_reminder_sent": {"$ne": True}},
            {"$set": {"payment_reminder_sent": True}},
        )
        if marked.modified_count and order.get("email"):
            lang, to, ctx = _order_ctx(order)
            await send_template_email("payment_reminder", to, lang, ctx, order)
    return len(pending)

async def cancel_stale_unpaid_orders():
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=UNPAID_ORDER_TTL_HOURS)).isoformat()
    stale = await db.orders.find(
        {
            "payment_status": {"$in": ["awaiting_etransfer", "awaiting_crypto"]},
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
            {"$set": {
                "payment_status": "cancelled",
                "fulfillment_status": "cancelled",
                "cancelled_at": datetime.now(timezone.utc).isoformat(),
                "cancelled_reason": "auto_unpaid_timeout",
                "prev_payment_status": order["payment_status"],
             },
             "$push": {"notes": note}},
        )
        if res.modified_count:
            # Effets de bord centralisés (restock + coupon + affiliate reverse).
            # reverse_affiliate=False car une commande auto-annulée n'était jamais payée.
            await _cancel_order_side_effects(order, reverse_affiliate=False)
            logging.info("Auto-cancelled unpaid order %s", order.get("order_number", order["id"]))
            if order.get("email"):
                lang, to, ctx = _order_ctx(order)
                asyncio.create_task(send_template_email("order_expired", to, lang, ctx, order))
    return len(stale)


async def _unpaid_orders_watchdog():
    while True:
        try:
            await send_payment_reminders()
            await cancel_stale_unpaid_orders()
        except Exception as e:
            logging.error("Unpaid order watchdog error: %s", e)
        await asyncio.sleep(3600)


async def _release_ready_preorder_orders() -> int:
    """Flip paid preorder orders to processing once every preorder line has
    stock >= qty and no coming-soon / COA-pending badge. Idempotent."""
    released = 0
    cursor = db.orders.find(
        {"payment_status": "paid", "fulfillment_status": "preorder"},
        {"_id": 0, "id": 1, "order_number": 1, "items": 1},
    )
    async for order in cursor:
        items = order.get("items") or []
        preorder_lines = [it for it in items if it.get("preorder")]
        if not preorder_lines:
            continue
        all_ready = True
        for it in preorder_lines:
            p = await db.products.find_one({"id": it.get("product_id")}, {"_id": 0, "variants": 1, "stock": 1})
            if not p:
                all_ready = False
                break
            variant_id = it.get("variant_id")
            if variant_id:
                v = next((v for v in p.get("variants", []) if v.get("id") == variant_id), None)
            else:
                v = None
            stock = int((v or p).get("stock", 0)) if (v or p) else 0
            if v and (v.get("badge_coming_soon") or v.get("badge_coa_pending")):
                all_ready = False
                break
            if stock < it.get("qty", 1):
                all_ready = False
                break
        if all_ready:
            reserved_lines = []
            for it in preorder_lines:
                qty = int(it.get("qty", 1))
                vid = it.get("variant_id")
                if vid in (None, "", "_default"):
                    res = await db.products.update_one(
                        {"id": it.get("product_id"), "stock": {"$gte": qty}},
                        {"$inc": {"stock": -qty}},
                    )
                else:
                    res = await db.products.update_one(
                        {"id": it.get("product_id"), "variants": {"$elemMatch": {"id": vid, "stock": {"$gte": qty}}}},
                        {"$inc": {"variants.$[v].stock": -qty}},
                        array_filters=[{"v.id": vid}],
                    )
                if res.modified_count != 1:
                    for rollback in reserved_lines:
                        rb_qty = int(rollback.get("qty", 1))
                        rb_vid = rollback.get("variant_id")
                        if rb_vid in (None, "", "_default"):
                            await db.products.update_one({"id": rollback.get("product_id")}, {"$inc": {"stock": rb_qty}})
                        else:
                            await db.products.update_one(
                                {"id": rollback.get("product_id"), "variants.id": rb_vid},
                                {"$inc": {"variants.$.stock": rb_qty}},
                            )
                    all_ready = False
                    break
                reserved_lines.append(it)
        if not all_ready:
            continue
        now = datetime.now(timezone.utc).isoformat()
        res = await db.orders.update_one(
            {"id": order["id"], "fulfillment_status": "preorder"},
            {"$set": {
                "fulfillment_status": "processing",
                "dispatch_batch": compute_dispatch_batch(now),
                "preorder_released_at": now,
            }, "$push": {"notes": {
                "id": str(uuid.uuid4()),
                "text": "Preorder auto-released: all items back in stock.",
                "author": "system",
                "created_at": now,
            }}},
        )
        if res.modified_count:
            released += 1
            logging.info("Preorder order %s released to processing", order.get("order_number", order["id"]))
    return released


async def _release_preorders_watchdog():
    while True:
        try:
            await _release_ready_preorder_orders()
        except Exception as e:
            logging.error("Preorder release watchdog error: %s", e)
        await asyncio.sleep(PREORDER_RELEASE_INTERVAL_SECONDS)


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


async def _backfill_affiliate_coupons() -> None:
    """Crée le coupon lié pour les affiliés déjà actifs qui n'en ont pas
    (les nouveaux le reçoivent à l'activation). Idempotent, sûr à relancer."""
    if AFFILIATE_COUPON_PERCENT <= 0:
        return
    try:
        actives = await db.affiliates.find(
            {"status": "active", "code": {"$ne": None}}, {"_id": 0, "id": 1, "code": 1}
        ).to_list(1000)
        created = 0
        for a in actives:
            c = await _affiliate_ensure_coupon(a.get("code"), a["id"])
            if c:
                created += 1
        if created:
            logging.info("[affiliate] backfill coupons: %d affiliés vérifiés", created)
    except Exception as e:
        logging.warning("[affiliate] backfill coupons échoué: %s", e)


@app.on_event("startup")
async def startup_event():
    # Warn about unconfigured optional services so issues are visible in logs.
    _svc_checks = {
        "RESEND_API_KEY (emails)": RESEND_API_KEY,
        "PUBLIC_BASE_URL (email links)": PUBLIC_BASE_URL,
        "NOWPAYMENTS_API_KEY (crypto)": NOWPAYMENTS_API_KEY,
        "INTERAC_GRAPH_TENANT_ID (Interac auto-confirm)": INTERAC_GRAPH_TENANT_ID,
    }
    for label, val in _svc_checks.items():
        if not val:
            logging.warning("[config] %s is not set — related features disabled", label)
    await seed_admin_and_products()
    await _seed_categories_from_products()
    await _seed_default_menus()
    await _seed_launch_coupon()
    await _backfill_affiliate_coupons()
    if await _acquire_worker_lock("background_tasks"):
        asyncio.create_task(_unpaid_orders_watchdog())
        asyncio.create_task(_backfill_dispatch_batch())
        asyncio.create_task(_release_preorders_watchdog())
        asyncio.create_task(_interac_deposit_watchdog())
        # Dispatch manuel : watchdog d'auto-étiquetage désactivé.
        # asyncio.create_task(_auto_label_paid_orders_watchdog())
        asyncio.create_task(_auto_sync_delivered_orders_watchdog())
        asyncio.create_task(_trash_auto_purge_watchdog())
        asyncio.create_task(_rollover_watchdog())
        asyncio.create_task(_magic_tokens_cleanup())
        asyncio.create_task(_abandoned_cart_watchdog())
        asyncio.create_task(affiliate_maintenance_watchdog())


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

# ===== FIRONOVA_AFFILIATE_BLOCK_START =====
# ===========================================================================
# CONSTANTES DU PROGRAMME
# ===========================================================================

AFFILIATE_INVITE_TTL_HOURS = 168          # 7 jours
AFFILIATE_COOKIE_DAYS = 30                # fenêtre d'attribution du clic
AFFILIATE_CLICK_TTL_DAYS = 45             # rétention des clics (purge auto)
AFFILIATE_COOKIE_NAME = "fn_ref"
AFFILIATE_INVITE_MAX = 5                  # rate-limit renvois / fenêtre
AFFILIATE_INVITE_WINDOW = 3600            # 1 h

# Paliers cumulés (seuil bas inclus, seuil haut exclu sauf Diamond).
# (rate, floor, ceil)  — ceil None = illimité
AFFILIATE_TIERS = [
    ("standard", 0.10, 0.0, 2000.0),
    ("bronze", 0.12, 2001.0, 5000.0),
    ("silver", 0.14, 5001.0, 10000.0),
    ("gold", 0.16, 10001.0, 20000.0),
    ("platinum", 0.18, 20001.0, 35000.0),
    ("diamond", 0.20, 35001.0, None),
]

AFFILIATE_TIER_LABELS = {
    "standard": {"fr": "Standard", "en": "Standard"},
    "bronze": {"fr": "Bronze", "en": "Bronze"},
    "silver": {"fr": "Argent", "en": "Silver"},
    "gold": {"fr": "Or", "en": "Gold"},
    "platinum": {"fr": "Platine", "en": "Platinum"},
    "diamond": {"fr": "Diamant", "en": "Diamond"},
}


def _affiliate_tier_for_revenue(cumulative_revenue: float) -> str:
    """Palier théorique pour un CA cumulé donné (sans plancher trimestriel)."""
    rev = float(cumulative_revenue or 0.0)
    tier = "standard"
    for name, _rate, floor, _ceil in AFFILIATE_TIERS:
        if rev >= floor:
            tier = name
    return tier


def _affiliate_rate_for_tier(tier: str) -> float:
    for name, rate, _floor, _ceil in AFFILIATE_TIERS:
        if name == tier:
            return rate
    return 0.10


def _affiliate_tier_index(tier: str) -> int:
    for i, (name, _r, _f, _c) in enumerate(AFFILIATE_TIERS):
        if name == tier:
            return i
    return 0


def _affiliate_tier_bounds(tier: str):
    for name, _r, floor, ceil in AFFILIATE_TIERS:
        if name == tier:
            return floor, ceil
    return 0.0, 2000.0


def _affiliate_next_tier(tier: str):
    idx = _affiliate_tier_index(tier)
    if idx + 1 < len(AFFILIATE_TIERS):
        n = AFFILIATE_TIERS[idx + 1]
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
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "FN" + "".join(secrets.choice(alphabet) for _ in range(6))


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
# MODÈLES Pydantic
# ===========================================================================

class AffiliateInviteIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=160)
    commission_note: Optional[str] = ""        # note interne admin
    payout_currency: Optional[str] = "btc"     # devise crypto de payout par défaut
    lang: str = "fr"


class AffiliateJoinIn(BaseModel):
    token: str = Field(min_length=10)
    # L'email n'est PAS fourni par le client : il est lu depuis l'invitation.
    payout_address: Optional[str] = ""         # adresse crypto de réception
    payout_currency: Optional[str] = None


class AffiliatePayoutSettingsIn(BaseModel):
    payout_address: str = Field(min_length=4, max_length=200)
    payout_currency: str = Field(min_length=2, max_length=12)


class AffiliateAdminUpdateIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    status: Optional[Literal["invited", "active", "suspended"]] = None
    compliance_status: Optional[Literal["compliant", "review", "suspended"]] = None
    manual_tier: Optional[str] = None          # override manuel du palier
    commission_note: Optional[str] = None
    # Détails de paiement (l'admin peut corriger si l'affilié se trompe)
    payout_address: Optional[str] = Field(default=None, max_length=200)
    payout_currency: Optional[str] = Field(default=None, max_length=12)
    # Pourcentage promo affiché sur le code (ex: -10%, -15%)
    coupon_percent: Optional[float] = Field(default=None, ge=0, le=100)
    # Notes internes (non visibles par l'affilié)
    admin_notes: Optional[str] = Field(default=None, max_length=2000)


class AffiliatePayoutMarkIn(BaseModel):
    reference: str = Field(min_length=1, max_length=200)   # tx hash / réf
    note: Optional[str] = ""


# ===========================================================================
# CALCUL DES MÉTRIQUES D'UN AFFILIÉ
# ===========================================================================

async def _affiliate_compute_metrics(affiliate_id: str) -> dict:
    """Agrège les référrals validés (approved|paid) en CA cumulé + trimestriel,
    calcule le palier avec plancher trimestriel (baisse d'un niveau max)."""
    q_start = _affiliate_quarter_start()

    cumulative = 0.0
    quarter = 0.0
    pending_commission = 0.0
    approved_commission = 0.0
    paid_commission = 0.0
    validated_orders = 0

    cursor = db.affiliate_referrals.find(
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
                    if dt >= q_start:
                        quarter += base
                except Exception:
                    pass
        if status == "pending":
            pending_commission += comm
        elif status == "approved":
            approved_commission += comm
        elif status == "paid":
            paid_commission += comm

    # Palier théorique selon CA cumulé
    theoretical = _affiliate_tier_for_revenue(cumulative)

    # Plancher trimestriel : si le CA du trimestre est SOUS le seuil du palier
    # théorique, on descend d'UN niveau max (jamais plus).
    floor, _ceil = _affiliate_tier_bounds(theoretical)
    effective = theoretical
    if quarter < floor and _affiliate_tier_index(theoretical) > 0:
        prev = AFFILIATE_TIERS[_affiliate_tier_index(theoretical) - 1]
        effective = prev[0]

    rate = _affiliate_rate_for_tier(effective)
    nxt = _affiliate_next_tier(effective)
    remaining = None
    progress = None
    if nxt:
        remaining = max(0.0, nxt["floor"] - cumulative)
        span = nxt["floor"] - _affiliate_tier_bounds(effective)[0]
        if span > 0:
            progress = min(1.0, (cumulative - _affiliate_tier_bounds(effective)[0]) / span)

    # Garde-fou trimestriel : pour CONSERVER le palier effectif, il faut que le CA
    # du trimestre reste >= au plancher du palier (sinon descente d'un niveau max).
    floor, _ceil = _affiliate_tier_bounds(effective)
    quarter_target = round(floor, 2)
    quarter_progress = min(1.0, quarter / floor) if floor > 0 else None
    quarter_warning = bool(quarter < floor and _affiliate_tier_index(effective) > 0)

    return {
        "cumulative_revenue": round(cumulative, 2),
        "quarter_revenue": round(quarter, 2),
        "validated_orders": validated_orders,
        "tier": effective,
        "tier_theoretical": theoretical,
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


def _affiliate_public(aff: dict, metrics: Optional[dict] = None, lang: str = "fr") -> dict:
    """Représentation exposée à l'affilié (jamais de champs internes sensibles)."""
    out = {
        "id": aff.get("id"),
        "code": aff.get("code"),
        "name": aff.get("name"),
        "email": aff.get("email"),
        "status": aff.get("status"),
        "compliance_status": aff.get("compliance_status", "compliant"),
        "payout_currency": aff.get("payout_currency", "btc"),
        "payout_address": aff.get("payout_address", ""),
        "activated_at": aff.get("activated_at"),
        "created_at": aff.get("created_at"),
    }
    if metrics:
        out.update(metrics)
        out["tier_label"] = AFFILIATE_TIER_LABELS.get(
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
        expiry = f"Ce lien expire dans {AFFILIATE_INVITE_TTL_HOURS // 24} jours et ne sert qu'une fois."
        ignore = "Si vous n'attendiez pas cette invitation, ignorez cet email."
    else:
        subject = "Invitation — Fironova Affiliate Program"
        heading = "You're invited"
        intro = (f"Hi {name}, you've been invited to join Fironova's private "
                 "affiliate program. Activate your account to access your dashboard.")
        cta = "Activate my affiliate account"
        expiry = f"This link expires in {AFFILIATE_INVITE_TTL_HOURS // 24} days and works only once."
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
    from_addr = (globals().get("MAGIC_SENDER_EMAIL") or
                 globals().get("SENDER_EMAIL") or "orders@fironova.com")
    await _send_email(email, subject, html, from_email=from_addr)  # noqa: F821


# ===========================================================================
# ATTRIBUTION — appelée depuis checkout() et _mark_order_paid() / refund
# ===========================================================================


async def _affiliate_ensure_coupon(affiliate_code: str, affiliate_id: str) -> Optional[dict]:
    """Crée un coupon de rabais lié au code affilié (idempotent).
    Si AFFILIATE_COUPON_PERCENT <= 0, ne crée rien. Le coupon reste
    éditable/désactivable depuis l'admin Coupons (c'est un coupon standard,
    marqué affiliate_id pour le lien et le contrôle)."""
    if AFFILIATE_COUPON_PERCENT <= 0:
        return None
    code = (affiliate_code or "").upper().strip()
    if not code:
        return None
    existing = await db.coupons.find_one({"code": code}, {"_id": 0})
    if existing:
        return existing  # déjà présent : on ne l'écrase pas (respecte les réglages admin)
    doc = {
        "id": str(uuid.uuid4()),
        "code": code,
        "discount_type": "percent",
        "value": AFFILIATE_COUPON_PERCENT,
        "min_subtotal": 0.0,
        "usage_limit": None,
        "used_count": 0,
        "active": True,
        "expires_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "affiliate_id": affiliate_id,   # lien affilié (permet le contrôle/filtrage)
        "source": "affiliate",
    }
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    logging.info("[affiliate] coupon %s créé (%.0f%%) pour affilié %s", code, AFFILIATE_COUPON_PERCENT, affiliate_id)
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
    existing = request.cookies.get(AFFILIATE_COOKIE_NAME)
    if existing and existing.strip().upper():
        return  # premier clic conservé — pas d'écrasement
    affiliate = await db.affiliates.find_one(
        {"code": code, "status": "active"}, {"_id": 0, "id": 1, "code": 1}
    )
    if not affiliate:
        return
    now = datetime.now(timezone.utc)
    response.set_cookie(
        AFFILIATE_COOKIE_NAME, code,
        max_age=AFFILIATE_COOKIE_DAYS * 86400,
        httponly=True, samesite="lax", secure=True, path="/",
    )
    click_doc = {
        "id": str(uuid.uuid4()),
        "affiliate_id": affiliate["id"],
        "code": code,
        "ip_hash": _affiliate_hash_ip(_client_ip(request)),  # noqa: F821
        "user_agent": (request.headers.get("user-agent", "") or "")[:300],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=AFFILIATE_CLICK_TTL_DAYS)).isoformat(),
    }
    click_doc["page"] = (page or "")[:300]
    click_doc["referrer"] = (referrer or "")[:300]
    click_doc["device"] = (device or "")[:40]
    await db.affiliate_clicks.insert_one(click_doc)


async def affiliate_attach_to_order(order_doc: dict, request: Request) -> None:
    """Lit le cookie fn_ref et attache l'affilié à la commande (champ additif).
    Anti auto-parrainage : refuse si l'email de commande == email affilié.
    À appeler DANS checkout() juste avant db.orders.insert_one(order_doc)."""
    code = request.cookies.get(AFFILIATE_COOKIE_NAME)
    if not code:
        return
    code = code.strip().upper()
    affiliate = await db.affiliates.find_one(
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
    order_doc["affiliate_ip_hash"] = _affiliate_hash_ip(_client_ip(request))  # noqa: F821


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
    affiliate = await db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
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
        await db.affiliate_referrals.insert_one(doc)
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
    await db.affiliate_referrals.update_many(
        {"order_id": order_id, "status": {"$in": ["pending", "approved"]}},
        {"$set": {"status": "reversed", "reversed_at": now}},
    )


# ===========================================================================
# TÂCHE : approbation automatique après fenêtre de rétractation
# ===========================================================================

AFFILIATE_APPROVAL_HOLD_DAYS = 14  # délai avant qu'une commission 'pending'
#                                    devienne 'approved' (fenêtre refund)


async def _affiliate_approve_matured():
    """Passe pending→approved les commissions dont l'ordre est payé depuis
    plus de AFFILIATE_APPROVAL_HOLD_DAYS jours et non remboursé."""
    cutoff = (datetime.now(timezone.utc) -
              timedelta(days=AFFILIATE_APPROVAL_HOLD_DAYS)).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    matured = await db.affiliate_referrals.find(
        {"status": "pending", "created_at": {"$lte": cutoff}},
        {"_id": 0, "id": 1, "order_id": 1},
    ).to_list(None)
    if not matured:
        return
    order_ids = list({r["order_id"] for r in matured})
    paid_cursor = db.orders.find(
        {"id": {"$in": order_ids}, "payment_status": "paid"}, {"_id": 0, "id": 1}
    )
    paid_ids = {o["id"] async for o in paid_cursor}
    approve_ids = [r["id"] for r in matured if r["order_id"] in paid_ids]
    if approve_ids:
        await db.affiliate_referrals.update_many(
            {"id": {"$in": approve_ids}, "status": "pending"},
            {"$set": {"status": "approved", "approved_at": now}},
        )


async def _affiliate_clicks_cleanup():
    """Purge des clics expirés (rétention limitée — proportionnalité Loi 25)."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        await db.affiliate_clicks.delete_many({"expires_at": {"$lt": now}})
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


async def affiliate_ensure_indexes():
    """Index — à appeler dans seed_admin_and_products() ou au startup."""
    await db.affiliates.create_index("id", unique=True)
    await db.affiliates.create_index("code", unique=True, sparse=True)
    await db.affiliates.create_index("email", unique=True)
    await db.affiliates.create_index("user_id", sparse=True)
    await db.affiliate_referrals.create_index("order_id", unique=True)
    await db.affiliate_referrals.create_index("affiliate_id")
    await db.affiliate_referrals.create_index("status")
    await db.affiliate_clicks.create_index("affiliate_id")
    await db.affiliate_clicks.create_index("expires_at")
    await db.affiliate_payouts.create_index("id", unique=True)
    await db.affiliate_payouts.create_index("affiliate_id")


# ===========================================================================
# DÉPENDANCE : affilié courant (compte user avec is_affiliate + affiliate lié)
# ===========================================================================

async def get_current_affiliate(request: Request) -> dict:
    user = await get_current_user(request)  # noqa: F821
    aff = await db.affiliates.find_one(
        {"user_id": user["id"], "status": {"$in": ["active", "suspended"]}},
        {"_id": 0},
    )
    if not aff:
        raise HTTPException(403, "Not an affiliate")
    if aff.get("status") == "suspended":
        raise HTTPException(403, "Affiliate account suspended")
    return aff


# ===========================================================================
# ENDPOINTS — AFFILIÉ (dashboard)
# ===========================================================================

@api.post("/affiliate/join")  # noqa: F821
async def affiliate_join(payload: AffiliateJoinIn, request: Request):
    """Active un compte affilié à partir d'un token d'invitation.
    L'utilisateur DOIT être connecté (auth existante), et son email doit
    correspondre à l'email de l'invitation. Token consommé atomiquement."""
    user = await get_current_user(request)  # noqa: F821
    token_hash = _affiliate_hash_token(payload.token.strip())
    now = datetime.now(timezone.utc)

    invite = await db.affiliates.find_one(
        {"invite_token_hash": token_hash, "status": "invited"}, {"_id": 0}
    )
    if not invite:
        raise HTTPException(400, "Invalid or already-used invitation")
    # Expiration
    exp = invite.get("invite_expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if now > exp_dt:
                raise HTTPException(400, "Invitation expired")
        except HTTPException:
            raise
        except Exception:
            pass
    # Verrou email : l'email connecté doit matcher l'email invité
    if (user.get("email") or "").lower().strip() != (invite.get("email") or "").lower().strip():
        raise HTTPException(403, "This invitation is bound to a different email address")

    code = _affiliate_gen_code()
    # collision improbable, mais on garantit l'unicité
    for _ in range(5):
        if not await db.affiliates.find_one({"code": code}, {"_id": 1}):
            break
        code = _affiliate_gen_code()

    known_addresses = []
    # (aucune adresse connue à l'activation ; se remplit via les commandes)
    update = {
        "$set": {
            "status": "active",
            "user_id": user["id"],
            "code": code,
            "activated_at": now.isoformat(),
            "ip_hash": _affiliate_hash_ip(_client_ip(request)),  # noqa: F821
            "known_addresses": known_addresses,
            "payout_address": (payload.payout_address or "").strip(),
            "payout_currency": (payload.payout_currency or invite.get("payout_currency") or "btc"),
            # invalide le token (consommation atomique)
            "invite_token_hash": None,
            "invite_expires_at": None,
        }
    }
    res = await db.affiliates.update_one(
        {"id": invite["id"], "status": "invited"}, update
    )
    if not res.modified_count:
        raise HTTPException(409, "Invitation already consumed")

    aff = await db.affiliates.find_one({"id": invite["id"]}, {"_id": 0})
    # Coupon de rabais auto-lié au code affilié (idempotent, contrôlable en admin).
    try:
        await _affiliate_ensure_coupon(aff.get("code"), aff["id"])
    except Exception as _e:
        logging.warning("[affiliate] échec création coupon pour %s: %s", aff.get("code"), _e)
    metrics = await _affiliate_compute_metrics(aff["id"])
    return _affiliate_public(aff, metrics)


@api.get("/affiliate/me")  # noqa: F821
async def affiliate_me(request: Request, lang: str = "fr"):
    aff = await get_current_affiliate(request)
    metrics = await _affiliate_compute_metrics(aff["id"])
    return _affiliate_public(aff, metrics, lang=lang)


@api.get("/affiliate/referrals")  # noqa: F821
async def affiliate_referrals(request: Request, limit: int = 200):
    aff = await get_current_affiliate(request)
    rows = await db.affiliate_referrals.find(
        {"affiliate_id": aff["id"], "status": {"$ne": "excluded"}},
        {"_id": 0, "order_email": 0, "affiliate_ip_hash": 0},
    ).sort("created_at", -1).to_list(min(limit, 500))
    return rows


@api.get("/affiliate/payouts")  # noqa: F821
async def affiliate_payouts(request: Request):
    aff = await get_current_affiliate(request)
    rows = await db.affiliate_payouts.find(
        {"affiliate_id": aff["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return rows


@api.put("/affiliate/payout-settings")  # noqa: F821
async def affiliate_payout_settings(payload: AffiliatePayoutSettingsIn, request: Request):
    aff = await get_current_affiliate(request)
    await db.affiliates.update_one(
        {"id": aff["id"]},
        {"$set": {"payout_address": payload.payout_address.strip(),
                  "payout_currency": payload.payout_currency.strip().lower()}},
    )
    fresh = await db.affiliates.find_one({"id": aff["id"]}, {"_id": 0})
    return _affiliate_public(fresh)


@api.get("/affiliate/performance")  # noqa: F821
async def affiliate_performance(request: Request):
    """Séries mensuelles (12 derniers mois) de CA validé pour les graphiques."""
    aff = await get_current_affiliate(request)
    buckets: dict = {}
    cursor = db.affiliate_referrals.find(
        {"affiliate_id": aff["id"], "status": {"$in": ["approved", "paid"]}},
        {"_id": 0, "base_amount": 1, "approved_at": 1, "created_at": 1},
    )
    async for r in cursor:
        ts = r.get("approved_at") or r.get("created_at")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            continue
        key = f"{dt.year}-{dt.month:02d}"
        buckets[key] = round(buckets.get(key, 0.0) + float(r.get("base_amount", 0.0)), 2)
    series = [{"month": k, "revenue": v} for k, v in sorted(buckets.items())]
    return {"series": series}


# ===========================================================================
# ENDPOINTS — ATTRIBUTION PUBLIQUE (pose du cookie)
# ===========================================================================

@api.get("/affiliate/insights")  # noqa: F821
async def affiliate_insights(request: Request):
    """Indicateurs synthétiques pour le tableau de bord affilié :
    mois courant, meilleur mois, clics, taux de conversion, commandes
    validées, panier moyen. Données réelles agrégées depuis les referrals
    et les clics."""
    aff = await get_current_affiliate(request)
    aff_id = aff["id"]

    # Referrals non exclus
    referrals = await db.affiliate_referrals.find(
        {"affiliate_id": aff_id, "status": {"$ne": "excluded"}},
        {"_id": 0, "order_total": 1, "commission_amount": 1, "status": 1, "created_at": 1},
    ).to_list(2000)

    # Un referral "validé" = commande payée (approved/paid/approuvé)
    VALIDATED = {"approved", "paid"}
    by_month = {}
    validated_orders = 0
    validated_revenue = 0.0
    for r in referrals:
        st = str(r.get("status", "")).lower()
        comm = float(r.get("commission_amount", 0.0))
        rev = float(r.get("order_total", 0.0))
        ts = str(r.get("created_at", ""))[:7]  # YYYY-MM
        if st in VALIDATED:
            validated_orders += 1
            validated_revenue += rev
            m = by_month.setdefault(ts, {"commission": 0.0, "revenue": 0.0})
            m["commission"] += comm
            m["revenue"] += rev

    now_month = datetime.now(timezone.utc).isoformat()[:7]
    current_month = by_month.get(now_month, {"commission": 0.0, "revenue": 0.0})

    best_month = None
    if by_month:
        bm_key = max(by_month, key=lambda k: by_month[k]["commission"])
        if by_month[bm_key]["commission"] > 0:
            best_month = {"month": bm_key, "commission": round(by_month[bm_key]["commission"], 2)}

    # Clics (collection affiliate_clicks)
    clicks = await db.affiliate_clicks.count_documents({"affiliate_id": aff_id})
    conversion_rate = (validated_orders / clicks) if clicks > 0 else None
    avg_order_value = (validated_revenue / validated_orders) if validated_orders > 0 else None

    return {
        "current_month": {
            "commission": round(current_month["commission"], 2),
            "revenue": round(current_month["revenue"], 2),
        },
        "best_month": best_month,
        "clicks": clicks,
        "conversion_rate": conversion_rate,
        "validated_orders": validated_orders,
        "avg_order_value": round(avg_order_value, 2) if avg_order_value is not None else None,
    }


@api.get("/affiliate/top-products")  # noqa: F821
async def affiliate_top_products(request: Request, limit: int = 5):
    """Meilleurs produits de l'affilié : agrège les articles vendus dans les
    commandes payées attribuées à cet affilié, triés par revenu décroissant.
    Retourne un lien de partage `?ref=<code>` pour chaque produit."""
    aff = await get_current_affiliate(request)  # noqa: F821
    aff_id = aff["id"]
    limit = max(1, min(int(limit or 5), 20))

    # Commandes payées attribuées à cet affilié (attribution stockée sur la commande).
    cursor = db.orders.find(
        {"affiliate_id": aff_id, "payment_status": "paid"},
        {"_id": 0, "items": 1},
    ).limit(2000)

    stats: dict = {}
    total_orders = 0
    async for order in cursor:
        total_orders += 1
        for it in (order.get("items") or []):
            pid = it.get("product_id") or it.get("slug")
            if not pid:
                continue
            row = stats.setdefault(pid, {
                "product_id": it.get("product_id"),
                "slug": it.get("slug") or "",
                "name_fr": it.get("name_fr") or it.get("name_en") or "",
                "name_en": it.get("name_en") or it.get("name_fr") or "",
                "image_url": it.get("image_url") or "",
                "qty": 0,
                "revenue": 0.0,
                "orders": 0,
            })
            row["qty"] += int(it.get("qty", 0) or 0)
            row["revenue"] += float(it.get("line_total", 0.0) or 0.0)
            row["orders"] += 1

    ranked = sorted(stats.values(), key=lambda r: r["revenue"], reverse=True)[:limit]
    for r in ranked:
        r["revenue"] = round(r["revenue"], 2)

    code = aff.get("code") or ""
    base = _trusted_public_base_url()  # noqa: F821
    for r in ranked:
        if r.get("slug") and code:
            r["share_url"] = f"{base}/product/{r['slug']}?ref={code}"
        else:
            r["share_url"] = ""

    return {
        "items": ranked,
        "orders_analyzed": total_orders,
        "code": code,
    }


@api.get("/affiliate/clicks/sources")  # noqa: F821
async def affiliate_clicks_sources(request: Request, days: int = 30):
    """Top sources des clics de l'affilié : pages d'atterrissage, domaines
    référents et types d'appareil (30 derniers jours par défaut)."""
    aff = await get_current_affiliate(request)  # noqa: F821
    days = max(7, min(int(days), 90))
    start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pages, refs, devices = {}, {}, {}
    total = 0
    cursor = db.affiliate_clicks.find(
        {"affiliate_id": aff["id"], "created_at": {"$gte": start}},
        {"_id": 0, "page": 1, "referrer": 1, "device": 1},
    )
    async for c in cursor:
        total += 1
        page = str(c.get("page") or "").strip() or "direct"
        pages[page] = pages.get(page, 0) + 1
        ref = _affiliate_referrer_domain(str(c.get("referrer") or "")) or "direct"
        refs[ref] = refs.get(ref, 0) + 1
        dev = str(c.get("device") or "").strip() or "unknown"
        devices[dev] = devices.get(dev, 0) + 1

    def _top(d, n=8):
        return [{"source": k, "clicks": v}
                for k, v in sorted(d.items(), key=lambda kv: kv[1], reverse=True)[:n]]

    return {
        "days": days,
        "total_clicks": total,
        "top_pages": _top(pages),
        "top_referrers": _top(refs),
        "devices": devices,
    }


@api.get("/affiliate/activity")  # noqa: F821
async def affiliate_activity(request: Request, limit: int = 20):
    """Flux d'activité récent de l'affilié : clics, commandes et paiements
    fusionnés, triés par date décroissante (type/at/label/status/amount)."""
    aff = await get_current_affiliate(request)  # noqa: F821
    limit = max(5, min(int(limit), 50))
    events = []

    clicks = await db.affiliate_clicks.find(
        {"affiliate_id": aff["id"]},
        {"_id": 0, "created_at": 1, "page": 1, "device": 1},
    ).sort("created_at", -1).to_list(limit)
    for c in clicks:
        events.append({
            "type": "click", "at": c.get("created_at"),
            "label": str(c.get("page") or ""), "device": str(c.get("device") or ""),
        })

    referrals = await db.affiliate_referrals.find(
        {"affiliate_id": aff["id"], "status": {"$ne": "excluded"}},
        {"_id": 0, "order_number": 1, "status": 1, "commission_amount": 1,
         "base_amount": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit)
    for r in referrals:
        events.append({
            "type": "referral", "at": r.get("created_at"),
            "label": str(r.get("order_number") or ""), "status": r.get("status"),
            "amount": round(float(r.get("commission_amount") or 0), 2),
            "base": round(float(r.get("base_amount") or 0), 2),
        })

    payouts = await db.affiliate_payouts.find(
        {"affiliate_id": aff["id"]},
        {"_id": 0, "period": 1, "status": 1, "amount": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(limit)
    for p in payouts:
        events.append({
            "type": "payout", "at": p.get("created_at"),
            "label": str(p.get("period") or ""), "status": p.get("status"),
            "amount": round(float(p.get("amount") or 0), 2),
        })

    events.sort(key=lambda e: str(e.get("at") or ""), reverse=True)
    return events[:limit]


@api.get("/affiliate/ref/{code}")  # noqa: F821
async def affiliate_ref(code: str, request: Request, response: Response,
                        page: str = "", referrer: str = "", device: str = ""):
    """Endpoint de tracking : pose le cookie et renvoie ok. Le frontend appelle
    ceci au 1er chargement quand ?ref=CODE est présent dans l'URL.
    page/referrer/device (optionnels) alimentent l'analyse des sources."""
    _rate_limit("affiliate_ref", _client_ip(request), 60, 60,  # noqa: F821
                "Trop de requêtes.")
    await affiliate_capture_click(request, response, code,
                                  page=page, referrer=referrer, device=device)
    return {"ok": True}


# ===========================================================================
# ENDPOINTS — ADMIN
# ===========================================================================

@api.post("/admin/affiliates/invite")  # noqa: F821
async def admin_affiliate_invite(payload: AffiliateInviteIn,
                                 admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Crée (ou ré-invite) un affilié verrouillé à un email. Envoie l'email."""
    email = payload.email.lower().strip()
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(hours=AFFILIATE_INVITE_TTL_HOURS)).isoformat()

    existing = await db.affiliates.find_one({"email": email}, {"_id": 0})
    if existing and existing.get("status") == "active":
        raise HTTPException(409, "This email is already an active affiliate")

    if existing:
        # ré-invitation : régénère le token, l'ancien meurt
        await db.affiliates.update_one(
            {"id": existing["id"]},
            {"$set": {
                "invite_token_hash": _affiliate_hash_token(raw),
                "invite_expires_at": expires,
                "name": payload.name.strip(),
                "status": "invited",
                "payout_currency": payload.payout_currency or "btc",
                "invite_last_sent_at": now.isoformat(),
            },
             "$inc": {"invite_sent_count": 1}},
        )
        aff_id = existing["id"]
    else:
        aff_id = str(uuid.uuid4())
        await db.affiliates.insert_one({
            "id": aff_id,
            "email": email,
            "name": payload.name.strip(),
            "code": None,
            "user_id": None,
            "status": "invited",
            "compliance_status": "compliant",
            "manual_tier": None,
            "commission_note": payload.commission_note or "",
            "payout_currency": payload.payout_currency or "btc",
            "payout_address": "",
            "ip_hash": None,
            "known_addresses": [],
            "invite_token_hash": _affiliate_hash_token(raw),
            "invite_expires_at": expires,
            "invite_sent_count": 1,
            "invite_last_sent_at": now.isoformat(),
            "created_at": now.isoformat(),
            "activated_at": None,
        })

    base = _trusted_public_base_url()
    link = f"{base}/affiliate/join?token={raw}"
    await _affiliate_send_invite(email, payload.name.strip(), link, payload.lang or "fr")
    return {"ok": True, "affiliate_id": aff_id, "invite_link": link}


@api.post("/admin/affiliates/{affiliate_id}/resend-invite")  # noqa: F821
async def admin_affiliate_resend(affiliate_id: str,
                                 admin: dict = Depends(get_admin_user)):  # noqa: F821
    aff = await db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
    if not aff:
        raise HTTPException(404, "Affiliate not found")
    if aff.get("status") == "active":
        raise HTTPException(400, "Affiliate already active — no invite to resend")
    _rate_limit("affiliate_invite", affiliate_id, AFFILIATE_INVITE_MAX,  # noqa: F821
                AFFILIATE_INVITE_WINDOW, "Trop de renvois. Réessayez plus tard.")
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(hours=AFFILIATE_INVITE_TTL_HOURS)).isoformat()
    await db.affiliates.update_one(
        {"id": affiliate_id},
        {"$set": {"invite_token_hash": _affiliate_hash_token(raw),
                  "invite_expires_at": expires,
                  "status": "invited",
                  "invite_last_sent_at": now.isoformat()},
         "$inc": {"invite_sent_count": 1}},
    )
    base = _trusted_public_base_url()
    link = f"{base}/affiliate/join?token={raw}"
    await _affiliate_send_invite(aff["email"], aff.get("name", ""), link,
                                 "fr")
    return {"ok": True, "invite_link": link, "sent_to": aff["email"]}


class AffiliateBulkInviteRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: str = Field(min_length=1, max_length=320)
    name: Optional[str] = ""


class AffiliateBulkInviteIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rows: List[AffiliateBulkInviteRow] = Field(min_length=1, max_length=500)
    commission_note: Optional[str] = ""
    payout_currency: Optional[str] = "btc"
    lang: str = "fr"


@api.post("/admin/affiliates/bulk-invite")  # noqa: F821
async def admin_affiliate_bulk_invite(payload: AffiliateBulkInviteIn,
                                      admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Invite en masse depuis un CSV parsé côté client.
    - Génère un code affilié unique à l'avance (pré-provisionné) pour chaque nouvelle invitation.
    - Ré-invite si l'email existe déjà en statut invité/suspendu (nouveau token).
    - Ignore si l'affilié est déjà actif.
    - Envoie l'email d'invitation via Resend.
    Retourne un résumé détaillé (succès, ignorés, échecs)."""
    lang = (payload.lang or "fr").lower()
    if lang not in ("fr", "en"):
        lang = "fr"
    base = _trusted_public_base_url()
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(hours=AFFILIATE_INVITE_TTL_HOURS)).isoformat()

    results: list = []
    skipped: list = []
    failed: list = []
    seen_emails: set = set()

    for row in payload.rows:
        email = (row.email or "").lower().strip()
        name = (row.name or "").strip() or email.split("@")[0]
        if not email:
            failed.append({"email": row.email, "error": "Missing email"})
            continue
        # validation email basique (regex simple, robuste et sans lever)
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            failed.append({"email": email, "error": "Invalid email format"})
            continue
        if email in seen_emails:
            skipped.append({"email": email, "reason": "Duplicate in CSV"})
            continue
        seen_emails.add(email)

        try:
            existing = await db.affiliates.find_one({"email": email}, {"_id": 0})
            if existing and existing.get("status") == "active":
                skipped.append({"email": email, "reason": "Already active"})
                continue

            # Pré-génération d'un code unique (utilisé lors de l'activation).
            code = _affiliate_gen_code()
            for _ in range(6):
                if not await db.affiliates.find_one({"code": code}, {"_id": 1}):
                    break
                code = _affiliate_gen_code()

            raw = secrets.token_urlsafe(32)
            token_hash = _affiliate_hash_token(raw)

            if existing:
                await db.affiliates.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "invite_token_hash": token_hash,
                        "invite_expires_at": expires,
                        "name": name,
                        "status": "invited",
                        "payout_currency": (payload.payout_currency or existing.get("payout_currency") or "btc"),
                        "invite_last_sent_at": now.isoformat(),
                        # code pré-provisionné seulement si l'affilié n'en a pas encore
                        **({"code": code} if not existing.get("code") else {}),
                     },
                     "$inc": {"invite_sent_count": 1}},
                )
                aff_id = existing["id"]
                assigned_code = existing.get("code") or code
            else:
                aff_id = str(uuid.uuid4())
                await db.affiliates.insert_one({
                    "id": aff_id,
                    "email": email,
                    "name": name,
                    "code": code,
                    "user_id": None,
                    "status": "invited",
                    "compliance_status": "compliant",
                    "manual_tier": None,
                    "commission_note": payload.commission_note or "",
                    "payout_currency": payload.payout_currency or "btc",
                    "payout_address": "",
                    "ip_hash": None,
                    "known_addresses": [],
                    "invite_token_hash": token_hash,
                    "invite_expires_at": expires,
                    "invite_sent_count": 1,
                    "invite_last_sent_at": now.isoformat(),
                    "created_at": now.isoformat(),
                    "activated_at": None,
                    "source": "bulk_csv",
                })
                assigned_code = code

            link = f"{base}/affiliate/join?token={raw}"
            try:
                await _affiliate_send_invite(email, name, link, lang)
                email_status = "sent"
            except Exception as e:
                logging.warning("[affiliate] bulk-invite email failed for %s: %s", email, e)
                email_status = f"email_error: {e}"

            results.append({
                "email": email,
                "name": name,
                "affiliate_id": aff_id,
                "code": assigned_code,
                "invite_link": link,
                "email_status": email_status,
            })
        except Exception as e:
            logging.exception("[affiliate] bulk-invite failed for %s", email)
            failed.append({"email": email, "error": str(e)})

    return {
        "ok": True,
        "total": len(payload.rows),
        "sent": len(results),
        "skipped": skipped,
        "failed": failed,
        "results": results,
    }


@api.get("/admin/affiliates")  # noqa: F821
async def admin_affiliates_list(admin: dict = Depends(get_admin_user)):  # noqa: F821
    rows = await db.affiliates.find(
        {}, {"_id": 0, "invite_token_hash": 0}
    ).sort("created_at", -1).to_list(1000)
    out = []
    for aff in rows:
        metrics = await _affiliate_compute_metrics(aff["id"]) if aff.get("status") == "active" else None
        item = dict(aff)
        if metrics:
            item.update({
                "cumulative_revenue": metrics["cumulative_revenue"],
                "quarter_revenue": metrics["quarter_revenue"],
                "tier": metrics["tier"],
                "commission_rate": metrics["commission_rate"],
                "pending_commission": metrics["pending_commission"],
                "approved_commission": metrics["approved_commission"],
                "paid_commission": metrics["paid_commission"],
            })
        out.append(item)

    # Clics + dernier clic par affilié (colonne liste + tri)
    click_stats = {}
    async for grp in db.affiliate_clicks.aggregate([
        {"$group": {"_id": "$affiliate_id",
                    "clicks": {"$sum": 1},
                    "last": {"$max": "$created_at"}}}
    ]):
        click_stats[grp["_id"]] = {
            "clicks": int(grp.get("clicks", 0)),
            "last": grp.get("last"),
        }
    for item in out:
        cs = click_stats.get(item["id"], {})
        item["clicks"] = cs.get("clicks", 0)
        item["last_click_at"] = cs.get("last")
    return out


# ===========================================================================
# ===== FIRONOVA_AFFILIATE_ADMIN_OVERVIEW_START =====
# Endpoints manquants requis par AdminAffiliates.jsx (sinon la page casse).

@api.get("/admin/affiliates/overview")  # noqa: F821
async def admin_affiliates_overview(admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Vue d'ensemble du programme d'affiliation : finances, effectifs,
    alertes, attribution, série mensuelle, top affiliés, distribution tiers."""
    now = datetime.now(timezone.utc)

    # --- Effectifs ---
    active = await db.affiliates.count_documents({"status": "active"})
    invited = await db.affiliates.count_documents({"status": "invited"})
    suspended = await db.affiliates.count_documents({"status": "suspended"})

    # --- Finances (depuis les referrals) ---
    referrals = await db.affiliate_referrals.find(
        {"status": {"$ne": "excluded"}},
        {"_id": 0, "status": 1, "commission_amount": 1, "order_total": 1, "created_at": 1, "affiliate_id": 1},
    ).to_list(5000)
    commission_pending = commission_due = commission_paid = commission_reversed = 0.0
    validated_orders = 0
    validated_revenue = 0.0
    monthly = {}
    per_aff = {}
    for r in referrals:
        st = str(r.get("status", "")).lower()
        comm = float(r.get("commission_amount", 0.0))
        rev = float(r.get("order_total", 0.0))
        if st == "pending":
            commission_pending += comm
        elif st == "approved":
            commission_due += comm
        elif st == "paid":
            commission_paid += comm
        elif st in ("reversed", "refunded"):
            commission_reversed += comm
        if st in ("approved", "paid"):
            validated_orders += 1
            validated_revenue += rev
            mk = str(r.get("created_at", ""))[:7]
            mm = monthly.setdefault(mk, {"month": mk, "revenue": 0.0, "commission": 0.0})
            mm["revenue"] += rev
            mm["commission"] += comm
            pa = per_aff.setdefault(r.get("affiliate_id"), {"revenue": 0.0, "commission": 0.0})
            pa["revenue"] += rev
            pa["commission"] += comm

    avg_order_value = (validated_revenue / validated_orders) if validated_orders else 0.0
    monthly_series = [monthly[k] for k in sorted(monthly.keys())][-12:]
    for m in monthly_series:
        m["revenue"] = round(m["revenue"], 2)
        m["commission"] = round(m["commission"], 2)

    # --- Top affiliés (par revenu validé) ---
    top_ids = sorted(per_aff.keys(), key=lambda k: per_aff[k]["revenue"], reverse=True)[:5]
    top_affiliates = []
    for aid in top_ids:
        a = await db.affiliates.find_one({"id": aid}, {"_id": 0, "code": 1, "name": 1})
        if a:
            top_affiliates.append({
                "code": a.get("code"), "name": a.get("name"),
                "revenue": round(per_aff[aid]["revenue"], 2),
                "commission": round(per_aff[aid]["commission"], 2),
            })

    # --- Distribution des tiers ---
    tier_distribution = {}
    async for a in db.affiliates.find({"status": "active"}, {"_id": 0, "id": 1, "manual_tier": 1}):
        try:
            mt = await _affiliate_compute_metrics(a["id"])
            tier = str(mt.get("tier", "—"))
        except Exception:
            tier = "—"
        tier_distribution[tier] = tier_distribution.get(tier, 0) + 1

    # --- Attribution (clics / conversion) ---
    total_clicks = await db.affiliate_clicks.count_documents({})
    conversion_rate = (validated_orders / total_clicks) if total_clicks else None

    # --- Alertes ---
    ready = await db.affiliate_payouts.find({"status": "ready"}, {"_id": 0, "amount": 1}).to_list(1000)
    payouts_ready = len(ready)
    payouts_ready_amount = round(sum(float(p.get("amount", 0)) for p in ready), 2)
    invites_expired = await db.affiliates.count_documents(
        {"status": "invited", "invite_expires_at": {"$lt": now.isoformat()}}
    )
    compliance_review = await db.affiliates.count_documents({"compliance_status": "review"})
    commissions_maturing = await db.affiliate_referrals.count_documents({"status": "pending"})

    return {
        "financial": {
            "commission_pending": round(commission_pending, 2),
            "commission_due": round(commission_due, 2),
            "commission_paid": round(commission_paid, 2),
            "commission_reversed": round(commission_reversed, 2),
            "validated_orders": validated_orders,
            "validated_revenue": round(validated_revenue, 2),
            "avg_order_value": round(avg_order_value, 2),
        },
        "affiliates": {"active": active, "invited": invited, "suspended": suspended},
        "alerts": {
            "payouts_ready": payouts_ready,
            "payouts_ready_amount": payouts_ready_amount,
            "invites_expired": invites_expired,
            "compliance_review": compliance_review,
            "commissions_maturing": commissions_maturing,
        },
        "attribution": {
            "total_clicks": total_clicks,
            "conversion_rate": conversion_rate,
        },
        "monthly_series": monthly_series,
        "top_affiliates": top_affiliates,
        "tier_distribution": tier_distribution,
    }


@api.get("/admin/affiliates/clicks")  # noqa: F821
async def admin_affiliates_clicks(admin: dict = Depends(get_admin_user),  # noqa: F821
                                  days: int = 30):
    """Analyse d'attribution à l'échelle du programme : volume de clics,
    tendance quotidienne, top pages/référents/appareils et top affiliés par
    volume de clics."""
    days = max(7, min(int(days), 90))
    start_date = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    q = {"created_at": {"$gte": start_date.isoformat() + "T00:00:00"}}
    trend, per_aff, pages, refs, devices = {}, {}, {}, {}, {}
    total = 0
    cursor = db.affiliate_clicks.find(
        q, {"_id": 0, "created_at": 1, "affiliate_id": 1, "page": 1,
            "referrer": 1, "device": 1},
    )
    async for c in cursor:
        total += 1
        day = str(c.get("created_at", ""))[:10]
        trend[day] = trend.get(day, 0) + 1
        aid = c.get("affiliate_id")
        if aid:
            per_aff[aid] = per_aff.get(aid, 0) + 1
        page = str(c.get("page") or "").strip() or "direct"
        pages[page] = pages.get(page, 0) + 1
        ref = _affiliate_referrer_domain(str(c.get("referrer") or "")) or "direct"
        refs[ref] = refs.get(ref, 0) + 1
        dev = str(c.get("device") or "").strip() or "unknown"
        devices[dev] = devices.get(dev, 0) + 1

    top_affiliates = []
    for aid, n in sorted(per_aff.items(), key=lambda kv: kv[1], reverse=True)[:10]:
        a = await db.affiliates.find_one({"id": aid}, {"_id": 0, "name": 1, "code": 1})
        top_affiliates.append({
            "id": aid, "name": (a or {}).get("name") or "—",
            "code": (a or {}).get("code") or "", "clicks": n,
        })

    series = []
    for i in range(days):
        d = (start_date + timedelta(days=i)).isoformat()
        series.append({"date": d, "clicks": trend.get(d, 0)})

    def _top(d, n=8):
        return [{"source": k, "clicks": v}
                for k, v in sorted(d.items(), key=lambda kv: kv[1], reverse=True)[:n]]

    # Conversions validées sur la même fenêtre (approved|paid)
    conversions_30d = 0
    rcursor = db.affiliate_referrals.find(
        {"status": {"$in": ["approved", "paid"]},
         "$or": [{"approved_at": {"$gte": start_date.isoformat() + "T00:00:00"}},
                 {"created_at": {"$gte": start_date.isoformat() + "T00:00:00"}}]},
        {"_id": 0, "approved_at": 1, "created_at": 1},
    )
    async for r in rcursor:
        ts = r.get("approved_at") or r.get("created_at")
        if str(ts or "")[:10] >= start_date.isoformat():
            conversions_30d += 1

    return {
        "days": days,
        "total_clicks": total,
        "conversions_30d": conversions_30d,
        "active_affiliates": len(per_aff),
        "trend": series,
        "top_pages": _top(pages),
        "top_referrers": _top(refs),
        "devices": devices,
        "top_affiliates": top_affiliates,
    }


@api.get("/admin/affiliates/risk")  # noqa: F821
async def admin_affiliates_risk(admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Détection de risque : referrals exclus (auto-parrainage, IP partagée)
    et affiliés à surveiller. Retourne la liste + le compte signalé."""
    flagged = await db.affiliate_referrals.find(
        {"status": "excluded"},
        {"_id": 0, "id": 1, "order_number": 1, "commission_amount": 1,
         "base_amount": 1, "excluded_reason": 1, "status": 1, "affiliate_id": 1},
    ).sort("created_at", -1).to_list(200)
    # Enrichir avec le code affilié
    for f in flagged:
        a = await db.affiliates.find_one({"id": f.get("affiliate_id")}, {"_id": 0, "code": 1})
        f["affiliate_code"] = a.get("code") if a else None
    return {"affiliates": flagged, "flagged_count": len(flagged)}
# ===== FIRONOVA_AFFILIATE_ADMIN_OVERVIEW_END =====


@api.get("/admin/affiliates/{affiliate_id}")  # noqa: F821
async def admin_affiliate_detail(affiliate_id: str,
                                 admin: dict = Depends(get_admin_user)):  # noqa: F821
    aff = await db.affiliates.find_one(
        {"id": affiliate_id}, {"_id": 0, "invite_token_hash": 0}
    )
    if not aff:
        raise HTTPException(404, "Affiliate not found")
    metrics = await _affiliate_compute_metrics(affiliate_id) if aff.get("status") == "active" else None
    referrals = await db.affiliate_referrals.find(
        {"affiliate_id": affiliate_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    payouts = await db.affiliate_payouts.find(
        {"affiliate_id": affiliate_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"affiliate": aff, "metrics": metrics,
            "referrals": referrals, "payouts": payouts}


@api.put("/admin/affiliates/{affiliate_id}")  # noqa: F821
async def admin_affiliate_update(affiliate_id: str, payload: AffiliateAdminUpdateIn,
                                 admin: dict = Depends(get_admin_user)):  # noqa: F821
    aff = await db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
    if not aff:
        raise HTTPException(404, "Affiliate not found")
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if update:
        await db.affiliates.update_one({"id": affiliate_id}, {"$set": update})
    fresh = await db.affiliates.find_one(
        {"id": affiliate_id}, {"_id": 0, "invite_token_hash": 0}
    )
    return fresh


@api.post("/admin/affiliates/payouts/run")  # noqa: F821
async def admin_affiliate_run_payouts(admin: dict = Depends(get_admin_user),  # noqa: F821
                                      period: Optional[str] = None):
    """Génère les payouts mensuels : agrège les commissions 'approved' par
    affilié en un relevé de payout (status 'ready'), marque les référrals
    comme rattachés. Le paiement crypto réel se fait ensuite hors-système,
    puis l'admin confirme via /mark-paid avec la référence de transaction."""
    now = datetime.now(timezone.utc)
    period = period or now.strftime("%Y-%m")
    created = []

    # Regroupe par affilié les commissions approuvées non encore payées
    pipeline = [
        {"$match": {"status": "approved", "payout_id": None}},
        {"$group": {"_id": "$affiliate_id",
                    "total": {"$sum": "$commission_amount"},
                    "ids": {"$push": "$id"}}},
    ]
    async for grp in db.affiliate_referrals.aggregate(pipeline):
        affiliate_id = grp["_id"]
        total = round(float(grp["total"]), 2)
        if total <= 0:
            continue
        aff = await db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
        if not aff or aff.get("status") != "active":
            continue
        payout_id = str(uuid.uuid4())
        await db.affiliate_payouts.insert_one({
            "id": payout_id,
            "affiliate_id": affiliate_id,
            "affiliate_code": aff.get("code"),
            "period": period,
            "amount": total,
            "currency": aff.get("payout_currency", "btc"),
            "payout_address": aff.get("payout_address", ""),
            "referral_ids": grp["ids"],
            "referral_count": len(grp["ids"]),
            "status": "ready",           # ready → paid
            "reference": None,
            "note": "",
            "created_at": now.isoformat(),
            "paid_at": None,
        })
        await db.affiliate_referrals.update_many(
            {"id": {"$in": grp["ids"]}},
            {"$set": {"payout_id": payout_id}},
        )
        created.append({"affiliate_id": affiliate_id, "amount": total,
                        "payout_id": payout_id})
    return {"ok": True, "period": period, "payouts_created": len(created),
            "detail": created}


@api.post("/admin/affiliates/payouts/{payout_id}/mark-paid")  # noqa: F821
async def admin_affiliate_mark_paid(payout_id: str, payload: AffiliatePayoutMarkIn,
                                    admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Confirme le paiement crypto : enregistre la référence de transaction
    (traçabilité), passe le payout + ses référrals à 'paid'."""
    payout = await db.affiliate_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(404, "Payout not found")
    if payout.get("status") == "paid":
        raise HTTPException(400, "Payout already marked paid")
    now = datetime.now(timezone.utc).isoformat()
    await db.affiliate_payouts.update_one(
        {"id": payout_id},
        {"$set": {"status": "paid", "reference": payload.reference.strip(),
                  "note": payload.note or "", "paid_at": now,
                  "paid_by": admin.get("email")}},
    )
    await db.affiliate_referrals.update_many(
        {"payout_id": payout_id, "status": {"$in": ["pending", "approved"]}},
        {"$set": {"status": "paid", "paid_at": now}},
    )
    fresh = await db.affiliate_payouts.find_one({"id": payout_id}, {"_id": 0})
    return fresh


@api.get("/admin/affiliates/payouts/all")  # noqa: F821
async def admin_affiliate_payouts_all(admin: dict = Depends(get_admin_user),  # noqa: F821
                                      status: Optional[str] = None):
    filt = {}
    if status:
        filt["status"] = status
    rows = await db.affiliate_payouts.find(filt, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rows

# ===== FIRONOVA_AFFILIATE_BLOCK_END =====



# ===== FIRONOVA_SEO_BACKEND_START =====
@api.get("/seo/health")
async def seo_health():
    return {"ok": True, "source": "fironova"}

@api.get("/seo/sitemap")
async def seo_sitemap():
    return {"sitemap": ["/", "/catalog", "/about", "/faq", "/privacy", "/compliance"]}

# ===== FIRONOVA_SEO_BACKEND_END =====



# ===== FIRONOVA_RELATED_PRODUCTS_START =====
@api.get("/products/{slug}/related")
async def get_related_products(slug: str, limit: int = 4):
    """Produits reliés : même catégorie d'abord, complétés par des vedettes.
    Déterministe, sans ML. Sert le cross-sell « souvent recherché avec »."""
    base = await db.products.find_one({"slug": slug}, {"_id": 0, "category": 1, "id": 1})
    if not base:
        raise HTTPException(404, "Product not found")
    limit = max(1, min(limit, 8))
    seen = {base.get("id")}
    out = []
    # 1) même catégorie, en stock en priorité
    same = await db.products.find(
        {"active": True, "category": base.get("category"), "slug": {"$ne": slug}},
        {"_id": 0},
    ).sort("featured", -1).to_list(50)
    for p in same:
        if p.get("id") in seen:
            continue
        seen.add(p.get("id")); out.append(p)
        if len(out) >= limit:
            return out
    # 2) compléter avec des vedettes d'autres catégories
    feat = await db.products.find(
        {"active": True, "featured": True, "slug": {"$ne": slug}},
        {"_id": 0},
    ).to_list(50)
    for p in feat:
        if p.get("id") in seen:
            continue
        seen.add(p.get("id")); out.append(p)
        if len(out) >= limit:
            break
    return out
# ===== FIRONOVA_RELATED_PRODUCTS_END =====



# ===== FIRONOVA_CUSTOMERS_ENRICHED_START =====
@api.get("/admin/customers/{user_id}")
async def admin_customer_detail(user_id: str, _admin: dict = Depends(require_area("customers", "view"))):
    """Fiche client complète avec historique de commandes."""
    u = await db.users.find_one(
        {"id": user_id}, {"_id": 0, "password_hash": 0, "token_version": 0}
    )
    if not u:
        raise HTTPException(404, "Customer not found")
    orders = await db.orders.find(
        {"email": (u.get("email") or "").lower()}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    paid = [o for o in orders if o.get("payment_status") == "paid"]
    total_spent = round(sum(o.get("total", 0) for o in paid), 2)
    aov = round(total_spent / len(paid), 2) if paid else 0.0
    return {
        "customer": u,
        "orders": orders,
        "summary": {
            "total_spent": total_spent,
            "paid_orders": len(paid),
            "all_orders": len(orders),
            "aov": aov,
        },
    }
# ===== FIRONOVA_CUSTOMERS_ENRICHED_END =====



# ===== FIRONOVA_ANALYTICS_ENHANCED_START =====
TAX_THRESHOLD_CAD = 30000.0          # seuil d'inscription TPS/TVQ (petit fournisseur)
TAX_ALERT_RATIO = 0.80               # alerte "approche" à 80 % du seuil
_UNPAID = ["pending", "awaiting_etransfer", "awaiting_crypto"]


def _pct_change(cur: float, prev: float):
    """Variation en % ; None si base précédente nulle (évite division par zéro)."""
    if prev == 0:
        return None
    return round((cur - prev) / prev * 100, 1)


@api.get("/admin/analytics/enhanced")  # noqa: F821
async def admin_analytics_enhanced(period: int = 30,
                                   _admin: dict = Depends(require_area("dashboard", "view"))):  # noqa: F821
    """Métriques de pilotage avec comparaison période courante vs précédente."""
    if period not in (7, 30, 90):
        period = 30
    now = datetime.now(timezone.utc)
    cur_start = now - timedelta(days=period)
    prev_start = now - timedelta(days=period * 2)
    cur_start_s = cur_start.isoformat()
    prev_start_s = prev_start.isoformat()

    # ---- Période courante : commandes payées ----
    async def _period_stats(start_s: str, end_s: str) -> dict:
        cur = db.orders.aggregate([  # noqa: F821
            {"$match": {"payment_status": "paid",
                        "created_at": {"$gte": start_s, "$lt": end_s}}},
            {"$group": {"_id": None,
                        "revenue": {"$sum": "$total"},
                        "orders": {"$sum": 1}}},
        ])
        doc = await cur.to_list(1)
        rev = round(doc[0]["revenue"], 2) if doc else 0.0
        n = doc[0]["orders"] if doc else 0
        return {"revenue": rev, "orders": n, "aov": round(rev / n, 2) if n else 0.0}

    current = await _period_stats(cur_start_s, now.isoformat())
    previous = await _period_stats(prev_start_s, cur_start_s)

    # ---- Conversion : payées / créées (toutes, sur la période courante) ----
    created = await db.orders.count_documents(  # noqa: F821
        {"created_at": {"$gte": cur_start_s}})
    paid = await db.orders.count_documents(  # noqa: F821
        {"created_at": {"$gte": cur_start_s}, "payment_status": "paid"})
    abandoned = await db.orders.count_documents(  # noqa: F821
        {"created_at": {"$gte": cur_start_s}, "payment_status": {"$in": _UNPAID}})
    conversion = round(paid / created * 100, 1) if created else None

    # ---- Nouveaux vs récurrents (clients ayant payé sur la période) ----
    cur = db.orders.aggregate([  # noqa: F821
        {"$match": {"payment_status": "paid", "created_at": {"$gte": cur_start_s},
                    "email": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$email"}},
    ])
    period_emails = [d["_id"] async for d in cur]
    new_customers = 0
    returning_customers = 0
    for em in period_emails:
        prior = await db.orders.count_documents(  # noqa: F821
            {"email": em, "payment_status": "paid", "created_at": {"$lt": cur_start_s}})
        if prior > 0:
            returning_customers += 1
        else:
            new_customers += 1

    # ---- Alerte seuil de taxe : CA payé sur 12 mois glissants ----
    twelve_start = (now - timedelta(days=365)).isoformat()
    ytd_cur = db.orders.aggregate([  # noqa: F821
        {"$match": {"payment_status": "paid", "created_at": {"$gte": twelve_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ])
    ytd_doc = await ytd_cur.to_list(1)
    rolling_12mo = round(ytd_doc[0]["total"], 2) if ytd_doc else 0.0
    ratio = rolling_12mo / TAX_THRESHOLD_CAD if TAX_THRESHOLD_CAD else 0
    if rolling_12mo >= TAX_THRESHOLD_CAD:
        tax_level = "exceeded"
    elif ratio >= TAX_ALERT_RATIO:
        tax_level = "approaching"
    else:
        tax_level = "ok"

    return {
        "period_days": period,
        "current": current,
        "previous": previous,
        "changes": {
            "revenue": _pct_change(current["revenue"], previous["revenue"]),
            "orders": _pct_change(current["orders"], previous["orders"]),
            "aov": _pct_change(current["aov"], previous["aov"]),
        },
        "conversion": {
            "orders_created": created,
            "orders_paid": paid,
            "orders_abandoned": abandoned,
            "conversion_rate": conversion,
        },
        "customers": {
            "new": new_customers,
            "returning": returning_customers,
            "total_active": len(period_emails),
        },
        "tax_threshold": {
            "rolling_12mo_revenue": rolling_12mo,
            "threshold": TAX_THRESHOLD_CAD,
            "ratio": round(ratio, 3),
            "level": tax_level,            # ok | approaching | exceeded
            "remaining": round(max(0.0, TAX_THRESHOLD_CAD - rolling_12mo), 2),
        },
    }

# ===== FIRONOVA_ANALYTICS_ENHANCED_END =====



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
    await send_template_email("abandoned_cart", email, "fr", {"customer_name": "", "cart_url": (PUBLIC_BASE_URL or "").rstrip("/") + "/cart"})  # noqa: F821


async def welcome_new_user(email: str, name: str = "", lang: str = "fr") -> None:
    """Email de bienvenue à l'inscription (via le centre de gestion des courriels)."""
    if not email:
        return
    await send_template_email("welcome", email, lang, {"customer_name": name or ("là" if str(lang).startswith("fr") else "there")})


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
            cursor = db.orders.find(query, {"_id": 0})  # noqa: F821
            async for order in cursor:
                # Marque AVANT l'envoi (idempotence : jamais deux rappels)
                res = await db.orders.update_one(  # noqa: F821
                    {"id": order["id"], "abandoned_reminder_sent": {"$ne": True}},
                    {"$set": {"abandoned_reminder_sent": True,
                              "abandoned_reminder_at": now.isoformat()}},
                )
                if res.modified_count == 1:
                    try:
                        await send_abandoned_cart_reminder(order)
                        logging.info("[abandoned-cart] rappel envoyé pour %s", order.get("order_number"))
                    except Exception as e:
                        logging.error("[abandoned-cart] échec envoi %s: %s", order.get("id"), e)
        except Exception as e:
            logging.error("[abandoned-cart] watchdog error: %s", e)
        await asyncio.sleep(ABANDON_SWEEP_MINUTES * 60)

# ===== FIRONOVA_EMAIL_AUTOMATION_END =====



# ===== FIRONOVA_SEO_BLOCK_START =====
SEO_ORIGIN = os.environ.get("PUBLIC_BASE_URL", "https://fironova.com").rstrip("/")  # noqa: F821

# Pages statiques indexables (doit rester cohérent avec robots.txt)
SEO_STATIC_PAGES = [
    ("/", "weekly", "1.0"),
    ("/catalog", "weekly", "0.9"),
    ("/about", "monthly", "0.6"),
    ("/compliance", "monthly", "0.7"),
    ("/faq", "monthly", "0.7"),
    ("/privacy", "yearly", "0.4"),
]


def _seo_xml_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


@api.get("/sitemap.xml")  # noqa: F821
async def dynamic_sitemap():
    """Sitemap généré à la volée : pages statiques + toutes les fiches produits
    actives. Un produit ajouté apparaît automatiquement — plus de sitemap figé."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    for path, freq, prio in SEO_STATIC_PAGES:
        parts.append(
            f"  <url><loc>{SEO_ORIGIN}{path}</loc>"
            f"<changefreq>{freq}</changefreq><priority>{prio}</priority></url>"
        )

    # Produits actifs
    cursor = db.products.find(  # noqa: F821
        {"active": True},
        {"_id": 0, "slug": 1, "updated_at": 1, "created_at": 1},
    )
    async for p in cursor:
        slug = p.get("slug")
        if not slug:
            continue
        lastmod = (p.get("updated_at") or p.get("created_at") or "")[:10]
        lastmod_tag = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
        parts.append(
            f"  <url><loc>{SEO_ORIGIN}/product/{_seo_xml_escape(slug)}</loc>"
            f"{lastmod_tag}<changefreq>weekly</changefreq><priority>0.8</priority></url>"
        )

    parts.append("</urlset>")
    return Response(content="\n".join(parts), media_type="application/xml")


@api.get("/seo/product/{slug}")  # noqa: F821
async def product_seo(slug: str):
    """Métadonnées SEO d'un produit : title/description/og + JSON-LD Product
    prêt à injecter. Le front appelle ça et remplit le <head> de la fiche."""
    p = await db.products.find_one({"slug": slug, "active": True}, {"_id": 0})  # noqa: F821
    if not p:
        raise HTTPException(404, "Product not found")  # noqa: F821

    variants = p.get("variants", []) or []
    prices = [float(v.get("price", 0)) for v in variants if v.get("price")]
    low_price = min(prices) if prices else float(p.get("price_cad", 0) or 0)
    in_stock = any(int(v.get("stock", 0) or 0) > 0 for v in variants) or int(p.get("stock", 0) or 0) > 0
    img = p.get("og_image_url") or p.get("image_url") or ""
    if img and img.startswith("/"):
        img = SEO_ORIGIN + img

    def _meta(lang: str) -> dict:
        name = p.get(f"name_{lang}") or p.get("name_en") or slug
        title = p.get(f"meta_title_{lang}") or f"{name} — Fironova"
        desc = p.get(f"meta_description_{lang}") or ""
        if not desc:
            raw = p.get(f"description_{lang}") or p.get("description_en") or ""
            desc = (raw[:157] + "…") if len(raw) > 158 else raw
        return {"title": title, "description": desc, "name": name}

    # JSON-LD Product (schema.org) — anglais comme langue canonique du balisage
    en = _meta("en")
    jsonld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": en["name"],
        "description": en["description"],
        "sku": p.get("slug"),
        "brand": {"@type": "Brand", "name": "Fironova"},
        "category": p.get("category", ""),
    }
    if img:
        jsonld["image"] = img
    if p.get("molecular_formula"):
        jsonld["additionalProperty"] = [{
            "@type": "PropertyValue", "name": "Molecular formula",
            "value": p.get("molecular_formula"),
        }]
    if low_price > 0:
        jsonld["offers"] = {
            "@type": "Offer",
            "priceCurrency": "CAD",
            "price": round(low_price, 2),
            "availability": ("https://schema.org/InStock" if in_stock
                             else "https://schema.org/OutOfStock"),
            "url": f"{SEO_ORIGIN}/product/{slug}",
        }

    return {
        "slug": slug,
        "canonical": f"{SEO_ORIGIN}/product/{slug}",
        "image": img,
        "en": en,
        "fr": _meta("fr"),
        "jsonld": jsonld,
    }

# ===== FIRONOVA_SEO_BLOCK_END =====



# ===== FIRONOVA_SEO_ADMIN_BLOCK_START =====
# Valeurs par défaut si aucun réglage n'a encore été enregistré.
SEO_DEFAULTS = {
    "site_title_en": "Fironova — Research Peptides (For Research Use Only)",
    "site_title_fr": "Fironova — Peptides de recherche (RUO)",
    "site_description_en": "Fironova supplies research-grade peptides for laboratory use, with certificate-of-analysis documentation. For Research Use Only. Not for human consumption.",
    "site_description_fr": "Fironova fournit des peptides de qualité recherche pour usage en laboratoire, avec documentation de certificat d'analyse. Réservé à la recherche (RUO). Ne pas consommer.",
    "default_og_image": "",
    "keywords_en": "research peptides, laboratory, certificate of analysis, RUO",
    "keywords_fr": "peptides de recherche, laboratoire, certificat d'analyse, RUO",
}


class SeoSettingsIn(BaseModel):
    site_title_en: str = ""
    site_title_fr: str = ""
    site_description_en: str = ""
    site_description_fr: str = ""
    default_og_image: str = ""
    keywords_en: str = ""
    keywords_fr: str = ""


class ProductSeoIn(BaseModel):
    meta_title_en: str = ""
    meta_title_fr: str = ""
    meta_description_en: str = ""
    meta_description_fr: str = ""
    og_image_url: str = ""


async def _seo_get_settings() -> dict:
    doc = await db.seo_settings.find_one({"id": "global"}, {"_id": 0})  # noqa: F821
    if not doc:
        return dict(SEO_DEFAULTS)
    merged = dict(SEO_DEFAULTS)
    for k in SEO_DEFAULTS:
        if doc.get(k):
            merged[k] = doc[k]
    return merged


@api.get("/admin/seo/settings")  # noqa: F821
async def admin_seo_get_settings(admin: dict = Depends(get_admin_user)):  # noqa: F821
    return await _seo_get_settings()


@api.put("/admin/seo/settings")  # noqa: F821
async def admin_seo_set_settings(payload: SeoSettingsIn,
                                 admin: dict = Depends(get_admin_user)):  # noqa: F821
    data = {k: v for k, v in payload.model_dump().items()}
    data.update({
        "id": "global",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": admin.get("email"),
    })
    await db.seo_settings.update_one({"id": "global"}, {"$set": data}, upsert=True)  # noqa: F821
    return await _seo_get_settings()


@api.get("/admin/seo/health")  # noqa: F821
async def admin_seo_health(admin: dict = Depends(get_admin_user)):  # noqa: F821
    """État de santé SEO : combien de produits actifs, combien sans meta."""
    total = await db.products.count_documents({"active": True})  # noqa: F821
    missing_title = 0
    missing_desc = 0
    missing_image = 0
    async for p in db.products.find(  # noqa: F821
        {"active": True},
        {"_id": 0, "meta_title_en": 1, "meta_title_fr": 1,
         "meta_description_en": 1, "meta_description_fr": 1,
         "og_image_url": 1, "image_url": 1},
    ):
        if not (p.get("meta_title_en") or p.get("meta_title_fr")):
            missing_title += 1
        if not (p.get("meta_description_en") or p.get("meta_description_fr")):
            missing_desc += 1
        if not (p.get("og_image_url") or p.get("image_url")):
            missing_image += 1

    settings = await _seo_get_settings()
    global_ok = bool(settings.get("site_title_en") and settings.get("site_description_en"))

    return {
        "products_active": total,
        "products_missing_meta_title": missing_title,
        "products_missing_meta_description": missing_desc,
        "products_missing_image": missing_image,
        "products_fully_optimized": max(0, total - max(missing_title, missing_desc)),
        "global_seo_configured": global_ok,
        "default_og_image_set": bool(settings.get("default_og_image")),
        "sitemap_url": "/api/sitemap.xml",
    }


@api.get("/admin/seo/products")  # noqa: F821
async def admin_seo_products(admin: dict = Depends(get_admin_user)):  # noqa: F821
    """SEO de tous les produits, une ligne par produit (pour édition centralisée)."""
    rows = []
    async for p in db.products.find(  # noqa: F821
        {}, {"_id": 0, "slug": 1, "name_en": 1, "name_fr": 1, "active": 1,
             "meta_title_en": 1, "meta_title_fr": 1,
             "meta_description_en": 1, "meta_description_fr": 1,
             "og_image_url": 1, "image_url": 1},
    ):
        has_title = bool(p.get("meta_title_en") or p.get("meta_title_fr"))
        has_desc = bool(p.get("meta_description_en") or p.get("meta_description_fr"))
        rows.append({
            "slug": p.get("slug"),
            "name_en": p.get("name_en"),
            "name_fr": p.get("name_fr"),
            "active": p.get("active", False),
            "meta_title_en": p.get("meta_title_en", ""),
            "meta_title_fr": p.get("meta_title_fr", ""),
            "meta_description_en": p.get("meta_description_en", ""),
            "meta_description_fr": p.get("meta_description_fr", ""),
            "og_image_url": p.get("og_image_url", ""),
            "image_url": p.get("image_url", ""),
            "optimized": has_title and has_desc,
        })
    rows.sort(key=lambda r: (r["optimized"], not r["active"]))  # non-optimisés d'abord
    return {"products": rows}


@api.put("/admin/seo/products/{slug}")  # noqa: F821
async def admin_seo_update_product(slug: str, payload: ProductSeoIn,
                                   admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Édite uniquement les champs SEO d'un produit (sans toucher au reste)."""
    p = await db.products.find_one({"slug": slug}, {"_id": 0, "id": 1})  # noqa: F821
    if not p:
        raise HTTPException(404, "Product not found")  # noqa: F821
    await db.products.update_one(  # noqa: F821
        {"slug": slug},
        {"$set": {
            "meta_title_en": payload.meta_title_en,
            "meta_title_fr": payload.meta_title_fr,
            "meta_description_en": payload.meta_description_en,
            "meta_description_fr": payload.meta_description_fr,
            "og_image_url": payload.og_image_url,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "slug": slug}

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
    doc = await db.email_templates.find_one({"key": key}, {"_id": 0})
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
        </div>"""
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
        </div>"""
    if block == "items":
        items = order.get("items", [])
        rows = ""
        for it in items[:12]:
            name = it.get("name_en") or it.get("name_fr") or it.get("slug", "")
            qty = it.get("qty", 1)
            rows += f'<tr><td style="padding:6px 0;color:#1A2A38">{name}</td><td style="padding:6px 0;text-align:right;color:#3E5C76">× {qty}</td></tr>'
        total = order.get("total", 0)
        return f"""
        <div style="margin:8px 0 20px;border:1px solid #E2E8F0;border-radius:12px;padding:20px;background:#FBFDFE">
          <table style="width:100%;font-size:14px;border-collapse:collapse">{rows}
            <tr><td style="padding:12px 0 0;border-top:2px solid #0B2E4F;font-weight:bold">{L("Total","Total")}</td><td style="padding:12px 0 0;border-top:2px solid #0B2E4F;text-align:right;font-weight:bold">{total:.2f} $ CAD</td></tr>
          </table>
        </div>"""
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
            out = out.replace("{{" + k + "}}", str(v))
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
    body_html = "\n".join(parts)
    html = _nova_email_shell(sub(tpl.get("heading_fr", "")), sub(tpl.get("heading_en", "")),
                             body_html, cta_url=sub(tpl.get("cta_url", "")),
                             cta_label_fr=tpl.get("cta_label_fr", ""), cta_label_en=tpl.get("cta_label_en", ""))
    return subject, html


async def send_template_email(key: str, to: str, lang: str, ctx: dict, order: Optional[dict] = None):
    """Point d'entrée unifié : rend le template et envoie (respecte on/off via email_key)."""
    tpl = await _email_template_get(key)
    if not tpl:
        logging.warning("[email] template inconnu: %s", key); return
    subject, html = _email_render(tpl, lang, ctx or {}, order)
    await _send_email(to, subject, html, email_key=key)


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


@api.get("/admin/email-templates")
async def admin_email_templates_list(_admin: dict = Depends(require_area("settings", "view"))):
    keys = list(EMAIL_TEMPLATE_CATALOG.keys())
    custom = await db.email_templates.find({"key": {"$nin": keys}}, {"_id": 0, "key": 1}).to_list(100)
    keys += [c["key"] for c in custom]
    templates = [t for t in [await _email_template_get(k) for k in keys] if t]
    return {"templates": templates}


@api.post("/admin/email-templates")
async def admin_email_template_create(payload: EmailTemplateCreateIn,
                                      _admin: dict = Depends(require_area("settings", "manage"))):
    key = (payload.key or "").strip().lower().replace(" ", "_")
    if not key or not key.replace("_", "").isalnum():
        raise HTTPException(400, "Clé invalide (lettres, chiffres, underscores).")
    if key in EMAIL_TEMPLATE_CATALOG or await db.email_templates.find_one({"key": key}):
        raise HTTPException(409, "Un courriel avec cette clé existe déjà.")
    doc = payload.model_dump(exclude_none=True)
    doc["key"] = key
    doc.setdefault("label", key)
    doc.setdefault("block", "none")
    doc.setdefault("variables", [])
    doc["custom"] = True
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.email_templates.insert_one(dict(doc))
    asyncio.create_task(_log_action(_admin, "email_template_create", f"key={key}", "settings"))
    return await _email_template_get(key)


@api.put("/admin/email-templates/{key}")
async def admin_email_template_update(key: str, payload: EmailTemplateIn,
                                      _admin: dict = Depends(require_area("settings", "manage"))):
    exists = key in EMAIL_TEMPLATE_CATALOG or await db.email_templates.find_one({"key": key})
    if not exists:
        raise HTTPException(404, "Unknown template key")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    updates["key"] = key
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.email_templates.update_one({"key": key}, {"$set": updates}, upsert=True)
    asyncio.create_task(_log_action(_admin, "email_template_update",
                                    f"key={key} fields={list(payload.model_dump(exclude_none=True).keys())}", "settings"))
    return await _email_template_get(key)


@api.delete("/admin/email-templates/{key}")
async def admin_email_template_delete(key: str, _admin: dict = Depends(require_area("settings", "manage"))):
    if key in EMAIL_TEMPLATE_CATALOG:
        raise HTTPException(400, "Ce courriel est intégré et ne peut pas être supprimé. Utilisez Réinitialiser.")
    res = await db.email_templates.delete_one({"key": key})
    if res.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    asyncio.create_task(_log_action(_admin, "email_template_delete", f"key={key}", "settings"))
    return {"deleted": True, "key": key}


@api.post("/admin/email-templates/{key}/reset")
async def admin_email_template_reset(key: str, _admin: dict = Depends(require_area("settings", "manage"))):
    if key not in EMAIL_TEMPLATE_CATALOG:
        raise HTTPException(400, "Seuls les courriels intégrés peuvent être réinitialisés.")
    await db.email_templates.delete_one({"key": key})
    asyncio.create_task(_log_action(_admin, "email_template_reset", f"key={key}", "settings"))
    return await _email_template_get(key)


@api.post("/admin/email-templates/{key}/preview")
async def admin_email_template_preview(key: str, lang: str = "fr",
                                       _admin: dict = Depends(require_area("settings", "view"))):
    tpl = await _email_template_get(key)
    if not tpl:
        raise HTTPException(404, "Unknown template key")
    sample_order = {
        "payment_info": {"instructions": {"send_to": "orders@fironova.com", "amount_cad": 149.00,
                          "reference": "FN-26042", "security_question": "What is the brand name? (lowercase)",
                          "security_answer_hint": "fironova"},
                          "pay_address": "0xA1b2C3d4E5f6...", "pay_amount": "0.0021", "pay_currency": "eth",
                          "payment_url": "https://nowpayments.io/payment/xyz"},
        "items": [{"name_fr": "BPC-157 5mg", "name_en": "BPC-157 5mg", "qty": 2},
                  {"name_fr": "TB-500 5mg", "name_en": "TB-500 5mg", "qty": 1}],
        "total": 149.00, "tracking_number": "1Z999AA10123456784", "_refund_amount": 149.00,
    }
    ctx = {"order_number": "FN-26042", "customer_name": "Alex", "total": "149,00 $",
           "tracking_number": "1Z999AA10123456784", "tracking_url": "https://example.com/track",
           "amount": "149,00 $", "cart_url": "https://fironova.com/cart",
           "catalog_url": "https://fironova.com/catalog",
           "product_name": "BPC-157 5mg", "product_url": "https://fironova.com/p/bpc-157"}
    subject, html = _email_render(tpl, lang, ctx, sample_order)
    return {"subject": subject, "html": html}
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
        "catalog_url": (PUBLIC_BASE_URL or "").rstrip("/") + "/catalog",
        "cart_url": (PUBLIC_BASE_URL or "").rstrip("/") + "/cart",
    }
    return lang, order.get("email"), ctx
# ===== FIRONOVA_EMAIL_WIRING_END =====



# ===========================================================================
# ===== FIRONOVA_NOWPAYMENTS_PAYOUT_START =====
# Client Payouts NOWPayments + flux semi-automatique sécurisé.
#
# Flux (option "semi-auto sécurisé", cf. décision produit) :
#   1) L'admin exécute un payout "ready" -> le système obtient un JWT
#      (email/password NOWPayments), crée le payout via POST /v1/payout,
#      NOWPayments envoie un code 2FA à l'email du compte marchand.
#      -> statut interne: "creating" (en attente du 2FA).
#   2) L'admin saisit le code 2FA -> POST /v1/payout/{id}/verify.
#      -> statut interne: "processing" puis "paid" (via statut/IPN).
#
# Sécurité : aucun secret 2FA stocké. Le JWT est éphémère (5 min), obtenu à
# la demande. L'IP du serveur doit être whitelistée chez NOWPayments.
# Interrupteur: NOWPAYMENTS_PAYOUT_ENABLED (off => flux manuel conservé).
# ===========================================================================

NOWPAYMENTS_PAYOUT_ENABLED = os.environ.get("NOWPAYMENTS_PAYOUT_ENABLED", "false").lower() == "true"
NOWPAYMENTS_EMAIL = os.environ.get("NOWPAYMENTS_EMAIL", "")
NOWPAYMENTS_PASSWORD = os.environ.get("NOWPAYMENTS_PASSWORD", "")


class NowPaymentsPayoutError(Exception):
    """Erreur explicite côté payout NOWPayments (message sûr pour l'admin)."""


async def _np_auth_token() -> str:
    """Obtient un JWT NOWPayments (valide ~5 min). Requis pour les payouts."""
    if not (NOWPAYMENTS_EMAIL and NOWPAYMENTS_PASSWORD):
        raise NowPaymentsPayoutError(
            "Identifiants NOWPayments manquants (NOWPAYMENTS_EMAIL / NOWPAYMENTS_PASSWORD)."
        )
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.post(
                f"{NOWPAYMENTS_BASE_URL}/auth",
                json={"email": NOWPAYMENTS_EMAIL, "password": NOWPAYMENTS_PASSWORD},
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
    if not NOWPAYMENTS_API_KEY:
        raise NowPaymentsPayoutError("NOWPAYMENTS_API_KEY manquante.")
    token = await _np_auth_token()
    body = {"withdrawals": withdrawals}
    if description:
        body["payout_description"] = description
    if NOWPAYMENTS_IPN_SECRET:
        # callback pour maj auto des statuts (facultatif mais recommandé)
        base = (globals().get("PUBLIC_BASE_URL") or "").rstrip("/")
        if base:
            body["ipn_callback_url"] = f"{base}/api/webhook/nowpayments-payout"
    try:
        async with httpx.AsyncClient(timeout=30) as cx:
            r = await cx.post(
                f"{NOWPAYMENTS_BASE_URL}/payout",
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "x-api-key": NOWPAYMENTS_API_KEY,
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
    if not NOWPAYMENTS_API_KEY:
        raise NowPaymentsPayoutError("NOWPAYMENTS_API_KEY manquante.")
    token = await _np_auth_token()
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.post(
                f"{NOWPAYMENTS_BASE_URL}/payout/{batch_id}/verify",
                json={"verification_code": verification_code.strip()},
                headers={
                    "Authorization": f"Bearer {token}",
                    "x-api-key": NOWPAYMENTS_API_KEY,
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
    if not NOWPAYMENTS_API_KEY:
        raise NowPaymentsPayoutError("NOWPAYMENTS_API_KEY manquante.")
    try:
        async with httpx.AsyncClient(timeout=20) as cx:
            r = await cx.get(
                f"{NOWPAYMENTS_BASE_URL}/payout/{batch_id}",
                headers={"x-api-key": NOWPAYMENTS_API_KEY},
            )
    except httpx.HTTPError as e:
        raise NowPaymentsPayoutError(f"Statut payout indisponible: {e}")
    if r.status_code != 200:
        raise NowPaymentsPayoutError(f"Statut payout ({r.status_code}).")
    return r.json() or {}
# ===== FIRONOVA_NOWPAYMENTS_PAYOUT_END =====


# ===========================================================================
# ===== FIRONOVA_PAYOUT_ENDPOINTS_START =====

class PayoutVerifyIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    verification_code: str = Field(min_length=3, max_length=32)


@api.post("/admin/affiliates/payouts/{payout_id}/execute")  # noqa: F821
async def admin_payout_execute(payout_id: str, admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Étape 1/2 — crée le payout crypto via NOWPayments. Un code 2FA est
    envoyé par NOWPayments à l'email marchand. Le payout passe en 'creating'."""
    if not NOWPAYMENTS_PAYOUT_ENABLED:
        raise HTTPException(400, "Les payouts automatiques NOWPayments sont désactivés (NOWPAYMENTS_PAYOUT_ENABLED=false). Utilisez le paiement manuel + mark-paid.")
    payout = await db.affiliate_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(404, "Payout introuvable")
    if payout.get("status") not in ("ready", "failed"):
        raise HTTPException(400, f"Payout non exécutable (statut: {payout.get('status')})")
    address = (payout.get("payout_address") or "").strip()
    if not address:
        raise HTTPException(400, "Adresse de versement manquante pour cet affilié.")
    amount = float(payout.get("amount", 0))
    if amount <= 0:
        raise HTTPException(400, "Montant de payout invalide.")
    currency = (payout.get("currency") or "btc").lower()

    # Transition atomique de l'état "ready" vers "creating" pour éviter les
    # exécutions concurrentes et les doubles batches NOWPayments.
    now = datetime.now(timezone.utc).isoformat()
    claimed = await db.affiliate_payouts.update_one(
        {"id": payout_id, "status": {"$in": ["ready", "failed"]}},
        {"$set": {
            "status": "creating",
            "np_batch_id": None,
            "np_error": None,
            "executed_by": admin.get("email"),
            "executed_at": now,
            "updated_at": now,
        }},
    )
    if not claimed.modified_count:
        raise HTTPException(400, "Payout déjà en cours d'exécution ou déjà traité.")

    withdrawals = [{"address": address, "currency": currency, "amount": amount}]
    desc = f"Fironova affiliate {payout.get('affiliate_code')} — {payout.get('period')}"
    try:
        resp = await _np_create_payout(withdrawals, description=desc)
    except NowPaymentsPayoutError as e:
        await db.affiliate_payouts.update_one({"id": payout_id},
            {"$set": {"status": "failed", "np_error": str(e), "updated_at": datetime.now(timezone.utc).isoformat()}})
        raise HTTPException(502, str(e))

    batch_id = str(resp.get("id") or resp.get("batch_withdrawal_id") or "")
    if not batch_id:
        await db.affiliate_payouts.update_one({"id": payout_id},
            {"$set": {"status": "failed", "np_error": "NOWPayments n'a pas renvoyé d'identifiant de payout.", "updated_at": datetime.now(timezone.utc).isoformat()}})
        raise HTTPException(502, "NOWPayments n'a pas renvoyé d'identifiant de payout.")
    await db.affiliate_payouts.update_one({"id": payout_id}, {"$set": {
        "status": "creating", "np_batch_id": batch_id, "np_error": None,
        "executed_by": admin.get("email"), "executed_at": now,
    }})
    asyncio.create_task(_log_action(admin, "affiliate_payout_execute", f"payout={payout_id} batch={batch_id} amount={amount} {currency}", "settings"))
    return {"ok": True, "status": "creating", "np_batch_id": batch_id,
            "message": "Payout créé. Un code de vérification 2FA a été envoyé à l'adresse courriel du compte NOWPayments. Saisissez-le pour finaliser."}


@api.post("/admin/affiliates/payouts/{payout_id}/verify")  # noqa: F821
async def admin_payout_verify(payout_id: str, payload: PayoutVerifyIn,
                              admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Étape 2/2 — valide le payout avec le code 2FA reçu par email."""
    payout = await db.affiliate_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(404, "Payout introuvable")
    batch_id = payout.get("np_batch_id")
    if not batch_id or payout.get("status") != "creating":
        raise HTTPException(400, "Ce payout n'est pas en attente de vérification 2FA.")
    try:
        await _np_verify_payout(batch_id, payload.verification_code)
    except NowPaymentsPayoutError as e:
        raise HTTPException(502, str(e))

    now = datetime.now(timezone.utc).isoformat()
    await db.affiliate_payouts.update_one({"id": payout_id}, {"$set": {
        "status": "processing", "verified_by": admin.get("email"), "verified_at": now,
    }})
    asyncio.create_task(_log_action(admin, "affiliate_payout_verify", f"payout={payout_id} batch={batch_id}", "settings"))
    return {"ok": True, "status": "processing",
            "message": "Payout vérifié et en cours de traitement par NOWPayments."}


@api.get("/admin/affiliates/payouts/{payout_id}/status")  # noqa: F821
async def admin_payout_status(payout_id: str, admin: dict = Depends(get_admin_user)):  # noqa: F821
    """Rafraîchit le statut depuis NOWPayments et synchronise l'état interne."""
    payout = await db.affiliate_payouts.find_one({"id": payout_id}, {"_id": 0})
    if not payout:
        raise HTTPException(404, "Payout introuvable")
    batch_id = payout.get("np_batch_id")
    if not batch_id:
        return {"status": payout.get("status"), "np_status": None}
    try:
        data = await _np_payout_status(batch_id)
    except NowPaymentsPayoutError as e:
        raise HTTPException(502, str(e))
    np_status = str(data.get("status", "")).lower()
    # Mappe le statut NOWPayments vers l'état interne + finalise si terminé.
    mapped = payout.get("status")
    if np_status in ("finished", "sent", "completed"):
        mapped = "paid"
    elif np_status in ("failed", "rejected"):
        mapped = "failed"
    elif np_status in ("processing", "sending", "waiting", "confirming"):
        mapped = "processing"
    if mapped != payout.get("status"):
        now = datetime.now(timezone.utc).isoformat()
        upd = {"status": mapped, "np_status": np_status, "updated_at": now}
        if mapped == "paid":
            upd["paid_at"] = now
            upd["reference"] = str(data.get("id") or batch_id)
            await db.affiliate_referrals.update_many(
                {"payout_id": payout_id, "status": {"$in": ["pending", "approved"]}},
                {"$set": {"status": "paid", "paid_at": now}},
            )
        await db.affiliate_payouts.update_one({"id": payout_id}, {"$set": upd})
    return {"status": mapped, "np_status": np_status}


@api.post("/webhook/nowpayments-payout")  # noqa: F821
async def nowpayments_payout_ipn(request: Request):
    """IPN payout : NOWPayments notifie les changements de statut.
    Signature HMAC-SHA512 vérifiée (même schéma que l'IPN paiement)."""
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
        raw,
        hashlib.sha512,
    ).hexdigest()
    if not sig or not hmac.compare_digest(expected, sig):
        logging.warning("NOWPayments payout IPN: signature invalide")
        raise HTTPException(401, "Invalid signature")

    batch_id = str(payload.get("id") or payload.get("batch_withdrawal_id") or "")
    np_status = str(payload.get("status", "")).lower()
    if not batch_id:
        return {"ok": True}
    payout = await db.affiliate_payouts.find_one({"np_batch_id": batch_id}, {"_id": 0})
    if not payout:
        return {"ok": True}
    now = datetime.now(timezone.utc).isoformat()
    if np_status in ("finished", "sent", "completed"):
        await db.affiliate_payouts.update_one({"id": payout["id"]},
            {"$set": {"status": "paid", "np_status": np_status, "paid_at": now, "reference": batch_id}})
        await db.affiliate_referrals.update_many(
            {"payout_id": payout["id"], "status": {"$in": ["pending", "approved"]}},
            {"$set": {"status": "paid", "paid_at": now}},
        )
    elif np_status in ("failed", "rejected"):
        await db.affiliate_payouts.update_one({"id": payout["id"]},
            {"$set": {"status": "failed", "np_status": np_status, "updated_at": now}})
    else:
        await db.affiliate_payouts.update_one({"id": payout["id"]},
            {"$set": {"np_status": np_status, "updated_at": now}})
    return {"ok": True}
# ===== FIRONOVA_PAYOUT_ENDPOINTS_END =====



app.include_router(api)

# CORS crédentialé : le navigateur refuse Access-Control-Allow-Origin: * dès
# que des cookies sont envoyés. On échoue vite en cas de mauvaise config.
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
_cors_origin_regex = os.environ.get("CORS_ORIGIN_REGEX", r"^https://.*\.preview\.emergentagent\.com$").strip() or None
_cors_origin_re = re.compile(_cors_origin_regex, re.IGNORECASE) if _cors_origin_regex else None
if "*" in _cors_origins:
    raise RuntimeError(
        "CORS_ORIGINS doit lister des origines explicites (ex. https://app.fironova.com) — "
        "'*' est interdit avec une auth par cookie (credentialed)."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,  # Auth cookie-only : le cookie httpOnly access_token doit traverser
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _csrf_origin_guard(request: Request, call_next):
    """Block cross-origin state-mutating requests that carry the session cookie."""
    if request.url.path.startswith("/api/admin/"):
        return await call_next(request)
    authz = (request.headers.get("authorization") or "").strip().lower()
    uses_bearer = authz.startswith("bearer ")
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.cookies.get("access_token") and not uses_bearer:
        origin = (request.headers.get("origin") or "").lower().rstrip("/")
        allowed = {o.lower().rstrip("/") for o in _cors_origins}
        matches_regex = bool(_cors_origin_re and _cors_origin_re.fullmatch(origin))
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",", 1)[0].strip().lower()
        origin_host = origin.split("://", 1)[-1].split("/", 1)[0]

        def _strip_default_port(h: str) -> str:
            if h.endswith(":443"):
                return h[:-4]
            if h.endswith(":80"):
                return h[:-3]
            return h

        same_origin = _strip_default_port(origin_host) == _strip_default_port(host)
        if not origin:
            return Response(status_code=403, content="Origin required", media_type="text/plain")
        if origin not in allowed and not matches_regex and not same_origin:
            return Response(status_code=403, content="Origin not allowed", media_type="text/plain")
    return await call_next(request)


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        f"Sitemap: {SEO_ORIGIN}/api/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain")


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
