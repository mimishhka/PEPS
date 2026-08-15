import asyncio
import importlib
import logging
import sys
from pathlib import Path
from types import SimpleNamespace

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
    client = TestClient(server_module.app, base_url="https://testserver", raise_server_exceptions=False)
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
    api_response = client.get("/api/does-not-exist")

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

    http_client = TestClient(server_module.app, base_url="http://testserver", raise_server_exceptions=False)
    spoofed = http_client.get("/api/does-not-exist", headers={"X-Forwarded-Proto": "https"})
    assert "strict-transport-security" not in spoofed.headers


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

    class EmailOutbox:
        async def insert_one(self, document):
            captured.update(document)

    server_module.RESEND_API_KEY = "configured"
    server_module.db = SimpleNamespace(email_outbox=EmailOutbox())
    asyncio.run(server_module._send_email(
        "victim@example.com\r\nBcc: attacker@example.com",
        "Order update\r\nBcc: attacker@example.com",
        "<p>Body</p>",
        from_email="FIRONOVA\r\nReply-To: attacker@example.com",
    ))

    assert captured["status"] == "pending"
    assert "\r" not in captured["to"][0] and "\n" not in captured["to"][0]
    assert "\r" not in captured["subject"] and "\n" not in captured["subject"]
    assert "\r" not in captured["from"] and "\n" not in captured["from"]


def test_order_email_escapes_customer_controlled_html(server_module):
    order = {
        "items": [{"name_en": "<img src=x onerror=alert(1)>", "qty": 1}],
        "shipping_address": {
            "full_name": "<script>alert(1)</script>",
            "address1": "1 <b>Main</b>",
            "city": "Montreal",
            "province": "QC",
            "postal_code": "H2X 1Y4",
        },
        "subtotal": 10,
        "shipping": 20,
        "total": 30,
    }
    rendered = server_module._render_block("items", "en", order)

    assert "<script>" not in rendered
    assert "<img src=x onerror=" not in rendered
    assert "&lt;script&gt;" in rendered
    assert "&lt;img src=x onerror=alert(1)&gt;" in rendered


def test_customer_order_payload_redacts_internal_fields(server_module):
    public = server_module._customer_order_payload({
        "id": "order-1",
        "compliance": {"ip": "203.0.113.4", "accept_terms": True},
        "notes": [
            {"text": "internal", "visible_to_customer": False},
            {"text": "visible", "visible_to_customer": True},
        ],
        "payment_info": {"provider_response": {
            "invoice_id": "invoice-1",
            "api_secret": "must-not-leak",
        }},
    })

    assert "ip" not in public["compliance"]
    assert [note["text"] for note in public["notes"]] == ["visible"]
    assert public["payment_info"]["provider_response"] == {"invoice_id": "invoice-1"}


def test_csv_values_neutralize_spreadsheet_formulas(server_module):
    row = server_module._csv_safe_row({
        "email": "victim@example.com",
        "source": " =HYPERLINK(\"https://attacker.example\")",
    })

    assert row["email"] == "victim@example.com"
    assert row["source"].startswith("'")


def test_coupon_claim_rechecks_usage_limit_atomically(server_module):
    captured = {}

    class Coupons:
        async def update_one(self, query, update):
            captured.update(query)
            return SimpleNamespace(modified_count=0)

    server_module.db = SimpleNamespace(coupons=Coupons())
    claimed = asyncio.run(server_module._claim_coupon_usage({
        "id": "order-1",
        "email": "buyer@example.com",
        "coupon": {"code": "LIMITED"},
        "coupon_counted": False,
    }))

    assert claimed is False
    assert "$or" in captured
    assert any("$expr" in branch for branch in captured["$or"])


def test_interac_rejects_non_exact_sender(server_module, monkeypatch):
    server_module.INTERAC_TRUSTED_SENDER = "notify@payments.interac.ca"

    async def graph_token():
        return "graph-token"

    async def unread_messages(token):
        return [{
            "id": "message-1",
            "from": {"emailAddress": {"address": "interac@attacker.example"}},
            "subject": "FN-123456-ABCDEF $10.00",
            "body": {"content": ""},
        }]

    class Orders:
        async def find_one(self, *args, **kwargs):
            raise AssertionError("Untrusted sender must not reach order matching")

    server_module.db = SimpleNamespace(orders=Orders())
    monkeypatch.setattr(server_module, "_graph_access_token", graph_token)
    monkeypatch.setattr(server_module, "_graph_unread_messages", unread_messages)

    assert asyncio.run(server_module._process_interac_deposit_emails()) == 0


def test_production_disables_api_schema(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://api.example.com")
    monkeypatch.setenv("CORS_ORIGINS", "https://shop.example.com")
    monkeypatch.setenv("APP_ENV", "production")

    import server
    production_server = importlib.reload(server)
    paths = {route.path for route in production_server.app.routes}

    assert "/docs" not in paths
    assert "/redoc" not in paths
    assert "/openapi.json" not in paths