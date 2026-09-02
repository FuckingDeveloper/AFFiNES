# TrackWork Security CI Policy

Scope: OpenSpec 1.11 (dependency vulnerability scanning), 1.12 (secret
scanning + security-focused static analysis), 1.13 (release image scanning).

## Blocking thresholds

| Control                    | Tool                         | Gate                                                               | Fails on                                                                                               |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Dependency vulnerabilities | OSV-Scanner (baseline-aware) | PR + push to develop + release                                     | NEW Critical/High advisories vs `.security/osv-baseline.json`; Moderate/Low are reported, not blocking |
| Secrets                    | Gitleaks                     | PR + push to develop + release                                     | any detected secret not covered by the narrow allowlist in `.gitleaks.toml`                            |
| Static analysis            | CodeQL (security-extended)   | PR + push (build-test.yml analyze job)                             | high-confidence security findings surfaced via GitHub SARIF alerts per repository triage               |
| Production image           | Trivy (CRITICAL,HIGH)        | release image build (build-images.yml), BEFORE multi-platform push | Critical/High findings not listed in `.trivyignore`                                                    |

## Baselines and exceptions

- `.security/osv-baseline.json` records the current yarn.lock baseline
  (generated 2026-09-03: 72 packages / 196 advisories - 8 Critical, 91 High,
  81 Moderate, 15 Low, 1 Unknown). The baseline blocks NEW findings only.
  Review/expiry: 2026-12-01. To update the baseline, regenerate with
  `osv-scanner --format json --lockfile yarn.lock` and get maintainer review.
- `.trivyignore` records the Critical/High baseline of the production image
  (generated 2026-09-03 from a local runtime-layer assembly of
  node:22-bookworm-slim + workspace node_modules + server dist; 125 unique
  C/H CVEs - the first production CI scan regenerates the authoritative list).
  Review/expiry: 2026-12-01. NEW Critical/High CVEs not in the file fail the
  gate. Unfixed baseline CVEs are tracked in the release report, not silently
  ignored.
- `.gitleaks.toml` allowlist entries are file-scoped and cover only
  intentionally fake credentials in test fixtures, Helm placeholders, example
  configs and vendored Yarn bundles. No directory-level exclusions.

## Exception process

- Any exception must be: advisory-ID/CVE-scoped (or file-scoped for secrets),
  justified in a PR, approved by a maintainer, and time-bounded (expiry date).
- New findings are never hidden via `continue-on-error`; the release image
  scan runs before publication (a second multi-platform push build follows the
  scan build - a documented double-build tradeoff of the "scanner in same
  build job" reuse strategy).
- False positives: file a PR adjusting the narrow allowlist/baseline with the
  upstream advisory reference; the change is reviewable.

## Supply-chain notes

- Third-party actions follow the repository's major-tag convention
  (e.g. `gitleaks/gitleaks-action@v3`, `google/osv-scanner-action@v1`,
  `aquasecurity/trivy-action@0.28.0`, `github/codeql-action@v3`).
  Major tags are mutable; this is the accepted repository convention. The
  pinned self-test binary downloads verify the official release SHA256SUMS.
- No `curl | bash` installers are used; self-test binaries come from the
  tools' official GitHub releases with checksum verification.

## Known limitations

- CodeQL SARIF upload requires GitHub Advanced Security; on forks/self-hosted
  without it the analyze job still runs locally and reports via annotations.
- The image gate scans the linux/amd64 platform build locally before the
  multi-platform push; arm64/armv7 images are built from the same Dockerfile
  but are not individually scanned in this pass.
