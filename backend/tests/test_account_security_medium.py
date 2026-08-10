import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import server as server_module
    return importlib.reload(server_module)


def test_register_password_must_meet_complexity(server_module):
    with pytest.raises(ValidationError):
        server_module.RegisterIn(email="user@example.com", password="weakpass", name="Test User")


def test_account_delete_cleans_up_related_tokens(server_module, monkeypatch):
    class _Collection:
        def __init__(self):
            self.deleted = []
            self.updated = []

        async def delete_many(self, query):
            self.deleted.append(query)
            return SimpleNamespace(deleted_count=1)

        async def delete_one(self, query):
            self.deleted.append(query)
            return SimpleNamespace(deleted_count=1)

        async def update_many(self, query, update):
            self.updated.append((query, update))
            return SimpleNamespace(modified_count=1)

    class _Users:
        async def find_one(self, query):
            return {"id": "u1", "email": "user@example.com", "password_hash": "hash", "role": "user"}

        async def delete_one(self, query):
            return None

    users = _Users()

    class _Orders:
        async def update_many(self, query, update):
            return SimpleNamespace(modified_count=1)

        def find(self, query, projection):
            class _Cursor:
                def to_list(self, limit):
                    return [{"id": "order-1"}]
            return _Cursor()

    orders = _Orders()
    db = SimpleNamespace(
        users=users,
        orders=orders,
        addresses=_Collection(),
        stock_notifications=_Collection(),
        subscribers=_Collection(),
        email_change_requests=_Collection(),
        magic_tokens=_Collection(),
        order_access_tokens=_Collection(),
        wishlist=_Collection(),
        coupons=_Collection(),
    )
    server_module.db = db
    monkeypatch.setattr(server_module, "verify_password", lambda *args, **kwargs: True)

    response = SimpleNamespace(delete_cookie=lambda **kwargs: None)
    user = {"id": "u1", "email": "user@example.com"}

    asyncio.run(server_module.account_delete(server_module.AccountDeleteIn(current_password="pw"), response, user))

    assert db.magic_tokens.deleted
    assert db.order_access_tokens.deleted
    assert db.wishlist.deleted


def test_account_delete_anonymizes_coupon_usage_and_order_pii(server_module, monkeypatch):
    class _Collection:
        def __init__(self):
            self.deleted = []
            self.updated = []

        async def delete_many(self, query):
            self.deleted.append(query)
            return SimpleNamespace(deleted_count=1)

        async def delete_one(self, query):
            self.deleted.append(query)
            return SimpleNamespace(deleted_count=1)

        async def update_many(self, query, update):
            self.updated.append((query, update))
            return SimpleNamespace(modified_count=1)

    class _Users:
        async def find_one(self, query):
            return {"id": "u2", "email": "user2@example.com", "password_hash": "hash", "role": "user"}

        async def delete_one(self, query):
            return None

    class _Orders:
        def __init__(self):
            self.updated = []

        async def update_many(self, query, update):
            self.updated.append((query, update))
            return SimpleNamespace(modified_count=1)

        def find(self, query, projection):
            class _Cursor:
                def to_list(self, limit):
                    return [{"id": "order-2"}]
            return _Cursor()

    db = SimpleNamespace(
        users=_Users(),
        orders=_Orders(),
        addresses=_Collection(),
        stock_notifications=_Collection(),
        subscribers=_Collection(),
        email_change_requests=_Collection(),
        magic_tokens=_Collection(),
        order_access_tokens=_Collection(),
        wishlist=_Collection(),
        coupons=_Collection(),
    )
    server_module.db = db
    monkeypatch.setattr(server_module, "verify_password", lambda *args, **kwargs: True)

    response = SimpleNamespace(delete_cookie=lambda **kwargs: None)
    user = {"id": "u2", "email": "user2@example.com"}

    asyncio.run(server_module.account_delete(server_module.AccountDeleteIn(current_password="pw"), response, user))

    assert any("used_by" in str(update[1]) for update in db.coupons.updated)
    assert any("shipping_address.city" in str(update[1]) for update in db.orders.updated)
