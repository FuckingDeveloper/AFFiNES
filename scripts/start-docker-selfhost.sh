#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFHOST_DIR="$ROOT_DIR/.docker/selfhost"
SELFHOST_ENV="$SELFHOST_DIR/.env"
LOCAL_IMAGE_NAME="affine-local:dev"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/start-docker-selfhost.sh --upstream
  ./scripts/start-docker-selfhost.sh --local-image
  ./scripts/start-docker-selfhost.sh --down-upstream
  ./scripts/start-docker-selfhost.sh --down-local
  ./scripts/start-docker-selfhost.sh --logs-upstream
  ./scripts/start-docker-selfhost.sh --logs-local
  ./scripts/start-docker-selfhost.sh --help

Modes:
  --upstream      Start selfhost stack from upstream GHCR image
  --local-image   Build current fork artifacts, build local Docker image, start stack with override
  --down-upstream Stop upstream compose stack
  --down-local    Stop local-image compose stack
  --logs-upstream Show logs for upstream compose stack
  --logs-local    Show logs for local-image compose stack
EOF
}

log() {
  printf '[affine-docker] %s\n' "$*"
}

fail() {
  printf '[affine-docker] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

ensure_env() {
  mkdir -p "$SELFHOST_DIR"

  if [ ! -f "$SELFHOST_ENV" ]; then
    log 'Creating .docker/selfhost/.env from example'
    cp "$SELFHOST_DIR/.env.example" "$SELFHOST_ENV"
  fi

  if ! grep -Eq '^DB_PASSWORD=.+$' "$SELFHOST_ENV"; then
    log 'Setting default DB_PASSWORD=affine in .docker/selfhost/.env'
    if grep -Eq '^DB_PASSWORD=' "$SELFHOST_ENV"; then
      perl -0pi -e 's/^DB_PASSWORD=.*$/DB_PASSWORD=affine/m' "$SELFHOST_ENV"
    else
      printf '\nDB_PASSWORD=affine\n' >> "$SELFHOST_ENV"
    fi
  fi
}

check_prereqs() {
  require_cmd docker
  require_cmd yarn
  require_cmd node
  docker compose version >/dev/null 2>&1 || fail 'docker compose is not available'
}

build_local_image() {
  log 'Installing dependencies'
  (cd "$ROOT_DIR" && yarn install)

  log 'Building Docker artifacts from current fork'
  (cd "$ROOT_DIR" && yarn build:docker)

  log "Building Docker image $LOCAL_IMAGE_NAME"
  (cd "$ROOT_DIR" && docker build -f .github/deployment/node/Dockerfile -t "$LOCAL_IMAGE_NAME" .)
}

upstream_up() {
  check_prereqs
  ensure_env
  log 'Starting upstream selfhost stack'
  (cd "$SELFHOST_DIR" && docker compose up -d)
  log 'Stack started. Check: curl -fsS http://localhost:3010/info'
}

local_up() {
  check_prereqs
  ensure_env
  build_local_image
  log 'Starting selfhost stack with local image override'
  (cd "$SELFHOST_DIR" && docker compose -f compose.yml -f compose.local.yml up -d)
  log 'Local-image stack started. Check: curl -fsS http://localhost:3010/info'
}

down_upstream() {
  check_prereqs
  ensure_env
  log 'Stopping upstream selfhost stack'
  (cd "$SELFHOST_DIR" && docker compose down)
}

down_local() {
  check_prereqs
  ensure_env
  log 'Stopping local-image selfhost stack'
  (cd "$SELFHOST_DIR" && docker compose -f compose.yml -f compose.local.yml down)
}

logs_upstream() {
  check_prereqs
  ensure_env
  (cd "$SELFHOST_DIR" && docker compose logs --tail=120 affine_migration affine)
}

logs_local() {
  check_prereqs
  ensure_env
  (cd "$SELFHOST_DIR" && docker compose -f compose.yml -f compose.local.yml logs --tail=120 affine_migration affine)
}

MODE="${1:-}"

case "$MODE" in
  --upstream)
    upstream_up
    ;;
  --local-image)
    local_up
    ;;
  --down-upstream)
    down_upstream
    ;;
  --down-local)
    down_local
    ;;
  --logs-upstream)
    logs_upstream
    ;;
  --logs-local)
    logs_local
    ;;
  --help|-h|'')
    usage
    ;;
  *)
    usage
    fail "Unknown option: $MODE"
    ;;
esac
