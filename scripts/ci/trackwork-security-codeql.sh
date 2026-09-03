#!/usr/bin/env bash
# OPTIONAL TrackWork CodeQL security analysis (local CLI). Requires a local
# CodeQL CLI (codeql on PATH or CODEQL_BIN). Produces /tmp/trackwork-codeql.sarif
# consumed by 'yarn trackwork:security'. Documented for future Jenkins use;
# NOT part of the default trackwork:security flow because the CLI bundle is a
# large dedicated environment.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

CODEQL="${CODEQL_BIN:-$(command -v codeql || true)}"
if [ -z "$CODEQL" ]; then
  echo "codeql CLI not found; install the official bundle and set CODEQL_BIN"
  exit 1
fi

rm -rf /tmp/trackwork-codeql-db
"$CODEQL" pack download codeql/javascript-queries >/tmp/trackwork-codeql-dl.log 2>&1 || true
"$CODEQL" database create /tmp/trackwork-codeql-db \
  --language javascript-typescript --source-root . >/tmp/trackwork-codeql-db.log 2>&1
"$CODEQL" database analyze /tmp/trackwork-codeql-db \
  --format sarif-latest --output /tmp/trackwork-codeql.sarif \
  "codeql/javascript-queries:codeql-suites/javascript-security-extended.qls" \
  >/tmp/trackwork-codeql-analyze.log 2>&1
python3 "$ROOT/.security/check-codeql-sarif.py" \
  /tmp/trackwork-codeql.sarif "$ROOT/.security/codeql-baseline.json"
echo "codeql analysis + gate PASSED (sarif at /tmp/trackwork-codeql.sarif)"