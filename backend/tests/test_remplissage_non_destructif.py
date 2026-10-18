# -*- coding: utf-8 -*-
"""SA SAISIE SURVIT AU REDEMARRAGE.

MIREILLE, 18/10/2026 : « il ne faut surtout pas perdre les donnees au
redemarrage, et que tout soit reecrit, a moins que j'ai mal compris ton
commentaire ».

Elle avait bien compris, et la perte avait deja lieu. Le seed faisait un
`$set` INCONDITIONNEL de huit champs a chaque demarrage du serveur :

    molecular_formula, molecular_weight, cas_number, sequence_length,
    sequence, purity, description_en, description_fr

Toute valeur saisie depuis l'admin sur l'un de ces huit champs etait remplacee
par celle du gabarit au redeploiement suivant. Le commentaire du code
annoncait « non-destructive » ; il etait faux depuis le debut.

LA PREUVE ETAIT DANS SES PROPRES DONNEES. Sur les dix produits publies, un
seul portait une purete differente du gabarit — Epitalon, « ≥ 99,3 % », contre
« ≥ 99,0 % » partout ailleurs. Et Epitalon etait justement le seul produit que
le seed n'atteignait pas : son slug en base est `epitalon-10mg`, celui du
gabarit `epithalon-10mg`. Le seul document hors de portee du `$set` etait le
seul a avoir garde une valeur a elle.

Ces tests ne verifient pas une intention, ils verifient la garantie : une
valeur ecrite reste, un trou se comble, et vingt redemarrages ne changent
rien. Le dernier test est celui qui compte — il reconstitue l'ANCIEN code et
montre qu'il detruisait la saisie.
"""
from __future__ import annotations

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
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


def _brancher(srv, monkeypatch, docs):
    """Pose une doublure de collection `products` et la rend."""
    produits = FakeCollection(docs)
    monkeypatch.setattr(srv.db, "products", produits, raising=False)
    return produits


# Ce que le gabarit voudrait ecrire.
GABARIT = {
    "molecular_formula": "C14H22N4O9",
    "molecular_weight": 390.35,
    "cas_number": "307297-39-8",
    "sequence_length": 4,
    "sequence": "AEDG",
    "purity": "≥ 99.0%",
    "description_en": "Template description.",
    "description_fr": "Description du gabarit.",
}


def test_une_valeur_saisie_N_EST_PAS_ecrasee(srv, monkeypatch):
    """LE TEST QUI COMPTE. Sa purete et sa description restent les siennes."""
    produits = _brancher(srv, monkeypatch, [{
        "slug": "epitalon-10mg",
        "purity": "≥ 99.3%",                    # sa valeur, depuis le COA
        "description_fr": "Ma description a moi.",
        "sequence": "Ala-Glu-Asp-Gly",          # sa notation, pas celle du gabarit
    }])

    ecrits = asyncio.run(srv.remplir_champs_vides("epitalon-10mg", GABARIT))

    doc = produits.docs[0]
    assert doc["purity"] == "≥ 99.3%"
    assert doc["description_fr"] == "Ma description a moi."
    assert doc["sequence"] == "Ala-Glu-Asp-Gly"
    # Et aucun de ces trois champs ne figure parmi ceux qui ont ete ecrits.
    assert "purity" not in ecrits
    assert "description_fr" not in ecrits
    assert "sequence" not in ecrits


def test_un_champ_absent_est_comble(srv, monkeypatch):
    """C'est la raison d'etre du remplissage : Epitalon n'avait pas de formule."""
    produits = _brancher(srv, monkeypatch, [{
        "slug": "epitalon-10mg", "purity": "≥ 99.3%",
    }])

    ecrits = asyncio.run(srv.remplir_champs_vides("epitalon-10mg", GABARIT))

    assert produits.docs[0]["molecular_formula"] == "C14H22N4O9"
    assert produits.docs[0]["sequence_length"] == 4
    assert "molecular_formula" in ecrits
    assert produits.docs[0]["purity"] == "≥ 99.3%"   # toujours intacte


def test_une_chaine_vide_compte_comme_un_trou(srv, monkeypatch):
    """Un champ efface depuis l'admin se recomble — il ne reste pas vide."""
    produits = _brancher(srv, monkeypatch, [{
        "slug": "x", "molecular_formula": "", "cas_number": None, "sequence_length": 0,
    }])

    asyncio.run(srv.remplir_champs_vides("x", GABARIT))

    assert produits.docs[0]["molecular_formula"] == "C14H22N4O9"
    assert produits.docs[0]["cas_number"] == "307297-39-8"
    assert produits.docs[0]["sequence_length"] == 4


def test_le_gabarit_n_ecrit_jamais_un_vide(srv, monkeypatch):
    """Les dix nouvelles fiches ont des champs vides : ils ne doivent rien effacer.

    Cagrilintide n'a ni formule ni CAS, et survodutide n'a pas de sequence.
    Si le gabarit poussait ses vides, il effacerait ce qu'elle a saisi.
    """
    produits = _brancher(srv, monkeypatch, [{
        "slug": "y", "molecular_formula": "C1H1", "cas_number": "50-56-6",
    }])

    ecrits = asyncio.run(srv.remplir_champs_vides(
        "y", {"molecular_formula": "", "cas_number": None, "purity": "≥ 99.0%"}))

    assert produits.docs[0]["molecular_formula"] == "C1H1"
    assert produits.docs[0]["cas_number"] == "50-56-6"
    assert ecrits == {"purity": "≥ 99.0%"}


def test_vingt_redemarrages_ne_changent_rien(srv, monkeypatch):
    """L'idempotence, verifiee par repetition plutot que par raisonnement."""
    produits = _brancher(srv, monkeypatch, [{
        "slug": "epitalon-10mg", "purity": "≥ 99.3%",
    }])

    asyncio.run(srv.remplir_champs_vides("epitalon-10mg", GABARIT))
    apres_le_premier = dict(produits.docs[0])

    for _ in range(19):
        ecrits = asyncio.run(srv.remplir_champs_vides("epitalon-10mg", GABARIT))
        assert ecrits == {}, "un redemarrage a reecrit quelque chose"

    assert produits.docs[0] == apres_le_premier


def test_un_produit_absent_n_est_pas_cree(srv, monkeypatch):
    """Le remplissage ne fabrique pas de document — l'insertion est ailleurs."""
    produits = _brancher(srv, monkeypatch, [])
    asyncio.run(srv.remplir_champs_vides("inconnu", GABARIT))
    assert produits.docs == []


def test_L_ANCIEN_CODE_DETRUISAIT_LA_SAISIE(srv, monkeypatch):
    """La mutation qui montre le defaut reel, pas une version imaginee.

    C'est exactement ce que faisait `seed_admin_and_products` jusqu'au
    18/10/2026 : un `$set` des huit champs, sans condition, a chaque demarrage.
    Ce test existe pour que la difference soit visible et mesurable, et pour
    qu'on ne revienne pas a cette forme par commodite.
    """
    produits = _brancher(srv, monkeypatch, [{
        "slug": "epitalon-10mg", "purity": "≥ 99.3%",
        "description_fr": "Ma description a moi.",
    }])

    async def ancien_comportement():
        await produits.update_one({"slug": "epitalon-10mg"}, {"$set": GABARIT})

    asyncio.run(ancien_comportement())

    # La perte, reproduite.
    assert produits.docs[0]["purity"] == "≥ 99.0%"
    assert produits.docs[0]["description_fr"] == "Description du gabarit."
