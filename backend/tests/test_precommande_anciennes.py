"""Une precommande oubliee finit par se signaler.

MIREILLE, 30/09/2026, sur les consequences d'une precommande : la commission
de l'affilie est acquise sept jours apres la commande, donc bien avant la
livraison.

Le danger propre a une precommande qui n'arrive JAMAIS, c'est qu'elle ne
produit aucun signal. Elle n'est dans aucune file de dispatch — c'est voulu,
on n'emballe pas ce qu'on n'a pas. Elle echappe a l'annulation automatique,
qui ne vise que les impayees. Et le client ne reclame pas toujours. Elle peut
donc dormir indefiniment, alors que son argent de commission est deja sorti.

Deux causes possibles, et l'alerte permet de les distinguer : le lot a du
retard et il faut prevenir le client ; ou la fiche produit est restee
« bientot » par oubli, et la commande ne partira jamais toute seule.
"""
import asyncio
import importlib
import os
import sys
import types
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def mod(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


class Resultat:
    def __init__(self, n):
        self.modified_count = n


class Commandes:
    """Applique vraiment le filtre : `$lt` sur la date et `None` sur le
    marqueur d'alerte. Sans cela, le test ne distinguerait pas « la requete
    est juste » de « la fonction a appele find »."""

    def __init__(self, documents):
        self.documents = {d["id"]: dict(d) for d in documents}

    def find(self, filtre, projection=None):
        retenus = []
        for doc in self.documents.values():
            garde = True
            for champ, attendu in filtre.items():
                valeur = doc.get(champ)
                if isinstance(attendu, dict) and "$lt" in attendu:
                    if not valeur or str(valeur) >= str(attendu["$lt"]):
                        garde = False
                elif attendu is None:
                    # Mongo : None matche aussi un champ ABSENT.
                    if valeur is not None:
                        garde = False
                elif valeur != attendu:
                    garde = False
                if not garde:
                    break
            if garde:
                retenus.append(dict(doc))

        class Curseur:
            async def to_list(self, n):
                return retenus[: (n or len(retenus))]

        return Curseur()

    async def update_many(self, filtre, update):
        ids = filtre.get("id", {}).get("$in", [])
        for i in ids:
            if i in self.documents:
                self.documents[i].update(update.get("$set") or {})
        return Resultat(len(ids))


def brancher(mod, monkeypatch, documents, courriels=None):
    base = types.SimpleNamespace(orders=Commandes(documents))
    monkeypatch.setattr(mod, "db", base, raising=False)

    envoyes = courriels if courriels is not None else []

    async def faux_envoi(to, subject, body):
        envoyes.append({"to": to, "subject": subject, "body": body})

    monkeypatch.setattr(mod, "_send_email", faux_envoi, raising=False)
    return base, envoyes


def il_y_a(jours):
    return (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat()


def precommande(id_, jours, **surcharge):
    doc = {
        "id": id_,
        "order_number": f"FN-{id_}",
        "email": "cliente@example.com",
        "payment_status": "paid",
        "fulfillment_status": "preorder",
        "paid_at": il_y_a(jours),
        "items": [{"slug": "bpc157", "name_en": "BPC-157", "preorder": True}],
    }
    doc.update(surcharge)
    return doc


def alerter(mod):
    return asyncio.run(mod._alerter_precommandes_anciennes())


# ===========================================================================
# CE QUI DOIT ALERTER
# ===========================================================================

def test_une_precommande_qui_dort_depuis_deux_mois_alerte(mod, monkeypatch):
    base, envoyes = brancher(mod, monkeypatch, [precommande("1", 60)])

    assert alerter(mod) == 1
    assert len(envoyes) == 1
    assert "FN-1" in envoyes[0]["body"]
    # L'article attendu figure dans l'alerte : sans lui il faut ouvrir la
    # commande pour savoir quel lot est en retard.
    assert "BPC-157" in envoyes[0]["body"]


def test_l_alerte_rappelle_que_la_commission_est_deja_sortie(mod, monkeypatch):
    """C'est l'information qui donne son urgence au message.

    Une precommande en retard n'est pas qu'un desagrement client : la
    commission a ete versee sept jours apres la commande, sur une vente qui
    n'est pas encore honoree.
    """
    base, envoyes = brancher(mod, monkeypatch, [precommande("1", 60)])
    alerter(mod)
    assert "commission" in envoyes[0]["body"].lower()


def test_l_alerte_distingue_un_envoi_de_suite(mod, monkeypatch):
    """Savoir que la precommande vient d'une commande scindee change l'action :
    le client a deja recu une partie de sa commande."""
    base, envoyes = brancher(
        mod, monkeypatch,
        [precommande("1-P", 45, suite_of_order_number="FN-1")])
    alerter(mod)
    assert "FN-1" in envoyes[0]["body"]


def test_plusieurs_precommandes_tiennent_dans_un_seul_courriel(mod, monkeypatch):
    """Un courriel par commande noierait la boite de Mireille, et le
    quatrieme serait ignore."""
    base, envoyes = brancher(
        mod, monkeypatch,
        [precommande("1", 60), precommande("2", 45), precommande("3", 90)])

    assert alerter(mod) == 3
    assert len(envoyes) == 1
    for numero in ("FN-1", "FN-2", "FN-3"):
        assert numero in envoyes[0]["body"]


# ===========================================================================
# CE QUI NE DOIT PAS ALERTER
# ===========================================================================

def test_une_precommande_recente_n_alerte_pas(mod, monkeypatch):
    """Le seuil vaut trente jours : une precommande de la semaine derniere
    suit son cours normal, et l'annoncer serait du bruit."""
    base, envoyes = brancher(mod, monkeypatch, [precommande("1", 5)])
    assert alerter(mod) == 0
    assert envoyes == []


def test_une_precommande_IMPAYEE_n_alerte_pas(mod, monkeypatch):
    """L'annulation automatique s'en occupe deja, elle, et sans commission
    versee il n'y a rien a proteger."""
    base, envoyes = brancher(
        mod, monkeypatch,
        [precommande("1", 60, payment_status="awaiting_etransfer")])
    assert alerter(mod) == 0


def test_une_commande_LIBEREE_n_alerte_pas(mod, monkeypatch):
    """Elle est passee en preparation : elle est dans le dispatch, donc
    visible, donc plus besoin d'alerte."""
    base, envoyes = brancher(
        mod, monkeypatch,
        [precommande("1", 60, fulfillment_status="processing")])
    assert alerter(mod) == 0


def test_une_commande_annulee_n_alerte_pas(mod, monkeypatch):
    base, envoyes = brancher(
        mod, monkeypatch,
        [precommande("1", 60, fulfillment_status="cancelled")])
    assert alerter(mod) == 0


# ===========================================================================
# ALERTER UNE SEULE FOIS
# ===========================================================================

def test_la_meme_precommande_n_alerte_qu_une_fois(mod, monkeypatch):
    """Une alerte toutes les cinq minutes serait ignoree au bout d'une heure,
    ce qui vaut MOINS que pas d'alerte du tout."""
    base, envoyes = brancher(mod, monkeypatch, [precommande("1", 60)])

    assert alerter(mod) == 1
    assert alerter(mod) == 0
    assert len(envoyes) == 1


def test_le_marqueur_est_pose_sur_la_commande(mod, monkeypatch):
    base, envoyes = brancher(mod, monkeypatch, [precommande("1", 60)])
    alerter(mod)
    assert base.orders.documents["1"]["preorder_stale_alerted_at"]


def test_un_courriel_en_echec_ne_perd_pas_l_alerte(mod, monkeypatch):
    """Le marqueur est pose APRES l'envoi : si l'envoi echoue, la prochaine
    passe reessaie plutot que de perdre l'alerte en silence."""
    base, _ = brancher(mod, monkeypatch, [precommande("1", 60)])

    async def envoi_casse(*a, **k):
        raise RuntimeError("SMTP indisponible")

    monkeypatch.setattr(mod, "_send_email", envoi_casse, raising=False)

    assert alerter(mod) == 0
    assert base.orders.documents["1"].get("preorder_stale_alerted_at") is None

    # Et la passe suivante, une fois le courrier retabli, alerte bien.
    envoyes = []

    async def envoi_ok(to, subject, body):
        envoyes.append(subject)

    monkeypatch.setattr(mod, "_send_email", envoi_ok, raising=False)
    assert alerter(mod) == 1
    assert len(envoyes) == 1


# ===========================================================================
# LE SEUIL EST REGLABLE
# ===========================================================================

def test_le_seuil_se_regle_sans_toucher_au_code(mod, monkeypatch):
    """Mireille doit pouvoir le resserrer ou l'elargir selon ses lots, par
    variable d'environnement."""
    base, envoyes = brancher(mod, monkeypatch, [precommande("1", 10)])
    assert alerter(mod) == 0

    monkeypatch.setattr(mod, "PREORDER_STALE_DAYS", 7.0, raising=False)
    assert alerter(mod) == 1
