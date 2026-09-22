# -*- coding: utf-8 -*-
"""Le controle d'avant-lancement.

Le 2026-09-22, la boutique annoncait « paiement requis sous 12 heures »
au-dessus d'un compte a rebours qui disait 1 h 59, alors que les conditions
publiees promettent trente minutes. Trois chiffres, trois sources, et aucun
moyen de s'en apercevoir sans ouvrir le code.

Ce script existe pour que l'ecart entre CE QU'ON PROMET et CE QU'ON APPLIQUE
ne puisse plus passer inapercu.
"""
import importlib
import os
import pathlib
import sys

import pytest

SCRIPTS = pathlib.Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))


@pytest.fixture
def controle():
    import pret_pour_lancement as module
    return importlib.reload(module)


# ---------------------------------------- ce que les pages promettent -------

def test_les_pages_publiques_promettent_trente_minutes(controle):
    # Lu dans le code des pages, pas recopie : une quatrieme copie du chiffre
    # serait une quatrieme occasion de diverger.
    promesses = controle.minutes_promises()

    assert promesses, "aucune page publique lue"
    for nom, valeurs in promesses.items():
        assert valeurs == {30}, f"{nom} annonce {valeurs}"


def test_les_autres_durees_des_pages_ne_sont_pas_ramassees(controle):
    # Les memes pages parlent de 24 h (expedition) et 48 h (remboursement).
    # Une lecture large les ramassait, et un serveur regle a 24 h serait passe
    # pour coherent parce que le nombre existait quelque part.
    promesses = controle.minutes_promises()
    toutes = {v for valeurs in promesses.values() for v in valeurs}

    assert 1440 not in toutes
    assert 2880 not in toutes


# ------------------------------------------- l'accord, et le desaccord ------

def test_un_reglage_conforme_passe(controle):
    etat, _ = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "0.5"},
                                      {"Compliance.jsx": {30}})
    assert etat == controle.VERT


def test_le_mode_test_bloque_le_lancement(controle):
    # Deux heures, c'est la valeur de travail de mode_test.py.
    etat, detail = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "2"},
                                           {"Compliance.jsx": {30}})
    assert etat == controle.ROUGE
    assert "120" in detail and "30" in detail


def test_un_nombre_present_ailleurs_ne_fait_pas_accord(controle):
    # Le piege exact : 24 h apparait dans la page, mais pas dans la phrase du
    # paiement. Il ne doit pas valider un serveur regle a 24 h.
    etat, _ = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "24"},
                                      {"Compliance.jsx": {30}})
    assert etat == controle.ROUGE


def test_une_valeur_illisible_est_refusee(controle):
    etat, detail = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "bientot"}, {})
    assert etat == controle.ROUGE
    assert "illisible" in detail


def test_un_reglage_absent_renvoie_au_defaut_du_code(controle):
    etat, detail = controle.verifier_delai({}, {"Compliance.jsx": {30}})
    assert etat == controle.JAUNE
    assert "30" in detail


def test_des_pages_illisibles_ne_fabriquent_pas_un_accord(controle):
    # Si la formulation change, on le DIT, au lieu d'inventer un accord.
    etat, detail = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "2"}, {})
    assert etat == controle.JAUNE
    assert "la main" in detail


# ------------------------------------------- les valeurs de reference -------

def test_les_valeurs_normales_viennent_de_mode_test(controle):
    # Les redeclarer ici les ferait diverger le jour ou l'une change, et ce
    # script existe precisement pour empecher deux verites de coexister.
    assert controle.NORMALES["UNPAID_ORDER_TTL_HOURS"] == "0.5"
    assert controle.NORMALES["AFFILIATE_APPROVAL_HOLD_DAYS"] == "7"
    assert controle.TEST["UNPAID_ORDER_TTL_HOURS"] == "2"


def test_sans_env_le_script_ne_pretend_rien(controle, tmp_path, monkeypatch):
    # Lance sur une machine de developpement, il doit dire qu'il n'est pas a
    # sa place, pas conclure que tout va bien.
    monkeypatch.setattr(controle, "ENV", tmp_path / "absent")

    assert controle.principal() == 1
