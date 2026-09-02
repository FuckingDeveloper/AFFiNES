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
  buildTaskActivityEntry,
  parseAttachments,
  parseHistoryEntries,
  stringifyHistoryEntries,
  parseRelatedDocs,
  parseSubtasks,
  parseTaskRelations,
  resolveTaskTrackerBoards,
  sanitizeAutomationRules,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_TITLE,
  DEFAULT_FLOW,
} from '@affine/core/desktop/pages/workspace/task-tracker/config';
import type {
  TaskTrackerAutomationEventType,
  TaskTrackerPropertyAdditionalData,
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

describe('resolves persisted workspace Task Tracker configuration', () => {
  const persistedConfig: TaskTrackerPropertyAdditionalData = {
    taskTrackerBoards: [
      {
        id: 'default',
        title: 'Main board',
        flow: [
          { id: 'todo', title: 'To Do' },
          { id: 'in-progress', title: 'In Progress' },
          { id: 'done', title: 'Done' },
        ],
        transitions: {
          todo: ['todo', 'in-progress'],
          'in-progress': ['in-progress', 'done'],
          done: ['done'],
        },
        typeTransitions: {
          task: { todo: ['todo', 'done'] },
        },
      },
      {
        id: 'board-2',
        title: 'Release board',
        flow: [
          { id: 'todo', title: 'To Do' },
          { id: 'qa', title: 'QA Testing' },
          { id: 'done', title: 'Done' },
        ],
        transitions: {
          todo: ['todo', 'qa'],
          qa: ['qa', 'done'],
          done: ['done', 'todo'],
        },
      },
    ],
    taskTrackerAutomationRules: [
      {
        id: 'rule-1',
        eventType: 'merge_request.merged',
        action: 'set-status',
        stageId: 'done',
        enabled: true,
      },
      {
        id: 'rule-2',
        eventType: 'pipeline.failed',
        action: 'warning',
        enabled: false,
      },
      {
        id: 'rule-3',
        eventType: 'totally.invalid' as TaskTrackerAutomationEventType,
        action: 'set-status',
        stageId: 'done',
        enabled: true,
      },
      {
        id: 'rule-1',
        eventType: 'commit.pushed',
        action: 'warning',
        enabled: true,
      },
    ],
  };

  it('preserves board and stage identity and user-authored names', () => {
    const boards = resolveTaskTrackerBoards(persistedConfig);

    expect(boards).toHaveLength(2);
    expect(boards[0].id).toBe('default');
    expect(boards[0].title).toBe('Main board');
    expect(boards[0].flow.map(stage => stage.id)).toEqual([
      'todo',
      'in-progress',
      'done',
    ]);
    expect(boards[0].flow.map(stage => stage.title)).toEqual([
      'To Do',
      'In Progress',
      'Done',
    ]);

    expect(boards[1].id).toBe('board-2');
    expect(boards[1].title).toBe('Release board');
    expect(boards[1].flow.map(stage => stage.id)).toEqual([
      'todo',
      'qa',
      'done',
    ]);
    expect(boards[1].flow.map(stage => stage.title)).toEqual([
      'To Do',
      'QA Testing',
      'Done',
    ]);
  });

  it('preserves transitions and type transitions after sanitation', () => {
    const boards = resolveTaskTrackerBoards(persistedConfig);

    expect(boards[0].transitions).toEqual({
      todo: ['todo', 'in-progress'],
      'in-progress': ['in-progress', 'done'],
      done: ['done'],
    });
    expect(boards[1].transitions).toEqual({
      todo: ['todo', 'qa'],
      qa: ['qa', 'done'],
      done: ['done', 'todo'],
    });
    expect(boards[0].typeTransitions.task.todo).toEqual(['todo', 'done']);
    expect(boards[0].typeTransitions.story.todo).toEqual([
      'todo',
      'in-progress',
      'done',
    ]);
  });

  it('filters invalid automation rules and deduplicates by id', () => {
    const rules = sanitizeAutomationRules(
      persistedConfig.taskTrackerAutomationRules
    );

    expect(rules).toEqual([
      {
        id: 'rule-1',
        eventType: 'merge_request.merged',
        action: 'set-status',
        stageId: 'done',
        enabled: true,
      },
      {
        id: 'rule-2',
        eventType: 'pipeline.failed',
        action: 'warning',
        stageId: undefined,
        enabled: false,
      },
    ]);
  });

  it('falls back to the real default board for empty or corrupt config', () => {
    const fallback = resolveTaskTrackerBoards(undefined);
    expect(fallback).toHaveLength(1);
    expect(fallback[0].id).toBe(DEFAULT_BOARD_ID);
    expect(fallback[0].title).toBe(DEFAULT_BOARD_TITLE);
    expect(fallback[0].flow).toEqual(DEFAULT_FLOW);

    const empty = resolveTaskTrackerBoards({ taskTrackerBoards: [] });
    expect(empty).toEqual(fallback);

    const corrupt = resolveTaskTrackerBoards({
      taskTrackerBoards: [{ id: '', title: '' }],
    });
    expect(corrupt).toEqual(fallback);
  });

  it('does not mutate the persisted configuration fixture', () => {
    const snapshot = JSON.parse(JSON.stringify(persistedConfig));
    resolveTaskTrackerBoards(persistedConfig);
    sanitizeAutomationRules(persistedConfig.taskTrackerAutomationRules);
    expect(persistedConfig).toEqual(snapshot);
  });
});

describe('structured task lifecycle activity', () => {
  it('records actor, entity, structured operation and timestamp on new entries', () => {
    const entry = buildTaskActivityEntry('edited', 'Renamed task to “X”', {
      operation: 'task.renamed',
      actorId: 'user-1',
      actorName: 'Alice',
      taskKey: 'TW-7',
    });

    expect(entry.operation).toBe('task.renamed');
    expect(entry.actorId).toBe('user-1');
    expect(entry.actorName).toBe('Alice');
    expect(entry.taskKey).toBe('TW-7');
    expect(typeof entry.createdAt).toBe('number');
    expect(entry.source).toBe('user');
  });

  it('supports the automation source without an actor', () => {
    const entry = buildTaskActivityEntry('edited', 'Automation moved task', {
      operation: 'task.status_changed',
      taskKey: 'TW-2',
      source: 'automation',
    });
    expect(entry.source).toBe('automation');
    expect(entry.actorId).toBeUndefined();
  });

  it('round-trips structured fields through stringify and parse', () => {
    const entries = [
      buildTaskActivityEntry('created', 'Created in To Do', {
        operation: 'task.created',
        actorId: 'user-1',
        actorName: 'Alice',
        taskKey: 'TW-1',
      }),
    ];
    const parsed = parseHistoryEntries(stringifyHistoryEntries(entries));

    expect(parsed[0]).toMatchObject({
      operation: 'task.created',
      actorId: 'user-1',
      actorName: 'Alice',
      taskKey: 'TW-1',
    });
  });

  it('keeps legacy history entries readable with structured fields absent', () => {
    const legacy = JSON.stringify([
      {
        id: 'h-1',
        type: 'moved',
        message: 'Moved to In Progress',
        createdAt: 1700000000000,
      },
    ]);
    const parsed = parseHistoryEntries(legacy);

    expect(parsed).toEqual([
      {
        id: 'h-1',
        type: 'moved',
        message: 'Moved to In Progress',
        createdAt: 1700000000000,
        operation: undefined,
        actorId: undefined,
        actorName: undefined,
        taskKey: undefined,
        source: undefined,
      },
    ]);
  });

  it('degrades malformed structured fields safely', () => {
    const malformed = JSON.stringify([
      {
        id: 'h-2',
        type: 'edited',
        message: 'Changed priority',
        createdAt: 1700000000000,
        operation: 123,
        actorId: { evil: true },
        source: 'robot',
      },
    ]);
    const parsed = parseHistoryEntries(malformed);

    expect(parsed[0].operation).toBeUndefined();
    expect(parsed[0].actorId).toBeUndefined();
    expect(parsed[0].source).toBeUndefined();
  });

  it('does not rewrite legacy history merely by reading it', () => {
    const legacy =
      '[{"id":"h-1","type":"created","message":"Created in To Do","createdAt":1700000000000}]';
    const parsed = parseHistoryEntries(legacy);

    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('h-1');
    expect(parsed[0].message).toBe('Created in To Do');
  });
});
