import asyncio
import importlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import server
    return importlib.reload(server)


class _Orders:
    def __init__(self):
        self.order = {
            "id": "order-b",
            "user_id": "user-b",
            "email": "b@example.com",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "payment_method": "nowpayments",
            "payment_status": "pending",
        }

    async def find_one(self, query, *args, **kwargs):
        return dict(self.order) if query.get("id") == self.order["id"] else None


class _Addresses:
    def __init__(self):
        self.address = {"id": "address-b", "user_id": "user-b", "is_default": True}
        self.updates = []
        self.deletes = []

    async def find_one(self, query, *args, **kwargs):
        if all(self.address.get(key) == value for key, value in query.items()):
            return dict(self.address)
        return None

    async def update_one(self, query, update):
        self.updates.append((query, update))
        return SimpleNamespace(modified_count=0)

    async def update_many(self, query, update):
        self.updates.append((query, update))
        return SimpleNamespace(modified_count=0)

    async def delete_one(self, query):
        self.deletes.append(query)
        return SimpleNamespace(deleted_count=0)


class _Request:
    headers = {}
    cookies = {}
    query_params = {}
    client = SimpleNamespace(host="127.0.0.1")


def test_cross_account_order_reads_are_forbidden(server_module, monkeypatch):
    server_module.db = SimpleNamespace(orders=_Orders())

    async def user_a(_request):
        return {"id": "user-a", "role": "user"}

    async def allow_rate_limit(*args, **kwargs):
        return None

    async def unexpected_external_call(*args, **kwargs):
        pytest.fail("authorization must run before external provider access")

    monkeypatch.setattr(server_module, "_resolve_user", user_a)
    monkeypatch.setattr(server_module, "_rate_limit", allow_rate_limit)
    monkeypatch.setattr(server_module, "_canada_post_track", unexpected_external_call)

    handlers = (
        server_module.get_order,
        server_module.order_tracking,
        server_module.order_invoice_pdf,
        server_module.crypto_status,
    )
    for handler in handlers:
        with pytest.raises(server_module.HTTPException) as exc_info:
            asyncio.run(handler("order-b", _Request()))
        assert exc_info.value.status_code == 403


def test_cross_account_address_mutations_do_not_touch_victim(server_module):
    addresses = _Addresses()
    server_module.db = SimpleNamespace(addresses=addresses)
    user_a = {"id": "user-a", "role": "user"}
    payload = SimpleNamespace(model_dump=lambda: {"is_default": False})

    with pytest.raises(server_module.HTTPException) as update_error:
        asyncio.run(server_module.account_update_address("address-b", payload, user_a))
    with pytest.raises(server_module.HTTPException) as delete_error:
        asyncio.run(server_module.account_delete_address("address-b", user_a))

    assert update_error.value.status_code == 404
    assert delete_error.value.status_code == 404
    assert addresses.updates == []
    assert addresses.deletes == [{"id": "address-b", "user_id": "user-a"}]