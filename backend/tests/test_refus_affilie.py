# -*- coding: utf-8 -*-
"""Pourquoi on refuse l'acces au tableau de bord affilie.

Un seul statut HTTP -- 403 -- pour quatre realites tres differentes. Sans un
code discriminable dans le corps, l'ecran ne peut que deviner, et il devinait
mal : un dossier FERME lisait « Acces sur invitation ».

Le programme disait donc a quelqu'un qu'il venait de fermer qu'il n'avait
jamais ete invite. Et la fermeture n'est possible QUE depuis « suspended » ou
« invited » : depuis « suspended », la personne a un compte, se connecte, et
lit ce message.

Trouve en repassant en revue tous les etats d'un compte affilie, comme
Mireille l'a demande le 02/10/2026 : « repasse au travers de toutes les
situations possible qui doivent etre affiche au compte de l'affilie ».
"""
import asyncio
import importlib
import os
import sys
import types

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("ORDER_CUTOFF_TZ", "America/Toronto")
    import server
    return importlib.reload(server)


UTILISATEUR = {"id": "u-1", "email": "lola@example.com"}


class Affiliates:
    """Double qui APPLIQUE le filtre de statut.

    C'est le point du test : `get_current_affiliate` cherche d'abord
    `status in ["active", "suspended"]`, et seulement sur un refus cherche un
    dossier ferme. Un double qui ignorerait le filtre rendrait le meme
    document aux deux requetes et le test ne prouverait rien.
    """

    def __init__(self, docs):
        self.docs = docs
        self.requetes = []

    async def find_one(self, filtre, projection=None):
        self.requetes.append(filtre)

        def correspond(d):
            for cle, attendu in filtre.items():
                valeur = d.get(cle)
                if isinstance(attendu, dict) and "$in" in attendu:
                    if valeur not in attendu["$in"]:
                        return False
                elif valeur != attendu:
                    return False
            return True

        trouves = [d for d in self.docs if correspond(d)]
        return dict(trouves[0]) if trouves else None


def _brancher(server, monkeypatch, docs):
    col = Affiliates(docs)
    server.db = types.SimpleNamespace(affiliates=col)

    async def _utilisateur(_request):
        return UTILISATEUR

    monkeypatch.setattr(server, "get_current_user", _utilisateur,
                        raising=False)
    return col


def _refus(server, monkeypatch, docs):
    _brancher(server, monkeypatch, docs)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server.get_current_affiliate(None))
    return exc.value


# ===========================================================================
# LES QUATRE REALITES
# ===========================================================================

def test_un_affilie_ACTIF_passe(server_module, monkeypatch):
    _brancher(server_module, monkeypatch,
              [{"id": "aff-1", "user_id": "u-1", "status": "active"}])

    aff = asyncio.run(server_module.get_current_affiliate(None))

    assert aff["id"] == "aff-1"


def test_un_dossier_FERME_est_nomme(server_module, monkeypatch):
    """LE DEFAUT. Il lisait « Acces sur invitation »."""
    e = _refus(server_module, monkeypatch,
               [{"id": "aff-1", "user_id": "u-1", "status": "closed"}])

    assert e.status_code == 403
    assert e.detail["code"] == "closed"


def test_un_compte_SUSPENDU_garde_son_code(server_module, monkeypatch):
    """La distinction qui existait deja ne doit pas avoir ete perdue."""
    e = _refus(server_module, monkeypatch,
               [{"id": "aff-1", "user_id": "u-1", "status": "suspended"}])

    assert e.detail["code"] == "suspended"


def test_quelqu_un_qui_n_a_JAMAIS_rejoint_lit_le_message_generique(
        server_module, monkeypatch):
    """Un client sans dossier d'affilie : « programme prive » est juste."""
    e = _refus(server_module, monkeypatch, [])

    assert e.status_code == 403
    assert e.detail == "Not an affiliate"


def test_un_dossier_INVITE_mais_pas_rejoint_reste_generique(
        server_module, monkeypatch):
    """Un dossier `invited` porte `user_id: None` jusqu'a l'activation : il ne
    peut donc pas correspondre a un utilisateur connecte. Le message
    generique est le bon, et ce test fixe la frontiere."""
    e = _refus(server_module, monkeypatch,
               [{"id": "aff-1", "user_id": None, "status": "invited"}])

    assert e.detail == "Not an affiliate"


# ===========================================================================
# LE COUT
# ===========================================================================

def test_LE_CHEMIN_SERVI_NE_FAIT_QU_UNE_REQUETE(server_module, monkeypatch):
    """La seconde lecture ne doit peser que sur le refus.

    Un affilie actif ouvre dix ecrans qui passent tous par ici. Payer une
    requete de plus sur chacun pour mieux nommer un cas rare serait un mauvais
    echange — et c'est le genre de regression qu'on ne voit jamais a l'oeil.
    """
    col = _brancher(server_module, monkeypatch,
                    [{"id": "aff-1", "user_id": "u-1", "status": "active"}])

    asyncio.run(server_module.get_current_affiliate(None))

    assert len(col.requetes) == 1


def test_un_compte_suspendu_non_plus(server_module, monkeypatch):
    """`suspended` est dans le filtre initial : lui aussi se decide en une
    requete."""
    col = _brancher(server_module, monkeypatch,
                    [{"id": "aff-1", "user_id": "u-1", "status": "suspended"}])

    with pytest.raises(HTTPException):
        asyncio.run(server_module.get_current_affiliate(None))

    assert len(col.requetes) == 1


def test_le_dossier_ferme_coute_UNE_requete_de_plus_et_pas_deux(
        server_module, monkeypatch):
    col = _brancher(server_module, monkeypatch,
                    [{"id": "aff-1", "user_id": "u-1", "status": "closed"}])

    with pytest.raises(HTTPException):
        asyncio.run(server_module.get_current_affiliate(None))

    assert len(col.requetes) == 2
    # Et la seconde cherche bien un dossier ferme POUR CET UTILISATEUR.
    assert col.requetes[1] == {"user_id": "u-1", "status": "closed"}
