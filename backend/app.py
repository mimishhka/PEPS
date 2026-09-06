from decimal import Decimal
from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from domain import CartLine, PayoutStatus, Store, apply_payment_event, capture_affiliate_click, create_order, review_payout, seed_store

app = FastAPI(title="PEPS Ecommerce API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type", "X-CSRF-Token"])
store: Store = seed_store()


class CheckoutIn(BaseModel):
    email: EmailStr
    items: list[CartLine] = Field(min_length=1)
    payment_provider: str = Field(pattern="^(mock|stripe|interac|nowpayments)$")
    accepted_terms: bool
    affiliate_code: str | None = Field(default=None, max_length=40)


class PaymentWebhookIn(BaseModel):
    event_id: str
    order_number: str
    status: str = Field(pattern="^(paid|failed|refunded)$")
    provider_reference: str | None = None


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class PayoutReviewIn(BaseModel):
    status: str = Field(pattern="^(under_review|processing|paid|rejected)$")
    admin_note: str | None = Field(default=None, max_length=1000)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/api/catalog/products")
def products(featured: bool | None = None):
    values = list(store.products.values())
    if featured is not None:
        values = [p for p in values if p.featured == featured]
    return values


@app.get("/api/catalog/products/{slug}")
def product(slug: str):
    for item in store.products.values():
        if item.slug == slug:
            return item
    raise HTTPException(404, "Product not found")


@app.post("/api/auth/register")
def register(payload: RegisterIn, response: Response):
    response.set_cookie("access_token", f"session-for-{payload.email}", httponly=True, secure=False, samesite="lax", path="/")
    return {"email": payload.email, "role": "customer"}


@app.get("/api/account/orders")
def account_orders(access_token: str | None = Cookie(default=None)):
    if not access_token:
        raise HTTPException(401, "Authentication required")
    marker = access_token.replace("session-for-", "")
    return [o for o in store.orders.values() if o.email == marker]


@app.get("/api/affiliate/ref/{code}")
def affiliate_ref(code: str, response: Response, landing_path: str = "/", referrer: str = ""):
    affiliate = capture_affiliate_click(store, code, landing_path, referrer)
    if affiliate:
        response.set_cookie("peps_ref", affiliate.code, max_age=30 * 86400, httponly=True, secure=False, samesite="lax", path="/")
    return {"ok": True}


@app.get("/api/affiliate/{code}/dashboard")
def affiliate_dashboard(code: str):
    code = code.upper()
    if code not in store.affiliates:
        raise HTTPException(404, "Affiliate not found")
    commissions = [c for c in store.commissions if c.affiliate_code == code]
    payouts = [p for p in store.payouts if p.affiliate_code == code]
    return {"code": code, "approved_cad": sum((c.amount_cad for c in commissions if c.status == "approved"), Decimal("0.00")), "commissions": commissions, "payouts": payouts}


@app.post("/api/checkout")
def checkout(payload: CheckoutIn, peps_ref: str | None = Cookie(default=None)):
    try:
        order = create_order(store, payload.email, payload.items, payload.payment_provider, payload.accepted_terms, payload.affiliate_code or peps_ref)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"order_number": order.order_number, "total_cad": order.total_cad, "payment_status": order.status, "payment_reference": order.payment_reference}


@app.post("/api/payments/webhook")
def payment_webhook(payload: PaymentWebhookIn):
    order = apply_payment_event(store, payload.event_id, payload.order_number, payload.status, payload.provider_reference)
    return {"ok": True, "order_number": order.order_number, "status": order.status}


@app.get("/api/admin/dashboard")
def admin_dashboard():
    return {"orders": len(store.orders), "products": len(store.products), "affiliates": len(store.affiliates), "payouts_ready": len([p for p in store.payouts if p.status == PayoutStatus.ready])}


@app.get("/api/admin/reconciliation")
def reconciliation():
    return {"failed_orders": [o for o in store.orders.values() if o.status.value in {"failed", "refunded"}], "webhook_events": len(store.webhook_events)}


@app.put("/api/admin/payouts/{index}")
def payout_review(index: int, payload: PayoutReviewIn):
    try:
        payout = store.payouts[index]
    except IndexError as exc:
        raise HTTPException(404, "Payout not found") from exc
    return review_payout(payout, payload.status, payload.admin_note)
