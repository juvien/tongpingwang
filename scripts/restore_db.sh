#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/restore_db.sh <backup.db|backup.db.gz>" >&2
  exit 1
fi

DATA_DIR="${TONGPIN_DATA_DIR:-./data}"
DB_PATH="${DATA_DIR}/app.db"
SOURCE="$1"

mkdir -p "${DATA_DIR}"

if [[ -f "${DB_PATH}" ]]; then
  cp "${DB_PATH}" "${DB_PATH}.before-restore-$(date +%Y%m%d-%H%M%S)"
fi

if [[ "${SOURCE}" == *.gz ]]; then
  gzip -dc "${SOURCE}" > "${DB_PATH}"
else
  cp "${SOURCE}" "${DB_PATH}"
fi

echo "Restored database to ${DB_PATH}"
