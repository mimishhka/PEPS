# -*- coding: utf-8 -*-
"""La fiche d'un affilie ne montre jamais plus de dix lignes par vue.

MIREILLE, 02/10/2026 : « historique des donnees dans le dossier affilie, pas
plus que dix affiche, donc les vues doivent etre paginees doivent avoir des
filtres ».

C'est le lot suivant d'une pagination commencee au lot precedent : la page
existait cote serveur, mais l'ecran ne savait pas la demander, la taille par
defaut restait 500, et la liste des versements etait plafonnee a 200 sans le
dire. Un plafond muet est pire qu'une lenteur — l'ecran a l'air juste, et il
ment.

Les aides lourdes (_affiliate_compute_metrics, la serie mensuelle, le dernier
avis, le cycle) sont epinglees : elles sont testees dans leurs propres
fichiers, et ce qui est teste ici, c'est la PAGINATION, les FILTRES et les
FACETTES.
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


AFF = {"id": "aff-1", "code": "LOLA10", "status": "active"}


def _lignes(n, statut="paid", prefix="FN-10"):
    return [{"id": "%s-%02d" % (prefix, i),
             "affiliate_id": "aff-1",
             "order_number": "FN-%02d" % i,
             "status": statut,
             "commission_amount": 10.0,
             "payout_id": "pay-%02d" % i,
             "created_at": "2026-09-%02dT12:00:00+00:00" % (i % 28 + 1)}
            for i in range(1, n + 1)]


def _versements(n, statut="paid_manual"):
    return [{"id": "pay-%02d" % i, "affiliate_id": "aff-1",
             "period": "2026-09", "status": statut,
             "amount_cad": 100.0, "created_at": "2026-09-%02dT12:00:00+00:00" % (i % 28 + 1)}
            for i in range(1, n + 1)]


class _Referrals:
    def __init__(self, docs):
        self.docs = docs
        self.filtres = []

    def _correspond(self, d, f):
        for cle, attendu in f.items():
            if cle == "affiliate_id":
                if d.get(cle) != attendu:
                    return False
            elif isinstance(attendu, dict):
                return d.get(cle) == attendu.get(cle) if False else True
            elif d.get(cle) != attendu:
                return False
        return True

    async def count_documents(self, f):
        return len([d for d in self.docs if d.get("affiliate_id") == f.get("affiliate_id")
                    and (not f.get("status") or d.get("status") == f["status"])])

    def find(self, f, _proj=None):
        gardes = [d for d in self.docs
                  if d.get("affiliate_id") == f.get("affiliate_id")
                  and (not f.get("status") or d.get("status") == f["status"])]

        class C:
            def __init__(self, lignes):
                self.lignes = lignes
                self.debut = 0
                self.maxi = None

            def sort(self, *_a):
                self.lignes = sorted(self.lignes,
                                     key=lambda d: d.get("created_at") or "",
                                     reverse=True)
                return self

            def skip(self, n):
                self.debut = n
                return self

            def limit(self, n):
                self.maxi = n
                return self

            async def to_list(self, n):
                fin = self.maxi if self.maxi is not None else n
                return [dict(d) for d in self.lignes[self.debut:self.debut + fin]]
        return C(gardes)

    def aggregate(self, pipeline):
        # LA FACETTE : compte par statut, sur toute la collection.
        n = {"tous": 0}
        for d in self.docs:
            if d.get("affiliate_id") != "aff-1":
                continue
            n["tous"] += 1
            n[d.get("status")] = n.get(d.get("status"), 0) + 1

        async def to_list(_x):
            return [{"_id": s, "n": v} for s, v in n.items() if s != "tous"]
        return SimpleNamespace(to_list=to_list)


class _Payouts:
    def __init__(self, docs):
        self.docs = docs

    def _correspond(self, d, f):
        if "id" in f:
            att = f["id"]
            if isinstance(att, dict) and "$in" in att:
                if d.get("id") not in att["$in"]:
                    return False
            elif d.get("id") != att:
                return False
        # L'appartenance n'est exigee QUE si le filtre la porte : la requete
        # d'enrichissement `{"id": {"$in": [...]}}` n'en a pas, et exiger
        # l'affilie la ferait echouer.
        if "affiliate_id" in f and d.get("affiliate_id") != f["affiliate_id"]:
            return False
        statut = f.get("status")
        if not statut:
            return True
        if "$in" in statut:
            return d.get("status") in statut["$in"]
        if "$nin" in statut:
            return d.get("status") not in statut["$nin"]
        return d.get("status") == statut

    async def count_documents(self, f):
        return len([d for d in self.docs if self._correspond(d, f)])

    def find(self, f, _proj=None):
        gardes = [d for d in self.docs if self._correspond(d, f)]

        class C:
            def __init__(self, lignes):
                self.lignes = lignes
                self.debut = 0
                self.maxi = None

            def sort(self, *_a):
                self.lignes = sorted(self.lignes,
                                     key=lambda d: d.get("created_at") or "",
                                     reverse=True)
                return self

            def skip(self, n):
                self.debut = n
                return self

            def limit(self, n):
                self.maxi = n
                return self

            async def to_list(self, n):
                fin = self.maxi if self.maxi is not None else n
                return [dict(d) for d in self.lignes[self.debut:self.debut + fin]]
        return C(gardes)

    def aggregate(self, pipeline):
        payes = len([d for d in self.docs if d.get("status") in ("paid", "paid_manual")])
        echec = len([d for d in self.docs if d.get("status") == "failed"])

        async def to_list(_x):
            return [{"payes": payes, "echec": echec, "tout": len(self.docs)}]
        return SimpleNamespace(to_list=to_list)


def _brancher(server, monkeypatch, referrals=None, payouts=None):
    refs = referrals if referrals is not None else _lignes(25)
    pays = payouts if payouts is not None else _versements(25)
    server.db = SimpleNamespace(
        affiliates=SimpleNamespace(),
        affiliate_referrals=_Referrals(refs),
        affiliate_payouts=_Payouts(pays),
    )

    async def _affilie(_id, _proj=None):
        return AFF
    server.db.affiliates.find_one = _affilie

    async def _metriques(_id, avec_mensuel=False):
        return {"tier": "bronze", "commission_rate": 0.12}
    monkeypatch.setattr(server, "_affiliate_compute_metrics", _metriques,
                        raising=False)

    async def _serie(_id, nb_mois=12):
        return []
    monkeypatch.setattr(server, "_serie_mensuelle_agregee", _serie,
                        raising=False)

    async def _avis(_id):
        return None
    monkeypatch.setattr(server, "_dernier_avis", _avis, raising=False)

    async def _cycle(_id):
        return {}
    monkeypatch.setattr(server, "_commissions_par_cycle", _cycle, raising=False)
    return server.db


def _detail(server, monkeypatch, **kw):
    _brancher(server, monkeypatch,
              referrals=kw.pop("referrals", None),
              payouts=kw.pop("payouts", None))
    return asyncio.run(server.admin_affiliate_detail("aff-1", **kw))


# ===========================================================================
# DIX LIGNES, PAS PLUS
# ===========================================================================

def test_DIX_LIGNES_PAR_PAGE_PAS_PLUS(server_module, monkeypatch):
    d = _detail(server_module, monkeypatch)

    assert len(d["referrals"]) == 10
    assert d["referrals_total"] == 25
    assert d["referrals_page_size"] == 10


def test_les_versements_aussi(server_module, monkeypatch):
    d = _detail(server_module, monkeypatch)

    assert len(d["payouts"]) == 10
    assert d["payouts_total"] == 25


def test_une_page_au_dela_rend_vide_sans_lever(server_module, monkeypatch):
    d = _detail(server_module, monkeypatch, ref_page=99)

    assert d["referrals"] == []
    assert d["referrals_total"] == 25


# ===========================================================================
# LE FILTRE EST SERVEUR
# ===========================================================================

def test_le_filtre_REPRISES_ne_rend_que_les_remboursees(server_module, monkeypatch):
    lignes = _lignes(5, "paid") + _lignes(5, "reversed", prefix="FN-20")
    d = _detail(server_module, monkeypatch, referrals=lignes,
                ref_filtre="reprises")

    assert len(d["referrals"]) == 5
    assert all(r["status"] == "reversed" for r in d["referrals"])
    assert d["referrals_total"] == 5


def test_le_filtre_ECHEc_ne_rend_que_les_versements_echoues(
        server_module, monkeypatch):
    pays = _versements(5) + _versements(5, "failed")
    d = _detail(server_module, monkeypatch, payouts=pays, pay_filtre="echec")

    assert len(d["payouts"]) == 5
    assert all(p["status"] == "failed" for p in d["payouts"])
    assert d["payouts_total"] == 5


# ===========================================================================
# LES FACETTES VALENT POUR LA COLLECTION, PAS LA PAGE
# ===========================================================================

def test_LES_FACETTES_COMPTENT_TOUT_PAS_LA_PAGE(server_module, monkeypatch):
    """Une puce qui annonce « Reprises · 1 » parce que la page en contient
    une, alors qu'il y en a quinze ailleurs, c'est un compteur qui ment."""
    lignes = _lignes(10, "paid") + _lignes(15, "reversed", prefix="FN-20")
    d = _detail(server_module, monkeypatch, referrals=lignes)

    assert d["referrals_facettes"]["tous"] == 25
    assert d["referrals_facettes"]["paid"] == 10
    assert d["referrals_facettes"]["reprises"] == 15
    # et la page, elle, n'en montre que dix
    assert len(d["referrals"]) == 10


def test_les_facettes_des_versements_separent_payes_et_echecs(
        server_module, monkeypatch):
    pays = _versements(3) + _versements(4, "failed") + _versements(2, "ready")
    d = _detail(server_module, monkeypatch, payouts=pays)

    assert d["payouts_facettes"]["tous"] == 9
    assert d["payouts_facettes"]["payes"] == 3
    assert d["payouts_facettes"]["echec"] == 4
    assert d["payouts_facettes"]["attente"] == 2


# ===========================================================================
# LA PREUVE DU VERSEMENT NE DEPEND PAS DE LA PAGE DES VERSEMENTS
# ===========================================================================

def test_payout_paid_at_est_joint_a_la_ligne_meme_hors_de_la_page(
        server_module, monkeypatch):
    """L'ecran cherchait le versement de chaque commission dans la LISTE des
    versements. Paginee a dix, la liste ne contient plus le versement d'une
    commission ancienne — et le lien « verse le » disparaissait, pas parce que
    la commission n'a pas ete payee, mais parce que son versement n'etait pas
    sur la page affichee."""
    refs = [{"id": "r-1", "affiliate_id": "aff-1", "order_number": "FN-1",
             "status": "paid", "commission_amount": 10.0,
             "payout_id": "pay-vieux", "created_at": "2026-09-01T12:00:00+00:00"}]
    pays = _versements(20)  # pay-vieux n'y est PAS
    pays.append({"id": "pay-vieux", "affiliate_id": "aff-1",
                 "period": "2026-08", "status": "paid_manual",
                 "paid_at": "2026-09-05T12:00:00+00:00",
                 "created_at": "2026-08-01T12:00:00+00:00"})
    d = _detail(server_module, monkeypatch, referrals=refs, payouts=pays)

    assert d["referrals"][0]["payout_paid_at"] == "2026-09-05T12:00:00+00:00"
