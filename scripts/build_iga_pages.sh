#!/usr/bin/env bash
set -euo pipefail

API_BASE="${TONGPIN_API_BASE:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist/iga-pages"
ZIP_PATH="${ROOT_DIR}/dist/tongpinju-iga-pages.zip"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/static" "${DIST_DIR}/admin"

cp -R "${ROOT_DIR}/static/assets" "${DIST_DIR}/assets"
cp -R "${ROOT_DIR}/static/assets" "${DIST_DIR}/static/assets"
cp "${ROOT_DIR}/static/styles.css" "${DIST_DIR}/styles.css"
cp "${ROOT_DIR}/static/styles.css" "${DIST_DIR}/static/styles.css"
cp "${ROOT_DIR}/static/app.js" "${DIST_DIR}/app.js"
cp "${ROOT_DIR}/static/app.js" "${DIST_DIR}/static/app.js"
cp "${ROOT_DIR}/static/admin.js" "${DIST_DIR}/static/admin.js"
cp "${ROOT_DIR}/static/admin.js" "${DIST_DIR}/admin.js"
cp "${ROOT_DIR}/static/index.html" "${DIST_DIR}/index.html"
cp "${ROOT_DIR}/static/admin.html" "${DIST_DIR}/admin/index.html"
cp -R "${ROOT_DIR}/api" "${DIST_DIR}/api"

python3 - "$DIST_DIR" "$API_BASE" <<'PY'
import pathlib
import sys

dist = pathlib.Path(sys.argv[1])
api_base = sys.argv[2].rstrip("/")
snippet = f'window.TONGPIN_API_BASE = "{api_base}";'

for path in [dist / "index.html", dist / "admin" / "index.html"]:
    text = path.read_text(encoding="utf-8")
    text = text.replace('window.TONGPIN_API_BASE = window.TONGPIN_API_BASE || "";', snippet)
    path.write_text(text, encoding="utf-8")
PY

(
  cd "${DIST_DIR}"
  zip -qr "${ZIP_PATH}" .
)

echo "IGA Pages dist: ${DIST_DIR}"
echo "IGA Pages zip:  ${ZIP_PATH}"
echo "API base:       ${API_BASE:-same-origin /api proxy}"
