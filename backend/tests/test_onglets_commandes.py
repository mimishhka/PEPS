# -*- coding: utf-8 -*-
"""Onglets de la liste des commandes.

Quatre defauts constates sur les vraies donnees le 2026-09-19, chacun garde
ici :

- 4 des 13 commandes « actives » etaient remboursees : l'onglet se
  definissait par exclusion et ignorait le statut « refunded » ;
- choisir un statut d'expedition dans le menu REMPLACAIT la regle de
  l'onglet : « active » + « delivered » ramenait les 35 commandes livrees ;
- les compteurs d'onglets et les deux exports comptaient la corbeille,
  que la liste excluait ;
- les exports ignoraient la recherche et les filtres affiches.

La cause commune : quatre endroits construisaient chacun leur filtre. Il n'y
en a plus qu'un, _orders_filter, et ces tests le tiennent.
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


class Cursor:
    def __init__(self, documents=None):
        self.documents = documents or []

    def __aiter__(self):
        self.iterator = iter(self.documents)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration:
            raise StopAsyncIteration

    def sort(self, *args):
        return self


# ---------------------------------------------------------------------------
# Les groupes
# ---------------------------------------------------------------------------

def test_une_commande_remboursee_n_est_plus_active(server_module):
    groupes = server_module._ORDER_STATUS_GROUPS
    assert "refunded" in groupes["active"]["fulfillment_status"]["$nin"]
    assert groupes["refunded"] == {"fulfillment_status": "refunded"}


def test_une_commande_remboursee_n_est_pas_une_annulation(server_module):
    """Une annulation est une vente qui n'a pas eu lieu ; un remboursement,
    une vente payee dont l'argent a ete rendu. Les confondre fausse la
    comptabilite."""
    annulees = server_module._ORDER_STATUS_GROUPS["cancelled"]["fulfillment_status"]["$in"]
    assert "refunded" not in annulees


def test_les_groupes_ne_se_recouvrent_pas(server_module):
    """Chaque statut d'expedition connu tombe dans UN seul onglet — sinon une
    commande serait comptee deux fois."""
    groupes = server_module._ORDER_STATUS_GROUPS

    def appartient(statut, regle):
        valeur = regle["fulfillment_status"]
        if isinstance(valeur, str):
            return statut == valeur
        if "$in" in valeur:
            return statut in valeur["$in"]
        return statut not in valeur["$nin"]

    for statut in ["pending", "preorder", "processing", "shipped", "delivered",
                   "cancelled", "failed", "refunded"]:
        trouves = [nom for nom, regle in groupes.items() if appartient(statut, regle)]
        assert len(trouves) == 1, (statut, trouves)


# ---------------------------------------------------------------------------
# Le filtre partage
# ---------------------------------------------------------------------------

def test_le_filtre_exclut_toujours_la_corbeille(server_module):
    for groupe in [None, "active", "completed", "refunded", "cancelled"]:
        assert server_module._orders_filter(groupe)["deleted_at"] is None


def test_un_filtre_d_expedition_s_ajoute_a_l_onglet(server_module):
    """Constate sur le site : onglet « active » + filtre « delivered »
    renvoyait les 35 commandes livrees. Les deux regles doivent s'appliquer."""
    filtre = server_module._orders_filter("active", fulfillment_status="delivered")
    assert "fulfillment_status" not in filtre
    assert {"fulfillment_status": "delivered"} in filtre["$and"]
    assert server_module._ORDER_STATUS_GROUPS["active"] in filtre["$and"]


def test_sans_onglet_le_filtre_reste_plat(server_module):
    filtre = server_module._orders_filter(None, fulfillment_status="delivered")
    assert filtre["fulfillment_status"] == "delivered"
    assert "$and" not in filtre


def test_la_recherche_porte_sur_numero_courriel_et_nom(server_module):
    filtre = server_module._orders_filter("active", query="marie")
    champs = {list(c.keys())[0] for c in filtre["$or"]}
    assert champs == {"order_number", "email", "shipping_address.full_name"}


def test_la_recherche_ne_s_interprete_pas_comme_une_expression(server_module):
    """Un caractere comme « . » ou « ( » dans la recherche ne doit pas
    devenir une expression reguliere."""
    filtre = server_module._orders_filter(None, query="FN-1.(x")
    assert filtre["$or"][0]["order_number"]["$regex"] == r"FN\-1\.\(x"


# ---------------------------------------------------------------------------
# Compteurs et exports : le MEME filtre que la liste
# ---------------------------------------------------------------------------

def test_les_compteurs_excluent_la_corbeille_et_couvrent_chaque_onglet(server_module):
    requetes = []

    class Orders:
        async def count_documents(self, q):
            requetes.append(q)
            return 0

    server_module.db = SimpleNamespace(orders=Orders())
    compteurs = asyncio.run(server_module.admin_order_counts({}))

    assert set(compteurs) == {"active", "completed", "refunded", "cancelled", "all"}
    assert all(q.get("deleted_at", "absent") is None for q in requetes)


def test_l_export_csv_suit_les_filtres_affiches(server_module):
    capture = {}

    class Orders:
        def find(self, q, projection=None):
            capture["q"] = q
            return Cursor()

    server_module.db = SimpleNamespace(orders=Orders())
    asyncio.run(server_module.admin_orders_csv(
        "active", {}, query="FN-1", payment_status="paid", late_only=True))

    q = capture["q"]
    assert q["deleted_at"] is None
    assert q["payment_status"] == "paid"
    assert q["late_payment_flagged"] is True
    assert "$or" in q


def test_l_export_excel_suit_les_filtres_affiches(server_module, monkeypatch):
    # Ce test porte sur le FILTRE, pas sur le classeur : la fabrication du
    # fichier est neutralisee, ce qui le rend independant d'openpyxl (absent
    # de l'environnement minimal de la CI).
    monkeypatch.setattr(server_module, "_xlsx_response", lambda rows, filename: None)
    capture = {}

    class Orders:
        def find(self, q, projection=None):
            capture["q"] = q
            return Cursor()

    server_module.db = SimpleNamespace(orders=Orders())
    asyncio.run(server_module.admin_orders_xlsx(
        "refunded", {}, fulfillment_status="refunded"))

    q = capture["q"]
    assert q["deleted_at"] is None
    # Onglet ET filtre : les deux regles s'appliquent, aucune ne remplace l'autre.
    assert {"fulfillment_status": "refunded"} in q["$and"]


def test_la_liste_et_les_exports_construisent_le_meme_filtre(server_module, monkeypatch):
    """La cause de tous ces defauts : chacun avait son propre filtre. Ce test
    echoue le jour ou quelqu'un en reintroduit un second."""
    monkeypatch.setattr(server_module, "_xlsx_response", lambda rows, filename: None)
    captures = {}

    class PageCursor(Cursor):
        def skip(self, n):
            return self

        async def to_list(self, n):
            return []

    class Orders:
        def __init__(self, cle):
            self.cle = cle

        async def count_documents(self, q):
            captures[self.cle] = q
            return 0

        def find(self, q, projection=None):
            captures[self.cle] = q
            return PageCursor()

    parametres = dict(query="marie", payment_status="paid", late_only=True)

    server_module.db = SimpleNamespace(orders=Orders("liste"))
    asyncio.run(server_module.admin_orders_page(
        page=1, limit=50, status_group="active", fulfillment_status=None,
        _admin={}, **parametres))
    server_module.db = SimpleNamespace(orders=Orders("csv"))
    asyncio.run(server_module.admin_orders_csv("active", {}, **parametres))
    server_module.db = SimpleNamespace(orders=Orders("xlsx"))
    asyncio.run(server_module.admin_orders_xlsx("active", {}, **parametres))

    assert captures["liste"] == captures["csv"] == captures["xlsx"]
