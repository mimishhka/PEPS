#!/usr/bin/env bash
# FIRONOVA — Installeur délégation complète des droits staff (idempotent). Depuis /app.
# · Étend STAFF_AREAS aux 15 zones + SENSITIVE_AREAS
# · Convertit les gardes get_admin_user → require_area sur les zones délégables
# · Garde promote_owner + revoke en admin-only strict (anti-escalade)
# · Ajoute un garde-fou dans update_staff_permissions
set -euo pipefail
cd "$(dirname "$0")"
SERVER="backend/server.py"; [ -f "$SERVER" ] || SERVER="server.py"
[ -f "$SERVER" ] || { echo "server.py introuvable"; exit 1; }
cp "$SERVER" "${SERVER}.bak-delegation-$(date +%Y%m%d-%H%M%S)"
python3 - "$SERVER" << 'PYEOF'
import sys, re, ast
p=sys.argv[1]; s=open(p).read()
changed=0

# 1) Étendre STAFF_AREAS (idempotent)
if '"categories", "menus", "seo", "emails", "affiliates", "staff", "audit", "trash"' not in s:
    old='STAFF_AREAS = ["orders", "products", "coupons", "customers", "subscribers", "shipping", "dashboard"]'
    new=('STAFF_AREAS = ["orders", "products", "coupons", "customers", "subscribers", "shipping", "dashboard",\n'
         '               "categories", "menus", "seo", "emails", "affiliates", "staff", "audit", "trash"]\n'
         'SENSITIVE_AREAS = ["staff", "audit", "trash"]')
    if old in s:
        s=s.replace(old,new,1); changed+=1; print("  STAFF_AREAS etendu")
else:
    print("  STAFF_AREAS deja etendu")

# 2) Conversions de gardes : (fonction, area, level)
CONV=[("admin_create_category","categories","manage"),("admin_update_category","categories","manage"),
("admin_delete_category","categories","manage"),("admin_list_categories","categories","view"),
("admin_create_menu","menus","manage"),("admin_update_menu","menus","manage"),
("admin_delete_menu","menus","manage"),("admin_list_menus","menus","view"),
("admin_seo_set_settings","seo","manage"),("admin_seo_update_product","seo","manage"),
("admin_seo_get_settings","seo","view"),("admin_seo_health","seo","view"),("admin_seo_products","seo","view"),
("admin_email_template_update","emails","manage"),("admin_email_template_reset","emails","manage"),
("admin_email_template_preview","emails","view"),("admin_email_templates_list","emails","view"),
("admin_affiliate_invite","affiliates","manage"),("admin_affiliate_resend","affiliates","manage"),
("admin_affiliate_update","affiliates","manage"),("admin_affiliate_run_payouts","affiliates","manage"),
("admin_affiliate_mark_paid","affiliates","manage"),("admin_affiliates_list","affiliates","view"),
("admin_affiliate_detail","affiliates","view"),("admin_affiliate_payouts_all","affiliates","view"),
("admin_audit_log","audit","view"),
("admin_list_trash","trash","view"),("admin_restore_trash","trash","manage"),("admin_purge_trash","trash","manage"),
("admin_list_staff","staff","view"),("admin_list_staff_invites","staff","view"),
("admin_invite_staff","staff","manage"),("admin_cancel_staff_invite","staff","manage"),
("admin_update_staff_permissions","staff","manage")]
c=0
for f,a,l in CONV:
    m=re.search(r'(async def '+re.escape(f)+r'\(.*?Depends\()get_admin_user(\))',s,re.DOTALL)
    if m:
        s=s[:m.start()]+m.group(1)+f'require_area("{a}", "{l}")'+m.group(2)+s[m.end():]; c+=1
print(f"  gardes converties: {c} (les deja-converties sont ignorees)")
if c: changed+=1

# 3) Garde-fou anti-escalade dans update_staff_permissions (idempotent)
if 'You cannot modify your own permissions' not in s:
    anchor='''    target = await db.users.find_one({"id": user_id})
    if not target:'''
    repl='''    if admin.get("role") != "admin" and user_id == admin["id"]:
        raise HTTPException(status_code=403, detail="You cannot modify your own permissions")
    target = await db.users.find_one({"id": user_id})
    if not target:'''
    if anchor in s:
        s=s.replace(anchor,repl,1); changed+=1; print("  garde-fou anti-escalade ajoute")
else:
    print("  garde-fou anti-escalade deja present")

ast.parse(s); open(p,"w").write(s)
print(f"OK - {changed} groupe(s) de changements, AST valide.")
PYEOF
echo "Termine. Redemarre le backend."
