# -*- coding: utf-8 -*-
"""Les formats de vente : 1, 3, 5, 10 flacons.

MIREILLE, 21/10/2026, capture d'un concurrent a l'appui : « je parle de
quantite vendue, donc un lot de 10, un paquet de 10. Il faudrait pouvoir le
presenter et l'afficher seulement si je veux le rendre public [...] et en
precommande si je n'en ai pas en stock, avec tout ce qui est deja programme
pour les precommandes, de la notification a la facturation au dispatch. »

LE PIEGE CENTRAL : UNITES N'EST PAS QUANTITE.

Un paquet de 10 est UNE ligne de panier, mais DIX flacons. Le prix se compte
en paquets ; le stock, le poids du colis et la decision de precommande se
comptent en flacons.

`_order_weight_kg` faisait `weight_grams x qty`. Un 10-pack vendu a `qty: 1`
aurait pese UN flacon : Postes Canada repese le colis, constate l'ecart et
refacture — sans erreur visible nulle part, commande apres commande. C'est le
genre de defaut qui ne se decouvre que sur une facture, des mois plus tard.

Ces tests gardent les trois endroits ou la confusion coute de l'argent : le
stock, le poids, et le refus d'un format non publie.
"""
from __future__ import annotations

import asyncio
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def srv(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


def _variante(stock=100, prix=79.99, packs=None):
    return {
        "id": "v-1", "name": "10mg", "price": prix, "stock": stock,
        "weight_grams": 0.5, "preorder_enabled": False,
        "packs": packs if packs is not None else [],
    }


# ---------------------------------------------------------------------------
# La resolution du format
# ---------------------------------------------------------------------------

def test_le_flacon_seul_n_est_pas_un_pack(srv):
    """`pack_qty: 1` rend None : c'est la variante elle-meme.

    Creer une entree `qty: 1` dupliquerait le prix unitaire a deux endroits,
    et deux sources de verite pour un prix finissent toujours par diverger.
    """
    assert srv.resoudre_pack(_variante(), 1) is None
    assert srv.resoudre_pack(_variante(), 0) is None
    assert srv.resoudre_pack(_variante(), None) is None


def test_UN_FORMAT_NON_PUBLIE_N_EST_PAS_ACHETABLE(srv):
    """Masquer a l'ecran sans refuser au serveur n'est pas masquer.

    Sans cette garde, un appel direct avec `pack_qty: 10` achèterait au prix
    d'un format qu'elle n'a pas publie — et elle ne le verrait que sur la
    commande.
    """
    from fastapi import HTTPException
    v = _variante(packs=[{"qty": 10, "price": 639.99, "active": False}])
    with pytest.raises(HTTPException) as capture:
        srv.resoudre_pack(v, 10)
    assert capture.value.status_code == 400


def test_un_format_inexistant_est_refuse_pas_devine(srv):
    from fastapi import HTTPException
    v = _variante(packs=[{"qty": 3, "price": 225.99, "active": True}])
    with pytest.raises(HTTPException):
        srv.resoudre_pack(v, 7)


def test_un_format_publie_se_resout(srv):
    v = _variante(packs=[{"qty": 5, "price": 359.99, "active": True}])
    pack = srv.resoudre_pack(v, 5)
    assert pack["qty"] == 5 and pack["price"] == 359.99


# ---------------------------------------------------------------------------
# Unites : le compte qui protege le stock et la facture de transport
# ---------------------------------------------------------------------------

def test_unites_de_compte_les_flacons(srv):
    assert srv.unites_de({"qty": 1, "unites": 10}) == 10
    assert srv.unites_de({"qty": 2, "unites": 20}) == 20


def test_une_commande_ANCIENNE_retombe_sur_qty(srv):
    """Avant le 21/10/2026, tout se vendait a l'unite : `qty` etait exact.

    Une commande sans `unites` ne doit pas peser zero ni lever.
    """
    assert srv.unites_de({"qty": 3}) == 3
    assert srv.unites_de({}) == 1


def test_UN_PAQUET_DE_10_PESE_DIX_FLACONS(srv):
    """LE TEST QUI PROTEGE SA FACTURE POSTES CANADA.

    `_order_weight_kg` faisait `weight_grams x qty`. Un 10-pack a `qty: 1`
    aurait pese un seul flacon ; le transporteur repese le colis et refacture
    l'ecart, sans qu'aucune alerte ne se declenche de notre cote.
    """
    # LE POIDS EST CELUI DE SON GHK-Cu : 50 g par flacon, releve sur le site.
    # A 0,5 g la multiplication resterait invisible — `_order_weight_kg`
    # applique un plancher de 0,1 kg, et un flacon comme dix tomberaient
    # dessous. La garde doit porter sur un poids qui depasse le plancher,
    # sinon elle ne garde rien.
    commande = {"items": [{"weight_grams": 50.0, "qty": 1, "unites": 10}]}
    assert srv._order_weight_kg(commande) == pytest.approx(0.5, abs=1e-6)

    # Et un 3-pack pese trois fois, pas dix. Les deux depassent le plancher,
    # donc c'est bien la multiplication qu'on mesure et pas le minimum.
    trois = {"items": [{"weight_grams": 50.0, "qty": 1, "unites": 3}]}
    assert srv._order_weight_kg(trois) == pytest.approx(0.15, abs=1e-6)


def test_deux_paquets_de_10_pesent_vingt_flacons(srv):
    commande = {"items": [{"weight_grams": 50.0, "qty": 2, "unites": 20}]}
    assert srv._order_weight_kg(commande) == pytest.approx(1.0, abs=1e-6)


def test_le_plancher_de_poids_existe_et_ce_n_est_pas_un_defaut(srv):
    """Un colis ne pese pas 5 g : il y a la boite et le calage.

    Ce test est la pour qu'on ne prenne pas le plancher pour une erreur de
    multiplication la prochaine fois — c'est exactement le piege dans lequel
    mon premier test est tombe.
    """
    minuscule = {"items": [{"weight_grams": 0.5, "qty": 1, "unites": 10}]}
    assert srv._order_weight_kg(minuscule) == 0.1


# ---------------------------------------------------------------------------
# Le prix
# ---------------------------------------------------------------------------

def test_le_prix_vendu_est_celui_du_paquet_entier(srv):
    v = _variante(prix=79.99)
    pack = {"qty": 5, "price": 359.99, "active": True}
    assert srv.prix_unitaire_vendu(v, pack, False) == 359.99
    assert srv.prix_unitaire_vendu(v, None, False) == 79.99


def test_un_paquet_peut_avoir_son_prix_de_precommande(srv):
    v = _variante()
    pack = {"qty": 10, "price": 639.99, "preorder_price": 599.99, "active": True}
    assert srv.prix_unitaire_vendu(v, pack, True) == 599.99
    assert srv.prix_unitaire_vendu(v, pack, False) == 639.99


def test_la_precommande_se_decide_PAR_FORMAT(srv):
    """Elle peut ouvrir la precommande sur un 10-pack sans l'ouvrir sur le
    flacon seul, ou l'inverse. Le drapeau du format decide."""
    v = _variante()
    v["preorder_enabled"] = False
    assert srv.precommande_possible(v, {"qty": 10, "preorder_enabled": True}) is True
    assert srv.precommande_possible(v, {"qty": 10, "preorder_enabled": False}) is False

    v["preorder_enabled"] = True
    assert srv.precommande_possible(v, None) is True
    # Le drapeau de la variante ne deborde PAS sur le paquet.
    assert srv.precommande_possible(v, {"qty": 10, "preorder_enabled": False}) is False


# ---------------------------------------------------------------------------
# Le modele
# ---------------------------------------------------------------------------

def test_un_pack_ne_peut_pas_valoir_un(srv):
    """`qty: 1` serait un second prix pour le flacon seul."""
    import pydantic
    with pytest.raises(pydantic.ValidationError):
        srv.PackOption(qty=1, price=79.99)


def test_un_pack_est_MASQUE_par_defaut(srv):
    """« Par defaut c'est ajouter un produit, mais j'active les paquets. »"""
    pack = srv.PackOption(qty=10, price=639.99)
    assert pack.active is False
    assert pack.preorder_enabled is False


def test_une_variante_sans_packs_se_comporte_comme_avant(srv):
    """Aucune migration : le catalogue existant ne bouge pas."""
    v = srv.ProductVariant(name="10mg", price=79.99)
    assert v.packs == []
    assert srv.resoudre_pack(v.model_dump(), 1) is None


def test_le_panier_part_a_un_flacon(srv):
    """`pack_qty` absent = comportement d'avant."""
    ligne = srv.CartItem(product_id="p-1", qty=1)
    assert ligne.pack_qty == 1
