#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_ENV="$ROOT_DIR/packages/backend/server/.env"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/start-local-no-docker.sh --prepare
  ./scripts/start-local-no-docker.sh --start
  ./scripts/start-local-no-docker.sh --server
  ./scripts/start-local-no-docker.sh --web
  ./scripts/start-local-no-docker.sh --help

What it does:
  --prepare  Checks prerequisites, creates backend .env if missing, installs deps,
             builds server native module, and runs server init.
  --start    Starts backend and frontend dev servers in parallel.
  --server   Starts only backend dev server.
  --web      Starts only frontend dev server.

Assumptions for no-Docker mode:
  - PostgreSQL is installed locally and reachable on localhost:5432
  - Redis is installed locally and reachable on localhost:6379
  - Mailpit/MailHog SMTP is reachable on localhost:1025
EOF
}

log() {
  printf '[affine-local] %s\n' "$*"
}

fail() {
  printf '[affine-local] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

check_prereqs() {
  require_cmd node
  require_cmd yarn
  require_cmd cargo
  require_cmd rustc
  require_cmd psql
  require_cmd pg_isready
  require_cmd redis-cli

  log "Node version: $(node -v)"
  log "Yarn version: $(yarn -v)"
  log "Rust version: $(rustc --version)"
}

check_services() {
  log 'Checking PostgreSQL on localhost:5432'
  pg_isready -h localhost -p 5432 >/dev/null || fail 'PostgreSQL is not ready on localhost:5432'

  log 'Checking Redis on localhost:6379'
  [ "$(redis-cli -h localhost -p 6379 ping 2>/dev/null || true)" = 'PONG' ] || fail 'Redis is not ready on localhost:6379'

  if command -v curl >/dev/null 2>&1; then
    log 'Checking Mailpit/MailHog UI on localhost:8025 if available'
    curl -fsS http://127.0.0.1:8025 >/dev/null 2>&1 || log 'Mail UI not reachable on :8025, continuing if SMTP exists on :1025'
  fi
}

ensure_server_env() {
  if [ ! -f "$SERVER_ENV" ]; then
    log 'Creating packages/backend/server/.env'
    cat > "$SERVER_ENV" <<'EOF'
DATABASE_URL="postgres://affine:affine@localhost:5432/affine"
REDIS_SERVER_HOST=localhost
MAILER_HOST=127.0.0.1
MAILER_PORT=1025
MAILER_SECURE=false
AFFINE_SERVER_EXTERNAL_URL=http://localhost:8080
AFFINE_INDEXER_ENABLED=false
EOF
  else
    log 'Using existing packages/backend/server/.env'
  fi
}

prepare() {
  check_prereqs
  check_services
  ensure_server_env

  log 'Installing workspace dependencies'
  (cd "$ROOT_DIR" && yarn install)

  log 'Building @affine/server-native'
  (cd "$ROOT_DIR" && yarn affine @affine/server-native build)

  log 'Running server initialization'
  (cd "$ROOT_DIR" && yarn affine server init)

  log 'Preparation complete'
}

start_server() {
  log 'Starting backend dev server'
  cd "$ROOT_DIR"
  exec yarn affine server dev
}

start_web() {
  log 'Starting frontend dev server'
  cd "$ROOT_DIR"
  exec yarn dev
}

start_all() {
  log 'Starting backend and frontend in parallel'
  cd "$ROOT_DIR"
  trap 'kill 0' INT TERM EXIT
  yarn affine server dev &
  yarn dev &
  wait
}

MODE="${1:-}"

case "$MODE" in
  --prepare)
    prepare
    ;;
  --start)
    start_all
    ;;
  --server)
    start_server
    ;;
  --web)
    start_web
    ;;
  --help|-h|'')
    usage
    ;;
  *)
    usage
    fail "Unknown option: $MODE"
    ;;
esac
