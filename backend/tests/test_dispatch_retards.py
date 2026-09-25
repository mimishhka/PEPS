"""Une commande empaquetee en retard ne doit plus disparaitre de Dispatch.

Mireille : « le cout estime dans dispatch ne semble pas fonctionner ». La cause
n'etait ni le calcul, ni la configuration Postes Canada : c'etait un TROU dans
la selection des commandes.

La file de Dispatch ne lisait que `dispatch_batch == aujourd'hui`. Une commande
empaquetee un jour precedent et jamais etiquetee tombait alors entre trois
filets a la fois :

  - absente de « a etiqueter »  : son lot n'est pas celui du jour ;
  - absente de « etiquetees »   : elle n'a pas d'etiquette ;
  - absente de « en retard »    : le compteur ne comptait que processing et
                                  pending, jamais packing ni packed.

Invisible, donc jamais expediee. Et comme l'estimation ne porte que sur les
lignes affichees, le cout estime restait a zero — ce qui se lit comme une
panne du calcul alors que le calcul n'avait simplement rien a calculer.

Ces tests verifient les filtres EXACTS du serveur, pas une reformulation :
ils sont extraits par lecture du code et compares au comportement Mongo via
le moteur de correspondance de fake_mongo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fake_mongo import _matches  # noqa: E402

AUJOURD_HUI = "2026-09-24"
HIER = "2026-09-23"


# Les deux branches de la file de travail, telles qu'ecrites dans
# admin_dispatch_today. Toute divergence ici est un test qui mentirait.
BRANCHE_DU_JOUR = {
    "dispatch_batch": AUJOURD_HUI,
    "fulfillment_status": {"$in": ["processing", "pending", "packing", "packed", "shipped"]},
}
BRANCHE_EN_RETARD = {
    "dispatch_batch": {"$lt": AUJOURD_HUI},
    "fulfillment_status": {"$in": ["processing", "pending", "packing", "packed"]},
    "$or": [
        {"shipping_info.label_url": {"$in": [None, ""]}},
        {"shipping_info.label_url": {"$exists": False}},
    ],
}
# La requete reelle porte une TROISIEME branche : l'historique des etiquettes
# emises ce jour-la, selectionnees par shipped_at et non par le lot. Elle ne
# concerne pas le travail a faire, mais elle fait partie du filtre — l'omettre
# rendrait faux tout test qui affirme qu'une commande « ne remonte pas ».
BRANCHE_HISTORIQUE = {
    "shipping_info.shipped_at": {"$gte": HIER, "$lte": AUJOURD_HUI + "T23:59:59"},
}

# La file DE TRAVAIL : les deux branches qui decident ce qu'il reste a faire.
FILE_DE_TRAVAIL = {"payment_status": "paid", "$or": [BRANCHE_DU_JOUR, BRANCHE_EN_RETARD]}
# La requete COMPLETE, historique compris, telle que le serveur l'envoie.
FILE = {"payment_status": "paid",
        "$or": [BRANCHE_DU_JOUR, BRANCHE_EN_RETARD, BRANCHE_HISTORIQUE]}

COMPTEUR_RETARDS = {
    "payment_status": "paid",
    "dispatch_batch": {"$lt": AUJOURD_HUI},
    "fulfillment_status": {"$in": ["processing", "pending", "packing", "packed"]},
    "$or": [
        {"shipping_info.label_url": {"$in": [None, ""]}},
        {"shipping_info.label_url": {"$exists": False}},
    ],
}


def commande(lot, etat, etiquette=None):
    doc = {"payment_status": "paid", "dispatch_batch": lot, "fulfillment_status": etat}
    if etiquette is not None:
        doc["shipping_info"] = {"label_url": etiquette, "tracking_number": "1Z"}
    return doc


def test_une_commande_empaquetee_hier_entre_dans_la_file():
    """Le coeur du defaut. Sans la branche « en retard », ce cas etait perdu."""
    assert _matches(commande(HIER, "packed"), FILE) is True


def test_elle_compte_aussi_comme_retard():
    """Le compteur l'ignorait : elle etait invisible ET non comptee."""
    assert _matches(commande(HIER, "packed"), COMPTEUR_RETARDS) is True


def test_le_flux_en_preparation_n_est_plus_oublie():
    """« packing » manquait aux DEUX listes d'etats, alors qu'il existe dans
    FULFILLMENT_FLOW. Une commande en preparation n'etait ni dans la file du
    jour ni dans les retards."""
    assert _matches(commande(AUJOURD_HUI, "packing"), FILE) is True
    assert _matches(commande(HIER, "packing"), COMPTEUR_RETARDS) is True


def test_une_commande_du_jour_reste_dans_la_file():
    """La correction ne doit rien retirer au comportement d'origine."""
    for etat in ("processing", "pending", "packed", "shipped"):
        assert _matches(commande(AUJOURD_HUI, etat), FILE) is True, etat


def test_une_commande_deja_etiquetee_ne_revient_pas_par_les_retards():
    """Sinon chaque expedition passee reapparaitrait dans la file du jour."""
    deja = commande(HIER, "packed", etiquette="/uploads/labels/x.pdf")
    assert _matches(deja, BRANCHE_EN_RETARD) is False
    assert _matches(deja, COMPTEUR_RETARDS) is False


def test_une_etiquette_vide_compte_comme_absente():
    """Le champ existe parfois en chaine vide plutot qu'absent : les deux
    formes veulent dire « pas d'etiquette »."""
    assert _matches(commande(HIER, "packed", etiquette=""), BRANCHE_EN_RETARD) is True
    assert _matches(commande(HIER, "packed", etiquette=None), BRANCHE_EN_RETARD) is True


def test_une_commande_livree_ne_rentre_pas_dans_le_travail_a_faire():
    """« delivered » et « cancelled » sont hors du flux d expedition : ils ne
    sont pas du travail. Ils peuvent en revanche remonter par l HISTORIQUE si
    leur etiquette a ete emise ce jour-la — c est voulu, et c est pourquoi ce
    test porte sur la file de travail et non sur le filtre complet."""
    for etat in ("delivered", "cancelled"):
        assert _matches(commande(HIER, etat), BRANCHE_EN_RETARD) is False, etat
        assert _matches(commande(AUJOURD_HUI, etat), FILE_DE_TRAVAIL) is False, etat


def test_l_historique_ramene_bien_une_expedition_du_jour():
    """La troisieme branche existe pour ca : une etiquette emise ce jour-la
    reste visible meme si son lot a change."""
    expediee = commande("2026-09-01", "shipped", etiquette="/uploads/labels/x.pdf")
    expediee["shipping_info"]["shipped_at"] = AUJOURD_HUI + "T14:02:00Z"
    assert _matches(expediee, FILE_DE_TRAVAIL) is False
    assert _matches(expediee, FILE) is True


def test_une_commande_impayee_ne_remonte_jamais():
    doc = commande(HIER, "packed")
    doc["payment_status"] = "pending"
    assert _matches(doc, FILE) is False  # payment_status est hors du $or
    assert _matches(doc, COMPTEUR_RETARDS) is False


def test_l_ancienne_requete_perdait_bien_le_cas():
    """La preuve que le trou existait : l'ancienne file, telle qu'ecrite avant
    la correction, ne retenait pas une commande empaquetee la veille."""
    ancienne_file = {
        "payment_status": "paid",
        "dispatch_batch": AUJOURD_HUI,
        "fulfillment_status": {"$in": ["processing", "pending", "packed", "shipped"]},
    }
    ancien_compteur = {
        "payment_status": "paid",
        "dispatch_batch": {"$lt": AUJOURD_HUI},
        "fulfillment_status": {"$in": ["processing", "pending"]},
    }
    perdue = commande(HIER, "packed")
    assert _matches(perdue, ancienne_file) is False
    assert _matches(perdue, ancien_compteur) is False
    # Et elle est desormais retenue par les deux.
    assert _matches(perdue, FILE) is True
    assert _matches(perdue, COMPTEUR_RETARDS) is True
