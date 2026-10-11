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

def _liberation(server_module, monkeypatch, variante, qte=3):
    """Monte une commande en precommande sur UNE variante et tente sa
    liberation. Rend (nombre libere, stock restant)."""
    product_col = DummyProductsCollection()
    product_col.variants = [dict(variante)]
    orders_col = DummyOrdersCollection()
    server_module.db = types.SimpleNamespace(products=product_col, orders=orders_col)

    async def fake_find_one(*args, **kwargs):
        return {"id": "p1", "stock": 10, "variants": product_col.variants}

    class _Cursor:
        def __init__(self):
            self._yielded = False

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self._yielded:
                raise StopAsyncIteration
            self._yielded = True
            return {"id": "o1", "order_number": "FN-001",
                    "items": [{"product_id": "p1", "variant_id": "v1",
                               "qty": qte, "preorder": True}]}

    monkeypatch.setattr(server_module.db.products, "find_one", fake_find_one)
    monkeypatch.setattr(server_module.db.orders, "find", lambda *a, **k: _Cursor())

    libere = asyncio.run(server_module._release_ready_preorder_orders())
    return libere, product_col.variants[0]["stock"]


def test_UN_CERTIFICAT_MANQUANT_NE_RETIENT_PLUS_LE_COLIS(server_module, monkeypatch):
    """La correction la plus importante du 11/10/2026, et la plus silencieuse.

    MIREILLE : « il ne faut pas que la commande soit traitee comme une
    precommande ». La consequence qu'elle n'avait pas encore vue : cette
    verification refusait de liberer un envoi tant que le certificat n'etait
    pas televerse, STOCK EN MAIN. La commande serait restee en attente
    indefiniment, sans qu'aucun ecran ne dise pourquoi — ni erreur, ni
    message, juste un colis qui ne part pas.

    Ce site n'avait aucun test. Il en a un.
    """
    libere, reste = _liberation(
        server_module, monkeypatch,
        {"id": "v1", "stock": 10, "badge_coa_pending": True, "coa_status": "pending"})
    assert libere == 1, "le colis doit partir : le stock est la"
    assert reste == 7, "et le stock doit bien etre debite"


def test_bientot_disponible_retient_toujours_le_colis(server_module, monkeypatch):
    # L'autre badge reste bloquant : le produit n'existe pas encore en
    # tablette, le liberer n'aurait aucun sens.
    libere, reste = _liberation(
        server_module, monkeypatch,
        {"id": "v1", "stock": 10, "badge_coming_soon": True})
    assert libere == 0
    assert reste == 10, "rien ne part, donc rien n'est debite"


def test_un_stock_insuffisant_retient_toujours_le_colis(server_module, monkeypatch):
    libere, reste = _liberation(
        server_module, monkeypatch, {"id": "v1", "stock": 1}, qte=3)
    assert libere == 0
    assert reste == 1
