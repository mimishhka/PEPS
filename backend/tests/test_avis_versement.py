# -*- coding: utf-8 -*-
"""L'avis de versement envoye a l'affilie au calcul du mois clos.

Demande du 2026-09-21. Le tableau de bord affiche l'echeance, mais il faut y
aller pour la voir : un affilie qui attend son argent ne rafraichit pas une
page tous les jours, il ecrit ou il doute.

Le programme envoyait DEJA un courriel automatique dans le cas inverse, quand
le solde est sous le seuil. N'ecrire que pour reporter, jamais pour verser,
c'etait n'ecrire que les mauvaises nouvelles.

Un courriel parti ne se rattrape pas : ces tests portent sur les garde-fous
plus que sur le texte.
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
    monkeypatch.setenv("ORDER_CUTOFF_TZ", "America/Toronto")
    import server
    return importlib.reload(server)


@pytest.fixture
def affiliation(server_module):
    import services.affiliate as module
    return importlib.reload(module)


AFFILIE = {"id": "a-1", "code": "DEMO00", "email": "affilie@example.com",
           "first_name": "Marie", "preferred_lang": "fr"}


class _Avis:
    """La collection des avis : note ce qui entre, refuse les doublons."""

    def __init__(self, deja=()):
        self.inserts = []
        self.updates = []
        self._cles = set(deja)

    async def insert_one(self, doc):
        cle = (doc.get("affiliate_id"), doc.get("period"))
        if cle in self._cles:
            from pymongo.errors import DuplicateKeyError
            raise DuplicateKeyError("avis deja envoye")
        self._cles.add(cle)
        self.inserts.append(doc)

    async def update_one(self, filtre, maj):
        self.updates.append(maj.get("$set", {}))


def _brancher(server_module, affiliation, avis=None, envoyer=None):
    envois = []

    async def _send_email(destinataire, sujet, html):
        if envoyer:
            return envoyer(destinataire, sujet, html)
        envois.append({"a": destinataire, "sujet": sujet, "html": html})

    avis = avis if avis is not None else _Avis()
    server_module.db = SimpleNamespace(affiliate_payout_notices=avis)
    server_module._send_email = _send_email
    return avis, envois


# ------------------------------------------------------- le cas nominal -----

def test_l_avis_dit_le_montant_et_la_date_limite(server_module, affiliation):
    avis, envois = _brancher(server_module, affiliation)

    parti = asyncio.run(affiliation._annoncer_versement_du_cycle(
        AFFILIE, "2026-08", 412.5, 7))

    assert parti is True
    assert len(envois) == 1
    corps = envois[0]["html"]
    assert "412.50 $ CAD" in corps
    assert "7 commande(s)" in corps
    # L'echeance du mois d'aout : le 6 septembre, heure du Quebec.
    assert "06/09/2026" in corps
    assert "2026-08" in envois[0]["sujet"]
    assert envois[0]["a"] == "affilie@example.com"


def test_l_echeance_vient_du_meme_calcul_que_les_ecrans(server_module, affiliation):
    # Une date recalculee ici serait une quatrieme verite sur la meme
    # obligation. On verifie qu'elle est enregistree telle que le serveur la
    # produit, pas reformulee.
    avis, envois = _brancher(server_module, affiliation)
    asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))

    assert avis.updates[-1]["due_by"] == server_module._echeance_pour_periode("2026-08")


def test_l_anglais_est_servi_a_qui_le_demande(server_module, affiliation):
    avis, envois = _brancher(server_module, affiliation)
    anglophone = {**AFFILIE, "preferred_lang": "en"}

    asyncio.run(affiliation._annoncer_versement_du_cycle(anglophone, "2026-08", 412.5, 7))

    assert "on its way" in envois[0]["sujet"]
    assert "no later than 2026-09-06" in envois[0]["html"]


# ------------------------------------------------------- les garde-fous -----

def test_un_second_passage_n_envoie_pas_un_second_courriel(server_module, affiliation):
    # Un planificateur qui rejoue, un serveur qui redemarre, un run admin
    # lance en double : l'affilie recevrait deux fois la meme annonce.
    avis, envois = _brancher(server_module, affiliation)

    premier = asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))
    second = asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))

    assert premier is True
    assert second is False
    assert len(envois) == 1


def test_le_mois_suivant_a_droit_a_son_propre_avis(server_module, affiliation):
    avis, envois = _brancher(server_module, affiliation)

    asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))
    asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-09", 88.25, 2))

    assert len(envois) == 2


def test_l_interrupteur_coupe_l_envoi_sans_redeploiement(server_module, affiliation, monkeypatch):
    avis, envois = _brancher(server_module, affiliation)
    monkeypatch.setattr(server_module, "AFFILIATE_PAYOUT_NOTICE_ENABLED", False)

    parti = asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))

    assert parti is False
    assert envois == []
    # Rien n'est meme enregistre : couper l'avis doit le couper, pas le
    # mettre en file pour plus tard.
    assert avis.inserts == []


def test_un_affilie_sans_courriel_est_note_et_pas_perdu(server_module, affiliation):
    avis, envois = _brancher(server_module, affiliation)

    parti = asyncio.run(affiliation._annoncer_versement_du_cycle(
        {**AFFILIE, "email": ""}, "2026-08", 412.5, 7))

    assert parti is False
    assert envois == []
    assert avis.updates[-1]["email_status"] == "skipped_no_email"


def test_un_envoi_en_panne_est_trace_et_n_arrete_pas_le_run(server_module, affiliation):
    def tomber(*_a, **_k):
        raise RuntimeError("resend indisponible")

    avis, _ = _brancher(server_module, affiliation, envoyer=tomber)

    parti = asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))

    assert parti is False
    assert avis.updates[-1]["email_status"] == "failed"
    assert avis.updates[-1]["email_error"] == "RuntimeError"


def test_une_collection_indisponible_ne_casse_pas_le_versement(server_module, affiliation):
    # L'avis est un confort ; le versement, non. Une panne du premier ne doit
    # jamais empecher le second.
    class Cassee:
        async def insert_one(self, doc):
            raise RuntimeError("mongo indisponible")

    server_module.db = SimpleNamespace(affiliate_payout_notices=Cassee())

    assert asyncio.run(affiliation._annoncer_versement_du_cycle(
        AFFILIE, "2026-08", 412.5, 7)) is False


# ------------------------------------- l'avis ne part que sur un « ready » ---

def test_les_deux_chemins_de_creation_annoncent_le_versement(server_module):
    # Un versement peut naitre de deux facons : le planificateur mensuel, ou
    # le run lance depuis l'administration. Un avis pose d'un seul cote
    # laisserait la moitie des affilies sans nouvelle, selon le chemin
    # emprunte ce mois-la — et personne ne saurait lequel.
    import inspect
    import services.affiliate as module

    admin = inspect.getsource(server_module.admin_affiliate_run_payouts)
    planificateur = inspect.getsource(module._generate_payouts_for_period)

    assert "_annoncer_versement_du_cycle" in admin
    assert "_annoncer_versement_du_cycle" in planificateur


def test_un_versement_mis_en_revue_n_annonce_aucune_date(server_module):
    # « review » attend un humain : lui promettre une date serait promettre ce
    # qu'on ne tiendra peut-etre pas. La garde est la meme des deux cotes.
    import inspect
    import re
    import services.affiliate as module

    for source in (inspect.getsource(server_module.admin_affiliate_run_payouts),
                   inspect.getsource(module._generate_payouts_for_period)):
        avant_l_appel = source[:source.index("_annoncer_versement_du_cycle")]
        # L'appel est garde par la comparaison du nombre de commissions
        # revendiquees, dans un `if` ou dans le `else` du cas partiel.
        assert re.search(r"revendiquees\.modified_count", avant_l_appel), (
            "l'avis part sans verifier que le versement est complet"
        )
