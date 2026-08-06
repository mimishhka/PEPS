#!/usr/bin/env bash
# FIRONOVA — Installeur endpoint « produits reliés » (idempotent). Depuis /app.
set -euo pipefail
cd "$(dirname "$0")"
SERVER="backend/server.py"; [ -f "$SERVER" ] || SERVER="server.py"
[ -f "$SERVER" ] || { echo "server.py introuvable"; exit 1; }
cp "$SERVER" "${SERVER}.bak-related-$(date +%Y%m%d-%H%M%S)"
python3 - "$SERVER" << 'PYEOF'
import sys, ast
p=sys.argv[1]; s=open(p).read()
if '/products/{slug}/related' in s:
    print("  endpoint related deja present"); sys.exit(0)
ENDPOINT = open("related_endpoint.txt").read()
anchor='@api.post("/notify-stock")'
if anchor not in s:
    print("  ! ancre notify-stock introuvable"); sys.exit(1)
s=s.replace(anchor, ENDPOINT.rstrip()+"\n\n\n"+anchor, 1)
ast.parse(s); open(p,"w").write(s)
print("  endpoint related injecte, AST OK")
PYEOF
echo "Termine. Redemarre le backend."
