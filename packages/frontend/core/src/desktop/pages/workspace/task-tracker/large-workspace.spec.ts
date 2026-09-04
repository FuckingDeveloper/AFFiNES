import { describe, expect, it } from 'vitest';

import type { TaskTrackerPropertyAdditionalData } from '@affine/core/desktop/pages/workspace/task-tracker/config';
import {
  buildTaskActivityEntry,
  parseHistoryEntries,
  parseSubtasks,
  parseTaskRelations,
  resolveTaskTrackerBoards,
  sanitizeAutomationRules,
  stringifySubtasks,
  stringifyTaskRelations,
} from '@affine/core/desktop/pages/workspace/task-tracker/config';

const STAGE_IDS = ['backlog', 'ready', 'dev', 'qa', 'review', 'done'];

const workflowConfig = {
  taskTrackerBoards: [
    {
      id: 'board-main',
      title: 'Main delivery board',
      flow: STAGE_IDS.map(id => ({ id, title: id.toUpperCase() })),
      transitions: {
        backlog: ['backlog', 'ready'],
        ready: ['ready', 'dev'],
        dev: ['dev', 'qa'],
        qa: ['qa', 'review', 'dev'],
        review: ['review', 'done', 'qa'],
        done: ['done'],
      },
      typeTransitions: {
        bug: { qa: ['qa', 'dev'], review: ['review', 'qa'] },
      },
    },
  ],
  taskTrackerAutomationRules: [
    {
      id: 'r1',
      eventType: 'merge_request.merged',
      action: 'set-status',
      stageId: 'done',
      enabled: true,
    },
    {
      id: 'r2',
      eventType: 'pipeline.failed',
      action: 'warning',
      enabled: true,
    },
    {
      id: 'r3',
      eventType: 'merge_request.opened',
      action: 'set-status',
      stageId: 'qa',
      enabled: false,
    },
  ],
} satisfies TaskTrackerPropertyAdditionalData;

const TASK_COUNT = 500;
const STAGE_DISTRIBUTION: Record<string, number> = {
  backlog: 80,
  ready: 60,
  dev: 120,
  qa: 90,
  review: 70,
  done: 80,
};
const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type TaskRecord = {
  id: string;
  number: number;
  key: string;
  boardId: string;
  status: string;
  type: string;
  priority: string;
  order: number;
  title: string;
  labelIds: string[];
  assignee: string | null;
  taskHistory?: string;
  relations?: string;
  subtasks?: string;
};

const buildTasks = (): TaskRecord[] => {
  const tasks: TaskRecord[] = [];
  const stageQueue: string[] = [];
  STAGE_IDS.forEach(stage => {
    for (let j = 0; j < STAGE_DISTRIBUTION[stage]; j += 1) {
      stageQueue.push(stage);
    }
  });
  for (let i = 0; i < TASK_COUNT; i += 1) {
    const n = i + 1;
    const stage = stageQueue[i];
    const task: TaskRecord = {
      id: `large-task-${String(n).padStart(4, '0')}`,
      number: n,
      key: `TASK-${n}`,
      boardId: 'board-main',
      status: stage,
      type: ['story', 'bug', 'task'][i % 3],
      priority: ['low', 'medium', 'high', 'urgent'][i % 4],
      order: i % 7,
      title: `Task ${n}`,
      labelIds: [`label-${i % 3}`],
      assignee: i % 3 === 0 ? 'alice' : i % 3 === 1 ? 'bob' : null,
    };
    if (n % 10 === 0) {
      task.taskHistory = JSON.stringify([
        buildTaskActivityEntry('created', `Task ${n} created`, {
          operation: 'task.created',
          actorId: 'u1',
          actorName: 'A',
          taskKey: task.key,
          source: 'user',
        }),
        buildTaskActivityEntry('moved', `Task ${n} moved to ${stage}`, {
          operation: 'task.status_changed',
          actorId: 'u2',
          actorName: 'B',
          taskKey: task.key,
          source: 'user',
        }),
        buildTaskActivityEntry('edited', `Task ${n} updated`, {
          operation: 'task.relation_changed',
          actorId: 'u1',
          actorName: 'A',
          taskKey: task.key,
          source: 'automation',
        }),
      ]);
    }
    if (n % 5 === 0) {
      task.relations = stringifyTaskRelations({
        parentId:
          n % 10 === 0
            ? `large-task-${String(n - 10).padStart(4, '0')}`
            : undefined,
        blockedBy:
          n % 4 === 0 ? [`large-task-${String(n + 1).padStart(4, '0')}`] : [],
        relatesTo: [],
        duplicates: [],
      });
    }
    if (n % 20 === 0) {
      task.subtasks = stringifySubtasks([
        { id: `sub-${n}-1`, title: `Subtask A of ${n}`, done: false },
        { id: `sub-${n}-2`, title: `Subtask B of ${n}`, done: true },
      ]);
    }
    tasks.push(task);
  }
  return tasks;
};

describe('large workspace frontend data handling (500 tasks)', () => {
  it('classifies, groups and sorts hundreds of tasks without duplication', () => {
    const tasks = buildTasks();
    const boards = resolveTaskTrackerBoards(workflowConfig);
    expect(boards.length).toBe(1);
    expect(boards[0].flow.map(s => s.id)).toEqual(STAGE_IDS);
    expect(boards[0].transitions.qa).toEqual(['qa', 'review', 'dev']);
    expect(boards[0].typeTransitions.bug.review).toEqual(['review', 'qa']);

    const flow = boards[0].flow;
    const grouped = new Map<string, TaskRecord[]>();
    flow.forEach(column => grouped.set(column.id, []));
    const fallbackColumnId = flow[0].id;

    const start = Date.now();
    tasks.forEach(task => {
      const columnId = grouped.has(task.status)
        ? task.status
        : fallbackColumnId;
      const target = grouped.get(columnId);
      if (target) {
        target.push(task);
      }
    });
    void fallbackColumnId;
    grouped.forEach(columnTasks => {
      columnTasks.sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        if (a.priority !== b.priority) {
          return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        }
        return a.title.localeCompare(b.title, 'en');
      });
    });
    const classifyMs = Date.now() - start;

    let total = 0;
    STAGE_IDS.forEach(stage => {
      expect(grouped.get(stage)?.length).toBe(STAGE_DISTRIBUTION[stage]);
      total += grouped.get(stage)?.length ?? 0;
    });
    expect(total).toBe(TASK_COUNT);
    expect(new Set(tasks.map(t => t.id)).size).toBe(TASK_COUNT);

    const columnIds = grouped.get('dev') ?? [];
    for (let i = 1; i < columnIds.length; i += 1) {
      const prev = columnIds[i - 1];
      const curr = columnIds[i];
      const orderOk = curr.order > prev.order;
      const priorityOk =
        curr.order === prev.order &&
        PRIORITY_WEIGHT[curr.priority] >= PRIORITY_WEIGHT[prev.priority];
      expect(orderOk || priorityOk).toBe(true);
    }

    const startFilter = Date.now();
    const urgentBugs = tasks.filter(
      t => t.priority === 'urgent' && t.type === 'bug'
    );
    const filterMs = Date.now() - startFilter;
    expect(urgentBugs.length).toBe(42);

    console.log(
      `large-workspace frontend: classify+sort ${TASK_COUNT} tasks=${classifyMs}ms filter=${filterMs}ms`
    );
  });

  it('parses populated history and relations for bounded subsets', () => {
    const tasks = buildTasks();
    const withHistory = tasks.filter(t => t.taskHistory);
    expect(withHistory.length).toBe(50);

    const startHistory = Date.now();
    const parsed = withHistory.flatMap(t => parseHistoryEntries(t.taskHistory));
    const historyMs = Date.now() - startHistory;
    expect(parsed.length).toBe(150);
    expect(new Set(parsed.map(e => e.operation)).size).toBe(3);
    expect(
      parsed.every(e =>
        [
          'task.created',
          'task.status_changed',
          'task.relation_changed',
        ].includes(e.operation ?? '')
      )
    ).toBe(true);

    const withRelations = tasks.filter(t => t.relations);
    expect(withRelations.length).toBe(100);
    const relations = withRelations.map(t =>
      parseTaskRelations(t.relations ?? '')
    );
    expect(
      relations.every(r => !r.parentId || r.parentId.startsWith('large-task-'))
    ).toBe(true);
    expect(relations.filter(r => r.blockedBy.length > 0).length).toBe(25);

    const withSubtasks = tasks.filter(t => t.subtasks);
    expect(withSubtasks.length).toBe(25);
    expect(
      withSubtasks.every(t => parseSubtasks(t.subtasks).length === 2)
    ).toBe(true);

    const rules = sanitizeAutomationRules(
      workflowConfig.taskTrackerAutomationRules
    );
    expect(rules.length).toBe(3);
    expect(rules[0].stageId).toBe('done');

    console.log(
      `large-workspace frontend: history parse 50 tasks=${historyMs}ms`
    );
  });
});
