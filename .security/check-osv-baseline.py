#!/usr/bin/env python3
"""Fail the dependency gate on NEW Critical/High advisories vs the committed
baseline. Usage:
  check-osv-baseline.py <baseline.json> <osv-report.json>
  check-osv-baseline.py --selftest

Baseline identity is (ecosystem, package name, resolved version, advisory id):
an advisory already present for another package/version never suppresses a
newly introduced vulnerable dependency.

Severity policy (docs/security-ci.md): the scanner-provided normalized label
(database_specific.severity) is authoritative; CVSS vectors are computed with
the CVSS 3.1 base-score formula as a fallback; any NEW advisory whose severity
cannot be classified is treated as BLOCKING (review required), never silently
reported."""

import json
import math
import os
import re
import sys
import tempfile


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


def severity_of(vuln):
    normalized = (vuln.get('database_specific') or {}).get('severity')
    if normalized in ('CRITICAL', 'HIGH', 'MODERATE', 'LOW'):
        return normalized
    for sev in vuln.get('severity') or []:
        if sev.get('type') in ('CVSS_V3', 'CVSS_V4') and sev.get('score'):
            score = cvss3_base(sev['score'])
            if score is not None:
                if score >= 9.0:
                    return 'CRITICAL'
                if score >= 7.0:
                    return 'HIGH'
                if score >= 4.0:
                    return 'MODERATE'
                return 'LOW'
    return None


def collect(report):
    findings = []
    for result in report.get('results', []):
        for pkg in result.get('packages', []):
            package = pkg.get('package') or {}
            ecosystem = package.get('ecosystem') or ''
            name = package.get('name') or ''
            version = package.get('version') or ''
            for vuln in pkg.get('vulnerabilities', []):
                findings.append({
                    'identity': (ecosystem, name, version, vuln.get('id')),
                    'ecosystem': ecosystem,
                    'name': name,
                    'version': version,
                    'id': vuln.get('id'),
                    'alias': (vuln.get('aliases') or [None])[0],
                    'severity': severity_of(vuln),
                })
    return findings


def gate(baseline_path, report_path):
    baseline_ids = {f['identity'] for f in collect(json.load(open(baseline_path)))}
    blocking = []
    reported = []
    unknown = []
    for finding in collect(json.load(open(report_path))):
        if finding['identity'] in baseline_ids:
            continue
        if finding['severity'] is None:
            unknown.append(finding)
        elif finding['severity'] in ('CRITICAL', 'HIGH'):
            blocking.append(finding)
        else:
            reported.append(finding)

    print('NEW Critical/High (blocking): %d' % len(blocking))
    for f in sorted(blocking, key=lambda x: x['severity']):
        print('  BLOCK %s %s %s %s (%s)' % (
            f['severity'], f['ecosystem'], f['name'], f['version'], f['id']))
    print('NEW Moderate/Low (reported only): %d' % len(reported))
    if unknown:
        print('UNCLASSIFIABLE NEW severity (review-required, blocking): %d' % len(unknown))
        for f in unknown[:5]:
            print('  REVIEW %s %s %s (%s)' % (f['name'], f['version'], f['id'], f['alias']))
    return 1 if blocking or unknown else 0


def adv(adv_id, severity):
    return {
        'id': adv_id,
        'aliases': [],
        'severity': [{
            'type': 'CVSS_V3',
            'score': 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        }],
        'database_specific': {'severity': severity},
    }


def pkg(name, version, advs):
    return {
        'package': {'ecosystem': 'npm', 'name': name, 'version': version},
        'vulnerabilities': advs,
    }


def selftest():
    base_report = {'results': [{'packages': [
        pkg('pkg-a', '1.0.0', [adv('GHSA-AAA', 'HIGH')]),
        pkg('pkg-b', '2.0.0', [adv('GHSA-BBB', 'MODERATE')]),
    ]}]}
    cases = [
        ('A same package+version+advisory is baseline', base_report, 0),
        ('B same advisory different package is NEW', {'results': [{'packages': [
            pkg('pkg-a', '1.0.0', [adv('GHSA-AAA', 'HIGH')]),
            pkg('pkg-b', '2.0.0', [adv('GHSA-BBB', 'MODERATE')]),
            pkg('pkg-c', '3.0.0', [adv('GHSA-AAA', 'HIGH')]),
        ]}]}, 1),
        ('C same advisory different version is NEW', {'results': [{'packages': [
            pkg('pkg-a', '1.1.0', [adv('GHSA-AAA', 'HIGH')]),
        ]}]}, 1),
        ('D new advisory on existing package is NEW', {'results': [{'packages': [
            pkg('pkg-a', '1.0.0', [adv('GHSA-AAA', 'HIGH'), adv('GHSA-CCC', 'HIGH')]),
        ]}]}, 1),
        ('E unclassifiable NEW severity blocks', {'results': [{'packages': [{
            'package': {'ecosystem': 'npm', 'name': 'pkg-x', 'version': '9.0.0'},
            'vulnerabilities': [{
                'id': 'GHSA-XXX',
                'aliases': [],
                'severity': [],
                'database_specific': {},
            }],
        }]}]}, 1),
    ]
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        base_path = os.path.join(tmp, 'baseline.json')
        json.dump(base_report, open(base_path, 'w'))
        for label, report, expected in cases:
            report_path = os.path.join(tmp, 'report.json')
            json.dump(report, open(report_path, 'w'))
            rc = gate(base_path, report_path)
            ok = rc == expected
            print('%s: %s (expected exit %d, got %d)' % (
                'PASS' if ok else 'FAIL', label, expected, rc))
            if not ok:
                failures += 1
    return 1 if failures else 0


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == '--selftest':
        sys.exit(selftest())
    sys.exit(gate(sys.argv[1], sys.argv[2]))