#!/usr/bin/env bash
# TrackWork local security validation (platform-independent; Jenkins-ready).
# Uses the portable scanners from .security/: OSV-Scanner (identity-scoped
# baseline), Gitleaks (value-level allowlist), and the CodeQL SARIF gate as an
# OPTIONAL command (requires a local CodeQL CLI). Missing required tools fail
# with an actionable error; the tool helper downloads pinned+checksummed
# binaries into .cache/security-tools/. No GitHub token or Actions context.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

FAILED=0
stage() {
  echo "== trackwork:security [$1]"
}

# shellcheck disable=SC1091
source "$ROOT/scripts/ci/trackwork-security-tools.sh" || {
  echo "missing scripts/ci/trackwork-security-tools.sh"
  exit 1
}

stage "install/verify pinned scanners"
ensure_osv_scanner
ensure_gitleaks

stage "OSV-Scanner: real dependency scan"
set +e
"$OSV_SCANNER_BIN" --format json --output-file /tmp/trackwork-osv-report.json --lockfile yarn.lock >/tmp/trackwork-osv.log 2>&1
OSV_STATUS=$?
set -e
if [ "$OSV_STATUS" -ne 0 ] && [ "$OSV_STATUS" -ne 1 ]; then
  echo "   FAIL osv-scanner status $OSV_STATUS (scanner/runtime error)"
  FAILED=1
elif [ ! -s /tmp/trackwork-osv-report.json ]; then
  echo "   FAIL osv-scanner produced no report"
  FAILED=1
else
  echo "   PASS scan completed (status $OSV_STATUS; 1 = findings present, comparator decides)"
fi

stage "OSV-Scanner: baseline comparator"
if python3 "$ROOT/.security/check-osv-baseline.py" \
  "$ROOT/.security/osv-baseline.json" /tmp/trackwork-osv-report.json; then
  echo "   PASS no NEW Critical/High advisories vs baseline"
else
  echo "   FAIL NEW Critical/High advisories vs baseline (review .security/osv-baseline.json)"
  FAILED=1
fi

stage "OSV-Scanner: baseline identity self-test"
if python3 "$ROOT/.security/check-osv-baseline.py" --selftest >/tmp/trackwork-osv-selftest.log 2>&1; then
  echo "   PASS identity self-tests A-E"
else
  echo "   FAIL identity self-tests (see /tmp/trackwork-osv-selftest.log)"
  FAILED=1
fi

stage "OSV-Scanner: known-advisory fixture self-test"
set +e
"$OSV_SCANNER_BIN" --format json --output-file /tmp/trackwork-osv-fixture.json \
  "$ROOT/.security/self-test/package-lock.json" >/tmp/trackwork-osv-fixture.log 2>&1
FIXTURE_STATUS=$?
set -e
if [ "$FIXTURE_STATUS" -eq 1 ] && python3 -c \
  "import json,sys; d=json.load(open('/tmp/trackwork-osv-fixture.json')); \
   sys.exit(0 if sum(len(p.get('vulnerabilities',[])) for r in d.get('results',[]) for p in r.get('packages',[])) > 0 else 1)"; then
  echo "   PASS fixture reported known advisories (status 1)"
else
  echo "   FAIL fixture self-test (status $FIXTURE_STATUS; detector must report the known advisory)"
  FAILED=1
fi

stage "Gitleaks: tracked-tree scan"
rm -rf /tmp/trackwork-gitleaks-tree
mkdir -p /tmp/trackwork-gitleaks-tree
git archive HEAD | tar -x -C /tmp/trackwork-gitleaks-tree
if "$GITLEAKS_BIN" detect --source /tmp/trackwork-gitleaks-tree \
  --config "$ROOT/.gitleaks.toml" --exit-code 1 --no-banner --no-git >/tmp/trackwork-gitleaks.log 2>&1; then
  echo "   PASS tracked tree has no unallowed findings"
else
  echo "   FAIL tracked tree findings (see /tmp/trackwork-gitleaks.log)"
  FAILED=1
fi

stage "Gitleaks: runtime synthetic-secret self-test"
mkdir -p /tmp/trackwork-gitleaks-self-test
KEY="sk-live-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
printf 'API_KEY=%s\n' "$KEY" > /tmp/trackwork-gitleaks-self-test/secret.txt
set +e
"$GITLEAKS_BIN" detect --source /tmp/trackwork-gitleaks-self-test \
  --no-git --no-banner --exit-code 1 >/tmp/trackwork-gitleaks-self.log 2>&1
GITLEAKS_SELF_STATUS=$?
set -e
if [ "$GITLEAKS_SELF_STATUS" -eq 1 ]; then
  echo "   PASS synthetic secret detected"
else
  echo "   FAIL synthetic secret NOT detected (status $GITLEAKS_SELF_STATUS)"
  FAILED=1
fi

stage "Gitleaks: allowlist bypass regression"
if python3 "$ROOT/.security/gitleaks-bypass-selftest.py" \
  "$GITLEAKS_BIN" "$ROOT" "$ROOT/.gitleaks.toml" >/tmp/trackwork-gitleaks-bypass.log 2>&1; then
  echo "   PASS bypass regression (inserted secrets in sensitive files detected)"
else
  echo "   FAIL bypass regression (see /tmp/trackwork-gitleaks-bypass.log)"
  FAILED=1
fi

stage "CodeQL SARIF gate (optional)"
if [ -n "${CODEQL_BIN:-}" ] && [ -f /tmp/trackwork-codeql.sarif ]; then
  if python3 "$ROOT/.security/check-codeql-sarif.py" \
    /tmp/trackwork-codeql.sarif "$ROOT/.security/codeql-baseline.json"; then
    echo "   PASS gate: no un-baselined blocking findings"
  else
    echo "   FAIL gate: un-baselined blocking findings"
    FAILED=1
  fi
else
  echo "   SKIP CodeQL SARIF gate (set CODEQL_BIN and provide /tmp/trackwork-codeql.sarif; "
  echo "         run 'yarn trackwork:security:codeql' to produce it)"
fi

if [ "$FAILED" -eq 1 ]; then
  echo "trackwork:security FAILED"
  exit 1
fi
echo "trackwork:security PASSED"