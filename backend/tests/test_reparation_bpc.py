# -*- coding: utf-8 -*-
"""Les garde-fous de la routine de reparation du seed BPC-157.

Demande du 2026-09-20. La routine `_repair_nonprod_bpc_seed` reecrit la fiche
produit au demarrage quand elle la juge « derivee ». Sa condition de sante
exigeait que le 10 mg soit en precommande avec `badge_coa_pending` a vrai :
le jour ou le certificat arrive et ou l'on decoche ce badge dans l'admin, le
redemarrage suivant remettait le produit en precommande a 85 $ avec la note
« COA pending ». C'est cette perte de donnees silencieuse qui est verrouillee
ici, plus le nettoyage de la note redondante.

Ces trois fonctions sont pures : elles se testent sans base ni serveur.
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


# ---------------------------------------------------------------- la note ---

@pytest.mark.parametrize("note", [
    "COA pending",
    "  coa   PENDING ",
    "COA à venir",
    "COA a venir",
    "COA en attente",
    "Certificat d'analyse à venir",
    "Certificate of Analysis pending",
])
def test_une_note_qui_repete_le_coa_est_reconnue(server_module, note):
    assert server_module._note_repete_le_coa(note) is True


@pytest.mark.parametrize("note", [
    "Expedie des le 15 novembre",
    "Lot en production, depart le 3 octobre",
    "COA pending — mais depart quand meme le 2",
    "",
    None,
])
def test_une_note_ecrite_a_la_main_est_laissee_intacte(server_module, note):
    assert server_module._note_repete_le_coa(note) is False


# --------------------------------------------------------- les reglages -----

def test_un_reglage_existant_prime_sur_le_defaut(server_module):
    assert server_module._garder_valeur({"price_cad": 129.0}, "price_cad", 64.99) == 129.0


def test_un_champ_vide_ou_absent_recoit_le_defaut(server_module):
    assert server_module._garder_valeur({}, "price_cad", 64.99) == 64.99
    assert server_module._garder_valeur({"coa_lot": ""}, "coa_lot", "L-1") == "L-1"
    assert server_module._garder_valeur({"price_cad": None}, "price_cad", 64.99) == 64.99


def test_faux_et_zero_sont_des_reglages_legitimes(server_module):
    # Un produit volontairement retire de la vitrine ne doit pas y revenir
    # parce que `False` ressemble a « vide ».
    assert server_module._garder_valeur({"featured": False}, "featured", True) is False
    assert server_module._garder_valeur({"active": False}, "active", True) is False
    assert server_module._garder_valeur({"price_cad": 0}, "price_cad", 64.99) == 0


# ------------------------------------------------- la fusion des variantes ---

DEFAUTS_10MG = {
    "id": "v-defaut", "name": "10.0mg", "price": 100.0, "sale_price": None,
    "stock": 6, "sku": "BPC-157-10MG", "coa_status": "pending",
    "badge_coa_available": False, "badge_coa_pending": True,
    "badge_coming_soon": False, "preorder_enabled": True,
    "preorder_delay_message": "", "preorder_price": 85.0,
    "preorder_note": "", "coa_url": "",
}


def test_le_certificat_recu_ne_repasse_pas_en_precommande(server_module):
    # Le scenario exact redoute : le COA est arrive, l'admin a decoche le
    # badge et coupe la precommande. La reparation ne doit rien defaire.
    apres_reception = {
        "id": "v-reel", "name": "10.0mg", "price": 100.0,
        "coa_status": "available", "badge_coa_pending": False,
        "badge_coa_available": True, "preorder_enabled": False,
        "coa_url": "/uploads/coa/bpc157-10mg.pdf",
    }
    fusion = server_module._completer_variante(apres_reception, DEFAUTS_10MG)

    assert fusion["preorder_enabled"] is False
    assert fusion["badge_coa_pending"] is False
    assert fusion["coa_status"] == "available"
    assert fusion["coa_url"] == "/uploads/coa/bpc157-10mg.pdf"


def test_les_cles_absentes_recoivent_le_defaut(server_module):
    fusion = server_module._completer_variante({"name": "10.0mg", "price": 100.0}, DEFAUTS_10MG)

    assert fusion["preorder_price"] == 85.0
    assert fusion["sku"] == "BPC-157-10MG"


def test_sans_variante_existante_le_defaut_sert_de_fixture(server_module):
    # C'est ainsi que la variante 10 mg apparait sur une base neuve : les
    # tests d'integration comptent dessus.
    fusion = server_module._completer_variante(None, DEFAUTS_10MG)

    assert fusion == DEFAUTS_10MG
    assert fusion is not DEFAUTS_10MG  # une copie, pas la constante elle-meme


def test_identite_et_stock_viennent_des_defauts(server_module):
    # `id`, `name` et `stock` sont deja deduits de l'existant par l'appelant ;
    # les reprendre de l'existant ecraserait ce calcul.
    fusion = server_module._completer_variante(
        {"id": "ancien", "name": "10mg", "stock": 0, "_id": "objectid", "price": 111.0},
        DEFAUTS_10MG,
    )

    assert fusion["id"] == "v-defaut"
    assert fusion["name"] == "10.0mg"
    assert fusion["stock"] == 6
    assert fusion["price"] == 111.0
    assert "_id" not in fusion
