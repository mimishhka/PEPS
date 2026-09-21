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
from datetime import datetime, timedelta, timezone
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
        # La cle DOIT suivre l'index reel : (affilie, periode, type). Tant
        # qu'elle ignorait `kind`, la doublure refusait la confirmation comme
        # un doublon de l'annonce — le defaut meme que `kind` est venu
        # corriger, reproduit dans le test cense le surveiller.
        cle = (doc.get("affiliate_id"), doc.get("period"), doc.get("kind"))
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


# ------------------------------------------- la confirmation de l'envoi -----

VERSEMENT = {
    "id": "p-1", "affiliate_id": "a-1", "period": "2026-08",
    "amount_cad": 412.5, "amount": 305.12, "currency": "usdt",
    "reference": "0xabc123def456", "status": "paid",
}


# `affiliation` n'est pas utilise ici, mais la signature suit celle de
# `_brancher` : deux aides voisines appelees differemment, c'est le genre
# de detail qui fait passer un module pour une collection.
def _brancher_confirmation(server_module, affiliation=None, avis=None,
                           envoyer=None, affilie=AFFILIE):
    envois = []

    async def _send_email(destinataire, sujet, html):
        if envoyer:
            return envoyer(destinataire, sujet, html)
        envois.append({"a": destinataire, "sujet": sujet, "html": html})

    class Affilies:
        async def find_one(self, filtre, projection=None):
            return affilie

    avis = avis if avis is not None else _Avis()
    server_module.db = SimpleNamespace(
        affiliate_payout_notices=avis, affiliates=Affilies())
    server_module._send_email = _send_email
    return avis, envois


def test_la_confirmation_porte_la_reference_de_transaction(server_module, affiliation):
    # Sans la reference, ce courriel ne vaudrait qu'une politesse : c'est elle
    # qui permet de retrouver l'envoi sans nous ecrire.
    avis, envois = _brancher_confirmation(server_module, affiliation)

    parti = asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT))

    assert parti is True
    corps = envois[0]["html"]
    assert "0xabc123def456" in corps
    assert "412.50 $ CAD" in corps
    assert "305.12 USDT" in corps
    assert "est parti" in envois[0]["sujet"]


def test_sans_reference_la_ligne_disparait_au_lieu_d_etre_vide(server_module, affiliation):
    # Une ligne « Reference : » vide vaut moins que pas de ligne du tout.
    avis, envois = _brancher_confirmation(server_module, affiliation)

    asyncio.run(affiliation._confirmer_versement_envoye({**VERSEMENT, "reference": ""}))

    assert "Reference de la transaction" not in envois[0]["html"]


def test_annonce_et_confirmation_coexistent_pour_le_meme_mois(server_module, affiliation):
    # C'est tout l'objet de `kind` : la cle (affilie, periode) bloquait le
    # second avis, donc l'affilie apprenait qu'il serait paye, jamais qu'il
    # l'avait ete.
    avis = _Avis()

    class Affilies:
        async def find_one(self, filtre, projection=None):
            return AFFILIE

    envois = []

    async def _send_email(destinataire, sujet, html):
        envois.append(sujet)

    server_module.db = SimpleNamespace(
        affiliate_payout_notices=avis, affiliates=Affilies())
    server_module._send_email = _send_email

    asyncio.run(affiliation._annoncer_versement_du_cycle(AFFILIE, "2026-08", 412.5, 7))
    asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT))

    assert len(envois) == 2
    types = [d.get("kind") for d in avis.inserts]
    assert types == ["annonce", "confirmation"]


def test_une_confirmation_ne_part_qu_une_fois(server_module, affiliation):
    avis, envois = _brancher_confirmation(server_module, affiliation)

    premier = asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT))
    second = asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT))

    assert (premier, second) == (True, False)
    assert len(envois) == 1


def test_l_interrupteur_coupe_aussi_la_confirmation(server_module, affiliation, monkeypatch):
    avis, envois = _brancher_confirmation(server_module, affiliation)
    monkeypatch.setattr(server_module, "AFFILIATE_PAYOUT_NOTICE_ENABLED", False)

    assert asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT)) is False
    assert envois == []


def test_un_affilie_disparu_ne_fait_pas_tomber_le_versement(server_module, affiliation):
    avis, envois = _brancher_confirmation(server_module, affiliation, affilie=None)

    assert asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT)) is False
    assert envois == []


def test_les_avis_expirent_au_bout_de_deux_ans(server_module, affiliation):
    # Un avis est une trace, pas un registre : deux ans suffisent a repondre
    # « est-ce que je l'ai prevenu ».
    from datetime import datetime, timezone
    avis, _ = _brancher_confirmation(server_module, affiliation)
    asyncio.run(affiliation._confirmer_versement_envoye(VERSEMENT))

    peremption = avis.inserts[0]["expires_at"]
    jours = (peremption - datetime.now(timezone.utc)).days
    assert 729 <= jours <= 731


def test_les_deux_chemins_de_paiement_confirment(server_module):
    # Un affilie paye par le fournisseur n'a aucune raison d'etre moins
    # informe que celui paye a la main — et c'est justement le chemin ou
    # personne ne le fera a sa place.
    import inspect
    manuel = inspect.getsource(server_module.admin_affiliate_mark_paid)
    synchro = inspect.getsource(server_module.admin_payout_status)

    assert "_confirmer_versement_envoye" in manuel
    assert "_confirmer_versement_envoye" in synchro


# ------------------------------------------- la reprise des avis rates ------

class _Avis_file:
    """Une file d'avis : sert le plus ancien qui satisfait le filtre."""

    def __init__(self, docs):
        self.docs = [dict(d) for d in docs]
        self.updates = []

    async def find_one_and_update(self, filtre, maj, sort=None, return_document=None):
        limite = filtre.get("created_at", {}).get("$gte")
        plafond = None
        for clause in filtre.get("$or", []):
            if "$lt" in clause.get("attempts", {}):
                plafond = clause["attempts"]["$lt"]
        candidats = []
        for d in self.docs:
            if d.get("email_status") != filtre.get("email_status"):
                continue
            if limite and str(d.get("created_at", "")) < limite:
                continue
            if "email_html" in filtre and "email_html" not in d:
                continue
            if plafond is not None and int(d.get("attempts", 0)) >= plafond:
                continue
            candidats.append(d)
        if not candidats:
            return None
        candidats.sort(key=lambda d: str(d.get("created_at", "")))
        pris = candidats[0]
        pris.update(maj.get("$set", {}))
        for cle, pas in (maj.get("$inc") or {}).items():
            pris[cle] = int(pris.get(cle, 0)) + pas
        return dict(pris)

    async def update_one(self, filtre, maj):
        self.updates.append(maj)
        for d in self.docs:
            if d.get("id") == filtre.get("id"):
                d.update(maj.get("$set", {}))
                for cle in (maj.get("$unset") or {}):
                    d.pop(cle, None)


def _avis_rate(id_, minutes=10, tentatives=0):
    quand = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return {"id": id_, "affiliate_id": "a-1", "period": "2026-08",
            "kind": "annonce", "email_status": "failed",
            "created_at": quand.isoformat(), "attempts": tentatives,
            "email_to": "affilie@example.com", "email_subject": "sujet",
            "email_html": "<p>corps</p>"}


def _brancher_reprise(server_module, docs, envoyer=None):
    envois = []

    async def _send_email(destinataire, sujet, html):
        if envoyer:
            return envoyer(destinataire, sujet, html)
        envois.append(destinataire)

    file = _Avis_file(docs)
    server_module.db = SimpleNamespace(affiliate_payout_notices=file)
    server_module._send_email = _send_email
    return file, envois


def test_un_avis_rate_recemment_est_rejoue(server_module, affiliation):
    # Le depot en file a echoue, pas la livraison : c'est le genre de panne
    # qui se repare toute seule dix minutes plus tard.
    file, envois = _brancher_reprise(server_module, [_avis_rate("n-1")])

    repris = asyncio.run(affiliation._reprendre_avis_en_echec())

    assert repris == 1
    assert envois == ["affilie@example.com"]
    assert file.docs[0]["email_status"] == "queued"


def test_le_corps_conserve_disparait_une_fois_parti(server_module, affiliation):
    # Il n'etait garde que pour la reprise.
    file, _ = _brancher_reprise(server_module, [_avis_rate("n-1")])
    asyncio.run(affiliation._reprendre_avis_en_echec())

    assert "email_html" not in file.docs[0]
    assert "email_to" not in file.docs[0]


def test_un_avis_de_plus_de_48h_n_est_plus_rejoue(server_module, affiliation):
    # Annoncer « votre versement part avant le 6 » un 9 septembre n'informe
    # plus : ca desinforme.
    file, envois = _brancher_reprise(server_module, [_avis_rate("n-1", minutes=60 * 49)])

    assert asyncio.run(affiliation._reprendre_avis_en_echec()) == 0
    assert envois == []
    assert file.docs[0]["email_status"] == "failed"


def test_le_plafond_de_tentatives_arrete_la_reprise(server_module, affiliation, monkeypatch):
    monkeypatch.setattr(server_module, "AFFILIATE_NOTICE_MAX_ATTEMPTS", 3)
    file, envois = _brancher_reprise(server_module, [_avis_rate("n-1", tentatives=3)])

    assert asyncio.run(affiliation._reprendre_avis_en_echec()) == 0
    assert envois == []


def test_le_plafond_est_reglable(server_module, affiliation, monkeypatch):
    monkeypatch.setattr(server_module, "AFFILIATE_NOTICE_MAX_ATTEMPTS", 5)
    file, envois = _brancher_reprise(server_module, [_avis_rate("n-1", tentatives=3)])

    assert asyncio.run(affiliation._reprendre_avis_en_echec()) == 1


def test_un_echec_de_reprise_remet_l_avis_en_echec(server_module, affiliation):
    # Le compteur a deja ete incremente : la prochaine reprise en aura une de
    # moins avant le plafond, et la boucle ne tourne pas indefiniment.
    def tomber(*_a, **_k):
        raise RuntimeError("mongo indisponible")

    file, _ = _brancher_reprise(server_module, [_avis_rate("n-1")], envoyer=tomber)

    assert asyncio.run(affiliation._reprendre_avis_en_echec()) == 0
    assert file.docs[0]["email_status"] == "failed"
    assert file.docs[0]["attempts"] == 1


def test_la_reprise_prend_les_plus_anciens_d_abord(server_module, affiliation):
    file, envois = _brancher_reprise(server_module, [
        {**_avis_rate("n-recent", minutes=5), "email_to": "recent@example.com"},
        {**_avis_rate("n-ancien", minutes=600), "email_to": "ancien@example.com"},
    ])

    asyncio.run(affiliation._reprendre_avis_en_echec())

    assert envois[0] == "ancien@example.com"
    assert len(envois) == 2


def test_un_avis_sans_corps_conserve_est_ignore(server_module, affiliation):
    # Les avis d'avant cette reprise n'ont pas de corps : les rejouer
    # enverrait un courriel vide.
    sans_corps = _avis_rate("n-1")
    sans_corps.pop("email_html")
    file, envois = _brancher_reprise(server_module, [sans_corps])

    assert asyncio.run(affiliation._reprendre_avis_en_echec()) == 0
    assert envois == []


def test_le_watchdog_lance_la_reprise(server_module):
    # Une reprise que personne n'appelle ne reprend rien.
    import inspect
    import services.affiliate as module

    assert "_reprendre_avis_en_echec" in inspect.getsource(
        module.affiliate_maintenance_watchdog)
