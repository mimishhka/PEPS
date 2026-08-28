"""Backfill `order_total` sur les referrals existants.

Le referral est cr├⌐├⌐ avec `base_amount` (sous-total hors port, net de remise)
et `commission_amount`, mais le champ `order_total` (utilis├⌐ par
`affiliate_insights` et l'overview admin pour le CA / panier moyen) n'├⌐tait
jamais ├⌐crit ΓÇö le CA restait donc ├á z├⌐ro.

Ce script copie le total r├⌐el de la commande associ├⌐e (`orders.total`, net de
remise + port) sur les referrals qui n'ont pas encore `order_total`. En
l'absence de commande (ligne orpheline), repli sur `base_amount`.

Idempotent ΓÇö un second run est un no-op.
"""
import asyncio, os, sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    cursor = db.affiliate_referrals.find(
        {"order_total": {"$exists": False}},
        {"_id": 0, "id": 1, "order_id": 1, "base_amount": 1},
    )
    updated = skipped = no_order = 0
    async for ref in cursor:
        order_id = ref.get("order_id")
        total = None
        if order_id:
            order = await db.orders.find_one(
                {"id": order_id}, {"_id": 0, "total": 1}
            )
            total = order.get("total") if order else None
        value = round(float(total), 2) if total is not None else round(float(ref.get("base_amount") or 0.0), 2)
        if total is None:
            no_order += 1
        await db.affiliate_referrals.update_one(
            {"id": ref["id"]},
            {"$set": {"order_total": value}},
        )
        print(f"  ΓåÆ referral {ref['id'][:8]}: order_total={value} "
              f"({'ordre r├⌐el' if total is not None else 'repli base'})")
        updated += 1
    print("")
    print(f"Backfill termin├⌐ : {updated} mis ├á jour, {skipped} d├⌐j├á OK, "
          f"{no_order} sans commande (repli sur base_amount).")


asyncio.run(main())
