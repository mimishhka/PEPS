# -*- coding: utf-8 -*-
"""Le tableau de bord de l'affilie : ce que la serie mensuelle raconte.

Demande du 2026-09-20. `affiliate_performance` annoncait « 12 derniers mois »
sans rien borner, ignorait les commissions annulees par remboursement, et
regroupait par mois en Python apres avoir transfere tout l'historique.

Le defaut le plus couteux n'etait pas la lenteur : une vente de juillet
remboursee en septembre sortait de `approved|paid`, donc la barre de juillet
MAIGRISSAIT sans qu'aucun chiffre a l'ecran n'explique pourquoi. L'affilie
voyait son passe changer tout seul.
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
    import server
    return importlib.reload(server)


class _Curseur:
    def __init__(self, lignes):
        self._lignes = lignes

    async def to_list(self, limit):
        return self._lignes[:limit]


def _mois(decalage: int) -> str:
    """Cle « AAAA-MM » decalee de N mois vers le passe."""
    maintenant = datetime.now(timezone.utc)
    annee, mois = maintenant.year, maintenant.month - decalage
    while mois <= 0:
        annee, mois = annee - 1, mois + 12
    return f"{annee}-{mois:02d}"


def _brancher(server_module, valide, annule):
    vu = {}

    class Referrals:
        def aggregate(self, pipeline):
            vu["pipeline"] = pipeline
            return _Curseur([{"valide": valide, "annule": annule}])

    server_module.db = SimpleNamespace(affiliate_referrals=Referrals())
    return vu


# ------------------------------------------------------- les douze mois -----

def test_douze_mois_se_terminent_au_mois_courant(server_module):
    cles = server_module._douze_derniers_mois()
    assert len(cles) == 12
    assert cles[-1] == _mois(0)
    assert cles[0] == _mois(11)
    assert cles == sorted(cles)


def test_la_serie_ne_remonte_pas_avant_l_arrivee_de_l_affilie(server_module):
    # Onze mois a zero devant quelqu'un qui a rejoint le mois dernier, ce sont
    # onze mois rates qu'il n'a jamais eu l'occasion de manquer.
    cles = server_module._douze_derniers_mois(depuis=_mois(2))
    assert cles == [_mois(2), _mois(1), _mois(0)]


# ------------------------------------------------- la serie mensuelle -------

def test_un_remboursement_apparait_au_mois_ou_l_argent_est_repris(server_module):
    _brancher(
        server_module,
        valide=[{"_id": _mois(1), "revenue": 500.0, "commission": 50.0, "orders": 3}],
        annule=[{"_id": _mois(0), "reversed": 20.0, "reversed_orders": 1}],
    )

    out = asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))
    par_mois = {l["month"]: l for l in out["series"]}

    assert par_mois[_mois(1)]["revenue"] == 500.0
    assert par_mois[_mois(1)]["reversed"] == 0.0
    # Le mois courant n'a aucune vente, mais il a une reprise : la ligne
    # existe quand meme, sinon l'argent repris n'est nulle part.
    assert par_mois[_mois(0)]["reversed"] == 20.0
    assert par_mois[_mois(0)]["revenue"] == 0.0


def test_la_base_du_chiffre_est_nommee(server_module):
    # « Revenu » sans precision se lit comme le total paye par le client. La
    # commission porte sur le sous-total produits, remise deduite.
    _brancher(server_module, valide=[{"_id": _mois(0), "revenue": 10.0, "commission": 1.0}], annule=[])

    out = asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))

    assert out["basis"] == "base_amount"


def test_la_serie_est_bornee_a_douze_mois(server_module):
    vieux = [{"_id": _mois(n), "revenue": 10.0, "commission": 1.0} for n in range(0, 30)]
    _brancher(server_module, valide=vieux, annule=[])

    out = asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))

    assert len(out["series"]) == 12
    assert out["series"][-1]["month"] == _mois(0)
    assert out["series"][0]["month"] == _mois(11)


def test_sans_aucune_ligne_la_serie_est_vide(server_module):
    _brancher(server_module, valide=[], annule=[])

    out = asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))

    assert out["series"] == []


def test_une_agregation_en_panne_ne_vide_pas_le_tableau_de_bord(server_module):
    class Referrals:
        def aggregate(self, pipeline):
            raise RuntimeError("mongo indisponible")

    server_module.db = SimpleNamespace(affiliate_referrals=Referrals())

    out = asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))

    assert out == {"series": [], "basis": "base_amount"}


def test_le_regroupement_se_fait_dans_la_base(server_module):
    # La correction perd tout son sens si l'agregation repasse un jour en
    # boucle Python : c'est le transfert ligne a ligne qui coutait cher.
    vu = _brancher(server_module, valide=[], annule=[])
    asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))

    pipeline = vu["pipeline"]
    assert pipeline[0]["$match"]["affiliate_id"] == "a-1"
    assert "$facet" in pipeline[-1]
    facettes = pipeline[-1]["$facet"]
    assert "$group" in facettes["valide"][-1]
    assert "$group" in facettes["annule"][-1]


# ------------------------------------------------ l'identite deja prouvee ---

def test_une_identite_fournie_evite_une_seconde_preuve(server_module):
    # Huit sections rappelaient get_current_affiliate : seize lectures pour
    # reprouver huit fois la meme identite dans la meme requete.
    def refuser(_request):
        raise AssertionError("l'identite etait deja prouvee")

    server_module.get_current_affiliate = refuser
    _brancher(server_module, valide=[], annule=[])

    out = asyncio.run(server_module.affiliate_performance(None, aff={"id": "a-1"}))

    assert out["series"] == []


@pytest.mark.parametrize("nom", [
    "affiliate_referrals", "affiliate_payouts", "affiliate_performance",
    "affiliate_customers", "affiliate_insights", "affiliate_clicks",
    "affiliate_clicks_sources", "affiliate_activity",
])
def test_chaque_section_du_tableau_accepte_une_identite_deja_prouvee(server_module, nom):
    import inspect
    signature = inspect.signature(getattr(server_module, nom))
    assert "aff" in signature.parameters, f"{nom} reprouvera l'identite"
    assert signature.parameters["aff"].default is None


def test_le_tableau_de_bord_ne_transporte_plus_la_section_morte(server_module):
    # `const [, setClicksStats]` jetait la valeur des la destructuration :
    # produire cette section coutait une lecture de chaque clic de la periode
    # pour aboutir a trente entiers que personne n'affichait.
    import inspect
    source = inspect.getsource(server_module.affiliate_dashboard)
    assert '_safe("clicks"' not in source
    assert '_safe("clicks_sources"' in source
