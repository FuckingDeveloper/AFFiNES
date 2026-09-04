import { BadRequest } from '../../base/error/errors.gen';

export type TrackWorkStage = { id: string; title: string };

export type TrackWorkBoard = {
  id: string;
  title: string;
  flow?: TrackWorkStage[];
  transitions?: Record<string, string[]>;
  typeTransitions?: Partial<Record<string, Record<string, string[]>>>;
};

export type TrackWorkAutomationRule = {
  id: string;
  eventType: string;
  action: 'set-status' | 'warning';
  stageId?: string;
  enabled: boolean;
};

export type TrackWorkWorkflowConfigValue = {
  taskTrackerBoards: TrackWorkBoard[];
  taskTrackerAutomationRules?: TrackWorkAutomationRule[];
};

const SUPPORTED_EVENT_TYPES = new Set([
  'merge_request.opened',
  'merge_request.updated',
  'merge_request.merged',
  'pipeline.success',
  'pipeline.failed',
  'pipeline.unstable',
  'commit.pushed',
]);

const SUPPORTED_ACTIONS = new Set(['set-status', 'warning']);

const MAX_BOARDS = 20;
const MAX_STAGES_PER_BOARD = 30;
const MAX_RULES = 50;
const MAX_TRANSITIONS_PER_STAGE = 50;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 200;
const MAX_AUTOMATION_ID_LENGTH = 255;
// Aggregate bound: complements the per-item limits so the persisted JSONB
// payload cannot become an unbounded/abusive document.
const MAX_WORKFLOW_CONFIG_BYTES = 1024 * 1024;
// Identifiers that would act as prototype keys on normalized plain objects;
// explicitly rejected rather than silently dropped.
const RESERVED_IDENTIFIERS = new Set(['__proto__', 'prototype', 'constructor']);

const boundedIdentifier = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_ID_LENGTH ||
    RESERVED_IDENTIFIERS.has(normalized)
  ) {
    return null;
  }
  return normalized;
};

const boundedTitle = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_TITLE_LENGTH) {
    return null;
  }
  return normalized;
};

const validateTransitions = (
  stageIds: Set<string>,
  value: unknown
): Record<string, string[]> | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, string[]> = {};
  for (const [from, targets] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!stageIds.has(from)) {
      return null;
    }
    if (
      !Array.isArray(targets) ||
      targets.length > MAX_TRANSITIONS_PER_STAGE ||
      !targets.every(
        target => typeof target === 'string' && stageIds.has(target)
      )
    ) {
      return null;
    }
    result[from] = targets as string[];
  }
  return result;
};

export function validateWorkflowConfig(value: unknown): {
  config: TrackWorkWorkflowConfigValue;
  errors: string[];
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      config: { taskTrackerBoards: [] },
      errors: ['config must be an object'],
    };
  }

  const input = value as Record<string, unknown>;
  const errors: string[] = [];

  if (
    Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_WORKFLOW_CONFIG_BYTES
  ) {
    errors.push(
      `workflow configuration exceeds the ${MAX_WORKFLOW_CONFIG_BYTES}-byte size limit`
    );
    return { config: { taskTrackerBoards: [] }, errors };
  }

  const boardsValue = input.taskTrackerBoards;
  if (!Array.isArray(boardsValue) || boardsValue.length > MAX_BOARDS) {
    errors.push(
      `taskTrackerBoards must be an array of at most ${MAX_BOARDS} boards`
    );
    return { config: { taskTrackerBoards: [] }, errors };
  }

  const boardIds = new Set<string>();
  const boards: TrackWorkBoard[] = [];

  for (const rawBoard of boardsValue) {
    if (rawBoard === null || typeof rawBoard !== 'object') {
      errors.push('board must be an object');
      continue;
    }
    const board = rawBoard as Record<string, unknown>;
    const boardId = boundedIdentifier(board.id);
    const title = boundedTitle(board.title);
    if (!boardId || boardIds.has(boardId)) {
      errors.push(
        `board id must be a unique non-empty string of at most ${MAX_ID_LENGTH} chars`
      );
      continue;
    }
    if (!title) {
      errors.push(
        `board ${boardId} title must be a non-empty string of at most ${MAX_TITLE_LENGTH} chars`
      );
      continue;
    }

    const flowValue = board.flow;
    const stageIds = new Set<string>();
    const flow: TrackWorkStage[] = [];
    if (flowValue !== undefined) {
      if (
        !Array.isArray(flowValue) ||
        flowValue.length > MAX_STAGES_PER_BOARD
      ) {
        errors.push(
          `board ${boardId} flow must be an array of at most ${MAX_STAGES_PER_BOARD} stages`
        );
        continue;
      }
      for (const rawStage of flowValue) {
        if (rawStage === null || typeof rawStage !== 'object') {
          errors.push(`board ${boardId} stage must be an object`);
          continue;
        }
        const stage = rawStage as Record<string, unknown>;
        const stageId = boundedIdentifier(stage.id);
        const stageTitle = boundedTitle(stage.title);
        if (!stageId || stageIds.has(stageId)) {
          errors.push(
            `board ${boardId} stage ids must be unique non-empty strings`
          );
          continue;
        }
        if (!stageTitle) {
          errors.push(
            `board ${boardId} stage ${stageId} title must be a non-empty string`
          );
          continue;
        }
        stageIds.add(stageId);
        flow.push({ id: stageId, title: stageTitle });
      }
    }

    const transitionsResult = validateTransitions(stageIds, board.transitions);
    if (transitionsResult === null) {
      errors.push(
        `board ${boardId} transitions must reference existing stages`
      );
      continue;
    }
    const transitions = transitionsResult;

    let typeTransitions: TrackWorkBoard['typeTransitions'];
    const rawTypeTransitions = board.typeTransitions;
    if (rawTypeTransitions !== undefined) {
      if (
        rawTypeTransitions === null ||
        typeof rawTypeTransitions !== 'object'
      ) {
        errors.push(`board ${boardId} typeTransitions must be an object`);
        continue;
      }
      typeTransitions = {};
      for (const [taskType, typeValue] of Object.entries(
        rawTypeTransitions as Record<string, unknown>
      )) {
        const typeTransitionsValue = validateTransitions(stageIds, typeValue);
        if (typeTransitionsValue === null) {
          errors.push(
            `board ${boardId} typeTransitions.${taskType} must reference existing stages`
          );
          continue;
        }
        typeTransitions[taskType] = typeTransitionsValue;
      }
    }

    boardIds.add(boardId);
    boards.push({
      id: boardId,
      title,
      flow: flow.length > 0 ? flow : undefined,
      transitions,
      typeTransitions,
    });
  }

  const rulesValue = input.taskTrackerAutomationRules;
  const rules: TrackWorkAutomationRule[] = [];
  if (rulesValue !== undefined) {
    if (!Array.isArray(rulesValue) || rulesValue.length > MAX_RULES) {
      errors.push(
        `taskTrackerAutomationRules must be an array of at most ${MAX_RULES} rules`
      );
    } else {
      const ruleIds = new Set<string>();
      const allStageIds = new Set(
        boards.flatMap(board => board.flow?.map(stage => stage.id) ?? [])
      );
      for (const rawRule of rulesValue) {
        if (rawRule === null || typeof rawRule !== 'object') {
          errors.push('automation rule must be an object');
          continue;
        }
        const rule = rawRule as Record<string, unknown>;
        const ruleId = boundedIdentifier(rule.id);
        if (
          !ruleId ||
          ruleId.length > MAX_AUTOMATION_ID_LENGTH ||
          ruleIds.has(ruleId)
        ) {
          errors.push('automation rule ids must be unique non-empty strings');
          continue;
        }
        const eventType =
          typeof rule.eventType === 'string' ? rule.eventType : null;
        if (!eventType || !SUPPORTED_EVENT_TYPES.has(eventType)) {
          errors.push(`automation rule ${ruleId} has unsupported event type`);
          continue;
        }
        const action = rule.action;
        if (typeof action !== 'string' || !SUPPORTED_ACTIONS.has(action)) {
          errors.push(`automation rule ${ruleId} has unsupported action`);
          continue;
        }
        if (action === 'set-status') {
          const stageId =
            typeof rule.stageId === 'string' ? rule.stageId : null;
          if (!stageId || !allStageIds.has(stageId)) {
            errors.push(
              `automation rule ${ruleId} set-status must reference an existing stage`
            );
            continue;
          }
        }
        ruleIds.add(ruleId);
        rules.push({
          id: ruleId,
          eventType,
          action: action as 'set-status' | 'warning',
          stageId: typeof rule.stageId === 'string' ? rule.stageId : undefined,
          enabled: rule.enabled === true,
        });
      }
    }
  }

  if (errors.length > 0) {
    return {
      config: { taskTrackerBoards: [], taskTrackerAutomationRules: [] },
      errors,
    };
  }

  return {
    config: {
      taskTrackerBoards: boards,
      taskTrackerAutomationRules: rules.length > 0 ? rules : undefined,
    },
    errors,
  };
}

export function validateWorkflowConfigOrThrow(
  value: unknown
): TrackWorkWorkflowConfigValue {
  const { config, errors } = validateWorkflowConfig(value);
  if (errors.length > 0) {
    throw new BadRequest(
      `Invalid TrackWork workflow configuration: ${errors[0]}`
    );
  }
  return config;
}
