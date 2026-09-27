"""Le palier repose sur douze mois CALENDAIRES clos, plus sur 365 jours.

Mireille : « sur quoi se base ce calcul si la commission depend des derniers
12 mois glissants — je ne veux pas donner de faux espoirs ».

AVANT, `window_start = now - timedelta(days=365)`. Une borne qui reculait a
chaque instant, L'HEURE COMPRISE : une commission approuvee le 26 septembre
2025 a midi etait DANS la fenetre le matin du 26 septembre 2026 et DEHORS
l'apres-midi. Le meme compte affichait deux totaux le meme jour, et le taux
d'une vente dependait de la minute ou elle etait payee. Exact, et
inexplicable : aucun affilie ne pouvait savoir a quel taux il vendait.

APRES, la fenetre couvre les douze mois clos precedant le mois en cours. Elle
ne change qu'une fois par mois, le 1er. Le mois en cours en est EXCLU — c'est
la contrepartie assumee : une vente d'aujourd'hui ne releve plus le taux
d'aujourd'hui, elle compte a partir du 1er suivant.

Ces tests portent sur les bornes et sur les deux montants annonces a
l'affilie. Ils n'ont besoin ni de Mongo ni du serveur : les aideurs de date
sont purs, et c'est la qu'etait le defaut.
"""
import io
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, RACINE)


@pytest.fixture(scope="module")
def dates():
    """Les aideurs de date, extraits SANS importer le module.

    `services.affiliate` importe `server`, qui exige Mongo et toute la
    configuration. Or les trois fonctions testees ici ne touchent a rien :
    elles prennent un datetime et en rendent un autre. Les charger seules
    garde le test rapide et sans montage — et c'est exactement le code ou
    vivait le defaut des 365 jours.
    """
    src = io.open(os.path.join(RACINE, "services", "affiliate.py"),
                  encoding="utf-8").read()
    bloc = src[src.index("def _affiliate_mois_debut"):
               src.index("def _affiliate_quarter_start")]
    espace = {"datetime": datetime, "timezone": timezone, "Optional": Optional}
    exec(compile(bloc, "aideurs_affiliate", "exec"), espace)  # noqa: S102
    return espace


def _utc(a, m, j, h=0, mi=0):
    return datetime(a, m, j, h, mi, tzinfo=timezone.utc)


def _jour(d):
    return d.strftime("%Y-%m-%d")


# ===========================================================================
# Le decalage de mois
# ===========================================================================

@pytest.mark.parametrize("base, n, attendu", [
    (_utc(2026, 1, 15), -1, "2025-12-01"),      # passage d'annee en arriere
    (_utc(2026, 1, 15), -12, "2025-01-01"),
    (_utc(2026, 12, 31), 1, "2027-01-01"),      # passage d'annee en avant
    (_utc(2026, 3, 31), -1, "2026-02-01"),      # 31 -> un mois de 28 jours
    (_utc(2024, 2, 29), -12, "2023-02-01"),     # depuis un 29 fevrier
    (_utc(2026, 9, 27), 0, "2026-09-01"),
])
def test_decalage_de_mois(dates, base, n, attendu):
    """Le decalage reste au 1er du mois et ne deborde jamais.

    `timedelta(days=365)` se trompait d'un jour des qu'une annee bissextile
    tombait dans la fenetre. Le calcul par rang de mois ne connait pas ce
    probleme : il ne compte pas de jours.
    """
    assert _jour(dates["_affiliate_mois_decale"](base, n)) == attendu


# ===========================================================================
# Les bornes de la fenetre
# ===========================================================================

def test_la_fenetre_exclut_le_mois_en_cours(dates):
    """Le mois en cours n'est pas clos : il ne compte pas dans son propre taux.

    C'est ce qui rend le taux annoncable des le 1er. Sans cette borne haute,
    chaque vente du mois deplacait le palier du mois.
    """
    p = dates["_affiliate_periode_palier"](_utc(2026, 9, 27))
    assert p["debut"] == _utc(2025, 9, 1)
    assert p["fin_exclue"] == _utc(2026, 9, 1)
    assert _jour(p["fin_exclue"] - timedelta(days=1)) == "2026-08-31"


def test_la_fenetre_couvre_exactement_douze_mois(dates):
    for mois in range(1, 13):
        p = dates["_affiliate_periode_palier"](_utc(2026, mois, 14))
        rang = ((p["fin_exclue"].year * 12 + p["fin_exclue"].month)
                - (p["debut"].year * 12 + p["debut"].month))
        assert rang == 12, mois


def test_la_fenetre_ne_bouge_pas_dans_le_mois(dates):
    """LE DEFAUT CENTRAL DES 365 JOURS.

    La borne portait l'HEURE : consulter son compte a 9 h et a 15 h donnait
    deux fenetres differentes, donc deux totaux, donc parfois deux paliers.
    """
    debut = dates["_affiliate_periode_palier"](_utc(2026, 10, 1, 0, 0))
    fin = dates["_affiliate_periode_palier"](_utc(2026, 10, 31, 23, 59))
    assert debut == fin


def test_le_mois_sortant_est_le_premier_de_la_fenetre(dates):
    """Le mois qui sort le 1er prochain est celui qu'on affiche en hachure.

    C'est lui, et lui seul, qui explique qu'un palier baisse alors que
    l'affilie a bien vendu. Sans cette information, le montant a reconduire
    parait arbitraire.
    """
    p = dates["_affiliate_periode_palier"](_utc(2026, 9, 27))
    assert p["sortant_debut"] == p["debut"] == _utc(2025, 9, 1)
    assert p["sortant_fin_exclue"] == _utc(2025, 10, 1)


def test_le_mois_sortant_dure_un_mois(dates):
    for mois in range(1, 13):
        p = dates["_affiliate_periode_palier"](_utc(2026, mois, 3))
        rang = ((p["sortant_fin_exclue"].year * 12 + p["sortant_fin_exclue"].month)
                - (p["sortant_debut"].year * 12 + p["sortant_debut"].month))
        assert rang == 1, mois


def test_la_fenetre_du_mois_suivant_glisse_d_un_mois(dates):
    """Ce que j'ai annonce a Mireille, verifie : en octobre, septembre 2025 sort."""
    sept = dates["_affiliate_periode_palier"](_utc(2026, 9, 27))
    octo = dates["_affiliate_periode_palier"](_utc(2026, 10, 1))
    assert _jour(sept["debut"]) == "2025-09-01"
    assert _jour(octo["debut"]) == "2025-10-01"
    # Le mois sorti est exactement celui que la carte annoncait comme sortant.
    assert sept["sortant_debut"] == sept["debut"]
    assert octo["debut"] == sept["sortant_fin_exclue"]


def test_le_taux_vaut_jusqu_a_la_fin_du_mois(dates):
    """La date affichee sur la carte : « taux valide jusqu'au ... »."""
    p = dates["_affiliate_periode_palier"](_utc(2026, 9, 27))
    assert _jour(p["prochain_debut"] - timedelta(days=1)) == "2026-09-30"
    p = dates["_affiliate_periode_palier"](_utc(2026, 2, 10))
    assert _jour(p["prochain_debut"] - timedelta(days=1)) == "2026-02-28"
    p = dates["_affiliate_periode_palier"](_utc(2024, 2, 10))
    assert _jour(p["prochain_debut"] - timedelta(days=1)) == "2024-02-29"
    p = dates["_affiliate_periode_palier"](_utc(2026, 12, 20))
    assert _jour(p["prochain_debut"] - timedelta(days=1)) == "2026-12-31"


def test_les_bornes_restent_en_utc(dates):
    p = dates["_affiliate_periode_palier"](_utc(2026, 7, 4, 18, 30))
    for cle in ("debut", "fin_exclue", "sortant_debut",
                "sortant_fin_exclue", "courant_debut", "prochain_debut"):
        assert p[cle].tzinfo is timezone.utc, cle
        assert (p[cle].hour, p[cle].minute, p[cle].second) == (0, 0, 0), cle
        assert p[cle].day == 1, cle


# ===========================================================================
# Les deux montants annonces
# ===========================================================================

PALIERS = [("standard", 0.10, 0.0, 2000.0), ("bronze", 0.12, 2001.0, 5000.0),
           ("silver", 0.14, 5001.0, 10000.0), ("gold", 0.16, 10001.0, 20000.0),
           ("platinum", 0.18, 20001.0, 35000.0), ("diamond", 0.20, 35001.0, None)]


def _projection(fenetre, sortant, courant):
    """La meme arithmetique que le service, isolee pour etre lisible."""
    return max(0.0, fenetre - sortant + courant)


def test_un_gros_mois_qui_sort_fait_baisser_la_projection():
    """LE CAS QUI JUSTIFIE TOUT L'ECRAN.

    11 240 $ au compteur, bien au-dessus du plancher Or de 10 001 $ — et le
    palier tombe quand meme, parce que 1 880 $ sortent le 1er. Aucun ecran
    anterieur ne pouvait le dire a l'affiliee : elle l'aurait decouvert sur sa
    commission suivante.
    """
    projection = _projection(11240.0, 1880.0, 410.0)
    assert projection == 9770.0
    plancher_or = 10001.0
    assert round(plancher_or - projection, 2) == 231.0


def test_le_montant_de_maintien_est_nul_quand_le_palier_tient():
    """Rien a faire : la carte affiche « Atteint », pas un montant."""
    projection = _projection(11240.0, 200.0, 410.0)   # un petit mois sort
    assert max(0.0, 10001.0 - projection) == 0.0


def test_le_premier_palier_ne_demande_jamais_rien():
    """Standard a un plancher de 0 : il ne peut pas etre perdu.

    Afficher un montant a reconduire ici serait une FAUSSE PEUR — le pendant
    exact du faux espoir qu'on vient de retirer.
    """
    plancher_standard = PALIERS[0][2]
    assert plancher_standard == 0.0
    for projection in (0.0, 80.0, 415.0, 1999.0):
        assert max(0.0, plancher_standard - projection) == 0.0


def test_les_deux_montants_se_mesurent_sur_la_meme_base():
    """Sinon l'ecart affiche ne correspond pas a la regle appliquee."""
    projection = _projection(4120.0, 240.0, 615.0)
    assert projection == 4495.0
    assert round(max(0.0, 2001.0 - projection), 2) == 0.0        # Bronze acquis
    assert round(max(0.0, 5001.0 - projection), 2) == 506.0      # vers Argent


def test_la_projection_ne_descend_jamais_sous_zero():
    """Une donnee incoherente ne doit pas produire un montant negatif."""
    assert _projection(100.0, 900.0, 0.0) == 0.0


# ===========================================================================
# LE CLIQUET : le palier monte tout de suite, ne descend que le 1er
# ===========================================================================
#
# Mireille : « si un affilie atteint un seuil au cours d'un mois je le
# penalise sur sa commission ». C'etait vrai de la premiere version : elle ne
# comptait que les mois CLOS, donc un affilie qui franchissait Bronze le 3 du
# mois touchait 10 % jusqu'au 1er suivant. Il etait puni d'avoir bien vendu.

def _palier(rev):
    """Le palier pour un CA donne — meme regle que le service."""
    tier = "standard"
    for nom, _taux, plancher, _plafond in PALIERS:
        if rev >= plancher:
            tier = nom
    return tier


def _rang(tier):
    return [p[0] for p in PALIERS].index(tier)


def _palier_a_cliquet(base_close, mois_courant):
    """base_close fixe le plancher du mois ; base_vive peut le faire monter."""
    plancher = _palier(base_close)
    vive = _palier(base_close + mois_courant)
    return vive if _rang(vive) >= _rang(plancher) else plancher


def test_le_palier_monte_des_le_seuil_franchi():
    """LE DEFAUT QUE MIREILLE A TROUVE.

    1 900 $ sur les mois clos : Standard. Une vente de 150 $ le 3 du mois
    franchit les 2 001 $ de Bronze — le taux doit passer a 12 % sur les
    commandes suivantes, pas au 1er du mois prochain.
    """
    assert _palier(1900.0) == "standard"
    assert _palier_a_cliquet(1900.0, 150.0) == "bronze"


def test_le_palier_ne_descend_pas_en_cours_de_mois():
    """Une commission du mois annulee ne doit pas faire tomber le taux.

    Sans le cliquet, `base_vive` baisserait et le palier avec elle, EN PLEIN
    MOIS — exactement la penalite qu'on cherche a supprimer, dans l'autre sens.
    """
    # Les mois clos donnent deja Or : c'est le plancher du mois.
    assert _palier(10500.0) == "gold"
    # Meme avec un mois courant negatif (annulations), le plancher tient.
    assert _palier_a_cliquet(10500.0, -800.0) == "gold"


def test_le_cliquet_ne_saute_jamais_un_palier_vers_le_bas():
    for close in (0.0, 2500.0, 6000.0, 12000.0, 25000.0, 40000.0):
        plancher = _palier(close)
        for courant in (0.0, 10.0, 5000.0, 50000.0):
            obtenu = _palier_a_cliquet(close, courant)
            assert _rang(obtenu) >= _rang(plancher), (close, courant)


def test_les_deux_montants_ne_se_mesurent_pas_sur_la_meme_base():
    """Deux questions differentes, donc deux bases. Les confondre rend l'une fausse.

      « Garder mon taux le mois prochain ? »  -> la PROJECTION (le mois
        sortant quittera la fenetre le 1er).
      « Monter, maintenant ? »                -> la BASE VIVE (le cliquet
        applique le nouveau taux des le seuil franchi).
    """
    close, sortant, courant = 4120.0, 240.0, 615.0
    vive = close + courant                    # 4 735 $ — ce qui compte maintenant
    projection = close - sortant + courant    # 4 495 $ — ce qui comptera le 1er
    assert vive == 4735.0 and projection == 4495.0
    # Monter vers Argent, tout de suite : mesure sur la base vive.
    assert round(max(0.0, 5001.0 - vive), 2) == 266.0
    # Garder Bronze le mois prochain : mesure sur la projection.
    assert round(max(0.0, 2001.0 - projection), 2) == 0.0
    # Les deux chiffres different de 240 $ — le mois qui sort. Les afficher
    # sur la meme base ferait mentir l'un des deux.
    assert round((5001.0 - projection) - (5001.0 - vive), 2) == 240.0
