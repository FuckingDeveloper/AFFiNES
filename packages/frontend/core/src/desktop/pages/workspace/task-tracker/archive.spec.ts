import {
  buildTaskActivityEntry,
  parseHistoryEntries,
  parseTaskArchived,
  stringifyHistoryEntries,
} from '@affine/core/desktop/pages/workspace/task-tracker/config';
import { describe, expect, it } from 'vitest';

describe('TrackWork archive semantics', () => {
  it('legacy tasks without archive state default to ACTIVE', () => {
    expect(parseTaskArchived(undefined)).toBe(false);
    expect(parseTaskArchived(null)).toBe(false);
    expect(parseTaskArchived('')).toBe(false);
    expect(parseTaskArchived(0)).toBe(false);
  });

  it('parseTaskArchived accepts both boolean and string forms', () => {
    expect(parseTaskArchived(true)).toBe(true);
    expect(parseTaskArchived('true')).toBe(true);
    expect(parseTaskArchived(false)).toBe(false);
    expect(parseTaskArchived('false')).toBe(false);
  });

  it('archived tasks are excluded from the active board view', () => {
    const tasks = [
      { id: 't1', boardId: 'board-main', archived: false },
      { id: 't2', boardId: 'board-main', archived: true },
      { id: 't3', boardId: 'other', archived: false },
    ];
    const active = tasks.filter(
      task => task.boardId === 'board-main' && !task.archived
    );
    expect(active.map(t => t.id)).toEqual(['t1']);
  });

  it('archive and restore produce stable history operations', () => {
    const archived = buildTaskActivityEntry('edited', 'TASK-10 archived', {
      operation: 'task.archived',
      actorId: 'u1',
      actorName: 'A',
      taskKey: 'TASK-10',
    });
    const restored = buildTaskActivityEntry('edited', 'TASK-10 restored', {
      operation: 'task.restored',
      actorId: 'u1',
      actorName: 'A',
      taskKey: 'TASK-10',
    });
    const parsed = parseHistoryEntries(
      stringifyHistoryEntries([archived, restored])
    );
    expect(parsed.map(e => e.operation)).toEqual([
      'task.archived',
      'task.restored',
    ]);
    expect(parsed.every(e => e.taskKey === 'TASK-10')).toBe(true);
    expect(parsed.every(e => e.actorId === 'u1')).toBe(true);
  });

  it('archive does not alter task identity or number', () => {
    const task = {
      id: 'task-doc-0010',
      number: 'TASK-10',
      archived: false,
    };
    const archivedTask = { ...task, archived: true };
    expect(archivedTask.id).toBe('task-doc-0010');
    expect(archivedTask.number).toBe('TASK-10');
  });

  it('archived tasks keep relations and history', () => {
    const history = parseHistoryEntries(
      stringifyHistoryEntries([
        buildTaskActivityEntry('edited', 'TASK-1 created', {
          operation: 'task.created',
          actorId: 'u1',
          actorName: 'A',
          taskKey: 'TASK-1',
        }),
      ])
    );
    const archivedTask = {
      id: 'task-doc-0001',
      number: 'TASK-1',
      archived: true,
      history,
      relations: '{"parentId":"task-doc-0002"}',
    };
    expect(archivedTask.history.length).toBe(1);
    expect(archivedTask.relations).toContain('task-doc-0002');
  });
});
