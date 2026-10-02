# -*- coding: utf-8 -*-
"""Le detail d'un versement, cote affilie.

MIREILLE, 01/10/2026 : « il faudrait que l'affilie puisse constater quelles
sont les commandes [que] represente ce paiement, incluant bien sur les
commandes remboursees ou annulees ».

Ce que le modele permettait deja sans qu'on s'en serve : le versement stocke
`referral_ids`, et `affiliate_on_order_reversed` pose le statut et la creance
mais ne vide JAMAIS `payout_id`. Les commandes remboursees apres versement
sont donc encore rattachees — il suffisait de les demander, et de projeter les
trois champs de reprise que la version admin ne projette pas.
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


AFF = {"id": "aff-1", "code": "LOLA10", "email": "lola@example.com"}

VERSEMENT = {
    "id": "pay-1", "affiliate_id": "aff-1", "period": "2026-10",
    "amount_cad": 142.50, "amount": 104.1, "currency": "usdt",
    "status": "paid_manual", "reference": "0xabc",
    "paid_at": "2026-10-03T14:00:00+00:00",
    "referral_ids": ["r-1", "r-2"],
}

LIGNES = [
    {"id": "r-1", "payout_id": "pay-1", "affiliate_id": "aff-1",
     "order_number": "FN-1001", "base_amount": 500.0, "commission_amount": 60.0,
     "order_total": 575.0, "status": "paid",
     "approved_at": "2026-08-20T12:00:00+00:00",
     "created_at": "2026-08-13T12:00:00+00:00"},
    # LA LIGNE QUI COMPTE : payee, puis la commande a ete remboursee.
    {"id": "r-2", "payout_id": "pay-1", "affiliate_id": "aff-1",
     "order_number": "FN-1002", "base_amount": 687.5, "commission_amount": 82.5,
     "order_total": 790.0, "status": "reversed",
     "approved_at": "2026-09-05T12:00:00+00:00",
     "created_at": "2026-08-29T12:00:00+00:00",
     "reversed_at": "2026-10-18T09:00:00+00:00",
     "reversed_after_payout": True, "clawback_amount": 82.5,
     "clawback_pending": True,
     # Jamais expose : l'adresse du client de l'affilie.
     "order_email": "client@example.com"},
]


class Curseur:
    def __init__(self, lignes, projection=None):
        self.lignes = lignes
        self.projection = projection or {}

    def sort(self, *_a):
        return self

    def skip(self, _n):
        return self

    def limit(self, _n):
        return self

    async def to_list(self, _n):
        # On applique la PROJECTION : sans cela, un test ne pourrait pas
        # distinguer un champ exclu d'un champ simplement absent du fixture.
        garder = [k for k, v in self.projection.items() if v == 1 and k != "_id"]
        if not garder:
            return [dict(l) for l in self.lignes]
        return [{k: l[k] for k in garder if k in l} for l in self.lignes]


class Versements:
    def __init__(self, docs):
        self.docs = docs
        self.filtres = []

    async def find_one(self, filtre, _projection=None, sort=None):
        """Applique le filtre ET le tri.

        `sort` sert au choix du DERNIER versement payé. Un double qui
        l'ignorerait rendrait le premier document du fixture, et le test
        passerait quel que soit l'ordre demandé par le code — c'est-à-dire
        sans rien prouver.
        """
        self.filtres.append(filtre)

        def correspond(d):
            for cle, attendu in filtre.items():
                valeur = d.get(cle)
                # `{"$in": [...]}` : le seul opérateur dont ce code se sert.
                if isinstance(attendu, dict) and "$in" in attendu:
                    if valeur not in attendu["$in"]:
                        return False
                elif valeur != attendu:
                    return False
            return True

        trouves = [d for d in self.docs if correspond(d)]
        if sort:
            for cle, sens in reversed(sort):
                trouves.sort(key=lambda d: (d.get(cle) is None, d.get(cle) or ""),
                             reverse=(sens < 0))
        return dict(trouves[0]) if trouves else None

    def find(self, filtre, projection=None):
        trouves = [d for d in self.docs
                   if all(d.get(k) == v for k, v in filtre.items())]
        return Curseur(trouves, projection)

    async def count_documents(self, filtre):
        return len([d for d in self.docs
                    if all(d.get(k) == v for k, v in filtre.items())])


class Commissions:
    def __init__(self, lignes):
        self.lignes = lignes

    def find(self, filtre, projection=None):
        trouves = [l for l in self.lignes
                   if all(l.get(k) == v for k, v in filtre.items())]
        return Curseur(trouves, projection)

    def aggregate(self, pipeline):
        # Sert `_periodes_couvertes`. On reproduit le groupement sur le mois
        # d'approbation, comme le double de test_periode_couverte.py.
        ids = pipeline[0]["$match"]["payout_id"]["$in"]
        groupes = {}
        for l in self.lignes:
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
        affiliate_payouts=Versements(versements if versements is not None
                                     else [VERSEMENT]),
        affiliate_referrals=Commissions(lignes if lignes is not None
                                        else LIGNES),
    )
    return server.db


# ===========================================================================
# LA PROPRIETE
# ===========================================================================

def test_LE_VERSEMENT_D_UN_AUTRE_AFFILIE_REND_404(server_module):
    """ET NON 403.

    Un 403 confirmerait l'existence du versement : on pourrait enumerer les
    versements du programme en lisant les codes de statut. 404 dit la meme
    chose a un proprietaire qu'a un curieux.
    """
    from fastapi import HTTPException
    _brancher(server_module)

    with pytest.raises(HTTPException) as leve:
        asyncio.run(server_module.affiliate_payout_detail(
            "pay-1", None, aff={"id": "aff-AUTRE"}))

    assert leve.value.status_code == 404


def test_la_propriete_est_DANS_LE_FILTRE_pas_verifiee_apres(server_module):
    """Une verification posterieure laisserait le document transiter.

    Le filtre porte `affiliate_id` : la base ne rend jamais le versement d'un
    autre, meme le temps d'une comparaison en Python.
    """
    from fastapi import HTTPException
    db = _brancher(server_module)

    try:
        asyncio.run(server_module.affiliate_payout_detail(
            "pay-1", None, aff={"id": "aff-AUTRE"}))
    except HTTPException:
        pass

    assert db.affiliate_payouts.filtres[0] == {
        "id": "pay-1", "affiliate_id": "aff-AUTRE"}


def test_un_versement_inexistant_rend_404_aussi(server_module):
    from fastapi import HTTPException
    _brancher(server_module)

    with pytest.raises(HTTPException) as leve:
        asyncio.run(server_module.affiliate_payout_detail(
            "pay-INCONNU", None, aff=AFF))

    assert leve.value.status_code == 404


# ===========================================================================
# CE QUE L'AFFILIE VOIT
# ===========================================================================

def test_LE_CAS_DE_MIREILLE_la_commande_remboursee_est_LA(server_module):
    """« incluant bien sur les commandes remboursees ou annulees ».

    Et avec de quoi la reconnaitre : son statut, la date de la reprise, et le
    fait qu'elle a ete reprise APRES le versement — ce qui est une histoire
    differente d'une commission jamais versee.
    """
    _brancher(server_module)

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    par_numero = {l["order_number"]: l for l in detail["lines"]}
    assert set(par_numero) == {"FN-1001", "FN-1002"}

    reprise = par_numero["FN-1002"]
    assert reprise["status"] == "reversed"
    assert reprise["reversed_at"].startswith("2026-10-18")
    assert reprise["reversed_after_payout"] is True
    assert reprise["clawback_pending"] is True


def test_l_adresse_du_client_n_est_JAMAIS_rendue(server_module):
    """Comme dans `/affiliate/referrals`. Une adresse nominative verifiee est
    la matiere premiere d'un hameconnage cible."""
    _brancher(server_module)

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    for ligne in detail["lines"]:
        assert "order_email" not in ligne
        # `order_id` non plus : l'affilie n'a aucun ecran ou l'ouvrir.
        assert "order_id" not in ligne


def test_la_periode_couverte_est_calculee_pas_l_etiquette(server_module):
    """L'etiquette dit « 2026-10 » — le mois du run. Les commissions sont
    d'aout et de septembre. C'est tout le defaut qu'elle a vu."""
    _brancher(server_module)

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    assert detail["payout"]["period"] == "2026-10"          # inchangee en base
    periode = detail["payout"]["periode_couverte"]
    assert periode["debut"] == "2026-08"
    assert periode["fin"] == "2026-09"
    assert periode["multi"] is True


def test_le_total_de_controle_est_rendu(server_module):
    """La piece de preuve : un versement ne s'explique pas par un montant
    isole mais par la somme des commissions qu'il couvre."""
    _brancher(server_module)

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    assert detail["lines_count"] == 2
    assert detail["lines_sum_cad"] == 142.50
    assert detail["payout_amount_cad"] == 142.50
    # Une reprise change le STATUT d'une ligne, jamais son montant : l'ecart
    # doit valoir zero meme avec une commande remboursee dans le lot.
    assert detail["difference"] == 0.0


# ===========================================================================
# LA LISTE
# ===========================================================================

def test_la_periode_couverte_est_attachee_a_la_liste_PLATE(server_module):
    """L'export CSV lit la liste plate. Sans la periode, le fichier que
    l'affilie donne a sa comptabilite porterait le mois ou NOUS avons paye."""
    _brancher(server_module)

    rows = asyncio.run(server_module.affiliate_payouts(None, aff=AFF))

    assert isinstance(rows, list)
    assert rows[0]["periode_couverte"]["debut"] == "2026-08"


def test_et_a_la_liste_PAGINEE(server_module):
    _brancher(server_module)

    page = asyncio.run(server_module.affiliate_payouts(None, page=1, aff=AFF))

    assert page["items"][0]["periode_couverte"]["fin"] == "2026-09"


def test_un_versement_SANS_lignes_porte_None_et_non_un_mois_invente(server_module):
    """Cas legacy. L'ecran dira « indisponible » : c'est honnete, et ca ne
    maquille pas un trou en mois precis."""
    _brancher(server_module, lignes=[])

    rows = asyncio.run(server_module.affiliate_payouts(None, aff=AFF))

    assert rows[0]["periode_couverte"] is None


def test_LE_DERNIER_PAYE_est_cherche_hors_de_la_page(server_module):
    """Mireille veut ce versement en tete de l'onglet.

    Le deduire de la page affichee serait faux des que des releves NON payes
    s'empilent devant : l'ecran annoncerait « aucun paiement » a quelqu'un qui
    a deja ete paye. Ici deux releves non payes sont plus recents, et c'est
    bien le paye qui doit sortir.
    """
    _brancher(server_module, versements=[
        {**VERSEMENT, "id": "pay-3", "status": "ready",
         "paid_at": None, "created_at": "2026-12-01T00:00:00+00:00"},
        {**VERSEMENT, "id": "pay-2", "status": "review",
         "paid_at": None, "created_at": "2026-11-01T00:00:00+00:00"},
        {**VERSEMENT, "id": "pay-1", "status": "paid_manual",
         "paid_at": "2026-10-03T14:00:00+00:00"},
    ])

    page = asyncio.run(server_module.affiliate_payouts(None, page=1, aff=AFF))

    assert page["dernier_paye"]["id"] == "pay-1"
    assert page["dernier_paye"]["periode_couverte"]["debut"] == "2026-08"


def test_entre_deux_verses_c_est_le_plus_recemment_PAYE(server_module):
    # Trie sur `paid_at` : c'est la date du paiement qui ordonne les
    # paiements, pas celle de creation du releve.
    _brancher(server_module, versements=[
        {**VERSEMENT, "id": "vieux", "status": "paid",
         "paid_at": "2026-08-05T10:00:00+00:00",
         "created_at": "2026-12-01T00:00:00+00:00"},
        {**VERSEMENT, "id": "recent", "status": "paid_manual",
         "paid_at": "2026-10-03T14:00:00+00:00",
         "created_at": "2026-01-01T00:00:00+00:00"},
    ])

    page = asyncio.run(server_module.affiliate_payouts(None, page=1, aff=AFF))

    assert page["dernier_paye"]["id"] == "recent"


def test_sans_aucun_versement_paye_le_bloc_n_a_rien_a_montrer(server_module):
    # L'ecran retire alors le bloc : une mauvaise nouvelle en tete de page,
    # alors que le cycle qui vient est juste en dessous.
    _brancher(server_module, versements=[
        {**VERSEMENT, "id": "pay-1", "status": "ready", "paid_at": None},
    ])

    page = asyncio.run(server_module.affiliate_payouts(None, page=1, aff=AFF))

    assert page["dernier_paye"] is None


def test_une_liste_vide_ne_declenche_aucune_requete(server_module):
    # `_attacher_periode_couverte` sort avant la base : rien a grouper.
    _brancher(server_module, versements=[], lignes=[])

    assert asyncio.run(server_module.affiliate_payouts(None, aff=AFF)) == []


# ===========================================================================
# LA RETENUE N'EST PAS UN ECART
#
# Le jour ou le versement est devenu NET de la creance, `amount_cad` s'est mis
# a valoir moins que la somme des lignes du versement -- legitimement. L'ecart
# brut valait alors -creance, et les TROIS ecrans qui le lisent annoncaient
# « le versement et ses lignes ont diverge », dont un en rouge, sur un
# versement parfaitement correct.
#
# Une fausse alarme sur de l'argent coute exactement la confiance qu'elle
# etait censee produire. Ces tests tiennent les deux bouts : la retenue est
# nommee, et l'ecart ne mesure plus que l'inexplique.
# ===========================================================================

VERSEMENT_AVEC_RETENUE = {
    **VERSEMENT,
    # 142,50 de commissions, 40 retenus pour une commande remboursee apres un
    # versement ANTERIEUR : 102,50 sont partis.
    "amount_cad": 102.50,
    "acquis_cad": 142.50,
    "creance_absorbee": 40.0,
    "creance_restante": 0.0,
}


def test_LA_RETENUE_N_EST_PAS_UN_ECART(server_module):
    """Le test qui manquait : sans lui, trois ecrans criaient a tort."""
    _brancher(server_module, versements=[VERSEMENT_AVEC_RETENUE])

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    assert detail["lines_sum_cad"] == 142.50     # ce qui a ete gagne
    assert detail["creance_absorbee"] == 40.0    # ce qui a ete retenu
    assert detail["attendu_cad"] == 102.50       # ce qui devait partir
    assert detail["payout_amount_cad"] == 102.50  # ce qui est parti
    assert detail["difference"] == 0.0            # rien d'inexplique


def test_la_retenue_est_RENDUE_pas_seulement_soustraite(server_module):
    """Un rapprochement ou la deduction est invisible ne se refait pas :
    l'ecran ne peut pas ecrire « 142,50 - 40 = 102,50 » sans le 40."""
    _brancher(server_module, versements=[VERSEMENT_AVEC_RETENUE])

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    assert "creance_absorbee" in detail
    assert "attendu_cad" in detail


def test_un_VRAI_ecart_alerte_encore(server_module):
    """La retenue explique une partie de la difference, pas n'importe
    laquelle. Ce qui reste apres elle n'a aucune explication."""
    # 142,50 de lignes, 40 retenus, donc 102,50 attendus -- mais 90 verses.
    _brancher(server_module, versements=[
        {**VERSEMENT_AVEC_RETENUE, "amount_cad": 90.0}])

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    assert detail["difference"] == -12.50


def test_sans_retenue_le_rapprochement_est_INCHANGE(server_module):
    """La correction ne doit rien changer au cas courant : un versement sans
    creance se rapproche exactement comme avant."""
    _brancher(server_module)

    detail = asyncio.run(server_module.affiliate_payout_detail(
        "pay-1", None, aff=AFF))

    assert detail["creance_absorbee"] == 0.0
    assert detail["attendu_cad"] == detail["lines_sum_cad"]
    assert detail["difference"] == 0.0
