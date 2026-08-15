import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
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


class AsyncCursor:
    def __init__(self, documents):
        self.documents = documents

    def __aiter__(self):
        async def iterate():
            for document in self.documents:
                yield document

        return iterate()


def test_parcel_weight_fetches_products_in_one_query(server_module, monkeypatch):
    calls = []
    documents = [
        {
            "id": "product-a",
            "slug": "product-a",
            "variants": [{"id": "variant-a", "weight_grams": 100}],
        },
        {
            "id": "product-b",
            "slug": "product-b",
            "variants": [{"id": "variant-b", "weight_grams": 250}],
        },
    ]

    class Products:
        def find(self, query, projection):
            calls.append((query, projection))
            return AsyncCursor(documents)

        async def find_one(self, *args, **kwargs):
            raise AssertionError("parcel weight must not issue per-item queries")

    monkeypatch.setattr(server_module, "db", SimpleNamespace(products=Products()))
    items = [
        server_module.CartItem(product_id="product-a", variant_id="variant-a", qty=2),
        server_module.CartItem(product_id="product-b", variant_id="variant-b", qty=1),
        server_module.CartItem(product_id="product-a", variant_id="variant-a", qty=3),
    ]

    weight = asyncio.run(server_module._estimate_parcel_weight_kg(items))

    assert weight == 0.75
    assert len(calls) == 1
    assert set(calls[0][0]["id"]["$in"]) == {"product-a", "product-b"}
    assert calls[0][1] == {"_id": 0}


def test_uploaded_files_receive_immutable_cache_headers(server_module, tmp_path):
    (tmp_path / "asset-uuid.pdf").write_bytes(b"%PDF-test")
    app = server_module.FastAPI()
    app.mount("/uploads", server_module.ImmutableStaticFiles(directory=tmp_path))
    client = TestClient(app, raise_server_exceptions=False)

    found = client.get("/uploads/asset-uuid.pdf")
    missing = client.get("/uploads/missing.pdf")

    assert found.status_code == 200
    assert found.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert missing.status_code == 404
    assert "cache-control" not in missing.headers