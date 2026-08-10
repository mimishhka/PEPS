#!/usr/bin/env python3
"""
================================================================================
 FIRONOVA — Seed d'un affilié DÉMO (actif, avec données de test)
================================================================================
Crée un affilié `active` rattaché à un compte user EXISTANT, avec des commandes
attribuées (referrals) et un relevé de payout fictifs, pour visualiser et
analyser le dashboard affilié SANS être en prod ni fabriquer de vraies commandes.

Usage (depuis /app/backend, backend affilié DÉJÀ installé) :
    python3 seed_affiliate_demo.py --use-admin
    python3 seed_affiliate_demo.py --email mireille035@outlook.com

Options :
    --use-admin  cible le compte admin (lit ADMIN_EMAIL depuis l'env)
    --email   EMAIL du compte user existant à transformer en affilié démo
    --tier    palier cible : standard|bronze|silver|gold|platinum|diamond (défaut: gold)
    --wipe    supprime d'abord l'affilié démo + ses données pour ce user (reset propre)

Le script est RÉVERSIBLE : tout ce qu'il crée porte le flag {"demo": True}.
Pour tout nettoyer :  python3 seed_affiliate_demo.py --use-admin --wipe --only-wipe
================================================================================
"""

import os
import sys
import uuid
import random
import asyncio
import argparse
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
if not MONGO_URL or not DB_NAME:
    print("ERREUR : MONGO_URL / DB_NAME absents de l'environnement.")
    print("Lance ce script depuis le même env que le backend (variables .env chargées).")
    sys.exit(1)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Seuils de palier (miroir du backend) pour générer un CA cohérent.
TIER_FLOORS = {
    "standard": 500.0,
    "bronze": 2500.0,
    "silver": 6000.0,
    "gold": 12000.0,
    "platinum": 24000.0,
    "diamond": 40000.0,
}
TIER_RATE = {
    "standard": 0.10, "bronze": 0.12, "silver": 0.14,
    "gold": 0.16, "platinum": 0.18, "diamond": 0.20,
}


def _gen_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "FN" + "".join(random.choice(alphabet) for _ in range(6))


async def wipe(user):
    """Supprime l'affilié démo + referrals + payouts liés à ce user."""
    aff = await db.affiliates.find_one({"user_id": user["id"], "demo": True})
    if not aff:
        # tente aussi par email (si demo créé avant liaison)
        aff = await db.affiliates.find_one({"email": user["email"], "demo": True})
    if aff:
        await db.affiliate_referrals.delete_many({"affiliate_id": aff["id"]})
        await db.affiliate_payouts.delete_many({"affiliate_id": aff["id"]})
        await db.affiliates.delete_one({"id": aff["id"]})
        print(f"  Nettoyé : affilié démo {aff['id'][:8]}… + referrals + payouts")
    else:
        print("  Rien à nettoyer (aucun affilié démo pour ce user).")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default=None,
                    help="email du compte user existant (ou utilise --use-admin)")
    ap.add_argument("--use-admin", action="store_true",
                    help="cible le compte admin (lit ADMIN_EMAIL depuis l'env)")
    ap.add_argument("--tier", default="gold",
                    choices=list(TIER_FLOORS.keys()))
    ap.add_argument("--wipe", action="store_true",
                    help="nettoie d'abord l'affilié démo existant")
    ap.add_argument("--only-wipe", action="store_true",
                    help="nettoie et s'arrête (pas de recréation)")
    args = ap.parse_args()

    if args.use_admin:
        email = os.environ.get("ADMIN_EMAIL", "admin@nordpep.ca").lower().strip()
        print(f"Cible : compte admin (ADMIN_EMAIL = {email})")
    elif args.email:
        email = args.email.lower().strip()
    else:
        print("ERREUR : fournis --email EMAIL ou --use-admin.")
        return
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        print(f"ERREUR : aucun compte user avec l'email {email}.")
        print("Crée d'abord ce compte (inscription normale), puis relance.")
        return

    print(f"Compte cible : {user['name']} <{user['email']}> (id {user['id'][:8]}…)")

    if args.wipe or args.only_wipe:
        print("Nettoyage préalable…")
        await wipe(user)
        if args.only_wipe:
            print("Terminé (only-wipe).")
            return

    # Refuse de dupliquer si un affilié (démo ou réel) existe déjà pour ce user
    existing = await db.affiliates.find_one(
        {"$or": [{"user_id": user["id"]}, {"email": email}]}, {"_id": 0}
    )
    if existing:
        print(f"ATTENTION : un affilié existe déjà pour ce compte "
              f"(id {existing['id'][:8]}…, status {existing.get('status')}).")
        print("Relance avec --wipe pour le remplacer par un affilié démo propre.")
        return

    tier = args.tier
    floor = TIER_FLOORS[tier]
    rate = TIER_RATE[tier]
    now = datetime.now(timezone.utc)
    aff_id = str(uuid.uuid4())
    code = _gen_code()

    # --- Affilié actif ---
    await db.affiliates.insert_one({
        "id": aff_id,
        "email": email,
        "name": user["name"],
        "code": code,
        "user_id": user["id"],
        "status": "active",
        "compliance_status": "compliant",
        "manual_tier": None,
        "commission_note": "Compte DÉMO — données de test",
        "payout_currency": "btc",
        "payout_address": "bc1qdemo0000xxxxxxxxxxxxxxxxxxxxxxx0demo",
        "ip_hash": None,
        "known_addresses": [],
        "invite_token_hash": None,
        "invite_expires_at": None,
        "invite_sent_count": 1,
        "invite_last_sent_at": (now - timedelta(days=120)).isoformat(),
        "created_at": (now - timedelta(days=120)).isoformat(),
        "activated_at": (now - timedelta(days=118)).isoformat(),
        "demo": True,
    })

    # --- Génère des commandes attribuées réparties sur ~5 mois ---
    # On vise un CA cumulé un peu au-dessus du plancher du palier voulu.
    target = floor * 1.35
    referrals = []
    accumulated = 0.0
    order_seq = 1000
    # étale sur les 150 derniers jours
    day_cursor = 150
    while accumulated < target and day_cursor > 5:
        base = round(random.uniform(120, 480), 2)
        accumulated += base
        created = now - timedelta(days=day_cursor, hours=random.randint(0, 20))
        # Les plus anciennes sont approved/paid, les 2 plus récentes pending
        if day_cursor > 20:
            status = "paid" if day_cursor > 60 else "approved"
            approved_at = (created + timedelta(days=14)).isoformat()
            paid_at = (created + timedelta(days=16)).isoformat() if status == "paid" else None
        else:
            status = "pending"
            approved_at = None
            paid_at = None
        order_seq += 1
        referrals.append({
            "id": str(uuid.uuid4()),
            "affiliate_id": aff_id,
            "affiliate_code": code,
            "order_id": f"demo-{uuid.uuid4()}",
            "order_number": f"FN-{created.strftime('%y%m%d')}-{order_seq:06d}"[:16],
            "order_email": f"client{order_seq}@example.com",
            "base_amount": base,
            "commission_amount": round(base * rate, 2),
            "status": status,
            "excluded_reason": None,
            "created_at": created.isoformat(),
            "approved_at": approved_at,
            "paid_at": paid_at,
            "payout_id": None,
            "demo": True,
        })
        day_cursor -= random.randint(4, 11)

    if referrals:
        await db.affiliate_referrals.insert_many(referrals)

    # --- Un relevé de payout PAYÉ (mois dernier) regroupant les 'paid' ---
    paid_refs = [r for r in referrals if r["status"] == "paid"]
    if paid_refs:
        payout_total = round(sum(r["commission_amount"] for r in paid_refs), 2)
        payout_id = str(uuid.uuid4())
        last_month = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        await db.affiliate_payouts.insert_one({
            "id": payout_id,
            "affiliate_id": aff_id,
            "affiliate_code": code,
            "period": last_month,
            "amount": payout_total,
            "currency": "btc",
            "payout_address": "bc1qdemo0000xxxxxxxxxxxxxxxxxxxxxxx0demo",
            "referral_ids": [r["id"] for r in paid_refs],
            "referral_count": len(paid_refs),
            "status": "paid",
            "reference": "demo-txhash-8f3a9c2b1e7d4056",
            "note": "Payout DÉMO",
            "created_at": (now - timedelta(days=25)).isoformat(),
            "paid_at": (now - timedelta(days=23)).isoformat(),
            "paid_by": "demo-seed",
            "demo": True,
        })
        # rattache ces referrals au payout
        await db.affiliate_referrals.update_many(
            {"id": {"$in": [r["id"] for r in paid_refs]}},
            {"$set": {"payout_id": payout_id}},
        )

    # --- Récap ---
    n_paid = sum(1 for r in referrals if r["status"] == "paid")
    n_appr = sum(1 for r in referrals if r["status"] == "approved")
    n_pend = sum(1 for r in referrals if r["status"] == "pending")
    print("\n=== Affilié démo créé ===")
    print(f"  Code           : {code}")
    print(f"  Palier visé    : {tier} ({int(rate*100)} %)")
    print(f"  CA validé ~     : {round(accumulated,2)} $ ({len(referrals)} commandes)")
    print(f"  Referrals      : {n_paid} paid · {n_appr} approved · {n_pend} pending")
    print(f"  Lien parrainage: /?ref={code}")
    print("\nConnecte-toi avec ce compte et va sur /affiliate pour voir le dashboard.")
    print("Pour tout retirer :")
    print(f"  python3 seed_affiliate_demo.py --email {email} --wipe --only-wipe")
    print("  (ou remplace --email par --use-admin si tu as ciblé le compte admin)")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
