# -*- coding: utf-8 -*-
"""Remboursements et billets clients.

Trois regles ont change, et chacune a sa garde ici :

- une annulation AVANT expedition peut devenir un dossier (elle ne pouvait
  pas : « apres expedition uniquement ») ;
- le delai de 48 h apres livraison est SIGNALE, plus jamais oppose — ni au
  client, ni a l'administration qui ne pouvait meme pas ouvrir de dossier ;
- le « credit boutique », qui n'a jamais existe, n'est plus proposable.

Et les billets clients : un canal general, rattache au compte, que personne
d'autre que son auteur ne peut lire ni prolonger.
"""
import asyncio
import importlib
import os
import sys
import types
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


def _il_y_a(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


# ---------------------------------------------------------------------------
# Recevabilite : ce qui bloque encore, et ce qui ne bloque plus
# ---------------------------------------------------------------------------

def test_annulation_avant_expedition_est_recevable(server_module):
    commande = {"payment_status": "paid", "fulfillment_status": "processing"}
    assert server_module._refund_eligibility_reason(commande) is None


def test_une_demande_tardive_n_est_plus_refusee(server_module):
    commande = {"payment_status": "paid", "fulfillment_status": "delivered",
                "shipping_info": {"delivered_at": _il_y_a(hours=72)}}
    assert server_module._refund_eligibility_reason(commande) is None
    note = server_module._refund_late_note(commande)
    assert note and "72 h" in note and "48 h" in note


def test_dans_le_delai_rien_n_est_signale(server_module):
    commande = {"payment_status": "paid", "fulfillment_status": "delivered",
                "shipping_info": {"delivered_at": _il_y_a(hours=10)}}
    assert server_module._refund_late_note(commande) is None


def test_une_annulation_n_est_jamais_tardive(server_module):
    """Le delai court a partir de la LIVRAISON : une commande pas encore
    expediee ne peut pas etre en retard, meme payee il y a longtemps."""
    commande = {"payment_status": "paid", "fulfillment_status": "processing",
                "paid_at": _il_y_a(days=90)}
    assert server_module._refund_late_note(commande) is None


def test_ce_qui_bloque_encore(server_module):
    assert server_module._refund_eligibility_reason({"payment_status": "awaiting_etransfer"})
    assert server_module._refund_eligibility_reason(
        {"payment_status": "paid", "refund_status": "requested"})
    assert server_module._refund_eligibility_reason(
        {"payment_status": "paid", "refund_status": "approved"})


def test_une_commande_remboursee_ne_peut_pas_etre_marquee_payee(server_module):
    """« Confirm Payment » s'affichait dès que le statut n'était pas « paid »,
    donc aussi sur une commande remboursée. Un clic la remarquait payée et
    envoyait un courriel de paiement confirmé au client qu'on venait de
    rembourser. La garde est au serveur, pas seulement à l'écran."""
    class Orders:
        async def find_one(self, filtre, projection=None):
            return {"id": "o-9", "payment_status": "refunded", "refund_status": "processed"}

    server_module.db = types.SimpleNamespace(orders=Orders())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_confirm_payment("o-9", {"email": "admin@fironova.com"}))
    assert exc.value.status_code == 400
    assert "rembours" in exc.value.detail.lower()


def test_une_commande_deja_remboursee_le_dit(server_module):
    """Cas réel : FN-260901-E8C78986, payée puis remboursée. Le blocage était
    juste, la raison non — « la commande n'est pas payée » à propos d'une
    commande qui a bel et bien été payée. C'est le remboursement qui bloque,
    et c'est ce qu'il faut lire."""
    commande = {"payment_status": "refunded", "fulfillment_status": "refunded",
                "refund_status": "processed"}
    motif = server_module._refund_eligibility_reason(commande)
    assert motif and "remboursée" in motif
    assert "pas payée" not in motif


def test_une_demande_en_cours_reste_distincte_d_un_remboursement_fait(server_module):
    en_cours = server_module._refund_eligibility_reason(
        {"payment_status": "paid", "refund_status": "requested"})
    assert "en cours" in en_cours and "requested" in en_cours


def test_le_credit_boutique_n_est_plus_proposable(server_module):
    """Aucun systeme de credit n'existe : l'approuver enregistrait un
    remboursement en argent avec une reference inventee."""
    with pytest.raises(ValidationError):
        server_module.RefundRequestIn(reason="x" * 12, refund_type="store_credit")
    with pytest.raises(ValidationError):
        server_module.RefundDecisionIn(action="approve", approved_type="store_credit")


def test_le_dossier_porte_ses_signaux(server_module):
    ecrit = {}

    class Orders:
        async def update_one(self, filtre, update):
            ecrit.update(update["$set"])

    server_module.db = types.SimpleNamespace(orders=Orders())
    commande = {"id": "o-1", "payment_status": "paid", "fulfillment_status": "delivered",
                "shipping_info": {"delivered_at": _il_y_a(hours=100)}}
    asyncio.run(server_module._set_refund_requested(
        "o-1", "flacon fissure a la reception", None, "full",
        order=commande, source="client"))
    assert ecrit["refund_status"] == "requested"
    assert ecrit["refund_before_shipping"] is False
    assert ecrit["refund_late"] is True
    assert "100 h" in ecrit["refund_late_note"]
    assert ecrit["refund_source"] == "client"


def test_une_annulation_est_marquee_comme_telle(server_module):
    ecrit = {}

    class Orders:
        async def update_one(self, filtre, update):
            ecrit.update(update["$set"])

    server_module.db = types.SimpleNamespace(orders=Orders())
    asyncio.run(server_module._set_refund_requested(
        "o-2", "erreur de dosage, merci", None, "full",
        order={"id": "o-2", "payment_status": "paid", "fulfillment_status": "processing"},
        source="admin"))
    assert ecrit["refund_before_shipping"] is True
    assert ecrit["refund_late"] is False
    assert ecrit["refund_source"] == "admin"


# ---------------------------------------------------------------------------
# Billets clients
# ---------------------------------------------------------------------------

class _Tickets:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one_and_update(self, filtre, update, projection=None, return_document=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in filtre.items()):
                pousse = (update.get("$push") or {}).get("messages")
                if pousse:
                    d["messages"].append(pousse)
                d.update(update.get("$set") or {})
                return dict(d)
        return None


def _preparer(server_module, monkeypatch):
    tickets = _Tickets()
    envois = []

    async def rien(*a, **k):
        return None

    async def envoyer(dest, sujet, html, *a, **k):
        envois.append((dest, sujet))

    monkeypatch.setattr(server_module, "_rate_limit", rien)
    monkeypatch.setattr(server_module, "_send_email", envoyer)
    server_module.db = types.SimpleNamespace(customer_tickets=tickets)
    return tickets, envois


_MARIE = {"id": "u-1", "email": "marie@example.com", "name": "Marie Tremblay"}


def test_un_client_ouvre_un_billet_sans_commande(server_module, monkeypatch):
    tickets, envois = _preparer(server_module, monkeypatch)
    charge = server_module.CustomerTicketIn(
        subject="Délai de livraison", body="Combien de temps pour Gaspé ?")
    doc = asyncio.run(server_module.customer_ticket_create(charge, _MARIE))
    assert doc["user_id"] == "u-1"
    assert doc["status"] == "open"
    assert doc["messages"][0]["from"] == "customer"
    assert "order_id" not in doc                      # rattache au compte, pas a une commande
    assert any("Nouveau billet client" in sujet for _, sujet in envois)


def test_personne_d_autre_ne_peut_ecrire_dans_le_billet(server_module, monkeypatch):
    tickets, _ = _preparer(server_module, monkeypatch)
    charge = server_module.CustomerTicketIn(
        subject="Délai de livraison", body="Combien de temps pour Gaspé ?")
    doc = asyncio.run(server_module.customer_ticket_create(charge, _MARIE))
    intrus = {"id": "u-2", "email": "autre@example.com"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.customer_ticket_reply(
            doc["id"], server_module.AffiliateTicketReplyIn(body="je lis ton billet"), intrus))
    assert exc.value.status_code == 404


def test_repondre_rouvre_et_l_equipe_previent_le_client(server_module, monkeypatch):
    tickets, envois = _preparer(server_module, monkeypatch)
    charge = server_module.CustomerTicketIn(
        subject="Délai de livraison", body="Combien de temps pour Gaspé ?")
    doc = asyncio.run(server_module.customer_ticket_create(charge, _MARIE))

    rep = asyncio.run(server_module.admin_customer_ticket_reply(
        doc["id"], server_module.AffiliateTicketReplyIn(body="Trois jours ouvrables."),
        {"id": "adm-1"}))
    assert rep["status"] == "pending"
    assert any(dest == "marie@example.com" for dest, _ in envois)

    asyncio.run(server_module.admin_customer_ticket_status(
        doc["id"], server_module.AffiliateTicketStatusIn(status="resolved")))
    suite = asyncio.run(server_module.customer_ticket_reply(
        doc["id"], server_module.AffiliateTicketReplyIn(body="Et pour les Îles ?"), _MARIE))
    assert suite["status"] == "open"
    assert len(suite["messages"]) == 3


# ---------------------------------------------------------------------------
# Ou renvoyer l'argent
# ---------------------------------------------------------------------------

def _capturer_dossier(server_module):
    ecrit = {}

    class Orders:
        async def update_one(self, filtre, update):
            ecrit.update(update["$set"])

    server_module.db = types.SimpleNamespace(orders=Orders())
    return ecrit


def test_interac_revient_a_l_adresse_de_la_commande(server_module):
    """Nous connaissons cette adresse : c'est celle a qui la confirmation est
    partie. Elle sert de defaut, et reste modifiable."""
    ecrit = _capturer_dossier(server_module)
    asyncio.run(server_module._set_refund_requested(
        "o-1", "je souhaite annuler", None, "full",
        order={"id": "o-1", "payment_status": "paid", "fulfillment_status": "processing",
               "payment_method": "interac", "email": "marie@example.com"}))
    assert ecrit["refund_destination"] == "marie@example.com"
    assert ecrit["refund_destination_type"] == "interac_email"


def test_crypto_sans_adresse_reste_vide_et_le_dit(server_module):
    """NOWPayments nous dit qu'un depot est arrive, jamais de quel
    portefeuille : il n'y a pas de defaut honnete a inventer."""
    ecrit = _capturer_dossier(server_module)
    asyncio.run(server_module._set_refund_requested(
        "o-2", "je souhaite annuler", None, "full",
        order={"id": "o-2", "payment_status": "paid", "fulfillment_status": "processing",
               "payment_method": "nowpayments", "email": "marie@example.com"}))
    assert ecrit["refund_destination"] == ""
    assert ecrit["refund_destination_type"] == "crypto_address"


def test_l_adresse_donnee_par_le_client_est_conservee(server_module):
    ecrit = _capturer_dossier(server_module)
    asyncio.run(server_module._set_refund_requested(
        "o-3", "je souhaite annuler", None, "full",
        order={"id": "o-3", "payment_status": "paid", "fulfillment_status": "processing",
               "payment_method": "nowpayments", "email": "marie@example.com"},
        destination="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"))
    assert ecrit["refund_destination"] == "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"


# ---------------------------------------------------------------------------
# Les commandes d'un billet
# ---------------------------------------------------------------------------

def test_les_commandes_du_billet_portent_ce_qui_bloque(server_module):
    """Une commande non eligible reste proposee, avec sa raison : l'ecran la
    desactive au lieu d'echouer apres le clic."""
    class Tickets:
        async def find_one(self, filtre, projection=None):
            return {"user_id": "u-1", "customer_email": "Marie@Example.com"}

    class Curseur:
        def __init__(self, docs):
            self.docs = docs

        def sort(self, *a):
            return self

        async def to_list(self, n):
            return [dict(d) for d in self.docs]

    capture = {}

    class Orders:
        def find(self, filtre, projection=None):
            capture["filtre"] = filtre
            return Curseur([
                {"id": "o-1", "order_number": "FN-1", "payment_status": "paid",
                 "fulfillment_status": "processing"},
                {"id": "o-2", "order_number": "FN-2", "payment_status": "cancelled",
                 "fulfillment_status": "cancelled"},
            ])

    server_module.db = types.SimpleNamespace(customer_tickets=Tickets(), orders=Orders())
    res = asyncio.run(server_module.admin_customer_ticket_orders("t-1"))
    assert res["items"][0]["refund_blocked_reason"] is None
    assert "pas payée" in res["items"][1]["refund_blocked_reason"]
    # Le client est retrouve par son compte OU par son courriel, en minuscules.
    assert {"user_id": "u-1"} in capture["filtre"]["$or"]
    assert {"email": "marie@example.com"} in capture["filtre"]["$or"]
