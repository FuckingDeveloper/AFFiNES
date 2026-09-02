import { describe, expect, it } from 'vitest';

import {
  localizeTaskTrackerBoardTitle,
  localizeTaskTrackerStageTitle,
  type TaskTrackerTranslator,
} from '@affine/core/utils/task-tracker-i18n';

const ruLabels: Record<string, string> = {
  defaultBoard: 'Основная доска',
  defaultTodo: 'К выполнению',
  defaultInProgress: 'В работе',
  defaultDone: 'Готово',
};

const t: TaskTrackerTranslator = (key: string) => ruLabels[key] ?? key;

describe('task tracker default labels', () => {
  it('localizes system default stages', () => {
    expect(
      localizeTaskTrackerStageTitle({ id: 'todo', title: 'To Do' }, t)
    ).toBe('К выполнению');
    expect(
      localizeTaskTrackerStageTitle(
        { id: 'in-progress', title: 'In Progress' },
        t
      )
    ).toBe('В работе');
    expect(
      localizeTaskTrackerStageTitle({ id: 'done', title: 'Done' }, t)
    ).toBe('Готово');
  });

  it('keeps renamed default stage titles', () => {
    expect(
      localizeTaskTrackerStageTitle({ id: 'todo', title: 'Очередь' }, t)
    ).toBe('Очередь');
  });

  it('keeps custom stage titles', () => {
    expect(
      localizeTaskTrackerStageTitle({ id: 'custom-1', title: 'QA Testing' }, t)
    ).toBe('QA Testing');
  });

  it('localizes the default board', () => {
    expect(
      localizeTaskTrackerBoardTitle({ id: 'default', title: 'Main board' }, t)
    ).toBe('Основная доска');
  });

  it('keeps renamed and custom board titles', () => {
    expect(
      localizeTaskTrackerBoardTitle(
        { id: 'default', title: 'Release board' },
        t
      )
    ).toBe('Release board');
    expect(
      localizeTaskTrackerBoardTitle(
        { id: 'board-2', title: 'Backend release' },
        t
      )
    ).toBe('Backend release');
  });
});

import {
  parseAttachments,
  parseHistoryEntries,
  parseRelatedDocs,
  parseSubtasks,
  parseTaskRelations,
} from '@affine/core/desktop/pages/workspace/task-tracker/config';

describe('legacy JSON-string task properties remain readable', () => {
  it('parses legacy taskAttachments JSON strings', () => {
    const legacy =
      '[{"id":"att-1","name":"spec.pdf","mime":"application/pdf","size":1024,"createdAt":1700000000000}]';
    expect(parseAttachments(legacy)).toEqual([
      {
        id: 'att-1',
        name: 'spec.pdf',
        mime: 'application/pdf',
        size: 1024,
        createdAt: 1700000000000,
      },
    ]);
    expect(parseAttachments('not-json')).toEqual([]);
    expect(parseAttachments(undefined)).toEqual([]);
  });

  it('parses legacy taskSubtasks JSON strings', () => {
    const legacy =
      '[{"id":"sub-1","title":"Review","done":true},{"id":"sub-2","title":"Merge","done":false}]';
    expect(parseSubtasks(legacy)).toEqual([
      { id: 'sub-1', title: 'Review', done: true },
      { id: 'sub-2', title: 'Merge', done: false },
    ]);
  });

  it('parses legacy taskHistory JSON strings', () => {
    const legacy =
      '[{"id":"h-1","type":"moved","message":"Moved to In Progress","createdAt":1700000000000},{"id":"h-2","type":"edited","message":"Updated description","createdAt":1690000000000}]';
    expect(parseHistoryEntries(legacy)).toEqual([
      {
        id: 'h-1',
        type: 'moved',
        message: 'Moved to In Progress',
        createdAt: 1700000000000,
      },
      {
        id: 'h-2',
        type: 'edited',
        message: 'Updated description',
        createdAt: 1690000000000,
      },
    ]);
  });

  it('parses legacy taskRelatedDocs JSON arrays', () => {
    const legacy = '["doc-a","doc-b","doc-a"]';
    expect(parseRelatedDocs(legacy)).toEqual(['doc-a', 'doc-b', 'doc-a']);
    expect(parseRelatedDocs(undefined)).toEqual([]);
  });

  it('parses legacy taskRelations JSON objects', () => {
    const legacy =
      '{"parentId":"parent-doc","blockedBy":["blocker-doc"],"relatesTo":[],"duplicates":["dup-doc"]}';
    expect(parseTaskRelations(legacy)).toEqual({
      parentId: 'parent-doc',
      blockedBy: ['blocker-doc'],
      relatesTo: [],
      duplicates: ['dup-doc'],
    });
  });

  it('round-trips current serialization through the legacy parsers', () => {
    const related = ['doc-a', 'doc-b'];
    expect(parseRelatedDocs(JSON.stringify(related))).toEqual(related);
    expect(
      parseTaskRelations(
        JSON.stringify({
          blockedBy: ['x'],
          relatesTo: [],
          duplicates: [],
        })
      )
    ).toEqual({
      parentId: undefined,
      blockedBy: ['x'],
      relatesTo: [],
      duplicates: [],
    });
  });
});
