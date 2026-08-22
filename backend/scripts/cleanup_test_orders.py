"""Trie et supprime les commandes de test qui polluent les chiffres réels.

Pendant de cleanup_test_affiliates.py, et bâti sur le même principe : sans
argument, le script ne fait qu'INVENTORIER. Il affiche ce qu'il supprimerait,
sans rien toucher. La suppression demande --delete, en toute connaissance de
cause.

    python3 backend/scripts/cleanup_test_orders.py            # inventaire
    python3 backend/scripts/cleanup_test_orders.py --delete   # exécution

Une commande de test fausse davantage qu'une liste : elle entre dans le chiffre
d'affaires, dans les paliers d'affiliés, dans les stocks décrémentés et dans les
rapports de fin de mois. C'est pourquoi les motifs sont volontairement étroits,
et pourquoi la protection ci-dessous refuse de supprimer ce qui a laissé une
trace réelle.
"""
import argparse
import asyncio
import os
import re
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# Adresses générées par les suites de tests automatisés.
DEFAULT_PATTERNS = [
    r"@example\.com$",
    r"@fironova-smoke\.com$",
    r"^test_",
    r"^smoke_",
    r"^iter\d*_",
    r"^dup_",
]

# Collections portant un order_id, purgées avec la commande.
LINKED = [
    "payment_transactions",
    "affiliate_referrals",
    "checkout_compensation_failures",
    "interac_matches",
]


def protegee(cmd: dict) -> str:
    """Raison de NE PAS supprimer, ou chaîne vide.

    Une commande expédiée a consommé du stock réel et peut-être un envoi
    postal ; une commande payée a touché de l'argent. Les motifs d'adresse ne
    suffisent pas à écarter ces cas — un test mal isolé a pu passer par un
    vrai paiement, et c'est précisément ce qu'on ne veut pas effacer sans le
    voir.
    """
    if (cmd.get("payment_status") or "") == "paid":
        return "paiement confirmé"
    if (cmd.get("fulfillment_status") or "") in ("shipped", "delivered"):
        return "expédiée"
    if (cmd.get("shipping_info") or {}).get("tracking_number"):
        return "numéro de suivi"
    if cmd.get("affiliate_id"):
        return "commission affiliée rattachée"
    return ""


async def main(patterns: list[str], do_delete: bool) -> int:
    load_dotenv("/app/backend/.env")
    mongo = os.environ.get("MONGO_URL")
    dbname = os.environ.get("DB_NAME")
    if not mongo or not dbname:
        print("MONGO_URL ou DB_NAME absent de l'environnement.")
        return 2

    db = AsyncIOMotorClient(mongo)[dbname]
    rx = [re.compile(p, re.I) for p in patterns]

    total = await db.orders.count_documents({})
    matched, protected = [], []
    async for o in db.orders.find({}, {"_id": 0}):
        email = (o.get("email") or "").strip()
        if not any(r.search(email) for r in rx):
            continue
        raison = protegee(o)
        (protected if raison else matched).append({"o": o, "raison": raison})

    print(f"Commandes en base : {total}")
    print(f"Correspondant aux motifs : {len(matched) + len(protected)}")
    print()

    if protected:
        print("PROTÉGÉES — jamais supprimées automatiquement :")
        for r in protected:
            o = r["o"]
            print(f"  {(o.get('order_number') or o.get('id', ''))[:24]:26} "
                  f"{(o.get('email') or '?')[:38]:40} {r['raison']}")
        print()
        print("  Si l'une d'elles est bien un test, supprimez-la à la main :")
        print("  vous verrez alors exactement ce que vous effacez.")
        print()

    if not matched:
        print("Rien à supprimer.")
        return 0

    ids = [r["o"]["id"] for r in matched]
    stats = {c: await db[c].count_documents({"order_id": {"$in": ids}}) for c in LINKED}
    montant = sum(float(r["o"].get("total") or 0) for r in matched)

    print(f"{'COMMANDE':26} {'ADRESSE':40} {'TOTAL':>10}  STATUT")
    print("-" * 96)
    for r in matched:
        o = r["o"]
        print(f"  {(o.get('order_number') or o.get('id',''))[:24]:24} "
              f"{(o.get('email') or '?')[:38]:38} "
              f"{float(o.get('total') or 0):>9.2f}$  "
              f"{o.get('payment_status','?')}/{o.get('fulfillment_status','?')}")

    print()
    print(f"{len(matched)} commande(s), {montant:.2f} $ de faux chiffre d'affaires.")
    for c, n in stats.items():
        if n:
            print(f"  {c:34} {n} document(s) lié(s)")

    if not do_delete:
        print()
        print("INVENTAIRE SEUL — rien n'a été modifié.")
        print("Relancez avec --delete pour exécuter.")
        return 0

    print()
    for coll in LINKED:
        res = await db[coll].delete_many({"order_id": {"$in": ids}})
        if res.deleted_count:
            print(f"  supprimé {res.deleted_count:5} dans {coll}")
    res = await db.orders.delete_many({"id": {"$in": ids}})
    print(f"  supprimé {res.deleted_count:5} commande(s)")
    print()

    # Avertissement CONDITIONNEL. Une commande annulée a déjà rendu ses unités :
    # _restock_order_items() est appelé depuis tous les chemins d'annulation.
    # Avertir malgré tout ferait douter de stocks parfaitement justes, et une
    # alerte qui se déclenche toujours cesse vite d'être lue.
    non_annulees = [r["o"] for r in matched
                    if (r["o"].get("fulfillment_status") or "") != "cancelled"]
    if non_annulees:
        print(f"ATTENTION — {len(non_annulees)} commande(s) supprimée(s) n'étaient")
        print("pas annulées et ont donc pu retenir du stock qui n'a jamais été")
        print("rendu. Vérifiez les quantités des produits concernés :")
        for o in non_annulees[:10]:
            for it in (o.get("items") or []):
                print(f"  {it.get('sku') or it.get('slug', '?'):28} {it.get('qty', 0)} u.")
    else:
        print("Toutes les commandes supprimées étaient annulées : leur stock")
        print("avait déjà été rendu, rien à vérifier de ce côté.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete", action="store_true",
                    help="exécute la suppression (sinon : inventaire seul)")
    ap.add_argument("--pattern", action="append", default=[],
                    help="motif d'adresse supplémentaire (regex), répétable")
    args = ap.parse_args()
    sys.exit(asyncio.run(main(DEFAULT_PATTERNS + args.pattern, args.delete)))
