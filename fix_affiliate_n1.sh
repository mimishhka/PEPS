#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
F="backend/server.py"
[ -f "$F" ] || { echo "ERREUR: lance depuis /app"; exit 1; }
cp "$F" "$F.bak-affn1-$(date +%Y%m%d-%H%M%S)"

python3 - <<'PY'
f="backend/server.py"; s=open(f).read()
old='''    cursor = db.affiliate_referrals.find(
        {"status": "pending", "created_at": {"$lte": cutoff}}, {"_id": 0}
    )
    async for r in cursor:
        order = await db.orders.find_one(
            {"id": r["order_id"]}, {"_id": 0, "payment_status": 1}
        )
        if order and order.get("payment_status") == "paid":
            await db.affiliate_referrals.update_one(
                {"id": r["id"], "status": "pending"},
                {"$set": {"status": "approved", "approved_at": now}},
            )'''
new='''    # Batch: on collecte les order_ids des referrals murs pour eviter le N+1.
    matured = await db.affiliate_referrals.find(
        {"status": "pending", "created_at": {"$lte": cutoff}},
        {"_id": 0, "id": 1, "order_id": 1},
    ).to_list(None)
    if not matured:
        return
    order_ids = list({r["order_id"] for r in matured})
    paid_cursor = db.orders.find(
        {"id": {"$in": order_ids}, "payment_status": "paid"}, {"_id": 0, "id": 1}
    )
    paid_ids = {o["id"] async for o in paid_cursor}
    approve_ids = [r["id"] for r in matured if r["order_id"] in paid_ids]
    if approve_ids:
        await db.affiliate_referrals.update_many(
            {"id": {"$in": approve_ids}, "status": "pending"},
            {"$set": {"status": "approved", "approved_at": now}},
        )'''
n=s.count(old)
if n==0:
    print("  Deja applique.")
    raise SystemExit(0)
assert n==1, f"  ABANDON: {n}x"
s=s.replace(old,new)
import ast; ast.parse(s)
open(f,"w").write(s)
print("  N+1 affilies corrige. AST OK.")
PY

echo "=== Termine. Commit + push requis. ==="
