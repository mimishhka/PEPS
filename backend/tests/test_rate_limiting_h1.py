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


class _DummyRateLimitCounters:
    def __init__(self):
        self.docs = {}

    async def find_one_and_update(self, query, update, **kwargs):
        doc_id = query["_id"]
        document = self.docs.setdefault(doc_id, {"_id": doc_id, "count": 0})
        document["count"] += update["$inc"]["count"]
        return dict(document)


class _DummyDB:
    def __init__(self):
        self.users = _DummyUsers()
        self.magic_tokens = _DummyMagicTokens()
        self.rate_limit_counters = _DummyRateLimitCounters()


class _DummyRequest:
    def __init__(self, remote_ip, headers=None):
        self.client = SimpleNamespace(host=remote_ip)
        self.headers = headers or {}


def test_client_ip_ignores_untrusted_forwarded_for(server_module, monkeypatch):
    request = _DummyRequest("203.0.113.10", {"x-forwarded-for": "8.8.8.8"})

    assert server_module._client_ip(request) == "203.0.113.10"


def test_client_ip_ignores_spoofed_cloudflare_header_from_untrusted_peer(server_module):
    request = _DummyRequest("203.0.113.10", {"cf-connecting-ip": "8.8.8.8"})

    assert server_module._client_ip(request) == "203.0.113.10"


def test_magic_request_is_rate_limited_per_email(server_module, monkeypatch):
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


def test_shared_limiter_fails_closed_when_mongo_is_unavailable(server_module):
    class BrokenCounters:
        async def find_one_and_update(self, *args, **kwargs):
            raise RuntimeError("mongo unavailable")

    server_module.db = SimpleNamespace(rate_limit_counters=BrokenCounters())

    with pytest.raises(server_module.HTTPException) as excinfo:
        asyncio.run(server_module._rate_limit("test", "client", 10, 60, "limited"))

    assert excinfo.value.status_code == 503


def test_mutation_middleware_returns_503_without_calling_endpoint(server_module):
    class BrokenCounters:
        async def find_one_and_update(self, *args, **kwargs):
            raise RuntimeError("mongo unavailable")

    server_module.db = SimpleNamespace(rate_limit_counters=BrokenCounters())
    request = _DummyRequest("127.0.0.1")
    request.method = "POST"
    request.url = SimpleNamespace(path="/api/newsletter/subscribe")
    endpoint_called = False

    async def call_next(_request):
        nonlocal endpoint_called
        endpoint_called = True
        return None

    response = asyncio.run(server_module._shared_mutation_rate_limit(request, call_next))

    assert response.status_code == 503
    assert endpoint_called is False


def test_mutation_middleware_returns_429_at_shared_limit(server_module):
    database = _DummyDB()
    server_module.db = database
    server_module.PUBLIC_MUTATION_MAX_PER_MINUTE = 1
    request = _DummyRequest("127.0.0.1")
    request.method = "POST"
    request.url = SimpleNamespace(path="/api/checkout")
    calls = 0

    async def call_next(_request):
        nonlocal calls
        calls += 1
        return SimpleNamespace(status_code=200)

    first = asyncio.run(server_module._shared_mutation_rate_limit(request, call_next))
    second = asyncio.run(server_module._shared_mutation_rate_limit(request, call_next))

    assert first.status_code == 200
    assert second.status_code == 429
    assert calls == 1
