import asyncio
import importlib
import os
import sys
from datetime import datetime, timedelta, timezone
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
def mail(server_module):
    from services import mail as mail_module
    return mail_module


def _job(idx, status="sent", to="foo@bar.com", subject="Order confirmation",
         created_at=None, **extra):
    doc = {
        "id": f"job-{idx}",
        "status": status,
        "to": to,
        "subject": subject,
        "from": "orders@fironova.com",
        "html": f"<p>body {idx}</p>",
        "attempts": 0,
        "created_at": created_at or f"2026-08-15T10:0{idx}:00+00:00",
    }
    doc.update(extra)
    return doc


def _outbox(server_module, docs):
    collection = FakeCollection(docs)
    server_module.db = SimpleNamespace(email_outbox=collection)
    return collection


def test_list_paginated(server_module, mail):
    _outbox(server_module, [_job(i) for i in range(5)])

    page0 = asyncio.run(mail.admin_email_list(limit=2))

    assert len(page0["items"]) == 2
    assert page0["total"] == 5
    assert page0["has_more"] is True

    page2 = asyncio.run(mail.admin_email_list(limit=2, page=2))
    assert len(page2["items"]) == 1
    assert page2["has_more"] is False


def test_list_filter_status(server_module, mail):
    _outbox(server_module, [
        _job(0, status="sent"), _job(1, status="failed"),
        _job(2, status="retry"), _job(3, status="pending"),
    ])

    result = asyncio.run(mail.admin_email_list(status="failed,retry"))

    assert {i["status"] for i in result["items"]} == {"failed", "retry"}
    assert result["total"] == 2


def test_list_redacts_recipient(server_module, mail):
    _outbox(server_module, [_job(0, to="foo@bar.com")])

    result = asyncio.run(mail.admin_email_list())

    assert result["items"][0]["to"] == "f***@b***.com"
    assert "html" not in result["items"][0]


def test_get_single_returns_html(server_module, mail):
    _outbox(server_module, [_job(0, to="foo@bar.com")])

    doc = asyncio.run(mail.admin_email_get("job-0"))

    assert doc["html"] == "<p>body 0</p>"
    assert doc["to"] == "foo@bar.com"

    with pytest.raises(server_module.HTTPException) as exc:
        asyncio.run(mail.admin_email_get("nope"))
    assert exc.value.status_code == 404


def test_retry_resets_attempts_and_status(server_module, mail):
    outbox = _outbox(server_module, [
        _job(0, status="failed", attempts=5, lease_expires_at="2026-08-15T10:05:00+00:00"),
    ])

    assert asyncio.run(mail.admin_email_retry_single("job-0")) == {"ok": True}

    doc = outbox.by_id("job-0")
    assert doc["status"] == "retry"
    assert doc["attempts"] == 0
    assert doc["requeued_by"] == "admin_single"
    assert "lease_expires_at" not in doc

    with pytest.raises(server_module.HTTPException) as exc:
        asyncio.run(mail.admin_email_retry_single("nope"))
    assert exc.value.status_code == 404


def test_cancel_marks_cancelled(server_module, mail):
    outbox = _outbox(server_module, [_job(0, status="failed")])

    assert asyncio.run(mail.admin_email_cancel("job-0")) == {"ok": True}

    doc = outbox.by_id("job-0")
    assert doc["status"] == "cancelled"
    assert doc["cancelled_by"] == "admin"
    assert doc["cancelled_at"]

    with pytest.raises(server_module.HTTPException) as exc:
        asyncio.run(mail.admin_email_cancel("nope"))
    assert exc.value.status_code == 404


def test_janitor_skips_cancelled(server_module, mail):
    """A cancelled job is old enough for the failed-retry sweep and carries an
    expired lease; neither janitor branch may resurrect it."""
    old = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    outbox = _outbox(server_module, [
        _job(0, status="cancelled", created_at=old, lease_expires_at=old),
        _job(1, status="failed", created_at=old),
    ])

    report = asyncio.run(mail._email_outbox_janitor_tick())

    assert outbox.by_id("job-0")["status"] == "cancelled"
    assert outbox.by_id("job-1")["status"] == "retry"
    assert report["failed_requeued"] == 1


def test_cancelled_job_is_never_leased_by_the_worker(server_module, mail, monkeypatch):
    outbox = _outbox(server_module, [_job(0, status="cancelled")])
    monkeypatch.setattr(server_module, "RESEND_API_KEY", "configured")

    async def find_one_and_update(filt, update, **kwargs):
        assert not any(_matches_cancelled(filt))
        return None

    def _matches_cancelled(filt):
        for branch in filt.get("$or", []):
            status = branch.get("status")
            values = status.get("$in") if isinstance(status, dict) else [status]
            yield "cancelled" in (values or [])

    outbox.find_one_and_update = find_one_and_update

    assert asyncio.run(mail._process_email_outbox_job()) is False
    assert outbox.by_id("job-0")["status"] == "cancelled"
