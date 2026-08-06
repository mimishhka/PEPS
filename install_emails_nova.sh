#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$ROOT_DIR/backend/server.py"
[ -f "$SERVER" ] || { echo "server.py introuvable"; exit 1; }
cp "$SERVER" "${SERVER}.bak-emails-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
python3 - "$SERVER" <<'PY'
import pathlib
import sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
if "FIRONOVA_EMAILS_NOVA_START" in text:
    print("  NOVA email shell already present")
    raise SystemExit(0)
block = """

# ===== FIRONOVA_EMAILS_NOVA_START =====
def _email_shell(order=None, lang="en"):
    if not order:
        return {"subject": "Order update", "body": "Thank you for your order."}
    return {"subject": "Order confirmation" if lang == "en" else "Confirmation de commande", "body": "Merci pour votre commande." if lang == "fr" else "Thank you for your order."}
# ===== FIRONOVA_EMAILS_NOVA_END =====
"""
anchor = "app.include_router(api)"
if anchor in text:
    text = text.replace(anchor, block + "\n" + anchor, 1)
else:
    text += block
path.write_text(text)
print("  NOVA email shell injected")
PY
printf 'Email NOVA installer complete.\n'
