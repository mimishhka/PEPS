# -*- coding: utf-8 -*-
"""Publier ou masquer une page, depuis l'administration.

MIREILLE, 21/10/2026 : « cache le endpoint coa lab (rajoute-le du côté admin
là où je peux publier ou non des pages), cache aussi À propos pour l'instant ».

L'ENDROIT N'EXISTAIT PAS. Les categories et les menus portent un drapeau
`published` depuis longtemps ; les PAGES, non. `/lab` vivait derriere une
variable d'environnement — il fallait un acces au serveur et un redemarrage
pour masquer une page — et `/about` n'avait aucun interrupteur du tout.

Une variable d'environnement est le mauvais outil pour une decision
editoriale : elle vit hors de l'application, personne ne sait qu'elle existe,
et elle demande un acces au serveur pour une decision qui appartient a la
personne qui tient la boutique.

CE QUE CES TESTS GARDENT, et qui n'est pas evident :

1. La liste est FERMEE. Un slug libre permettrait de masquer n'importe quelle
   route — y compris la conformite, les mentions legales ou la caisse. Masquer
   la conformite serait un probleme, pas une fonctionnalite.

2. Une page inconnue de la base est PUBLIEE. Un document manquant, une
   collection vide, une base fraiche : rien de tout cela ne doit faire
   disparaitre une page en silence. Le seul masquage possible est un masquage
   DEMANDE.
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
    import server
    return importlib.reload(server)


def _pages(srv, monkeypatch, docs=None):
    collection = FakeCollection(docs or [])
    monkeypatch.setattr(srv.db, "pages", collection, raising=False)
    return collection


# ---------------------------------------------------------------------------
# Les defauts
# ---------------------------------------------------------------------------

def test_lab_et_about_partent_MASQUEES(srv, monkeypatch):
    """Sa demande du 21/10/2026, sur une base ou rien n'a encore ete decide."""
    _pages(srv, monkeypatch)
    etats = asyncio.run(srv.list_pages())
    assert etats["lab"] is False
    assert etats["about"] is False


def test_les_autres_pages_partent_publiees(srv, monkeypatch):
    _pages(srv, monkeypatch)
    etats = asyncio.run(srv.list_pages())
    assert etats["certificats"] is True
    assert etats["research"] is True


def test_UNE_PAGE_ABSENTE_DE_LA_BASE_RESTE_PUBLIEE(srv, monkeypatch):
    """Un defaut de configuration ne doit JAMAIS masquer une page en silence.

    Base fraiche, collection vide, document perdu : la page reste servie. Le
    seul masquage possible est un masquage demande. L'inverse — masquer par
    defaut — ferait disparaitre une page sans que personne comprenne pourquoi.
    """
    _pages(srv, monkeypatch, [])
    etats = asyncio.run(srv.list_pages())
    publiables = {p["slug"] for p in srv.PAGES_PUBLIABLES}
    masquees_au_depart = srv.PAGES_MASQUEES_AU_DEPART
    for slug in publiables - masquees_au_depart:
        assert etats[slug] is True, slug


# ---------------------------------------------------------------------------
# La bascule
# ---------------------------------------------------------------------------

def test_publier_puis_masquer(srv, monkeypatch):
    collection = _pages(srv, monkeypatch)

    asyncio.run(srv.admin_update_page("lab", srv.PageIn(published=True), {}))
    assert asyncio.run(srv.list_pages())["lab"] is True

    asyncio.run(srv.admin_update_page("lab", srv.PageIn(published=False), {}))
    assert asyncio.run(srv.list_pages())["lab"] is False

    # Un seul document, pas un par bascule.
    assert len([d for d in collection.docs if d.get("slug") == "lab"]) == 1


def test_LA_LISTE_EST_FERMEE(srv, monkeypatch):
    """On ne masque pas une route arbitraire depuis l'administration.

    Sans cette garde, un slug libre permettrait de masquer la conformite, les
    mentions legales, la caisse ou le compte client. Le drapeau est un outil
    editorial, pas un interrupteur general sur le site.
    """
    from fastapi import HTTPException
    _pages(srv, monkeypatch)
    for slug in ("compliance", "checkout", "privacy", "account", "catalog", ""):
        with pytest.raises(HTTPException) as capture:
            asyncio.run(srv.admin_update_page(slug, srv.PageIn(published=False), {}))
        assert capture.value.status_code == 404, slug


def test_l_admin_voit_le_nom_et_la_route_de_chaque_page(srv, monkeypatch):
    """Sans la route affichee, « lab » ne dit pas quelle page on masque."""
    _pages(srv, monkeypatch)
    liste = asyncio.run(srv.admin_list_pages({}))
    par_slug = {p["slug"]: p for p in liste}
    assert par_slug["lab"]["route"] == "/lab"
    assert par_slug["about"]["name_fr"] == "À propos"
    assert par_slug["lab"]["published"] is False


def test_aucune_page_sensible_n_est_publiable(srv):
    """La liste se relit : ce test echoue si quelqu'un y ajoute une page
    dont le masquage poserait un probleme reglementaire ou commercial."""
    interdites = {"compliance", "privacy", "checkout", "cart", "account",
                  "catalog", "product", "login", "register", "order"}
    publiables = {p["slug"] for p in srv.PAGES_PUBLIABLES}
    assert publiables & interdites == set()
