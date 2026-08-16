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


PRODUCT = {
    "id": "prod-1",
    "slug": "bpc-157",
    "name_en": "BPC-157",
    "name_fr": "BPC-157",
    "variants": [
        {"id": "var-5mg", "name": "5mg", "sku": "BPC-5"},
        {"id": "var-10mg", "name": "10mg", "sku": "BPC-10"},
    ],
}


def _alert(variant_id, stock, active=True, triggered_at="2026-08-15T10:00:00+00:00"):
    return {"product_id": "prod-1", "variant_id": variant_id, "stock": stock,
            "threshold": 5, "triggered_at": triggered_at, "active": active}


def test_returns_active_alerts_enriched(server_module):
    server_module.db = SimpleNamespace(
        low_stock_alerts=FakeCollection([_alert("var-5mg", 2)]),
        products=FakeCollection([PRODUCT]),
    )

    result = asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))

    assert result["count"] == 1
    item = result["items"][0]
    assert item["product_name"] == "BPC-157"
    assert item["product_slug"] == "bpc-157"
    assert item["variant_name"] == "5mg"
    assert item["variant_sku"] == "BPC-5"
    assert item["stock"] == 2


def test_filters_out_cleared_alerts(server_module):
    server_module.db = SimpleNamespace(
        low_stock_alerts=FakeCollection([
            _alert("var-5mg", 2, active=True),
            _alert("var-10mg", 0, active=False),
        ]),
        products=FakeCollection([PRODUCT]),
    )

    result = asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))

    assert result["count"] == 1
    assert [i["variant_id"] for i in result["items"]] == ["var-5mg"]


def test_empty_when_no_alerts(server_module):
    products = FakeCollection([PRODUCT])
    server_module.db = SimpleNamespace(
        low_stock_alerts=FakeCollection([]), products=products,
    )

    result = asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))

    assert result == {"items": [], "count": 0}


def test_enrichment_uses_a_single_products_query(server_module):
    """Two alerts on the same product must not fan out into two lookups."""
    products = FakeCollection([PRODUCT])
    calls = []
    original_find = products.find
    products.find = lambda *a, **kw: (calls.append(a), original_find(*a, **kw))[1]
    server_module.db = SimpleNamespace(
        low_stock_alerts=FakeCollection([
            _alert("var-5mg", 2, triggered_at="2026-08-15T10:00:00+00:00"),
            _alert("var-10mg", 1, triggered_at="2026-08-15T11:00:00+00:00"),
        ]),
        products=products,
    )

    result = asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))

    assert len(calls) == 1
    assert result["count"] == 2
    # sorted by triggered_at descending
    assert [i["variant_name"] for i in result["items"]] == ["10mg", "5mg"]


def test_unknown_product_degrades_without_raising(server_module):
    server_module.db = SimpleNamespace(
        low_stock_alerts=FakeCollection([_alert("var-5mg", 0)]),
        products=FakeCollection([]),
    )

    result = asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))

    item = result["items"][0]
    assert item["product_name"] == "?"
    assert item["variant_name"] is None
