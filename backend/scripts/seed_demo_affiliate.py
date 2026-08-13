"""Seed d'un compte affilié démo.
Email et mot de passe fournis via DEMO_AFFILIATE_EMAIL / DEMO_AFFILIATE_PASSWORD.

Crée uniquement:
  - un utilisateur (email_verified=True)
  - un affilié actif avec le code DEMO2026

Idempotent — rejoue safe pour rafraîchir le mot de passe.
"""
import asyncio, os, uuid, sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt

EMAIL = os.environ.get("DEMO_AFFILIATE_EMAIL", "demo.affilie@fironova.com")
PASSWORD = os.environ["DEMO_AFFILIATE_PASSWORD"]
NAME = "Demo Affiliate"
CODE = "DEMO2026"


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1) User
    user = await db.users.find_one({"email": EMAIL})
    if user:
        user_id = user["id"]
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "password_hash": hash_password(PASSWORD),
                "email_verified": True,
                "name": NAME,
                "role": user.get("role") or "user",
            }},
        )
        print(f"[user] existing, credentials refreshed → {user_id}")
    else:
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id,
            "email": EMAIL,
            "name": NAME,
            "password_hash": hash_password(PASSWORD),
            "role": "user",
            "token_version": 0,
            "created_at": now_iso,
            "email_verified": True,
        })
        print(f"[user] created → {user_id}")

    # 2) Affiliate
    aff = await db.affiliates.find_one({"email": EMAIL})
    if aff:
        await db.affiliates.update_one(
            {"id": aff["id"]},
            {"$set": {
                "user_id": user_id,
                "name": NAME,
                "code": CODE,
                "status": "active",
                "compliance_status": "compliant",
                "activated_at": aff.get("activated_at") or now_iso,
            }},
        )
        print(f"[affiliate] existing, activated → {aff['id']} (code {CODE})")
    else:
        await db.affiliates.insert_one({
            "id": str(uuid.uuid4()),
            "email": EMAIL,
            "name": NAME,
            "code": CODE,
            "user_id": user_id,
            "status": "active",
            "compliance_status": "compliant",
            "manual_tier": None,
            "commission_note": "",
            "payout_currency": "btc",
            "payout_address": "",
            "ip_hash": None,
            "known_addresses": [],
            "invite_token_hash": None,
            "invite_expires_at": None,
            "invite_sent_count": 0,
            "created_at": now_iso,
            "activated_at": now_iso,
            "source": "demo_seed",
        })
        print(f"[affiliate] created (code {CODE})")

    print("")
    print("=" * 60)
    print(f"  Email     : {EMAIL}")
    print(f"  Password  : {PASSWORD}")
    print(f"  Code Aff  : {CODE}")
    print("=" * 60)


asyncio.run(main())
