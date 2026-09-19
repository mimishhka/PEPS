# -*- coding: utf-8 -*-
"""La date et l'heure REELLES de livraison.

Constate le 2026-09-19 : la livraison etait datee au moment ou le serveur
s'en APERCEVAIT (`now`) — jusqu'a 15 minutes plus tard pour le veilleur, des
jours pour un bouton clique tard. Or cette date demarre le delai de 48 h des
remboursements. Le fuseau de chaque evenement, fourni par Postes Canada,
etait en plus jete a la lecture. Et l'ecriture « livree » existait en deux
copies qui divergeaient deja.
"""
import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

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


# Une reponse de suivi au format de l'ancienne API, evenements du plus
# recent au plus ancien, comme Postes Canada les renvoie.
_XML = """<?xml version="1.0" encoding="UTF-8"?>
<tracking-detail xmlns="http://www.canadapost.ca/ws/track">
  <pin>1234567890123456</pin>
  <significant-events>
    <occurrence>
      <event-identifier>1496</event-identifier>
      <event-date>2026-09-18</event-date>
      <event-time>14:07:32</event-time>
      <event-time-zone>EDT</event-time-zone>
      <event-description>Item delivered</event-description>
      <event-site>MONTREAL</event-site>
    </occurrence>
    <occurrence>
      <event-identifier>0174</event-identifier>
      <event-date>2026-09-18</event-date>
      <event-time>08:12:04</event-time>
      <event-time-zone>EDT</event-time-zone>
      <event-description>Item out for delivery</event-description>
      <event-site>MONTREAL</event-site>
    </occurrence>
  </significant-events>
</tracking-detail>"""


# ---------------------------------------------------------------------------
# Lecture de la reponse
# ---------------------------------------------------------------------------

def test_le_fuseau_de_chaque_evenement_est_garde(server_module):
    suivi = server_module._cp_lire_suivi_xml("1234567890123456", _XML)
    assert suivi["events"][0]["time_zone"] == "EDT"
    assert suivi["events"][0]["date"] == "2026-09-18"
    assert suivi["events"][0]["time"] == "14:07:32"


def test_l_evenement_de_livraison_n_est_pas_la_tournee(server_module):
    """« Out for delivery » n'est pas une livraison."""
    suivi = server_module._cp_lire_suivi_xml("1234567890123456", _XML)
    ev = server_module._cp_evenement_livraison(suivi)
    assert ev["description"] == "Item delivered"
    assert server_module._cp_evenement_livraison(
        {"events": [{"description": "Item out for delivery"}]}) is None


# ---------------------------------------------------------------------------
# L'heure retenue
# ---------------------------------------------------------------------------

def test_l_heure_du_transporteur_est_convertie_en_utc(server_module):
    instant, libelle = server_module._cp_horodatage(
        {"date": "2026-09-18", "time": "14:07:32", "time_zone": "EDT"})
    assert instant == "2026-09-18T18:07:32+00:00"          # EDT = UTC-4
    assert libelle == "2026-09-18 à 14:07 EDT"


def test_un_fuseau_de_l_ouest_aussi(server_module):
    instant, _ = server_module._cp_horodatage(
        {"date": "2026-09-18", "time": "09:00:00", "time_zone": "PDT"})
    assert instant == "2026-09-18T16:00:00+00:00"          # PDT = UTC-7


def test_sans_heure_la_journee_compte_jusqu_au_soir(server_module):
    """Le choix favorable au client : son delai de 48 h part plus tard."""
    instant, libelle = server_module._cp_horodatage({"date": "2026-09-18", "time_zone": "EST"})
    assert instant == "2026-09-19T04:59:00+00:00"          # 23:59 EST
    assert libelle == "2026-09-18 EST"


def test_une_date_illisible_ne_fabrique_rien(server_module):
    assert server_module._cp_horodatage({"date": "18/09/2026"}) == (None, "")


# ---------------------------------------------------------------------------
# L'ecriture unique
# ---------------------------------------------------------------------------

def _base(server_module, modifie=1):
    ecrit = {}

    class Orders:
        async def update_one(self, filtre, update):
            ecrit["filtre"] = filtre
            ecrit["update"] = update
            return SimpleNamespace(modified_count=modifie)

    server_module.db = SimpleNamespace(orders=Orders())
    return ecrit


def test_la_livraison_est_datee_par_postes_canada_et_notee(server_module):
    ecrit = _base(server_module)
    suivi = server_module._cp_lire_suivi_xml("1234567890123456", _XML)
    asyncio.run(server_module._cp_marquer_livree("o-1", "1234567890123456", suivi,
                                                 "canada_post_tracking_auto"))
    champs = ecrit["update"]["$set"]
    assert champs["shipping_info.delivered_at"] == "2026-09-18T18:07:32+00:00"
    assert champs["shipping_info.delivered_at_label"] == "2026-09-18 à 14:07 EDT"
    # L'heure de detection est gardee a part : elle ne remplace plus l'autre.
    assert champs["shipping_info.delivery_detected_at"] != champs["shipping_info.delivered_at"]
    note = ecrit["update"]["$push"]["notes"]["text"]
    assert "Livrée le 2026-09-18 à 14:07 EDT" in note
    assert "MONTREAL" in note


def test_jamais_une_commande_close_ne_repasse_livree(server_module):
    ecrit = _base(server_module)
    asyncio.run(server_module._cp_marquer_livree("o-1", "123", None, "canada_post_tracking_auto"))
    assert ecrit["filtre"]["fulfillment_status"] == {"$in": ["shipped"]}


def test_le_repli_de_test_le_dit_dans_la_note(server_module):
    """Pas de fausse confirmation : la note dit qu'aucun transporteur n'a
    confirme."""
    ecrit = _base(server_module)
    asyncio.run(server_module._cp_marquer_livree("o-1", "123", None, "sandbox_time_fallback_auto"))
    note = ecrit["update"]["$push"]["notes"]["text"]
    assert "TEST" in note and "aucune confirmation" in note
    assert ecrit["update"]["$set"]["shipping_info.delivered_at_label"] == ""


# ---------------------------------------------------------------------------
# Les deux chemins passent par la meme ecriture
# ---------------------------------------------------------------------------

def test_le_bouton_retient_l_heure_du_transporteur(server_module, monkeypatch):
    ecrit = {}
    commande = {"id": "o-1", "fulfillment_status": "shipped",
                "shipping_info": {"tracking_number": "1234567890123456"}}

    class Orders:
        async def find_one(self, filtre, projection=None):
            return dict(commande)

        async def update_one(self, filtre, update):
            ecrit["update"] = update
            return SimpleNamespace(modified_count=1)

    async def suivi(pin):
        return server_module._cp_lire_suivi_xml(pin, _XML)

    monkeypatch.setattr(server_module, "_canada_post_track", suivi)
    server_module.db = SimpleNamespace(orders=Orders())
    res = asyncio.run(server_module.admin_sync_delivery_status("o-1", {}))

    assert res["updated"] is True
    assert ecrit["update"]["$set"]["shipping_info.delivered_at"] == "2026-09-18T18:07:32+00:00"


def test_le_bouton_ne_livre_pas_une_commande_remboursee(server_module, monkeypatch):
    """Une commande close ne repasse jamais a « livree », meme si le suivi
    le dit."""
    commande = {"id": "o-1", "fulfillment_status": "refunded",
                "shipping_info": {"tracking_number": "1234567890123456"}}

    class Orders:
        async def find_one(self, filtre, projection=None):
            return dict(commande)

        async def update_one(self, filtre, update):
            assert "refunded" not in filtre["fulfillment_status"]["$in"]
            return SimpleNamespace(modified_count=0)

    async def suivi(pin):
        return server_module._cp_lire_suivi_xml(pin, _XML)

    monkeypatch.setattr(server_module, "_canada_post_track", suivi)
    server_module.db = SimpleNamespace(orders=Orders())
    res = asyncio.run(server_module.admin_sync_delivery_status("o-1", {}))
    assert res["updated"] is False


def test_le_veilleur_retient_l_heure_du_transporteur(server_module, monkeypatch):
    ecritures = []

    class Curseur:
        def sort(self, *a):
            return self

        async def to_list(self, n):
            return [{"id": "o-1", "order_number": "FN-1",
                     "shipping_info": {"tracking_number": "1234567890123456"}}]

    class Orders:
        def find(self, *a, **k):
            return Curseur()

        async def update_one(self, filtre, update):
            ecritures.append(update)
            return SimpleNamespace(modified_count=1)

    async def suivi(pin):
        return server_module._cp_lire_suivi_xml(pin, _XML)

    monkeypatch.setattr(server_module, "CANADA_POST_API_KEY", "cle-de-test")
    monkeypatch.setattr(server_module, "_canada_post_track", suivi)
    server_module.db = SimpleNamespace(orders=Orders())
    assert asyncio.run(server_module._auto_sync_delivered_orders_once()) == 1

    livraison = [u for u in ecritures if "fulfillment_status" in u.get("$set", {})][0]
    assert livraison["$set"]["shipping_info.delivered_at"] == "2026-09-18T18:07:32+00:00"


# ---------------------------------------------------------------------------
# Le NOUVEAU portail (OAuth, JSON)
# ---------------------------------------------------------------------------

# L'exemple de reponse de la specification officielle (Tracking 2.0.0,
# GET /pins/{pinNumber}/details), releve le 2026-09-19.
_JSON_OFFICIEL = {
    "pin": 3167437095800812,
    "activeExists": True,
    "significantEvents": [
        {"eventIdentifier": 1496, "eventDate": "2023-12-11T00:00:00.000Z",
         "eventTime": "11:59:59", "eventTimeZone": "AST", "eventDescription": "Delivered",
         "eventSite": "OROMOCTO", "eventProvince": "NB",
         "eventRetailLocationId": None, "eventRetailName": None},
        {"eventIdentifier": 20, "eventDate": "2023-12-11T00:00:00.000Z",
         "eventTime": "09:50:23", "eventTimeZone": "AST",
         "eventDescription": "Signature available", "eventSite": "OROMOCTO",
         "eventProvince": None, "eventRetailLocationId": None, "eventRetailName": None},
    ],
}


class _Reponse:
    def __init__(self, statut, donnees=None):
        self.status_code = statut
        self._donnees = donnees or {}
        self.text = "..."

    def json(self):
        return self._donnees


def test_la_reponse_du_nouveau_portail_est_lue_champ_par_champ(server_module):
    suivi = server_module._cp_lire_suivi_json("3167437095800812", _JSON_OFFICIEL)
    ev = suivi["events"][0]
    assert ev == {"date": "2023-12-11", "time": "11:59:59", "time_zone": "AST",
                  "description": "Delivered", "location": "OROMOCTO", "identifier": "1496"}


def test_la_date_du_nouveau_portail_ne_recule_pas_d_un_jour(server_module):
    """eventDate est une date locale portee par un minuit UTC. La convertir
    en heure du Quebec donnerait le 10 decembre ; la livraison a eu lieu le
    11 a 11:59 heure de l'Atlantique."""
    suivi = server_module._cp_lire_suivi_json("3167437095800812", _JSON_OFFICIEL)
    instant, libelle = server_module._cp_horodatage(server_module._cp_evenement_livraison(suivi))
    assert instant == "2023-12-11T15:59:59+00:00"          # AST = UTC-4
    assert libelle == "2023-12-11 à 11:59 AST"


def test_avec_les_cles_oauth_le_suivi_passe_par_le_nouveau_portail(server_module, monkeypatch):
    appels = []

    async def appel(methode, url, **k):
        appels.append((methode, url))
        return _Reponse(200, _JSON_OFFICIEL)

    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_ID", "id-de-test")
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_SECRET", "secret-de-test")
    monkeypatch.setattr(server_module, "CANADA_POST_API_KEY", "")
    monkeypatch.setattr(server_module, "_cp_openapi_call", appel)

    suivi = asyncio.run(server_module._canada_post_track("3167437095800812"))
    assert appels == [("GET", "https://api.canadapost-postescanada.ca/prod/"
                              "devportal-portaildesdeveloppeurs/tracking/v1/pins/3167437095800812/details")]
    assert server_module._cp_tracking_indicates_delivered(suivi)[0] is True


def test_une_erreur_du_portail_ne_fabrique_pas_de_livraison(server_module, monkeypatch):
    async def appel(methode, url, **k):
        return _Reponse(404)

    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_ID", "id-de-test")
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_SECRET", "secret-de-test")
    monkeypatch.setattr(server_module, "_cp_openapi_call", appel)
    assert asyncio.run(server_module._canada_post_track("123")) is None


def test_sans_aucun_identifiant_rien_n_est_interroge(server_module, monkeypatch):
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_ID", "")
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_SECRET", "")
    monkeypatch.setattr(server_module, "CANADA_POST_API_KEY", "")
    assert server_module._cp_suivi_disponible() is False
    assert asyncio.run(server_module._canada_post_track("123")) is None


def test_le_veilleur_tourne_avec_les_seuls_identifiants_oauth(server_module, monkeypatch):
    """Il s'arretait des qu'il manquait la cle de l'ANCIENNE API : avec les
    seules cles du nouveau portail, aucune livraison n'aurait ete confirmee."""
    ecritures = []

    class Curseur:
        def sort(self, *a):
            return self

        async def to_list(self, n):
            return [{"id": "o-1", "order_number": "FN-1",
                     "shipping_info": {"tracking_number": "3167437095800812"}}]

    class Orders:
        def find(self, *a, **k):
            return Curseur()

        async def update_one(self, filtre, update):
            ecritures.append(update)
            return SimpleNamespace(modified_count=1)

    async def suivi(pin):
        return server_module._cp_lire_suivi_json(pin, _JSON_OFFICIEL)

    monkeypatch.setattr(server_module, "CANADA_POST_API_KEY", "")
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_ID", "id-de-test")
    monkeypatch.setattr(server_module, "CANADA_POST_OAUTH_CLIENT_SECRET", "secret-de-test")
    monkeypatch.setattr(server_module, "_canada_post_track", suivi)
    server_module.db = SimpleNamespace(orders=Orders())

    assert asyncio.run(server_module._auto_sync_delivered_orders_once()) == 1
    livraison = [u for u in ecritures if "fulfillment_status" in u.get("$set", {})][0]
    assert livraison["$set"]["shipping_info.delivered_at"] == "2023-12-11T15:59:59+00:00"
    assert "Livrée le 2023-12-11 à 11:59 AST" in livraison["$push"]["notes"]["text"]
