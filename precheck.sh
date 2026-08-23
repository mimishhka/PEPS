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

echo "==> [1/5] Python compile check"
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
echo "==> [2/5] Frontend static checks"
python scripts/verifs/verifier.py
echo "OK: frontend static checks"

if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
  echo "==> [3/5] Frontend dependencies"
  cd frontend

  echo "Installing the exact locked frontend dependency tree"
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn install --frozen-lockfile --ignore-scripts --non-interactive

  echo "==> [4/5] Frontend build"
  yarn build
  cd "$ROOT_DIR"
  echo "OK: frontend build"
else
  echo "==> [3/5] Frontend install skipped"
  echo "==> [4/5] Frontend build skipped"
fi

if [[ "$WITH_PYTEST" -eq 1 ]]; then
  echo "==> [5/5] Backend tests (pytest)"
  cd backend
  pytest -q
  cd "$ROOT_DIR"
  echo "OK: backend tests"
else
  echo "==> [5/5] Backend tests skipped (use --with-pytest)"
fi

echo "==> Precheck complete"
