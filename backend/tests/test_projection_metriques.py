# -*- coding: utf-8 -*-
"""Un `$group` ne peut pas lire ce qu'un `$project` n'a pas laisse passer.

TROUVE LE 02/10/2026, en interrogeant le compte LOLA10 pendant que Mireille le
regardait : son `payout_cycle` annoncait une dette de 137,71 $, et ses
metriques repondaient 0 $ pour la MEME dette. Deux surfaces, deux reponses.

La cause n'etait pas dans la regle, elle etait dans le tuyau. Les
accumulateurs `reprise_apres_versement`, `creance` et `creance_lignes` ont ete
ajoutes au `$group` sans que `clawback_pending`, `clawback_amount` et
`reversed_after_payout` soient projetes. Ils evaluaient donc contre du vide :

  - `reprise_apres_versement` valait TOUJOURS zero ;
  - `creance` et `creance_lignes` aussi ;
  - `reprise_avant_versement` absorbait toutes les reprises, y compris celles
    dont l'argent etait deja parti.

Les blocs `depuis-creance` (tableau de bord) et `fiche-creance`
(administration) sont conditionnes a `creance > 0`. Ils etaient morts en
silence. Seul le cycle de versement fonctionnait, parce qu'il interroge la
collection directement au lieu de passer par ce pipeline.

AUCUN TEST NE POUVAIT LE VOIR : ils nourrissaient tous la SORTIE des
metriques, jamais le pipeline. Celui-ci lit le pipeline lui-meme, et vaut pour
tout accumulateur qu'on ajoutera demain.
"""
import asyncio
import importlib
import os
import re
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def affiliate_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("ORDER_CUTOFF_TZ", "America/Toronto")
    import server  # noqa: F401  (le module de service lit `server` comme `s`)
    import services.affiliate as af
    return importlib.reload(af)


class _Affilies:
    """Le dossier de l'affilie. `_affiliate_compute_metrics` le lit pour le
    taux convenu et la date d'activation ; rien ici ne depend de son contenu."""

    async def find_one(self, _filtre, _projection=None):
        return {"id": "aff-1", "code": "LOLA10", "status": "active"}


def _capturer(module, lignes=None):
    """Rend les pipelines passes a `aggregate`, et nourrit le resultat."""
    vus = []

    class Referrals:
        def aggregate(self, pipeline):
            vus.append(pipeline)

            async def to_list(_n):
                return lignes or []
            return SimpleNamespace(to_list=to_list)

        def find(self, *_a, **_k):
            class C:
                def sort(self, *_a):
                    return self

                async def to_list(self, _n):
                    return []
            return C()

    module.s.db = SimpleNamespace(affiliate_referrals=Referrals(),
                                  affiliates=_Affilies())
    asyncio.run(module._affiliate_compute_metrics("aff-1"))
    return vus


def _champs_lus(expression, trouves):
    """Tout `"$nom"` lu dans une expression d'agregation, a plat."""
    if isinstance(expression, str):
        if expression.startswith("$") and not expression.startswith("$$"):
            nom = expression[1:].split(".")[0]
            # Les operateurs (`$sum`, `$cond`…) apparaissent en CLE, jamais en
            # valeur : ce qu'on attrape ici est toujours un nom de champ.
            if nom:
                trouves.add(nom)
    elif isinstance(expression, dict):
        for cle, valeur in expression.items():
            if not cle.startswith("$"):
                _champs_lus(cle, trouves)
            _champs_lus(valeur, trouves)
    elif isinstance(expression, list):
        for element in expression:
            _champs_lus(element, trouves)


# ===========================================================================
# LA REGLE
# ===========================================================================

def test_LE_GROUP_NE_LIT_QUE_CE_QUE_LE_PROJECT_LAISSE_PASSER(affiliate_module):
    """Le test qui manquait. Il vaut pour tout accumulateur a venir."""
    pipelines = _capturer(affiliate_module)
    assert pipelines, "aucun pipeline capture"

    manquants = []
    for pipeline in pipelines:
        projette = set()
        for etape in pipeline:
            if "$project" in etape:
                projette |= {c for c in etape["$project"] if not c.startswith("$")}
            elif "$group" in etape:
                lus = set()
                _champs_lus({k: v for k, v in etape["$group"].items() if k != "_id"},
                            lus)
                manquants += sorted(lus - projette - {"_id"})
    assert not manquants, (
        "ces champs sont lus par le $group et jamais projetes — ils valent "
        "donc VIDE, en silence : " + ", ".join(sorted(set(manquants))))


def test_LES_TROIS_CHAMPS_DE_LA_CREANCE_SONT_PROJETES(affiliate_module):
    """Le cas precis, nomme, pour que la regression se lise d'un coup d'oeil."""
    pipelines = _capturer(affiliate_module)
    projette = set()
    for pipeline in pipelines:
        for etape in pipeline:
            if "$project" in etape:
                projette |= set(etape["$project"])

    for champ in ("clawback_pending", "clawback_amount", "reversed_after_payout"):
        assert champ in projette, champ


def test_et_le_GROUP_les_utilise_vraiment(affiliate_module):
    """Projeter sans grouper serait aussi inutile que l'inverse."""
    pipelines = _capturer(affiliate_module)
    source = ""
    for pipeline in pipelines:
        for etape in pipeline:
            if "$group" in etape:
                source += repr(etape["$group"])

    assert "clawback_pending" in source
    assert "reversed_after_payout" in source


# ===========================================================================
# LA REGLE, SUR DES CHIFFRES
# ===========================================================================

def test_une_reprise_APRES_versement_ne_tombe_plus_dans_celles_d_avant(
        affiliate_module):
    """Les chiffres de LOLA10, tels que la base les porte.

    194,40 $ verses puis rembourses, dont 56,69 $ deja repris : il reste
    137,71 $. Et 32,75 $ annules AVANT tout versement, qui ne doivent rien.
    """
    # Ce que le `$group` rendrait avec les champs bien projetes.
    totaux = {
        "cumulative": 3532.43, "rolling12": 3060.0, "quarter": 0.0,
        "pending_commission": 0.0, "approved_commission": 56.69,
        "paid_commission": 306.0, "reversed_commission": 227.15,
        "excluded_commission": 0.0,
        "reprise_avant_versement": 32.75,
        "reprise_apres_versement": 194.40,
        "creance": 137.71, "creance_lignes": 1,
        "mois_sortant": 0.0, "mois_courant": 472.43,
        "mois_courant_commandes": 1, "mois_courant_commission": 56.69,
    }
    module = affiliate_module

    class Referrals:
        def aggregate(self, _pipeline):
            async def to_list(_n):
                return [totaux]
            return SimpleNamespace(to_list=to_list)

        def find(self, *_a, **_k):
            class C:
                def sort(self, *_a):
                    return self

                async def to_list(self, _n):
                    return []
            return C()

    module.s.db = SimpleNamespace(affiliate_referrals=Referrals(),
                                  affiliates=_Affilies())
    m = asyncio.run(module._affiliate_compute_metrics("aff-1"))

    # 227,15 n'est PAS la dette : c'est le total annule.
    assert m["reversed_commission"] == 227.15
    # 32,75 n'ont jamais quitte le compte : rien a reprendre.
    assert m["reprise_avant_versement"] == 32.75
    # 194,40 etaient partis. C'est la dette d'origine.
    assert m["reprise_apres_versement"] == 194.40
    # 56,69 ont deja ete repris ; il reste 137,71.
    assert m["creance"] == 137.71
    assert m["creance_lignes"] == 1


def test_sans_aucune_reprise_les_quatre_chiffres_valent_zero(affiliate_module):
    """Le cas courant ne doit rien gagner de cette correction."""
    module = affiliate_module
    _capturer(module)  # aucune ligne : le $group ne rend rien
    m = asyncio.run(module._affiliate_compute_metrics("aff-1"))

    assert m["reprise_avant_versement"] == 0
    assert m["reprise_apres_versement"] == 0
    assert m["creance"] == 0
    assert m["creance_lignes"] == 0
