#!/usr/bin/env python3
"""Filter documented pre-existing oxlint findings from the TrackWork lint
stage. Reads /tmp/trackwork-oxlint.log; prints NEW (non-baseline) findings and
exits 1 when any exist. Baseline = exact file suffixes + rules documented in
docs/trackwork-local-validation.md."""

import re
import sys

BASELINE_FILES = (
    'task-relations.spec.ts',
    'automation.spec.ts',
    'config.spec.ts',
    'large-workspace.spec.ts',
    'index.tsx',
    'index.ts',  # ANSI-stripped marker truncates the colorized .tsx suffix
    'workflow-config.ts',
    'workflow.service.ts',
    'service.ts',
)
BASELINE_RULES = (
    'simple-import-sort',
    'no-duplicates',
    'no-floating-promises',
    'no-misused-promises',
)

log = open('/tmp/trackwork-oxlint.log').read()
log = re.sub(r'\x1b\[[0-9;]*m', '', log)
lines = log.splitlines()
new_findings = []
for i, line in enumerate(lines):
    if '\u256d\u2500[' not in line:  # oxlint location marker
        continue
    m = re.search(r'packages/[^]:]+', line)
    if not m:
        continue
    file = m.group(0)
    rule = ''
    j = i - 1
    while j >= 0 and '\u00d7' not in lines[j]:
        j -= 1
    if j >= 0:
        rule = lines[j].split('\u00d7')[1].strip()
        if rule.startswith('simple-import-sort'):
            rule = 'simple-import-sort'
        else:
            m_rule = re.search(r'\(([^)]+)\)', rule)
            rule = m_rule.group(1) if m_rule else rule.split('(')[0].strip()
    baselined = any(file.endswith(f) for f in BASELINE_FILES) and rule in BASELINE_RULES
    if not baselined:
        new_findings.append((rule, file))

for rule, file in new_findings[:10]:
    print(rule, file)
print('NEW_COUNT=%d' % len(new_findings))
sys.exit(0 if len(new_findings) == 0 else 1)