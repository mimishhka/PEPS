import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from starlette.requests import Request
from starlette.responses import Response


class _RateLimitCounters:
    def __init__(self):
        self.counts = {}

    async def find_one_and_update(self, query, update, **kwargs):
        doc_id = query["_id"]
        self.counts[doc_id] = self.counts.get(doc_id, 0) + update["$inc"]["count"]
        return {"_id": doc_id, "count": self.counts[doc_id]}


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


def _request(path="/api/auth/login", cookie=None):
    headers = [(b"host", b"example.com")]
    if cookie:
        headers.append((b"cookie", cookie.encode()))
    return Request({
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "scheme": "https",
        "server": ("example.com", 443),
    })


def test_login_uses_httponly_cookie_without_returning_token(server_module, monkeypatch):
    class Users:
        async def find_one(self, query):
            return {
                "id": "user-1", "email": "user@example.com", "name": "User",
                "role": "user", "created_at": "2026-01-01T00:00:00+00:00",
                "password_hash": "hash", "token_version": 0, "email_verified": True,
            }

    async def allow(*args, **kwargs):
        return None

    class RefreshSessions:
        def __init__(self):
            self.documents = []

        async def insert_one(self, document):
            self.documents.append(document)

    refresh_sessions = RefreshSessions()
    server_module.db = SimpleNamespace(users=Users(), refresh_sessions=refresh_sessions)
    monkeypatch.setattr(server_module, "_rate_limit", allow)
    monkeypatch.setattr(server_module, "verify_password", lambda *args: True)
    response = Response()

    result = asyncio.run(server_module.login(
        server_module.LoginIn(email="user@example.com", password="Strong1!"),
        response,
        _request(),
    ))

    assert "token" not in result
    assert "access_token" not in result
    cookies = response.headers.getlist("set-cookie")
    assert any(cookie.startswith("access_token=") and "HttpOnly" in cookie for cookie in cookies)
    assert any(cookie.startswith("refresh_token=") and "HttpOnly" in cookie for cookie in cookies)
    assert len(refresh_sessions.documents) == 1
    assert "token_hash" in refresh_sessions.documents[0]


def test_refresh_rotates_once_and_replay_revokes_family(server_module):
    now = server_module.datetime.now(server_module.timezone.utc)
    raw_refresh = "one-time-refresh-token"
    original = {
        "id": "session-1",
        "family_id": "family-1",
        "user_id": "user-1",
        "token_hash": server_module._hash_refresh_token(raw_refresh),
        "token_version": 0,
        "created_at": now,
        "expires_at": now + server_module.timedelta(days=1),
        "revoked_at": None,
    }

    class RefreshSessions:
        def __init__(self):
            self.documents = [original]

        async def find_one(self, query):
            return next((doc for doc in self.documents if doc["token_hash"] == query["token_hash"]), None)

        async def find_one_and_update(self, query, update, **kwargs):
            document = await self.find_one(query)
            if not document or document["revoked_at"] is not None or document["expires_at"] <= now:
                return None
            document.update(update["$set"])
            return document

        async def insert_one(self, document):
            self.documents.append(document)

        async def update_many(self, query, update):
            for document in self.documents:
                if document["family_id"] == query["family_id"] and document["revoked_at"] is None:
                    document.update(update["$set"])

    class Users:
        async def find_one(self, query):
            return {
                "id": "user-1", "email": "user@example.com", "name": "User",
                "role": "user", "token_version": 0,
            }

    refresh_sessions = RefreshSessions()
    server_module.db = SimpleNamespace(users=Users(), refresh_sessions=refresh_sessions)

    response = Response()
    result = asyncio.run(server_module.refresh_session(
        response,
        _request("/api/auth/refresh", f"refresh_token={raw_refresh}"),
    ))

    assert result == {"ok": True}
    assert original["revoke_reason"] == "rotated"
    assert len(refresh_sessions.documents) == 2
    assert refresh_sessions.documents[1]["family_id"] == "family-1"

    replay = asyncio.run(server_module.refresh_session(
        Response(),
        _request("/api/auth/refresh", f"refresh_token={raw_refresh}"),
    ))

    assert replay.status_code == 401
    assert refresh_sessions.documents[1]["revoke_reason"] == "reuse_detected"
    assert any("refresh_token=" in cookie and "Max-Age=0" in cookie for cookie in replay.headers.getlist("set-cookie"))


def test_register_requires_email_verification_before_session(server_module, monkeypatch):
    sent_links = []

    class Users:
        async def find_one(self, query):
            return None

        async def insert_one(self, document):
            return None

    class Subscribers:
        async def update_one(self, query, update):
            return None

    async def allow(*args, **kwargs):
        return None

    async def issue_token(*args, **kwargs):
        return "verification-token"

    async def send_magic(email, link, lang, is_signup):
        sent_links.append(link)

    server_module.db = SimpleNamespace(users=Users(), subscribers=Subscribers())
    monkeypatch.setattr(server_module, "_rate_limit", allow)
    monkeypatch.setattr(server_module, "_issue_magic_token", issue_token)
    monkeypatch.setattr(server_module, "_send_magic_email", send_magic)
    response = Response()

    result = asyncio.run(server_module.register(
        server_module.RegisterIn(
            email="new@example.com", password="StrongPass1!", name="New User",
        ),
        response,
        _request("/api/auth/register"),
    ))

    assert result["email_verified"] is False
    assert "token" not in result
    assert "access_token" not in result
    assert "set-cookie" not in response.headers
    assert sent_links == ["https://example.com/auth/callback?token=verification-token"]


@pytest.mark.parametrize("field", ["role", "is_admin"])
def test_profile_update_rejects_privilege_fields(server_module, field):
    with pytest.raises(ValidationError):
        server_module.ProfileUpdateIn(name="Test User", **{field: "admin"})


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
                def __aiter__(self):
                    async def iterate():
                        yield {"id": "order-1"}
                    return iterate()
            return _Cursor()

    orders = _Orders()
    db = SimpleNamespace(
        users=users,
        orders=orders,
        rate_limit_counters=_RateLimitCounters(),
        addresses=_Collection(),
        stock_notifications=_Collection(),
        subscribers=_Collection(),
        email_change_requests=_Collection(),
        magic_tokens=_Collection(),
        refresh_sessions=_Collection(),
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
    assert db.refresh_sessions.deleted
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
                def __aiter__(self):
                    async def iterate():
                        yield {"id": "order-2"}
                    return iterate()
            return _Cursor()

    db = SimpleNamespace(
        users=_Users(),
        orders=_Orders(),
        rate_limit_counters=_RateLimitCounters(),
        addresses=_Collection(),
        stock_notifications=_Collection(),
        subscribers=_Collection(),
        email_change_requests=_Collection(),
        magic_tokens=_Collection(),
        refresh_sessions=_Collection(),
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
