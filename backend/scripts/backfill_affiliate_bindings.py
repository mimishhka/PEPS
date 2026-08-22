"""Reconstruit les rattachements client -> affilié à partir des commandes déjà
attribuées.

Le rattachement durable se pose désormais à chaque vente attribuée, mais il
n'existait pas auparavant. Toutes les commandes antérieures portent donc un
affiliate_id sans qu'aucun lien n'ait été enregistré : un client acquis avant
la mise en place ne « revient » pas à l'affilié qui l'a amené, et sa prochaine
commande directe ne rapporte rien à personne.

Ce script relit l'historique et pose le lien manquant.

RÈGLE APPLIQUÉE — la même que le code, volontairement : le rattachement revient
à l'affilié de la PREMIÈRE commande attribuée d'un client, pas de la plus
récente. Les commandes sont donc parcourues de la plus ancienne à la plus
récente, et $setOnInsert garantit qu'une seconde commande n'écrase jamais le
lien posé par la première.

Sans argument, le script ne fait qu'INVENTORIER.

    python3 backend/scripts/backfill_affiliate_bindings.py            # inventaire
    python3 backend/scripts/backfill_affiliate_bindings.py --write    # exécution
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def main(do_write: bool) -> int:
    load_dotenv("/app/backend/.env")
    mongo = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    if not mongo or not dbname:
        print("MONGO_URL ou DB_NAME absent de l'environnement.")
        return 2

    db = AsyncIOMotorClient(mongo)[dbname]

    deja = await db.affiliate_bindings.count_documents({})
    print(f"Rattachements existants : {deja}")

    # De la plus ancienne à la plus récente : c'est le premier affilié qui garde
    # le client. Trier à l'envers donnerait le résultat inverse, en silence.
    cursor = db.orders.find(
        {"affiliate_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "order_number": 1, "email": 1, "user_id": 1,
         "affiliate_id": 1, "affiliate_code": 1, "created_at": 1},
    ).sort("created_at", 1)

    a_poser: dict[str, dict] = {}      # email -> lien à créer
    comptes: dict[str, str] = {}       # email -> user_id rencontré
    sans_courriel = 0
    total = 0

    async for o in cursor:
        total += 1
        email = (o.get("email") or "").lower().strip()
        if not email:
            # Sans courriel, aucune clé stable : la commande reste attribuée,
            # mais le client ne peut pas être rattaché.
            sans_courriel += 1
            continue
        uid = str(o.get("user_id") or "").strip()
        if uid and email not in comptes:
            comptes[email] = uid
        if email in a_poser:
            continue                    # première commande déjà retenue
        a_poser[email] = {
            "email": email,
            "affiliate_id": o["affiliate_id"],
            "affiliate_code": o.get("affiliate_code", ""),
            "source": "backfill",
            "bound_at": datetime.now(timezone.utc).isoformat(),
            "_premiere": o.get("order_number") or "?",
            "_le": (o.get("created_at") or "")[:10],
        }

    # Ce qui existe déjà n'est jamais retouché : un lien pose depuis la mise en
    # place reflète une vente réelle et prime sur toute reconstruction.
    existants = set()
    async for b in db.affiliate_bindings.find({}, {"_id": 0, "email": 1}):
        existants.add((b.get("email") or "").lower().strip())

    nouveaux = {e: v for e, v in a_poser.items() if e not in existants}

    print(f"Commandes attribuées parcourues : {total}")
    if sans_courriel:
        print(f"  dont sans courriel, non rattachables : {sans_courriel}")
    print(f"Clients distincts : {len(a_poser)}")
    print(f"Rattachements à créer : {len(nouveaux)}")
    print()

    if not nouveaux:
        print("Rien à faire.")
        return 0

    par_affilie: dict[str, int] = {}
    for v in nouveaux.values():
        par_affilie[v["affiliate_code"] or v["affiliate_id"][:8]] = \
            par_affilie.get(v["affiliate_code"] or v["affiliate_id"][:8], 0) + 1

    print(f"{'AFFILIÉ':16} CLIENTS")
    print("-" * 30)
    for code, n in sorted(par_affilie.items(), key=lambda x: -x[1]):
        print(f"  {code:16} {n}")
    print()

    apercu = list(nouveaux.values())[:8]
    print("Aperçu :")
    for v in apercu:
        print(f"  {v['email'][:42]:44} -> {v['affiliate_code'] or '?':12} "
              f"({v['_premiere']}, {v['_le']})")
    if len(nouveaux) > len(apercu):
        print(f"  … et {len(nouveaux) - len(apercu)} autre(s)")
    print()

    if not do_write:
        print("INVENTAIRE SEUL — rien n'a été modifié.")
        print("Relancez avec --write pour créer les rattachements.")
        return 0

    crees = 0
    for email, v in nouveaux.items():
        doc = {k: x for k, x in v.items() if not k.startswith("_")}
        uid = comptes.get(email)
        if uid:
            doc["user_id"] = uid
        try:
            res = await db.affiliate_bindings.update_one(
                {"email": email}, {"$setOnInsert": doc}, upsert=True,
            )
            crees += 1 if res.upserted_id else 0
        except Exception as exc:
            print(f"  échec sur {email} : {type(exc).__name__}")

    print(f"  créé {crees} rattachement(s)")
    print()
    print("Terminé. Les clients concernés reviennent désormais à l'affilié qui")
    print("les a amenés, même s'ils commandent sans lien ni code.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="crée les rattachements (sinon : inventaire seul)")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(args.write)))
