import { describe, expect, it } from 'vitest';

import {
  parseTaskRelations,
  stringifyTaskRelations,
  wouldCreateTaskCycle,
  type TaskRelations,
} from './config';

describe('task relations storage', () => {
  it('round-trips relations', () => {
    const relations: TaskRelations = {
      parentId: 'task-1',
      blockedBy: ['task-2'],
      relatesTo: ['task-3'],
      duplicates: [],
    };

    expect(parseTaskRelations(stringifyTaskRelations(relations))).toEqual(
      relations
    );
  });

  it('returns empty relations for missing values', () => {
    expect(parseTaskRelations(undefined)).toEqual({
      parentId: undefined,
      blockedBy: [],
      relatesTo: [],
      duplicates: [],
    });
  });

  it('ignores malformed values', () => {
    expect(parseTaskRelations('not-json')).toEqual({
      parentId: undefined,
      blockedBy: [],
      relatesTo: [],
      duplicates: [],
    });
    expect(
      parseTaskRelations('{"blockedBy": [1, "x"], "parentId": 5}')
    ).toEqual({
      parentId: undefined,
      blockedBy: ['x'],
      relatesTo: [],
      duplicates: [],
    });
  });

  it('deduplicates relation ids', () => {
    const relations: TaskRelations = {
      parentId: undefined,
      blockedBy: ['a', 'a'],
      relatesTo: [],
      duplicates: [],
    };

    expect(
      parseTaskRelations(stringifyTaskRelations(relations)).blockedBy
    ).toEqual(['a']);
  });
});

describe('wouldCreateTaskCycle', () => {
  const parents: Record<string, string> = {
    'task-2': 'task-1',
    'task-3': 'task-2',
  };

  const getParent = (id: string) => parents[id];

  it('detects a direct cycle', () => {
    expect(wouldCreateTaskCycle('task-1', 'task-1', getParent)).toBe(true);
  });

  it('detects an indirect cycle', () => {
    expect(wouldCreateTaskCycle('task-1', 'task-3', getParent)).toBe(true);
  });

  it('allows a safe parent assignment', () => {
    expect(wouldCreateTaskCycle('task-4', 'task-3', getParent)).toBe(false);
    expect(wouldCreateTaskCycle('task-1', 'task-4', getParent)).toBe(false);
  });
});
