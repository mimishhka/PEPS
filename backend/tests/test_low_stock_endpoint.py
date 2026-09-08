# -*- coding: utf-8 -*-
"""Panneau « stock faible » de l'administration.

CES TESTS ONT ETE REECRITS. Ils bouchonnaient la collection `low_stock_alerts`,
que l'endpoint ne consulte plus : `admin_list_low_stock_alerts` lit desormais EN
DIRECT dans `products`, via `_low_stock_variants()`. La raison est dans la
docstring de l'endpoint — la collection n'est alimentee que par EVENEMENT, donc
une variante descendue a la main dans l'admin n'y apparaissait jamais, et le
tableau de bord annoncait « 1 stock faible » en haut avec « aucune alerte » juste
en dessous.

Les quatre anciens tests echouaient tous, sans que personne le sache : aucun
environnement Python local ne permettait de les lancer. Ils verifiaient un
comportement disparu.
"""
import asyncio
import importlib
import os
import sys
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


def _produit(**extra):
    """Produit actif, seuil 5, une variante basse et une variante confortable."""
    doc = {
        "id": "prod-1",
        "slug": "bpc-157",
        "name_en": "BPC-157",
        "name_fr": "BPC-157",
        "active": True,
        "deleted_at": None,
        "low_stock_threshold": 5,
        "variants": [
            {"id": "var-5mg", "name": "5mg", "sku": "BPC-5", "stock": 2},
            {"id": "var-10mg", "name": "10mg", "sku": "BPC-10", "stock": 50},
        ],
    }
    doc.update(extra)
    return doc


def _appel(server_module, produits):
    server_module.db = SimpleNamespace(products=FakeCollection(produits))
    return asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))


def test_variante_sous_le_seuil_est_listee_et_enrichie(server_module):
    result = _appel(server_module, [_produit()])

    assert result["count"] == 1
    item = result["items"][0]
    assert item["product_name"] == "BPC-157"
    assert item["product_slug"] == "bpc-157"
    assert item["variant_id"] == "var-5mg"
    assert item["variant_name"] == "5mg"
    assert item["variant_sku"] == "BPC-5"
    assert item["stock"] == 2
    assert item["threshold"] == 5
    assert item["out_of_stock"] is False


def test_variante_au_dessus_du_seuil_est_ignoree(server_module):
    """La variante a 50 unites ne doit pas remonter : c'est tout le filtre."""
    result = _appel(server_module, [_produit()])

    assert [i["variant_id"] for i in result["items"]] == ["var-5mg"]


def test_stock_saisi_a_la_main_remonte_sans_alerte_enregistree(server_module):
    """LA regression qui a motive la reecriture de l'endpoint.

    Aucune collection `low_stock_alerts` n'est fournie ici — l'objet `db` n'en a
    meme pas. Si l'endpoint la consultait a nouveau, ce test leverait
    AttributeError au lieu de passer silencieusement.
    """
    produit = _produit(variants=[
        {"id": "var-5mg", "name": "5mg", "sku": "BPC-5", "stock": 1},
    ])

    result = _appel(server_module, [produit])

    assert result["count"] == 1
    assert result["items"][0]["stock"] == 1


def test_rupture_passe_avant_stock_faible(server_module):
    """Le plus critique en premier : stock croissant, rupture en tete."""
    produit = _produit(variants=[
        {"id": "var-5mg", "name": "5mg", "sku": "BPC-5", "stock": 4},
        {"id": "var-10mg", "name": "10mg", "sku": "BPC-10", "stock": 0},
    ])

    result = _appel(server_module, [produit])

    assert [i["variant_id"] for i in result["items"]] == ["var-10mg", "var-5mg"]
    assert result["items"][0]["out_of_stock"] is True
    assert result["items"][1]["out_of_stock"] is False


def test_produit_inactif_ou_supprime_reste_invisible(server_module):
    """Un produit retire du catalogue n'a pas a encombrer le panneau."""
    inactif = _produit(id="prod-inactif", slug="retire", active=False)
    supprime = _produit(id="prod-supprime", slug="efface",
                        deleted_at="2026-08-01T00:00:00+00:00")

    result = _appel(server_module, [inactif, supprime])

    assert result == {"items": [], "count": 0}


def test_seuil_par_defaut_de_dix_si_le_produit_n_en_definit_aucun(server_module):
    """Sans `low_stock_threshold`, le seuil est 10 — pas 0, pas l'absence de seuil."""
    produit = _produit(low_stock_threshold=None, variants=[
        {"id": "var-a", "name": "A", "sku": "A", "stock": 9},
        {"id": "var-b", "name": "B", "sku": "B", "stock": 11},
    ])

    result = _appel(server_module, [produit])

    assert [i["variant_id"] for i in result["items"]] == ["var-a"]
    assert result["items"][0]["threshold"] == 10


def test_aucune_variante_sous_le_seuil(server_module):
    produit = _produit(variants=[
        {"id": "var-10mg", "name": "10mg", "sku": "BPC-10", "stock": 50},
    ])

    result = _appel(server_module, [produit])

    assert result == {"items": [], "count": 0}


def test_produit_sans_nom_degrade_sans_lever(server_module):
    """Un catalogue incomplet ne doit pas faire tomber l'ecran entier."""
    produit = _produit(name_en=None, name_fr=None, variants=[
        {"id": "var-5mg", "stock": 0},
    ])

    result = _appel(server_module, [produit])

    item = result["items"][0]
    assert item["product_name"] == "bpc-157"  # repli sur le slug
    assert item["variant_name"] == ""
    assert item["variant_sku"] == ""


def test_une_seule_requete_sur_products(server_module):
    """Deux variantes du meme produit ne doivent pas declencher deux lectures."""
    produits = FakeCollection([_produit(variants=[
        {"id": "var-5mg", "name": "5mg", "sku": "BPC-5", "stock": 2},
        {"id": "var-10mg", "name": "10mg", "sku": "BPC-10", "stock": 1},
    ])])
    appels = []
    find_original = produits.find
    produits.find = lambda *a, **kw: (appels.append(a), find_original(*a, **kw))[1]

    server_module.db = SimpleNamespace(products=produits)
    result = asyncio.run(server_module.admin_list_low_stock_alerts({"id": "admin"}))

    assert len(appels) == 1
    assert result["count"] == 2
