# -*- coding: utf-8 -*-
"""Le detail d'un versement, cote ADMINISTRATION.

Sa docstring dit « c'est la piece de preuve pour un auditeur ». Elle n'avait
aucun test. L'ecran de l'affilie en avait dix-huit.

C'est le genre d'ecart qui ne se voit pas : les deux endpoints rendent la meme
forme, on en teste un, et l'autre derive. Il a derive -- quand le versement est
devenu NET de la creance, l'ecart brut `verse - lignes` s'est mis a valoir
-creance sur tout versement juste, et cet ecran l'annoncait comme une
divergence a eclaircir.

MIREILLE, 02/10/2026 : « il faut penser a toutes les question que pourrais me
poser un affiliee si il demande un audit de son compte, de ses paiement, du
detail complet de chaque paiment ». La premiere question d'un audit sur un
versement de 102,50 $ quand les commissions du mois font 142,50 $, c'est
« pourquoi 102,50 ». La reponse doit tenir dans l'ecran.
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


ADMIN = {"id": "adm-1", "email": "admin@example.com"}

AFFILIE = {"id": "aff-1", "email": "lola@example.com", "name": "Lola",
           "code": "LOLA10", "tier": "argent"}

VERSEMENT = {
    "id": "pay-1", "affiliate_id": "aff-1", "period": "2026-10",
    "amount_cad": 142.50, "amount": 104.1, "currency": "usdt",
    "status": "paid_manual", "reference": "0xabc",
    "paid_at": "2026-10-03T14:00:00+00:00",
    "referral_ids": ["r-1", "r-2"],
}

LIGNES = [
    {"id": "r-1", "payout_id": "pay-1", "affiliate_id": "aff-1",
     "order_number": "FN-1001", "order_id": "ord-1", "base_amount": 500.0,
     "commission_amount": 60.0, "order_total": 575.0, "status": "paid",
     "approved_at": "2026-08-20T12:00:00+00:00",
     "created_at": "2026-08-13T12:00:00+00:00"},
    {"id": "r-2", "payout_id": "pay-1", "affiliate_id": "aff-1",
     "order_number": "FN-1002", "order_id": "ord-2", "base_amount": 687.5,
     "commission_amount": 82.5, "order_total": 790.0, "status": "reversed",
     "approved_at": "2026-09-05T12:00:00+00:00",
     "created_at": "2026-08-29T12:00:00+00:00",
     "reversed_at": "2026-10-18T09:00:00+00:00",
     "reversed_after_payout": True, "clawback_amount": 82.5,
     "clawback_pending": True},
]


class Curseur:
    def __init__(self, lignes, projection=None):
        self.lignes = lignes
        self.projection = projection or {}

    def sort(self, *_a):
        return self

    async def to_list(self, _n):
        garder = [k for k, v in self.projection.items() if v == 1 and k != "_id"]
        if not garder:
            return [dict(l) for l in self.lignes]
        return [{k: l[k] for k in garder if k in l} for l in self.lignes]


class Collection:
    def __init__(self, docs):
        self.docs = docs
        self.filtres = []

    async def find_one(self, filtre, _projection=None, sort=None):
        self.filtres.append(filtre)
        trouves = [d for d in self.docs
                   if all(d.get(k) == v for k, v in filtre.items())]
        return dict(trouves[0]) if trouves else None

    def find(self, filtre, projection=None):
        self.filtres.append(filtre)
        trouves = [d for d in self.docs
                   if all(d.get(k) == v for k, v in filtre.items())]
        return Curseur(trouves, projection)

    def aggregate(self, pipeline):
        """Sert `_periodes_couvertes` : groupe le mois d'approbation."""
        ids = pipeline[0]["$match"]["payout_id"]["$in"]
        groupes = {}
        for l in self.docs:
            if l.get("payout_id") not in ids:
                continue
            mois = str(l.get("approved_at") or l.get("created_at") or "")[:7]
            if len(mois) == 7:
                groupes.setdefault(l["payout_id"], set()).add(mois)
        lignes = [{"_id": p, "mois": list(m)} for p, m in groupes.items()]

        async def to_list(_n):
            return lignes
        return SimpleNamespace(to_list=to_list)


def _brancher(server, versements=None, lignes=None):
    server.db = SimpleNamespace(
        affiliate_payouts=Collection(versements if versements is not None
                                     else [VERSEMENT]),
        affiliate_referrals=Collection(lignes if lignes is not None else LIGNES),
        affiliates=Collection([AFFILIE]),
    )
    return server.db


def _detail(server, **kw):
    _brancher(server, **kw)
    return asyncio.run(server.admin_affiliate_payout_detail("pay-1", ADMIN))


# ===========================================================================
# LA RECONSTITUTION
# ===========================================================================

def test_un_versement_inexistant_rend_404(server_module):
    _brancher(server_module, versements=[])
    with pytest.raises(Exception) as e:
        asyncio.run(server_module.admin_affiliate_payout_detail("pay-1", ADMIN))
    assert getattr(e.value, "status_code", None) == 404


def test_le_versement_porte_SES_lignes_et_leur_somme(server_module):
    detail = _detail(server_module)
    assert detail["lines_count"] == 2
    assert detail["lines_sum_cad"] == 142.50
    assert detail["payout_amount_cad"] == 142.50
    assert detail["difference"] == 0.0


def test_l_affilie_est_identifie(server_module):
    """Un versement sans nom ni code n'est pas une piece d'audit : il faut
    savoir DE QUI on parle sans ouvrir un second ecran."""
    detail = _detail(server_module)
    assert detail["affiliate"]["code"] == "LOLA10"
    assert detail["affiliate"]["email"] == "lola@example.com"


def test_LE_FILTRE_PORTE_SUR_payout_id_SEUL(server_module):
    """`referral_ids` est un instantane pose a la creation ; `payout_id` sur la
    commission EST le lien d'argent. Une ligne rattachee au versement mais
    absente de l'instantane doit apparaitre -- sinon les deux ecrans montrent
    deux listes pour un meme versement."""
    orpheline = {"id": "r-3", "payout_id": "pay-1", "affiliate_id": "aff-1",
                 "order_number": "FN-1003", "commission_amount": 10.0,
                 "status": "paid", "created_at": "2026-09-01T12:00:00+00:00"}
    detail = _detail(server_module, lignes=LIGNES + [orpheline])
    assert detail["lines_count"] == 3
    assert "FN-1003" in [l["order_number"] for l in detail["lines"]]


def test_la_commande_remboursee_APRES_versement_est_visible(server_module):
    """Les trois champs de reprise sont projetes : sans eux, la ligne
    s'affichait « reversed » sans dire quand, ni que l'argent etait parti."""
    detail = _detail(server_module)
    ligne = [l for l in detail["lines"] if l["order_number"] == "FN-1002"][0]
    assert ligne["reversed_after_payout"] is True
    assert ligne["clawback_pending"] is True
    assert ligne["clawback_amount"] == 82.5


def test_la_periode_couverte_est_calculee_pas_l_etiquette_de_lot(server_module):
    """`period` est l'etiquette du run -- le mois ou NOUS avons paye. La
    periode couverte se deduit des commissions."""
    detail = _detail(server_module)
    assert detail["payout"]["period"] == "2026-10"
    assert detail["payout"]["periode_couverte"] != "2026-10"


# ===========================================================================
# LA RETENUE N'EST PAS UN ECART
# ===========================================================================

VERSEMENT_AVEC_RETENUE = {
    **VERSEMENT,
    "amount_cad": 102.50,
    "acquis_cad": 142.50,
    "creance_absorbee": 40.0,
    "creance_restante": 0.0,
}


def test_LA_RETENUE_N_EST_PAS_UN_ECART(server_module):
    """Le test qui manquait de ce cote-ci aussi : l'ecran des lots colorait
    cet ecart en ROUGE, sur un versement juste."""
    detail = _detail(server_module, versements=[VERSEMENT_AVEC_RETENUE])

    assert detail["lines_sum_cad"] == 142.50
    assert detail["creance_absorbee"] == 40.0
    assert detail["attendu_cad"] == 102.50
    assert detail["payout_amount_cad"] == 102.50
    assert detail["difference"] == 0.0


def test_un_VRAI_ecart_alerte_encore(server_module):
    detail = _detail(server_module, versements=[
        {**VERSEMENT_AVEC_RETENUE, "amount_cad": 90.0}])
    assert detail["difference"] == -12.50


def test_LES_DEUX_ECRANS_RACONTENT_LA_MEME_HISTOIRE(server_module):
    """Le test qui tient les deux endpoints ensemble.

    Ils rendent la meme forme pour le meme versement. Quand un seul est
    teste, l'autre derive -- c'est exactement ce qui vient de se produire. Ce
    test compare les cinq nombres du rapprochement, pour qu'une correction
    future appliquee d'un seul cote echoue ici.
    """
    aff = {"id": "aff-1", "code": "LOLA10", "email": "lola@example.com"}
    _brancher(server_module, versements=[VERSEMENT_AVEC_RETENUE])
    cote_admin = asyncio.run(
        server_module.admin_affiliate_payout_detail("pay-1", ADMIN))

    _brancher(server_module, versements=[VERSEMENT_AVEC_RETENUE])
    cote_affilie = asyncio.run(
        server_module.affiliate_payout_detail("pay-1", None, aff=aff))

    for cle in ("lines_count", "lines_sum_cad", "creance_absorbee",
                "attendu_cad", "payout_amount_cad", "difference"):
        assert cote_admin[cle] == cote_affilie[cle], cle


def test_sans_retenue_le_rapprochement_est_INCHANGE(server_module):
    detail = _detail(server_module)
    assert detail["creance_absorbee"] == 0.0
    assert detail["attendu_cad"] == detail["lines_sum_cad"]
    assert detail["difference"] == 0.0
