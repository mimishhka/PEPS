#!/usr/bin/env bash
set -euo pipefail

# Unified local precheck for this repository:
# - Python syntax compile for backend and tests
# - Frontend production build
# Optional flags:
#   --skip-frontend   Skip frontend checks
#   --with-pytest     Run backend pytest (best-effort; requires env/deps)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_FRONTEND=0
WITH_PYTEST=0

for arg in "$@"; do
  case "$arg" in
    --skip-frontend) SKIP_FRONTEND=1 ;;
    --with-pytest) WITH_PYTEST=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./precheck.sh [options]

Options:
  --skip-frontend   Skip frontend install/build steps
  --with-pytest     Run backend pytest after syntax checks
  -h, --help        Show this help
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

echo "==> [1/7] Python compile check"
python -m compileall -q backend tests
python -m py_compile backend/server.py
echo "OK: backend Python syntax"

# Les sondes JSX passent AVANT l'installation et la construction du frontend.
#
# Deux raisons. Elles prennent une seconde et ne demandent ni node ni
# node_modules, alors que `yarn install && yarn build` prend plusieurs minutes :
# echouer tot economise ce temps. Et surtout, elles NOMMENT le probleme —
# « <thead> jamais ferme, L412 » — la ou le compilateur donne une position et un
# message generique.
#
# Elles tournent meme avec --skip-frontend : elles n'ont besoin de rien.
echo "==> [2/7] Frontend static checks"
python scripts/verifs/verifier.py
echo "OK: frontend static checks"

if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
  echo "==> [3/7] Frontend dependencies"
  cd frontend

  echo "Installing the exact locked frontend dependency tree"
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn install --frozen-lockfile --ignore-scripts --non-interactive

  # ESLint devient BLOQUANT ici, ce qu'il ne pouvait pas etre tant que le
  # compteur affichait 574 avertissements. 544 d'entre eux etaient faux —
  # no-unused-vars ne comprenait pas le JSX — et les 30 restants ont ete traites.
  # A zero, `--max-warnings=0` a enfin un sens : le compteur ne peut plus remonter
  # en silence.
  #
  # Avant la construction : ESLint dit « 'Cog' n'est pas defini, ligne 4 », la ou
  # webpack donne une trace de plusieurs ecrans.
  echo "==> [4/7] Frontend lint"
  yarn lint

  echo "==> [5/7] Frontend build"
  yarn build

  # Les tests de comportement viennent APRES la construction : un fichier qui
  # ne compile pas doit le dire par le message du compilateur, pas par une
  # cascade d'echecs de suites.
  #
  # CI=true met Jest en mode non interactif ; sans lui, il attend une touche.
  echo "==> [6/7] Frontend tests"
  CI=true yarn test --watchAll=false
  cd "$ROOT_DIR"
  echo "OK: frontend build + tests"
else
  echo "==> [3/7] Frontend install skipped"
  echo "==> [4/7] Frontend lint skipped"
  echo "==> [5/7] Frontend build skipped"
  echo "==> [6/7] Frontend tests skipped"
fi

if [[ "$WITH_PYTEST" -eq 1 ]]; then
  echo "==> [7/7] Backend tests (pytest)"
  cd backend
  # Les fichiers UNITAIRES seulement. `pytest -q` lancait tout, y compris les
  # tests d'integration, qui exigent un backend vivant et echouent des la
  # collecte (`assert BASE_URL` au niveau module) — ce drapeau ne pouvait donc
  # pas fonctionner. Voir backend/docs/TESTS.md.
  pytest -q $(grep -L REACT_APP_BACKEND_URL tests/test_*.py | tr '\n' ' ')
  cd "$ROOT_DIR"
  echo "OK: backend tests"
else
  echo "==> [7/7] Backend tests skipped (use --with-pytest)"
fi

echo "==> Precheck complete"
