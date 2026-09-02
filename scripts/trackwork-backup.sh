#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFHOST_DIR="${ROOT_DIR}/.docker/selfhost"
DESTINATION="${1:-${ROOT_DIR}/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${DESTINATION%/}/trackwork-${STAMP}"

COMPOSE=(
  docker compose
  --env-file "${SELFHOST_DIR}/.env"
  -f "${SELFHOST_DIR}/compose.yml"
  -f "${SELFHOST_DIR}/compose.local.yml"
)

umask 077
mkdir -p "${BACKUP_DIR}"

"${COMPOSE[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${BACKUP_DIR}/postgres.dump"

"${COMPOSE[@]}" run --rm --no-deps -T affine sh -c \
  'tar -czf - -C /root/.affine storage config' \
  > "${BACKUP_DIR}/affine-data.tar.gz"

(
  cd "${BACKUP_DIR}"
  shasum -a 256 postgres.dump affine-data.tar.gz > SHA256SUMS
)

printf 'TrackWork backup created: %s\n' "${BACKUP_DIR}"
