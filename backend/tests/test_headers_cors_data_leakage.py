import asyncio
import importlib
import logging
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://api.example.com")
    monkeypatch.setenv("CORS_ORIGINS", "https://shop.example.com")
    monkeypatch.setenv("CORS_ORIGIN_REGEX", "")

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import server
    return importlib.reload(server)


def test_cors_is_explicit_and_security_headers_are_present(server_module):
    client = TestClient(server_module.app, raise_server_exceptions=False)
    allowed = client.options(
        "/api/example",
        headers={
            "Origin": "https://shop.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    denied = client.options(
        "/api/example",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    api_response = client.get("/api/does-not-exist", headers={"X-Forwarded-Proto": "https"})

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://shop.example.com"
    assert allowed.headers["access-control-allow-credentials"] == "true"
    assert "*" not in allowed.headers["access-control-allow-methods"]
    assert "*" not in allowed.headers["access-control-allow-headers"]
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
    assert api_response.headers["content-security-policy"].startswith("default-src 'none'")
    assert api_response.headers["cache-control"] == "no-store"
    assert api_response.headers["strict-transport-security"].startswith("max-age=31536000")


def test_provider_exception_is_not_returned(server_module, monkeypatch):
    monkeypatch.setattr(server_module, "is_canada_post_configured", lambda: True)
    monkeypatch.setattr(server_module, "_cp_use_openapi", lambda: True)

    async def fail_provider_call(*args, **kwargs):
        raise RuntimeError("secret-token customer@example.com")

    monkeypatch.setattr(server_module, "_cp_openapi_call", fail_provider_call)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(server_module.admin_retry_manifest("2026-08-15", {}))

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail == "Impossible de contacter Canada Post"
    assert "secret-token" not in exc_info.value.detail


def test_email_logs_use_non_pii_recipient_reference(server_module, caplog):
    server_module.RESEND_API_KEY = ""
    with caplog.at_level(logging.INFO):
        asyncio.run(
            server_module._send_email(
                "customer@example.com",
                "Private order subject",
                "<p>Private body</p>",
            )
        )

    assert "customer@example.com" not in caplog.text
    assert "Private order subject" not in caplog.text
    assert "recipients=" in caplog.text


def test_email_boundary_strips_crlf_from_headers(server_module, monkeypatch):
    captured = {}

    def capture_send(params):
        captured.update(params)
        return {"id": "email-1"}

    server_module.RESEND_API_KEY = "configured"
    monkeypatch.setattr(server_module.resend.Emails, "send", capture_send)
    asyncio.run(server_module._send_email(
        "victim@example.com\r\nBcc: attacker@example.com",
        "Order update\r\nBcc: attacker@example.com",
        "<p>Body</p>",
        from_email="FIRONOVA\r\nReply-To: attacker@example.com",
    ))

    assert "\r" not in captured["to"][0] and "\n" not in captured["to"][0]
    assert "\r" not in captured["subject"] and "\n" not in captured["subject"]
    assert "\r" not in captured["from"] and "\n" not in captured["from"]