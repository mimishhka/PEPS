# -*- coding: utf-8 -*-
"""L'echec d'etiquette : ce qu'il laisse derriere lui.

Question du 2026-09-21 : « est-ce que la selection d'adresse fonctionne comme
Postes Canada ? ». Pour y repondre par un CHIFFRE plutot qu'une intuition, il
fallait savoir combien d'adresses Google accepte que Postes Canada refuse.

Ce n'etait pas repondable : l'echec partait dans `logging.error` et n'y
laissait aucune trace exploitable. Pire, le veilleur reprenait la meme
commande toutes les quinze secondes, pour toujours, contre une API payante.
"""
import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


@pytest.fixture
def postes(server_module):
    import services.canada_post as module
    return importlib.reload(module)


COMMANDE = {"id": "o-1", "order_number": "FN-1", "payment_status": "paid",
            "shipping_info": {}}


class _Commandes:
    def __init__(self, docs=(COMMANDE,)):
        self.docs = [dict(d) for d in docs]
        self.updates = []

    async def find_one(self, filtre, projection=None):
        for d in self.docs:
            if d.get("id") == filtre.get("id"):
                return dict(d)
        return None

    async def update_one(self, filtre, maj):
        self.updates.append(maj)


def _brancher(server_module, postes, monkeypatch, commandes=None):
    commandes = commandes or _Commandes()
    server_module.db = SimpleNamespace(orders=commandes)
    monkeypatch.setattr(server_module, "is_canada_post_configured", lambda: True)
    monkeypatch.setattr(server_module, "_order_weight_kg", lambda o: 0.5, raising=False)
    return commandes


def test_un_refus_s_ecrit_sur_la_commande(server_module, postes, monkeypatch):
    # Sans cette trace, la commande reste « payee », son bloc d'expedition
    # vide, et personne ne sait pourquoi.
    async def refuser(*_a, **_k):
        raise RuntimeError("Destination postal code is not serviceable")

    monkeypatch.setattr(server_module, "_canada_post_create_shipment", refuser,
                        raising=False)
    commandes = _brancher(server_module, postes, monkeypatch)

    resultat = asyncio.run(postes._auto_create_dispatch_label("o-1"))

    assert resultat is None
    maj = commandes.updates[-1]
    assert "not serviceable" in maj["$set"]["shipping_info.label_error"]
    assert maj["$set"]["shipping_info.label_error_at"]
    assert maj["$inc"]["shipping_info.label_attempts"] == 1


def test_le_motif_est_tronque(server_module, postes, monkeypatch):
    # Le message porte parfois l'adresse entiere, et une commande n'est pas
    # un journal.
    async def refuser(*_a, **_k):
        raise RuntimeError("x" * 900)

    monkeypatch.setattr(server_module, "_canada_post_create_shipment", refuser,
                        raising=False)
    commandes = _brancher(server_module, postes, monkeypatch)
    asyncio.run(postes._auto_create_dispatch_label("o-1"))

    assert len(commandes.updates[-1]["$set"]["shipping_info.label_error"]) == 300


def test_une_base_indisponible_ne_masque_pas_l_echec(server_module, postes, monkeypatch):
    # Ne pas pouvoir NOTER l'echec ne doit pas faire croire a une reussite.
    class Cassee(_Commandes):
        async def update_one(self, filtre, maj):
            raise RuntimeError("mongo indisponible")

    async def refuser(*_a, **_k):
        raise RuntimeError("refus")

    monkeypatch.setattr(server_module, "_canada_post_create_shipment", refuser,
                        raising=False)
    _brancher(server_module, postes, monkeypatch, Cassee())

    assert asyncio.run(postes._auto_create_dispatch_label("o-1")) is None


def test_le_veilleur_cesse_apres_le_plafond(server_module, postes, monkeypatch):
    # Une adresse que Postes Canada refuse ne deviendra pas valide en la
    # redemandant toutes les quinze secondes.
    vu = {}

    class Curseur:
        def sort(self, *a, **k):
            return self

        def __aiter__(self):
            async def rien():
                if False:
                    yield {}
            return rien()

    class Commandes:
        def find(self, filtre, projection):
            vu["filtre"] = filtre
            return Curseur()

    server_module.db = SimpleNamespace(orders=Commandes())
    asyncio.run(postes._auto_label_paid_orders_once())

    clauses = vu["filtre"]["$or"]
    plafonds = [c["shipping_info.label_attempts"]["$lt"]
                for c in clauses if "$lt" in c.get("shipping_info.label_attempts", {})]
    assert plafonds == [server_module.CANADA_POST_LABEL_MAX_ATTEMPTS]
    assert server_module.CANADA_POST_LABEL_MAX_ATTEMPTS == 5


def test_le_pouls_compte_les_etiquettes_refusees(server_module, monkeypatch):
    # Encaissees et non expediees : c'est la file la plus couteuse du systeme.
    class Vide:
        def aggregate(self, pipeline):
            class C:
                async def to_list(self, n):
                    return []
            return C()

        async def count_documents(self, *a, **k):
            return 3

    async def rien():
        return []

    monkeypatch.setattr(server_module, "_low_stock_variants", lambda limit=50: rien())
    server_module.db = SimpleNamespace(
        orders=Vide(), interac_reconciliation_queue=Vide(),
        email_outbox=Vide(), affiliate_tickets=Vide(),
        affiliate_referrals=Vide(), affiliate_payout_notices=Vide(),
    )

    out = asyncio.run(server_module.admin_dashboard_pulse({}))

    assert out["ops"]["labels_failed"] == 3
