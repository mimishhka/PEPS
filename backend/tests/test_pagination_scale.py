import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    def __aiter__(self):
        self.iterator = iter(self.documents)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration:
            raise StopAsyncIteration

    def sort(self, *args):
        return self


def test_cursor_all_does_not_stop_at_one_thousand(server_module):
    documents = [{"id": index} for index in range(1005)]

    result = asyncio.run(server_module._cursor_all(Cursor(documents)))

    assert len(result) == 1005
    assert result[-1]["id"] == 1004


def test_csv_cursor_response_streams_every_row(server_module):
    documents = [{"id": index} for index in range(1005)]
    response = server_module._csv_cursor_response(
        Cursor(documents),
        lambda document: document,
        ["id"],
        "rows.csv",
    )

    async def read_body():
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk.decode() if isinstance(chunk, bytes) else chunk)
        return "".join(chunks)

    lines = asyncio.run(read_body()).splitlines()

    assert lines[0] == "id"
    assert len(lines) == 1006
    assert lines[-1] == "1004"


def test_affiliate_overview_totals_more_than_one_thousand_rows(server_module):
    referrals = [
        {
            "status": "approved",
            "commission_amount": 1.0,
            "order_total": 10.0,
            "created_at": "2026-01-01T00:00:00+00:00",
            "affiliate_id": "affiliate-1",
        }
        for _ in range(1005)
    ]

    class Affiliates:
        async def count_documents(self, query):
            return 0

        def find(self, query, projection):
            return Cursor([])

        async def find_one(self, query, projection):
            return {"code": "AFF", "name": "Affiliate"}

    class Referrals:
        def find(self, query, projection):
            return Cursor(referrals)

        async def count_documents(self, query):
            return 0

    class PayoutAggregation:
        async def to_list(self, limit):
            assert limit == 1
            return [{"count": 1005, "amount": 1005.0}]

    class Payouts:
        def aggregate(self, pipeline):
            assert pipeline[-1]["$group"]["count"] == {"$sum": 1}
            return PayoutAggregation()

    class Clicks:
        async def count_documents(self, query):
            return 0

    server_module.db = SimpleNamespace(
        affiliates=Affiliates(),
        affiliate_referrals=Referrals(),
        affiliate_payouts=Payouts(),
        affiliate_clicks=Clicks(),
    )

    result = asyncio.run(server_module.admin_affiliates_overview({}))

    assert result["financial"]["validated_orders"] == 1005
    assert result["financial"]["validated_revenue"] == 10050.0
    assert result["alerts"]["payouts_ready"] == 1005
    assert result["alerts"]["payouts_ready_amount"] == 1005.0


def test_restock_notifications_claim_every_subscriber(server_module, monkeypatch):
    subscribers = [
        {"id": f"subscription-{index}", "email": f"user-{index}@example.com"}
        for index in range(1005)
    ]

    class Products:
        async def find_one(self, query, projection):
            return {"id": "product-1", "stock": 1, "slug": "product-1"}

    class Notifications:
        def __init__(self):
            self.claimed = set()

        def find(self, query, projection):
            return Cursor(subscribers)

        async def update_one(self, query, update):
            subscription_id = query["id"]
            if subscription_id in self.claimed:
                return SimpleNamespace(modified_count=0)
            self.claimed.add(subscription_id)
            return SimpleNamespace(modified_count=1)

    notifications = Notifications()
    server_module.db = SimpleNamespace(
        products=Products(),
        stock_notifications=notifications,
    )
    monkeypatch.setattr(
        server_module.asyncio,
        "create_task",
        lambda coroutine: coroutine.close(),
    )

    asyncio.run(server_module._maybe_notify_restock("product-1"))

    assert len(notifications.claimed) == 1005


def test_unpaid_watchdog_drains_full_batches(server_module, monkeypatch):
    reminder_batches = iter([500, 500, 2])
    cancellation_batches = iter([500, 0])

    async def reminders(limit):
        assert limit == 500
        return next(reminder_batches)

    async def cancellations(limit):
        assert limit == 500
        return next(cancellation_batches)

    monkeypatch.setattr(server_module, "OPERATIONAL_BATCH_SIZE", 500)
    monkeypatch.setattr(server_module, "OPERATIONAL_MAX_BATCHES_PER_RUN", 20)
    monkeypatch.setattr(server_module, "send_payment_reminders", reminders)
    monkeypatch.setattr(server_module, "cancel_stale_unpaid_orders", cancellations)

    result = asyncio.run(server_module._drain_unpaid_order_batches())

    assert result == {"reminders": 1002, "cancelled": 500, "backlog": False}


def test_delivery_polling_rotates_by_last_check(server_module, monkeypatch):
    class DeliveryCursor(Cursor):
        def __init__(self, documents):
            super().__init__(documents)
            self.sort_spec = None

        def sort(self, spec):
            self.sort_spec = spec
            return self

        async def to_list(self, limit):
            assert limit == 200
            return self.documents[:limit]

    class Orders:
        def __init__(self):
            self.cursor = DeliveryCursor([
                {
                    "id": "order-1",
                    "shipping_info": {
                        "tracking_number": "TRACK-1",
                        "shipped_at": "2026-08-01T00:00:00+00:00",
                    },
                }
            ])
            self.updates = []

        def find(self, query, projection):
            return self.cursor

        async def update_one(self, query, update):
            self.updates.append((query, update))
            return SimpleNamespace(modified_count=0)

    async def not_delivered(tracking_number):
        return {}

    orders = Orders()
    server_module.db = SimpleNamespace(orders=orders)
    monkeypatch.setattr(server_module, "CANADA_POST_API_KEY", "configured")
    monkeypatch.setattr(server_module, "_canada_post_track", not_delivered)
    monkeypatch.setattr(server_module, "_cp_tracking_indicates_delivered", lambda live: (False, ""))
    monkeypatch.setattr(server_module, "_sandbox_fallback_ready", lambda shipped_at: False)

    updated = asyncio.run(server_module._auto_sync_delivered_orders_once())

    assert updated == 0
    assert orders.cursor.sort_spec == [
        ("shipping_info.delivery_checked_at", 1),
        ("shipping_info.shipped_at", 1),
    ]
    assert "shipping_info.delivery_checked_at" in orders.updates[0][1]["$set"]


def test_manifests_include_more_than_two_thousand_orders(server_module, monkeypatch):
    grouped_orders = [
        {"_id": "group-a", "count": 1500},
        {"_id": "group-b", "count": 1005},
    ]

    class Orders:
        def __init__(self):
            self.pipelines = []

        def aggregate(self, pipeline):
            self.pipelines.append(pipeline)
            include_counts = "count" in pipeline[1]["$group"]
            if include_counts:
                return Cursor(grouped_orders)
            return Cursor([{"_id": group["_id"]} for group in grouped_orders])

        async def update_many(self, query, update):
            assert query["shipping_info.cp_group_id"]["$in"] == ["group-a", "group-b"]
            return SimpleNamespace(modified_count=2505)

    class Manifests:
        async def insert_one(self, document):
            return SimpleNamespace(inserted_id=document["id"])

    async def transmit(group_id):
        return [f"https://example.com/{group_id}.pdf"]

    async def manifest_details(href):
        return None

    orders = Orders()
    server_module.db = SimpleNamespace(orders=orders, manifests=Manifests())
    monkeypatch.setattr(server_module, "is_canada_post_configured", lambda: True)
    monkeypatch.setattr(server_module, "_canada_post_transmit", transmit)
    monkeypatch.setattr(server_module, "_canada_post_manifest_details", manifest_details)

    pending = asyncio.run(server_module.admin_pending_manifest({}))
    transmitted = asyncio.run(server_module.admin_transmit_manifest({}))

    assert pending["pending_count"] == 2505
    assert pending["groups"] == [
        {"group_id": "group-a", "count": 1500},
        {"group_id": "group-b", "count": 1005},
    ]
    assert transmitted["transmitted_groups"] == ["group-a", "group-b"]
    assert transmitted["orders_marked"] == 2505