# -*- coding: utf-8 -*-
"""Verifie que la sonde d'echelle attrape ce qu'elle doit, et RIEN d'autre.

Une sonde qui crie au loup finit desactivee, et une sonde qui se tait ne sert a
rien. Les deux moities comptent donc autant.

En l'ecrivant, trois faux positifs sont apparus sur le depot reel, et chacun
avait sa raison d'etre :

  — `to_list(min(limit, 500))` borne tout aussi bien qu'un entier nu ;
  — un curseur remis a `_csv_cursor_response` est consomme EN FLUX, et c'est
    le bon patron qu'il ne faut surtout pas « corriger » ;
  — `aggregate(pipeline)` cache son `$group` dans une variable batie plus haut.

Le compte est passe de 55 a 30 une fois ces trois cas compris. Les cas
ci-dessous les figent, pour qu'un durcissement futur ne les reouvre pas.
"""
import os
import sys
import tempfile
import pathlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import echelle  # noqa: E402


def _juger(source: str) -> list:
    """Rend les soucis que la sonde trouve dans ce fragment."""
    with tempfile.TemporaryDirectory() as d:
        f = pathlib.Path(d) / "fragment.py"
        f.write_text(source, encoding="utf-8")
        return echelle.verifier([f])


# ---------------------------------------------------------------------------
# CE QU'ELLE DOIT ATTRAPER
# ---------------------------------------------------------------------------

DOIT_ECHOUER = [
    ("to_list(None) sur une collection de croissance",
     'rows = await db.orders.find({}, {"_id": 0}).to_list(None)'),

    ("aucune borne du tout",
     'rows = await db.affiliate_referrals.find(q, proj).sort("created_at", -1)'),

    ("_cursor_all materialise tout",
     'rows = await _cursor_all(db.users.find({}, {"_id": 0}))'),

    ("une chaine sur plusieurs lignes reste vue",
     'rows = await db.affiliate_payouts.find(\n'
     '    {"affiliate_id": aid},\n'
     '    {"_id": 0},\n'
     ').sort("created_at", -1).to_list(None)'),

    ("une agregation SANS reduction lit tout",
     'rows = await db.affiliate_clicks.aggregate([\n'
     '    {"$match": {"affiliate_id": aid}},\n'
     '    {"$sort": {"created_at": -1}},\n'
     ']).to_list(None)'),
]


# ---------------------------------------------------------------------------
# CE QU'ELLE DOIT LAISSER PASSER
# ---------------------------------------------------------------------------

DOIT_PASSER = [
    ("un plafond entier",
     'rows = await db.orders.find({}, {"_id": 0}).to_list(500)'),

    ("un plafond EXPRESSION — faux positif trouve sur le depot reel",
     'rows = await db.affiliate_referrals.find(q, proj).to_list(min(limit, 500))'),

    ("une pagination complete",
     'rows = await db.orders.find(filt, {"_id": 0}).sort(\n'
     '    "created_at", -1\n'
     ').skip((page - 1) * taille).limit(taille).to_list(taille)'),

    ("un export EN FLUX — le bon patron, pas un oubli",
     'cursor = db.orders.find(filt, {"_id": 0}).sort("created_at", -1)\n'
     'return _csv_cursor_response(cursor, mapper, champs, "orders.csv")'),

    ("une agregation qui REDUIT rend une ligne par mois",
     'rows = await db.affiliate_referrals.aggregate([\n'
     '    {"$match": {"affiliate_id": aid}},\n'
     '    {"$group": {"_id": "$mois", "total": {"$sum": "$montant"}}},\n'
     ']).to_list(None)'),

    ("un pipeline en VARIABLE — faux positif trouve sur le depot reel",
     'pipeline = [\n'
     '    {"$match": {"status": "approved"}},\n'
     '    {"$group": {"_id": "$affiliate_id", "total": {"$sum": "$comm"}}},\n'
     ']\n'
     'async for grp in db.affiliate_referrals.aggregate(pipeline):\n'
     '    traiter(grp)'),

    ("une collection de CONFIGURATION se lit en entier sans reproche",
     'rows = await db.shipping_zones.find({}, {"_id": 0}).to_list(None)'),

    ("un comptage ne materialise rien",
     'total = await db.orders.count_documents(filt)'),
]


def main():
    echecs = []

    for nom, source in DOIT_ECHOUER:
        if not _juger(source):
            echecs.append(f"  !! RATE : « {nom} » aurait du etre signale")

    for nom, source in DOIT_PASSER:
        soucis = _juger(source)
        if soucis:
            motifs = "; ".join(s[3] for s in soucis)
            echecs.append(f"  !! FAUX POSITIF : « {nom} » signale a tort ({motifs})")

    # Une collection inconnue doit obliger a trancher, pas passer en silence.
    if not _juger('rows = await db.une_collection_inedite.find({}).to_list(None)'):
        echecs.append("  !! RATE : une collection non classee doit etre signalee")

    if echecs:
        print("\n".join(echecs))
        print(f"\n  {len(echecs)} cas en echec")
        return 1

    print(f"  _test_echelle ok  ({len(DOIT_ECHOUER)} attrapes, "
          f"{len(DOIT_PASSER)} laisses passer)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
