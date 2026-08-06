#!/usr/bin/env bash
# FIRONOVA — Garde-fous anti-escalade pour la délégation staff (idempotent). Depuis /app.
# À exécuter APRÈS install_staff_delegation.sh.
# · Bloque l'invitation d'un owner par un non-admin
# · Bloque l'octroi de zones sensibles (staff/audit/trash) par un non-admin
set -euo pipefail
cd "$(dirname "$0")"
SERVER="backend/server.py"; [ -f "$SERVER" ] || SERVER="server.py"
[ -f "$SERVER" ] || { echo "server.py introuvable"; exit 1; }
cp "$SERVER" "${SERVER}.bak-escguards-$(date +%Y%m%d-%H%M%S)"
python3 - "$SERVER" << 'PYEOF'
import sys, ast
p=sys.argv[1]; s=open(p).read(); changed=0

# 1) invite owner réservé aux admins
if "Only an owner can invite another owner" not in s:
    anchor='''    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):'''
    repl='''    email = payload.email.lower().strip()
    if payload.as_owner and admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an owner can invite another owner")
    if await db.users.find_one({"email": email}):'''
    if anchor in s:
        s=s.replace(anchor,repl,1); changed+=1; print("  garde invite-owner ajoute")
    else:
        print("  ! ancre invite introuvable (verifier install_staff_delegation deja applique)")
else:
    print("  garde invite-owner deja present")

# 2) octroi de zones sensibles réservé aux admins
if "Only an owner can grant access to sensitive sections" not in s:
    anchor='''    if target.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot restrict another admin's access this way")'''
    repl=anchor+'''
    if admin.get("role") != "admin":
        perms = payload.model_dump()
        for area in SENSITIVE_AREAS:
            if perms.get(area, "none") != "none":
                raise HTTPException(status_code=403,
                    detail="Only an owner can grant access to sensitive sections (Team, Audit log, Trash)")'''
    if anchor in s:
        s=s.replace(anchor,repl,1); changed+=1; print("  garde zones-sensibles ajoute")
    else:
        print("  ! ancre permissions introuvable")
else:
    print("  garde zones-sensibles deja present")

ast.parse(s); open(p,"w").write(s)
print(f"OK - {changed} garde(s), AST valide.")
PYEOF
echo "Termine. Redemarre le backend."
