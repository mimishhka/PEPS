from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Protocol


class OrderStatus(str, Enum):
    pending = "pending"
    paid = "paid"
    processing = "processing"
    shipped = "shipped"
    delivered = "delivered"
    cancelled = "cancelled"
    failed = "failed"
    refunded = "refunded"


class PayoutStatus(str, Enum):
    ready = "ready"
    under_review = "under_review"
    processing = "processing"
    paid = "paid"
    rejected = "rejected"


@dataclass
class Product:
    sku: str
    slug: str
    name: str
    price_cad: Decimal
    stock: int
    purity: str = ""
    lot: str = ""
    coa_url: str = ""
    featured: bool = False


@dataclass
class Affiliate:
    code: str
    commission_rate: Decimal = Decimal("0.10")
    active: bool = True
    payout_currency: str | None = None
    payout_address: str | None = None


@dataclass
class CartLine:
    sku: str
    quantity: int


@dataclass
class OrderItem:
    sku: str
    name: str
    quantity: int
    unit_price_cad: Decimal


@dataclass
class Order:
    order_number: str
    email: str
    items: list[OrderItem]
    payment_provider: str
    subtotal_cad: Decimal
    shipping_cad: Decimal
    total_cad: Decimal
    status: OrderStatus = OrderStatus.pending
    affiliate_code: str | None = None
    payment_reference: str | None = None


@dataclass
class Commission:
    affiliate_code: str
    order_number: str
    amount_cad: Decimal
    status: str = "approved"


@dataclass
class Payout:
    affiliate_code: str
    period: str
    amount_cad: Decimal
    status: PayoutStatus = PayoutStatus.ready
    admin_note: str | None = None


@dataclass
class Store:
    products: dict[str, Product] = field(default_factory=dict)
    affiliates: dict[str, Affiliate] = field(default_factory=dict)
    orders: dict[str, Order] = field(default_factory=dict)
    commissions: list[Commission] = field(default_factory=list)
    payouts: list[Payout] = field(default_factory=list)
    webhook_events: set[str] = field(default_factory=set)
    affiliate_clicks: list[dict] = field(default_factory=list)


@dataclass
class PaymentIntent:
    provider: str
    reference: str
    action_url: str | None = None


class PaymentProvider(Protocol):
    name: str
    def create_intent(self, order_number: str, total_cad: Decimal) -> PaymentIntent: ...


class MockPaymentProvider:
    name = "mock"
    def create_intent(self, order_number: str, total_cad: Decimal) -> PaymentIntent:
        return PaymentIntent(self.name, f"mock_{order_number}")


class InteracPaymentProvider:
    name = "interac"
    def create_intent(self, order_number: str, total_cad: Decimal) -> PaymentIntent:
        return PaymentIntent(self.name, order_number)


class StripePaymentProvider:
    name = "stripe"
    def create_intent(self, order_number: str, total_cad: Decimal) -> PaymentIntent:
        return PaymentIntent(self.name, f"pi_{order_number}", f"/pay/card/{order_number}")


class NowPaymentsProvider:
    name = "nowpayments"
    def create_intent(self, order_number: str, total_cad: Decimal) -> PaymentIntent:
        return PaymentIntent(self.name, f"np_{order_number}", f"/pay/crypto/{order_number}")


PROVIDERS: dict[str, PaymentProvider] = {
    "mock": MockPaymentProvider(),
    "interac": InteracPaymentProvider(),
    "stripe": StripePaymentProvider(),
    "nowpayments": NowPaymentsProvider(),
}


def normalize_code(code: str | None) -> str | None:
    if not code:
        return None
    clean = "".join(ch for ch in code.upper().strip() if ch.isalnum() or ch == "-")
    return clean[:40] or None


def shipping_for(subtotal: Decimal) -> Decimal:
    return Decimal("0.00") if subtotal >= Decimal("200.00") else Decimal("20.00")


def capture_affiliate_click(store: Store, code: str, landing_path: str = "/", referrer: str = "") -> Affiliate | None:
    normalized = normalize_code(code)
    affiliate = store.affiliates.get(normalized or "")
    if not affiliate or not affiliate.active:
        return None
    store.affiliate_clicks.append({"affiliate_code": affiliate.code, "landing_path": landing_path, "referrer": referrer})
    return affiliate


def create_order(store: Store, email: str, lines: list[CartLine], payment_provider: str, accepted_terms: bool, affiliate_code: str | None = None) -> Order:
    if not accepted_terms:
        raise ValueError("Terms and 19+ confirmation are required")
    if payment_provider not in PROVIDERS:
        raise ValueError("Unsupported payment provider")
    subtotal = Decimal("0.00")
    items: list[OrderItem] = []
    for line in lines:
        if line.quantity <= 0:
            raise ValueError("Quantity must be positive")
        product = store.products.get(line.sku)
        if not product:
            raise ValueError(f"Unknown product: {line.sku}")
        if product.stock < line.quantity:
            raise ValueError(f"Insufficient stock for {line.sku}")
        product.stock -= line.quantity
        subtotal += product.price_cad * line.quantity
        items.append(OrderItem(product.sku, product.name, line.quantity, product.price_cad))
    shipping = shipping_for(subtotal)
    total = subtotal + shipping
    order_number = f"PEPS-{len(store.orders) + 1001}"
    intent = PROVIDERS[payment_provider].create_intent(order_number, total)
    affiliate = normalize_code(affiliate_code)
    if affiliate and affiliate not in store.affiliates:
        affiliate = None
    order = Order(order_number, email.lower(), items, intent.provider, subtotal, shipping, total, affiliate_code=affiliate, payment_reference=intent.reference)
    store.orders[order_number] = order
    return order


def apply_payment_event(store: Store, event_id: str, order_number: str, status: str, provider_reference: str | None = None) -> Order:
    if event_id in store.webhook_events:
        return store.orders[order_number]
    store.webhook_events.add(event_id)
    order = store.orders[order_number]
    if provider_reference:
        order.payment_reference = provider_reference
    if status == "paid":
        order.status = OrderStatus.paid
        approve_commission(store, order)
    elif status == "failed":
        order.status = OrderStatus.failed
    elif status == "refunded":
        order.status = OrderStatus.refunded
        for commission in store.commissions:
            if commission.order_number == order.order_number:
                commission.status = "reversed"
    else:
        raise ValueError("Unsupported payment status")
    return order


def approve_commission(store: Store, order: Order) -> Commission | None:
    if not order.affiliate_code:
        return None
    if any(c.order_number == order.order_number for c in store.commissions):
        return None
    affiliate = store.affiliates[order.affiliate_code]
    commission = Commission(affiliate.code, order.order_number, (order.subtotal_cad * affiliate.commission_rate).quantize(Decimal("0.01")))
    store.commissions.append(commission)
    return commission


def review_payout(payout: Payout, status: str, note: str | None = None) -> Payout:
    payout.status = PayoutStatus(status)
    payout.admin_note = note
    return payout


def seed_store() -> Store:
    return Store(
        products={
            "BPC-157-5MG": Product("BPC-157-5MG", "bpc-157", "BPC-157", Decimal("79.00"), 18, "99.1%", "PEPS-001", featured=True),
            "TB500-10MG": Product("TB500-10MG", "tb-500", "TB-500", Decimal("119.00"), 8, "98.7%", "PEPS-014", featured=True),
            "GHK-CU-50MG": Product("GHK-CU-50MG", "ghk-cu", "GHK-Cu", Decimal("89.00"), 22, "99.0%", "PEPS-021"),
        },
        affiliates={"MARIE10": Affiliate("MARIE10", Decimal("0.10"))},
        payouts=[Payout("MARIE10", "2026-09", Decimal("40.00"))],
    )
