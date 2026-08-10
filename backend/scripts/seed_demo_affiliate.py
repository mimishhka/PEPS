"""Seed d'un compte affilié démo pleinement fonctionnel.

Email: demo.affilie@fironova.com  |  Password: Fironova!Demo2026

Crée:
  - un utilisateur (email_verified=True)
  - un affilié actif avec un code stable "DEMO2026"
  - un coupon lié pour l'attribution automatique via ?ref=DEMO2026
  - quelques clics + 2 commandes payées pour peupler le dashboard
"""
import asyncio, os, uuid, sys, random
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt


MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

EMAIL = "demo.affilie@fironova.com"
PASSWORD = "Fironova!Demo2026"
NAME = "Demo Affiliate"
CODE = "DEMO2026"


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

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
        print(f"[user] existing, credentials + verify refreshed → {user_id}")
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
        aff_id = aff["id"]
        await db.affiliates.update_one(
            {"id": aff_id},
            {"$set": {
                "user_id": user_id,
                "name": NAME,
                "code": CODE,
                "status": "active",
                "compliance_status": "compliant",
                "manual_tier": None,
                "commission_note": "Demo — programme affiliation Fironova",
                "payout_currency": "btc",
                "payout_address": "bc1qdemo0000000000000000000000000000000000",
                "activated_at": aff.get("activated_at") or now_iso,
            }},
        )
        print(f"[affiliate] existing, activated & code fixed → {aff_id} (code {CODE})")
    else:
        aff_id = str(uuid.uuid4())
        await db.affiliates.insert_one({
            "id": aff_id,
            "email": EMAIL,
            "name": NAME,
            "code": CODE,
            "user_id": user_id,
            "status": "active",
            "compliance_status": "compliant",
            "manual_tier": None,
            "commission_note": "Demo — programme affiliation Fironova",
            "payout_currency": "btc",
            "payout_address": "bc1qdemo0000000000000000000000000000000000",
            "ip_hash": None,
            "known_addresses": [],
            "invite_token_hash": None,
            "invite_expires_at": None,
            "invite_sent_count": 0,
            "created_at": now_iso,
            "activated_at": now_iso,
            "source": "demo_seed",
        })
        print(f"[affiliate] created → {aff_id} (code {CODE})")

    # 3) Coupon lié au code affilié (10% par défaut)
    await db.coupons.update_one(
        {"code": CODE},
        {"$setOnInsert": {
            "id": str(uuid.uuid4()),
            "code": CODE,
            "discount_type": "percent",
            "value": 10.0,
            "min_subtotal": 0.0,
            "usage_limit": None,
            "used_count": 0,
            "used_by": [],
            "active": True,
            "expires_at": None,
            "start_at": None,
            "allowed_emails": [],
            "restrict_products": [],
            "restrict_categories": [],
            "first_order_only": False,
            "per_customer_limit": None,
            "max_discount_cad": None,
            "affiliate_code": CODE,
            "created_at": now_iso,
        }},
        upsert=True,
    )
    print(f"[coupon] upsert {CODE} (10% off)")

    # 4) Peupler quelques clics de démo (répartis sur 30 jours)
    existing_clicks = await db.affiliate_clicks.count_documents({"affiliate_id": aff_id})
    if existing_clicks < 5:
        await db.affiliate_clicks.delete_many({"affiliate_id": aff_id})
        for i in range(48):
            ts = now - timedelta(days=random.randint(0, 29), hours=random.randint(0, 23))
            await db.affiliate_clicks.insert_one({
                "id": str(uuid.uuid4()),
                "affiliate_id": aff_id,
                "code": CODE,
                "created_at": ts.isoformat(),
                "source": random.choice(["direct", "twitter", "reddit", "telegram", "email"]),
                "ip_hash": f"demo-{i%12}",
                "user_agent_family": random.choice(["chrome", "safari", "firefox", "edge"]),
                "referrer": random.choice(["https://t.co/", "https://reddit.com/r/peptides", "", "https://google.com/"]),
            })
        print(f"[clicks] seeded 48 demo clicks")
    else:
        print(f"[clicks] {existing_clicks} déjà présents, skip")

    # 5) 2 commandes payées attribuées pour peupler top-products
    products = await db.products.find({}, {"_id": 0, "id": 1, "slug": 1, "name_en": 1, "name_fr": 1, "images": 1, "variants": 1}).limit(4).to_list(4)
    if products and await db.orders.count_documents({"affiliate_id": aff_id}) < 2:
        for idx in range(2):
            order_id = str(uuid.uuid4())
            order_number = f"FN-DEMO{idx+1:02d}-{uuid.uuid4().hex[:6].upper()}"
            items = []
            subtotal = 0.0
            for p in random.sample(products, k=min(2, len(products))):
                variants = p.get("variants") or []
                v = variants[0] if variants else {}
                price = float(v.get("price") or 79.0)
                qty = random.randint(1, 3)
                line = round(price * qty, 2)
                subtotal += line
                imgs = p.get("images") or []
                first_img = imgs[0] if imgs else ""
                img_url = first_img.get("url", "") if isinstance(first_img, dict) else str(first_img or "")
                items.append({
                    "product_id": p["id"],
                    "slug": p.get("slug", ""),
                    "variant_id": v.get("id") or "_default",
                    "name_en": p.get("name_en") or p.get("slug"),
                    "name_fr": p.get("name_fr") or p.get("name_en") or p.get("slug"),
                    "image_url": img_url,
                    "qty": qty,
                    "price": price,
                    "line_total": line,
                    "preorder": False,
                })
            total = round(subtotal * 0.9 + 15.0, 2)  # 10% discount + $15 shipping
            paid_at = (now - timedelta(days=random.randint(2, 20))).isoformat()
            await db.orders.insert_one({
                "id": order_id,
                "order_number": order_number,
                "email": f"customer{idx+1}@example.com",
                "status": "paid",
                "payment_status": "paid",
                "fulfillment_status": "delivered",
                "payment_method": "etransfer",
                "items": items,
                "subtotal": subtotal,
                "discount": round(subtotal * 0.1, 2),
                "shipping": 15.0,
                "total": total,
                "coupon": {"code": CODE, "discount_type": "percent", "value": 10.0},
                "coupon_counted": True,
                "affiliate_id": aff_id,
                "affiliate_code": CODE,
                "created_at": paid_at,
                "paid_at": paid_at,
                "notes": [],
            })
            # Referral / commission (10% de la marge subtotal)
            commission = round(subtotal * 0.10, 2)
            await db.affiliate_referrals.insert_one({
                "id": str(uuid.uuid4()),
                "affiliate_id": aff_id,
                "order_id": order_id,
                "order_number": order_number,
                "order_subtotal": subtotal,
                "commission_cad": commission,
                "status": "validated",
                "created_at": paid_at,
                "validated_at": paid_at,
            })
        print(f"[orders] seeded 2 paid orders + referrals")
    else:
        print(f"[orders] déjà présents ou catalogue vide, skip")

    print("")
    print("=" * 60)
    print("Compte affilié DÉMO prêt :")
    print(f"  URL       : /login")
    print(f"  Email     : {EMAIL}")
    print(f"  Password  : {PASSWORD}")
    print(f"  Code Aff  : {CODE}")
    print(f"  Dashboard : /affiliate")
    print(f"  Lien ref  : /?ref={CODE}")
    print("=" * 60)


asyncio.run(main())
