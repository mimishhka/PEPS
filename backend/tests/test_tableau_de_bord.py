# -*- coding: utf-8 -*-
"""Les quatre points d'acces du tableau de bord.

Constate le 2026-09-19 :
- la corbeille etait comptee. L'ecran Commandes l'exclut partout
  (_orders_filter), le tableau de bord nulle part : une commande supprimee
  restait dans le revenu, dans les compteurs et dans « Dernieres commandes ».
- « Produits actifs » comptait aussi les produits masques ET supprimes : 22
  annonces pour un catalogue de 12.
- « Dernieres commandes » renvoyait les commandes ENTIERES — adresse,
  paiement, conformite : 24 Ko sur 26, pour huit colonnes affichees.
- le classement des meilleures ventes ignorait la periode choisie : en
  « 7 jours », le graphique pouvait etre vide pendant que le classement
  affichait des ventes.
- « nouveaux vs fideles » lancait UNE REQUETE PAR CLIENT.
- les sommes passaient par des listes ramenees en memoire, plafonnees a 2000
  commandes : au-dela, les totaux devenaient faux en silence.

Ces tests tournent sur la fausse base (tests/fake_mongo), agregations
comprises.
"""
import asyncio
import importlib
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tests.fake_mongo import FakeCollection  # noqa: E402


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server
    return importlib.reload(server)


MAINTENANT = datetime.now(timezone.utc)


def _il_y_a(jours: float) -> str:
    return (MAINTENANT - timedelta(days=jours)).isoformat()


def _commande(**extra) -> dict:
    doc = {
        "id": "o-" + str(extra.get("order_number", "x")),
        "order_number": "FN-1",
        "email": "client@example.com",
        "payment_status": "paid",
        "payment_method": "interac",
        "fulfillment_status": "processing",
        "created_at": _il_y_a(2),
        "deleted_at": None,
        "total": 100.0,
        "items": [{"slug": "bpc-157", "variant_name": "5mg", "name_en": "BPC-157",
                   "name_fr": "BPC-157", "qty": 1, "line_total": 100.0}],
        "shipping_address": {"full_name": "Marie Tremblay", "postal_code": "H2X1Y4"},
        "payment_info": {"reference": "SECRET-123"},
    }
    doc.update(extra)
    return doc


class _Base:
    """Juste les collections que le tableau de bord interroge."""

    def __init__(self, orders, products=(), users=(), recon=(), emails=(), tickets=()):
        self.orders = FakeCollection(list(orders))
        self.products = FakeCollection(list(products))
        self.users = FakeCollection(list(users))
        self.interac_reconciliation_queue = FakeCollection(list(recon))
        self.email_outbox = FakeCollection(list(emails))
        self.affiliate_tickets = FakeCollection(list(tickets))


def _brancher(server_module, monkeypatch, base):
    monkeypatch.setattr(server_module, "db", base)


# ---------------------------------------------------------------------------
# Totaux de reference
# ---------------------------------------------------------------------------

def test_la_corbeille_ne_compte_plus_dans_les_totaux(server_module, monkeypatch):
    base = _Base(
        orders=[
            _commande(order_number="FN-1", total=100.0),
            # Mise a la corbeille : absente de l'ecran Commandes, elle gonflait
            # pourtant le revenu du tableau de bord.
            _commande(order_number="FN-2", total=999.0, deleted_at=_il_y_a(1)),
        ],
        products=[
            {"id": "p-1", "active": True, "deleted_at": None, "variants": []},
            {"id": "p-2", "active": False, "deleted_at": None, "variants": []},
            {"id": "p-3", "active": True, "deleted_at": _il_y_a(5), "variants": []},
        ],
        users=[{"id": "u-1", "role": "user"}, {"id": "u-2", "role": "admin"}],
    )
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_stats({}))
    assert out["revenue_cad"] == 100.0
    assert out["total_orders"] == 1
    assert out["paid_orders"] == 1
    assert out["customers"] == 1
    # « Produits actifs » : ni les masques, ni ceux de la corbeille.
    assert out["products"] == 1


# ---------------------------------------------------------------------------
# Le pouls
# ---------------------------------------------------------------------------

def test_le_pouls_additionne_sans_plafond(server_module, monkeypatch):
    # 2500 commandes en attente : au-dessus de l'ancien plafond de 2000, qui
    # tronquait la somme sans le dire.
    attente = [_commande(order_number=f"A{i}", id=f"a-{i}", payment_status="awaiting_etransfer",
                         payment_method="interac", total=10.0)
               for i in range(2500)]
    base = _Base(orders=attente + [_commande(order_number="P1", id="p1", total=50.0)])
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_dashboard_pulse({}))
    assert out["money"]["pending_payment"]["count"] == 2500
    assert out["money"]["pending_payment"]["amount"] == 25000.0
    assert out["rails"]["interac"]["pending_count"] == 2500
    assert out["rails"]["interac"]["paid_amount"] == 50.0


def test_le_pouls_separe_les_circuits_et_les_echeances(server_module, monkeypatch):
    bientot = (MAINTENANT + timedelta(hours=1)).isoformat()
    plus_tard = (MAINTENANT + timedelta(days=2)).isoformat()
    base = _Base(
        orders=[
            _commande(order_number="C1", id="c1", payment_status="awaiting_crypto",
                      payment_method="nowpayments", total=40.0, payment_deadline=bientot),
            _commande(order_number="C2", id="c2", payment_status="awaiting_etransfer",
                      payment_method="interac", total=60.0, payment_deadline=plus_tard),
            # Sans echeance : ne doit pas compter comme « expire bientot ».
            _commande(order_number="C3", id="c3", payment_status="awaiting_etransfer",
                      payment_method="interac", total=10.0),
            _commande(order_number="C4", id="c4", payment_method="nowpayments", total=25.0),
        ],
        recon=[{"status": "pending", "provider": "crypto"},
               {"status": "pending"},          # sans provider = interac
               {"status": "done", "provider": "crypto"}],
    )
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_dashboard_pulse({}))
    assert out["money"]["pending_payment"]["expiring_soon"] == 1
    assert out["money"]["pending_payment"]["by_method"] == {"interac": 2, "crypto": 1}
    assert out["money"]["reconcile"] == {"count": 2, "by_provider": {"crypto": 1, "interac": 1}}
    assert out["rails"]["crypto"]["paid_amount"] == 25.0
    assert out["rails"]["crypto"]["pending_amount"] == 40.0
    assert out["rails"]["crypto"]["reconcile_count"] == 1
    assert out["rails"]["interac"]["pending_amount"] == 70.0
    assert out["rails"]["interac"]["reconcile_count"] == 1


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

def test_les_dernieres_commandes_ne_transportent_que_l_affiche(server_module, monkeypatch):
    base = _Base(orders=[_commande(order_number="FN-1"),
                         _commande(order_number="FN-SUPPR", id="o-suppr",
                                   deleted_at=_il_y_a(1))])
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_analytics(30, {}))
    lignes = out["recent_orders"]
    assert [o["order_number"] for o in lignes] == ["FN-1"]
    # Les donnees personnelles et de paiement ne quittent plus le serveur pour
    # une table qui affiche cinq colonnes.
    assert set(lignes[0]) == {"id", "order_number", "created_at", "email", "total",
                              "payment_status", "fulfillment_status", "shipping_address"}
    assert lignes[0]["shipping_address"] == {"full_name": "Marie Tremblay"}


def test_la_serie_et_le_classement_suivent_la_periode(server_module, monkeypatch):
    base = _Base(orders=[
        _commande(order_number="RECENTE", id="r1", created_at=_il_y_a(2), total=100.0),
        # Vieille vente : hors des 7 derniers jours, elle doit disparaitre des
        # DEUX — c'est le classement qui l'ignorait.
        _commande(order_number="VIEILLE", id="v1", created_at=_il_y_a(40), total=500.0,
                  items=[{"slug": "epitalon", "variant_name": "10mg", "name_en": "Epitalon",
                          "name_fr": "Épitalon", "qty": 5, "line_total": 500.0}]),
    ])
    _brancher(server_module, monkeypatch, base)

    sept = asyncio.run(server_module.admin_analytics(7, {}))
    assert [t["slug"] for t in sept["top_products"]] == ["bpc-157"]
    assert sum(d["revenue"] for d in sept["daily_revenue"]) == 100.0

    quatre_vingt_dix = asyncio.run(server_module.admin_analytics(90, {}))
    assert {t["slug"] for t in quatre_vingt_dix["top_products"]} == {"bpc-157", "epitalon"}
    # Classement par REVENU : la vente a 500 $ passe devant celle a 100 $.
    assert quatre_vingt_dix["top_products"][0]["slug"] == "epitalon"


def test_une_date_stockee_en_objet_date_n_est_pas_perdue(server_module, monkeypatch):
    # Mongo ne compare qu'a l'interieur d'un meme type : une borne en chaine
    # ignore les documents dont created_at est une vraie date. Les deux formes
    # coexistent dans cette base.
    base = _Base(orders=[
        _commande(order_number="CHAINE", id="s1", created_at=_il_y_a(3), total=10.0),
        _commande(order_number="DATE", id="d1", created_at=MAINTENANT - timedelta(days=3),
                  total=20.0),
    ])
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_analytics(30, {}))
    assert sum(d["revenue"] for d in out["daily_revenue"]) == 30.0
    assert sum(t["revenue"] for t in out["top_products"]) == 200.0  # 100 $ la ligne


def test_la_corbeille_disparait_aussi_des_graphiques(server_module, monkeypatch):
    base = _Base(orders=[
        _commande(order_number="OK", id="ok", total=100.0),
        _commande(order_number="SUPPR", id="sup", total=900.0, deleted_at=_il_y_a(1)),
    ])
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_analytics(30, {}))
    assert sum(d["revenue"] for d in out["daily_revenue"]) == 100.0
    assert out["top_products"][0]["revenue"] == 100.0


# ---------------------------------------------------------------------------
# Metriques de pilotage
# ---------------------------------------------------------------------------

def test_nouveaux_et_fideles_sans_une_requete_par_client(server_module, monkeypatch):
    base = _Base(orders=[
        # Premier achat sur la periode : nouveau.
        _commande(order_number="N1", id="n1", email="neuf@example.com", created_at=_il_y_a(3)),
        # Achetait deja avant la periode : fidele, compte une seule fois.
        _commande(order_number="F1", id="f1", email="fidele@example.com", created_at=_il_y_a(200)),
        _commande(order_number="F2", id="f2", email="fidele@example.com", created_at=_il_y_a(5)),
        # N'a rien achete sur la periode : ni nouveau, ni fidele, ni actif.
        _commande(order_number="D1", id="d1", email="dormant@example.com", created_at=_il_y_a(300)),
    ])
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_analytics_enhanced(30, {}))
    assert out["customers"] == {"new": 1, "returning": 1, "total_active": 2}


def test_le_pilotage_compare_deux_periodes_sans_la_corbeille(server_module, monkeypatch):
    base = _Base(orders=[
        _commande(order_number="A", id="a", created_at=_il_y_a(3), total=100.0),
        _commande(order_number="B", id="b", created_at=_il_y_a(40), total=300.0),
        _commande(order_number="C", id="c", created_at=_il_y_a(3), total=777.0,
                  deleted_at=_il_y_a(1)),
        _commande(order_number="D", id="d", created_at=_il_y_a(3), total=50.0,
                  payment_status="awaiting_etransfer"),
    ])
    _brancher(server_module, monkeypatch, base)

    out = asyncio.run(server_module.admin_analytics_enhanced(30, {}))
    assert out["current"] == {"revenue": 100.0, "orders": 1, "aov": 100.0}
    assert out["previous"] == {"revenue": 300.0, "orders": 1, "aov": 300.0}
    assert out["conversion"]["orders_created"] == 2      # la corbeille exclue
    assert out["conversion"]["orders_paid"] == 1
    assert out["conversion"]["orders_abandoned"] == 1
    assert out["tax_threshold"]["rolling_12mo_revenue"] == 400.0


def test_la_repartition_des_clients_est_une_fonction_pure(server_module):
    # Testable seule : c'est elle qui remplace la boucle de requetes.
    lignes = [
        {"_id": "a@x.com", "premiere": "2026-09-01T00:00:00+00:00", "derniere": "2026-09-18T00:00:00+00:00"},
        {"_id": "b@x.com", "premiere": "2025-01-01T00:00:00+00:00", "derniere": "2026-09-18T00:00:00+00:00"},
        {"_id": "c@x.com", "premiere": "2024-01-01T00:00:00+00:00", "derniere": "2024-02-01T00:00:00+00:00"},
    ]
    assert server_module._repartir_clients(lignes, "2026-09-10T00:00:00+00:00") == {
        "new": 0, "returning": 2, "total_active": 2}
    assert server_module._repartir_clients(lignes, "2026-08-01T00:00:00+00:00") == {
        "new": 1, "returning": 1, "total_active": 2}
