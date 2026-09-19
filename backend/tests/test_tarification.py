# -*- coding: utf-8 -*-
"""La cotation des envois de la boutique (Get Rates).

Constate le 2026-09-19 :
- la cotation passait encore par l'ANCIENNE API (cle de test), alors que le
  suivi utilisait deja les cles OAuth de l'app Fironova ;
- en mode OpenAPI, l'ecran Dispatch CREAIT un envoi pour lire son prix puis
  l'annulait — un envoi fantome par commande a chaque ouverture ;
- la liste Dispatch cotait le colis sans sa boite, le bouton « recalculer »
  avec : deux prix pour la meme commande ;
- le point d'acces public /shipping/rates interrogeait Postes Canada pour
  n'importe quel visiteur, alors que la cotation ne sert pas au checkout.
Champs releves sur la specification officielle (Rating, POST /prices).
"""
import asyncio
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


# L'exemple de reponse de la specification officielle, tel quel.
_JSON_OFFICIEL = [{
    "serviceCode": "DOM.RP",
    "serviceLink": {"rel": "service", "mediaType": "application/json",
                    "href": "https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs"
                            "/rating/v1/services/DOM.RP?contract=0040662509&country=CA"},
    "serviceName": "pricequoteservicename",
    "priceDetails": {
        "base": 10,
        "taxes": {"gst": {"amt": 10, "percent": 10}, "pst": {"amt": 10, "percent": 10},
                  "hst": {"amt": 10, "percent": 10}},
        "due": 10,
        "options": [{"optionCode": "optionCode", "optionName": "optionName", "optionPrice": 1}],
        "adjustments": [{"adjustmentCode": "adjustmentCode", "adjustmentName": "adjustmentName",
                         "adjustmentCost": 1}],
    },
    "weightDetails": {"cubedWeight": 1},
    "serviceStandard": {"amDelivery": False, "guaranteedDelivery": True, "expectedTransitTime": 2,
                        "expectedDeliveryDate": "2011-12-20T00:00:00.000Z"},
}]

_URL_PRIX = ("https://api.canadapost-postescanada.ca/prod/"
             "devportal-portaildesdeveloppeurs/rating/v1/prices")


class _Reponse:
    def __init__(self, status_code, donnees=None):
        self.status_code = status_code
        self._donnees = donnees
        self.text = "" if donnees is None else str(donnees)

    def json(self):
        if self._donnees is None:
            raise ValueError("pas de JSON")
        return self._donnees


def _cles_fironova(monkeypatch, sm, *, cle_ancienne="cle-de-test", mode="legacy"):
    monkeypatch.setattr(sm, "CANADA_POST_OAUTH_CLIENT_ID", "id-de-test")
    monkeypatch.setattr(sm, "CANADA_POST_OAUTH_CLIENT_SECRET", "secret-de-test")
    monkeypatch.setattr(sm, "CANADA_POST_API_KEY", cle_ancienne)
    monkeypatch.setattr(sm, "CANADA_POST_API_MODE", mode)
    monkeypatch.setattr(sm, "CANADA_POST_CUSTOMER_NUMBER", "0001234567")
    monkeypatch.setattr(sm, "CANADA_POST_CONTRACT_ID", "0040000000")
    monkeypatch.setattr(sm, "CANADA_POST_ORIGIN_POSTAL_CODE", "h2x 1y4")


def _espion(monkeypatch, sm, reponse):
    appels = []

    async def appel(methode, url, **k):
        appels.append((methode, url, k.get("json_body")))
        return reponse

    monkeypatch.setattr(sm, "_cp_openapi_call", appel)
    return appels


# ---------------------------------------------------------------------------
# Lecture de la reponse
# ---------------------------------------------------------------------------

def test_la_reponse_officielle_est_lue_dans_le_format_commun(server_module):
    assert server_module._cp_lire_tarifs_json(_JSON_OFFICIEL) == [{
        "carrier": "Canada Post", "service_code": "DOM.RP",
        "service_name": "pricequoteservicename", "cost_cad": 10.0,
        "eta_days": "2", "expected_delivery": "2011-12-20",
    }]


def test_un_devis_sans_prix_est_ecarte(server_module):
    assert server_module._cp_lire_tarifs_json([{"serviceCode": "DOM.EP", "priceDetails": {}}]) == []
    # Une reponse qui n'est pas un tableau (une erreur, par exemple) : rien.
    assert server_module._cp_lire_tarifs_json({"messages": []}) == []


# ---------------------------------------------------------------------------
# Quelles cles
# ---------------------------------------------------------------------------

def test_avec_les_cles_fironova_la_cotation_passe_par_le_nouveau_portail(server_module, monkeypatch):
    # Meme avec l'ancienne cle presente ET le mode « legacy » (qui ne regit
    # que les etiquettes), la cotation prend les cles OAuth.
    _cles_fironova(monkeypatch, server_module)
    appels = _espion(monkeypatch, server_module, _Reponse(200, _JSON_OFFICIEL))

    devis = asyncio.run(server_module._canada_post_get_rates("j8p 3r9", "CA", 0.4567))
    assert devis[0]["service_code"] == "DOM.RP" and devis[0]["cost_cad"] == 10.0
    assert appels == [("POST", _URL_PRIX, {
        "parcelCharacteristics": {"weight": 0.457},
        "originPostalCode": "H2X1Y4",
        "destination": {"domestic": {"postalCode": "J8P3R9"}},
        "customerNumber": "0001234567",
        "quoteType": "commercial",
        "contractId": "0040000000",
    })]
    assert server_module._cp_source_tarifs() == "openapi"


def test_sans_numero_client_le_prix_est_celui_du_comptoir(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module)
    monkeypatch.setattr(server_module, "CANADA_POST_CUSTOMER_NUMBER", "")
    appels = _espion(monkeypatch, server_module, _Reponse(200, _JSON_OFFICIEL))
    asyncio.run(server_module._canada_post_get_rates("J8P3R9", "CA", 1))
    corps = appels[0][2]
    assert corps["quoteType"] == "counter"
    assert "customerNumber" not in corps and "contractId" not in corps


def test_destinations_etats_unis_et_international(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module)
    appels = _espion(monkeypatch, server_module, _Reponse(200, _JSON_OFFICIEL))
    asyncio.run(server_module._canada_post_get_rates("90210", "us", 1))
    asyncio.run(server_module._canada_post_get_rates("75001", "FR", 1))
    assert appels[0][2]["destination"] == {"unitedStates": {"zipCode": "90210"}}
    assert appels[1][2]["destination"] == {"international": {"countryCode": "FR"}}


def test_un_code_postal_mal_forme_n_est_pas_envoye(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module)
    appels = _espion(monkeypatch, server_module, _Reponse(200, _JSON_OFFICIEL))
    assert asyncio.run(server_module._canada_post_get_rates("123", "CA", 1)) == []
    assert appels == []


def test_une_erreur_du_portail_ne_fabrique_pas_de_prix(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module)
    _espion(monkeypatch, server_module, _Reponse(400, {"messages": [{"code": "x"}]}))
    assert asyncio.run(server_module._canada_post_get_rates("J8P3R9", "CA", 1)) == []


def test_sans_cles_oauth_l_ancienne_api_reste_possible(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module)
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_ID", "")
    assert server_module._cp_source_tarifs() == "legacy"
    monkeypatch.setattr(server_module, "CANADA_POST_API_KEY", "")
    assert server_module._cp_source_tarifs() is None
    assert asyncio.run(server_module._canada_post_get_rates("J8P3R9", "CA", 1)) == []


def test_l_etat_de_la_config_dit_quelle_api_sert_a_quoi(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module)
    monkeypatch.setattr(server_module, "CANADA_POST_ENVIRONMENT", "dev")
    etat = asyncio.run(server_module.admin_shipping_config_status({}))
    # Etiquettes : ancienne API, environnement de test. Le reste : Fironova.
    assert etat["sources"] == {"labels": "legacy-dev", "tracking": "openapi", "rating": "openapi"}


# ---------------------------------------------------------------------------
# Les appelants
# ---------------------------------------------------------------------------

class _Commandes:
    def __init__(self, commande):
        self.commande = commande

    async def find_one(self, *a, **k):
        return dict(self.commande)


def test_le_recalcul_dispatch_cote_sans_creer_d_envoi(server_module, monkeypatch):
    _cles_fironova(monkeypatch, server_module, mode="openapi")
    commande = {"id": "o-1", "shipping_address": {"postal_code": "J8P 3R9", "country": "CA"},
                "items": [{"qty": 2, "weight_grams": 100}]}
    monkeypatch.setattr(server_module, "db", type("Db", (), {"orders": _Commandes(commande)})())

    async def boite(order, **k):
        return {"id": "b-1", "name": "Petite", "tare_grams": 150}

    async def interdit(*a, **k):
        raise AssertionError("un envoi a ete cree pour lire un prix")

    monkeypatch.setattr(server_module, "_select_box_for_order", boite)
    monkeypatch.setattr(server_module, "_canada_post_create_shipment_openapi", interdit)
    monkeypatch.setattr(server_module, "_canada_post_create_shipment", interdit)
    appels = _espion(monkeypatch, server_module, _Reponse(200, _JSON_OFFICIEL))

    out = asyncio.run(server_module.admin_order_refresh_dispatch_estimate("o-1", "DOM.RP", {}))
    assert out["estimated_cost_due"] == 10.0
    assert out["line_label_cost_source"] == "estimated_cp"
    # Le colis est cote avec sa boite : 200 g de produits + 150 g.
    assert appels[0][2]["parcelCharacteristics"] == {"weight": 0.35}
    assert out["packaged_weight_kg"] == 0.35


def test_un_autre_service_que_celui_demande_est_signale(server_module):
    devis = server_module._cp_lire_tarifs_json(_JSON_OFFICIEL)
    choisi = server_module._cp_choisir_tarif(devis, "DOM.XP")
    assert choisi["service_code"] == "DOM.RP"          # l'appelant le marque « _alt »
    assert server_module._cp_choisir_tarif([], "DOM.XP") is None


def test_le_poids_emballe_est_le_meme_pour_la_liste_et_le_recalcul(server_module):
    commande = {"items": [{"qty": 1, "weight_grams": 50}]}
    # Les produits gardent leur plancher de 0,1 kg (_order_weight_kg), puis la
    # boite s'ajoute — le calcul que faisait deja le recalcul d'une ligne.
    assert server_module._poids_emballe_kg(commande, {"tare_grams": 120}) == 0.22
    assert server_module._poids_emballe_kg(commande, None) == 0.1


def test_les_tarifs_publics_n_interrogent_pas_postes_canada(server_module, monkeypatch):
    async def interdit(*a, **k):
        raise AssertionError("le point d'acces public a appele Postes Canada")

    async def rien(*a, **k):
        return None

    async def poids(items):
        return 0.5

    class _Curseur:
        def __init__(self, lignes):
            self.lignes = lignes

        async def to_list(self, n):
            return self.lignes

    class _Coll:
        def __init__(self, lignes):
            self.lignes = lignes

        def find(self, *a, **k):
            return _Curseur(self.lignes)

    zones = [{"id": "z-ca", "countries": ["CA"]}]
    methodes = [{"name": "Colis standard", "cost_cad": 12.5, "eta_days": "3-5"}]
    monkeypatch.setattr(server_module, "db", type("Db", (), {
        "shipping_zones": _Coll(zones), "shipping_methods": _Coll(methodes)})())
    monkeypatch.setattr(server_module, "_rate_limit", rien)
    monkeypatch.setattr(server_module, "_client_ip", lambda r: "1.2.3.4")
    monkeypatch.setattr(server_module, "_estimate_parcel_weight_kg", poids)
    monkeypatch.setattr(server_module, "_canada_post_get_rates", interdit)
    monkeypatch.setattr(server_module, "_cp_openapi_call", interdit)

    charge = server_module.ShippingRateRequest(postal_code="J8P3R9", country="CA", items=[])
    out = asyncio.run(server_module.get_shipping_rates(charge, None))
    assert out["source"] == "flat_rate"
    assert out["rates"][0]["cost_cad"] == 12.5
