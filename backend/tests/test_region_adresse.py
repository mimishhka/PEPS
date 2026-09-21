# -*- coding: utf-8 -*-
"""La region d'une adresse de livraison doit etre lisible par le transporteur.

Le formulaire du checkout laissait un champ libre : « Quebec », « Qc », « PQ »
partaient tels quels jusqu'a Postes Canada, qui refuse l'etiquette — des jours
plus tard, apres l'encaissement, et sans que le refus dise quel champ fautait.

Le formulaire propose desormais une liste deroulante, mais la contrainte
appartient au MODELE : un modele qui accepte « Quebec » laisse la porte
ouverte a tout ce qui n'est pas le formulaire, une API, un ancien onglet, un
script.
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


def _adresse(**extra):
    base = {"full_name": "Marie Tremblay", "address1": "123 rue Saint-Denis",
            "city": "Montreal", "province": "QC", "postal_code": "H2X 1Y4",
            "country": "CA"}
    base.update(extra)
    return base


def test_un_code_a_deux_lettres_passe(server_module):
    a = server_module.ShippingAddress(**_adresse())
    assert a.province == "QC"


@pytest.mark.parametrize("saisie", ["qc", " Qc ", "qC"])
def test_la_casse_et_les_espaces_sont_corriges(server_module, saisie):
    # « qc » est une faute de frappe, pas une erreur d'adresse : la refuser
    # ferait perdre une vente pour une majuscule.
    a = server_module.ShippingAddress(**_adresse(province=saisie))
    assert a.province == "QC"


@pytest.mark.parametrize("saisie", ["Quebec", "Québec", "PQ", "QQ", "Ontario"])
def test_une_region_inconnue_est_refusee(server_module, saisie):
    with pytest.raises(Exception) as erreur:
        server_module.ShippingAddress(**_adresse(province=saisie))
    # Le message doit dire QUOI faire, pas seulement que c'est faux.
    assert "two-letter" in str(erreur.value)


def test_les_etats_americains_ont_leur_propre_liste(server_module):
    a = server_module.ShippingAddress(**_adresse(country="US", province="ny",
                                                 postal_code="10001"))
    assert a.province == "NY"
    assert a.country == "US"


def test_une_province_canadienne_n_est_pas_un_etat(server_module):
    # « QC » aux Etats-Unis passait sans broncher.
    with pytest.raises(Exception):
        server_module.ShippingAddress(**_adresse(country="US", province="QC",
                                                 postal_code="10001"))


def test_le_district_de_columbia_est_admis(server_module):
    a = server_module.ShippingAddress(**_adresse(country="US", province="DC",
                                                 postal_code="20001"))
    assert a.province == "DC"


def test_un_pays_hors_perimetre_n_est_pas_juge(server_module):
    # On n'expedie qu'au Canada et aux Etats-Unis aujourd'hui. Inventer une
    # liste pour la France interdirait une adresse correcte le jour ou l'on
    # ouvrirait.
    a = server_module.ShippingAddress(**_adresse(country="FR", province="Ile-de-France",
                                                 postal_code="75001"))
    assert a.province == "Ile-de-France"


def test_les_treize_provinces_sont_toutes_admises(server_module):
    for code in ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE",
                 "QC", "SK", "YT"]:
        assert server_module.ShippingAddress(**_adresse(province=code)).province == code
