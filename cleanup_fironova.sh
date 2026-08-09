#!/usr/bin/env bash
set -euo pipefail

# cleanup_fironova.sh — supprime UNIQUEMENT les fichiers prouvés morts.
# À exécuter depuis /app. Ne touche aucun code vivant.
# Protégés explicitement : server.py, NotFound.jsx, ComingSoon.jsx, design_guidelines.json

cd "$(dirname "$0")"
[ -f backend/server.py ] || { echo "ERREUR: backend/server.py introuvable. Es-tu dans /app ?"; exit 1; }

# Garde-fou : refuse de tourner si un fichier vivant clé manque déjà
for guard in backend/server.py frontend/src/pages/NotFound.jsx frontend/src/pages/ComingSoon.jsx; do
  [ -f "$guard" ] || { echo "ABANDON: fichier vivant '$guard' absent. Rien supprimé."; exit 1; }
done

removed=0
del() {
  for f in "$@"; do
    if [ -e "$f" ]; then echo "  rm $f"; rm -rf "$f"; removed=$((removed+1)); fi
  done
}

echo "=== 1. Backups server.py (19 fichiers) ==="
del backend/server.py.bak-*

echo "=== 2. Doublon + CSS orphelin ==="
# on ne supprime le doublon minuscule que s'il diffère par la casse du vrai
if [ -f frontend/src/pages/Notfound.jsx ] && [ -f frontend/src/pages/NotFound.jsx ]; then
  del frontend/src/pages/Notfound.jsx
fi
del frontend/src/index_1.css

echo "=== 3. ZIPs livrés (déjà gitignorés) ==="
del PEPS-FINAL-41.zip PEPS-LIVRAISON.zip

echo "=== 4. Dossier de backup daté ==="
del .backup-20260717-001152

echo "=== 5. Scripts one-shot déjà appliqués ==="
del apply_coa_status.py apply_magic.py \
    install_affiliates_backend.sh install_analytics_enhanced.sh \
    install_customers_enriched.sh install_email_automation.sh \
    install_email_templates.sh install_emails_nova.sh \
    install_related_products.sh install_seo_backend.sh \
    install_staff_delegation.sh install_staff_escalation_guards.sh

echo "=== 6. Fragments texte/json orphelins ==="
del customers_endpoints.txt related_endpoint.txt email_senders_data.json

echo ""
echo "=== VÉRIFICATION FINALE ==="
python3 -c "import ast; ast.parse(open('backend/server.py').read()); print('  server.py: AST OK')"
echo "  NotFound.jsx (vivant): $([ -f frontend/src/pages/NotFound.jsx ] && echo présent || echo MANQUANT)"
echo "  ComingSoon.jsx (vivant): $([ -f frontend/src/pages/ComingSoon.jsx ] && echo présent || echo MANQUANT)"
echo "  design_guidelines.json (conservé): $([ -f design_guidelines.json ] && echo présent || echo supprimé)"
echo "  Éléments supprimés: $removed"
echo "=== Terminé. Commit + push manuel requis. ==="
