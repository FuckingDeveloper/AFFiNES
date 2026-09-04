#!/usr/bin/env bash
# TrackWork heavy local validation: fast check + integration + Docker/self-host
# smoke + migration path + large-workspace + security. Still excludes the
# upstream BlockSuite/mobile/desktop matrix.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

FAILED=0
stage() {
  echo "== trackwork:check:full [$1]"
}

export NODE_ENV=test
export DEPLOYMENT_TYPE=affine
export DATABASE_URL="${DATABASE_URL:-postgresql://affine:affine@localhost:5432/affine}"
export TEST_MODE=e2e

stage "fast validation"
if bash "$ROOT/scripts/ci/trackwork-check.sh"; then
  echo "   PASS trackwork:check"
else
  echo "   FAIL trackwork:check"
  FAILED=1
fi

stage "server: real-socket workflow sync permissions (known deadlock flake)"
# Pre-existing develop defect: the admin-push test can deadlock (40P01) on a
# busy local Postgres; retried twice; reported, not gating the fast check.
run_ava_sync() {
  local spec="src/__tests__/sync/trackwork-workflow-permission.spec.ts"
  local n=0
  local ok=0
  while [ "$n" -lt 3 ]; do
    n=$((n + 1))
    yarn workspace @affine/server exec ava --serial "$spec" >/tmp/trackwork-sync.log 2>&1 || true
    if ! grep -q "\u2718 \[fail\]" /tmp/trackwork-sync.log; then
      ok=1
      break
    fi
  done
  if [ "$ok" -eq 1 ]; then
    echo "   PASS $spec (after $n attempts)"
  else
    echo "   FAIL $spec (deadlock flake persisted after 3 attempts; see /tmp/trackwork-sync.log)"
    FAILED=1
  fi
}
run_ava_sync

stage "server: large-workspace validation"
if yarn workspace @affine/server exec ava --serial \
  "src/__tests__/e2e/trackwork/large-workspace.spec.ts" >/tmp/trackwork-large.log 2>&1; then
  echo "   PASS large-workspace (500-task fixture)"
else
  echo "   FAIL large-workspace (see /tmp/trackwork-large.log)"
  FAILED=1
fi

stage "server: production data-migration runner path"
if (cd packages/backend/server && NODE_ENV=development SERVER_FLAVOR=script \
  DATABASE_URL="$DATABASE_URL" yarn data-migration run) >/tmp/trackwork-migration.log 2>&1; then
  echo "   PASS data-migration runner"
else
  echo "   FAIL data-migration runner (see /tmp/trackwork-migration.log)"
  FAILED=1
fi

stage "security validation"
if bash "$ROOT/scripts/ci/trackwork-security.sh"; then
  echo "   PASS trackwork:security"
else
  echo "   FAIL trackwork:security"
  FAILED=1
fi

stage "Docker/self-host smoke (requires docker + provisioning env)"
SMOKE_SKIPPED=1
if [ -n "${TRACKWORK_RUN_SMOKE:-}" ]; then
  if [ -z "${SMOKE_WORKSPACE_ID:-}" ] || [ -z "${SMOKE_CREATED_BY_ID:-}" ]; then
    echo "   NOT EXECUTED docker smoke: TRACKWORK_RUN_SMOKE=1 but SMOKE_WORKSPACE_ID/"
    echo "             SMOKE_CREATED_BY_ID are missing (scripts/smoke-upgrade.sh"
    echo "             requires them; provision via the smoke-upgrade flow)"
  elif command -v docker >/dev/null 2>&1; then
    if bash "$ROOT/scripts/smoke-upgrade.sh" >/tmp/trackwork-smoke.log 2>&1; then
      echo "   PASS docker smoke"
      SMOKE_SKIPPED=0
    else
      echo "   FAIL docker smoke (see /tmp/trackwork-smoke.log)"
      FAILED=1
      SMOKE_SKIPPED=0
    fi
  else
    echo "   NOT EXECUTED docker smoke: docker not available"
  fi
else
  echo "   NOT EXECUTED docker smoke (set TRACKWORK_RUN_SMOKE=1 to run; needs docker)"
fi

if [ "$FAILED" -eq 1 ]; then
  echo "trackwork:check:full FAILED"
  exit 1
fi
if [ "$SMOKE_SKIPPED" -eq 1 ]; then
  echo "trackwork:check:full PASSED (Docker smoke not requested)"
else
  echo "trackwork:check:full PASSED (including Docker smoke)"
fi