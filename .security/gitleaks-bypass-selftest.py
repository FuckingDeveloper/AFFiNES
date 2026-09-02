#!/usr/bin/env python3
"""Gitleaks allowlist bypass regression self-test.

For every previously file-allowlisted sensitive path (config source, deploy
workflows, Helm secret templates, auth/provider source), copy the file into a
temporary tree and append an unrelated synthetic secret. Gitleaks MUST detect
the inserted secret; the intentional fake fixture values must remain allowed.

Usage: gitleaks-bypass-selftest.py <gitleaks-binary> <repo-root> <gitleaks-config>
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

SENSITIVE_PATHS = [
    'packages/backend/server/src/fundamentals/config/default.ts',
    'packages/backend/server/src/fundamentals/helpers/config.ts',
    '.github/workflows/deploy.yml',
    '.github/workflows/release-desktop.yml',
    '.github/helm/affine-cloud/templates/secret.yaml',
    '.github/helm/affine-cloud/values.yaml',
    'packages/backend/server/src/base/logger/__tests__/redaction.spec.ts',
    'packages/data-center/src/provider/affine/apis/__tests__/token.spec.ts',
]

SYNTHETIC_SECRET = 'sk-live-9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'


def main():
    binary, repo, config = sys.argv[1], sys.argv[2], sys.argv[3]
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        for rel in SENSITIVE_PATHS:
            src = os.path.join(repo, rel)
            if not os.path.exists(src):
                continue
            dst = os.path.join(tmp, os.path.basename(rel))
            shutil.copy(src, dst)
            with open(dst, 'a') as f:
                f.write('\nSOME_SECRET = "%s"\n' % SYNTHETIC_SECRET)
            result = subprocess.run(
                [binary, 'detect', '--source', tmp, '--no-git', '--no-banner',
                 '--config', config, '--report-format', 'json',
                 '--report-path', os.path.join(tmp, 'report.json')],
                capture_output=True,
                text=True,
            )
            detected = []
            if os.path.exists(os.path.join(tmp, 'report.json')):
                report = json.load(open(os.path.join(tmp, 'report.json')))
                detected = [
                    f.get('Secret') for f in report
                    if SYNTHETIC_SECRET in (f.get('Secret') or '')
                ]
            if detected:
                print('PASS: inserted secret detected in %s' % rel)
            else:
                print('FAIL: inserted secret NOT detected in %s' % rel)
                failures.append(rel)
            os.remove(os.path.join(tmp, 'report.json'))
    if failures:
        print('bypass regression failures: %s' % ', '.join(failures))
        return 1
    print('all sensitive paths detect inserted secrets; fixture values allowed')
    return 0


if __name__ == '__main__':
    sys.exit(main())