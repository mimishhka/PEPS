# -*- coding: utf-8 -*-
"""Ce que le transporteur dit est CONSERVE, et pas seulement quand il dit « livre ».

MIREILLE, 18/10/2026 : « poste canada needs to go live as i am ready to go live
also tracking since i each order has a traking showing delivery status ».

LE DEFAUT N'ETAIT PAS UN MANQUE, C'ETAIT UN GASPILLAGE.
`_auto_sync_delivered_orders_once` appelait deja le reperage de Postes Canada
pour chaque commande expediee, toutes les quinze minutes. La reponse entiere
arrivait, et une seule question lui etait posee : « est-ce livre ? ». Tout le
reste etait jete.

« En cours de livraison », « au bureau de poste », « tentative de livraison » :
l'information existait quatre fois par heure et n'atteignait jamais l'ecran.
La cliente n'avait que les quatre etapes internes du site, qui ne bougent que
lorsqu'une personne les fait bouger.

La conserver ne coute AUCUN appel supplementaire. C'est la variante
« recupere, jamais range » du motif qui revient sans cesse dans ce depot.

Et la simulation de livraison a disparu : plus rien ne marque une commande
« livree » sans confirmation du transporteur.
"""
import asyncio
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tests.fake_mongo import FakeCollection  # noqa: E402


@pytest.fixture
def srv(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


def _reperage(description, date="2026-10-18", time="08:12:04", lieu="MONTREAL"):
    """Une reponse de reperage, a la forme normalisee par `_cp_lire_suivi_*`."""
    return {"pin": "1234567890123456", "summary": "", "events": [{
        "date": date, "time": time, "time_zone": "EDT",
        "description": description, "location": lieu, "identifier": "0174",
    }]}


def _commande_expediee(srv, monkeypatch):
    commandes = FakeCollection([{
        "id": "o-1", "order_number": "FN-1", "fulfillment_status": "shipped",
        "shipping_info": {"tracking_number": "1234567890123456",
                          "shipped_at": "2026-10-01T12:00:00+00:00"},
    }])
    monkeypatch.setattr(srv.db, "orders", commandes, raising=False)
    # Le reperage est « disponible » : sinon la boucle s'arrete avant tout.
    monkeypatch.setattr(srv, "CANADA_POST_API_KEY", "configure", raising=False)
    return commandes


# ---------------------------------------------------------------------------
# Les lecteurs
# ---------------------------------------------------------------------------

def test_le_dernier_evenement_est_le_plus_recent_PAS_le_premier_recu(srv):
    """On ne se fie pas a l'ordre d'arrivee, on trie sur la date et l'heure.

    Postes Canada rend ses evenements du plus recent au plus ancien, mais c'est
    une convention, pas une garantie. Ici la liste est volontairement a
    l'envers : si le code prenait `events[0]`, il annoncerait « expedie » pour
    un colis deja en cours de livraison.
    """
    live = {"events": [
        {"date": "2026-10-16", "time": "09:00:00", "description": "Item shipped"},
        {"date": "2026-10-18", "time": "08:12:04", "description": "Item out for delivery"},
        {"date": "2026-10-17", "time": "22:30:00", "description": "Item processed"},
    ]}
    assert srv._cp_dernier_evenement(live)["description"] == "Item out for delivery"


def test_un_reperage_vide_ne_rend_rien_a_ecrire(srv):
    """Un dictionnaire vide, parce que `$set` d'un vide n'efface rien.

    C'est ce qui garantit qu'un reperage muet — reseau coupe, API qui refuse —
    ne remplace PAS le dernier statut connu par du vide.
    """
    assert srv._cp_instantane_suivi(None) == {}
    assert srv._cp_instantane_suivi({"events": []}) == {}
    assert srv._cp_instantane_suivi({}) == {}


def test_l_instantane_porte_le_statut_le_lieu_et_l_heure(srv):
    champs = srv._cp_instantane_suivi(_reperage("Item out for delivery"))
    assert champs["shipping_info.cp_statut"] == "Item out for delivery"
    assert champs["shipping_info.cp_lieu"] == "MONTREAL"
    assert champs["shipping_info.cp_evenement_a"].startswith("2026-10-18")
    assert champs["shipping_info.cp_evenement_libelle"]


# ---------------------------------------------------------------------------
# La boucle de fond
# ---------------------------------------------------------------------------

def test_UN_COLIS_EN_ROUTE_LAISSE_SON_STATUT_SANS_ETRE_MARQUE_LIVRE(srv, monkeypatch):
    """LE TEST QUI PORTE TOUT.

    Avant, cette reponse-la ne laissait aucune trace : non livree, donc
    jetee. Maintenant elle s'ecrit, et la commande reste « expediee ».
    """
    commandes = _commande_expediee(srv, monkeypatch)

    async def reperage(pin, lang=None):
        return _reperage("Item out for delivery")
    monkeypatch.setattr(srv, "_canada_post_track", reperage, raising=False)

    marquees = asyncio.run(srv._auto_sync_delivered_orders_once())

    doc = commandes.docs[0]
    assert marquees == 0
    assert doc["fulfillment_status"] == "shipped"
    assert doc["shipping_info"]["cp_statut"] == "Item out for delivery"
    assert doc["shipping_info"]["cp_lieu"] == "MONTREAL"
    assert doc["shipping_info"]["cp_evenement_a"].startswith("2026-10-18")
    assert doc["shipping_info"]["delivery_checked_at"]


def test_un_colis_livre_est_marque_ET_garde_son_statut(srv, monkeypatch):
    commandes = _commande_expediee(srv, monkeypatch)

    async def reperage(pin, lang=None):
        return _reperage("Item delivered", time="14:07:32")
    monkeypatch.setattr(srv, "_canada_post_track", reperage, raising=False)

    marquees = asyncio.run(srv._auto_sync_delivered_orders_once())

    doc = commandes.docs[0]
    assert marquees == 1
    assert doc["fulfillment_status"] == "delivered"
    assert doc["shipping_info"]["cp_statut"] == "Item delivered"
    assert doc["shipping_info"]["delivery_source"] == "canada_post_tracking_auto"


def test_un_reperage_muet_n_invente_AUCUNE_livraison(srv, monkeypatch):
    """Ce test remplace celui qu'on a supprime avec la simulation.

    `_sandbox_fallback_ready` rendait Vrai apres un certain nombre d'heures et
    faisait passer la commande a « livree » sans qu'aucun transporteur n'ait
    rien confirme. La commande ci-dessous a ete expediee il y a longtemps et le
    reperage ne repond pas : elle doit rester « expediee ».

    Ne pas savoir et le montrer vaut mieux que rassurer a tort — un client qui
    lit « livree » va chercher un colis qui n'est peut-etre jamais parti.
    """
    commandes = FakeCollection([{
        "id": "o-1", "fulfillment_status": "shipped",
        "shipping_info": {"tracking_number": "1234567890123456",
                          # Trois mois : largement au-dela de tout ancien delai.
                          "shipped_at": "2026-07-01T12:00:00+00:00",
                          "cp_statut": "Item out for delivery"},
    }])
    monkeypatch.setattr(srv.db, "orders", commandes, raising=False)
    monkeypatch.setattr(srv, "CANADA_POST_API_KEY", "configure", raising=False)

    async def muet(pin, lang=None):
        return None
    monkeypatch.setattr(srv, "_canada_post_track", muet, raising=False)

    marquees = asyncio.run(srv._auto_sync_delivered_orders_once())

    doc = commandes.docs[0]
    assert marquees == 0
    assert doc["fulfillment_status"] == "shipped"
    # Et le dernier statut connu n'a pas ete efface par le silence.
    assert doc["shipping_info"]["cp_statut"] == "Item out for delivery"


def test_deux_passages_de_suite_donnent_le_meme_etat(srv, monkeypatch):
    """L'idempotence verifiee par repetition, pas par raisonnement."""
    commandes = _commande_expediee(srv, monkeypatch)

    async def reperage(pin, lang=None):
        return _reperage("Item out for delivery")
    monkeypatch.setattr(srv, "_canada_post_track", reperage, raising=False)

    asyncio.run(srv._auto_sync_delivered_orders_once())
    premier = {k: v for k, v in commandes.docs[0]["shipping_info"].items()
               if k != "delivery_checked_at"}
    asyncio.run(srv._auto_sync_delivered_orders_once())
    second = {k: v for k, v in commandes.docs[0]["shipping_info"].items()
              if k != "delivery_checked_at"}

    assert premier == second


# ---------------------------------------------------------------------------
# La mise en ligne
# ---------------------------------------------------------------------------

def test_LA_SIMULATION_DE_LIVRAISON_N_EXISTE_PLUS(srv):
    """Elle marquait « livree » sur la seule foi du temps ecoule.

    C'est la forme la plus grave de donnee inventee : indiscernable de la vraie
    pour qui la lit. Ce test empeche son retour, y compris sous un autre nom.
    """
    assert not hasattr(srv, "_sandbox_fallback_ready")
    assert not hasattr(srv, "CANADA_POST_SANDBOX_DELIVERY_FALLBACK")
    assert not hasattr(srv, "CANADA_POST_SANDBOX_DELIVER_AFTER_HOURS")

    source = open(os.path.join(os.path.dirname(__file__), "..",
                               "services", "canada_post.py"), encoding="utf-8").read()
    # Hors commentaires : la note qui explique la suppression doit rester
    # lisible, mais plus aucune ligne de code ne doit parler de sandbox.
    code = "\n".join(l for l in source.splitlines() if not l.lstrip().startswith("#"))
    assert "sandbox" not in code.lower()


def test_le_defaut_n_envoie_PAS_vers_l_api_eteinte(srv):
    """Postes Canada a eteint XML et SOAP le 30 avril 2026.

    Les pages Shipping 8.0.0 et Rating 4.0.0 du portail l'annoncent dans les
    memes mots : REST uniquement, et jeton OAuth 2.0 obligatoire partout.

    Deux defauts envoyaient pourtant vers du mort :
      - `CANADA_POST_API_MODE=auto` retombe sur « legacy » (XML) des qu'il
        manque un identifiant OAuth ;
      - `CANADA_POST_ENVIRONMENT=dev` visait l'hote d'essai `ct.soa-gw`.

    Une mise en ligne faite avec la seule cle API prenait donc le chemin XML,
    pour la tarification, les etiquettes ET le reperage, sans rien dire.
    """
    assert srv.CANADA_POST_API_MODE == "openapi"
    assert srv.CANADA_POST_ENVIRONMENT == "prod"
    assert srv.CANADA_POST_BASE_URL == "https://soa-gw.canadapost.ca"


def test_l_etiquette_demandee_est_du_4x6_en_pdf(srv):
    """Son materiel : 4 x 6 po (101,6 x 152,4 mm), le thermique de Postes Canada.

    Le chemin XML n'envoyait AUCUNE preference d'impression, et Postes Canada
    retombait alors sur `8.5x11` : une feuille lettre entiere, pas une
    etiquette. Le chemin OpenAPI demande bien le 4x6.
    """
    source = open(os.path.join(os.path.dirname(__file__), "..",
                               "services", "canada_post.py"), encoding="utf-8").read()
    assert '"outputFormat": os.environ.get("CANADA_POST_LABEL_FORMAT", "4x6")' in source
    assert '"encoding": "PDF"' in source


# ---------------------------------------------------------------------------
# La langue
# ---------------------------------------------------------------------------

def test_le_reperage_est_demande_dans_la_langue_de_la_commande(srv, monkeypatch):
    """`Accept-Language` valait « en-CA » EN DUR.

    Postes Canada exige cet en-tete, et c'est lui qui decide de la langue des
    libelles. Sur un site dont la langue principale est le francais, le statut
    revenait donc toujours en anglais : « Item out for delivery » au milieu
    d'une page entierement francaise.

    Le defaut reste « en-CA » pour ne rien changer aux etiquettes ; le
    reperage, lui, demande la langue que porte la commande.
    """
    assert srv._cp_langue_entete("fr") == "fr-CA"
    assert srv._cp_langue_entete("fr-CA") == "fr-CA"
    assert srv._cp_langue_entete("en") == "en-CA"
    assert srv._cp_langue_entete(None) == "en-CA"
    assert srv._cp_langue_entete("") == "en-CA"


def test_la_boucle_transmet_la_langue_ET_la_projette(srv, monkeypatch):
    """Le piege etait dans la PROJECTION, pas dans l'appel.

    `order.get("lang")` ne leve rien quand `lang` manque a la projection : il
    rend None, et le reperage repart en anglais sans que rien ne le signale.
    Ce test lit la langue reellement transmise.
    """
    commandes = FakeCollection([{
        "id": "o-1", "fulfillment_status": "shipped", "lang": "fr",
        "shipping_info": {"tracking_number": "1234567890123456"},
    }])
    monkeypatch.setattr(srv.db, "orders", commandes, raising=False)
    monkeypatch.setattr(srv, "CANADA_POST_API_KEY", "configure", raising=False)

    vues = []

    async def reperage(pin, lang=None):
        vues.append(lang)
        return _reperage("Objet en cours de livraison")
    monkeypatch.setattr(srv, "_canada_post_track", reperage, raising=False)

    asyncio.run(srv._auto_sync_delivered_orders_once())

    assert vues == ["fr"], "la langue de la commande n'est pas remontee"
    assert commandes.docs[0]["shipping_info"]["cp_statut"] == "Objet en cours de livraison"


# ---------------------------------------------------------------------------
# Le diagnostic de mise en ligne
# ---------------------------------------------------------------------------

def test_LE_DIAGNOSTIC_NE_FUITE_AUCUN_IDENTIFIANT(srv, monkeypatch):
    """LE TEST LE PLUS IMPORTANT DE CE FICHIER.

    Ses cles Postes Canada ne doivent ni entrer dans le depot, ni passer dans
    un journal, ni s'afficher sur un ecran, ni m'etre montrees. Son numero de
    client non plus. Un diagnostic qui expose ce qu'il verifie est pire que
    pas de diagnostic : il transforme une page d'administration en fuite.

    On pose des valeurs reconnaissables et on exige leur ABSENCE partout dans
    la reponse, serialisee en entier.
    """
    import json
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post

    SECRETS = {
        "CANADA_POST_API_KEY": "CLE-SECRETE-AAA111",
        "CANADA_POST_CUSTOMER_NUMBER": "9988776655",
        "CANADA_POST_OAUTH_CLIENT_ID": "ID-CLIENT-BBB222",
        "CANADA_POST_OAUTH_CLIENT_SECRET": "SECRET-CCC333",
        "CANADA_POST_MAILED_BY": "1122334455",
        "CANADA_POST_MOBO": "5544332211",
        "CANADA_POST_ORIGIN_POSTAL_CODE": "H2X1Y4",
    }
    for nom, valeur in SECRETS.items():
        monkeypatch.setattr(srv, nom, valeur, raising=False)

    rapport = json.dumps(canada_post.diagnostic_configuration(), ensure_ascii=False)

    for nom, valeur in SECRETS.items():
        # Le code postal d'origine n'est pas un secret, mais le reste l'est.
        if nom == "CANADA_POST_ORIGIN_POSTAL_CODE":
            continue
        assert valeur not in rapport, f"{nom} fuite dans le diagnostic"


def test_le_diagnostic_nomme_ce_qui_manque(srv, monkeypatch):
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post

    for nom in ("CANADA_POST_OAUTH_CLIENT_ID", "CANADA_POST_OAUTH_CLIENT_SECRET",
                "CANADA_POST_API_KEY", "CANADA_POST_CUSTOMER_NUMBER",
                "CANADA_POST_MAILED_BY", "CANADA_POST_MOBO",
                "CANADA_POST_ORIGIN_POSTAL_CODE"):
        monkeypatch.setattr(srv, nom, "", raising=False)
    monkeypatch.setattr(srv, "CANADA_POST_API_MODE", "openapi", raising=False)

    r = canada_post.diagnostic_configuration()

    assert r["configure"] is False
    assert r["verdict"] == "incomplet"
    assert "OAUTH_CLIENT_ID" in r["manquants"]
    assert "ORIGIN_POSTAL_CODE" in r["manquants"]
    # Et il dit que rien ne confirmera une livraison.
    assert any("reperage" in a for a in r["avertissements"])


def test_le_diagnostic_previent_que_le_chemin_xml_est_eteint(srv, monkeypatch):
    """Postes Canada a cesse de servir XML et SOAP le 30 avril 2026."""
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post

    monkeypatch.setattr(srv, "CANADA_POST_API_MODE", "legacy", raising=False)
    monkeypatch.setattr(srv, "CANADA_POST_OAUTH_CLIENT_ID", "", raising=False)
    monkeypatch.setattr(srv, "CANADA_POST_OAUTH_CLIENT_SECRET", "", raising=False)

    r = canada_post.diagnostic_configuration()

    assert r["mode_retenu"].startswith("legacy")
    assert any("30 avril 2026" in a for a in r["avertissements"])
    assert r["verdict"] == "incomplet"


def test_le_diagnostic_annonce_le_format_4x6(srv):
    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post
    assert canada_post.diagnostic_configuration()["format_etiquette"] == "4x6, PDF"


def test_la_route_du_diagnostic_est_BRANCHEE_dans_l_application(srv):
    """Ecrire un point d'acces et oublier de le brancher ne leve rien.

    Ce depot en a donne quatre exemples le 18/10/2026 seul : une route de
    suivi qu'aucun ecran n'appelait, un champ lu jamais ecrit, un remplissage
    vise sur un slug inexistant, un `lang` absent d'une projection. Chaque
    fois, aucune erreur — juste une fonction qui ne sert a rien.

    Un diagnostic de mise en ligne injoignable serait l'ironie complete.
    """
    chemins = {getattr(r, "path", "") for r in srv.app.routes}
    assert "/api/admin/canada-post/diagnostic" in chemins
