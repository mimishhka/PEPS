"""Corriger une adresse que Postes Canada refuse.

Mireille : « qu'arrive-t-il si une adresse n'est pas formatee pour Postes
Canada ? Je n'ai aucun moyen de la modifier pour faire l'envoi du colis. »

Elle avait raison, et c'etait le plus couteux des trous silencieux : l'admin
AFFICHAIT l'adresse d'une commande sans jamais permettre de la modifier. Une
commande payee dont l'adresse etait refusee par le transporteur — province
illisible, code postal mal forme — etait bloquee DEFINITIVEMENT. Le seul
recours etait de rembourser. Une vente perdue a chaque fois.

Ces tests gardent les trois garde-fous, parce qu'il s'agit d'argent encaisse.
"""
import asyncio
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tests.fake_mongo import FakeCollection  # noqa: E402


ADRESSE_VALIDE = {
    "full_name": "Marie Tremblay",
    "address1": "1250 rue Sainte-Catherine Ouest",
    "address2": "bureau 400",
    "city": "Montréal",
    "province": "QC",
    "postal_code": "H3G 1P1",
    "country": "CA",
    "phone": "5145550123",
}


@pytest.fixture
def serveur(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


ADMIN = {"id": "a-1", "email": "admin@fironova.com", "name": "Admin", "role": "owner"}


def preparer(serveur, commande, journal_casse=False):
    """Pose une commande et un journal d'audit en memoire."""
    serveur.db.orders = FakeCollection([commande])
    serveur.db.admin_audit_log = FakeCollection([])
    if journal_casse:
        async def refuser(*a, **k):
            raise RuntimeError("journal indisponible")
        serveur.db.admin_audit_log.insert_one = refuser
    return serveur.db.orders


def commande(**extra):
    base = {
        "id": "o-1",
        "order_number": "FN-1001",
        "payment_status": "paid",
        "fulfillment_status": "packed",
        "shipping_address": {
            "full_name": "Marie Tremblay",
            "address1": "1250 rue Ste-Catherine",
            "address2": "",
            "city": "Montreal",
            "province": "Quebec",          # <- ce que Postes Canada refuse
            "postal_code": "H3G1P1",
            "country": "CA",
            "phone": "",
        },
        "shipping_info": {},
    }
    base.update(extra)
    return base


def corriger(serveur, adresse=None, motif="Postes Canada refuse la province"):
    payload = serveur.CorrigerAdresseIn(address=adresse or ADRESSE_VALIDE, motif=motif)
    return asyncio.run(serveur.admin_corriger_adresse("o-1", payload, ADMIN))


# ---------------------------------------------------------------- le cas nominal
def test_l_adresse_refusee_devient_corrigeable(serveur):
    """LE COEUR DU DEFAUT : cette operation n'existait pas du tout."""
    orders = preparer(serveur, commande())
    resultat = corriger(serveur)

    assert resultat["ok"] is True
    apres = orders.by_id("o-1")["shipping_address"]
    assert apres["province"] == "QC"
    assert apres["postal_code"] == "H3G 1P1"
    assert apres["address2"] == "bureau 400"


def test_l_ancienne_adresse_est_conservee(serveur):
    """« C'etait quoi, avant » doit rester repondable six mois plus tard."""
    orders = preparer(serveur, commande())
    corriger(serveur, motif="numero civique introuvable")

    hist = orders.by_id("o-1")["shipping_address_history"]
    assert len(hist) == 1
    assert hist[0]["before"]["province"] == "Quebec"
    assert hist[0]["motif"] == "numero civique introuvable"
    assert hist[0]["by"] == "admin@fironova.com"


def test_la_correction_est_tracee_avec_le_detail_du_changement(serveur):
    orders = preparer(serveur, commande())
    corriger(serveur, motif="province illisible")

    traces = asyncio.run(serveur.db.admin_audit_log.find({}).to_list(10))
    assert len(traces) == 1
    detail = traces[0]["detail"]
    assert "FN-1001" in detail
    assert "Quebec" in detail and "QC" in detail
    assert "province illisible" in detail
    assert traces[0]["action"] == "order.shipping_address.corrected"
    assert orders  # la commande existe toujours


# ---------------------------------------------------------------- les garde-fous
def test_une_adresse_invalide_est_refusee_comme_au_checkout(serveur):
    """Corriger vers une autre adresse invalide serait un progres nul. Le
    validateur du modele est le meme que celui du passage en caisse."""
    preparer(serveur, commande())
    with pytest.raises(Exception) as e:
        serveur.CorrigerAdresseIn(
            address={**ADRESSE_VALIDE, "province": "Kebek"},
            motif="essai",
        )
    assert "province" in str(e.value).lower()


def test_pas_de_correction_apres_l_etiquette(serveur):
    """Une etiquette imprimee porte une destination : changer l'adresse sans
    l'annuler ferait partir le colis a l'ancienne."""
    preparer(serveur, commande(shipping_info={
        "label_url": "/uploads/labels/x.pdf", "tracking_number": "1Z999",
    }))
    with pytest.raises(serveur.HTTPException) as e:
        corriger(serveur)
    assert e.value.status_code == 409
    assert "annulez" in str(e.value.detail).lower()


def test_sans_trace_pas_de_correction(serveur):
    """strict=True : une correction qu'on ne peut pas tracer deplace un bien
    vendu sans laisser de preuve. Elle ne doit pas avoir lieu."""
    orders = preparer(serveur, commande(), journal_casse=True)
    with pytest.raises(Exception):
        corriger(serveur)
    # L'adresse n'a PAS bouge : le refus est complet, pas partiel.
    assert orders.by_id("o-1")["shipping_address"]["province"] == "Quebec"


def test_un_motif_vide_est_refuse(serveur):
    """Le motif est la seule chose que la trace ne peut pas deviner."""
    preparer(serveur, commande())
    with pytest.raises(Exception):
        serveur.CorrigerAdresseIn(address=ADRESSE_VALIDE, motif="")


def test_une_correction_qui_ne_change_rien_ne_trace_rien(serveur):
    """Sinon le journal se remplit d'evenements qui n'apprennent rien."""
    depart = commande()
    depart["shipping_address"] = dict(ADRESSE_VALIDE)
    preparer(serveur, depart)

    resultat = corriger(serveur)
    assert resultat.get("unchanged") is True
    traces = asyncio.run(serveur.db.admin_audit_log.find({}).to_list(10))
    assert traces == []


def test_une_commande_inconnue_repond_404(serveur):
    preparer(serveur, commande())
    payload = serveur.CorrigerAdresseIn(address=ADRESSE_VALIDE, motif="essai")
    with pytest.raises(serveur.HTTPException) as e:
        asyncio.run(serveur.admin_corriger_adresse("o-inconnue", payload, ADMIN))
    assert e.value.status_code == 404
