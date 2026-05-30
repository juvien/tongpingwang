#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.103.91.85}"
SERVER_USER="${SERVER_USER:-root}"
APP_DIR="${APP_DIR:-/opt/tongpinwang}"
APP_PORT="${APP_PORT:-8000}"
ADMIN_EMAIL="${TONGPIN_ADMIN_EMAIL:-admin@tongpin.local}"
ADMIN_PASSWORD="${TONGPIN_ADMIN_PASSWORD:-}"
SUPPORT_WECHAT="${TONGPIN_SUPPORT_WECHAT:-TongPinClub}"
SUPPORT_HOURS="${TONGPIN_SUPPORT_HOURS:-每日 12:00 - 22:00}"
SUPPORT_MESSAGE="${TONGPIN_SUPPORT_MESSAGE:-添加客服后备注“同频局”，我们会把你拉入对应城市的兴趣社群。}"
COOKIE_SECURE="${TONGPIN_COOKIE_SECURE:-0}"

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  ADMIN_PASSWORD="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(18))
PY
)"
fi

TMP_ARCHIVE="$(mktemp -t tongpinwang.XXXXXX.tar.gz)"

cleanup() {
  rm -f "${TMP_ARCHIVE}"
}
trap cleanup EXIT

echo "Packaging project..."
tar \
  --exclude='.git' \
  --exclude='data' \
  --exclude='backups' \
  --exclude='tmp' \
  --exclude='tmp-*.png' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  -czf "${TMP_ARCHIVE}" .

echo "Preparing server ${SERVER_USER}@${SERVER_HOST}..."
ssh "${SERVER_USER}@${SERVER_HOST}" "mkdir -p '${APP_DIR}'"
scp "${TMP_ARCHIVE}" "${SERVER_USER}@${SERVER_HOST}:${APP_DIR}/release.tar.gz"

echo "Deploying application..."
ssh "${SERVER_USER}@${SERVER_HOST}" \
  "APP_DIR='${APP_DIR}' APP_PORT='${APP_PORT}' ADMIN_EMAIL='${ADMIN_EMAIL}' ADMIN_PASSWORD='${ADMIN_PASSWORD}' SUPPORT_WECHAT='${SUPPORT_WECHAT}' SUPPORT_HOURS='${SUPPORT_HOURS}' SUPPORT_MESSAGE='${SUPPORT_MESSAGE}' COOKIE_SECURE='${COOKIE_SECURE}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"

tar -xzf release.tar.gz
rm -f release.tar.gz

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl gnupg
    curl -fsSL https://get.docker.com | sh
  elif command -v yum >/dev/null 2>&1; then
    yum install -y yum-utils curl
    curl -fsSL https://get.docker.com | sh
  else
    echo "Unsupported server OS: install Docker manually first." >&2
    exit 1
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is not available. Please install docker compose plugin." >&2
  exit 1
fi

cat > .env <<EOF
HOST=0.0.0.0
PORT=${APP_PORT}
TONGPIN_DATA_DIR=/app/data
TONGPIN_BACKUP_DIR=/app/backups
TONGPIN_ADMIN_EMAIL=${ADMIN_EMAIL}
TONGPIN_ADMIN_PASSWORD=${ADMIN_PASSWORD}
TONGPIN_SUPPORT_WECHAT=${SUPPORT_WECHAT}
TONGPIN_SUPPORT_HOURS=${SUPPORT_HOURS}
TONGPIN_SUPPORT_MESSAGE=${SUPPORT_MESSAGE}
TONGPIN_COOKIE_SECURE=${COOKIE_SECURE}
TONGPIN_SHOW_ADMIN_PASSWORD=0
EOF

docker compose up -d --build
docker compose ps

echo "Waiting for health check..."
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS "http://127.0.0.1:${APP_PORT}/api/health"
echo
REMOTE

echo
echo "Deployment complete."
echo "Public URL: http://${SERVER_HOST}:${APP_PORT}/"
echo "Admin URL:  http://${SERVER_HOST}:${APP_PORT}/admin"
echo "Admin email: ${ADMIN_EMAIL}"
echo "Admin password: ${ADMIN_PASSWORD}"
