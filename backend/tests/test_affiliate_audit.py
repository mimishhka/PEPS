# -*- coding: utf-8 -*-
"""Tests des six regles que l'audit a trouvees non appliquees.

Chacune de ces regles a survecu longtemps parce que RIEN ne la verifiait. Les
correctifs sans ces tests ne valent que jusqu'a la prochaine refonte : c'est la
regression silencieuse qui est le vrai probleme, pas le defaut initial.

Meme style que test_affiliate_h4.py : doublures en memoire, aucune base, aucun
reseau. Chaque test doit pouvoir tourner en une seconde sur n'importe quelle
machine.
"""
import asyncio
import importlib
import os
import sys
import types

import pytest
from fastapi import HTTPException

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


# ---------------------------------------------------------------------------
# 1. Le palier : plancher sans entente, FIGE avec entente
# ---------------------------------------------------------------------------

def test_palier_sans_entente_est_un_plancher(server_module):
    """Sans entente, un palier manuel garantit un minimum sans bloquer la montee."""
    from services.affiliate import _palier_effectif
    # Force bronze, chiffre d'affaires de niveau or -> l'affilie garde or.
    assert _palier_effectif("bronze", "gold", False) == "gold"
    # Force or, chiffre d'affaires faible -> le plancher tient.
    assert _palier_effectif("gold", "standard", False) == "gold"


def test_palier_avec_entente_est_fige(server_module):
    """Sous entente, le palier ne bouge NI a la hausse NI a la baisse.

    C'est le sens de l'engagement pris : un taux convenu ne se renegocie pas
    tout seul parce que le volume a change.
    """
    from services.affiliate import _palier_effectif
    assert _palier_effectif("bronze", "gold", True) == "bronze"
    assert _palier_effectif("diamond", "standard", True) == "diamond"


def test_metrics_projette_tier_agreement(server_module):
    """La projection Mongo DOIT ramener tier_agreement.

    Le defaut ne se voyait pas a la lecture : la fonction lisait bien
    `affiliate.get("tier_agreement")`, mais la projection ne demandait que
    `manual_tier`. Le champ etait donc toujours absent, `bool(None)` valait
    False, et AUCUNE entente n'a jamais fige quoi que ce soit — sur le chemin
    qui fixe le taux de chaque commission.

    On capture la projection reellement transmise. Le reste de la fonction
    demande une base complete ; peu importe qu'elle aboutisse, l'assertion
    porte sur l'appel deja effectue.
    """
    import services.affiliate as aff_mod

    captures = {}

    class Affiliates:
        async def find_one(self, query, projection=None):
            captures["projection"] = projection or {}
            return {"manual_tier": "bronze", "tier_agreement": True}

    server_module.db = types.SimpleNamespace(affiliates=Affiliates())
    try:
        asyncio.run(aff_mod._affiliate_compute_metrics("aff-1"))
    except Exception:
        # La suite de la fonction a besoin d'autres collections : sans objet ici.
        pass

    assert "projection" in captures, "find_one n'a jamais ete appele"
    assert captures["projection"].get("tier_agreement") == 1, (
        "tier_agreement absent de la projection : les ententes ne figeront pas"
    )


# ---------------------------------------------------------------------------
# 2. Une commission DEJA VERSEE doit etre reprise
# ---------------------------------------------------------------------------

class ReferralsReversal:
    """Doublure minimale pour affiliate_on_order_reversed."""

    def __init__(self, docs):
        self.docs = docs

    async def update_many(self, query, update):
        cible = update.get("$set", {})
        statuts = query.get("status", {}).get("$in", [])
        for doc in self.docs:
            if doc.get("order_id") == query.get("order_id") and doc.get("status") in statuts:
                doc.update(cible)
        return types.SimpleNamespace(matched_count=len(self.docs))

    def find(self, query, projection=None):
        statut = query.get("status")
        trouves = [d for d in self.docs
                   if d.get("order_id") == query.get("order_id") and d.get("status") == statut]

        class Curseur:
            async def to_list(self, _n):
                return [dict(d) for d in trouves]

        return Curseur()

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc.get("id") == query.get("id"):
                doc.update(update.get("$set", {}))
        return types.SimpleNamespace(modified_count=1)


def test_commission_deja_versee_est_reprise(server_module):
    """`paid` etait hors du filtre : le client etait rembourse, l'affilie gardait tout.

    Le versement est irreversible, donc on ne peut pas reprendre l'argent —
    mais la commission doit sortir des totaux et du calcul de palier, et la
    creance doit rester chiffree et retrouvable.
    """
    import services.affiliate as aff_mod

    docs = [
        {"id": "r1", "order_id": "o-1", "status": "approved", "commission_amount": 12.0},
        {"id": "r2", "order_id": "o-1", "status": "paid", "commission_amount": 30.0,
         "affiliate_id": "aff-1"},
    ]
    server_module.db = types.SimpleNamespace(affiliate_referrals=ReferralsReversal(docs))
    asyncio.run(aff_mod.affiliate_on_order_reversed("o-1", full=True))

    assert docs[0]["status"] == "reversed"
    assert docs[1]["status"] == "reversed", "la commission deja versee n'a pas ete reprise"
    assert docs[1]["clawback_pending"] is True
    assert docs[1]["clawback_amount"] == 30.0
    assert docs[1]["reversed_after_payout"] is True


# ---------------------------------------------------------------------------
# 5. Un alias DESACTIVE n'accorde plus de rabais
# ---------------------------------------------------------------------------

def _coupon_affilie(code):
    return {"code": code, "active": True, "source": "affiliate",
            "affiliate_id": "aff-1", "discount_type": "percent",
            "value": 10.0, "min_subtotal": 0}


def _affilie_avec_alias(alias_actif):
    class Affiliates:
        async def find_one(self, query, projection=None):
            return {"status": "active", "code": "NEW20",
                    "aliases": [{"code": "OLD10", "active": alias_actif}]}

    return types.SimpleNamespace(affiliates=Affiliates())


def test_alias_desactive_refuse_le_rabais(server_module):
    """L'ecran promet que desactiver un alias coupe l'attribution ET le rabais.

    Il n'ecrivait que dans `affiliates` ; le rabais vit dans `coupons`. Un
    ancien code genereux desactive parce qu'il circulait continuait d'accorder
    sa remise, et SANS commission — donc sans rien d'anormal dans les
    tableaux de bord. La perte n'apparaissait que dans la marge.
    """
    server_module.db = _affilie_avec_alias(alias_actif=False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module._coupon_discount(_coupon_affilie("OLD10"), 100.0))
    assert exc.value.status_code == 400


def test_alias_actif_accorde_toujours_le_rabais(server_module):
    """Le pendant du test precedent : on ne coupe QUE ce qui est desactive.

    Sans cette verification, un correctif trop large casserait les liens deja
    distribues — ce que les conditions promettent explicitement de preserver.
    """
    server_module.db = _affilie_avec_alias(alias_actif=True)
    remise, _applique = asyncio.run(
        server_module._coupon_discount(_coupon_affilie("OLD10"), 100.0))
    assert remise == 10.0


# ---------------------------------------------------------------------------
# 6. Le courriel de report doit dire le BON motif
# ---------------------------------------------------------------------------

def test_report_pour_prix_ne_parle_pas_de_seuil(server_module, monkeypatch):
    """Un prix de stablecoin hors bande empruntait le message « sous le seuil ».

    Un affilie a qui l'on devait 340 $ lisait que 340,00 $ est inferieur a
    25,00 $, et qu'il lui restait « 0,00 $ CAD a generer » — puisque
    max(0, seuil - montant) vaut zero quand le montant depasse le seuil.
    """
    import services.affiliate as aff_mod

    envoyes = []

    class Deferrals:
        async def insert_one(self, doc):
            return types.SimpleNamespace(inserted_id="x")

        async def update_one(self, query, update):
            return types.SimpleNamespace(modified_count=1)

    async def faux_envoi(destinataire, sujet, html):
        envoyes.append({"sujet": sujet, "html": html})

    server_module.db = types.SimpleNamespace(affiliate_payout_deferrals=Deferrals())
    monkeypatch.setattr(server_module, "_send_email", faux_envoi, raising=False)

    aff = {"id": "aff-1", "email": "a@example.com", "first_name": "Marie",
           "preferred_lang": "fr", "code": "MARIE10"}
    asyncio.run(aff_mod._defer_affiliate_payout_below_threshold(
        aff, "2026-07", 340.0, 4, 25.0, motif="prix"))

    assert envoyes, "aucun courriel mis en file"
    corps = envoyes[0]["html"]

    # On vise la PHRASE trompeuse, pas une suite de caracteres.
    #
    # Premiere version de ce test : `"0.00" not in corps`. Elle echouait sur un
    # code pourtant correct, parce que le montant du — "340.00 $ CAD" — contient
    # lui-meme "0.00". Une assertion qui se declenche sur la donnee legitime ne
    # prouve rien et fait perdre du temps a celui qui la lit.
    assert "seuil minimum" not in corps, "le message du seuil est reutilise a tort"
    assert "a generer" not in corps and "à générer" not in corps, (
        "« il vous reste X a generer » n'a aucun sens quand le solde depasse le seuil"
    )
    # Le montant du doit apparaitre en entier : c'est tout le propos du message.
    assert "340.00" in corps
    assert "précaution" in corps


def test_report_sous_le_seuil_garde_son_message(server_module, monkeypatch):
    """Le cas d'origine ne doit pas avoir change."""
    import services.affiliate as aff_mod

    envoyes = []

    class Deferrals:
        async def insert_one(self, doc):
            return types.SimpleNamespace(inserted_id="x")

        async def update_one(self, query, update):
            return types.SimpleNamespace(modified_count=1)

    async def faux_envoi(destinataire, sujet, html):
        envoyes.append({"sujet": sujet, "html": html})

    server_module.db = types.SimpleNamespace(affiliate_payout_deferrals=Deferrals())
    monkeypatch.setattr(server_module, "_send_email", faux_envoi, raising=False)

    aff = {"id": "aff-2", "email": "b@example.com", "first_name": "Luc",
           "preferred_lang": "fr", "code": "LUC10"}
    asyncio.run(aff_mod._defer_affiliate_payout_below_threshold(
        aff, "2026-07", 8.0, 1, 25.0))

    assert envoyes
    assert "seuil" in envoyes[0]["html"]


# ---------------------------------------------------------------------------
# 3. Le webhook de versement traite TOUT le lot
# ---------------------------------------------------------------------------

class PayoutsLot:
    """Collection de versements partageant un meme np_batch_id."""

    def __init__(self, docs):
        self.docs = docs

    def find(self, query, projection=None):
        batch = query.get("np_batch_id")
        trouves = [{"id": d["id"]} for d in self.docs if d.get("np_batch_id") == batch]

        class Curseur:
            async def to_list(self, _n):
                return trouves

        return Curseur()

    async def update_many(self, query, update):
        ids = query.get("id", {}).get("$in", [])
        for d in self.docs:
            if d["id"] in ids:
                d.update(update.get("$set", {}))
        return types.SimpleNamespace(modified_count=len(ids))


class ReferralsLot:
    def __init__(self, docs):
        self.docs = docs

    async def update_many(self, query, update):
        ids = query.get("payout_id", {}).get("$in", [])
        statut = query.get("status")
        touches = 0
        for d in self.docs:
            if d.get("payout_id") not in ids:
                continue
            if isinstance(statut, dict):
                if d.get("status") not in statut.get("$in", []):
                    continue
            elif statut is not None and d.get("status") != statut:
                continue
            d.update(update.get("$set", {}))
            touches += 1
        return types.SimpleNamespace(modified_count=touches)


class RequeteWebhook:
    def __init__(self, corps=b"{}"):
        self._corps = corps
        self.headers = {"x-nowpayments-sig": "peu-importe"}
        self.client = None

    async def body(self):
        return self._corps


def _prepare_webhook(server_module, monkeypatch, payload):
    """Neutralise tout ce qui n'est pas l'objet du test.

    La signature HMAC et la deduplication ne sont pas ce qu'on verifie ici —
    reproduire la canonicalisation exacte rendrait le test fragile sans rien
    prouver de plus sur le comportement qui nous interesse : le traitement de
    TOUS les versements du lot.
    """
    import services.nowpayments as np_mod

    async def pas_de_limite(*a, **k):
        return None

    async def evenement_neuf(*a, **k):
        return True

    monkeypatch.setattr(server_module, "_rate_limit", pas_de_limite, raising=False)
    monkeypatch.setattr(server_module, "_client_ip", lambda r: "1.2.3.4", raising=False)
    monkeypatch.setattr(server_module, "_register_webhook_event", evenement_neuf,
                        raising=False)
    monkeypatch.setattr(server_module, "NOWPAYMENTS_IPN_SECRET", "secret", raising=False)
    monkeypatch.setattr(np_mod, "_verify_nowpayments_signature",
                        lambda raw, sig: (payload, b"{}"), raising=False)
    return np_mod


def test_webhook_lot_confirme_TOUS_les_versements(server_module, monkeypatch):
    """`find_one` ne traitait qu'un versement sur douze.

    admin_affiliate_batch_payout pose le MEME np_batch_id sur tout le lot. Le
    webhook en prenait un seul : les autres restaient « processing » a vie
    alors que la crypto etait partie, et leurs commissions gardaient un
    payout_id non nul — donc invisibles pour le generateur suivant. Ni
    reversees, ni re-payees.
    """
    np_mod = _prepare_webhook(server_module, monkeypatch,
                              {"id": "batch-9", "status": "finished"})

    payouts = [
        {"id": "p1", "np_batch_id": "batch-9", "status": "processing"},
        {"id": "p2", "np_batch_id": "batch-9", "status": "processing"},
        {"id": "p3", "np_batch_id": "batch-9", "status": "processing"},
    ]
    referrals = [
        {"id": "r1", "payout_id": "p1", "status": "approved"},
        {"id": "r2", "payout_id": "p2", "status": "approved"},
        {"id": "r3", "payout_id": "p3", "status": "approved"},
    ]
    server_module.db = types.SimpleNamespace(
        affiliate_payouts=PayoutsLot(payouts),
        affiliate_referrals=ReferralsLot(referrals),
    )

    asyncio.run(np_mod.nowpayments_payout_ipn(RequeteWebhook()))

    assert [p["status"] for p in payouts] == ["paid", "paid", "paid"]
    assert [r["status"] for r in referrals] == ["paid", "paid", "paid"]


def test_webhook_lot_en_echec_libere_les_commissions(server_module, monkeypatch):
    """Un lot en echec laissait les commissions rattachees a un versement mort.

    Le generateur filtre sur `payout_id: None` : sans cette remise a zero, de
    l'argent du restait immobilise sans qu'aucun ecran ne le signale.
    """
    np_mod = _prepare_webhook(server_module, monkeypatch,
                              {"id": "batch-7", "status": "failed"})

    payouts = [
        {"id": "p1", "np_batch_id": "batch-7", "status": "processing"},
        {"id": "p2", "np_batch_id": "batch-7", "status": "processing"},
    ]
    referrals = [
        {"id": "r1", "payout_id": "p1", "status": "approved"},
        {"id": "r2", "payout_id": "p2", "status": "approved"},
    ]
    server_module.db = types.SimpleNamespace(
        affiliate_payouts=PayoutsLot(payouts),
        affiliate_referrals=ReferralsLot(referrals),
    )

    asyncio.run(np_mod.nowpayments_payout_ipn(RequeteWebhook()))

    assert [p["status"] for p in payouts] == ["failed", "failed"]
    assert all(r["payout_id"] is None for r in referrals), (
        "les commissions restent liees a un versement mort"
    )


# ---------------------------------------------------------------------------
# 4. L'invitation ne leve PAS une suspension
# ---------------------------------------------------------------------------

def test_invitation_refuse_un_affilie_suspendu(server_module):
    """admin_affiliate_resend refusait deja ; l'invitation, non.

    Elle ne rejetait que « active » — et ecrit `status: "invited"` plus bas.
    Reinviter l'adresse d'un affilie suspendu levait donc sa sanction et lui
    envoyait un lien pour se reactiver lui-meme.
    """
    class Affiliates:
        async def find_one(self, query, projection=None):
            return {"id": "aff-1", "email": "marie@example.com",
                    "status": "suspended", "code": "MARIE10"}

    server_module.db = types.SimpleNamespace(affiliates=Affiliates())
    payload = server_module.AffiliateInviteIn(
        email="marie@example.com", first_name="Marie", last_name="Tremblay",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_affiliate_invite(
            payload, {"email": "admin@example.com"}))
    assert exc.value.status_code == 409
    assert "suspended" in str(exc.value.detail).lower()


def test_invitation_refuse_toujours_un_affilie_actif(server_module):
    """La garde d'origine ne doit pas avoir ete perdue en ajoutant la nouvelle."""
    class Affiliates:
        async def find_one(self, query, projection=None):
            return {"id": "aff-2", "email": "luc@example.com", "status": "active"}

    server_module.db = types.SimpleNamespace(affiliates=Affiliates())
    payload = server_module.AffiliateInviteIn(
        email="luc@example.com", first_name="Luc", last_name="Gagnon",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_affiliate_invite(
            payload, {"email": "admin@example.com"}))
    assert exc.value.status_code == 409


# ---------------------------------------------------------------------------
# 7. Le versement manuel refuse une devise ou un reseau non supporte
# ---------------------------------------------------------------------------

def test_execute_refuse_une_devise_non_supportee(server_module, monkeypatch):
    """Le repli `or "btc"` pouvait demander l'envoi de 250 BTC pour 250 $ CAD.

    Pour une devise hors AFFILIATE_PAYOUT_CURRENCIES, _affiliate_payout_amounts
    renvoie le montant CANADIEN tel quel comme quantite de jetons.
    """
    monkeypatch.setattr(server_module, "NOWPAYMENTS_PAYOUT_ENABLED", True,
                        raising=False)

    class Payouts:
        async def find_one(self, query, projection=None):
            return {"id": "p-9", "status": "ready", "amount": 250.0,
                    "currency": "btc", "payout_address": "bc1qtest",
                    "affiliate_code": "AFF", "period": "2026-08"}

    server_module.db = types.SimpleNamespace(affiliate_payouts=Payouts())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_payout_execute(
            "p-9", {"email": "admin@example.com"}))
    assert exc.value.status_code == 400


def test_execute_refuse_un_reseau_inconnu(server_module, monkeypatch):
    """Une devise valide ne suffit pas : l'adresse doit designer un reseau connu.

    Le chemin en lot refusait deja d'envoyer sans correspondance
    (jeton, reseau) explicite — un envoi sur le mauvais reseau est
    irreversible. Le versement unitaire transmettait « usdt » nu.
    """
    monkeypatch.setattr(server_module, "NOWPAYMENTS_PAYOUT_ENABLED", True,
                        raising=False)

    class Payouts:
        async def find_one(self, query, projection=None):
            return {"id": "p-10", "status": "ready", "amount": 100.0,
                    "currency": "usdt", "payout_address": "adresse-invalide",
                    "affiliate_code": "AFF", "period": "2026-08"}

    server_module.db = types.SimpleNamespace(affiliate_payouts=Payouts())
    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_payout_execute(
            "p-10", {"email": "admin@example.com"}))
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# 8. Un rabais de 0 % est refuse
# ---------------------------------------------------------------------------

def test_rabais_nul_est_refuse(server_module):
    """0 % renommait le code sans creer de coupon : le nouveau code etait mort.

    Pendant ce temps l'ancien restait actif a son taux d'origine — l'inverse
    exact du geste de l'administrateur.
    """
    class Affiliates:
        async def find_one(self, query, projection=None):
            return {"id": "aff-1", "email": "marie@example.com",
                    "status": "active", "code": "MARIE10", "coupon_percent": 10.0}

    server_module.db = types.SimpleNamespace(affiliates=Affiliates())
    payload = server_module.AffiliateAdminUpdateIn(coupon_percent=0)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(server_module.admin_affiliate_update(
            "aff-1", payload, {"email": "admin@example.com"}))
    assert exc.value.status_code == 400
