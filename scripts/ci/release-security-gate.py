#!/usr/bin/env python3
"""TrackWork release-security gate (portable; Jenkins-ready).

Validates that every NEW/known Critical/High security finding has an explicit,
non-expired, scoped human risk acceptance before a major production release.

Usage:
  release-security-gate.py --osv-report <osv.json> --acceptances <dir>
                           [--codeql-sarif <sarif.json>] [--trivy-report <trivy.json>]
                           [--scope-version V] [--scope-artifact A] [--scope-platform P]
  release-security-gate.py --selftest

Exit codes: 0 = PASS (no unaccepted Critical/High), 1 = BLOCKED, 2 = usage error.

Baseline findings are NOT release approvals: a finding in a vulnerability
baseline still requires an explicit risk acceptance record (OpenSpec 1.15).
"""

import argparse
import json
import os
import re
import sys
from datetime import date

BLOCK_SEVERITIES = ('CRITICAL', 'HIGH')
SOURCE_FIELDS = {
    'osv': ('ecosystem', 'name', 'version', 'advisory'),
    'codeql': ('ruleId', 'fingerprint'),
    'trivy': ('type', 'package', 'version', 'cve'),
}


def today():
    return date.today()


def parse_date(value):
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2})', str(value or ''))
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def severity_of_osv(vuln):
    normalized = (vuln.get('database_specific') or {}).get('severity')
    if normalized in ('CRITICAL', 'HIGH', 'MODERATE', 'LOW'):
        return normalized
    return None


def osv_findings(report):
    findings = []
    for result in report.get('results', []):
        for pkg in result.get('packages', []):
            package = pkg.get('package') or {}
            for vuln in pkg.get('vulnerabilities', []):
                sev = severity_of_osv(vuln)
                if sev in BLOCK_SEVERITIES:
                    findings.append({
                        'source': 'osv',
                        'identity': {
                            'ecosystem': package.get('ecosystem') or '',
                            'name': package.get('name') or '',
                            'version': package.get('version') or '',
                            'advisory': vuln.get('id'),
                        },
                        'severity': sev,
                        'summary': (vuln.get('summary') or '')[:200],
                    })
    return findings


def codeql_findings(sarif):
    findings = []
    for run in sarif.get('runs', []):
        rules = {
            r['id']: r.get('properties', {})
            for r in run.get('tool', {}).get('driver', {}).get('rules', [])
        }
        for result in run.get('results', []):
            props = rules.get(result.get('ruleId'), {})
            try:
                sev = float(props.get('security-severity'))
            except (TypeError, ValueError):
                sev = None
            if sev is None or sev < 7.0:
                continue
            fingerprint = (result.get('partialFingerprints') or {}).get(
                'primaryLocationLineHash'
            )
            findings.append({
                'source': 'codeql',
                'identity': {
                    'ruleId': result.get('ruleId'),
                    'fingerprint': fingerprint or '',
                },
                'severity': 'CRITICAL' if sev >= 9.0 else 'HIGH',
                'summary': (result.get('message') or {}).get('text', '')[:200],
            })
    return findings


def trivy_findings(report):
    findings = []
    for result in report.get('Results', []):
        for vuln in result.get('Vulnerabilities', []):
            sev = vuln.get('Severity')
            if sev not in BLOCK_SEVERITIES:
                continue
            findings.append({
                'source': 'trivy',
                'identity': {
                    'type': result.get('Type') or '',
                    'package': vuln.get('PkgName') or '',
                    'version': vuln.get('InstalledVersion') or '',
                    'cve': vuln.get('VulnerabilityID'),
                },
                'severity': sev,
                'summary': (vuln.get('Title') or '')[:200],
            })
    return findings


def identity_match(record_identity, finding_identity):
    for field, value in finding_identity.items():
        if (record_identity.get(field) or '') != value:
            return False
    return True


def identity_key(finding):
    source = finding['source']
    fields = SOURCE_FIELDS[source]
    return (source,) + tuple(finding['identity'].get(f) or '' for f in fields)


def scope_match(acceptance_scope, gate_scope):
    for key in ('version', 'artifact', 'platform'):
        wanted = acceptance_scope.get(key)
        actual = gate_scope.get(key)
        if wanted in (None, '', '*'):
            continue
        if wanted != actual:
            return False
    return True


def load_acceptances(directory):
    records = []
    if not os.path.isdir(directory):
        return records
    for name in sorted(os.listdir(directory)):
        if not name.endswith('.json'):
            continue
        try:
            records.append(json.load(open(os.path.join(directory, name))))
        except (ValueError, OSError):
            continue
    return records


def validate_acceptance(record, finding, gate_scope, now):
    errors = []
    identity = record.get('finding', {}).get('identity') or {}
    source = record.get('finding', {}).get('source')
    if source != finding['source']:
        errors.append('source mismatch')
    expected = dict(zip(SOURCE_FIELDS[source], identity_key(finding)[1:]))
    for field, value in expected.items():
        if (identity.get(field) or '') != value:
            errors.append('identity field %s mismatch' % field)
    sev = record.get('severity')
    if sev not in BLOCK_SEVERITIES:
        errors.append('severity missing or not Critical/High')
    approver = record.get('approver') or {}
    if not str(approver.get('name') or '').strip():
        errors.append('blank approver')
    approval_date = parse_date(approver.get('date'))
    if approval_date is None:
        errors.append('invalid approval date')
    elif approval_date > now:
        errors.append('approval date is in the future')
    expiry = parse_date(record.get('expiry'))
    if expiry is None:
        errors.append('invalid expiry')
    elif expiry < now:
        errors.append('expired')
    if not scope_match(record.get('releaseScope') or {}, gate_scope):
        errors.append('release scope mismatch')
    if not str(record.get('impact') or '').strip():
        errors.append('missing impact')
    if not str(record.get('whyNotFixed') or '').strip():
        errors.append('missing why-not-fixed')
    return errors


def run_gate(args, now):
    osv_f = osv_findings(json.load(open(args.osv_report))) if args.osv_report else []
    codeql_f = (
        codeql_findings(json.load(open(args.codeql_sarif)))
        if args.codeql_sarif
        else []
    )
    trivy_f = (
        trivy_findings(json.load(open(args.trivy_report)))
        if args.trivy_report
        else []
    )
    findings = osv_f + codeql_f + trivy_f

    gate_scope = {
        'version': args.scope_version,
        'artifact': args.scope_artifact,
        'platform': args.scope_platform,
    }

    accepted = []
    unaccepted = []
    ambiguous = []
    for finding in findings:
        matching = [r for r in load_acceptances(args.acceptances)
                    if (r.get('finding', {}).get('source') == finding['source']
                        and identity_match(r.get('finding', {}).get('identity') or {},
                                           finding['identity']))]
        if not matching:
            unaccepted.append(finding)
            continue
        if len(matching) > 1:
            ambiguous.append(finding)
            continue
        errors = validate_acceptance(matching[0], finding, gate_scope, now)
        (accepted if not errors else unaccepted).append(finding)

    print('TrackWork Release Security Review')
    print('Scanner evidence: OSV=%s CodeQL=%s Trivy=%s' % (
        'executed' if args.osv_report else 'NOT PROVIDED',
        'executed' if args.codeql_sarif else 'NOT PROVIDED',
        'executed' if args.trivy_report else 'NOT PROVIDED',
    ))
    print('Critical findings: %d  High findings: %d' % (
        sum(1 for f in findings if f['severity'] == 'CRITICAL'),
        sum(1 for f in findings if f['severity'] == 'HIGH'),
    ))
    print('Accepted risks: %d  Unaccepted: %d  Ambiguous acceptances: %d' % (
        len(accepted), len(unaccepted), len(ambiguous)))
    for finding in unaccepted:
        ident = json.dumps(finding['identity'])
        print('  UNACCEPTED %s %s %s' % (finding['severity'], finding['source'], ident))
    for finding in ambiguous:
        ident = json.dumps(finding['identity'])
        print('  AMBIGUOUS %s %s %s (multiple acceptance records; reject)' % (
            finding['severity'], finding['source'], ident))
    if unaccepted or ambiguous:
        print('VERDICT: BLOCKED')
        return 1
    print('VERDICT: PASS (risk-acceptance layer; scanner coverage as stated above)')
    return 0


def selftest():
    import tempfile

    now = date(2026, 9, 3)

    def write(tmp, name, data):
        path = os.path.join(tmp, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        json.dump(data, open(path, 'w'))
        return path

    osv_report = {'results': [{'packages': [{
        'package': {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0'},
        'vulnerabilities': [{
            'id': 'GHSA-AAA',
            'database_specific': {'severity': 'CRITICAL'},
        }],
    }]}]}

    def acceptance(identity, severity='CRITICAL', expiry='2027-01-01',
                   approver='reviewer', scope=None, extra=None):
        rec = {
            'finding': {'source': 'osv', 'identity': identity},
            'severity': severity,
            'affected': {'component': 'server'},
            'impact': 'test impact',
            'whyNotFixed': 'test reason',
            'approver': {'name': approver, 'date': '2026-09-01'},
            'expiry': expiry,
            'remediation': None,
            'releaseScope': scope or {'version': '*', 'artifact': '*', 'platform': '*'},
        }
        if extra:
            rec.update(extra)
        return rec

    cases = []
    with tempfile.TemporaryDirectory() as tmp:
        report_path = write(tmp, 'report.json', osv_report)
        base = ['--osv-report', report_path]

        cases.append(('A no critical/high -> PASS', [], 'report-empty.json',
                      {'results': []}, 0))

        no_accept_dir = os.path.join(tmp, 'none')
        os.makedirs(no_accept_dir, exist_ok=True)
        cases.append(('B critical no acceptance -> FAIL', ['--acceptances', no_accept_dir],
                      None, None, 1))

        high_report = {'results': [{'packages': [{
            'package': {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0'},
            'vulnerabilities': [{'id': 'GHSA-HHH',
                                 'database_specific': {'severity': 'HIGH'}}],
        }]}]}
        high_path = write(tmp, 'high.json', high_report)
        cases.append(('C high no acceptance -> FAIL', ['--osv-report', high_path,
                      '--acceptances', no_accept_dir], None, None, 1))

        accept_dir = os.path.join(tmp, 'accept')
        write(accept_dir, 'a.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0', 'advisory': 'GHSA-AAA'}))
        cases.append(('D critical valid scoped acceptance -> PASS', ['--acceptances', accept_dir],
                      None, None, 0))

        def isolated_dir(name, record):
            d = os.path.join(tmp, name)
            os.makedirs(d, exist_ok=True)
            write(d, 'only.json', record)
            return d

        cases.append(('E expired acceptance -> FAIL',
                      ['--acceptances', isolated_dir('expired', acceptance(
                          {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
                           'advisory': 'GHSA-AAA'}, expiry='2026-01-01'))],
                      None, None, 1))

        cases.append(('F wrong advisory -> FAIL',
                      ['--acceptances', isolated_dir('wrong-advisory', acceptance(
                          {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
                           'advisory': 'GHSA-OTHER'}))],
                      None, None, 1))

        cases.append(('G wrong release scope -> FAIL',
                      ['--acceptances', isolated_dir('wrong-scope', acceptance(
                          {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
                           'advisory': 'GHSA-AAA'},
                          scope={'version': 'v9.9.9', 'artifact': '*', 'platform': '*'})),
                       '--scope-version', 'v1.0.0'], None, None, 1))

        cases.append(('H blank approver -> FAIL',
                      ['--acceptances', isolated_dir('blank-approver', acceptance(
                          {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
                           'advisory': 'GHSA-AAA'}, approver='  '))],
                      None, None, 1))

        baseline_no_accept = os.path.join(tmp, 'baseline-only')
        os.makedirs(baseline_no_accept, exist_ok=True)
        cases.append(('I baseline finding without acceptance -> FAIL',
                      ['--acceptances', baseline_no_accept], None, None, 1))

        cases.append(('J scanner failure -> FAIL', ['--osv-report',
                      os.path.join(tmp, 'missing.json'), '--acceptances', accept_dir],
                      None, None, 1))

        moderate_report = {'results': [{'packages': [{
            'package': {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0'},
            'vulnerabilities': [{'id': 'GHSA-M', 'database_specific': {'severity': 'MODERATE'}}],
        }]}]}
        moderate_path = write(tmp, 'moderate.json', moderate_report)
        cases.append(('K moderate only -> PASS without acceptance',
                      ['--osv-report', moderate_path, '--acceptances', no_accept_dir],
                      None, None, 0))

        same_dir = os.path.join(tmp, 'same-finding')
        os.makedirs(same_dir, exist_ok=True)
        write(same_dir, 'one.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
             'advisory': 'GHSA-AAA'}, approver='reviewer-one'))
        write(same_dir, 'two.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
             'advisory': 'GHSA-AAA'}, approver='reviewer-two'))
        cases.append(('L duplicate acceptances for one finding -> FAIL',
                      ['--acceptances', same_dir], None, None, 1))

        one_valid_one_expired = os.path.join(tmp, 'valid-and-expired')
        os.makedirs(one_valid_one_expired, exist_ok=True)
        write(one_valid_one_expired, 'v.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
             'advisory': 'GHSA-AAA'}, approver='reviewer-one'))
        write(one_valid_one_expired, 'e.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
             'advisory': 'GHSA-AAA'}, approver='reviewer-two', expiry='2026-01-01'))
        cases.append(('M valid+expired duplicate -> FAIL (ambiguous)',
                      ['--acceptances', one_valid_one_expired], None, None, 1))

        today_dir = os.path.join(tmp, 'expiry-today')
        os.makedirs(today_dir, exist_ok=True)
        write(today_dir, 't.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
             'advisory': 'GHSA-AAA'}, expiry='2026-09-03'))
        cases.append(('N expiry equals current date -> PASS (valid through end of day)',
                      ['--acceptances', today_dir], None, None, 0))

        future_approval_dir = os.path.join(tmp, 'future-approval')
        os.makedirs(future_approval_dir, exist_ok=True)
        write(future_approval_dir, 'f.json', acceptance(
            {'ecosystem': 'npm', 'name': 'pkg-a', 'version': '1.0.0',
             'advisory': 'GHSA-AAA'}, approver='reviewer'))
        rec = json.load(open(os.path.join(future_approval_dir, 'f.json')))
        rec['approver']['date'] = '2026-12-01'
        json.dump(rec, open(os.path.join(future_approval_dir, 'f.json'), 'w'))
        cases.append(('O future approval date -> FAIL',
                      ['--acceptances', future_approval_dir], None, None, 1))

        failures = 0
        for label, extra_args, alt_report, alt_data, expected in cases:
            args = list(base) + extra_args
            if alt_report:
                path = write(tmp, alt_report, alt_data)
                args = ['--osv-report', path] + [a for a in extra_args if not a.startswith('--osv-report')]
            parsed = parse_args(args)
            try:
                rc = run_gate(parsed, now)
            except Exception as error:
                rc = 1
                if expected != 1:
                    print('FAIL %s (unexpected exception %s)' % (label, error))
                    failures += 1
                    continue
            ok = rc == expected
            print('%s: %s (expected %d, got %d)' % ('PASS' if ok else 'FAIL', label, expected, rc))
            if not ok:
                failures += 1
        return 1 if failures else 0


def parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument('--osv-report')
    parser.add_argument('--codeql-sarif')
    parser.add_argument('--trivy-report')
    parser.add_argument('--acceptances')
    parser.add_argument('--scope-version')
    parser.add_argument('--scope-artifact')
    parser.add_argument('--scope-platform')
    parser.add_argument('--selftest', action='store_true')
    return parser.parse_args(argv)


def main():
    args = parse_args(sys.argv[1:])
    if args.selftest:
        sys.exit(selftest())
    if not args.acceptances:
        print('--acceptances directory is required')
        sys.exit(2)
    try:
        sys.exit(run_gate(args, today()))
    except FileNotFoundError as error:
        print('BLOCKED: scanner/report failure (%s)' % error)
        sys.exit(1)


if __name__ == '__main__':
    main()