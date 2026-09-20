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
    """Le retour en arriere demande : trois sommes par mois, chacune a SA date.

    Une commission approuvee en septembre mais VERSEE en octobre compte dans
    le CA et les commissions de septembre (date effective), et dans les
    « versees » d'octobre (paid_at). Melanger les deux rendrait la
    conciliation fausse d'un mois.
    """
    lignes = [
        # Approuvee en septembre, versee en octobre.
        {"order_number": "FN-1", "base_amount": 100, "commission_amount": 16,
         "status": "paid", "approved_at": "2026-09-10T10:00:00",
         "created_at": "2026-09-09T10:00:00", "paid_at": "2026-10-05T10:00:00"},
        # Approuvee et versee dans le meme mois.
        {"order_number": "FN-2", "base_amount": 50, "commission_amount": 8,
         "status": "paid", "approved_at": "2026-10-02T10:00:00",
         "created_at": "2026-10-01T10:00:00", "paid_at": "2026-10-03T10:00:00"},
        # Exclue : ne compte NI dans le CA, NI dans les commissions.
        {"order_number": "FN-3", "base_amount": 999, "commission_amount": 99,
         "status": "excluded", "excluded_reason": "fraud",
         "created_at": "2026-09-15T10:00:00"},
    ]
    serie = server_module._affiliate_serie_mensuelle(lignes)
    assert [s["mois"] for s in serie] == ["2026-09", "2026-10"]
    sept, octo = serie
    assert sept["ca_valide"] == 100 and sept["commissions"] == 16 and sept["payee"] == 0
    assert octo["ca_valide"] == 50 and octo["commissions"] == 8 and octo["payee"] == 24


def test_la_serie_mensuelle_ne_brode_pas_des_mois_vides(server_module):
    """Seuls les mois avec une activite sont renvoyes : des zeros ajoutes
    donneraient une fausse impression de serie continue."""
    lignes = [{"order_number": "FN-1", "base_amount": 10, "commission_amount": 2,
               "status": "approved", "created_at": "2026-05-04T10:00:00"}]
    serie = server_module._affiliate_serie_mensuelle(lignes)
    assert [s["mois"] for s in serie] == ["2026-05"]
