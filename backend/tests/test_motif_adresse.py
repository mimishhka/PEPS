# -*- coding: utf-8 -*-
"""Pourquoi une adresse est refusee, et pas seulement qu'elle l'est.

La « suggestion » renvoyee par Google est `result.address` : la version
NORMALISEE de ce qu'on vient d'envoyer. Elle corrige l'orthographe, jamais
l'existence. Un client a qui il manque le numero d'appartement se voyait donc
proposer sa PROPRE adresse, l'acceptait, et se la voyait reproposer — une
boucle ou chaque tour ressemble a un progres.
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


def test_un_appartement_manquant_est_nomme(server_module):
    # Proposer « utilisez cette adresse » ne changera rien : il faut DEMANDER
    # le numero d'appartement.
    motif = server_module._motif_adresse(
        {"addressComplete": False, "possibleNextAction": "CONFIRM_ADD_SUBPREMISES"},
        {"missingComponentTypes": ["subpremise"]})
    assert motif == "manque_appartement"


def test_l_action_suffit_meme_sans_liste_de_composants(server_module):
    motif = server_module._motif_adresse(
        {"possibleNextAction": "CONFIRM_ADD_SUBPREMISES"}, {})
    assert motif == "manque_appartement"


def test_un_numero_civique_non_confirme_est_nomme(server_module):
    # Aucune normalisation ne repare une adresse qui n'existe pas.
    motif = server_module._motif_adresse(
        {"hasUnconfirmedComponents": True},
        {"unconfirmedComponentTypes": ["street_number"]})
    assert motif == "non_confirme"


def test_une_rue_non_confirmee_compte_aussi(server_module):
    motif = server_module._motif_adresse(
        {"hasUnconfirmedComponents": True},
        {"unconfirmedComponentTypes": ["route"]})
    assert motif == "non_confirme"


def test_une_difference_d_orthographe_est_la_seule_corrigeable(server_module):
    # La, et la seulement, accepter la suggestion aide.
    motif = server_module._motif_adresse(
        {"hasReplacedComponents": True}, {})
    assert motif == "orthographe"


def test_l_appartement_prime_sur_le_reste(server_module):
    # Les deux peuvent etre vrais en meme temps ; demander l'appartement est
    # la seule action que le client peut reellement accomplir.
    motif = server_module._motif_adresse(
        {"hasUnconfirmedComponents": True, "possibleNextAction": "CONFIRM_ADD_SUBPREMISES"},
        {"missingComponentTypes": ["subpremise"],
         "unconfirmedComponentTypes": ["street_number"]})
    assert motif == "manque_appartement"


def test_un_verdict_muet_ne_fabrique_pas_de_motif(server_module):
    assert server_module._motif_adresse({}, {}) == "inconnu"
    assert server_module._motif_adresse({}, None) == "inconnu"
