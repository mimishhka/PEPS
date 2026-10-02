# -*- coding: utf-8 -*-
"""L'audit d'un lot de paiement : toutes ses commandes, d'un seul coup.

MIREILLE, 02/10/2026 : « je t'avais dit que je voulais que ce soit facile de
tracer quelles sont les commandes payees dans les lots. Donc facile de revoir
ce qui est passe, les commandes annulees, remboursees — tout ce sur quoi je
pourrais me faire poser des questions si un affilie veut que j'audite un
paiement. »

CE QU'IL FALLAIT FAIRE AVANT. Cliquer sur un lot filtrait la liste des
versements ; il fallait ensuite ouvrir CHAQUE versement un par un. Un lot de
trente affilies demandait trente ouvertures, et rien ne totalisait quoi que ce
soit — impossible de repondre a « combien de commandes dans ce paiement, et
combien ont ete remboursees depuis ».

La chaine existait pourtant entiere : le lot stocke ses versements, chaque
versement porte ses commissions, chaque commission porte son numero de
commande. Il n'y avait aucun endroit pour la parcourir.
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
    import server
    return importlib.reload(server)


LOT = {"run_id": "NP-2026-014", "nr": "NP-2026-014", "type": "batch",
       "status": "sent", "count": 2, "total_cad": 345.0,
       "created_at": "2026-10-03T12:00:00+00:00",
       "payouts": ["pay-A", "pay-B"], "affiliates": ["LOLA10", "PAUL20"]}

VERSEMENTS = [
    {"id": "pay-A", "run_id": "NP-2026-014", "affiliate_code": "LOLA10",
     "amount_cad": 200.0, "amount": 146.0, "currency": "usdt",
     "status": "paid_manual", "reference": "0xaaa",
     "paid_at": "2026-10-03T14:00:00+00:00", "period": "2026-10"},
    {"id": "pay-B", "run_id": "NP-2026-014", "affiliate_code": "PAUL20",
     "amount_cad": 145.0, "amount": 105.9, "currency": "usdt",
     "status": "paid_manual", "reference": "0xbbb",
     "paid_at": "2026-10-03T14:00:00+00:00", "period": "2026-10"},
    # Un versement d'un AUTRE lot : il ne doit jamais apparaitre.
    {"id": "pay-Z", "run_id": "NP-2026-013", "affiliate_code": "ZOE30",
     "amount_cad": 999.0, "status": "paid", "period": "2026-09"},
]

COMMISSIONS = [
    {"id": "r-1", "payout_id": "pay-A", "affiliate_code": "LOLA10",
     "order_number": "FN-1001", "base_amount": 1000.0, "commission_amount": 120.0,
     "status": "paid", "approved_at": "2026-09-05T12:00:00+00:00",
     "created_at": "2026-09-01T12:00:00+00:00"},
    {"id": "r-2", "payout_id": "pay-A", "affiliate_code": "LOLA10",
     "order_number": "FN-1002", "base_amount": 666.67, "commission_amount": 80.0,
     "status": "paid", "approved_at": "2026-09-12T12:00:00+00:00",
     "created_at": "2026-09-08T12:00:00+00:00"},
    # LA LIGNE QUI COMPTE POUR UN AUDIT : payee, puis la commande a ete
    # remboursee APRES que l'argent soit parti. La creance est inscrite.
    {"id": "r-3", "payout_id": "pay-B", "affiliate_code": "PAUL20",
     "order_number": "FN-1003", "base_amount": 1208.33, "commission_amount": 145.0,
     "status": "reversed", "approved_at": "2026-09-20T12:00:00+00:00",
     "created_at": "2026-09-15T12:00:00+00:00",
     "reversed_at": "2026-10-28T09:00:00+00:00",
     "reversed_after_payout": True,
     "clawback_pending": True, "clawback_amount": 145.0},
    # Une commission d'un autre lot : exclue.
    {"id": "r-9", "payout_id": "pay-Z", "affiliate_code": "ZOE30",
     "order_number": "FN-9999", "base_amount": 100.0, "commission_amount": 12.0,
     "status": "paid", "created_at": "2026-08-01T12:00:00+00:00"},
]


class Curseur:
    def __init__(self, lignes, projection=None):
        self.lignes = lignes
        self.projection = projection or {}
        self._skip = 0
        self._limit = None

    def sort(self, *_a):
        return self

    def skip(self, n):
        self._skip = n
        return self

    def limit(self, n):
        self._limit = n
        return self

    async def to_list(self, _n):
        gardes = [k for k, v in self.projection.items() if v == 1 and k != "_id"]
        lignes = self.lignes[self._skip:]
        if self._limit is not None:
            lignes = lignes[:self._limit]
        if not gardes:
            return [dict(l) for l in lignes]
        return [{k: l[k] for k in gardes if k in l} for l in lignes]


def _correspond(doc, filtre):
    for cle, attendu in filtre.items():
        valeur = doc.get(cle)
        if isinstance(attendu, dict) and "$in" in attendu:
            if valeur not in attendu["$in"]:
                return False
        elif valeur != attendu:
            return False
    return True


class Collection:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, filtre, _p=None):
        for d in self.docs:
            if _correspond(d, filtre):
                return dict(d)
        return None

    def find(self, filtre, projection=None):
        return Curseur([d for d in self.docs if _correspond(d, filtre)], projection)

    async def count_documents(self, filtre):
        return len([d for d in self.docs if _correspond(d, filtre)])

    def aggregate(self, pipeline):
        # Le resume : $match puis $group avec des $cond. On l'execute pour de
        # vrai — un double qui rendrait les totaux attendus ne prouverait rien.
        lignes = [d for d in self.docs if _correspond(d, pipeline[0]["$match"])]
        g = pipeline[1]["$group"]
        acc = {"_id": None}
        for champ, op in g.items():
            if champ == "_id":
                continue
            total = 0
            for d in lignes:
                total += _somme(op["$sum"], d)
            acc[champ] = total

        async def to_list(_n):
            return [acc]
        return SimpleNamespace(to_list=to_list)


def _somme(expr, doc):
    if expr == 1:
        return 1
    if isinstance(expr, dict) and "$cond" in expr:
        cond, alors, sinon = expr["$cond"]
        return _somme(alors, doc) if _val(cond, doc) else _somme(sinon, doc)
    if isinstance(expr, dict) and "$ifNull" in expr:
        a, b = expr["$ifNull"]
        v = _val(a, doc)
        return v if v is not None else b
    return expr


def _val(expr, doc):
    if isinstance(expr, str) and expr.startswith("$"):
        return doc.get(expr[1:])
    if isinstance(expr, dict) and "$eq" in expr:
        a, b = expr["$eq"]
        return _val(a, doc) == _val(b, doc)
    return expr


def _brancher(server, lot=LOT, versements=None, commissions=None):
    server.db = SimpleNamespace(
        affiliate_payment_runs=Collection([lot] if lot else []),
        affiliate_payouts=Collection(
            VERSEMENTS if versements is None else versements),
        affiliate_referrals=Collection(
            COMMISSIONS if commissions is None else commissions),
    )


def _auditer(server, **kw):
    return asyncio.run(server.admin_affiliate_run_detail(
        "NP-2026-014", admin={"email": "ops@example.com"}, **kw))


# ===========================================================================
# CE QUE L'AUDIT DOIT MONTRER
# ===========================================================================

def test_LE_CAS_DE_MIREILLE_toutes_les_commandes_du_lot_d_un_seul_coup(server_module):
    """Sans ouvrir chaque versement un par un."""
    _brancher(server_module)
    audit = _auditer(server_module)

    numeros = {l["order_number"] for l in audit["lines"]}
    assert numeros == {"FN-1001", "FN-1002", "FN-1003"}
    # Deux affilies, un seul ecran.
    assert {l["affiliate_code"] for l in audit["lines"]} == {"LOLA10", "PAUL20"}


def test_LA_COMMANDE_REMBOURSEE_est_la_avec_tout_ce_qu_il_faut(server_module):
    """« Les commandes annulees, remboursees — tout ce sur quoi je pourrais me
    faire poser des questions. »

    Une commission reprise garde son `payout_id` : la ligne est encore
    rattachee au versement, avec sa date de reprise et, parce que l'argent
    etait deja parti, la creance correspondante.
    """
    _brancher(server_module)
    audit = _auditer(server_module)

    reprise = next(l for l in audit["lines"] if l["order_number"] == "FN-1003")
    assert reprise["status"] == "reversed"
    assert reprise["reversed_at"].startswith("2026-10-28")
    assert reprise["reversed_after_payout"] is True
    assert reprise["clawback_pending"] is True
    assert reprise["clawback_amount"] == 145.0


def test_LES_TOTAUX_REPONDENT_AUX_QUESTIONS_QU_ON_POSE(server_module):
    """Combien de commandes, combien de commission, combien remboursees
    depuis, et combien reste-t-il a recuperer."""
    _brancher(server_module)
    t = _auditer(server_module)["totaux"]

    assert t["commandes"] == 3
    assert t["commission"] == 345.0
    assert t["reprises"] == 1
    assert t["commission_reprise"] == 145.0
    # La distinction qui compte : repris APRES que l'argent soit parti.
    assert t["reprises_apres_versement"] == 1
    assert t["creance"] == 145.0


def test_les_totaux_portent_sur_TOUT_LE_LOT_et_non_sur_la_page(server_module):
    """Un total calcule sur la page affichee repondrait a une question que
    personne ne pose."""
    _brancher(server_module)
    page = _auditer(server_module, page_size=1)

    assert len(page["lines"]) == 1
    assert page["lines_count"] == 3          # le nombre reel
    assert page["totaux"]["commandes"] == 3  # et les totaux aussi
    assert page["totaux"]["commission"] == 345.0


def test_les_versements_du_lot_sont_la_avec_leur_reference(server_module):
    _brancher(server_module)
    audit = _auditer(server_module)

    codes = {v["affiliate_code"] for v in audit["payouts"]}
    assert codes == {"LOLA10", "PAUL20"}
    assert {v["reference"] for v in audit["payouts"]} == {"0xaaa", "0xbbb"}


def test_UN_AUTRE_LOT_NE_DEBORDE_JAMAIS(server_module):
    """Le versement et la commission de `NP-2026-013` ne doivent apparaitre
    nulle part : un audit qui melange deux lots ne vaut rien."""
    _brancher(server_module)
    audit = _auditer(server_module)

    assert "FN-9999" not in {l["order_number"] for l in audit["lines"]}
    assert "ZOE30" not in {v["affiliate_code"] for v in audit["payouts"]}
    assert audit["totaux"]["commandes"] == 3


def test_la_pagination_parcourt_sans_rien_perdre(server_module):
    _brancher(server_module)
    vus = []
    for p in (1, 2, 3):
        vus += [l["order_number"] for l in _auditer(server_module, page=p, page_size=1)["lines"]]

    assert sorted(vus) == ["FN-1001", "FN-1002", "FN-1003"]


def test_un_lot_inconnu_rend_404(server_module):
    from fastapi import HTTPException
    _brancher(server_module, lot=None)

    with pytest.raises(HTTPException) as leve:
        _auditer(server_module)
    assert leve.value.status_code == 404


def test_un_lot_SANS_versement_ne_leve_pas(server_module):
    """Cas limite reel : un lot cree puis vide. L'ecran doit s'ouvrir et dire
    qu'il n'y a rien, pas tomber."""
    _brancher(server_module, versements=[])
    audit = _auditer(server_module)

    assert audit["lines"] == []
    assert audit["lines_count"] == 0
    assert audit["totaux"]["commandes"] == 0
