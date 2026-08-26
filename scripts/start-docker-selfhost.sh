#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFHOST_DIR="${ROOT_DIR}/.docker/selfhost"
SELFHOST_ENV="${SELFHOST_DIR}/.env"

COMPOSE=(
  docker compose
  --env-file "${SELFHOST_ENV}"
  -f "${SELFHOST_DIR}/compose.yml"
  -f "${SELFHOST_DIR}/compose.local.yml"
)

usage() {
  cat <<'EOF'
Usage:
  ./scripts/start-docker-selfhost.sh            Build and start TrackWork
  ./scripts/start-docker-selfhost.sh --up       Build and start TrackWork
  ./scripts/start-docker-selfhost.sh --build    Build trackwork-local:dev
  ./scripts/start-docker-selfhost.sh --down     Stop TrackWork
  ./scripts/start-docker-selfhost.sh --logs     Follow server and migration logs
  ./scripts/start-docker-selfhost.sh --status   Show container status
EOF
}

log() {
  printf '[trackwork-docker] %s\n' "$*"
}

fail() {
  printf '[trackwork-docker] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

env_value() {
  sed -n "s/^$1=//p" "${SELFHOST_ENV}" | tail -n 1
}

generate_db_password() {
  local password
  password="$(openssl rand -hex 24)"

  if grep -q '^DB_PASSWORD=' "${SELFHOST_ENV}"; then
    DB_PASSWORD="${password}" perl -0pi -e 's/^DB_PASSWORD=.*$/DB_PASSWORD=$ENV{DB_PASSWORD}/m' "${SELFHOST_ENV}"
  else
    printf '\nDB_PASSWORD=%s\n' "${password}" >> "${SELFHOST_ENV}"
  fi
}

ensure_env() {
  mkdir -p "${SELFHOST_DIR}"

  if [[ ! -f "${SELFHOST_ENV}" ]]; then
    cp "${SELFHOST_DIR}/.env.example" "${SELFHOST_ENV}"
    generate_db_password
    log "Created ${SELFHOST_ENV} with a random database password"
    return
  fi

  local password
  password="$(env_value DB_PASSWORD)"
  if [[ ${#password} -lt 24 || "${password}" == 'change-this-to-a-long-random-password' ]]; then
    generate_db_password
    log "Replaced missing, short, or example DB_PASSWORD in ${SELFHOST_ENV} with a random database password"
  fi
}

check_prereqs() {
  require_cmd docker
  require_cmd openssl
  docker compose version >/dev/null 2>&1 || fail 'docker compose is unavailable'
  ensure_env
  validate_env
}

validate_env() {
  local port password
  port="$(env_value PORT)"
  password="$(env_value DB_PASSWORD)"

  [[ "${port}" =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535)) ||
    fail 'PORT must be an integer between 1 and 65535'
  [[ ${#password} -ge 24 ]] ||
    fail 'DB_PASSWORD must contain at least 24 characters'
  [[ "${password}" != 'change-this-to-a-long-random-password' ]] ||
    fail 'Replace the example DB_PASSWORD before starting TrackWork'

  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    if ! "${COMPOSE[@]}" ps --status running --quiet affine 2>/dev/null | grep -q .; then
      fail "PORT ${port} is already in use"
    fi
  fi
}

build_image() {
  log 'Building server, web and admin in a reproducible Linux builder'
  export GIT_COMMIT="${GIT_COMMIT:-$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || printf '000000000')}"
  "${COMPOSE[@]}" build affine
}

start_stack() {
  if ! "${COMPOSE[@]}" up -d; then
    "${COMPOSE[@]}" logs --tail=120 postgres redis affine_migration >&2 || true
    fail 'TrackWork did not start; dependency logs are shown above'
  fi
}

case "${1:---up}" in
  --up)
    check_prereqs
    build_image
    start_stack
    log 'TrackWork is starting: http://localhost:3010'
    ;;
  --build)
    check_prereqs
    build_image
    ;;
  --down)
    check_prereqs
    "${COMPOSE[@]}" down
    ;;
  --logs)
    check_prereqs
    "${COMPOSE[@]}" logs -f --tail=120 affine_migration affine
    ;;
  --status)
    check_prereqs
    "${COMPOSE[@]}" ps -a
    ;;
  --help|-h)
    usage
    ;;
  *)
    usage
    fail "Unknown option: ${1}"
    ;;
esac
