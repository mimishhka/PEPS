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

echo "==> [1/4] Python compile check"
python -m compileall -q backend tests
python -m py_compile backend/server.py
echo "OK: backend Python syntax"

if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
  echo "==> [2/4] Frontend dependencies"
  cd frontend

  echo "Installing the exact locked frontend dependency tree"
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn install --frozen-lockfile --ignore-scripts --non-interactive

  echo "==> [3/4] Frontend build"
  yarn build
  cd "$ROOT_DIR"
  echo "OK: frontend build"
else
  echo "==> [2/4] Frontend skipped"
fi

if [[ "$WITH_PYTEST" -eq 1 ]]; then
  echo "==> [4/4] Backend tests (pytest)"
  cd backend
  pytest -q
  cd "$ROOT_DIR"
  echo "OK: backend tests"
else
  echo "==> [4/4] Backend tests skipped (use --with-pytest)"
fi

echo "==> Precheck complete"
