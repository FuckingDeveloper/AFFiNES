#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${TRACKWORK_BACKUP_CONFIG:-${ROOT_DIR}/.docker/selfhost/backup.env}"
LOCK_DIR="${TMPDIR:-/tmp}/trackwork-backup.lock"

if [[ -f "${CONFIG_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
  set +a
fi

DESTINATION="${TRACKWORK_BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS="${TRACKWORK_BACKUP_RETENTION_DAYS:-14}"
STATUS_FILE="${DESTINATION%/}/last-run.status"

if ! [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
  printf 'TRACKWORK_BACKUP_RETENTION_DAYS must be a non-negative integer.\n' >&2
  exit 1
fi

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  printf 'Another TrackWork backup is already running.\n' >&2
  exit 1
fi
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

mkdir -p "${DESTINATION}"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

set +e
output="$(${ROOT_DIR}/scripts/trackwork-backup.sh "${DESTINATION}" 2>&1)"
result=$?
set -e

if [[ ${result} -ne 0 ]]; then
  printf 'status=failed\nstarted_at=%s\nmessage=%s\n' \
    "${started_at}" "${output//$'\n'/ }" > "${STATUS_FILE}"
  printf '%s\n' "${output}" >&2
  exit "${result}"
fi

backup_path="${output##*: }"
artifact_path="${backup_path}"
case "${backup_path}" in
  "${DESTINATION%/}"/trackwork-*) ;;
  *)
    printf 'Unexpected backup path: %s\n' "${backup_path}" >&2
    exit 1
    ;;
esac

if [[ -n "${TRACKWORK_BACKUP_ENCRYPTION_KEY:-}" ]]; then
  command -v openssl >/dev/null 2>&1 || {
    printf 'openssl is required for encrypted backups.\n' >&2
    exit 1
  }
  artifact_path="${backup_path}.tar.gz.enc"
  tar -czf - -C "$(dirname "${backup_path}")" "$(basename "${backup_path}")" |
    openssl enc -aes-256-cbc -salt -pbkdf2 \
      -pass env:TRACKWORK_BACKUP_ENCRYPTION_KEY \
      -out "${artifact_path}"
fi

if [[ -n "${TRACKWORK_BACKUP_S3_URI:-}" ]]; then
  command -v aws >/dev/null 2>&1 || {
    printf 'AWS CLI is required when TRACKWORK_BACKUP_S3_URI is configured.\n' >&2
    exit 1
  }
  aws s3 cp "${artifact_path}" "${TRACKWORK_BACKUP_S3_URI%/}/$(basename "${artifact_path}")" \
    --only-show-errors
fi

find "${DESTINATION}" -mindepth 1 -maxdepth 1 \
  \( -type d -o -type f \) -name 'trackwork-*' \
  -mtime "+${RETENTION_DAYS}" -exec rm -r -- {} +

printf 'status=ok\nstarted_at=%s\nfinished_at=%s\nartifact=%s\n' \
  "${started_at}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${artifact_path}" \
  > "${STATUS_FILE}"
printf 'Scheduled TrackWork backup created: %s\n' "${artifact_path}"
