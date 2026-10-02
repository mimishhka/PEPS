# -*- coding: utf-8 -*-
"""Export CSV des commissions d'un affilie, pour la conciliation mensuelle.

Signale le 2026-09-20 : impossible de concilier un mois — les commissions
s'affichaient a l'ecran, sans export ni filtre. Reconciller imposait de
recopier le tableau a la main.
"""
import asyncio
import importlib
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tests.fake_mongo import FakeCollection  # noqa: E402


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


def _affilie(**extra):
    doc = {"id": "aff-1", "name": "Kyro", "code": "FITNES70",
           "email": "kyro@example.com", "status": "active"}
    doc.update(extra)
    return doc


def _commission(order_number, created_at, statut="approved", montant=6.24,
                exclu=None, auto=False):
    return {
        "id": "r-" + order_number,
        "affiliate_id": "aff-1",
        "order_number": order_number,
        "order_email": "cliente@example.com",
        "base_amount": 38.99,
        "commission_amount": montant,
        "status": statut,
        "excluded_reason": exclu,
        "self_order": auto,
        "payout_id": None,
        "created_at": created_at,
    }


class _Base:
    def __init__(self, affilies, referrals):
        self.affiliates = FakeCollection(affilies)
        self.affiliate_referrals = FakeCollection(referrals)


async def _lire_csv(reponse):
    """Une StreamingResponse rend son corps en morceaux : on le recolle."""
    morceaux = [m async for m in reponse.body_iterator]
    corps = "".join(m if isinstance(m, str) else m.decode("utf-8") for m in morceaux)
    return corps


def test_exporte_toutes_les_commissions_sans_mois(server_module, monkeypatch):
    base = _Base(
        affilies=[_affilie()],
        referrals=[
            _commission("FN-SEPT", "2026-09-20T15:36:00", "approved", 6.24),
            # « excluded » DOIT figurer dans une conciliation : c'est l'argent
            # retire, autant que ce qui est du.
            _commission("FN-AOUT", "2026-08-25T16:10:00", "excluded", 0, exclu="fraud"),
        ])
    monkeypatch.setattr(server_module, "db", base)

    reponse = asyncio.run(
        server_module.admin_affiliate_referrals_csv("aff-1", None, {}))
    csv = asyncio.run(_lire_csv(reponse))

    assert "commande" in csv.splitlines()[0]
    assert "FN-SEPT" in csv and "FN-AOUT" in csv
    # Les deux statuts, et le motif : rien n'est masque.
    assert "approved" in csv and "excluded" in csv and "fraud" in csv


def test_le_mois_filtre_la_conciliation(server_module, monkeypatch):
    base = _Base(
        affilies=[_affilie()],
        referrals=[
            _commission("FN-SEPT", "2026-09-20T15:36:00"),
            _commission("FN-AOUT", "2026-08-25T16:10:00"),
            _commission("FN-OCT", "2026-10-01T09:00:00"),
        ])
    monkeypatch.setattr(server_module, "db", base)

    reponse = asyncio.run(
        server_module.admin_affiliate_referrals_csv("aff-1", "2026-09", {}))
    csv = asyncio.run(_lire_csv(reponse))

    assert "FN-SEPT" in csv
    assert "FN-AOUT" not in csv and "FN-OCT" not in csv


def test_un_mois_mal_forme_n_est_pas_un_filtre_aleatoire(server_module, monkeypatch):
    base = _Base(
        affilies=[_affilie()],
        referrals=[
            _commission("FN-SEPT", "2026-09-20T15:36:00"),
            _commission("FN-AOUT", "2026-08-25T16:10:00"),
        ])
    monkeypatch.setattr(server_module, "db", base)

    # « 2026-9 » ou n'importe quoi d'autre : on exporte tout, plutot que de
    # construire une regex boiteuse qui filrerait a moitie.
    reponse = asyncio.run(
        server_module.admin_affiliate_referrals_csv("aff-1", "2026-9", {}))
    csv = asyncio.run(_lire_csv(reponse))
    assert "FN-SEPT" in csv and "FN-AOUT" in csv


def test_un_affilie_inconnu_refuse_net(server_module, monkeypatch):
    monkeypatch.setattr(server_module, "db", _Base(affilies=[], referrals=[]))
    with pytest.raises(HTTPException) as erreur:
        asyncio.run(server_module.admin_affiliate_referrals_csv("fantome", None, {}))
    assert erreur.value.status_code == 404

# ---------------------------------------------------------------------------
# La serie mensuelle de la fiche
# ---------------------------------------------------------------------------

def test_la_serie_mensuelle_repartit_ce_qui_est_du_et_ce_qui_est_verse(server_module):
    """Trois sommes par mois, TOUTES sur le mois gagne.

    ATTENTION AVANT DE « CORRIGER » CE TEST. Il affirmait l'inverse jusqu'au
    01/10/2026 : « payee » etait datee de `paid_at`, le jour du virement. Ce
    n'est plus la regle, et le changement vient d'elle, capture a l'appui.

    MIREILLE, 01/10/2026 : « paid amount not on the good line ». Puis,
    precisant : « ce que je veux voir c'est que la commission du mois a ete
    versee (mais c'est vrai que c'est aussi important d'avoir la date et le
    lot de celui-ci peut etre pas sur ce tableau mais ailleur dans la
    fiche) ».

    Sur sa capture, septembre affichait 500,40 $ de commissions et « 0,00 $
    verse », tandis qu'octobre affichait 500,40 $ verses sans rapport avec ses
    56,69 $ de commissions. Les trois autres colonnes repondent a « qu'a fait
    ce mois-la » ; celle-la repondait a « combien est parti ce mois-la ». Deux
    questions sur une ligne, et la ligne devient illisible.

    La question « combien est parti en octobre » garde sa reponse ailleurs :
    la liste des versements EST une liste de virements avec leur date, et la
    fiche porte la date et le lot de chaque commission.
    """
    lignes = [
        # Gagnee en septembre, le VIREMENT est parti en octobre.
        {"order_number": "FN-1", "base_amount": 100, "commission_amount": 16,
         "status": "paid", "approved_at": "2026-09-10T10:00:00",
         "created_at": "2026-09-09T10:00:00", "paid_at": "2026-10-05T10:00:00"},
        # Gagnee et versee dans le meme mois.
        {"order_number": "FN-2", "base_amount": 50, "commission_amount": 8,
         "status": "paid", "approved_at": "2026-10-02T10:00:00",
         "created_at": "2026-10-01T10:00:00", "paid_at": "2026-10-03T10:00:00"},
        # Exclue : ne compte NI dans le CA, NI dans les commissions.
        {"order_number": "FN-3", "base_amount": 999, "commission_amount": 99,
         "status": "excluded", "excluded_reason": "fraud",
         "created_at": "2026-09-15T10:00:00"},
    ]
    serie = server_module._affiliate_serie_mensuelle(lignes)

    # `paid_at` d'octobre ne cree PAS un mois d'octobre pour la ligne de
    # septembre : un virement n'est pas une activite.
    assert [s["mois"] for s in serie] == ["2026-09", "2026-10"]
    sept, octo = serie

    # SEPTEMBRE : 16 de commission, et cette commission A ETE versee. C'est
    # exactement la phrase qu'elle veut lire sur la ligne de septembre.
    assert sept["ca_valide"] == 100
    assert sept["commissions"] == 16
    assert sept["payee"] == 16

    # OCTOBRE : ses propres 8, et RIEN de septembre. Avant, octobre portait
    # 24 — ses 8 plus les 16 de septembre — sans rapport avec ses commissions.
    assert octo["ca_valide"] == 50
    assert octo["commissions"] == 8
    assert octo["payee"] == 8


def test_LE_VERSE_NE_PEUT_JAMAIS_DEPASSER_LE_GAGNE(server_module):
    """L'invariant qui tient la regle, et que l'ancien test n'avait pas.

    Les quatre colonnes etant desormais sur le MEME axe — le mois gagne —
    « verse » est un sous-ensemble de « commissions » par construction. Si un
    mois affiche plus de verse que de commissions, c'est que les deux axes se
    sont remelanges : c'est le defaut d'origine, et il se verrait ici avant
    d'arriver a l'ecran.
    """
    lignes = [
        {"order_number": "FN-1", "base_amount": 100, "commission_amount": 16,
         "status": "paid", "approved_at": "2026-09-10T10:00:00",
         "created_at": "2026-09-09T10:00:00", "paid_at": "2026-10-05T10:00:00"},
        {"order_number": "FN-2", "base_amount": 50, "commission_amount": 8,
         "status": "paid", "approved_at": "2026-10-02T10:00:00",
         "created_at": "2026-10-01T10:00:00", "paid_at": "2026-10-03T10:00:00"},
        # Approuvee, pas encore versee : elle compte dans « commissions »,
        # pas dans « payee ».
        {"order_number": "FN-3", "base_amount": 200, "commission_amount": 32,
         "status": "approved", "approved_at": "2026-10-20T10:00:00",
         "created_at": "2026-10-19T10:00:00"},
        # Un virement PARTI deux mois plus tard : la tentation de le compter
        # au mois du transfert est exactement ce qu'on interdit.
        {"order_number": "FN-4", "base_amount": 300, "commission_amount": 48,
         "status": "paid", "approved_at": "2026-08-05T10:00:00",
         "created_at": "2026-08-04T10:00:00", "paid_at": "2026-10-05T10:00:00"},
    ]
    serie = server_module._affiliate_serie_mensuelle(lignes)

    for mois in serie:
        assert mois["payee"] <= mois["commissions"], mois["mois"]

    # Et le mois d'aout porte bien SON versement, pas octobre.
    aout = [m for m in serie if m["mois"] == "2026-08"][0]
    octo = [m for m in serie if m["mois"] == "2026-10"][0]
    assert aout["payee"] == 48
    assert octo["payee"] == 8          # ses 8 seulement
    assert octo["commissions"] == 40   # 8 verses + 32 approuves


def test_une_commission_annulee_par_remboursement_est_tracee(server_module):
    """Une commission recuperee disparait du CA et des commissions, mais elle
    doit laisser une trace dans SON mois : sans la colonne des annulations, le
    mois affichait simplement moins, comme si rien ne s'etait passe."""
    lignes = [
        {"order_number": "FN-1", "base_amount": 100, "commission_amount": 16,
         "status": "reversed", "approved_at": "2026-09-10T10:00:00",
         "created_at": "2026-09-09T10:00:00",
         "reversed_at": "2026-09-28T10:00:00"},
    ]
    serie = server_module._affiliate_serie_mensuelle(lignes)
    assert serie[0]["mois"] == "2026-09"
    # Rien n'est du, rien n'est verse...
    assert serie[0]["ca_valide"] == 0 and serie[0]["commissions"] == 0
    # ...mais l'annulation est ecrite.
    assert serie[0]["recuperee"] == 16


def test_la_serie_mensuelle_ne_brode_pas_des_mois_vides(server_module):
    """Seuls les mois avec une activite sont renvoyes : des zeros ajoutes
    donneraient une fausse impression de serie continue."""
    lignes = [{"order_number": "FN-1", "base_amount": 10, "commission_amount": 2,
               "status": "approved", "created_at": "2026-05-04T10:00:00"}]
    serie = server_module._affiliate_serie_mensuelle(lignes)
    assert [s["mois"] for s in serie] == ["2026-05"]
