# -*- coding: utf-8 -*-
"""Les index des collections d'affiliation.

Mongo sert toute requete portant sur le PREFIXE d'un index compose :
`{a:1, b:-1}` couvre `{a}`, tri compris. Un index simple sur `a` ne sert alors
plus aucune lecture, mais continue d'etre reecrit a CHAQUE insertion.

Quatre de ces doublons vivaient ici, dont deux sur des collections du chemin
chaud : `affiliate_referrals`, ecrite a chaque commande payee, et
`affiliate_clicks`, ecrite a chaque clic de parrainage.

Le test ne verifie pas une liste figee : il derive la regle. Si quelqu'un
rajoute un jour un index simple deja couvert par un compose, la suite le dit
sans qu'on ait a se souvenir de ce fichier.
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


class _Collection:
    """Note ce qu'on lui demande, sans rien faire."""

    def __init__(self, nom, deja=()):
        self.nom = nom
        self.crees = []
        self.supprimes = []
        self._deja = {n: {} for n in deja}

    async def create_index(self, cles, **options):
        self.crees.append((cles, options))

    async def index_information(self):
        return dict(self._deja)

    async def drop_index(self, nom):
        if nom not in self._deja:
            raise KeyError(nom)
        del self._deja[nom]
        self.supprimes.append(nom)


class _Base:
    """Toute collection demandee existe, et se souvient de ses appels."""

    def __init__(self, deja_par_collection=None):
        self._cols = {}
        self._deja = deja_par_collection or {}

    def __getattr__(self, nom):
        if nom.startswith("_"):
            raise AttributeError(nom)
        if nom not in self._cols:
            self._cols[nom] = _Collection(nom, self._deja.get(nom, ()))
        return self._cols[nom]


def _poser_les_index(server_module):
    from services.affiliate import affiliate_ensure_indexes
    base = _Base()
    server_module.db = base
    asyncio.run(affiliate_ensure_indexes())
    return base


def test_aucun_index_simple_ne_double_un_index_compose(server_module):
    base = _poser_les_index(server_module)

    fautes = []
    for nom, col in base._cols.items():
        simples = {c for c, _ in col.crees if isinstance(c, str)}
        prefixes = {c[0][0] for c, _ in col.crees
                    if isinstance(c, list) and c}
        for champ in sorted(simples & prefixes):
            fautes.append(f"{nom}.{champ}")

    assert fautes == [], (
        "index simple(s) deja couvert(s) par le prefixe d'un compose, "
        "reecrit(s) a chaque insertion pour rien : " + ", ".join(fautes)
    )


def test_les_index_utiles_sont_toujours_poses(server_module):
    # Retirer les doublons ne doit pas emporter ce qui sert vraiment.
    base = _poser_les_index(server_module)

    def composes(nom):
        return [tuple(c) for c, _ in base._cols[nom].crees if isinstance(c, list)]

    assert [("affiliate_id", 1), ("created_at", -1)] in [list(c) for c in composes("affiliate_clicks")]
    assert [("affiliate_id", 1), ("status", 1)] in [list(c) for c in composes("affiliate_referrals")]
    assert [("status", 1), ("payout_id", 1)] in [list(c) for c in composes("affiliate_referrals")]
    # Les contraintes d'unicite, elles, ne sont couvertes par aucun prefixe.
    simples = {c: o for c, o in base._cols["affiliate_referrals"].crees if isinstance(c, str)}
    assert simples["order_id"].get("unique") is True


def test_les_doublons_deja_poses_sont_retires_de_la_base(server_module):
    # Retirer l'appel a create_index ne suffit pas : l'index deja pose reste
    # en base. Il faut le supprimer, une fois.
    from services.affiliate import affiliate_ensure_indexes
    base = _Base({
        "affiliate_referrals": ("affiliate_id_1", "status_1"),
        "affiliate_clicks": ("affiliate_id_1",),
        "affiliate_payouts": ("affiliate_id_1",),
    })
    server_module.db = base
    asyncio.run(affiliate_ensure_indexes())

    assert base._cols["affiliate_referrals"].supprimes == ["affiliate_id_1", "status_1"]
    assert base._cols["affiliate_clicks"].supprimes == ["affiliate_id_1"]
    assert base._cols["affiliate_payouts"].supprimes == ["affiliate_id_1"]


def test_un_second_passage_ne_supprime_plus_rien(server_module):
    # Idempotent : une base deja propre ne doit pas voir passer de drop_index.
    base = _poser_les_index(server_module)

    for col in base._cols.values():
        assert col.supprimes == []


def test_une_suppression_qui_echoue_n_arrete_pas_le_demarrage(server_module):
    # Un menage d'index ne doit jamais empecher le serveur de demarrer.
    from services.affiliate import _retirer_index_redondant

    class Recalcitrante:
        async def index_information(self):
            raise RuntimeError("replica set indisponible")

    asyncio.run(_retirer_index_redondant(Recalcitrante(), "affiliate_id_1", "compose"))
