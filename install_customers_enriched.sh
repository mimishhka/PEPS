#!/usr/bin/env bash
# FIRONOVA — Installeur Clients enrichis + segments + fiche détail (idempotent). Depuis /app.
set -euo pipefail
cd "$(dirname "$0")"
SERVER="backend/server.py"; [ -f "$SERVER" ] || SERVER="server.py"
[ -f "$SERVER" ] || { echo "server.py introuvable"; exit 1; }
cp "$SERVER" "${SERVER}.bak-customers-$(date +%Y%m%d-%H%M%S)"
python3 - "$SERVER" << 'PYEOF'
import sys, re, ast
p=sys.argv[1]; s=open(p).read()
if '/admin/customers/{user_id}' in s:
    print("  clients enrichis deja presents"); sys.exit(0)
NEW = open("customers_endpoints.txt").read().rstrip()+"\n\n\n"
# remplacer l'ancien endpoint plat (de @api.get("/admin/customers") jusqu'à @api.get("/admin/subscribers"))
pat = re.compile(r'@api\.get\("/admin/customers"\).*?\n(?=\n@api\.get\("/admin/subscribers"\))', re.DOTALL)
if not pat.search(s):
    print("  ! ancre /admin/customers introuvable"); sys.exit(1)
s = pat.sub(NEW, s, count=1)
ast.parse(s); open(p,"w").write(s)
print("  clients enrichis installes, AST OK")
PYEOF
echo "Termine. Redemarre le backend."
