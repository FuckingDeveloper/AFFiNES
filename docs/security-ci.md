# TrackWork Security CI Policy

Scope: OpenSpec 1.11 (dependency vulnerability scanning), 1.12 (secret
scanning + security-focused static analysis), 1.13 (release image scanning).

## Blocking thresholds

| Control                    | Tool                                                | Gate                                                                                                                                                                                     | Fails on                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency vulnerabilities | OSV-Scanner (identity-scoped baseline)              | LOCAL via `yarn trackwork:security` (GitHub Actions DISABLED; no active CI/release gate exists) | NEW Critical/High advisories vs `.security/osv-baseline.json` scoped to (ecosystem, package, resolved version, advisory); Moderate/Low reported; unclassifiable NEW severity blocks                              |
| Secrets                    | Gitleaks (value-level allowlist)                    | PR + push to develop + release (same reusable workflow)                                                                                                                                  | any detected secret not matching the exact-fake-value allowlist in `.gitleaks.toml`; no whole-file exclusions except vendored Yarn bundles                                                                       |
| Static analysis            | CodeQL (security-extended) with explicit SARIF gate | PR + push + release (build-test.yml analyze job: local SARIF output + `.security/check-codeql-sarif.py` gate; upload remains a reporting surface)                                        | NEW findings with official security-severity >= 7.0 and precision high/very-high, or result level error, vs `.security/codeql-baseline.json`; unknown precision with high severity is review-required (blocking) |
| Production image           | Trivy (CRITICAL,HIGH) per platform digest           | release image build (build-images.yml): ONE multi-platform candidate push, then EVERY platform digest (amd64/arm64/armv7) scanned with its own `.trivyignore-<platform>` baseline        | Critical/High findings on ANY platform not listed in that platform's baseline; the scanned candidate digest is the digest promoted/deployed                                                                      |

## Release dependency graph

- `release.yml`: the `security-gates` job (reusable `security-scan.yml` run
  against the EXACT release commit) is a required `needs` dependency of the
  cloud deploy, docker image, desktop and mobile release jobs.
- `build-images.yml` (called from release-cloud.yml): one multi-platform
  candidate build pushed under the immutable candidate tag; per-platform
  digests resolved from the pushed manifest; every platform digest scanned
  with its own baseline; failure fails the workflow and therefore blocks the
  caller's promote/deploy jobs. No image is rebuilt after the scans.
- `build-test.yml`: CodeQL analyze produces local SARIF; the security-result
  gate fails the job on new high-confidence findings (release-blocking via the
  job dependency chain); SARIF upload remains an additional reporting surface.

## Baselines and exceptions

- `.security/osv-baseline.json` records the current yarn.lock baseline
  (generated 2026-09-03: 72 packages / 196 advisories - 8 Critical, 91 High,
  81 Moderate, 15 Low, 1 Unknown). Baseline entries are identity-scoped to
  (ecosystem, package name, resolved version, advisory ID): an advisory
  already present for another package/version never suppresses a newly
  introduced vulnerable dependency (self-tests A-E in
  `.security/check-osv-baseline.py --selftest`). Review/expiry: 2026-12-01.
- Image baselines are per platform: `.trivyignore-amd64` (125 unique C/H CVEs
  from the 2026-09-03 local runtime-layer scan; the first production CI
  candidate scan regenerates the authoritative list), `.trivyignore-arm64`
  and `.trivyignore-armv7` (PENDING first real candidate scans - until
  reviewed, ALL Critical/High findings on those platforms block the gate).
  Review/expiry: 2026-12-01.
- `.security/codeql-baseline.json` records reviewed CodeQL finding identities
  (ruleId + artifact + line); initially empty - the first CI SARIF run
  populates the review backlog; un-baselined high-confidence findings fail.
- `.gitleaks.toml` allowlist entries are exact-fake-value (`regexTarget:
secret`) with path exclusions ONLY for vendored Yarn release bundles.
  Sensitive source/config/workflow/Helm files are NOT whole-file excluded
  (bypass regression self-test: `.security/gitleaks-bypass-selftest.py`).

## Exception process

- Any exception must be advisory/CVE-scoped (or finding-identity-scoped for
  CodeQL), justified in a PR, approved by a maintainer, and time-bounded
  (expiry date).
- New findings are never hidden via `continue-on-error`.
- False positives: file a PR adjusting the narrow allowlist/baseline with the
  upstream reference; the change is reviewable.

## Severity semantics

- OSV: the scanner-provided normalized label (`database_specific.severity`)
  is authoritative; CVSS vectors computed with the CVSS 3.1 base-score formula
  as fallback; a NEW advisory whose severity cannot be classified is treated
  as BLOCKING (review required), never silently reported.
- CodeQL: official SARIF metadata only (`security-severity`, `precision`,
  `level`); severity is never inferred from rule names.

## Supply-chain notes

- Third-party actions follow the repository's major-tag convention
  (e.g. `gitleaks/gitleaks-action@v3`, `google/osv-scanner-action@v1`,
  `github/codeql-action@v3`). Major tags are mutable; this is the accepted
  repository convention. All pinned binary downloads (self-tests, Trivy)
  verify the official release SHA256SUMS.
- No `curl | bash` installers are used.

## Known limitations and historical baseline risk

- The OSV and amd64 image baselines reflect 2026-09-03 data; the arm64/armv7
  image baselines are pending first real candidate scans. Existing historical
  findings remain explicitly tracked, reviewed and expiring; remediation is
  separate work.
- The image gate scans the pushed candidate digests by digest; the multi-
  platform build is a single build (no rebuild after scan).
- CodeQL SARIF upload needs GitHub Advanced Security; the security-result
  gate does not and runs everywhere.
