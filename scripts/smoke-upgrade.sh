#!/usr/bin/env bash
set -euo pipefail

# Production image upgrade smoke.
#
# Assumes the clean-install smoke already ran: postgres/redis are up, the
# production image is built, and an authenticated workspace exists.
#
# This phase simulates an upgrade of a deployment that contains pre-policy
# TrackWork persisted state (scripts/docker-smoke/fixture-upgrade.sql):
#   1. stop the application,
#   2. seed the fixture into the existing database,
#   3. run the production migration path (affine_migration service),
#   4. start the application,
#   5. verify readiness and persisted-data integrity.
#
# Required environment:
#   SMOKE_WORKSPACE_ID  workspace id created during the clean-install phase
#   SMOKE_CREATED_BY_ID user id of the smoke administrator

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELFHOST_DIR="${ROOT_DIR}/.docker/selfhost"
SELFHOST_ENV="${SELFHOST_DIR}/.env"
FIXTURE_SQL="${ROOT_DIR}/scripts/docker-smoke/fixture-upgrade.sql"

COMPOSE=(
  docker compose
  --env-file "${SELFHOST_ENV}"
  -f "${SELFHOST_DIR}/compose.yml"
  -f "${SELFHOST_DIR}/compose.local.yml"
)

WORKSPACE_ID="${SMOKE_WORKSPACE_ID:?SMOKE_WORKSPACE_ID is required}"
CREATED_BY_ID="${SMOKE_CREATED_BY_ID:?SMOKE_CREATED_BY_ID is required}"
DB_USERNAME="$(sed -n 's/^DB_USERNAME=//p' "${SELFHOST_ENV}")"
DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "${SELFHOST_ENV}")"
DB_DATABASE="$(sed -n 's/^DB_DATABASE=//p' "${SELFHOST_ENV}")"
DB_DATABASE="${DB_DATABASE:-affine}"

fail() {
  printf '[trackwork-upgrade-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

wait_ready() {
  local attempt
  for attempt in $(seq 1 60); do
    printf '[trackwork-upgrade-smoke] readiness check %s/60\n' "${attempt}"
    if curl -fsS http://127.0.0.1:3010/health/ready > /tmp/upgrade-ready.json 2>/dev/null; then
      grep -q '"postgres":"ok"' /tmp/upgrade-ready.json || return 1
      grep -q '"redis":"ok"' /tmp/upgrade-ready.json || return 1
      return 0
    fi
    sleep 5
  done
  return 1
}

wait_migration() {
  local attempt cid status code
  for attempt in $(seq 1 60); do
    cid="$("${COMPOSE[@]}" ps -a -q affine_migration 2>/dev/null | head -n1 || true)"
    if [[ -n "${cid}" ]]; then
      status="$(docker inspect -f '{{.State.Status}}' "${cid}" 2>/dev/null || true)"
      if [[ "${status}" == 'exited' ]]; then
        code="$(docker inspect -f '{{.State.ExitCode}}' "${cid}" 2>/dev/null || echo 1)"
        if [[ "${code}" == '0' ]]; then
          return 0
        fi
        "${COMPOSE[@]}" logs --tail=100 affine_migration >&2 || true
        fail "affine_migration exited with code ${code}"
      fi
    fi
    sleep 5
  done
  "${COMPOSE[@]}" logs --tail=100 affine_migration >&2 || true
  fail 'affine_migration did not complete'
}

psql_query() {
  docker compose --env-file "${SELFHOST_ENV}" \
    -f "${SELFHOST_DIR}/compose.yml" \
    exec -T postgres \
    psql -tA -v ON_ERROR_STOP=1 -U "${DB_USERNAME}" -d "${DB_DATABASE}" -c "$1"
}

[[ -f "${FIXTURE_SQL}" ]] || fail "missing fixture: ${FIXTURE_SQL}"

printf '[trackwork-upgrade-smoke] stopping application\n'
"${COMPOSE[@]}" stop affine >/dev/null 2>&1 || true

printf '[trackwork-upgrade-smoke] seeding pre-policy fixture data\n'
docker compose --env-file "${SELFHOST_ENV}" \
  -f "${SELFHOST_DIR}/compose.yml" \
  exec -T postgres \
  psql -v ON_ERROR_STOP=1 \
  -v "workspace_id=${WORKSPACE_ID}" \
  -v "created_by_id=${CREATED_BY_ID}" \
  -U "${DB_USERNAME}" -d "${DB_DATABASE}" \
  -f - < "${FIXTURE_SQL}"

printf '[trackwork-upgrade-smoke] running production migration path\n'
"${COMPOSE[@]}" up -d affine_migration >/dev/null
wait_migration

printf '[trackwork-upgrade-smoke] starting application\n'
"${COMPOSE[@]}" up -d affine >/dev/null
wait_ready || fail 'application did not become ready after upgrade'

printf '[trackwork-upgrade-smoke] verifying persisted data integrity\n'
task_count="$(psql_query "SELECT count(*) FROM trackwork_tasks WHERE workspace_id = '${WORKSPACE_ID}'")"
[[ "${task_count}" == '4' ]] || fail "expected 4 tasks after upgrade, got ${task_count}"

fixture_keys="$(psql_query "SELECT string_agg(task_key, ',' ORDER BY number) FROM trackwork_tasks WHERE workspace_id = '${WORKSPACE_ID}' AND doc_id LIKE 'fixture-doc-%'")"
[[ "${fixture_keys}" == 'TW-10,TW-11,TW-12' ]] ||
  fail "fixture task keys not preserved: ${fixture_keys}"

fixture_numbers="$(psql_query "SELECT string_agg(number::text, ',' ORDER BY number) FROM trackwork_tasks WHERE workspace_id = '${WORKSPACE_ID}' AND doc_id LIKE 'fixture-doc-%'")"
[[ "${fixture_numbers}" == '10,11,12' ]] ||
  fail "fixture task numbers not preserved: ${fixture_numbers}"

link_count="$(psql_query "SELECT count(*) FROM trackwork_document_links WHERE workspace_id = '${WORKSPACE_ID}'")"
[[ "${link_count}" == '2' ]] || fail "expected 2 document links after upgrade, got ${link_count}"

dev_link_count="$(psql_query "SELECT count(*) FROM development_task_links WHERE workspace_id = '${WORKSPACE_ID}' AND task_key = 'TW-10'")"
[[ "${dev_link_count}" == '1' ]] || fail "expected 1 development link after upgrade, got ${dev_link_count}"

printf '[trackwork-upgrade-smoke] PASS: upgrade smoke completed\n'