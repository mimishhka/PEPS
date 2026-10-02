# -*- coding: utf-8 -*-
"""La serie mensuelle de la fiche affilie : chaque ligne parle d'UN mois.

MIREILLE, 01/10/2026, capture a l'appui : « paid amount not on the good line ».
Puis, precisant ce qu'elle veut lire : « ce que je veux voir c'est que la
commission du mois a ete versee ».

CE QU'ELLE VOYAIT :

    MOIS      VENTES      COMMISSIONS   VERSE CE MOIS
    2026-10   472,43 $    56,69 $       500,40 $
    2026-09   4 680,00 $  500,40 $      0,00 $

Septembre a gagne 500,40 $ et affichait « 0,00 $ verse ». Octobre affichait un
versement de 500,40 $ sans aucun rapport avec ses 56,69 $ de commissions. Le
versement de septembre est simplement parti en octobre — le cycle mensuel paie
le mois clos.

La colonne etait datee de `paid_at`, le jour du VIREMENT, et repondait donc a
« combien ai-je verse en mai ? ». Les trois autres repondent a « qu'a fait ce
mois-la ». Deux questions sur une meme ligne, et la ligne devient illisible.

C'est le meme defaut que l'etiquette `period` d'un versement, corrige le meme
jour : on attribue l'argent a la periode qu'il COUVRE, pas a la date du
transfert.
"""
import importlib
import os
import sys

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


def _par_mois(serie):
    return {l["mois"]: l for l in serie}


# Le cas exact de la capture : septembre gagne, verse en octobre.
LE_CAS = [
    {"status": "paid", "base_amount": 4680.00, "commission_amount": 500.40,
     "approved_at": "2026-09-14T12:00:00+00:00",
     "created_at": "2026-09-07T12:00:00+00:00",
     "paid_at": "2026-10-03T14:00:00+00:00"},
    {"status": "approved", "base_amount": 472.43, "commission_amount": 56.69,
     "approved_at": "2026-10-12T12:00:00+00:00",
     "created_at": "2026-10-05T12:00:00+00:00",
     "paid_at": None},
]


def test_LE_CAS_DE_MIREILLE_la_commission_du_mois_est_dite_versee(server_module):
    """« Ce que je veux voir c'est que la commission du mois a ete versee. »"""
    serie = _par_mois(server_module._affiliate_serie_mensuelle(LE_CAS))

    septembre = serie["2026-09"]
    assert septembre["commissions"] == 500.40
    assert septembre["payee"] == 500.40      # et non 0,00 $

    octobre = serie["2026-10"]
    assert octobre["commissions"] == 56.69
    assert octobre["payee"] == 0.0           # et non 500,40 $


def test_les_quatre_colonnes_d_une_ligne_parlent_du_MEME_mois(server_module):
    """L'invariant de fond : une ligne, un mois, une histoire.

    Si `payee` depassait les commissions de son propre mois, c'est qu'il porte
    de l'argent gagne ailleurs — exactement le defaut corrige.
    """
    serie = server_module._affiliate_serie_mensuelle(LE_CAS)

    for ligne in serie:
        assert ligne["payee"] <= ligne["commissions"] + 0.001, (
            f"{ligne['mois']} : versee ({ligne['payee']}) depasse ses propres "
            f"commissions ({ligne['commissions']})")


def test_un_virement_SEUL_ne_fabrique_pas_un_mois(server_module):
    """Un mois sans activite ne doit pas apparaitre.

    `paid_at` alimentait la liste des mois : un virement parti en decembre pour
    novembre fabriquait une ligne « decembre » dont les trois autres colonnes
    valaient zero.
    """
    serie = _par_mois(server_module._affiliate_serie_mensuelle([
        {"status": "paid", "base_amount": 100.0, "commission_amount": 12.0,
         "approved_at": "2026-11-10T12:00:00+00:00",
         "created_at": "2026-11-02T12:00:00+00:00",
         "paid_at": "2026-12-04T14:00:00+00:00"},
    ]))

    assert set(serie) == {"2026-11"}
    assert serie["2026-11"]["payee"] == 12.0


def test_une_commission_approuvee_mais_pas_encore_versee_compte_a_zero(server_module):
    serie = _par_mois(server_module._affiliate_serie_mensuelle([
        {"status": "approved", "base_amount": 500.0, "commission_amount": 60.0,
         "approved_at": "2026-09-14T12:00:00+00:00",
         "created_at": "2026-09-07T12:00:00+00:00", "paid_at": None},
    ]))

    assert serie["2026-09"]["commissions"] == 60.0
    assert serie["2026-09"]["payee"] == 0.0


def test_un_versement_PARTIEL_du_mois_se_lit_comme_tel(server_module):
    """Deux commissions en septembre, une seule versee : la ligne doit montrer
    l'ecart, qui est l'information utile."""
    serie = _par_mois(server_module._affiliate_serie_mensuelle([
        {"status": "paid", "base_amount": 1000.0, "commission_amount": 120.0,
         "approved_at": "2026-09-05T12:00:00+00:00",
         "created_at": "2026-09-01T12:00:00+00:00",
         "paid_at": "2026-10-03T14:00:00+00:00"},
        {"status": "approved", "base_amount": 500.0, "commission_amount": 60.0,
         "approved_at": "2026-09-28T12:00:00+00:00",
         "created_at": "2026-09-20T12:00:00+00:00", "paid_at": None},
    ]))

    assert serie["2026-09"]["commissions"] == 180.0
    assert serie["2026-09"]["payee"] == 120.0


def test_les_reprises_restent_datees_de_LEUR_mois(server_module):
    """CE QUE JE N'AI PAS CHANGE, et pourquoi.

    Une reprise est un EVENEMENT : « en octobre, 45 $ ont ete annules ». Elle
    est datee de `reversed_at` des deux cotes — ici et dans l'ecran de
    l'affilie (`affiliate_performance`) — precisement pour que les deux ecrans
    racontent la meme histoire. Mireille n'a pas signale cette colonne, et la
    changer casserait cet accord.
    """
    serie = _par_mois(server_module._affiliate_serie_mensuelle([
        {"status": "reversed", "base_amount": 400.0, "commission_amount": 45.0,
         "approved_at": "2026-08-10T12:00:00+00:00",
         "created_at": "2026-08-02T12:00:00+00:00",
         "reversed_at": "2026-10-18T09:00:00+00:00"},
    ]))

    assert serie["2026-10"]["recuperee"] == 45.0
    # Et aout ne porte pas la reprise : le statut `reversed` sort la ligne des
    # commissions valides.
    assert serie.get("2026-08", {}).get("commissions", 0) == 0


def test_un_affilie_sans_activite_rend_une_serie_vide(server_module):
    assert server_module._affiliate_serie_mensuelle([]) == []
