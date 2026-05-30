#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${TONGPIN_DATA_DIR:-./data}"
BACKUP_DIR="${TONGPIN_BACKUP_DIR:-./backups}"
DB_PATH="${DATA_DIR}/app.db"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "Database not found: ${DB_PATH}" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="${BACKUP_DIR}/app-${STAMP}.db"

sqlite3 "${DB_PATH}" ".backup '${BACKUP_PATH}'"
gzip -f "${BACKUP_PATH}"

echo "${BACKUP_PATH}.gz"
