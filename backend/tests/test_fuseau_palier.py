"""Le mois du palier commence a minuit A MONTREAL, pas a minuit UTC.

MIREILLE, 01/10/2026 : « je vois que nous sommes deja au mois suivant et il
n'est pas encore minuit a Montreal. Est-ce que c'est UTC ? »

Oui, ca l'etait — la docstring disait meme « a minuit UTC ». La fenetre
basculait donc a 20 h a Montreal en heure avancee, et a 19 h en heure
normale : le tableau de bord passait au mois suivant quatre heures avant la
fin du mois, et « les gains de ce mois-ci » repartaient a zero pendant que la
soiree durait encore.

CE N'EST PAS QU'UN AFFICHAGE. Une vente payee a 21 h le dernier jour du mois
tombait dans la fenetre du mois SUIVANT : elle ne comptait pas pour le palier
du mois qu'elle cloturait, et comptait pour celui d'apres. Le palier gouverne
le taux de TOUTES les ventes suivantes — c'est donc de l'argent, et pas une
question de presentation.

Le depot avait deja le bon fuseau pour la coupure d'expedition
(ORDER_CUTOFF_TZ, America/Toronto). Les deux horloges disent desormais la
meme heure.
"""
import importlib
import os
import sys
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def mod(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server  # noqa: F401
    from services import affiliate
    return importlib.reload(affiliate)


def utc(a, m, j, h=0, mi=0):
    return datetime(a, m, j, h, mi, tzinfo=timezone.utc)


# ===========================================================================
# LE CAS DE MIREILLE
# ===========================================================================

def test_le_30_septembre_a_21h_a_Montreal_on_est_encore_en_septembre(mod):
    """21 h a Montreal le 30 septembre = 1er octobre 01 h UTC.

    C'est exactement l'instant ou elle a regarde : le tableau annoncait
    octobre alors qu'il restait trois heures de septembre.
    """
    p = mod._affiliate_periode_palier(utc(2026, 10, 1, 1))

    assert p["courant_debut"] == utc(2026, 9, 1, 4)     # 1er sept., minuit a Montreal
    assert p["fin_exclue"] == utc(2026, 9, 1, 4)
    assert p["prochain_debut"] == utc(2026, 10, 1, 4)


def test_une_heure_du_matin_le_1er_octobre_a_bien_bascule(mod):
    """1 h a Montreal = 05 h UTC : le mois a change, et c'est normal."""
    p = mod._affiliate_periode_palier(utc(2026, 10, 1, 5))

    assert p["courant_debut"] == utc(2026, 10, 1, 4)
    assert p["fin_exclue"] == utc(2026, 10, 1, 4)


def test_la_bascule_a_lieu_A_MINUIT_LOCAL_et_pas_avant(mod):
    """Les deux minutes qui encadrent le changement.

    C'est la seule chose qui compte vraiment : ou tombe exactement la
    frontiere. Une vente payee entre les deux ne doit pas changer de mois.
    """
    juste_avant = mod._affiliate_periode_palier(utc(2026, 10, 1, 3, 59))
    juste_apres = mod._affiliate_periode_palier(utc(2026, 10, 1, 4, 1))

    assert juste_avant["courant_debut"].month == 9
    assert juste_apres["courant_debut"].month == 10


# ===========================================================================
# L'HEURE NORMALE, OU LE DECALAGE N'EST PLUS LE MEME
# ===========================================================================

def test_en_hiver_la_bascule_suit_aussi_Montreal(mod):
    """En janvier, Montreal est a UTC-5 : minuit local vaut 05 h UTC.

    Une borne figee a « -4 h » aurait fonctionne six mois par an. C'est tout
    l'interet de passer par le fuseau plutot que par un decalage.
    """
    p = mod._affiliate_periode_palier(utc(2026, 1, 15, 12))
    assert p["courant_debut"] == utc(2026, 1, 1, 5)


def test_le_changement_d_heure_ne_decale_pas_la_frontiere(mod):
    """Mars 2026 : l'heure avancee commence le 8. Le 1er mars est encore en
    heure normale (05 h UTC), le 1er avril en heure avancee (04 h UTC).

    La borne suit, parce qu'elle est calculee mois par mois et non par un
    decalage unique applique a l'annee.
    """
    mars = mod._affiliate_periode_palier(utc(2026, 3, 20, 12))
    avril = mod._affiliate_periode_palier(utc(2026, 4, 20, 12))

    assert mars["courant_debut"] == utc(2026, 3, 1, 5)
    assert avril["courant_debut"] == utc(2026, 4, 1, 4)


# ===========================================================================
# LA FENETRE RESTE COHERENTE
# ===========================================================================

def test_la_fenetre_couvre_douze_mois_pleins(mod):
    p = mod._affiliate_periode_palier(utc(2026, 10, 15, 12))

    assert p["debut"] == utc(2025, 10, 1, 4)
    assert p["fin_exclue"] == utc(2026, 10, 1, 4)
    # Douze bornes de mois entre les deux.
    mois = (p["fin_exclue"].year - p["debut"].year) * 12 \
        + (p["fin_exclue"].month - p["debut"].month)
    assert mois == 12


def test_le_mois_sortant_est_le_premier_de_la_fenetre(mod):
    """C'est lui qui explique qu'un palier baisse alors qu'on a bien vendu."""
    p = mod._affiliate_periode_palier(utc(2026, 10, 15, 12))
    assert p["sortant_debut"] == p["debut"]
    assert p["sortant_fin_exclue"] == utc(2025, 11, 1, 4)


def test_toutes_les_bornes_sont_en_UTC(mod):
    """Les dates stockees le sont : la comparaison n'aurait aucun sens
    autrement, et une borne naive ferait lever l'agregation."""
    p = mod._affiliate_periode_palier(utc(2026, 10, 15, 12))
    for clef, valeur in p.items():
        assert valeur.tzinfo is not None, clef
        assert valeur.utcoffset().total_seconds() == 0, clef


def test_le_passage_d_une_annee_a_l_autre(mod):
    """Decembre vers janvier : le calcul par rang de mois doit tenir."""
    p = mod._affiliate_periode_palier(utc(2027, 1, 10, 12))
    assert p["courant_debut"] == utc(2027, 1, 1, 5)
    assert p["debut"] == utc(2026, 1, 1, 5)
    assert p["prochain_debut"] == utc(2027, 2, 1, 5)


def test_le_31_du_mois_ne_deborde_pas(mod):
    """`replace` sur un 31 vers un mois de 30 jours leverait sans le `day=1`."""
    for jour in (29, 30, 31):
        p = mod._affiliate_periode_palier(utc(2026, 1, jour, 12))
        assert p["courant_debut"] == utc(2026, 1, 1, 5)
        assert p["prochain_debut"] == utc(2026, 2, 1, 5)


# ===========================================================================
# LE TRIMESTRE SUIT LA MEME HORLOGE
# ===========================================================================

def test_le_trimestre_commence_aussi_a_minuit_a_Montreal(mod):
    assert mod._affiliate_quarter_start(utc(2026, 10, 1, 1)) == utc(2026, 7, 1, 4)
    assert mod._affiliate_quarter_start(utc(2026, 10, 1, 5)) == utc(2026, 10, 1, 4)


# ===========================================================================
# LE FUSEAU EST REGLABLE
# ===========================================================================

def test_le_fuseau_se_regle_sans_toucher_au_code(mod, monkeypatch):
    """Utile si l'entreprise change de province, et surtout pour que le
    palier puisse se detacher un jour de la coupure d'expedition."""
    monkeypatch.setenv("AFFILIATE_TIER_TZ", "UTC")
    import server  # noqa: F401
    from services import affiliate
    recharge = importlib.reload(affiliate)

    p = recharge._affiliate_periode_palier(utc(2026, 10, 1, 1))
    # En UTC, 01 h le 1er octobre EST deja octobre.
    assert p["courant_debut"] == utc(2026, 10, 1, 0)
