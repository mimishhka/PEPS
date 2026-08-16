import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tests.fake_mongo import FakeCollection  # noqa: E402


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


@pytest.fixture
def canada_post(server_module):
    from services import canada_post as module
    return module


def _order(idx, **shipping):
    return {"id": f"o{idx}", "order_number": f"FN-{idx}",
            "fulfillment_status": "shipped", "shipping_info": shipping}


def test_voids_every_untransmitted_label(server_module, canada_post, monkeypatch):
    orders = FakeCollection([
        _order(1, label_url="/u/1.pdf", cp_group_id="g1", cp_shipment_id="s1", cp_transmitted=False),
        _order(2, label_url="/u/2.pdf", cp_group_id="g1", cp_shipment_id="s2"),
        _order(3, label_url="/u/3.pdf", cp_group_id="g1", cp_shipment_id="s3", cp_transmitted=True),
    ])
    server_module.db = SimpleNamespace(orders=orders)
    monkeypatch.setattr(server_module, "_canada_post_void", lambda sid: _true())

    result = asyncio.run(canada_post.void_untransmitted_labels(admin_email="a@b.c"))

    assert result["voided"] == 2
    assert result["voided_orders"] == ["FN-1", "FN-2"]
    # already transmitted: never touched
    assert orders.by_id("o3")["shipping_info"]["cp_transmitted"] is True
    assert orders.by_id("o3")["fulfillment_status"] == "shipped"
    for oid in ("o1", "o2"):
        doc = orders.by_id(oid)
        assert doc["fulfillment_status"] == "processing"
        assert doc["shipping_info"] == {"carrier": "", "tracking_number": "", "shipped_at": None}
        assert doc["notes"][-1]["text"].endswith("par a@b.c.")


def test_carrier_refusal_leaves_the_order_alone(server_module, canada_post, monkeypatch):
    orders = FakeCollection([
        _order(1, label_url="/u/1.pdf", cp_group_id="g1", cp_shipment_id="s1", cp_transmitted=False),
    ])
    server_module.db = SimpleNamespace(orders=orders)
    monkeypatch.setattr(server_module, "_canada_post_void", lambda sid: _false())

    result = asyncio.run(canada_post.void_untransmitted_labels())

    assert result["voided"] == 0
    assert result["failed"] == ["FN-1"]
    doc = orders.by_id("o1")
    assert doc["fulfillment_status"] == "shipped"
    assert doc["shipping_info"]["cp_shipment_id"] == "s1"


def test_label_without_shipment_id_is_reported_not_silently_cleared(server_module, canada_post, monkeypatch):
    orders = FakeCollection([_order(1, label_url="/u/1.pdf")])
    server_module.db = SimpleNamespace(orders=orders)
    calls = []
    monkeypatch.setattr(server_module, "_canada_post_void",
                        lambda sid: (calls.append(sid), _true())[1])

    result = asyncio.run(canada_post.void_untransmitted_labels())

    assert result["no_shipment_id"] == ["FN-1"]
    assert result["voided"] == 0
    assert calls == []                                   # carrier never called
    assert orders.by_id("o1")["shipping_info"]["label_url"] == "/u/1.pdf"


def test_nothing_pending_is_a_no_op(server_module, canada_post, monkeypatch):
    orders = FakeCollection([
        _order(1, label_url="/u/1.pdf", cp_group_id="g1", cp_shipment_id="s1", cp_transmitted=True),
    ])
    server_module.db = SimpleNamespace(orders=orders)
    monkeypatch.setattr(server_module, "_canada_post_void", lambda sid: _true())

    result = asyncio.run(canada_post.void_untransmitted_labels())

    assert result == {"ok": True, "voided": 0, "voided_orders": [],
                      "failed": [], "no_shipment_id": []}


def test_untransmitted_match_requires_an_actual_label(canada_post):
    assert canada_post.UNTRANSMITTED_MATCH == {
        "shipping_info.label_url": {"$nin": [None, ""]},
        "shipping_info.cp_transmitted": {"$ne": True},
    }


async def _true():
    return True


async def _false():
    return False
