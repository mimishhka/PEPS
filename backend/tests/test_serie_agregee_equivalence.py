# -*- coding: utf-8 -*-
"""L'agregation Mongo rend EXACTEMENT ce que rendait la boucle Python.

MIREILLE : « tout le site doit etre concu pour une expansion possible ».

`admin_affiliate_detail` lisait l'historique ENTIER d'un affilie — `to_list(None)`
— pour en tirer douze lignes. Il le calcule desormais dans la base.

C'EST UN CALCUL D'ARGENT. Le remplacer n'a d'interet que s'il donne le meme
resultat : une serie qui lit moins mais compte autrement n'est pas une
optimisation, c'est une regression silencieuse sur un releve que l'affilie
pourrait contester.

Ce fichier ne teste donc pas l'agregation « en soi » : il fait tourner LES DEUX
implementations sur les memes lignes et compare, y compris sur les cas tordus
que la version Python traitait d'une facon particuliere et qu'on pourrait
perdre sans s'en apercevoir.

COMMENT, SANS MONGO. Un petit evaluateur reproduit le sous-ensemble d'operateurs
que ce pipeline emploie — $facet, $group, $cond, $ifNull, $switch, $substrCP.
C'est plus de travail qu'un double complaisant qui rendrait la reponse
attendue, et c'est tout l'interet : un double complaisant aurait valide
n'importe quelle agregation, y compris fausse.
"""
import asyncio
import importlib
import os
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

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


# ===========================================================================
# UN EVALUATEUR DU SOUS-ENSEMBLE MONGO EMPLOYE PAR CE PIPELINE
# ===========================================================================

def _ev(expr, doc):
    """Evalue une expression d'agregation sur un document."""
    if isinstance(expr, str) and expr.startswith("$"):
        return doc.get(expr[1:])
    if not isinstance(expr, dict):
        return expr

    if "$ifNull" in expr:
        # Forme a deux OU trois arguments : le premier non nul.
        for a in expr["$ifNull"]:
            v = _ev(a, doc)
            if v is not None:
                return v
        return None
    if "$cond" in expr:
        cond, alors, sinon = expr["$cond"]
        return _ev(alors, doc) if _ev(cond, doc) else _ev(sinon, doc)
    if "$in" in expr:
        valeur, liste = expr["$in"]
        return _ev(valeur, doc) in [_ev(x, doc) for x in liste]
    if "$eq" in expr:
        a, b = expr["$eq"]
        return _ev(a, doc) == _ev(b, doc)
    if "$type" in expr:
        v = _ev(expr["$type"], doc)
        if isinstance(v, datetime):
            return "date"
        if v is None:
            return "null"
        return "string"
    if "$dateToString" in expr:
        d = _ev(expr["$dateToString"]["date"], doc)
        return d.strftime("%Y-%m") if isinstance(d, datetime) else ""
    if "$substrCP" in expr:
        chaine, debut, longueur = expr["$substrCP"]
        v = _ev(chaine, doc)
        return str(v or "")[debut:debut + longueur]
    if "$switch" in expr:
        for branche in expr["$switch"]["branches"]:
            if _ev(branche["case"], doc):
                return _ev(branche["then"], doc)
        return _ev(expr["$switch"]["default"], doc)
    raise AssertionError(f"operateur non gere par l'evaluateur : {list(expr)}")


def _group(lignes, etape):
    sorties = {}
    for doc in lignes:
        cle = _ev(etape["_id"], doc)
        acc = sorties.setdefault(cle, {"_id": cle})
        for champ, op in etape.items():
            if champ == "_id":
                continue
            if "$sum" in op:
                acc[champ] = acc.get(champ, 0) + (_ev(op["$sum"], doc) or 0)
            else:
                raise AssertionError(f"accumulateur non gere : {list(op)}")
    return list(sorties.values())


def _executer(pipeline, lignes):
    courant = list(lignes)
    for etape in pipeline:
        if "$match" in etape:
            f = etape["$match"]
            courant = [d for d in courant
                       if all(d.get(k) == v for k, v in f.items())]
        elif "$group" in etape:
            courant = _group(courant, etape["$group"])
        elif "$facet" in etape:
            return [{nom: _executer(sous, courant)
                     for nom, sous in etape["$facet"].items()}]
        else:
            raise AssertionError(f"etape non geree : {list(etape)}")
    return courant


class Commissions:
    def __init__(self, lignes):
        self.lignes = lignes
        self.documents_lus = 0

    def aggregate(self, pipeline):
        resultat = _executer(pipeline, self.lignes)
        # On compte ce que l'agregation RENVOIE, pas ce qu'elle parcourt : c'est
        # le transport vers Python qu'on cherche a reduire.
        self.documents_lus += len(resultat)

        async def to_list(_n):
            return resultat
        return SimpleNamespace(to_list=to_list)


# ===========================================================================
# LES JEUX DE DONNEES
# ===========================================================================

LE_CAS_DE_MIREILLE = [
    {"status": "paid", "base_amount": 4680.0, "commission_amount": 500.40,
     "approved_at": "2026-09-14T12:00:00+00:00",
     "created_at": "2026-09-07T12:00:00+00:00",
     "paid_at": "2026-10-03T14:00:00+00:00"},
    {"status": "approved", "base_amount": 472.43, "commission_amount": 56.69,
     "approved_at": "2026-10-12T12:00:00+00:00",
     "created_at": "2026-10-05T12:00:00+00:00", "paid_at": None},
]

TORDU = [
    # Une reprise, datee de SA date et non de celle de la vente.
    {"status": "reversed", "base_amount": 400.0, "commission_amount": 45.0,
     "approved_at": "2026-08-10T12:00:00+00:00",
     "created_at": "2026-08-02T12:00:00+00:00",
     "reversed_at": "2026-10-18T09:00:00+00:00"},
    # UN MOIS QUI N'A QUE DU `pending` : la version Python le faisait
    # apparaitre a zero, parce qu'elle batissait la liste des mois a partir de
    # TOUTES les lignes. Le perdre ferait disparaitre de l'ecran un mois ou
    # l'affilie a pourtant vendu.
    {"status": "pending", "base_amount": 300.0, "commission_amount": 36.0,
     "approved_at": None, "created_at": "2026-07-03T12:00:00+00:00"},
    # Un statut `excluded` : meme traitement.
    {"status": "excluded", "base_amount": 90.0, "commission_amount": 0.0,
     "approved_at": None, "created_at": "2026-06-11T12:00:00+00:00"},
    # Pas d'`approved_at` : on retombe sur `created_at`.
    {"status": "paid", "base_amount": 120.0, "commission_amount": 14.40,
     "approved_at": None, "created_at": "2026-05-09T12:00:00+00:00",
     "paid_at": "2026-06-02T10:00:00+00:00"},
    # Une VRAIE date BSON, pas une chaine ISO : les deux cohabitent en base.
    {"status": "approved", "base_amount": 250.0, "commission_amount": 30.0,
     "approved_at": datetime(2026, 4, 17, 12, tzinfo=timezone.utc),
     "created_at": "2026-04-10T12:00:00+00:00"},
]


def _agregee(server, lignes):
    # Le pipeline commence par $match sur affiliate_id : les fixtures sont
    # ecrites sans, puisque la boucle Python qu'on compare ne le regarde pas.
    avec_id = [{**l, "affiliate_id": "aff-1"} for l in lignes]
    server.db = SimpleNamespace(affiliate_referrals=Commissions(avec_id))
    return asyncio.run(server._serie_mensuelle_agregee("aff-1"))


# ===========================================================================
# L'EQUIVALENCE
# ===========================================================================

def test_LE_CAS_DE_MIREILLE_les_deux_donnent_la_meme_chose(server_module):
    attendu = server_module._affiliate_serie_mensuelle(LE_CAS_DE_MIREILLE)
    obtenu = _agregee(server_module, LE_CAS_DE_MIREILLE)

    assert obtenu == attendu
    # Et le resultat est bien celui qu'elle voulait lire.
    par_mois = {l["mois"]: l for l in obtenu}
    assert par_mois["2026-09"]["payee"] == 500.40
    assert par_mois["2026-10"]["payee"] == 0.0


def test_LES_CAS_TORDUS_donnent_la_meme_chose(server_module):
    """Reprises, `pending` seul, `excluded`, repli sur `created_at`, et une
    vraie date BSON melee aux chaines ISO."""
    attendu = server_module._affiliate_serie_mensuelle(TORDU)
    obtenu = _agregee(server_module, TORDU)

    assert obtenu == attendu


def test_UN_MOIS_SANS_RIEN_DE_VALIDE_reste_affiche(server_module):
    """Le detail qui se perd le plus facilement.

    La version Python batissait la liste des mois a partir de TOUTES les
    lignes, puis ne sommait que les valides. Un mois qui n'a que du `pending`
    apparait donc, a zero. Filtrer le `$match` sur `approved|paid|reversed` —
    ce qui semble naturel — le ferait disparaitre, et un affilie qui a vendu ce
    mois-la ne le verrait plus du tout.
    """
    obtenu = _agregee(server_module, TORDU)
    par_mois = {l["mois"]: l for l in obtenu}

    assert "2026-07" in par_mois
    assert par_mois["2026-07"]["commissions"] == 0.0
    assert par_mois["2026-07"]["ca_valide"] == 0.0


def test_les_deux_s_accordent_sur_un_historique_melange(server_module):
    melange = LE_CAS_DE_MIREILLE + TORDU
    attendu = server_module._affiliate_serie_mensuelle(melange)
    assert _agregee(server_module, melange) == attendu


def test_un_affilie_sans_commission_rend_une_serie_vide(server_module):
    assert _agregee(server_module, []) == []
    assert server_module._affiliate_serie_mensuelle([]) == []


# ===========================================================================
# CE QU'ON EST VENU CHERCHER : MOINS DE DOCUMENTS TRANSPORTES
# ===========================================================================

def test_DIX_MILLE_COMMISSIONS_NE_REMONTENT_PAS_EN_PYTHON(server_module):
    """Le but du lot, mesure.

    L'ancienne version transportait une ligne par commission. La nouvelle en
    transporte une par mois — et il n'y a que douze mois, quel que soit le
    volume.
    """
    lignes = []
    for i in range(10000):
        mois = (i % 12) + 1
        lignes.append({
            "status": "paid", "base_amount": 100.0, "commission_amount": 12.0,
            "approved_at": f"2026-{mois:02d}-15T12:00:00+00:00",
            "created_at": f"2026-{mois:02d}-10T12:00:00+00:00",
            "paid_at": f"2026-{mois:02d}-20T12:00:00+00:00",
            "affiliate_id": "aff-1",
        })
    collection = Commissions(lignes)
    server_module.db = SimpleNamespace(affiliate_referrals=collection)
    serie = asyncio.run(server_module._serie_mensuelle_agregee("aff-1"))

    assert len(serie) == 12
    # UNE seule reponse remonte — la facette — et non dix mille lignes.
    assert collection.documents_lus == 1
    # Et les chiffres restent justes : 10000/12 lignes par mois environ.
    assert sum(l["commissions"] for l in serie) == pytest.approx(10000 * 12.0)


def test_une_panne_de_base_ne_fait_pas_tomber_la_fiche(server_module):
    """La fiche doit s'ouvrir meme sans serie : le reste y est utile."""
    class Casse:
        def aggregate(self, _p):
            raise RuntimeError("mongo indisponible")

    server_module.db = SimpleNamespace(affiliate_referrals=Casse())
    assert asyncio.run(server_module._serie_mensuelle_agregee("aff-1")) == []
