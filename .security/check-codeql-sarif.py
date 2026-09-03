#!/usr/bin/env python3
"""Fail the CI on NEW high-confidence CodeQL security findings.

Usage:
  check-codeql-sarif.py <sarif.json> <baseline.json>
  check-codeql-sarif.py --selftest

Policy (docs/security-ci.md): a finding blocks when it carries official
CodeQL security metadata - rule properties.security-severity (>= 7.0) and
rule properties.precision (high/very-high), or the result level 'error'.
Findings with a security severity but unknown precision are treated as
review-required (blocking). Findings matching the committed baseline
(ruleId + artifact URI + region line) are allowed only while explicitly
baselined; the baseline is reviewed and expires per the policy."""

import json
import sys

BLOCK_LEVELS = ('error',)
BLOCK_PRECISION = ('high', 'very-high')
BLOCK_SEVERITY = 7.0


def rule_map(run):
    rules = {}
    for rule in run.get('tool', {}).get('driver', {}).get('rules', []):
        props = rule.get('properties', {})
        rules[rule.get('id')] = props
    return rules


def finding_identity(result, artifact_map, rules):
    fingerprint = (result.get('partialFingerprints') or {}).get(
        'primaryLocationLineHash'
    )
    if fingerprint:
        return (result.get('ruleId'), fingerprint)
    location = (result.get('locations') or [{}])[0].get('physicalLocation', {})
    uri = artifact_map.get(location.get('artifactLocation', {}).get('uri'))
    region = location.get('region', {})
    start = region.get('startLine')
    return (result.get('ruleId'), uri, start)


def classify(result, rules):
    props = rules.get(result.get('ruleId'), {})
    severity = props.get('security-severity')
    precision = props.get('precision')
    level = result.get('level')
    try:
        sev = float(severity)
    except (TypeError, ValueError):
        sev = None
    if sev is not None and sev >= BLOCK_SEVERITY and precision in BLOCK_PRECISION:
        return 'block', sev
    if sev is not None and sev >= BLOCK_SEVERITY:
        return 'review-required', sev
    if level in BLOCK_LEVELS:
        return 'block', sev
    return 'report', sev


def gate(sarif_path, baseline_path):
    sarif = json.load(open(sarif_path))
    baseline_ids = set()
    baseline = json.load(open(baseline_path))
    for entry in baseline:
        if entry.get('fingerprint'):
            baseline_ids.add((entry['ruleId'], entry['fingerprint']))
        else:
            baseline_ids.add((entry['ruleId'], entry['uri'], entry['startLine']))

    blocking = []
    review = []
    reported = []
    for run in sarif.get('runs', []):
        rules = rule_map(run)
        artifacts = run.get('artifacts', [])
        artifact_map = {
            a.get('location', {}).get('uri'): a.get('location', {}).get('uri')
            for a in artifacts
        }
        for result in run.get('results', []):
            kind, sev = classify(result, rules)
            identity = finding_identity(result, artifact_map, rules)
            if identity in baseline_ids:
                continue
            location = (result.get('locations') or [{}])[0].get(
                'physicalLocation', {}
            )
            uri = location.get('artifactLocation', {}).get('uri')
            line = (location.get('region') or {}).get('startLine')
            entry = (result.get('ruleId'), uri, line, sev, kind)
            if kind == 'block':
                blocking.append(entry)
            elif kind == 'review-required':
                review.append(entry)
            else:
                reported.append(entry)

    print('NEW blocking security findings: %d' % len(blocking))
    for rule, uri, line, sev, kind in sorted(blocking, key=lambda x: -(x[3] or 0)):
        print('  BLOCK %s %s:%s severity=%s' % (rule, uri, line, sev))
    print('NEW review-required (unclassified precision): %d' % len(review))
    for rule, uri, line, sev, kind in review[:5]:
        print('  REVIEW %s %s:%s severity=%s' % (rule, uri, line, sev))
    print('NEW non-blocking security findings: %d' % len(reported))
    return 1 if blocking or review else 0


def selftest():
    def run(results, rules):
        return {
            'runs': [{
                'tool': {'driver': {'rules': rules}},
                'artifacts': [{'location': {'uri': 'src/app.ts'}}],
                'results': results,
            }],
        }

    def rule(rid, severity, precision):
        return {'id': rid, 'properties': {
            'security-severity': severity,
            'precision': precision,
        }}

    def result(rid, uri='src/app.ts', line=10, level='warning'):
        return {
            'ruleId': rid,
            'level': level,
            'locations': [{'physicalLocation': {
                'artifactLocation': {'uri': uri},
                'region': {'startLine': line},
            }}],
        }

    empty_baseline = {'path': 'empty.json'}
    cases = []

    def write(tmp, name, data):
        import os
        path = os.path.join(tmp, name)
        json.dump(data, open(path, 'w'))
        return path

    import os
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        base = write(tmp, 'baseline.json', [])
        cases.append(('non-security finding allowed', base, run(
            [result('js/no-secret')], [rule('js/no-secret', None, None)]), 0))
        cases.append(('high-severity high-precision blocks', base, run(
            [result('js/path-injection')],
            [rule('js/path-injection', '8.0', 'high')]), 1))
        cases.append(('high-severity unknown precision review-required', base, run(
            [result('js/xxe')], [rule('js/xxe', '9.0', None)]), 1))
        cases.append(('low-severity reported only', base, run(
            [result('js/path-injection')],
            [rule('js/path-injection', '3.0', 'high')]), 0))
        cases.append(('error level blocks without severity', base, run(
            [result('js/errors', level='error')], [rule('js/errors', None, None)]), 1))
        baseline_with_entry = write(tmp, 'baseline2.json', [
            {
                'ruleId': 'js/path-injection',
                'uri': 'src/app.ts',
                'startLine': 10,
                'justification': 'selftest',
                'reviewOwner': 'selftest',
                'expiry': '2099-01-01',
            },
        ])
        cases.append(('baselined finding allowed', baseline_with_entry, run(
            [result('js/path-injection')],
            [rule('js/path-injection', '8.0', 'high')]), 0))

        failures = 0
        for label, base_path, sarif, expected in cases:
            sarif_path = write(tmp, 's.json', sarif)
            rc = gate(sarif_path, base_path)
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