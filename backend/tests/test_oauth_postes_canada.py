# -*- coding: utf-8 -*-
"""L'obtention du jeton OAuth, telle que Postes Canada la documente.

MIREILLE, 18/10/2026 : « this is the information i have for api oath », suivi
du lien vers le guide d'authentification du portail.

CE QUE LE GUIDE DIT, ET CE QUE LE CODE FAISAIT

Le guide montre un seul exemple concret, et il passe les identifiants en
EN-TETES :

    --header 'X-IBM-Client-Id: ...'
    --header 'X-IBM-Client-Secret: ...'
    --header 'accept: application/json'
    --data 'scope=merchant&grant_type=client_credentials'

Le code envoyait `auth=(id, secret)`, c'est-a-dire un `Authorization: Basic`.
La passerelle l'accepte peut-etre — IBM API Connect le fait souvent — mais
rien ne le garantissait, et un 401 sur l'obtention du jeton ne dit pas
POURQUOI : ni si c'est l'URL, ni la forme d'authentification, ni les cles.

ET L'URL N'EST PAS DOCUMENTEE EN DUR. Le guide n'ecrit que
`https://{$server}/oauth2/token`. Faire deviner une URL dont la seule erreur
observable est « 401 » n'est pas raisonnable, donc le code essaie les
variantes et retient celle qui repond — le patron deja utilise pour la
tarification.

Ces tests verifient la forme reellement envoyee sur le reseau, pas
l'intention : ils interceptent la requete et la lisent.
"""
from __future__ import annotations

import asyncio
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def srv(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    module = importlib.reload(server)
    monkeypatch.setattr(module, "CANADA_POST_OAUTH_CLIENT_ID", "ID-CLIENT-AAA", raising=False)
    monkeypatch.setattr(module, "CANADA_POST_OAUTH_CLIENT_SECRET", "SECRET-BBB", raising=False)
    return module


class _Reponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {
            "token_type": "Bearer", "access_token": "LE-JETON",
            "scope": "merchant", "expires_in": 3600, "consented_on": 1698647250,
        }
        self.text = text or "{}"

    def json(self):
        return self._payload


class _ClientFactice:
    """Intercepte les POST et retient tout ce qui a ete envoye."""

    appels: list = []
    reponses: list = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, data=None, headers=None, auth=None, **k):
        type(self).appels.append({"url": url, "data": data or {},
                                  "headers": dict(headers or {}), "auth": auth})
        if type(self).reponses:
            return type(self).reponses.pop(0)
        return _Reponse()


def _brancher(srv, monkeypatch, reponses=None):
    import httpx
    _ClientFactice.appels = []
    _ClientFactice.reponses = list(reponses or [])
    monkeypatch.setattr(httpx, "AsyncClient", _ClientFactice)
    # Le cache de jeton et celui de variante doivent partir a neuf.
    monkeypatch.setattr(srv, "_CP_OAUTH_TOKEN", None, raising=False)
    monkeypatch.setattr(srv, "_CP_OAUTH_EXPIRES_AT", None, raising=False)
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post
    monkeypatch.setattr(canada_post, "_CP_VARIANTE_JETON", None, raising=False)
    monkeypatch.setattr(canada_post, "_CP_OAUTH_TOKEN", None, raising=False)
    monkeypatch.setattr(canada_post, "_CP_OAUTH_EXPIRES_AT", None, raising=False)
    return canada_post


def test_LES_IDENTIFIANTS_PARTENT_EN_ENTETES_X_IBM(srv, monkeypatch):
    """La forme documentee par Postes Canada, essayee EN PREMIER."""
    cp = _brancher(srv, monkeypatch)

    jeton = asyncio.run(cp._cp_get_oauth_token())

    assert jeton == "LE-JETON"
    premier = _ClientFactice.appels[0]
    assert premier["headers"]["X-IBM-Client-Id"] == "ID-CLIENT-AAA"
    assert premier["headers"]["X-IBM-Client-Secret"] == "SECRET-BBB"
    assert premier["headers"]["Accept"] == "application/json"
    # Et PAS de Basic sur la premiere tentative.
    assert premier["auth"] is None


def test_le_corps_porte_le_scope_et_le_grant_type(srv, monkeypatch):
    """Les deux valeurs que le guide montre, et redonne dans sa reponse."""
    cp = _brancher(srv, monkeypatch)
    asyncio.run(cp._cp_get_oauth_token())
    corps = _ClientFactice.appels[0]["data"]
    assert corps["grant_type"] == "client_credentials"
    assert corps["scope"] == "merchant"


def test_une_variante_qui_echoue_laisse_la_place_a_la_suivante(srv, monkeypatch):
    """Un 401 sur la forme documentee ne doit pas tout arreter.

    L'URL exacte du service n'est pas publiee — le guide n'ecrit que
    `https://{$server}/oauth2/token`. Essayer les combinaisons est la seule
    facon honnete de ne pas faire deviner une URL dont l'erreur se lit « 401 ».
    """
    cp = _brancher(srv, monkeypatch, reponses=[
        _Reponse(401, text="unauthorized"),
        _Reponse(200),
    ])

    jeton = asyncio.run(cp._cp_get_oauth_token())

    assert jeton == "LE-JETON"
    assert len(_ClientFactice.appels) == 2


def test_la_variante_qui_marche_est_RETENUE(srv, monkeypatch):
    """Sinon chaque jeton re-essaie les quatre combinaisons."""
    cp = _brancher(srv, monkeypatch, reponses=[
        _Reponse(401, text="nope"), _Reponse(200),
    ])
    asyncio.run(cp._cp_get_oauth_token())
    retenue = cp._CP_VARIANTE_JETON
    assert retenue, "aucune variante memorisee"

    # La premiere ronde a retenu « HTTP Basic », puisque les en-tetes X-IBM
    # ont recu le 401.
    assert retenue.startswith("HTTP Basic"), retenue

    # Deuxieme obtention, cache de jeton vide. COMPTER LES APPELS NE SUFFIT
    # PAS : sans tri, le premier essai serait X-IBM et recevrait quand meme le
    # 200, donc un seul appel aussi. Il faut lire QUELLE forme passe devant.
    _ClientFactice.appels = []
    _ClientFactice.reponses = [_Reponse(200)]
    monkeypatch.setattr(cp, "_CP_OAUTH_TOKEN", None, raising=False)
    monkeypatch.setattr(cp, "_CP_OAUTH_EXPIRES_AT", None, raising=False)
    asyncio.run(cp._cp_get_oauth_token())

    assert len(_ClientFactice.appels) == 1
    premier = _ClientFactice.appels[0]
    assert premier["auth"] is not None, "la variante retenue n'est pas passee devant"
    assert "X-IBM-Client-Id" not in premier["headers"]


def test_le_jeton_est_mis_en_cache_jusqu_a_son_expiration(srv, monkeypatch):
    """`expires_in` est respecte : on ne demande pas un jeton par requete."""
    cp = _brancher(srv, monkeypatch)
    asyncio.run(cp._cp_get_oauth_token())
    appels_apres_le_premier = len(_ClientFactice.appels)
    asyncio.run(cp._cp_get_oauth_token())
    assert len(_ClientFactice.appels) == appels_apres_le_premier


def test_L_ECHEC_TOTAL_NE_FUITE_NI_CLE_NI_SECRET(srv, monkeypatch):
    """Le message d'erreur remonte jusqu'a un ecran d'administration.

    Un service de jeton qui refuse peut renvoyer l'identifiant client dans son
    corps d'erreur. Ni ce corps, ni les identifiants, ne doivent se retrouver
    dans l'exception.
    """
    from fastapi import HTTPException
    cp = _brancher(srv, monkeypatch, reponses=[
        _Reponse(401, text="invalid client ID-CLIENT-AAA"),
        _Reponse(401, text="invalid client ID-CLIENT-AAA"),
        _Reponse(401, text="invalid client ID-CLIENT-AAA"),
        _Reponse(401, text="invalid client ID-CLIENT-AAA"),
    ])

    with pytest.raises(HTTPException) as capture:
        asyncio.run(cp._cp_get_oauth_token())

    message = str(capture.value.detail)
    assert "ID-CLIENT-AAA" not in message
    assert "SECRET-BBB" not in message
    assert capture.value.status_code == 502


def test_toutes_les_variantes_sont_essayees_avant_d_abandonner(srv, monkeypatch):
    """Deux URL croisees avec deux formes d'authentification : quatre essais."""
    cp = _brancher(srv, monkeypatch, reponses=[_Reponse(401, text="x")] * 8)
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        asyncio.run(cp._cp_get_oauth_token())
    # Au moins les deux formes d'authentification, sur au moins une URL.
    formes = {("X-IBM-Client-Id" in a["headers"]) for a in _ClientFactice.appels}
    assert formes == {True, False}, "les deux formes d'authentification ne sont pas essayees"


# ---------------------------------------------------------------------------
# « Comment je sais si c'est les bonnes cles ? »
# ---------------------------------------------------------------------------

def test_l_essai_dit_ACCEPTE_quand_le_jeton_est_obtenu(srv, monkeypatch):
    """MIREILLE, 18/10/2026 : « mais comment je fais pour savoir si c'est les
    bonnes cles ».

    Le diagnostic de configuration ne repond pas a cette question : « present »
    dit qu'une ligne existe dans le fichier. Une cle expiree, une cle d'une
    autre application, un secret tronque au copier-coller sont tous
    « present ». Seul Postes Canada peut trancher, donc on lui demande.
    """
    cp = _brancher(srv, monkeypatch)
    r = asyncio.run(cp.essai_identifiants())
    assert r["accepte"] is True
    assert r["verdict"] == "ACCEPTE"
    assert r["duree_du_jeton_s"] > 0


def test_l_essai_dit_REFUSE_et_donne_une_piste(srv, monkeypatch):
    cp = _brancher(srv, monkeypatch, reponses=[_Reponse(401, text="x")] * 8)
    r = asyncio.run(cp.essai_identifiants())
    assert r["accepte"] is False
    assert r["verdict"] == "REFUSE"
    assert "MEME application" in r["piste"]


def test_l_essai_sans_identifiants_ne_tape_sur_rien(srv, monkeypatch):
    """Pas d'appel reseau inutile quand il n'y a rien a essayer."""
    cp = _brancher(srv, monkeypatch)
    monkeypatch.setattr(srv, "CANADA_POST_OAUTH_CLIENT_ID", "", raising=False)
    monkeypatch.setattr(srv, "CANADA_POST_OAUTH_CLIENT_SECRET", "", raising=False)
    r = asyncio.run(cp.essai_identifiants())
    assert r["essaye"] is False
    assert _ClientFactice.appels == []


def test_L_ESSAI_NE_REND_NI_LE_JETON_NI_LES_IDENTIFIANTS(srv, monkeypatch):
    """Un jeton d'acces est un secret au meme titre qu'un mot de passe.

    Le rapport dit « obtenu » et sa duree de vie. Jamais sa valeur.
    """
    import json
    cp = _brancher(srv, monkeypatch)
    rapport = json.dumps(asyncio.run(cp.essai_identifiants()), ensure_ascii=False)
    assert "LE-JETON" not in rapport
    assert "ID-CLIENT-AAA" not in rapport
    assert "SECRET-BBB" not in rapport


def test_l_essai_force_un_jeton_neuf(srv, monkeypatch):
    """Un jeton en cache prouverait que ca marchait AVANT, pas maintenant."""
    cp = _brancher(srv, monkeypatch)
    asyncio.run(cp._cp_get_oauth_token())          # remplit le cache
    appels_avant = len(_ClientFactice.appels)
    _ClientFactice.reponses = [_Reponse(200)]
    asyncio.run(cp.essai_identifiants())
    assert len(_ClientFactice.appels) > appels_avant, "l'essai a repondu depuis le cache"


# ---------------------------------------------------------------------------
# Le motif d'erreur, tel que Postes Canada l'ecrit
# ---------------------------------------------------------------------------

class _ReponseErreur:
    def __init__(self, payload, text=""):
        self.status_code = 400
        self._payload = payload
        self.text = text or "corps brut illisible"

    def json(self):
        return self._payload


def test_LA_FORME_DOCUMENTEE_DES_ERREURS_EST_LUE(srv, monkeypatch):
    """La page « API fundamentals » du portail decrit cette structure.

    Le code lisait `title`, `detail` et `errors[].errorCode` — des formes
    plausibles, mais pas celle-la. Sur une vraie erreur, les trois sortaient
    vides et on retombait sur le corps brut tronque : du JSON illisible la ou
    le transporteur disait exactement quoi corriger.
    """
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post

    r = _ReponseErreur({"messages": [
        {"code": "7007", "description": "The weight value is invalid. The weight "
                                        "of each piece must be less than or equal to 30 kg."},
        {"code": "1722", "description": "The options are invalid for the selected Service."},
    ]})
    detail = canada_post._cp_error_detail(r)

    assert "7007" in detail
    assert "30 kg" in detail
    assert "1722" in detail
    assert "corps brut illisible" not in detail


def test_les_anciennes_formes_restent_lues(srv, monkeypatch):
    """Le portail a deja change de structure une fois ; les garder ne coute rien."""
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post

    assert "Unauthorized" in canada_post._cp_error_detail(
        _ReponseErreur({"title": "Unauthorized"}))
    assert "mauvais client" in canada_post._cp_error_detail(
        _ReponseErreur({"errors": [{"errorCode": "401", "message": "mauvais client"}]}))


def test_sans_forme_connue_on_rend_le_corps(srv, monkeypatch):
    """Mieux vaut un corps brut tronque que rien du tout."""
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post
    assert canada_post._cp_error_detail(_ReponseErreur({}, text="?!")) == "?!"
