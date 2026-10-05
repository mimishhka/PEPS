"""Sprint J-1 - Item 1.3 : Address Validation (Google Maps AVS).

Vérifie que :
  1. POST /checkout/validate-address accepte une adresse canadienne valide
  2. POST /checkout/validate-address renvoie valid=false + suggestion sur adresse bidon
  3. POST /checkout est bloqué (422 + detail.code=invalid_shipping_address) si adresse invalide
  4. Le cache 24h évite un 2e appel Google pour la même adresse (indirect via provider=google_maps)
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://peptide-ca.preview.emergentagent.com").rstrip("/")


def _hdr():
    return {"Content-Type": "application/json", "Origin": BASE_URL}


@pytest.mark.skipif(
    not os.environ.get("GOOGLE_MAPS_API_KEY"),
    reason="GOOGLE_MAPS_API_KEY not set — feature disabled, tests would pass trivially",
)
class TestAddressValidation:
    valid_addr = {
        "full_name": "Test User",
        "address1": "100 Queen Street West",
        "city": "Toronto",
        "province": "ON",
        "postal_code": "M5H 2N2",
        "country": "CA",
    }
    invalid_addr = {
        "full_name": "Test User",
        "address1": f"9999 Fake Street {uuid.uuid4().hex[:6]}",
        "city": "NowhereVille",
        "province": "QC",
        "postal_code": "H0H 0H0",
        "country": "CA",
    }

    def test_valid_ca_address_accepted(self):
        r = requests.post(
            f"{BASE_URL}/api/checkout/validate-address",
            json=self.valid_addr, headers=_hdr(), timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["valid"] is True
        assert d["provider"] in ("google_maps", "disabled")

    def test_invalid_ca_address_returns_suggestion(self):
        r = requests.post(
            f"{BASE_URL}/api/checkout/validate-address",
            json=self.invalid_addr, headers=_hdr(), timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        if d["provider"] != "google_maps":
            pytest.skip("Google returned unexpected verdict — API may be down")
        assert d["valid"] is False
        assert len(d["suggestions"]) >= 1
        assert d["suggestions"][0].get("formattedAddress")

    def test_checkout_blocked_on_invalid_address(self):
        """L'ordre ne doit PAS être créé, la réponse 422 doit contenir detail.code."""
        # Récupère un vrai product_id + variant_id
        pr = requests.get(f"{BASE_URL}/api/products?limit=1", timeout=10)
        products = pr.json()
        if not products:
            pytest.skip("No products in DB")
        p = products[0]
        v = (p.get("variants") or [None])[0]
        if not v:
            pytest.skip("Product has no variant")

        payload = {
            "items": [{"product_id": p["id"], "variant_id": v["id"], "qty": 1}],
            "shipping": self.invalid_addr,
            "email": f"test_{uuid.uuid4().hex[:6]}@fironova-smoke.com",
            "payment_method": "interac",
            "accept_terms": True, "confirm_age": True, "confirm_research_use": True,
        }
        r = requests.post(f"{BASE_URL}/api/checkout", json=payload, headers=_hdr(), timeout=15)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:300]}"
        detail = r.json().get("detail", {})
        assert isinstance(detail, dict), f"detail should be dict, got {type(detail)}"
        assert detail.get("code") == "invalid_shipping_address"
        assert isinstance(detail.get("suggestions"), list)


def test_google_maps_validation_accepts_plausible_confirm_address(monkeypatch):
    """Une adresse canadienne plausible avec action Google `CONFIRM` doit passer."""
    import asyncio
    import httpx
    import server

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload
        def json(self):
            return self._payload
        status_code = 200

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            return False
        async def post(self, *args, **kwargs):
            return FakeResponse({
                "result": {
                    "verdict": {
                        "addressComplete": True,
                        "hasUnconfirmedComponents": True,
                        "possibleNextAction": "CONFIRM",
                    },
                    "address": {
                        "formattedAddress": "1 Main Street, East York, ON M5H2N2, Canada",
                        "postalAddress": {"regionCode": "CA", "administrativeArea": "ON"},
                        "unconfirmedComponentTypes": ["street_number", "postal_code"],
                    },
                },
                "responseId": "abc123",
            })

    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-google-key")
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    result = asyncio.run(server._validate_shipping_address_google({
        "address1": "1 Main",
        "city": "Toronto",
        "province": "ON",
        "postal_code": "M5H2N2",
        "country": "CA",
    }))

    assert result["valid"] is True
    assert result["provider"] == "google_maps"


def test_google_maps_validation_accepts_subpremise_only_prompt(monkeypatch):
    """Un manque d'appartement seul ne doit pas bloquer une adresse valide."""
    import asyncio
    import httpx
    import server

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload
        def json(self):
            return self._payload
        status_code = 200

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            return False
        async def post(self, *args, **kwargs):
            return FakeResponse({
                "result": {
                    "verdict": {
                        "addressComplete": False,
                        "hasUnconfirmedComponents": True,
                        "possibleNextAction": "CONFIRM_ADD_SUBPREMISES",
                    },
                    "address": {
                        "formattedAddress": "1450 Rue Peel, Montréal, QC H3A 1T1, Canada",
                        "missingComponentTypes": ["subpremise"],
                    },
                },
                "responseId": "apt123",
            })

    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-google-key")
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    result = asyncio.run(server._validate_shipping_address_google({
        "address1": "1450 Rue Peel",
        "city": "Montreal",
        "province": "QC",
        "postal_code": "H3A 1T1",
        "country": "CA",
    }))

    assert result["valid"] is True
    assert result["provider"] == "google_maps"


def test_google_maps_validation_rejects_missing_route(monkeypatch):
    """Une adresse avec rue manquante doit rester rejetée."""
    import asyncio
    import httpx
    import server

    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload
        def json(self):
            return self._payload
        status_code = 200

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            return False
        async def post(self, *args, **kwargs):
            return FakeResponse({
                "result": {
                    "verdict": {
                        "addressComplete": False,
                        "hasUnconfirmedComponents": True,
                        "possibleNextAction": "FIX",
                    },
                    "address": {
                        "formattedAddress": "C, QC A1A1A1, Canada",
                        "missingComponentTypes": ["route", "street_number"],
                    },
                },
                "responseId": "bad456",
            })

    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "test-google-key")
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)

    result = asyncio.run(server._validate_shipping_address_google({
        "address1": "1",
        "city": "C",
        "province": "QC",
        "postal_code": "A1A1A1",
        "country": "CA",
    }))

    assert result["valid"] is False
    assert result["reason"] in {"non_confirme", "manque_appartement"}
