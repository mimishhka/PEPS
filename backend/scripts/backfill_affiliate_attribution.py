"""Backfill affiliate_id + referrals sur les commandes qui portaient déjà un
coupon d'affilié mais n'avaient pas été rattachées (bug pré-fix des aliases).

Idempotent : re-run safe. Ne touche jamais aux commandes déjà attribuées.
Crée les referrals via affiliate_on_order_paid() (unique index sur order_id).
Usage : python3 -m scripts.backfill_affiliate_attribution [--dry-run]
"""
import asyncio
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

DRY_RUN = "--dry-run" in sys.argv


async def _main():
    import server as s  # noqa
    from services.affiliate import affiliate_on_order_paid

    db = s.db
    # 1. Trouve toutes les commandes avec un coupon mais sans affiliate_id
    query = {
        "coupon": {"$exists": True, "$ne": None},
        "$or": [{"affiliate_id": None}, {"affiliate_id": {"$exists": False}}],
    }
    total = await db.orders.count_documents(query)
    print(f"[backfill] {total} orders with coupon but no affiliate_id")

    n_attributed = 0
    n_referred = 0
    n_skipped = 0
    async for order in db.orders.find(query, {"_id": 0}):
        coupon = order.get("coupon") or {}
        code = str((coupon or {}).get("code") or "").strip().upper()
        if not code:
            n_skipped += 1
            continue

        # Cherche l'affilié via code OU alias
        aff = await db.affiliates.find_one(
            {"$or": [
                {"code": code},
                {"aliases": {"$elemMatch": {"code": code, "active": True}}},
            ], "status": "active"},
            {"_id": 0},
        )
        if not aff:
            n_skipped += 1
            print(f"  SKIP #{order.get('order_number')} — no active affiliate for code {code}")
            continue

        # Anti auto-parrainage
        order_email = (order.get("email") or "").lower().strip()
        aff_email = (aff.get("email") or "").lower().strip()
        if order_email and order_email == aff_email:
            n_skipped += 1
            print(f"  SKIP #{order.get('order_number')} — self-order")
            continue

        print(f"  ATTRIBUTE #{order.get('order_number')} → aff={aff['code']} ({aff.get('email')})")
        if DRY_RUN:
            n_attributed += 1
            continue

        # 2. Setter les 3 champs affiliate_id / affiliate_code / affiliate_source
        await db.orders.update_one(
            {"id": order["id"]},
            {"$set": {
                "affiliate_id": aff["id"],
                "affiliate_code": aff["code"],
                "affiliate_source": "backfill",
                "affiliate_backfilled_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        n_attributed += 1

        # 2b. Créer le binding client → affilié (rattachement durable) si absent.
        # $setOnInsert n'écrase JAMAIS un binding déjà présent (règle: un client
        # reste acquis à celui qui l'a amené en premier, même après backfill).
        try:
            await db.affiliate_bindings.update_one(
                {"email": order_email},
                {"$setOnInsert": {
                    "email": order_email,
                    "affiliate_id": aff["id"],
                    "affiliate_code": aff["code"],
                    "source": "backfill",
                    "bound_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
        except Exception as e:
            print(f"  WARN binding not stored for {order_email}: {type(e).__name__}")

        # 3. Si la commande est déjà payée, créer le referral (idempotent)
        if order.get("payment_status") == "paid":
            order["affiliate_id"] = aff["id"]  # nécessaire pour la fn
            await affiliate_on_order_paid(order)
            n_referred += 1

    print(f"\n=== BACKFILL {'DRY-RUN' if DRY_RUN else 'APPLIED'} (pass 1: attributions) ===")
    print(f"attributed : {n_attributed}")
    print(f"referrals created (paid orders) : {n_referred}")
    print(f"skipped    : {n_skipped}")

    # ------------------------------------------------------------------
    # Pass 2 — Bindings pour les commandes déjà attribuées mais sans lien
    # sticky enregistré (cas des attributions faites avant l'introduction
    # des bindings, ou par un backfill antérieur qui ne les créait pas).
    # ------------------------------------------------------------------
    print("\n[backfill] pass 2 : ensure sticky bindings for attributed orders")
    n_bindings = 0
    n_bindings_skip = 0
    cursor = db.orders.find(
        {"affiliate_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "email": 1, "user_id": 1, "affiliate_id": 1, "affiliate_code": 1},
    )
    async for order in cursor:
        email = (order.get("email") or "").lower().strip()
        aff_id = order.get("affiliate_id")
        aff_code = order.get("affiliate_code")
        if not email or not aff_id:
            n_bindings_skip += 1
            continue
        existing = await db.affiliate_bindings.find_one({"email": email}, {"_id": 0, "affiliate_id": 1})
        if existing:
            n_bindings_skip += 1
            continue
        if DRY_RUN:
            print(f"  BIND {email} → {aff_code}")
            n_bindings += 1
            continue
        try:
            await db.affiliate_bindings.update_one(
                {"email": email},
                {"$setOnInsert": {
                    "email": email,
                    "affiliate_id": aff_id,
                    "affiliate_code": aff_code,
                    "source": "backfill_pass2",
                    "bound_at": datetime.now(timezone.utc).isoformat(),
                    **({"user_id": order["user_id"]} if order.get("user_id") else {}),
                }},
                upsert=True,
            )
            n_bindings += 1
            print(f"  BIND {email} → {aff_code}")
        except Exception as e:
            print(f"  ERR binding {email}: {type(e).__name__}")
    print(f"\n=== PASS 2 {'DRY-RUN' if DRY_RUN else 'APPLIED'} ===")
    print(f"bindings created : {n_bindings}")
    print(f"bindings skipped (already present or no email) : {n_bindings_skip}")


asyncio.run(_main())
