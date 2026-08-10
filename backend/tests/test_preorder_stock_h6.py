import asyncio
import importlib
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


class DummyUpdateResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class DummyProductsCollection:
    def __init__(self):
        self.stock = 10
        self.variants = [{"id": "v1", "stock": 10}]
        self.calls = []

    async def find_one(self, *args, **kwargs):
        return {"id": "p1", "stock": self.stock, "variants": self.variants}

    async def update_one(self, query, update, **kwargs):
        self.calls.append((query, update, kwargs))
        if "$inc" in update:
            inc = update["$inc"]
            if "variants.$[v].stock" in inc:
                self.variants[0]["stock"] += inc["variants.$[v].stock"]
            elif "stock" in inc:
                self.stock += inc["stock"]
        if "$gte" in query.get("stock", {}):
            if self.stock < query["stock"]["$gte"]:
                return DummyUpdateResult(0)
            return DummyUpdateResult(1)
        if "variants" in query:
            if self.variants[0]["stock"] < 0:
                return DummyUpdateResult(0)
            return DummyUpdateResult(1)
        return DummyUpdateResult(1)


class DummyOrdersCollection:
    def find(self, *args, **kwargs):
        class _Cursor:
            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

        return _Cursor()

    async def update_one(self, *args, **kwargs):
        return DummyUpdateResult(1)


def test_checkout_rejects_overly_large_preorder_quantity(server_module):
    class DummyCartItem(dict):
        pass

    with pytest.raises(Exception):
        asyncio.run(server_module._build_order_totals([
            DummyCartItem({"product_id": "p1", "variant_id": "v1", "qty": 1001})
        ]))


def test_preorder_release_decrements_stock_atomically(server_module, monkeypatch):
    product_col = DummyProductsCollection()
    orders_col = DummyOrdersCollection()
    server_module.db = types.SimpleNamespace(products=product_col, orders=orders_col)

    async def fake_find_one(*args, **kwargs):
        return {"id": "p1", "stock": 10, "variants": [{"id": "v1", "stock": 10}]}

    class _Cursor:
        def __init__(self):
            self._yielded = False

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self._yielded:
                raise StopAsyncIteration
            self._yielded = True
            return {"id": "o1", "order_number": "FN-001", "items": [{"product_id": "p1", "variant_id": "v1", "qty": 3, "preorder": True}]}

    def fake_find(*args, **kwargs):
        return _Cursor()

    monkeypatch.setattr(server_module.db.products, "find_one", fake_find_one)
    monkeypatch.setattr(server_module.db.orders, "find", fake_find)

    released = asyncio.run(server_module._release_ready_preorder_orders())

    assert released == 1
    assert product_col.variants[0]["stock"] == 7
