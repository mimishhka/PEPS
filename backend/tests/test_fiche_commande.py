# -*- coding: utf-8 -*-
"""La fiche d'une commande, cote serveur : trois gardes.

Constates en ouvrant de vraies commandes le 2026-09-19 :

- enregistrer un numero de suivi sur une commande LIVREE la renvoyait en
  « expediee » — elle quittait l'onglet Completed pour revenir dans Active ;
- « Confirm Payment » sur une commande annulee ou echouee ne faisait rien,
  mais repondait 200 : l'ecran annoncait « Payment confirmed » ;
- « Resend Email » renvoyait le detail de la commande — avec, sans paiement,
  les instructions pour payer — a un client annule ou rembourse.
"""
import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


def _commandes(doc):
    ecrit = {}

    class Orders:
        async def find_one(self, filtre, projection=None):
            return dict(doc)

        async def update_one(self, filtre, update):
            ecrit.update(update.get("$set") or {})
            return SimpleNamespace(matched_count=1, modified_count=1)

    return Orders(), ecrit


# ---------------------------------------------------------------------------
# Le suivi ne fait jamais regresser une commande
# ---------------------------------------------------------------------------

def test_un_suivi_sur_une_commande_livree_ne_la_renvoie_pas_en_expediee(server_module):
    orders, ecrit = _commandes({"id": "o-1", "payment_status": "paid",
                                "fulfillment_status": "delivered", "shipping_info": {}})
    server_module.db = SimpleNamespace(orders=orders)
    asyncio.run(server_module.admin_set_shipping_info(
        "o-1", server_module.ShippingInfoIn(carrier="Canada Post", tracking_number="1234567890"), {}))

    assert ecrit["shipping_info"]["tracking_number"] == "1234567890"   # la correction passe
    assert "fulfillment_status" not in ecrit                            # le statut ne recule pas


def test_un_suivi_sur_une_commande_en_preparation_l_expedie(server_module):
    orders, ecrit = _commandes({"id": "o-2", "payment_status": "paid",
                                "fulfillment_status": "processing", "shipping_info": {}})
    server_module.db = SimpleNamespace(orders=orders)
    asyncio.run(server_module.admin_set_shipping_info(
        "o-2", server_module.ShippingInfoIn(carrier="Canada Post", tracking_number="1234567890"), {}))

    assert ecrit["fulfillment_status"] == "shipped"


def test_le_suivi_conserve_l_etiquette_existante(server_module):
    """Garde plus ancienne, a ne pas perdre : le PUT remplacait shipping_info
    en bloc et effacait label_url et cp_transmitted."""
    orders, ecrit = _commandes({"id": "o-3", "payment_status": "paid", "fulfillment_status": "processing",
                                "shipping_info": {"label_url": "/x.pdf", "cp_transmitted": True}})
    server_module.db = SimpleNamespace(orders=orders)
    asyncio.run(server_module.admin_set_shipping_info(
        "o-3", server_module.ShippingInfoIn(carrier="Canada Post", tracking_number="1"), {}))

    assert ecrit["shipping_info"]["label_url"] == "/x.pdf"
    assert ecrit["shipping_info"]["cp_transmitted"] is True


# ---------------------------------------------------------------------------
# Confirmer un paiement : pas de faux succes
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("statut, mot", [
    ("cancelled", "Réouvrir"),
    ("failed", "échoué"),
    ("refunded", "rembours"),
])
def test_confirmer_un_statut_terminal_est_refuse_et_dit_pourquoi(server_module, statut, mot):
    orders, _ = _commandes({"id": "o-4", "payment_status": statut})
    server_module.db = SimpleNamespace(orders=orders)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_confirm_payment("o-4", {}))
    assert exc.value.status_code == 400
    assert mot in exc.value.detail


def test_confirmer_une_commande_deja_payee_reste_idempotent(server_module):
    orders, _ = _commandes({"id": "o-5", "payment_status": "paid"})
    server_module.db = SimpleNamespace(orders=orders)
    assert asyncio.run(server_module.admin_confirm_payment("o-5", {}))["payment_status"] == "paid"


# ---------------------------------------------------------------------------
# Renvoyer le courriel : pas a un client dont la commande est close
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("statut", ["cancelled", "failed", "refunded"])
def test_pas_de_courriel_de_commande_a_un_client_dont_la_commande_est_close(
        server_module, monkeypatch, statut):
    envois = []

    async def envoyer(*a, **k):
        envois.append(a)

    monkeypatch.setattr(server_module, "_send_email", envoyer)
    orders, _ = _commandes({"id": "o-6", "order_number": "FN-6", "email": "a@example.com",
                            "payment_status": statut})
    server_module.db = SimpleNamespace(orders=orders)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_resend_order_email("o-6", {}))
    assert exc.value.status_code == 400
    assert envois == []


def test_le_courriel_part_pour_une_commande_payee(server_module, monkeypatch):
    envois = []

    async def envoyer(dest, *a, **k):
        envois.append(dest)

    monkeypatch.setattr(server_module, "_send_email", envoyer)
    monkeypatch.setattr(server_module, "_order_email_html", lambda order, heading: "<p>x</p>")
    orders, _ = _commandes({"id": "o-7", "order_number": "FN-7", "email": "a@example.com",
                            "payment_status": "paid"})
    server_module.db = SimpleNamespace(orders=orders)
    assert asyncio.run(server_module.admin_resend_order_email("o-7", {}))["sent_to"] == "a@example.com"
    assert envois == ["a@example.com"]
