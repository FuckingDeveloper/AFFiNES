import type { TaskTrackerAutomationRule, TaskTrackerBoard } from './config';

export type AutomationEvent = {
  id: string;
  eventType: string;
  taskKey: string;
};

export type AutomationApplyResult = {
  statusUpdates: Array<{ taskDocId: string; stageId: string }>;
  warningEvents: Array<AutomationEvent>;
  appliedEventIds: string[];
};

/**
 * Pure automation rule engine. Events are matched against enabled rules and
 * applied idempotently: events already present in `appliedEventIds` are never
 * re-applied. `set-status` rules only fire when the target stage actually
 * exists in the task board flow; stage identity is a stable id, never a title.
 */
export const applyAutomationRules = (
  rules: TaskTrackerAutomationRule[],
  events: AutomationEvent[],
  appliedEventIds: Set<string>,
  taskByKey: Map<string, { docId: string; board?: TaskTrackerBoard }>
): AutomationApplyResult => {
  const result: AutomationApplyResult = {
    statusUpdates: [],
    warningEvents: [],
    appliedEventIds: [],
  };

  for (const event of events) {
    if (appliedEventIds.has(event.id)) {
      continue;
    }

    const task = taskByKey.get(event.taskKey);

    if (!task) {
      continue;
    }

    const matchingRules = rules.filter(
      rule => rule.enabled && rule.eventType === event.eventType
    );

    if (matchingRules.length === 0) {
      continue;
    }

    for (const rule of matchingRules) {
      if (rule.action === 'set-status' && rule.stageId) {
        const flow = task.board?.flow ?? [];
        if (flow.some(stage => stage.id === rule.stageId)) {
          result.statusUpdates.push({
            taskDocId: task.docId,
            stageId: rule.stageId,
          });
        }
      } else if (rule.action === 'warning') {
        result.warningEvents.push(event);
      }
    }

    result.appliedEventIds.push(event.id);
  }

  return result;
};
