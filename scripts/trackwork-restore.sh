#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || "$2" != "--confirm-destructive-restore" ]]; then
  printf 'Usage: %s BACKUP_DIR --confirm-destructive-restore\n' "$0" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFHOST_DIR="${ROOT_DIR}/.docker/selfhost"
BACKUP_DIR="$(cd "$1" && pwd)"

for file in postgres.dump affine-data.tar.gz SHA256SUMS; do
  if [[ ! -f "${BACKUP_DIR}/${file}" ]]; then
    printf 'Missing backup file: %s\n' "${BACKUP_DIR}/${file}" >&2
    exit 1
  fi
done

(
  cd "${BACKUP_DIR}"
  shasum -a 256 -c SHA256SUMS
)

COMPOSE=(
  docker compose
  --env-file "${SELFHOST_DIR}/.env"
  -f "${SELFHOST_DIR}/compose.yml"
  -f "${SELFHOST_DIR}/compose.local.yml"
)

"${COMPOSE[@]}" stop affine
"${COMPOSE[@]}" up -d postgres redis

"${COMPOSE[@]}" exec -T postgres sh -c \
  'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "${BACKUP_DIR}/postgres.dump"

"${COMPOSE[@]}" run --rm --no-deps -T affine sh -c \
  'rm -rf /root/.affine/storage /root/.affine/config && mkdir -p /root/.affine && tar -xzf - -C /root/.affine' \
  < "${BACKUP_DIR}/affine-data.tar.gz"

"${COMPOSE[@]}" run --rm affine_migration
"${COMPOSE[@]}" up -d affine

printf 'TrackWork restore completed from: %s\n' "${BACKUP_DIR}"
