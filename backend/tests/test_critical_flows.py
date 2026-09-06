from decimal import Decimal
from domain import CartLine, OrderStatus, PayoutStatus, apply_payment_event, capture_affiliate_click, create_order, review_payout, seed_store


def test_checkout_reserves_stock_and_commission_after_payment():
    store = seed_store()
    order = create_order(store, "buyer@example.com", [CartLine("BPC-157-5MG", 2)], "mock", True, "MARIE10")
    assert order.total_cad == Decimal("178.00")
    assert store.products["BPC-157-5MG"].stock == 16
    apply_payment_event(store, "evt_1", order.order_number, "paid", "paid_1")
    assert order.status == OrderStatus.paid
    assert store.commissions[0].amount_cad == Decimal("15.80")


def test_payment_webhook_is_idempotent():
    store = seed_store()
    order = create_order(store, "buyer@example.com", [CartLine("BPC-157-5MG", 1)], "mock", True, "MARIE10")
    apply_payment_event(store, "evt_same", order.order_number, "paid")
    apply_payment_event(store, "evt_same", order.order_number, "paid")
    assert len(store.commissions) == 1


def test_refund_reverses_commission_for_reconciliation():
    store = seed_store()
    order = create_order(store, "buyer@example.com", [CartLine("BPC-157-5MG", 1)], "mock", True, "MARIE10")
    apply_payment_event(store, "evt_paid", order.order_number, "paid")
    apply_payment_event(store, "evt_refund", order.order_number, "refunded")
    assert order.status == OrderStatus.refunded
    assert store.commissions[0].status == "reversed"


def test_affiliate_click_tracking():
    store = seed_store()
    affiliate = capture_affiliate_click(store, "marie10", "/catalog", "https://creator.example/post")
    assert affiliate.code == "MARIE10"
    assert store.affiliate_clicks[0]["landing_path"] == "/catalog"


def test_admin_payout_review():
    store = seed_store()
    payout = review_payout(store.payouts[0], "under_review", "Checking wallet before batch payout.")
    assert payout.status == PayoutStatus.under_review
    assert payout.admin_note.startswith("Checking")
