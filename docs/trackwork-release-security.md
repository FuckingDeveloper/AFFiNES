# TrackWork Production Security Review

OpenSpec 1.15. This checklist and the machine-readable risk-acceptance
contract make Critical/High release risk acceptance EXPLICIT and verifiable.
The portable gate `yarn trackwork:security:release` enforces it; mandatory
automated enforcement is DEFERRED to the Jenkins release pipeline (GitHub
Actions are disabled; see docs/trackwork-local-validation.md).

## Major production release definition

"Major production release" is a PROCESS class, not a SemVer MAJOR bump. It
includes:

- stable/versioned server + container images published for production use;
- production self-host releases;
- desktop/mobile production releases.

Excluded (not in this class): developer/local validation, test/nightly
artifacts, canary/beta prereleases (they remain under the source-security
gates in `trackwork:security`).

## Checklist (every item must be PASS / NOT APPLICABLE+reason / RISK ACCEPTED+record)

### Source/dependency security

- dependency vulnerability scan result (OSV)
- secret scan result (Gitleaks)
- static/security-analysis result (CodeQL when run)
- newly introduced Critical/High findings since the last release
- baseline expiry/status (OSV 2026-12-01; CodeQL; Trivy per-platform)

### Container/runtime security

- production image vulnerability result (Trivy, per platform digest)
- exact production artifact/image identity (candidate tag + platform digests)
- Critical/High runtime findings and fix availability

### Application security

- targeted TrackWork security integration suite (`trackwork:security`)
- authorization/IDOR coverage
- webhook security (signature + replay dedupe)
- injection/XSS/SSRF findings
- audit/security-event coverage

### Migration/release safety

- database/data migrations applied and verified
- upgrade compatibility (upgrade e2e)
- rollback/backup expectations stated
- security-sensitive config changes reviewed

### Change-specific review (when this release changes these)

- new auth boundary
- new permission/capability
- new external/network surface
- new secret/credential storage
- new file/blob surface
- new admin functionality
- new cryptographic behavior

## Risk acceptance contract

Accepted risks live in `.security/risk-acceptances/*.json`, one finding per
file. A vulnerability BASELINE ("known/tracked") is NOT an acceptance
("authorized human permits release despite it") - the release gate requires
an explicit acceptance record for every Critical/High finding.

Required fields:

```json
{
  "finding": {
    "source": "osv | codeql | trivy",
    "identity": {
      "osv": { "ecosystem": "", "name": "", "version": "", "advisory": "" },
      "codeql": { "ruleId": "", "fingerprint": "" },
      "trivy": { "type": "", "package": "", "version": "", "cve": "" }
    }
  },
  "severity": "CRITICAL | HIGH",
  "affected": { "component": "", "artifact": "" },
  "impact": "",
  "whyNotFixed": "",
  "compensatingControls": "",
  "approver": { "name": "", "date": "YYYY-MM-DD" },
  "expiry": "YYYY-MM-DD",
  "remediation": "reference or null",
  "releaseScope": { "version": "vX.Y.Z | *", "artifact": "*", "platform": "*" }
}
```

Rules:

- approval date and expiry are explicit; the gate compares expiry to the
  current date (deterministic, date-only); expired acceptances FAIL;
- scope is release-bound; a scope that does not match the release
  version/artifact/platform FAILS;
- identity must match exactly (OSV: ecosystem/name/version/advisory; CodeQL:
  ruleId + fingerprint; Trivy: type/package/version/CVE);
- blank approver, malformed dates, missing impact/whyNotFixed FAIL;
- real active secrets are NOT risk-acceptable: release BLOCKED until the
  secret is rotated/removed (synthetic test secrets and fixture placeholders
  are not findings and stay under the Gitleaks allowlist system).

## Approval authority

The repository has no formal security team. The minimal model: the release
owner/maintainer named in the acceptance must be a human reviewer; the
finding's author may not silently self-approve through an automated default;
approval identity is the named approver in the record (no cryptographic proof
claimed). Each acceptance is time-bounded and release-scoped.

## Gate

`yarn trackwork:security:release -- --scope-version vX.Y.Z`
(+ optional `--scope-artifact`, `--scope-platform`, `CODEQL_SARIF`,
`TRIVY_REPORT` env). Exits 0 (PASS), 1 (BLOCKED), 2 (usage). Scanner failure
BLOCKs. Self-tests: `python3 scripts/ci/release-security-gate.py --selftest`.
