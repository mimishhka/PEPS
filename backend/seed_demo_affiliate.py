#!/usr/bin/env python3
"""
Crée un compte CLIENT fictif qui est aussi AFFILIÉ ACTIF, avec son coupon lié.
À exécuter depuis /app/backend sur Emergent :  python3 seed_demo_affiliate.py

Il utilise la même base que le backend (MONGO_URL / DB_NAME de l'environnement).
Idempotent : relançable sans créer de doublon.
"""
import asyncio, os, uuid, secrets
from datetime import datetime, timezone

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

# ---- Paramètres du compte démo (modifie si tu veux) ----
DEMO_EMAIL    = "demo.affilie@fironova.com"
DEMO_NAME     = "Démo Affilié"
DEMO_PASSWORD = "Fironova!Demo2026"      # <-- ton mot de passe d'accès
COUPON_PERCENT = float(os.environ.get("AFFILIATE_COUPON_PERCENT", "10"))

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def gen_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "FN" + "".join(secrets.choice(alphabet) for _ in range(6))

async def main():
    MONGO_URL = os.environ["MONGO_URL"]
    DB_NAME = os.environ["DB_NAME"]
    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    now = datetime.now(timezone.utc).isoformat()

    # 1) USER client
    user = await db.users.find_one({"email": DEMO_EMAIL}, {"_id": 0})
    if user:
        user_id = user["id"]
        await db.users.update_one({"id": user_id}, {"$set": {
            "password_hash": hash_password(DEMO_PASSWORD), "token_version": 0,
        }})
        print(f"→ Utilisateur existant mis à jour : {DEMO_EMAIL}")
    else:
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id, "email": DEMO_EMAIL, "name": DEMO_NAME,
            "password_hash": hash_password(DEMO_PASSWORD), "role": "user",
            "token_version": 0, "created_at": now, "email_verified": True,
        })
        print(f"→ Utilisateur client créé : {DEMO_EMAIL}")

    # 2) AFFILIÉ actif lié au user
    aff = await db.affiliates.find_one({"email": DEMO_EMAIL}, {"_id": 0})
    if aff and aff.get("code"):
        code = aff["code"]
        await db.affiliates.update_one({"id": aff["id"]}, {"$set": {
            "status": "active", "user_id": user_id,
        }})
        aff_id = aff["id"]
        print(f"→ Affilié existant réactivé : {code}")
    else:
        aff_id = aff["id"] if aff else str(uuid.uuid4())
        code = gen_code()
        # éviter collision de code
        while await db.affiliates.find_one({"code": code}, {"_id": 1}):
            code = gen_code()
        doc = {
            "id": aff_id, "email": DEMO_EMAIL, "name": DEMO_NAME,
            "code": code, "user_id": user_id, "status": "active",
            "compliance_status": "compliant", "manual_tier": None,
            "commission_note": "", "payout_currency": "btc", "payout_address": "",
            "ip_hash": None, "known_addresses": [], "invite_token_hash": None,
            "invite_expires_at": None, "invite_sent_count": 0,
            "invite_last_sent_at": None, "created_at": now, "activated_at": now,
        }
        if aff:
            await db.affiliates.update_one({"id": aff_id}, {"$set": doc})
        else:
            await db.affiliates.insert_one(doc)
        print(f"→ Affilié actif créé : code {code}")

    # 3) COUPON lié (idempotent)
    if COUPON_PERCENT > 0:
        existing = await db.coupons.find_one({"code": code}, {"_id": 0})
        if not existing:
            await db.coupons.insert_one({
                "id": str(uuid.uuid4()), "code": code, "discount_type": "percent",
                "value": COUPON_PERCENT, "min_subtotal": 0.0, "usage_limit": None,
                "used_count": 0, "active": True, "expires_at": None,
                "created_at": now, "affiliate_id": aff_id, "source": "affiliate",
            })
            print(f"→ Coupon {code} créé ({COUPON_PERCENT:.0f}%)")
        else:
            print(f"→ Coupon {code} déjà présent")

    print("\n" + "=" * 48)
    print("  ACCÈS COMPTE DÉMO (client + affilié)")
    print("=" * 48)
    print(f"  URL connexion : /login")
    print(f"  Courriel      : {DEMO_EMAIL}")
    print(f"  Mot de passe  : {DEMO_PASSWORD}")
    print(f"  Code affilié  : {code}")
    print(f"  Dashboard     : /affiliate")
    print(f"  Lien parrain. : /?ref={code}")
    print(f"  Coupon filleul: {code} ({COUPON_PERCENT:.0f}% au checkout)")
    print("=" * 48)

if __name__ == "__main__":
    asyncio.run(main())
