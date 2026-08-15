"""Nettoie les données de démo peuplées pour l'affilié demo.
Garde uniquement le compte user + affiliate. Supprime clics, commandes,
referrals et coupon DEMO2026."""
import asyncio, os, sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient

EMAIL = "demo.affilie@fironova.com"
CODE = "DEMO2026"


def require_demo_database() -> None:
    db_name = os.environ.get("DB_NAME", "").lower()
    app_env = os.environ.get("APP_ENV", "").lower()
    if os.environ.get("ALLOW_DEMO_DATA", "").lower() != "true":
        raise SystemExit("Refusing demo cleanup: set ALLOW_DEMO_DATA=true explicitly")
    if app_env in {"prod", "production"} or not any(tag in db_name for tag in ("dev", "test", "demo", "local")):
        raise SystemExit("Refusing demo cleanup: DB_NAME must clearly identify a non-production database")


async def main():
    require_demo_database()
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    aff = await db.affiliates.find_one({"email": EMAIL}, {"_id": 0, "id": 1})
    if not aff:
        print("[skip] no affiliate to clean")
        return
    aff_id = aff["id"]
    c1 = (await db.affiliate_clicks.delete_many({"affiliate_id": aff_id})).deleted_count
    c2 = (await db.affiliate_referrals.delete_many({"affiliate_id": aff_id})).deleted_count
    c3 = (await db.orders.delete_many({"affiliate_id": aff_id})).deleted_count
    c4 = (await db.coupons.delete_many({"code": CODE})).deleted_count
    print(f"[clean] {c1} clics, {c2} referrals, {c3} orders, {c4} coupons supprimés")
    print(f"[kept] user + affiliate (code {CODE}) intacts")

asyncio.run(main())
