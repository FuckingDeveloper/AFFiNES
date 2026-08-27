import { describe, expect, it } from 'vitest';

import type { TaskTrackerAutomationRule, TaskTrackerBoard } from './config';
import { applyAutomationRules, type AutomationEvent } from './automation';

type AutomationTask = { docId: string; board?: TaskTrackerBoard };

const board: TaskTrackerBoard = {
  id: 'board-1',
  title: 'Main',
  flow: [
    { id: 'todo', title: 'To Do' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'review', title: 'Review' },
    { id: 'done', title: 'Done' },
  ],
  transitions: {},
  typeTransitions: {
    story: {},
    task: {},
    bug: {},
    epic: {},
  },
};

const rule = (
  overrides: Partial<TaskTrackerAutomationRule>
): TaskTrackerAutomationRule => ({
  id: 'rule-1',
  eventType: 'merge_request.merged',
  action: 'set-status',
  stageId: 'review',
  enabled: true,
  ...overrides,
});

const event = (overrides: Partial<AutomationEvent>): AutomationEvent => ({
  id: 'evt-1',
  eventType: 'merge_request.merged',
  taskKey: 'TW-142',
  ...overrides,
});

const taskByKey: Map<string, AutomationTask> = new Map<string, AutomationTask>([
  ['TW-142', { docId: 'doc-142', board }],
  ['TW-143', { docId: 'doc-143', board }],
]);

describe('applyAutomationRules', () => {
  it('sets the target stage when the rule matches', () => {
    const result = applyAutomationRules(
      [rule({})],
      [event({})],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([
      { taskDocId: 'doc-142', stageId: 'review' },
    ]);
    expect(result.appliedEventIds).toEqual(['evt-1']);
  });

  it('does not re-apply already handled events', () => {
    const result = applyAutomationRules(
      [rule({})],
      [event({}), event({ id: 'evt-2' })],
      new Set(['evt-1']),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([
      { taskDocId: 'doc-142', stageId: 'review' },
    ]);
    expect(result.appliedEventIds).toEqual(['evt-2']);
  });

  it('ignores disabled rules', () => {
    const result = applyAutomationRules(
      [rule({ enabled: false })],
      [event({})],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([]);
    expect(result.appliedEventIds).toEqual([]);
  });

  it('ignores events without a matching task', () => {
    const result = applyAutomationRules(
      [rule({})],
      [event({ taskKey: 'TW-999' })],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([]);
  });

  it('skips set-status when the target stage is missing from the board', () => {
    const result = applyAutomationRules(
      [rule({ stageId: 'nonexistent' })],
      [event({})],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([]);
    expect(result.appliedEventIds).toEqual(['evt-1']);
  });

  it('collects warning events without status changes', () => {
    const result = applyAutomationRules(
      [rule({ eventType: 'pipeline.failed', action: 'warning' })],
      [event({ eventType: 'pipeline.failed' })],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([]);
    expect(result.warningEvents).toEqual([
      event({ eventType: 'pipeline.failed' }),
    ]);
    expect(result.appliedEventIds).toEqual(['evt-1']);
  });

  it('matches only the configured event type', () => {
    const result = applyAutomationRules(
      [rule({})],
      [event({ eventType: 'merge_request.opened' })],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([]);
    expect(result.appliedEventIds).toEqual([]);
  });

  it('applies rules to every task referenced by its events', () => {
    const result = applyAutomationRules(
      [rule({})],
      [event({ id: 'evt-1' }), event({ id: 'evt-2', taskKey: 'TW-143' })],
      new Set(),
      taskByKey
    );

    expect(result.statusUpdates).toEqual([
      { taskDocId: 'doc-142', stageId: 'review' },
      { taskDocId: 'doc-143', stageId: 'review' },
    ]);
  });
});
