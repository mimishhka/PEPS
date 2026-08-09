#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
F="backend/server.py"
[ -f "$F" ] || { echo "ERREUR: lance depuis /app"; exit 1; }
cp "$F" "$F.bak-refundfix-$(date +%Y%m%d-%H%M%S)"

python3 - <<'PY'
f="backend/server.py"; s=open(f).read()
old='    await affiliate_on_order_refunded(order_id, new_refunded, total)'
new='    # Reverse la commission affiliatee uniquement si la commande est\n    # integralement remboursee (cf. docstring affiliate_on_order_reversed).\n    await affiliate_on_order_reversed(order_id, full=(new_refunded >= total))'
n=s.count(old)
if n==0:
    print("  Deja applique.")
    raise SystemExit(0)
assert n==1, f"  ABANDON: {n}x"
s=s.replace(old,new)
import ast; ast.parse(s)
open(f,"w").write(s)
print("  Appel refund corrige (affiliate_on_order_refunded -> affiliate_on_order_reversed). AST OK.")
PY

echo "=== Termine. Commit + push requis. ==="
