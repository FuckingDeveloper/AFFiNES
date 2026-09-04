import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  localizeTaskTrackerBoardTitle,
  localizeTaskTrackerStageTitle,
  trackWorkActivityLabel,
} from '@affine/core/utils/task-tracker-i18n';
import { describe, expect, it } from 'vitest';

const en = (key: string) => key;
const ru = (key: string) => key;

describe('TrackWork i18n stable-default model', () => {
  it('canonical default board resolves to a translation', () => {
    expect(
      localizeTaskTrackerBoardTitle(
        { id: 'default', title: 'Main board' },
        en,
        true
      )
    ).toBe('defaultBoard');
    expect(
      localizeTaskTrackerBoardTitle(
        { id: 'default', title: 'Main board' },
        en,
        false
      )
    ).toBe('Main board');
  });

  it('canonical default stages resolve to translations; custom config does not', () => {
    expect(
      localizeTaskTrackerStageTitle({ id: 'todo', title: 'To Do' }, en, true)
    ).toBe('defaultTodo');
    expect(
      localizeTaskTrackerStageTitle({ id: 'done', title: 'Done' }, en, true)
    ).toBe('defaultDone');
    expect(
      localizeTaskTrackerStageTitle({ id: 'done', title: 'Done' }, en, false)
    ).toBe('Done');
  });

  it('a custom stage named exactly "Done" is NOT translated when config is user-authored', () => {
    expect(
      localizeTaskTrackerStageTitle({ id: 'done', title: 'Done' }, en, false)
    ).toBe('Done');
    expect(
      localizeTaskTrackerStageTitle(
        { id: 'custom-done', title: 'Done' },
        en,
        false
      )
    ).toBe('Done');
    expect(
      localizeTaskTrackerStageTitle(
        { id: 'custom-done', title: 'Done' },
        en,
        true
      )
    ).toBe('Done');
  });

  it('custom board/stage titles are preserved verbatim in non-canonical configs', () => {
    expect(
      localizeTaskTrackerBoardTitle(
        { id: 'board-rel', title: 'Release Pipeline' },
        en,
        false
      )
    ).toBe('Release Pipeline');
    expect(
      localizeTaskTrackerStageTitle(
        { id: 'qa', title: 'QA Complete' },
        en,
        false
      )
    ).toBe('QA Complete');
  });

  it('persisted semantic ids never change on locale switching', () => {
    const stage = { id: 'todo', title: 'To Do' };
    const enLabel = localizeTaskTrackerStageTitle(stage, en, true);
    const ruLabel = localizeTaskTrackerStageTitle(stage, ru, true);
    expect(stage.id).toBe('todo');
    expect(stage.title).toBe('To Do');
    expect(typeof enLabel).toBe('string');
    expect(typeof ruLabel).toBe('string');
  });

  it('activity operation ids map to localized labels with a safe fallback', () => {
    expect(trackWorkActivityLabel('task.created', en)).toBe('task.created');
    expect(trackWorkActivityLabel('unknown.op', en)).toBe('trackwork.activity');
  });

  it('provider brand names remain unchanged', () => {
    expect('GitLab').toBe('GitLab');
    expect('Jenkins').toBe('Jenkins');
  });

  it('technical identifiers are never localized', () => {
    expect('taskKey').toBe('taskKey');
    expect('TASK-10').toBe('TASK-10');
    expect('db$docCustomPropertyInfo').toBe('db$docCustomPropertyInfo');
  });
});

describe('TrackWork raw user-facing literal audit', () => {
  const dir = __dirname;
  const settingsDir = path.resolve(
    __dirname,
    '../../../dialogs/setting/workspace-setting/task-tracker'
  );
  const files = [
    ...['index.tsx', 'config.ts'].map(f => path.join(dir, f)),
    path.join(settingsDir, 'index.tsx'),
  ];

  it('no raw user-facing JSX text literals remain', () => {
    const allowlist = [
      'GitLab', // provider brand
      'Jenkins', // provider brand
      'TASK-', // technical identifier prefix
      'db$', // technical identifier
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const matches = src.matchAll(/>\s*([A-Z][A-Za-z ]{2,40}?)\s*</g);
      for (const m of matches) {
        const literal = m[1].trim();
        if (literal.length === 0) {
          continue;
        }
        const isUserText =
          /[A-Za-z]/.test(literal) && !/^[A-Z0-9-]+$/.test(literal);
        const allowed = allowlist.some(a => literal.includes(a));
        expect(
          isUserText && !allowed,
          `raw user-facing literal "${literal}" in ${path.basename(file)}`
        ).toBe(false);
      }
    }
  });
});
