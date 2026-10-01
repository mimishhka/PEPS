# -*- coding: utf-8 -*-
"""La periode qu'un versement couvre REELLEMENT, et son rendu lisible.

MIREILLE, 01/10/2026 : « le payout indique le mois d'octobre alors que c'est
pour les commissions du mois de septembre ». Puis : « aussi pour les courriels
qui indiquent la mauvaise periode ».

`period` n'est pas une periode couverte, c'est une etiquette de run. Le run
agrege `{"status": "approved", "payout_id": None}` SANS filtre de mois : un
versement contient tout ce qui etait approuve et libre, quel que soit son
mois. Avec le seuil de versement, un affilie reste dessous en juillet et aout
est paye en septembre — UN versement, TROIS mois. Aucune etiquette ne peut
dire cela, et les deux chemins n'ecrivent meme pas la meme : le planificateur
pose le mois precedent, le run manuel retombe sur le mois courant.

La periode est donc derivee des commissions elles-memes, a la lecture.

LE DOUBLE DE COLLECTION APPLIQUE LE PIPELINE, il ne rend pas une reponse
toute faite. Un double complaisant passerait meme si le tri, le drapeau
`multi` ou la garde sur les dates abimees etaient faux — c'est-a-dire
precisement ce que ces tests existent pour tenir. Ce qui reste delegue a Mongo
est l'extraction du mois par `$switch` ; le double la reproduit sur les deux
formes de date que ce depot fait cohabiter.
"""
import asyncio
import importlib
import os
import re
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def modules(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("ORDER_CUTOFF_TZ", "America/Toronto")
    import server
    server = importlib.reload(server)
    # Le service porte les aides ; server.py les re-exporte. On rend les deux,
    # parce qu'un nom absent d'UNE des deux listes de re-export de server.py ne
    # se resout pas selon la facon dont uvicorn a ete lance.
    import services.affiliate as service
    return server, importlib.reload(service)


# ---------------------------------------------------------------------------
# Le double : il applique vraiment le pipeline.
# ---------------------------------------------------------------------------

def _mois_du_double(doc):
    """Reproduit `s._mois_de("approved_at", "created_at")`.

    Les dates de ce depot cohabitent sous deux formes — chaine ISO posee a la
    creation, ou vraie date BSON heritee. Le double doit donc traiter les deux,
    sinon il ne testerait que la moitie du cas reel.
    """
    valeur = doc.get("approved_at")
    if valeur is None:
        valeur = doc.get("created_at")
    if isinstance(valeur, datetime):
        return valeur.strftime("%Y-%m")
    return str(valeur or "")[:7]


class Referrals:
    """Applique $match / $project / $match regex / $group $addToSet."""

    def __init__(self, docs):
        self.docs = docs
        self.appels = 0
        self.pipelines = []

    def aggregate(self, pipeline):
        self.appels += 1
        self.pipelines.append(pipeline)
        ids = pipeline[0]["$match"]["payout_id"]["$in"]
        motif = pipeline[2]["$match"]["mois"]["$regex"]
        groupes = {}
        for doc in self.docs:
            if doc.get("payout_id") not in ids:
                continue
            mois = _mois_du_double(doc)
            if not re.fullmatch(motif, mois):
                continue
            groupes.setdefault(doc["payout_id"], set()).add(mois)
        lignes = [{"_id": pid, "mois": list(valeurs)}
                  for pid, valeurs in groupes.items()]
        return SimpleNamespace(to_list=_AsyncList(lignes))


class _AsyncList:
    def __init__(self, lignes):
        self.lignes = lignes

    def __call__(self, _n):
        async def go():
            return self.lignes
        return go()


# ===========================================================================
# LA PERIODE COUVERTE
# ===========================================================================

def test_LE_CAS_DE_MIREILLE_un_versement_peut_couvrir_trois_mois(modules):
    """Le seuil de versement rend ce cas COURANT, pas theorique.

    Un affilie sous le seuil en juillet et aout est paye en septembre. Son
    versement couvre les trois mois, et aucune etiquette `period` ne peut le
    dire — c'est tout l'argument du calcul derive.
    """
    server, service = modules
    server.db = SimpleNamespace(affiliate_referrals=Referrals([
        {"payout_id": "p1", "approved_at": "2026-07-14T12:00:00+00:00"},
        {"payout_id": "p1", "approved_at": "2026-08-02T12:00:00+00:00"},
        {"payout_id": "p1", "approved_at": "2026-09-28T12:00:00+00:00"},
    ]))

    periode = asyncio.run(service._periode_couverte("p1"))

    assert periode["debut"] == "2026-07"
    assert periode["fin"] == "2026-09"
    assert periode["multi"] is True
    assert periode["mois"] == ["2026-07", "2026-08", "2026-09"]


def test_un_seul_mois_n_est_pas_une_plage(modules):
    server, service = modules
    server.db = SimpleNamespace(affiliate_referrals=Referrals([
        {"payout_id": "p1", "approved_at": "2026-09-03T12:00:00+00:00"},
        {"payout_id": "p1", "approved_at": "2026-09-21T12:00:00+00:00"},
    ]))

    periode = asyncio.run(service._periode_couverte("p1"))

    assert periode["debut"] == periode["fin"] == "2026-09"
    assert periode["multi"] is False


def test_un_versement_sans_lignes_ne_rend_PAS_un_mois_invente(modules):
    """Les versements legacy n'ont pas forcement de lignes rattachees.

    Rendre `None` laisse l'appelant dire « periode indisponible » au lieu
    d'afficher un mois faux avec aplomb.
    """
    server, service = modules
    server.db = SimpleNamespace(affiliate_referrals=Referrals([]))

    assert asyncio.run(service._periode_couverte("p-inconnu")) is None
    assert asyncio.run(service._periode_couverte(None)) is None
    assert asyncio.run(service._periodes_couvertes([])) == {}


def test_une_date_ABIMEE_ne_devient_pas_la_borne_basse(modules):
    """LE PIEGE QUE LA GARDE REGEX TIENT.

    `$substrCP` sur une valeur vide rend « », qui se classe AVANT tout
    « AAAA-MM ». Sans le filtre, une seule ligne sans date ferait dire au
    versement qu'il couvre « depuis la chaine vide » — et le courriel aurait
    annonce une plage commencant nulle part.
    """
    server, service = modules
    server.db = SimpleNamespace(affiliate_referrals=Referrals([
        {"payout_id": "p1", "approved_at": None, "created_at": None},
        {"payout_id": "p1", "approved_at": "2026-09-10T12:00:00+00:00"},
    ]))

    periode = asyncio.run(service._periode_couverte("p1"))

    assert periode["debut"] == "2026-09"
    assert periode["multi"] is False


def test_le_repli_sur_created_at_quand_l_approbation_manque(modules):
    # Une commission approuvee par un chemin qui n'a pas pose `approved_at`
    # garde une date : celle de sa creation.
    server, service = modules
    server.db = SimpleNamespace(affiliate_referrals=Referrals([
        {"payout_id": "p1", "approved_at": None,
         "created_at": "2026-06-05T12:00:00+00:00"},
    ]))

    assert asyncio.run(service._periode_couverte("p1"))["debut"] == "2026-06"


def test_une_vraie_date_BSON_est_traitee_comme_une_chaine_ISO(modules):
    # Les deux formes cohabitent en base. Si l'une des deux ne rendait rien,
    # la periode serait silencieusement tronquee.
    server, service = modules
    server.db = SimpleNamespace(affiliate_referrals=Referrals([
        {"payout_id": "p1",
         "approved_at": datetime(2026, 5, 9, 12, tzinfo=timezone.utc)},
        {"payout_id": "p1", "approved_at": "2026-06-01T12:00:00+00:00"},
    ]))

    periode = asyncio.run(service._periode_couverte("p1"))

    assert periode["debut"] == "2026-05"
    assert periode["fin"] == "2026-06"


def test_UNE_SEULE_REQUETE_pour_toute_une_page_d_historique(modules):
    """Une boucle par ligne ferait un N+1 sur la page de versements."""
    server, service = modules
    referrals = Referrals([
        {"payout_id": "p1", "approved_at": "2026-09-02T12:00:00+00:00"},
        {"payout_id": "p2", "approved_at": "2026-08-02T12:00:00+00:00"},
        {"payout_id": "p3", "approved_at": "2026-07-02T12:00:00+00:00"},
    ])
    server.db = SimpleNamespace(affiliate_referrals=referrals)

    toutes = asyncio.run(service._periodes_couvertes(["p1", "p2", "p3"]))

    assert referrals.appels == 1
    assert toutes["p1"]["debut"] == "2026-09"
    assert toutes["p2"]["debut"] == "2026-08"
    assert toutes["p3"]["debut"] == "2026-07"


def test_une_panne_de_base_ne_fait_pas_tomber_la_page(modules):
    """L'ecran retombe sur l'etiquette ; il n'affiche pas une erreur."""
    server, service = modules

    class Casse:
        def aggregate(self, _pipeline):
            raise RuntimeError("mongo indisponible")

    server.db = SimpleNamespace(affiliate_referrals=Casse())

    assert asyncio.run(service._periodes_couvertes(["p1"])) == {}
    assert asyncio.run(service._periode_couverte("p1")) is None


# ===========================================================================
# LE RENDU LISIBLE
# ===========================================================================

def test_un_mois_se_lit_dans_les_deux_langues(modules):
    _server, service = modules

    assert service._mois_lisible("2026-09", "fr") == "septembre 2026"
    assert service._mois_lisible("2026-09", "en") == "September 2026"
    assert service._mois_lisible("2026-01", "fr") == "janvier 2026"


def test_une_cle_qui_n_est_pas_un_mois_passe_telle_quelle(modules):
    # Jamais d'exception sur une donnee heritee : l'affichage degrade, il ne
    # casse pas.
    _server, service = modules

    for valeur in ["", None, "2026", "pas-un-mois", "2026-13"]:
        service._mois_lisible(valeur, "fr")      # ne leve pas
    assert service._mois_lisible("2026-13", "fr") == "2026-13"
    assert service._mois_lisible(None, "fr") == ""


def test_une_plage_dans_la_meme_annee_ne_repete_pas_l_annee(modules):
    """« juillet a septembre 2026 » se lit ; « juillet 2026 a septembre 2026 »
    se dechiffre."""
    _server, service = modules
    periode = {"debut": "2026-07", "fin": "2026-09", "multi": True}

    assert service._periode_lisible(periode, "fr") == "juillet à septembre 2026"
    assert service._periode_lisible(periode, "en") == "July to September 2026"


def test_une_plage_a_cheval_sur_deux_annees_porte_les_deux(modules):
    _server, service = modules
    periode = {"debut": "2025-12", "fin": "2026-01", "multi": True}

    assert service._periode_lisible(periode, "fr") == "décembre 2025 à janvier 2026"
    assert service._periode_lisible(periode, "en") == "December 2025 to January 2026"


def test_un_mois_unique_se_rend_sans_plage(modules):
    _server, service = modules

    assert service._periode_lisible(
        {"debut": "2026-09", "fin": "2026-09", "multi": False}, "fr") == "septembre 2026"


def test_sans_periode_le_repli_est_rendu_tel_quel(modules):
    """C'est ce qui permet a l'appelant de dire « indisponible » plutot que
    d'inventer."""
    _server, service = modules

    assert service._periode_lisible(None, "fr") == ""
    assert service._periode_lisible(None, "fr", repli="indisponible") == "indisponible"
    assert service._periode_lisible({}, "fr", repli="-") == "-"


# ===========================================================================
# LE RE-EXPORT
# ===========================================================================

def test_les_aides_sont_re_exportees_par_server(modules):
    """LE PIEGE CONNU DE CE DEPOT.

    server.py importe le service dans un `try` (import absolu) et un
    `except ImportError` (import relatif au paquet). Un nom ajoute a une seule
    des deux listes ne se resout pas selon la facon dont uvicorn a ete lance,
    et l'erreur n'apparait qu'au demarrage en production.
    """
    server, _service = modules

    for nom in ("_mois_lisible", "_periode_lisible",
                "_periode_couverte", "_periodes_couvertes"):
        assert hasattr(server, nom), f"{nom} absent de server"

    import inspect
    source = inspect.getsource(server)
    assert source.count("_mois_lisible, _periode_lisible") == 2, (
        "les aides doivent figurer dans les DEUX listes de re-export")
