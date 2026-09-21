# -*- coding: utf-8 -*-
"""Le cycle de versement des commissions d'affiliation.

Demande du 2026-09-20 : « lorsque la fin de mois arrive, j'ai 5 jours pour
faire le debourse. Comment le tableau de bord admin et affilie fait la
distinction entre le mois courant et la commission cumulee du mois precedent
qui est a verser ? »

Il ne la faisait pas. Le run mensuel regroupe TOUTES les commissions
approuvees et non payees sans regarder leur mois — le champ `period` n'est
qu'une etiquette posee au moment du run. « Commissions approuvees »
melangeait donc deux obligations dont une seule a une echeance.
"""
import asyncio
import importlib
import os
import sys
from datetime import datetime, timezone
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


def _le(texte: str) -> datetime:
    return datetime.fromisoformat(texte)


# ------------------------------------------------------- quel mois est du ---

def test_en_milieu_de_mois_le_mois_clos_est_le_precedent(server_module):
    cycle = server_module._cycle_versement(_le("2026-09-20T15:00:00+00:00"))

    assert cycle["period"] == "2026-08"
    assert cycle["current_period"] == "2026-09"


def test_le_passage_a_l_annee_suivante(server_module):
    cycle = server_module._cycle_versement(_le("2026-01-10T15:00:00+00:00"))

    assert cycle["period"] == "2025-12"
    assert cycle["current_period"] == "2026-01"


# ------------------------------------------------------ l'heure du Quebec ---

def test_la_bascule_se_fait_a_minuit_heure_du_quebec(server_module):
    # En UTC, le 1er septembre commence QUATRE heures trop tot : une vente du
    # 31 aout a 22 h a Montreal basculerait dans le cycle suivant et sortirait
    # du montant a verser. La limite doit donc tomber a 04:00 UTC.
    cycle = server_module._cycle_versement(_le("2026-09-20T15:00:00+00:00"))

    limite = _le(cycle["cutoff"]).astimezone(timezone.utc)
    assert limite.isoformat() == "2026-09-01T04:00:00+00:00"


def test_en_hiver_le_decalage_est_de_cinq_heures(server_module):
    # Meme regle, autre saison : l'heure normale de l'Est est a UTC-5.
    cycle = server_module._cycle_versement(_le("2026-01-10T15:00:00+00:00"))

    limite = _le(cycle["cutoff"]).astimezone(timezone.utc)
    assert limite.isoformat() == "2026-01-01T05:00:00+00:00"


# ----------------------------------------------------------- l'echeance -----

def test_les_cinq_jours_se_comptent_depuis_le_premier(server_module):
    cycle = server_module._cycle_versement(_le("2026-09-01T04:00:00+00:00"))

    echeance = _le(cycle["due_by"]).astimezone(timezone.utc)
    assert echeance.isoformat() == "2026-09-06T04:00:00+00:00"
    assert cycle["due_days"] == 5
    assert cycle["days_left"] == 5
    assert cycle["overdue"] is False


def test_le_troisieme_jour_il_en_reste_deux(server_module):
    cycle = server_module._cycle_versement(_le("2026-09-03T16:00:00+00:00"))

    assert cycle["days_left"] == 2
    assert cycle["overdue"] is False


def test_passe_l_echeance_le_retard_est_dit(server_module):
    cycle = server_module._cycle_versement(_le("2026-09-20T15:00:00+00:00"))

    assert cycle["overdue"] is True
    # Un compte a rebours negatif ne veut rien dire : on affiche zero et on
    # dit « en retard » a cote.
    assert cycle["days_left"] == 0


def test_le_delai_est_un_reglage(server_module, monkeypatch):
    monkeypatch.setattr(server_module, "AFFILIATE_PAYOUT_DUE_DAYS", 10)
    cycle = server_module._cycle_versement(_le("2026-09-01T04:00:00+00:00"))

    assert cycle["due_days"] == 10
    assert _le(cycle["due_by"]).astimezone(timezone.utc).day == 11


# ------------------------------------------------- la separation de l'argent -

class _Curseur:
    def __init__(self, lignes):
        self._lignes = lignes

    async def to_list(self, limit):
        return self._lignes[:limit]


def _brancher(server_module, ligne):
    vu = {}

    class Referrals:
        def aggregate(self, pipeline):
            vu["pipeline"] = pipeline
            return _Curseur([ligne] if ligne else [])

    server_module.db = SimpleNamespace(affiliate_referrals=Referrals())
    return vu


def test_l_argent_du_est_separe_de_celui_qui_court(server_module):
    _brancher(server_module, {
        "due_now": 412.5, "due_count": 7,
        "current_cycle": 88.25, "current_count": 2,
    })

    out = asyncio.run(server_module._commissions_par_cycle(
        "a-1", _le("2026-09-03T16:00:00+00:00")))

    assert out["due_now"] == 412.5
    assert out["due_count"] == 7
    assert out["current_cycle"] == 88.25
    assert out["current_count"] == 2
    # Le montant du est inseparable de sa date limite : l'un sans l'autre ne
    # dit pas s'il faut agir aujourd'hui.
    assert out["period"] == "2026-08"
    assert out["days_left"] == 2


def test_seules_les_commissions_approuvees_et_non_versees_comptent(server_module):
    vu = _brancher(server_module, None)
    asyncio.run(server_module._commissions_par_cycle("a-1"))

    selection = vu["pipeline"][0]["$match"]
    assert selection["status"] == "approved"
    assert selection["payout_id"] is None
    assert selection["affiliate_id"] == "a-1"


def test_sans_affilie_la_vue_porte_sur_tout_le_programme(server_module):
    vu = _brancher(server_module, None)
    asyncio.run(server_module._commissions_par_cycle())

    assert "affiliate_id" not in vu["pipeline"][0]["$match"]


def test_la_separation_se_fait_sur_la_date_effective(server_module):
    # `approved_at` sinon `created_at` : la meme regle que le palier et que la
    # serie mensuelle. Une autre date ici ferait diverger les trois ecrans.
    vu = _brancher(server_module, None)
    asyncio.run(server_module._commissions_par_cycle("a-1"))

    eff = vu["pipeline"][1]["$project"]["eff"]
    source = eff["$switch"]["branches"][0]["case"]["$in"][0]["$type"]
    assert source == {"$ifNull": ["$approved_at", "$created_at", None]}


def test_une_agregation_en_panne_rend_zero_et_garde_les_dates(server_module):
    class Referrals:
        def aggregate(self, pipeline):
            raise RuntimeError("mongo indisponible")

    server_module.db = SimpleNamespace(affiliate_referrals=Referrals())

    out = asyncio.run(server_module._commissions_par_cycle(
        "a-1", _le("2026-09-03T16:00:00+00:00")))

    assert out["due_now"] == 0.0
    assert out["current_cycle"] == 0.0
    # Zero avec la bonne echeance vaut mieux qu'une carte vide : la date, elle,
    # ne depend pas de la base.
    assert out["period"] == "2026-08"
    assert out["due_days"] == 5


def test_sans_aucune_commission_les_deux_totaux_sont_nuls(server_module):
    _brancher(server_module, None)

    out = asyncio.run(server_module._commissions_par_cycle("a-1"))

    assert out["due_now"] == 0.0
    assert out["due_count"] == 0
    assert out["current_cycle"] == 0.0
    assert out["current_count"] == 0


# ------------------------------------------------- le signal du pouls -------

def test_le_pouls_annonce_le_versement_et_son_echeance(server_module, monkeypatch):
    # Le pouls savait dire « paiements prets » sans jamais dire AVANT QUAND.
    # Un debourse en retard ne se signalait nulle part, alors que c'est le
    # seul engagement de cet ecran qui porte une date et un tiers qui attend.
    class Vide:
        def aggregate(self, pipeline):
            return _Curseur([])

        async def count_documents(self, *a, **k):
            return 0

    class Referrals(Vide):
        def aggregate(self, pipeline):
            return _Curseur([{"due_now": 412.5, "due_count": 7,
                              "current_cycle": 88.25, "current_count": 2}])

    monkeypatch.setattr(server_module, "_low_stock_variants",
                        lambda limit=50: _rien())
    server_module.db = SimpleNamespace(
        orders=Vide(), interac_reconciliation_queue=Vide(),
        email_outbox=Vide(), affiliate_tickets=Vide(),
        affiliate_referrals=Referrals(),
    )

    out = asyncio.run(server_module.admin_dashboard_pulse({}))
    v = out["ops"]["affiliate_payout"]

    assert v["amount"] == 412.5
    assert v["count"] == 7
    assert v["due_by"]
    assert v["period"]


async def _rien():
    return []


def test_le_retard_ne_s_allume_pas_a_zero(server_module, monkeypatch):
    # Un compteur qui s'allume a zero apprend a etre ignore, et le jour ou il
    # compte, on ne le regarde plus. L'echeance de ce mois-ci est depassee
    # depuis longtemps, mais il n'y a rien a sortir.
    class Vide:
        def aggregate(self, pipeline):
            return _Curseur([])

        async def count_documents(self, *a, **k):
            return 0

    monkeypatch.setattr(server_module, "_low_stock_variants",
                        lambda limit=50: _rien())
    server_module.db = SimpleNamespace(
        orders=Vide(), interac_reconciliation_queue=Vide(),
        email_outbox=Vide(), affiliate_tickets=Vide(),
        affiliate_referrals=Vide(),
    )

    out = asyncio.run(server_module.admin_dashboard_pulse({}))

    assert out["ops"]["affiliate_payout"]["amount"] == 0.0
    assert out["ops"]["affiliate_payout"]["overdue"] is False


def test_une_collection_absente_ne_fait_pas_tomber_le_pouls(server_module, monkeypatch):
    # Le cycle est lance DANS le asyncio.gather du pouls : une exception y
    # remonte et emporterait les neuf autres lectures avec elle.
    class Vide:
        def aggregate(self, pipeline):
            return _Curseur([])

        async def count_documents(self, *a, **k):
            return 0

    monkeypatch.setattr(server_module, "_low_stock_variants",
                        lambda limit=50: _rien())
    server_module.db = SimpleNamespace(
        orders=Vide(), interac_reconciliation_queue=Vide(),
        email_outbox=Vide(), affiliate_tickets=Vide(),
    )  # pas d'affiliate_referrals du tout

    out = asyncio.run(server_module.admin_dashboard_pulse({}))

    assert out["ops"]["affiliate_payout"]["amount"] == 0.0
    assert "money" in out and "rails" in out


# ------------------------------------------------- l'historique des cycles --

def test_l_echeance_d_un_mois_quelconque_suit_la_meme_regle(server_module):
    # Une seule source pour cette date : si l'historique la recalculait de son
    # cote, deux ecrans annonceraient deux echeances pour le meme cycle.
    echeance = server_module._echeance_pour_periode("2026-08")

    assert _le(echeance).astimezone(timezone.utc).isoformat() == "2026-09-06T04:00:00+00:00"


def test_decembre_bascule_sur_janvier_suivant(server_module):
    echeance = server_module._echeance_pour_periode("2026-12")

    # Janvier : heure normale de l'Est, UTC-5.
    assert _le(echeance).astimezone(timezone.utc).isoformat() == "2027-01-06T05:00:00+00:00"


@pytest.mark.parametrize("periode", ["", None, "2026", "2026-13", "aout", "2026-00"])
def test_une_periode_illisible_ne_fabrique_pas_de_date(server_module, periode):
    # Mieux vaut pas de date qu'une date inventee : c'est elle qui decide si
    # un cycle est en retard.
    assert server_module._echeance_pour_periode(periode) is None


def _brancher_cycles(server_module, lignes, avis=()):
    class Payouts:
        def aggregate(self, pipeline):
            return _Curseur(lignes)

    class Notices:
        def aggregate(self, pipeline):
            return _Curseur(list(avis))

    server_module.db = SimpleNamespace(
        affiliate_payouts=Payouts(), affiliate_payout_notices=Notices())


def test_un_cycle_parti_dans_les_temps_ne_porte_aucun_retard(server_module):
    _brancher_cycles(server_module, [{
        "_id": "2026-08", "total_cad": 412.5, "affiliates": 3, "referrals": 7,
        "sent": 3, "first_sent_at": "2026-09-02T14:00:00+00:00",
        "last_sent_at": "2026-09-04T16:00:00+00:00",
    }])

    out = asyncio.run(server_module.admin_affiliate_cycles({}))
    c = out["cycles"][0]

    assert c["days_late"] == 0
    assert c["on_time"] is True
    assert c["total_cad"] == 412.5
    assert c["pending"] == 0


def test_un_cycle_en_retard_compte_ses_jours(server_module):
    # Echeance au 6 septembre 04:00 UTC ; dernier envoi le 9 a 16:00.
    _brancher_cycles(server_module, [{
        "_id": "2026-08", "total_cad": 412.5, "affiliates": 2, "referrals": 5,
        "sent": 2, "first_sent_at": "2026-09-09T10:00:00+00:00",
        "last_sent_at": "2026-09-09T16:00:00+00:00",
    }])

    out = asyncio.run(server_module.admin_affiliate_cycles({}))
    c = out["cycles"][0]

    assert c["days_late"] == 3
    assert c["on_time"] is False


def test_le_retard_se_compte_sur_le_DERNIER_envoi(server_module):
    # Un cycle n'est pas clos tant qu'un affilie du mois n'a pas ete paye :
    # compter sur le premier envoi dirait « dans les temps » alors qu'il reste
    # quelqu'un a payer.
    _brancher_cycles(server_module, [{
        "_id": "2026-08", "total_cad": 900.0, "affiliates": 2, "referrals": 9,
        "sent": 2, "first_sent_at": "2026-09-02T10:00:00+00:00",
        "last_sent_at": "2026-09-11T10:00:00+00:00",
    }])

    assert asyncio.run(server_module.admin_affiliate_cycles({}))["cycles"][0]["days_late"] == 5


def test_un_cycle_pas_encore_parti_ne_porte_pas_de_retard(server_module):
    # « Pas encore parti » et « en retard » ne sont pas la meme information :
    # l'une appelle une action, l'autre un constat.
    _brancher_cycles(server_module, [{
        "_id": "2026-09", "total_cad": 88.25, "affiliates": 2, "referrals": 2,
        "sent": 1, "first_sent_at": "2026-10-02T10:00:00+00:00",
        "last_sent_at": "2026-10-02T10:00:00+00:00",
    }])

    c = asyncio.run(server_module.admin_affiliate_cycles({}))["cycles"][0]

    assert c["days_late"] is None
    assert c["on_time"] is None
    assert c["pending"] == 1


def test_une_agregation_en_panne_rend_une_liste_vide(server_module):
    class Payouts:
        def aggregate(self, pipeline):
            raise RuntimeError("mongo indisponible")

    server_module.db = SimpleNamespace(affiliate_payouts=Payouts())

    out = asyncio.run(server_module.admin_affiliate_cycles({}))

    assert out["cycles"] == []
    assert out["due_days"] == 5


def test_le_cycle_dit_combien_d_affilies_ont_ete_prevenus(server_module):
    # Un courriel qui echoue le fait en silence, et c'est exactement le mois
    # ou quelqu'un demande pourquoi il n'a rien recu.
    _brancher_cycles(
        server_module,
        [{"_id": "2026-08", "total_cad": 412.5, "affiliates": 3, "referrals": 7,
          "sent": 2, "first_sent_at": "2026-09-02T14:00:00+00:00",
          "last_sent_at": "2026-09-04T16:00:00+00:00"}],
        avis=[{"_id": {"period": "2026-08", "kind": "annonce"}, "n": 3},
              {"_id": {"period": "2026-08", "kind": "confirmation"}, "n": 1}],
    )

    c = asyncio.run(server_module.admin_affiliate_cycles({}))["cycles"][0]

    assert c["notices_announced"] == 3
    assert c["notices_confirmed"] == 1


def test_sans_avis_les_compteurs_valent_zero_et_pas_None(server_module):
    # Zero se compare a `affiliates` ; None ne se compare a rien.
    _brancher_cycles(server_module, [{
        "_id": "2026-08", "total_cad": 10.0, "affiliates": 1, "referrals": 1,
        "sent": 1, "first_sent_at": None, "last_sent_at": None}])

    c = asyncio.run(server_module.admin_affiliate_cycles({}))["cycles"][0]

    assert c["notices_announced"] == 0
    assert c["notices_confirmed"] == 0


def test_une_panne_du_releve_des_avis_ne_vide_pas_les_cycles(server_module):
    class Payouts:
        def aggregate(self, pipeline):
            return _Curseur([{"_id": "2026-08", "total_cad": 10.0, "affiliates": 1,
                              "referrals": 1, "sent": 1,
                              "first_sent_at": None, "last_sent_at": None}])

    class Notices:
        def aggregate(self, pipeline):
            raise RuntimeError("mongo indisponible")

    server_module.db = SimpleNamespace(
        affiliate_payouts=Payouts(), affiliate_payout_notices=Notices())

    out = asyncio.run(server_module.admin_affiliate_cycles({}))

    assert len(out["cycles"]) == 1
    assert out["cycles"][0]["notices_announced"] == 0


# --------------------------------------------- les avis restes en echec -----

def test_les_avis_bloques_sont_comptes(server_module):
    # Deux facons de sortir du champ de la reprise : depasser 48 heures, ou
    # epuiser le plafond. Dans les deux cas l'avis reste en echec pour
    # toujours, et l'affilie sans nouvelle.
    vu = {}

    class Notices:
        async def count_documents(self, filtre):
            vu["filtre"] = filtre
            return 4

    server_module.db = SimpleNamespace(affiliate_payout_notices=Notices())

    assert asyncio.run(server_module._avis_bloques()) == 4
    ou = vu["filtre"]["$or"]
    assert any("created_at" in clause for clause in ou)
    assert any("attempts" in clause for clause in ou)


def test_un_affilie_sans_adresse_compte_comme_bloque(server_module):
    # « Aucune adresse au dossier » n'est pas rattrapable par une reprise :
    # il n'y a personne a qui ecrire.
    vu = {}

    class Notices:
        async def count_documents(self, filtre):
            vu["filtre"] = filtre
            return 0

    server_module.db = SimpleNamespace(affiliate_payout_notices=Notices())
    asyncio.run(server_module._avis_bloques())

    assert "skipped_no_email" in vu["filtre"]["email_status"]["$in"]


def test_une_collection_absente_compte_zero(server_module):
    server_module.db = SimpleNamespace()

    assert asyncio.run(server_module._avis_bloques()) == 0


def test_le_pouls_porte_le_compteur_des_avis_bloques(server_module, monkeypatch):
    class Vide:
        def aggregate(self, pipeline):
            return _Curseur([])

        async def count_documents(self, *a, **k):
            return 2

    async def _rien():
        return []

    monkeypatch.setattr(server_module, "_low_stock_variants", lambda limit=50: _rien())
    server_module.db = SimpleNamespace(
        orders=Vide(), interac_reconciliation_queue=Vide(),
        email_outbox=Vide(), affiliate_tickets=Vide(),
        affiliate_referrals=Vide(), affiliate_payout_notices=Vide(),
    )

    out = asyncio.run(server_module.admin_dashboard_pulse({}))

    assert out["ops"]["affiliate_notices_stuck"] == 2
