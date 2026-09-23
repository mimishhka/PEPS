# -*- coding: utf-8 -*-
"""Le garde-fou multipart, en attendant le saut de Starlette.

Les quatre points de televersement lisent `await file.read()` EN ENTIER puis
verifient la taille apres coup : un corps de deux gigaoctets serait tamponne
en RAM avant le moindre refus. C'est la classe de defaut que les avis sur
starlette 0.37 decrivent — les versions recentes corrigent nativement
(`max_part_size`), mais fastapi 0.110.1 interdit de les monter.

Le remede est pose a l'exterieur : le Content-Length est refuse AVANT toute
lecture. Ce test verrouille ce contrat, pour qu'il ne soit pas retire « parce
que les versions sont a jour » sans qu'on ait verifie ce point.
"""
import asyncio
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


def _requete(server_module, methode="POST", type_contenu="multipart/form-data; boundary=x",
             taille=None):
    from starlette.requests import Request
    en_tetes = []
    if type_contenu:
        en_tetes.append((b"content-type", type_contenu.encode()))
    if taille is not None:
        en_tetes.append((b"content-length", str(taille).encode()))
    scope = {
        "type": "http",
        "method": methode,
        "path": "/orders/o-1/messages",
        "headers": en_tetes,
        "query_string": b"",
        "scheme": "http",
        "server": ("test", 80),
        "client": ("127.0.0.1", 1234),
    }
    return Request(scope)


def test_un_corps_multipart_surdimensionne_est_refuse_avant_toute_lecture(server_module):
    # Plafond par defaut : 10 Mo (COA) + 1 Mo. 30 Mo doivent tomber en 413.
    requete = _requete(server_module, taille=30 * 1024 * 1024)

    async def jamais_atteint(_r):
        raise AssertionError("le corps ne doit jamais etre lu")

    reponse = asyncio.run(
        server_module._refuser_televersement_surdimensionne(requete, jamais_atteint))

    assert reponse.status_code == 413


def test_un_corps_raisonnable_passe(server_module):
    requete = _requete(server_module, taille=2 * 1024 * 1024)
    atteint = {"oui": False}

    async def suivant(_r):
        atteint["oui"] = True
        return "passe"

    reponse = asyncio.run(
        server_module._refuser_televersement_surdimensionne(requete, suivant))

    assert reponse == "passe"
    assert atteint["oui"] is True


def test_un_json_n_est_pas_juge_sur_ce_chemin(server_module):
    # Le checkout envoie du JSON : le garde-fou ne doit pas le ralentir ni le
    # juger. Un Content-Length enorme sur du JSON, c'est le probleme d'un
    # autre etage.
    requete = _requete(server_module, type_contenu="application/json", taille=10 ** 9)
    atteint = {"oui": False}

    async def suivant(_r):
        atteint["oui"] = True
        return "passe"

    assert asyncio.run(
        server_module._refuser_televersement_surdimensionne(requete, suivant)) == "passe"
    assert atteint["oui"] is True


def test_un_content_length_absent_ou_illisible_passe(server_module):
    # Le garde-fou est la ceinture, pas les bretelles : un refus injustifie
    # couperait un televersement legitime.
    for taille in (None, "pas-un-nombre"):
        requete = _requete(server_module, taille=taille)
        atteint = {"oui": False}

        async def suivant(_r):
            atteint["oui"] = True
            return "passe"

        assert asyncio.run(
            server_module._refuser_televersement_surdimensionne(requete, suivant)) == "passe"
        assert atteint["oui"] is True


def test_le_plafond_suit_les_reglages(server_module, monkeypatch):
    # Si l'admin releve MAX_COA_UPLOAD_MB a 50, le garde-fou suit : sinon il
    # refuserait des fichiers que le code accepte ensuite.
    monkeypatch.setattr(server_module, "MAX_COA_UPLOAD_MB", 50.0)
    requete = _requete(server_module, taille=40 * 1024 * 1024)
    atteint = {"oui": False}

    async def suivant(_r):
        atteint["oui"] = True
        return "passe"

    assert asyncio.run(
        server_module._refuser_televersement_surdimensionne(requete, suivant)) == "passe"
    assert atteint["oui"] is True
