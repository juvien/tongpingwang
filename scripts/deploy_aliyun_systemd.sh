#!/usr/bin/env bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-39.103.91.85}"
SERVER_USER="${SERVER_USER:-root}"
APP_DIR="${APP_DIR:-/opt/tongpinwang}"
APP_PORT="${APP_PORT:-80}"
ADMIN_EMAIL="${TONGPIN_ADMIN_EMAIL:-admin@tongpin.local}"
ADMIN_PASSWORD="${TONGPIN_ADMIN_PASSWORD:-}"
SUPPORT_WECHAT="${TONGPIN_SUPPORT_WECHAT:-TongPinClub}"
SUPPORT_HOURS="${TONGPIN_SUPPORT_HOURS:-每日 12:00 - 22:00}"
SUPPORT_MESSAGE="${TONGPIN_SUPPORT_MESSAGE:-添加客服后备注“同频局”，我们会把你拉入对应城市的兴趣社群。}"
COOKIE_SECURE="${TONGPIN_COOKIE_SECURE:-0}"
SSH_KEY="${SSH_KEY:-}"
SSH_OPTS="${SSH_OPTS:-}"

SSH_ARGS=()
if [[ -n "${SSH_KEY}" ]]; then
  SSH_ARGS+=("-i" "${SSH_KEY}")
fi
if [[ -n "${SSH_OPTS}" ]]; then
  # shellcheck disable=SC2206
  SSH_ARGS+=(${SSH_OPTS})
fi

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  ADMIN_PASSWORD="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(18))
PY
)"
fi

TMP_ARCHIVE="$(mktemp -t tongpinwang-systemd.XXXXXX.tar.gz)"

cleanup() {
  rm -f "${TMP_ARCHIVE}"
}
trap cleanup EXIT

echo "Packaging project..."
COPYFILE_DISABLE=1 tar \
  --exclude='.git' \
  --exclude='data' \
  --exclude='backups' \
  --exclude='tmp' \
  --exclude='tmp-*.png' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  -czf "${TMP_ARCHIVE}" .

echo "Preparing server ${SERVER_USER}@${SERVER_HOST}..."
ssh "${SSH_ARGS[@]}" "${SERVER_USER}@${SERVER_HOST}" "mkdir -p '${APP_DIR}'"
scp "${SSH_ARGS[@]}" "${TMP_ARCHIVE}" "${SERVER_USER}@${SERVER_HOST}:${APP_DIR}/release.tar.gz"

echo "Deploying systemd service..."
ssh "${SSH_ARGS[@]}" "${SERVER_USER}@${SERVER_HOST}" \
  "APP_DIR='${APP_DIR}' APP_PORT='${APP_PORT}' ADMIN_EMAIL='${ADMIN_EMAIL}' ADMIN_PASSWORD='${ADMIN_PASSWORD}' SUPPORT_WECHAT='${SUPPORT_WECHAT}' SUPPORT_HOURS='${SUPPORT_HOURS}' SUPPORT_MESSAGE='${SUPPORT_MESSAGE}' COOKIE_SECURE='${COOKIE_SECURE}' bash -s" <<'REMOTE'
set -euo pipefail

cd "${APP_DIR}"

tar -xzf release.tar.gz
rm -f release.tar.gz
find "${APP_DIR}" -name '._*' -delete

mkdir -p "${APP_DIR}/data" "${APP_DIR}/backups"

cat > /etc/tongpinwang.env <<EOF
HOST=0.0.0.0
PORT=${APP_PORT}
TONGPIN_DATA_DIR=${APP_DIR}/data
TONGPIN_BACKUP_DIR=${APP_DIR}/backups
TONGPIN_ADMIN_EMAIL=${ADMIN_EMAIL}
TONGPIN_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
TONGPIN_SUPPORT_WECHAT=${SUPPORT_WECHAT}
TONGPIN_SUPPORT_HOURS="${SUPPORT_HOURS}"
TONGPIN_SUPPORT_MESSAGE="${SUPPORT_MESSAGE}"
TONGPIN_COOKIE_SECURE=${COOKIE_SECURE}
TONGPIN_SHOW_ADMIN_PASSWORD=0
EOF

cat > /etc/systemd/system/tongpinwang.service <<EOF
[Unit]
Description=Tongpinwang backend data app
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/tongpinwang.env
ExecStart=/usr/bin/python3 ${APP_DIR}/server.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "Synchronizing admin login..."
set -a
. /etc/tongpinwang.env
set +a
python3 - <<'PY'
from server import ADMIN_EMAIL, ADMIN_PASSWORD, DB_PATH, hash_password, init_db, now_iso

init_db()
conn = __import__("sqlite3").connect(str(DB_PATH))
created = now_iso()
admin = conn.execute("SELECT id FROM users WHERE email = ?", (ADMIN_EMAIL,)).fetchone()
if admin:
    conn.execute(
        "UPDATE users SET password_hash = ?, role = 'admin' WHERE email = ?",
        (hash_password(ADMIN_PASSWORD), ADMIN_EMAIL),
    )
else:
    cursor = conn.execute(
        "INSERT INTO users (name, email, password_hash, city, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)",
        ("管理员", ADMIN_EMAIL, hash_password(ADMIN_PASSWORD), "上海", created),
    )
    conn.execute(
        """INSERT INTO profiles (
            user_id, nickname, city, goals_json, interests_json, primary_tags, updated_at, review_status, match_status
        ) VALUES (?, ?, ?, '[]', '[]', ?, ?, 'approved', 'active')""",
        (cursor.lastrowid, "后台管理员", "上海", "运营,审核", created),
    )
conn.commit()
conn.close()
PY

systemctl daemon-reload
systemctl enable tongpinwang
systemctl restart tongpinwang

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
echo "Public URL: http://${SERVER_HOST}/"
echo "Admin URL:  http://${SERVER_HOST}/admin"
echo "Admin email: ${ADMIN_EMAIL}"
echo "Admin password: ${ADMIN_PASSWORD}"
