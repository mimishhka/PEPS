#!/usr/bin/env bash
# ============================================================================
# FIRONOVA — Installeur système d'emails éditables bilingues (idempotent)
# · Ajoute lang à CheckoutIn + stocke la langue dans la commande
# · Injecte le moteur de templates + endpoints admin
# · Réécrit les 4 emails de commande pour utiliser templates + langue client
# À exécuter depuis /app :  bash install_email_templates.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"
SERVER="backend/server.py"; [ -f "$SERVER" ] || SERVER="server.py"
[ -f "$SERVER" ] || { echo "server.py introuvable"; exit 1; }
cp "$SERVER" "${SERVER}.bak-emailtpl-$(date +%Y%m%d-%H%M%S)"
echo "Backup créé."
export EMAIL_DATA_JSON="$(cat email_senders_data.json)"

python3 - "$SERVER" << 'PYEOF'
import sys, re, ast, base64, os, json
path = sys.argv[1]; src = open(path).read()
data = json.loads(os.environ["EMAIL_DATA_JSON"])

# 1) lang dans CheckoutIn (idempotent)
if "lang: Optional[str] = \"fr\"  # langue du client" not in src:
    a = '    confirm_research_use: bool\n'
    # cibler l'occurrence dans CheckoutIn : celle suivie de "class CouponIn" plus loin
    idx = src.find('class CheckoutIn')
    if idx != -1:
        seg = src[idx:idx+800]
        if 'confirm_research_use: bool' in seg:
            newseg = seg.replace('    confirm_research_use: bool\n',
                '    confirm_research_use: bool\n    lang: Optional[str] = "fr"  # langue du client (version du site) — pilote la langue des emails\n', 1)
            src = src[:idx] + newseg + src[idx+800:]
            print("  lang ajoute a CheckoutIn")
else:
    print("  lang deja dans CheckoutIn")

# 2) lang dans order_doc (idempotent)
if '"lang": (payload.lang if payload.lang in ("fr", "en")' not in src:
    a = '        "notes": [],\n        "created_at": datetime.now(timezone.utc).isoformat(),'
    b = '        "notes": [],\n        "lang": (payload.lang if payload.lang in ("fr", "en") else "fr"),\n        "created_at": datetime.now(timezone.utc).isoformat(),'
    if a in src:
        src = src.replace(a, b, 1); print("  lang stocke dans order_doc")
    else:
        print("  ! ancre order_doc introuvable")
else:
    print("  lang deja dans order_doc")

# 3) Bloc moteur templates (idempotent)
BLOCK = base64.b64decode(data["block_b64"]).decode()
wrapped = "\n\n# ===== FIRONOVA_EMAIL_TEMPLATES_START =====\n" + BLOCK + "\n# ===== FIRONOVA_EMAIL_TEMPLATES_END =====\n"
if "FIRONOVA_EMAIL_TEMPLATES_START" in src:
    src = re.sub(r"# ===== FIRONOVA_EMAIL_TEMPLATES_START =====.*?# ===== FIRONOVA_EMAIL_TEMPLATES_END =====\n", wrapped.strip()+"\n", src, flags=re.DOTALL); print("  moteur templates remplace")
else:
    src = src.replace("app.include_router(api)", wrapped + "\napp.include_router(api)", 1); print("  moteur templates injecte")

# 4) Réécriture des 4 senders par regex de fonction (remplace corps complet)
def replace_func(src, fname, new_code):
    # matche "async def fname(...):" jusqu'à la prochaine def/async def top-level ou 2 sauts de ligne + def
    pat = re.compile(r"async def " + re.escape(fname) + r"\(.*?\n(?=\n(?:async def |def |# ====|@api))", re.DOTALL)
    if pat.search(src):
        return pat.sub(new_code.rstrip()+"\n\n", src, count=1), True
    return src, False

for fname, key in [("send_order_confirmation","confirm"),("send_payment_received","payment"),
                   ("send_shipping_notification","shipping"),("send_refund_email","refund")]:
    new_code = base64.b64decode(data[key]).decode()
    # ne réécrire que si pas déjà templatisé
    m = re.search(r"async def "+re.escape(fname)+r"\(.*?\n(?=\n(?:async def |def |# ====|@api))", src, re.DOTALL)
    if m and "render_email_template" in m.group(0):
        print(f"  {fname} deja templatise"); continue
    src, ok = replace_func(src, fname, new_code)
    print(f"  {fname}: {'reecrit' if ok else 'ANCRE INTROUVABLE'}")

ast.parse(src); open(path,"w").write(src)
print("OK - server.py a jour, AST valide.")
PYEOF
echo "Termine. Redemarre le backend."
