#!/usr/bin/env python3
"""Fail the dependency gate on NEW Critical/High advisories vs the committed
baseline. Usage: check-osv-baseline.py <baseline.json> <osv-report.json>

Policy: docs/security-ci.md. CVSS 4.0 vectors are approximated by mapping
VC/VI/VA onto the CVSS 3.1 base-score formula."""

import json
import math
import re
import sys


def cvss3_base(vector):
    m = re.match(r'CVSS:4\.0/(.+)$', vector)
    if m:
        parts = dict(kv.split(':') for kv in m.group(1).split('/'))
        vector = 'CVSS:3.1/AV:%s/AC:%s/PR:%s/UI:%s/S:%s/C:%s/I:%s/A:%s' % (
            parts.get('AV', 'N'),
            parts.get('AC', 'L'),
            parts.get('PR', 'N'),
            parts.get('UI', 'N'),
            parts.get('S', 'U'),
            parts.get('VC', 'N')[:1],
            parts.get('VI', 'N')[:1],
            parts.get('VA', 'N')[:1],
        )
    m = re.match(r'CVSS:3[.0-9]*/(.+)$', vector)
    if not m:
        return None
    parts = dict(kv.split(':') for kv in m.group(1).split('/'))
    av = {'N': 0.85, 'A': 0.62, 'L': 0.55, 'P': 0.2}[parts.get('AV', 'N')]
    ac = {'L': 0.77, 'H': 0.44}[parts.get('AC', 'L')]
    if parts.get('S') == 'C':
        pr = {'N': 0.85, 'L': 0.68, 'H': 0.5}[parts.get('PR', 'N')]
    else:
        pr = {'N': 0.85, 'L': 0.62, 'H': 0.27}[parts.get('PR', 'N')]
    ui = {'N': 0.85, 'R': 0.62}[parts.get('UI', 'N')]

    def impact_metric(x):
        return {'H': 0.56, 'L': 0.22, 'N': 0.0}[x]

    iss = (
        1
        - (1 - impact_metric(parts.get('C', 'N')))
        * (1 - impact_metric(parts.get('I', 'N')))
        * (1 - impact_metric(parts.get('A', 'N')))
    )
    if parts.get('S') == 'U':
        impact = 6.42 * iss
    else:
        impact = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
    exploitability = 8.22 * av * ac * pr * ui
    if parts.get('S') == 'U':
        base = min(impact + exploitability, 10)
    else:
        base = min(1.08 * (impact + exploitability), 10)
    return round(math.ceil(base * 10 - 1e-9) / 10, 1)


def main():
    baseline_path, report_path = sys.argv[1], sys.argv[2]
    baseline = json.load(open(baseline_path))
    known = set()
    for result in baseline.get('results', []):
        for pkg in result.get('packages', []):
            for vuln in pkg.get('vulnerabilities', []):
                known.add(vuln.get('id'))

    report = json.load(open(report_path))
    new_blocking = []
    new_reported = []
    for result in report.get('results', []):
        for pkg in result.get('packages', []):
            name = pkg.get('package', {}).get('name')
            for vuln in pkg.get('vulnerabilities', []):
                vid = vuln.get('id')
                if vid in known:
                    continue
                score = None
                for sev in vuln.get('severity') or []:
                    if sev.get('type') in ('CVSS_V3', 'CVSS_V4') and sev.get('score'):
                        score = cvss3_base(sev['score'])
                        if score is not None:
                            break
                entry = (name, vid, score, (vuln.get('aliases') or [None])[0])
                if score is not None and score >= 7.0:
                    new_blocking.append(entry)
                else:
                    new_reported.append(entry)

    print('NEW Critical/High (blocking): %d' % len(new_blocking))
    for name, vid, score, alias in sorted(new_blocking, key=lambda x: -(x[2] or 0)):
        print('  BLOCK', name, vid, score, alias)
    print('NEW Moderate/Low (reported only): %d' % len(new_reported))
    if new_blocking:
        sys.exit(1)


if __name__ == '__main__':
    main()