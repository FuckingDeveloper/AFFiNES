#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT_DIR}/.docker/selfhost/backup.env"
SCHEDULE="${TRACKWORK_BACKUP_CRON:-0 2 * * *}"
MARKER='# TrackWork automatic backup'

command -v crontab >/dev/null 2>&1 || {
  printf 'crontab is not installed. Use a systemd timer to run trackwork-backup-auto.sh.\n' >&2
  exit 1
}

if [[ ! -f "${CONFIG_FILE}" ]]; then
  cp "${CONFIG_FILE}.example" "${CONFIG_FILE}"
  chmod 600 "${CONFIG_FILE}"
  printf 'Created %s. Review it before the first scheduled run.\n' "${CONFIG_FILE}"
fi

mkdir -p "${ROOT_DIR}/backups"
chmod 700 "${ROOT_DIR}/backups"

current="$(mktemp)"
updated="$(mktemp)"
trap 'rm -f "${current}" "${updated}"' EXIT
crontab -l > "${current}" 2>/dev/null || true
grep -vF "${MARKER}" "${current}" > "${updated}" || true
printf '%s cd %q && %q >> %q 2>&1 %s\n' \
  "${SCHEDULE}" "${ROOT_DIR}" "${ROOT_DIR}/scripts/trackwork-backup-auto.sh" \
  "${ROOT_DIR}/backups/backup.log" "${MARKER}" >> "${updated}"
crontab "${updated}"
printf 'TrackWork backup schedule installed: %s\n' "${SCHEDULE}"
