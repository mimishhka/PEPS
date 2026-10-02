# -*- coding: utf-8 -*-
"""Definir son mot de passe la PREMIERE fois, sans en avoir eu avant.

MIREILLE, 01/10/2026 : « pour etablir la premiere fois le mot de passe ca
demande l'ancien mot de passe — chose impossible lorsque la personne n'a pas
cree son compte avec un mot de passe ».

LES DEUX MOITIES FAISAIENT DEJA LA BONNE CHOSE, et c'est ce qui rendait le
defaut invisible en lisant l'une ou l'autre :

  — le serveur sort immediatement de `_assert_current_password` pour un compte
    passwordless, le cookie de session faisant foi ;
  — l'interface teste `user.passwordless` a quatre endroits pour masquer le
    champ et l'omettre de la requete.

Mais `_public_user_payload` RETIRAIT ce drapeau, avec `password_hash` et
`token_version`. Il valait donc toujours faux dans le navigateur : le champ
« ancien mot de passe » s'affichait, marque `required`, et le formulaire ne
pouvait tout simplement pas etre soumis.

Quatre parcours etaient bloques par cette seule ligne : definir un mot de passe
depuis le compte client, le definir depuis le tableau de bord affilie, changer
d'adresse courriel, et supprimer son compte.
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


SANS_MDP = {
    "id": "u-1", "email": "lola@example.com", "name": "Lola",
    "role": "customer", "passwordless": True,
    "password_hash": "$2b$12$secret", "token_version": 3,
}

# UN VRAI HASH, pose au chargement : `bcrypt` est une extension Rust, et un
# hash factice la fait PANIQUER au lieu de lever une exception Python. Ma
# premiere redaction utilisait « $2b$12$autre » et faisait tomber le test sur
# un `PanicException` — ce qui a revele que `verify_password` ne s'en
# protegeait pas non plus.
import bcrypt as _bcrypt
_HASH = _bcrypt.hashpw(b"bon-mot-de-passe", _bcrypt.gensalt()).decode()

AVEC_MDP = {
    "id": "u-2", "email": "paul@example.com", "name": "Paul",
    "role": "customer",
    "password_hash": _HASH, "token_version": 1,
}


# ===========================================================================
# LE DRAPEAU ARRIVE AU NAVIGATEUR
# ===========================================================================

def test_LE_CAS_DE_MIREILLE_un_compte_sans_mot_de_passe_le_dit(server_module):
    """Sans ce drapeau, l'ecran ne peut pas savoir qu'il doit masquer le champ."""
    fiche = server_module._public_user_payload(SANS_MDP)

    assert fiche["passwordless"] is True


def test_un_compte_AVEC_mot_de_passe_rend_False_et_non_une_cle_absente(server_module):
    """Une cle absente obligerait chaque appelant a redecider ce que « absent »
    veut dire. Les comptes crees avec un mot de passe n'ont pas forcement le
    champ en base."""
    fiche = server_module._public_user_payload(AVEC_MDP)

    assert fiche["passwordless"] is False
    assert "passwordless" in fiche


def test_LES_VRAIS_SECRETS_RESTENT_RETIRES(server_module):
    """La correction ne doit pas ouvrir la porte a cote.

    `password_hash` et `token_version` sont des secrets ; `passwordless` est un
    etat d'interface. Les confondre est ce qui a produit le defaut.
    """
    for source in (SANS_MDP, AVEC_MDP):
        fiche = server_module._public_user_payload(source)
        assert "password_hash" not in fiche
        assert "token_version" not in fiche


def test_les_autres_champs_passent_toujours(server_module):
    fiche = server_module._public_user_payload(SANS_MDP)

    assert fiche["id"] == "u-1"
    assert fiche["email"] == "lola@example.com"
    assert fiche["name"] == "Lola"


def test_aucun_utilisateur_rend_un_objet_vide(server_module):
    assert server_module._public_user_payload(None) == {}


def test_les_permissions_restent_reservees_au_personnel(server_module):
    # Regle preexistante, gardee : un compte client ne doit pas lire les
    # permissions internes.
    client = server_module._public_user_payload(
        {**AVEC_MDP, "permissions": ["orders.refund"]})
    staff = server_module._public_user_payload(
        {**AVEC_MDP, "role": "staff", "permissions": ["orders.refund"]})

    assert "permissions" not in client
    assert staff["permissions"] == ["orders.refund"]


# ===========================================================================
# ET LE SERVEUR N'EXIGE RIEN D'IMPOSSIBLE
# ===========================================================================

def test_un_compte_passwordless_n_a_pas_a_fournir_d_ancien_mot_de_passe(server_module):
    """Le serveur faisait deja la bonne chose. Ce test la fige : si quelqu'un
    durcissait `_assert_current_password` sans voir le cas, le premier
    enregistrement redeviendrait impossible."""
    server_module._assert_current_password(SANS_MDP, None)        # ne leve pas
    server_module._assert_current_password(SANS_MDP, "")          # ne leve pas


def test_un_compte_AVEC_mot_de_passe_doit_toujours_le_fournir(server_module):
    """La contrepartie : la correction ne doit pas desarmer la verification
    pour les comptes qui ont bien un mot de passe."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as leve:
        server_module._assert_current_password(AVEC_MDP, None)
    assert leve.value.status_code == 403

    with pytest.raises(HTTPException):
        server_module._assert_current_password(AVEC_MDP, "mauvais-mot-de-passe")

    # Et le bon passe.
    server_module._assert_current_password(AVEC_MDP, "bon-mot-de-passe")


# ===========================================================================
# UN HASH ABIME NE DOIT PAS RENDRE UN 500
# ===========================================================================

def test_UN_HASH_ABIME_REFUSE_PROPREMENT_au_lieu_de_faire_tomber_la_requete(server_module):
    """Trouve en ecrivant le test precedent.

    `bcrypt` est une extension Rust : un hash vide ou tronque ne leve pas une
    exception Python, il PANIQUE — et `pyo3_runtime.PanicException` derive de
    `BaseException`, donc le `except Exception` de `verify_password` ne
    l'attrapait pas. Un seul enregistrement abime en base rendait un 500 a la
    connexion au lieu d'un refus.
    """
    for abime in ["", None, "pas-un-hash", "$2b$12$", "$2b$1", "x" * 60]:
        assert server_module.verify_password("peu importe", abime) is False


def test_un_hash_valide_fonctionne_toujours(server_module):
    # La garde ne doit pas ecarter les vrais hashs.
    assert server_module.verify_password("bon-mot-de-passe", _HASH) is True
    assert server_module.verify_password("autre", _HASH) is False


def test_me_rend_le_drapeau_tel_quel(server_module):
    """`me()` est le seul appelant de `_public_user_payload`, et il ne renvoie
    jamais que la session en cours : exposer le drapeau ici ne revele rien a
    personne d'autre."""
    fiche = asyncio.run(server_module.me(SANS_MDP))

    assert fiche["passwordless"] is True
    assert "password_hash" not in fiche
