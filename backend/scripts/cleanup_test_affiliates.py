"""Trie et supprime les affiliés de test qui polluent la liste réelle.

Sans argument, le script ne fait qu'INVENTORIER : il affiche ce qu'il
supprimerait, sans rien toucher. La suppression demande --delete, en toute
connaissance de cause.

    python3 backend/scripts/cleanup_test_affiliates.py            # inventaire
    python3 backend/scripts/cleanup_test_affiliates.py --delete   # execution

Les motifs sont volontairement etroits : un faux positif ici efface un vrai
partenaire. Ajoutez les votres avec --pattern plutot que d'elargir ceux-ci.
"""
import argparse
import asyncio
import os
import re
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Adresses generees par les suites de tests automatises.
DEFAULT_PATTERNS = [
    r"@fironova-smoke\.com$",
    r"^test_",
    r"^smoke_",
    r"@example\.com$",
]

# Collections portant un affiliate_id, purgees avec l'affilie.
LINKED = [
    "affiliate_referrals",
    "affiliate_payouts",
    "affiliate_clicks",
    "affiliate_email_jobs",
    "affiliate_payout_deferrals",
]


async def main(patterns: list[str], do_delete: bool) -> int:
    load_dotenv("/app/backend/.env")
    mongo = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    if not mongo or not dbname:
        print("MONGO_URL ou DB_NAME absent de l'environnement.")
        return 2

    db = AsyncIOMotorClient(mongo)[dbname]
    rx = [re.compile(p, re.I) for p in patterns]

    total = await db.affiliates.count_documents({})
    matched, protected = [], []
    async for a in db.affiliates.find({}, {"_id": 0}):
        email = (a.get("email") or "").strip()
        if not any(r.search(email) for r in rx):
            continue
        # Garde-fou : un affilie qui a genere de l'argent n'est pas un
        # compte de test, quel que soit son adresse.
        stats = {}
        for coll in LINKED:
            stats[coll] = await db[coll].count_documents({"affiliate_id": a["id"]})
        paid = await db.affiliate_payouts.count_documents(
            {"affiliate_id": a["id"], "status": "paid"}
        )
        row = {"aff": a, "stats": stats, "paid": paid}
        (protected if paid else matched).append(row)

    print(f"Affilies en base : {total}")
    print(f"Correspondant aux motifs : {len(matched) + len(protected)}")
    print()

    if protected:
        print("PROTEGES — versement deja paye, jamais supprimes :")
        for r in protected:
            a = r["aff"]
            print(f"  {a.get('email'):50} {r['paid']} versement(s) paye(s)")
        print()

    if not matched:
        print("Rien a supprimer.")
        return 0

    print(f"{'ADRESSE':52} {'CODE':12} {'STATUT':10} LIENS")
    print("-" * 96)
    grand = {c: 0 for c in LINKED}
    for r in matched:
        a, s = r["aff"], r["stats"]
        links = " ".join(f"{c.replace('affiliate_', '')}={n}" for c, n in s.items() if n)
        for c, n in s.items():
            grand[c] += n
        print(f"  {(a.get('email') or '?')[:50]:50} {(a.get('code') or '—'):12} "
              f"{(a.get('status') or '?'):10} {links or '—'}")

    print()
    print(f"{len(matched)} affilie(s) et leurs liens :")
    for c, n in grand.items():
        if n:
            print(f"  {c:32} {n}")

    if not do_delete:
        print()
        print("INVENTAIRE SEUL — rien n'a ete modifie.")
        print("Relancez avec --delete pour executer.")
        return 0

    ids = [r["aff"]["id"] for r in matched]
    codes = [r["aff"].get("code") for r in matched if r["aff"].get("code")]
    print()
    for coll in LINKED:
        res = await db[coll].delete_many({"affiliate_id": {"$in": ids}})
        if res.deleted_count:
            print(f"  supprime {res.deleted_count:5} dans {coll}")
    if codes:
        res = await db.coupons.delete_many({"code": {"$in": codes}, "source": "affiliate"})
        if res.deleted_count:
            print(f"  supprime {res.deleted_count:5} coupon(s) affilie")
    res = await db.affiliates.delete_many({"id": {"$in": ids}})
    print(f"  supprime {res.deleted_count:5} affilie(s)")
    print()
    print("Termine.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true",
                    help="execute la suppression (sinon : inventaire seul)")
    ap.add_argument("--pattern", action="append", default=[],
                    help="motif d'adresse supplementaire (regex), repetable")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(DEFAULT_PATTERNS + args.pattern, args.delete)))
