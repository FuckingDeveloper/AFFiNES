# TrackWork Local Validation

Temporary and target CI model, and the repository-owned validation interface
that Jenkins will later orchestrate.

## Current model

- GitHub hosts the repository and PRs only.
- GitHub Actions are DISABLED at the repository level.
- Validation happens LOCALLY through the commands below.
- Local execution is NOT a CI/release gate: OpenSpec 1.11/1.12/1.13 remain
  INCOMPLETE and deferred until Jenkins enforcement exists.

## Target model

- GitLab Self-Managed (repository hosting/MRs).
- Jenkins (CI orchestration) calling the SAME repository-owned scripts.
- Jenkins levels:
  - MR Fast: `trackwork:check` + dependency/secret security.
  - MR Heavy: integration (PostgreSQL/Redis), Docker smoke, migration path,
    TrackWork E2E incl. the large-workspace fixture.
  - Nightly: broad upstream regression if desired.
  - Release: source security + image build + exact image scan (per-platform
    digests, Trivy) + release/deploy.
- Principle: Jenkins orchestrates repository-owned scripts; the Jenkinsfile
  contains no test/security implementation.

## Commands

| command | script | coverage |
|---|---|---|
| `yarn trackwork:check` | `scripts/ci/trackwork-check.sh` | TrackWork server e2e (workflow-config, registry, IDOR, task-doc-read, audit, upgrade), sync workflow permissions, permission units, frontend Task Tracker config + large-workspace specs, server/core TypeScript with documented baseline filter, TrackWork-scoped oxlint/prettier |
| `yarn trackwork:security` | `scripts/ci/trackwork-security.sh` | OSV-Scanner (pinned+checksum, baseline comparator, identity self-tests, fixture self-test), Gitleaks (tracked-tree scan, runtime synthetic-secret self-test, bypass regression), optional CodeQL SARIF gate |
| `yarn trackwork:security:codeql` | `scripts/ci/trackwork-security-codeql.sh` | OPTIONAL local CodeQL analysis (requires the official CLI bundle; `CODEQL_BIN` or `codeql` on PATH); produces `/tmp/trackwork-codeql.sarif` for the gate |
| `yarn trackwork:check:full` | `scripts/ci/trackwork-check-full.sh` | fast check + large-workspace + data-migration runner + security (+ Docker smoke when `TRACKWORK_RUN_SMOKE=1`) |

Prerequisites: Node/Yarn (repository toolchain), local PostgreSQL + Redis
(`DATABASE_URL`, default matches the dev compose), curl/sha256sum for the
pinned scanner downloads (cached in `.cache/security-tools/`), `git` for the
tracked-tree archive. No GitHub token or Actions context is required.

## TypeScript baseline filter

The server and core `tsc` runs fail on ANY error except the documented
pre-existing develop-baseline errors, matched by exact file:

- `packages/backend/server/src/plugins/oauth/config.ts` (TS2345 - pre-existing
  on the develop base).
- frontend core: the pre-existing katex side-effect import error.

These are reported and counted, not silently swallowed; the filter is
maintained here and must be narrowed as the baselines are fixed.

## Known pre-existing environment behavior

- The real-socket sync suite (trackwork-workflow-permission.spec.ts) has a
  pre-existing deadlock flake (PostgreSQL 40P01 in the admin property-doc push
  test; develop code, not branch-introduced, reproducible on a clean DB in
  this environment). It is EXCLUDED from the fast check and run in
  trackwork:check:full with up to 3 attempts; persistent failure is reported
  as a known pre-existing defect.


- AVA suites occasionally hang at process teardown ("Failed to exit when
  running ...") after ALL tests pass; the check script treats a suite with
  passed tests + the teardown hang as PASS and reports the hang. This matches
  the develop-baseline behavior.
- oxlint import-sort drift in TrackWork spec files is fixed when surfaced
  (autofix); unrelated monorepo lint failures are out of scope.

## Lint baseline

The develop base contains pre-existing simple-import-sort / no-duplicates
drift in these TrackWork files (exact-file baseline, any OTHER finding fails):

- task-relations.spec.ts, automation.spec.ts, config.spec.ts,
  large-workspace.spec.ts, index.tsx, workflow-config.ts

## Security baselines

- `.security/osv-baseline.json` - identity-scoped (ecosystem, package,
  resolved version, advisory); NEW Critical/High blocks; unclassifiable NEW
  severity blocks; review/expiry 2026-12-01.
- `.security/codeql-baseline.json` - reviewed findings with stable SARIF
  fingerprint identity; only high-confidence security findings block.
- `.gitleaks.toml` - value-level allowlist; tracked-tree scan; bypass
  regression proves inserted secrets in sensitive files are detected.
- `.trivyignore-amd64/-arm64/-armv7` - per-platform image baselines (arm64/
  armv7 pending first real candidate scans, conservatively blocking).