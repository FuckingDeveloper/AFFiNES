#!/usr/bin/env bash
# TrackWork release-security gate (portable; Jenkins-ready).
# Consumes the portable scanner outputs + explicit risk-acceptance records and
# BLOCKS a major production release on any unaccepted Critical/High finding.
# Usage: yarn trackwork:security:release -- --scope-version vX.Y.Z [--scope-artifact A] [--scope-platform P]
# See docs/trackwork-release-security.md for the acceptance schema.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export NODE_ENV=test
export DEPLOYMENT_TYPE=affine
export DATABASE_URL="${DATABASE_URL:-postgresql://affine:affine@localhost:5432/affine}"

# shellcheck disable=SC1091
source "$ROOT/scripts/ci/trackwork-security-tools.sh"
ensure_osv_scanner

TMPDIR_RELEASE="${TMPDIR_RELEASE:-/tmp/trackwork-release-security}"
mkdir -p "$TMPDIR_RELEASE"

ACCEPTANCES_DIR="${ACCEPTANCES_DIR:-$ROOT/.security/risk-acceptances}"
mkdir -p "$ACCEPTANCES_DIR"

echo "== trackwork:security:release [dependency scan]"
"$OSV_SCANNER_BIN" --format json --output-file "$TMPDIR_RELEASE/osv-report.json" \
  --lockfile yarn.lock >/tmp/trackwork-release-osv.log 2>&1 || true

GATE_ARGS=(
  --osv-report "$TMPDIR_RELEASE/osv-report.json"
  --acceptances "$ACCEPTANCES_DIR"
)

if [ -n "${CODEQL_SARIF:-}" ] && [ -f "$CODEQL_SARIF" ]; then
  GATE_ARGS+=(--codeql-sarif "$CODEQL_SARIF")
  echo "   consuming CodeQL SARIF: $CODEQL_SARIF"
fi
if [ -n "${TRIVY_REPORT:-}" ] && [ -f "$TRIVY_REPORT" ]; then
  GATE_ARGS+=(--trivy-report "$TRIVY_REPORT")
  echo "   consuming Trivy report: $TRIVY_REPORT"
fi

for arg in "$@"; do
  if [ "$arg" = "--" ]; then
    continue
  fi
  GATE_ARGS+=("$arg")
done

python3 "$ROOT/scripts/ci/release-security-gate.py" "${GATE_ARGS[@]}" \
  | tee "$TMPDIR_RELEASE/release-security-report.txt"

RC="${PIPESTATUS[0]}"
exit "$RC"