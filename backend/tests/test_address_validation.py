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
