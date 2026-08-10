import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


class _AsyncDummy:
    def __init__(self, result=None):
        self.result = result

    async def __call__(self, *args, **kwargs):
        return self.result


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    monkeypatch.setenv("TRUST_PROXY_IPS", "127.0.0.1,::1")

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import server as server_module

    return importlib.reload(server_module)


class _DummyUsers:
    def __init__(self):
        self.docs = [{"email": "user@example.com"}]

    async def find_one(self, query):
        if "email" in query:
            return self.docs[0] if self.docs[0]["email"] == query["email"] else None
        if "id" in query:
            return {"id": query["id"], "email": "user@example.com", "password_hash": "hash"}
        return None


class _DummyMagicTokens:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)


class _DummyDB:
    def __init__(self):
        self.users = _DummyUsers()
        self.magic_tokens = _DummyMagicTokens()


class _DummyRequest:
    def __init__(self, remote_ip, headers=None):
        self.client = SimpleNamespace(host=remote_ip)
        self.headers = headers or {}


def test_client_ip_ignores_untrusted_forwarded_for(server_module, monkeypatch):
    request = _DummyRequest("203.0.113.10", {"x-forwarded-for": "8.8.8.8"})

    assert server_module._client_ip(request) == "203.0.113.10"


def test_magic_request_is_rate_limited_per_email(server_module, monkeypatch):
    server_module._RATE_BUCKETS.clear()
    server_module.db = _DummyDB()
    monkeypatch.setattr(server_module, "_send_magic_email", _AsyncDummy())
    monkeypatch.setattr(server_module, "_trusted_public_base_url", lambda: "https://example.com")

    payload = server_module.MagicRequestIn(email="user@example.com", create=False, lang="fr")
    request = _DummyRequest("127.0.0.1")

    first = asyncio.run(server_module.magic_request(payload, request))
    assert first["ok"] is True

    for _ in range(4):
        asyncio.run(server_module.magic_request(payload, request))

    with pytest.raises(server_module.HTTPException) as excinfo:
        asyncio.run(server_module.magic_request(payload, request))

    assert excinfo.value.status_code == 429
