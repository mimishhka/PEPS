import asyncio
import importlib
import sys
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
    import server as server_module
    return importlib.reload(server_module)


class _DummyOrders:
    def __init__(self):
        self.docs = [{
            "id": "order-1",
            "user_id": None,
            "email": "guest@example.com",
            "payment_method": "interac",
            "payment_status": "awaiting_etransfer",
            "payment_info": {
                "type": "interac",
                "instructions": {
                    "send_to": "orders@fironova.com",
                    "amount_cad": 10,
                    "reference": "ABC123",
                    "security_question": "What is the brand name?",
                    "security_answer_hint": "fironova",
                },
            },
            "notes": [{"text": "Visible", "visible_to_customer": True}],
            "compliance": {"ip": "1.2.3.4"},
        }]

    async def find_one(self, query, *args, **kwargs):
        if query.get("id") == "order-1":
            return self.docs[0]
        return None


class _DummyEmailChangeRequests:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(doc)

    async def find_one(self, query):
        for doc in self.docs:
            if doc.get("token") == query.get("token") and not doc.get("used"):
                return doc
        return None

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc.get("token") == query.get("token"):
                doc.update(update.get("$set", {}))
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)


class _DummyDB:
    def __init__(self):
        self.orders = _DummyOrders()
        self.email_change_requests = _DummyEmailChangeRequests()


class _DummyRequest:
    def __init__(self, host="127.0.0.1"):
        self.client = SimpleNamespace(host=host)
        self.headers = {}
        self.cookies = {}
        self.query_params = {}


def test_guest_order_requires_access_token(server_module, monkeypatch):
    server_module.db = _DummyDB()

    with pytest.raises(server_module.HTTPException) as excinfo:
        asyncio.run(server_module.get_order("order-1", _DummyRequest()))

    assert excinfo.value.status_code == 403


def test_email_change_token_is_hashed_and_not_exposed(server_module, monkeypatch):
    server_module.db = _DummyDB()

    class DummyUser:
        id = "u1"
        email = "old@example.com"

    class DummyPayload:
        current_password = "pw"
        new_email = "new@example.com"

    monkeypatch.setattr(server_module, "verify_password", lambda *args, **kwargs: True)
    monkeypatch.setattr(server_module, "hash_password", lambda *args, **kwargs: "hash")
    monkeypatch.setattr(server_module, "_trusted_public_base_url", lambda: "https://example.com")
    async def _fake_send_email(*args, **kwargs):
        return None

    monkeypatch.setattr(server_module, "_send_email", _fake_send_email)

    class DummyUserLookup:
        async def find_one(self, query):
            if query.get("id") == "u1":
                return {"id": "u1", "email": "old@example.com", "password_hash": "hash"}
            return None

    server_module.db.users = DummyUserLookup()

    asyncio.run(server_module.account_request_email_change(DummyPayload(), _DummyRequest(), {"id": "u1", "email": "old@example.com"}))
    stored = server_module.db.email_change_requests.docs[0]

    assert stored["token_hash"]
    assert "token" not in stored
    assert stored["token_hash"] != "plain-token"
