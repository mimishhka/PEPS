"""« Est affilie » : une seule definition, celle de la porte.

MIREILLE, 29/09/2026 : « une chose est cassee — un affilie qui se connecte
doit etre redirige directement vers son tableau de bord ».

Le frontend choisit la destination d'apres le drapeau `is_affiliate` rendu a
la connexion. Il existait DEUX regles pour le calculer :

    get_current_affiliate  (la porte du tableau de bord)
        user_id, statut « active » OU « suspended »
    le drapeau rendu a la connexion
        email, statut « active » seulement

Trois desaccords possibles, et le premier explique la panne signalee :

 1. /auth/login ne rendait PAS le drapeau du tout. Une affiliee qui entrait
    son mot de passe recevait un champ absent, donc faux, donc le compte
    client. Le lien magique fonctionnait, le mot de passe jamais : la panne
    paraissait intermittente alors qu'elle etait systematique par ce chemin.

 2. Fiche suspendue : la porte l'admet, pour lui montrer « compte suspendu »
    la ou ce message vit. Le drapeau la refusait, sans rien expliquer.

 3. Fiche active restee sans user_id (invitation jamais menee a bout) : le
    drapeau disait « affiliee » sur la foi du seul courriel, la porte
    repondait 403. On promettait un tableau de bord pour livrer une erreur.

Ces tests portent sur `_est_affilie`, la fonction unique, et verifient
qu'elle repond comme la porte — y compris la ou l'ancien drapeau divergeait.
"""
import asyncio
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


class FausseCollection:
    """Les fiches d'affilies, filtrees comme le fait Motor."""

    def __init__(self, documents):
        self.documents = documents
        self.derniere_requete = None

    async def find_one(self, filtre, projection=None):
        self.derniere_requete = filtre
        for doc in self.documents:
            if "user_id" in filtre and doc.get("user_id") != filtre["user_id"]:
                continue
            if "email" in filtre and doc.get("email") != filtre["email"]:
                continue
            statut = filtre.get("status")
            if isinstance(statut, dict):
                if doc.get("status") not in statut.get("$in", []):
                    continue
            elif statut is not None and doc.get("status") != statut:
                continue
            return dict(doc)
        return None


class FausseBase:
    def __init__(self, affilies):
        self.affiliates = FausseCollection(affilies)


@pytest.fixture
def module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return server


def brancher(module, monkeypatch, affilies):
    monkeypatch.setattr(module, "db", FausseBase(affilies), raising=False)


LOLA = {"id": "u-lola", "email": "lola@example.com"}


# ===========================================================================
# LE CAS DE MIREILLE
# ===========================================================================

def test_une_affiliee_active_est_reconnue(module, monkeypatch):
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": "u-lola", "email": "lola@example.com",
         "status": "active"},
    ])
    assert asyncio.run(module._est_affilie(LOLA)) is True


def test_un_compte_ordinaire_ne_l_est_pas(module, monkeypatch):
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": "u-lola", "email": "lola@example.com",
         "status": "active"},
    ])
    autre = {"id": "u-mireille", "email": "mireille@example.com"}
    assert asyncio.run(module._est_affilie(autre)) is False


# ===========================================================================
# LES TROIS DESACCORDS AVEC L'ANCIEN DRAPEAU
# ===========================================================================

def test_une_fiche_suspendue_mene_quand_meme_au_tableau_de_bord(module, monkeypatch):
    """DESACCORD 2 : la porte l'admet, l'ancien drapeau la refusait.

    C'est sur le tableau de bord que vit le message « compte suspendu ».
    Renvoyer cette personne sur le compte client lui cache la raison du
    refus : elle constate qu'elle n'a plus acces, sans savoir pourquoi.
    """
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": "u-lola", "email": "lola@example.com",
         "status": "suspended"},
    ])
    assert asyncio.run(module._est_affilie(LOLA)) is True


def test_une_fiche_active_sans_user_id_ne_promet_rien(module, monkeypatch):
    """DESACCORD 3 : l'ancien drapeau disait oui, la porte repondait 403.

    Une invitation jamais menee a bout laisse `user_id` a None. L'ancien
    drapeau se contentait du courriel et expediait la personne vers une page
    qui refusait de s'ouvrir.
    """
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": None, "email": "lola@example.com",
         "status": "active"},
    ])
    assert asyncio.run(module._est_affilie(LOLA)) is False


def test_une_fiche_invitee_n_est_pas_encore_affiliee(module, monkeypatch):
    """« invited » n'ouvre aucune porte : il reste a accepter l'entente."""
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": "u-lola", "email": "lola@example.com",
         "status": "invited"},
    ])
    assert asyncio.run(module._est_affilie(LOLA)) is False


def test_le_courriel_ne_decide_plus_rien(module, monkeypatch):
    """La fiche appartient a un AUTRE compte, mais porte le meme courriel.

    L'ancienne regle cherchait par courriel : elle aurait reconnu cette
    personne comme affiliee alors que la fiche est liee ailleurs.
    """
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": "u-quelqu-un-d-autre",
         "email": "lola@example.com", "status": "active"},
    ])
    assert asyncio.run(module._est_affilie(LOLA)) is False


def test_la_recherche_se_fait_bien_sur_user_id(module, monkeypatch):
    """Filet sur la requete elle-meme : c'est la forme qui a change."""
    base = FausseBase([])
    monkeypatch.setattr(module, "db", base, raising=False)
    asyncio.run(module._est_affilie(LOLA))
    filtre = base.affiliates.derniere_requete
    assert filtre["user_id"] == "u-lola"
    assert set(filtre["status"]["$in"]) == {"active", "suspended"}
    assert "email" not in filtre


# ===========================================================================
# ENTREES DEGRADEES — jamais d'exception a la connexion
# ===========================================================================

@pytest.mark.parametrize("entree", [None, {}, {"email": "x@example.com"},
                                    {"id": None}, {"id": ""}])
def test_un_compte_sans_identifiant_vaut_non(module, monkeypatch, entree):
    """Une connexion ne doit jamais echouer parce que ce calcul a leve.

    Sans le garde-fou, `user["id"]` sur un dictionnaire incomplet remonterait
    en 500 et empecherait la connexion elle-meme — pour une question de
    simple redirection.
    """
    brancher(module, monkeypatch, [
        {"id": "aff-1", "user_id": "u-lola", "email": "x@example.com",
         "status": "active"},
    ])
    assert asyncio.run(module._est_affilie(entree)) is False


def test_une_base_incomplete_n_empeche_pas_la_connexion(module, monkeypatch):
    """Le calcul ne doit JAMAIS faire echouer une authentification.

    Decouvert par test_account_security_medium, qui appelle login() avec un
    `db` reduit a ce dont la connexion a besoin : `users` et
    `refresh_sessions`. La premiere version de _est_affilie y levait un
    AttributeError, et /auth/login rendait 500.

    Ce n'est pas qu'un artefact de test : sur un incident de la collection des
    affilies, plus personne n'aurait pu entrer — ni client ni affilie — pour
    une question de page d'arrivee. Le repli est benin : on arrive sur le
    compte client, d'ou le tableau de bord reste a un clic.
    """
    monkeypatch.setattr(module, "db", types.SimpleNamespace(users=object()),
                        raising=False)
    assert asyncio.run(module._est_affilie(LOLA)) is False


def test_une_panne_de_la_base_vaut_non(module, monkeypatch):
    """Meme regle quand la collection existe mais repond par une exception."""
    class CollectionEnPanne:
        async def find_one(self, *a, **k):
            raise RuntimeError("replica set indisponible")

    monkeypatch.setattr(module, "db",
                        types.SimpleNamespace(affiliates=CollectionEnPanne()),
                        raising=False)
    assert asyncio.run(module._est_affilie(LOLA)) is False
