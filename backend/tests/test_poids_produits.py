# -*- coding: utf-8 -*-
"""Le poids par defaut d'un produit.

Demande du 2026-09-19 : 0,3 g, modifiable produit par produit. Il etait ecrit
en dur (50 g) a quatre endroits differents — modele, figeage du poids a
l'achat, remplacement d'articles, estimation du colis — qui pouvaient diverger.
"""
import importlib
import os
import sys

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


def test_une_variante_sans_poids_pese_le_defaut(server_module):
    assert server_module.POIDS_PRODUIT_DEFAUT_G == 0.3
    v = server_module.ProductVariant(name="5mg", price=49.0)
    assert v.weight_grams == server_module.POIDS_PRODUIT_DEFAUT_G


def test_un_poids_saisi_est_respecte(server_module):
    # « On peut toujours modifier » : la valeur saisie prime, y compris plus
    # lourde que le defaut.
    v = server_module.ProductVariant(name="10mg", price=79.0, weight_grams=25)
    assert v.weight_grams == 25


def test_les_anciennes_commandes_retombent_sur_le_defaut(server_module):
    # Un article achete avant que le poids existe n'a pas de weight_grams :
    # il ne doit pas faire echouer le calcul, ni peser 50 g en douce.
    commande = {"items": [{"qty": 3}, {"qty": 1, "weight_grams": 0}]}
    # 4 unites a 0,3 g = 1,2 g ; le colis garde son plancher de 0,1 kg.
    assert server_module._order_weight_kg(commande) == 0.1


def test_le_poids_reste_celui_du_panier_quand_il_est_saisi(server_module):
    commande = {"items": [{"qty": 2, "weight_grams": 300}]}
    assert server_module._order_weight_kg(commande) == 0.6
