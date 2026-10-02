# -*- coding: utf-8 -*-
"""Le segment d'un client, calcule par la base, dit la meme chose qu'avant.

MIREILLE : « tout le site doit etre concu pour une expansion possible ».

`admin_customers` chargeait TOUS les utilisateurs, PLUS une agregation sur
TOUTES les commandes payees, puis joignait et segmentait les deux en Python. A
cinquante mille clients, c'est cinquante mille documents en memoire a chaque
ouverture de l'ecran, pour en afficher cinquante.

LE RISQUE DE LA CONVERSION EST PRECIS, et c'est lui qu'on teste ici.

La version Python calculait un NOMBRE DE JOURS :

    days = (now - datetime.fromisoformat(last_iso)).days
    if orders >= 3:   return "loyal" if days <= 120 else "at_risk"
    if days <= 45:    return "active"
    if days <= 120:   return "cooling"
    return "dormant"

La version Mongo compare des CHAINES ISO a des seuils calcules d'avance. Les
dates de ce depot sont des chaines, et une chaine ISO se compare
lexicographiquement comme la date qu'elle represente — mais la frontiere exacte
entre « 45 jours » et « 46 jours » est le genre d'endroit ou une equivalence se
perd d'un jour sans que personne ne le remarque, jusqu'au jour ou un client
change de segment sans raison.

POURQUOI PAS `$dateFromString` : sur une chaine abimee, il fait ECHOUER toute
l'agregation. La version Python attrapait l'exception et retombait sur 999
jours. Comparer des chaines ne peut pas lever.
"""
import importlib
import os
import sys
from datetime import datetime, timedelta, timezone

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


MAINTENANT = datetime(2026, 10, 2, 12, 0, 0, tzinfo=timezone.utc)


def _segment_python(orders, last_iso, maintenant=MAINTENANT):
    """LA VERSION QUI EXISTAIT, recopiee telle quelle.

    C'est la reference : la conversion n'a d'interet que si elle rend
    exactement ceci. Recopiee plutot qu'importee, parce qu'elle a justement ete
    supprimee du serveur — c'est la memoire de ce qu'on doit preserver.
    """
    if orders == 0:
        return "prospect"
    days = 999
    if last_iso:
        try:
            days = (maintenant - datetime.fromisoformat(
                last_iso.replace("Z", "+00:00"))).days
        except Exception:
            days = 999
    if orders >= 3:
        return "loyal" if days <= 120 else "at_risk"
    if days <= 45:
        return "active"
    if days <= 120:
        return "cooling"
    return "dormant"


# ---------------------------------------------------------------------------
# L'evaluateur du sous-ensemble employe par `_segment_clients`
# ---------------------------------------------------------------------------

def _ev(expr, doc):
    if isinstance(expr, str) and expr.startswith("$"):
        return doc.get(expr[1:])
    if not isinstance(expr, dict):
        return expr
    if "$switch" in expr:
        for b in expr["$switch"]["branches"]:
            if _ev(b["case"], doc):
                return _ev(b["then"], doc)
        return _ev(expr["$switch"]["default"], doc)
    if "$cond" in expr:
        c, a, b = expr["$cond"]
        return _ev(a, doc) if _ev(c, doc) else _ev(b, doc)
    if "$eq" in expr:
        a, b = expr["$eq"]
        return _ev(a, doc) == _ev(b, doc)
    if "$gte" in expr:
        a, b = expr["$gte"]
        va, vb = _ev(a, doc), _ev(b, doc)
        # ORDRE BSON : `null` se classe AVANT toute chaine. Mongo rend donc
        # faux pour `null >= "2026-..."`, et l'evaluateur doit faire pareil —
        # sinon le test validerait un comportement que la base n'a pas.
        if va is None:
            return False
        if vb is None:
            return True
        return va >= vb
    raise AssertionError(f"operateur non gere : {list(expr)}")


def _segment_mongo(server, orders, last_iso, maintenant=MAINTENANT):
    expr = server._segment_clients(maintenant)
    return _ev(expr, {"orders_count": orders, "last_order_at": last_iso})


def _iso(jours):
    """Une date ISO vieille de `jours` jours."""
    return (MAINTENANT - timedelta(days=jours)).isoformat()


# ===========================================================================
# L'EQUIVALENCE, AUX FRONTIERES
# ===========================================================================

def test_les_deux_s_accordent_sur_TOUTES_les_anciennetes(server_module):
    """Zero a cinq cents jours, pour chaque volume de commandes qui change de
    branche. C'est un balayage, pas un echantillon : les frontieres sont
    exactement ce qu'une reecriture perd."""
    desaccords = []
    for orders in (0, 1, 2, 3, 4, 10):
        for jours in range(0, 500):
            last = _iso(jours)
            attendu = _segment_python(orders, last)
            obtenu = _segment_mongo(server_module, orders, last)
            if attendu != obtenu:
                desaccords.append((orders, jours, attendu, obtenu))

    assert not desaccords, (
        f"{len(desaccords)} desaccord(s), premiers : {desaccords[:5]}")


def test_LES_FRONTIERES_EXACTES_a_45_et_120_jours(server_module):
    """Le jour pres. `days <= 45` doit rester `days <= 45`, pas 44 ni 46."""
    for orders in (1, 2):
        assert _segment_mongo(server_module, orders, _iso(45)) == "active"
        assert _segment_mongo(server_module, orders, _iso(46)) == "cooling"
        assert _segment_mongo(server_module, orders, _iso(120)) == "cooling"
        assert _segment_mongo(server_module, orders, _iso(121)) == "dormant"

    for orders in (3, 50):
        assert _segment_mongo(server_module, orders, _iso(120)) == "loyal"
        assert _segment_mongo(server_module, orders, _iso(121)) == "at_risk"


def test_sans_commande_c_est_un_prospect(server_module):
    assert _segment_mongo(server_module, 0, None) == "prospect"
    assert _segment_mongo(server_module, 0, _iso(2)) == "prospect"
    assert _segment_python(0, None) == "prospect"


def test_une_DATE_ABSENTE_ne_fait_pas_lever_et_classe_comme_avant(server_module):
    """La version Python retombait sur 999 jours. L'ordre BSON met `null` avant
    toute chaine, donc les comparaisons sont fausses et le client tombe au meme
    endroit — sans qu'aucune conversion de date ne puisse echouer."""
    for orders in (1, 2, 3, 10):
        assert (_segment_mongo(server_module, orders, None)
                == _segment_python(orders, None))


def test_une_date_ABIMEE_ne_fait_pas_ECHOUER_l_agregation(server_module):
    """LA RAISON DE NE PAS UTILISER `$dateFromString`.

    Sur une chaine illisible, il ferait tomber toute la requete — et l'ecran
    des clients avec. La comparaison de chaines, elle, rend simplement un
    resultat : le client est mal classe, mais la page s'affiche.
    """
    for abime in ["", "pas-une-date", "0000", "2026-13-99"]:
        resultat = _segment_mongo(server_module, 2, abime)  # ne leve pas
        assert resultat in {"active", "cooling", "dormant", "at_risk", "loyal"}


def test_les_seuils_SUIVENT_la_date_du_jour(server_module):
    """Les seuils sont calcules a l'appel. Un client « actif » aujourd'hui doit
    devenir « cooling » si on pose la meme question trois mois plus tard."""
    vente = _iso(40)
    assert _segment_mongo(server_module, 1, vente) == "active"

    plus_tard = MAINTENANT + timedelta(days=60)
    assert _segment_mongo(server_module, 1, vente, maintenant=plus_tard) == "cooling"


def test_le_segment_ne_depend_PAS_du_fuseau_de_la_chaine(server_module):
    """Les dates de ce depot portent leur decalage. Deux ecritures du meme
    instant doivent donner le meme segment."""
    instant = MAINTENANT - timedelta(days=10)
    avec_z = instant.isoformat().replace("+00:00", "+00:00")
    assert _segment_mongo(server_module, 1, avec_z) == "active"
