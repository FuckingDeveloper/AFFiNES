export type TaskFlowColumn = {
  id: string;
  title: string;
};

export type TaskFlowTransitions = Record<string, string[]>;
export type TaskType = 'story' | 'bug' | 'task' | 'epic';
export type TaskTypeTransitions = Record<TaskType, TaskFlowTransitions>;

export type TaskTrackerBoardConfig = {
  id: string;
  title: string;
  flow?: TaskFlowColumn[];
  transitions?: TaskFlowTransitions;
  typeTransitions?: Partial<TaskTypeTransitions>;
};

export type TaskTrackerBoard = {
  id: string;
  title: string;
  flow: TaskFlowColumn[];
  transitions: TaskFlowTransitions;
  typeTransitions: TaskTypeTransitions;
};

export type TaskTrackerAutomationEventType =
  | 'merge_request.opened'
  | 'merge_request.updated'
  | 'merge_request.merged'
  | 'pipeline.success'
  | 'pipeline.failed'
  | 'pipeline.unstable'
  | 'commit.pushed';

export type TaskTrackerAutomationAction = 'set-status' | 'warning';

export type TaskTrackerAutomationRule = {
  id: string;
  eventType: TaskTrackerAutomationEventType;
  action: TaskTrackerAutomationAction;
  stageId?: string;
  enabled: boolean;
};

export type TaskTrackerPropertyAdditionalData = {
  taskTrackerBoards?: TaskTrackerBoardConfig[];
  taskTrackerFlow?: TaskFlowColumn[];
  taskTrackerTransitions?: TaskFlowTransitions;
  taskTrackerAutomationRules?: TaskTrackerAutomationRule[];
};

export type TaskAttachment = {
  id: string;
  name: string;
  mime?: string;
  size?: number;
  createdAt?: number;
};

export type TaskComplexity = 'trivial' | 'easy' | 'medium' | 'hard' | 'extreme';

export type TaskSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskHistoryEntry = {
  id: string;
  type: 'created' | 'edited' | 'moved';
  message: string;
  createdAt: number;
};

export const TASK_TRACKER_FLAG_PROPERTY = 'taskTrackerEnabled';
export const TASK_BOARD_PROPERTY = 'taskBoardId';
export const TASK_STATUS_PROPERTY = 'taskStatus';
export const TASK_PRIORITY_PROPERTY = 'taskPriority';
export const TASK_TYPE_PROPERTY = 'taskType';
export const TASK_ASSIGNEE_PROPERTY = 'taskAssignee';
export const TASK_DUE_DATE_PROPERTY = 'taskDueDate';
export const TASK_ORDER_PROPERTY = 'taskOrder';
export const TASK_DESCRIPTION_PROPERTY = 'taskDescription';
export const TASK_EXTRA_INFO_PROPERTY = 'taskExtraInfo';
export const TASK_ATTACHMENTS_PROPERTY = 'taskAttachments';
export const TASK_NUMBER_PROPERTY = 'taskNumber';
export const TASK_AUTOMATION_APPLIED_PROPERTY = 'taskAutomationAppliedEvents';
export const TASK_COMPLEXITY_PROPERTY = 'taskComplexity';
export const TASK_SUBTASKS_PROPERTY = 'taskSubtasks';
export const TASK_HISTORY_PROPERTY = 'taskHistory';

export const DEFAULT_FLOW: TaskFlowColumn[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export const DEFAULT_BOARD_ID = 'default';
export const DEFAULT_BOARD_TITLE = 'Main board';
export const TASK_TYPES: TaskType[] = ['story', 'bug', 'task', 'epic'];

export const sanitizeFlow = (
  flow: TaskFlowColumn[] | undefined,
  fallback: TaskFlowColumn[] = DEFAULT_FLOW
): TaskFlowColumn[] => {
  if (!Array.isArray(flow) || flow.length === 0) {
    return fallback;
  }

  const sanitized = flow
    .filter(column => column?.id && column?.title)
    .map(column => ({
      id: column.id,
      title: column.title,
    }));

  return sanitized.length > 0 ? sanitized : fallback;
};

export const buildDefaultTransitions = (
  flow: TaskFlowColumn[]
): TaskFlowTransitions => {
  const ids = flow.map(column => column.id);
  return Object.fromEntries(ids.map(id => [id, [...ids]]));
};

export const sanitizeTransitions = (
  flow: TaskFlowColumn[],
  transitions?: TaskFlowTransitions
): TaskFlowTransitions => {
  const ids = flow.map(column => column.id);
  const validIdSet = new Set(ids);
  const defaults = buildDefaultTransitions(flow);

  if (!transitions) {
    return defaults;
  }

  return Object.fromEntries(
    ids.map(id => {
      const value = transitions[id];
      if (!Array.isArray(value)) {
        return [id, defaults[id]];
      }

      const filtered = value.filter(targetId => validIdSet.has(targetId));
      return [id, filtered];
    })
  );
};

export const buildDefaultTypeTransitions = (
  flow: TaskFlowColumn[]
): TaskTypeTransitions => {
  return Object.fromEntries(
    TASK_TYPES.map(type => [type, buildDefaultTransitions(flow)])
  ) as TaskTypeTransitions;
};

export const sanitizeTypeTransitions = (
  flow: TaskFlowColumn[],
  typeTransitions?: Partial<TaskTypeTransitions>
): TaskTypeTransitions => {
  const defaults = buildDefaultTypeTransitions(flow);
  if (!typeTransitions) {
    return defaults;
  }

  return Object.fromEntries(
    TASK_TYPES.map(type => [
      type,
      sanitizeTransitions(flow, typeTransitions[type] ?? defaults[type]),
    ])
  ) as TaskTypeTransitions;
};

export const parseAttachments = (value?: string): TaskAttachment[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const next = item as Record<string, unknown>;
        return {
          id: String(next.id ?? ''),
          name: String(next.name ?? 'attachment'),
          mime: typeof next.mime === 'string' ? next.mime : undefined,
          size: typeof next.size === 'number' ? next.size : undefined,
          createdAt:
            typeof next.createdAt === 'number' ? next.createdAt : undefined,
        };
      })
      .filter(item => item.id.length > 0);
  } catch {
    return [];
  }
};

export const stringifyAttachments = (attachments: TaskAttachment[]): string => {
  return JSON.stringify(attachments);
};

export const parseSubtasks = (value?: string): TaskSubtask[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const next = item as Record<string, unknown>;
        return {
          id: String(next.id ?? ''),
          title: String(next.title ?? '').trim(),
          done: Boolean(next.done),
        };
      })
      .filter(item => item.id.length > 0 && item.title.length > 0);
  } catch {
    return [];
  }
};

export const stringifySubtasks = (subtasks: TaskSubtask[]): string => {
  return JSON.stringify(subtasks);
};

export const parseHistoryEntries = (value?: string): TaskHistoryEntry[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const next = item as Record<string, unknown>;
        return {
          id: String(next.id ?? ''),
          type:
            next.type === 'created' ||
            next.type === 'edited' ||
            next.type === 'moved'
              ? next.type
              : 'edited',
          message: String(next.message ?? '').trim(),
          createdAt:
            typeof next.createdAt === 'number' ? next.createdAt : Date.now(),
        } as TaskHistoryEntry;
      })
      .filter(item => item.id.length > 0 && item.message.length > 0)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
};

export const stringifyHistoryEntries = (
  history: TaskHistoryEntry[]
): string => {
  return JSON.stringify(history);
};

const sanitizeBoardTitle = (title: string | undefined, fallback: string) => {
  const next = title?.trim();
  return next && next.length > 0 ? next : fallback;
};

export const resolveTaskTrackerBoards = (
  additionalData?: TaskTrackerPropertyAdditionalData
): TaskTrackerBoard[] => {
  const fallbackFlow = sanitizeFlow(additionalData?.taskTrackerFlow);
  const fallbackTransitions = sanitizeTransitions(
    fallbackFlow,
    additionalData?.taskTrackerTransitions
  );

  const fallbackBoard: TaskTrackerBoard = {
    id: DEFAULT_BOARD_ID,
    title: DEFAULT_BOARD_TITLE,
    flow: fallbackFlow,
    transitions: fallbackTransitions,
    typeTransitions: sanitizeTypeTransitions(fallbackFlow, undefined),
  };

  const rawBoards = additionalData?.taskTrackerBoards;
  if (!Array.isArray(rawBoards) || rawBoards.length === 0) {
    return [fallbackBoard];
  }

  const seenIds = new Set<string>();
  const boards = rawBoards
    .filter(board => board?.id)
    .map((board, index) => {
      const flow = sanitizeFlow(board.flow, fallbackFlow);
      return {
        id: board.id,
        title: sanitizeBoardTitle(board.title, `Board ${index + 1}`),
        flow,
        transitions: sanitizeTransitions(flow, board.transitions),
        typeTransitions: sanitizeTypeTransitions(flow, board.typeTransitions),
      };
    })
    .filter(board => {
      if (seenIds.has(board.id)) {
        return false;
      }
      seenIds.add(board.id);
      return true;
    });

  return boards.length > 0 ? boards : [fallbackBoard];
};

export const AUTOMATION_EVENT_TYPES: TaskTrackerAutomationEventType[] = [
  'merge_request.opened',
  'merge_request.updated',
  'merge_request.merged',
  'pipeline.success',
  'pipeline.failed',
  'pipeline.unstable',
  'commit.pushed',
];

export const sanitizeAutomationRules = (
  rules: TaskTrackerAutomationRule[] | undefined
): TaskTrackerAutomationRule[] => {
  if (!Array.isArray(rules)) {
    return [];
  }

  const seenIds = new Set<string>();

  return rules
    .filter(rule => rule?.id)
    .filter(rule => AUTOMATION_EVENT_TYPES.includes(rule.eventType))
    .filter(rule => rule.action === 'set-status' || rule.action === 'warning')
    .filter(rule => {
      if (seenIds.has(rule.id)) {
        return false;
      }
      seenIds.add(rule.id);
      return true;
    })
    .map(rule => ({
      id: rule.id,
      eventType: rule.eventType,
      action: rule.action,
      stageId: rule.action === 'set-status' ? rule.stageId : undefined,
      enabled: rule.enabled !== false,
    }));
};
