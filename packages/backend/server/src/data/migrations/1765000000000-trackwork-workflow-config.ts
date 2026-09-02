import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { applyUpdate, Doc } from 'yjs';

import {
  WORKSPACE_CUSTOM_PROPERTY_TABLE,
  WORKSPACE_DB_DOC_PREFIX,
} from '../../core/utils/doc';
import {
  validateWorkflowConfig,
  TrackWorkWorkflowConfigValue,
} from '../../plugins/trackwork/workflow-config';

/**
 * Import legacy TrackWork workflow configuration persisted in the workspace
 * custom-property document (`taskStatus.additionalData`) into the
 * authoritative TrackWorkWorkflowConfig row. Idempotent: workspaces that
 * already have a config row (or no legacy data) are left untouched.
 */
export class TrackWorkWorkflowConfig1765000000000 {
  static async up(db: PrismaClient, _injector: ModuleRef) {
    const propertiesDocId = `${WORKSPACE_DB_DOC_PREFIX}${WORKSPACE_CUSTOM_PROPERTY_TABLE}`;
    let turn = 0;
    const batchSize = 100;
    let lastBatchSize = batchSize;

    while (lastBatchSize === batchSize) {
      const workspaces = await db.workspace.findMany({
        select: { id: true },
        skip: turn * batchSize,
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      lastBatchSize = workspaces.length;
      for (const workspace of workspaces) {
        const existing = await db.trackWorkWorkflowConfig.findUnique({
          where: { workspaceId: workspace.id },
        });
        if (existing) {
          continue;
        }

        const legacyConfig = await readLegacyWorkflowConfig(
          db,
          workspace.id,
          propertiesDocId
        );
        if (!legacyConfig) {
          continue;
        }

        const { config, errors } = validateWorkflowConfig(legacyConfig);
        if (errors.length > 0) {
          continue;
        }

        await db.trackWorkWorkflowConfig.create({
          data: {
            workspaceId: workspace.id,
            revision: 1,
            config: config as object,
          },
        });
      }

      turn += 1;
    }
  }

  static async down(_db: PrismaClient, _injector: ModuleRef) {}
}

async function readLegacyWorkflowConfig(
  db: PrismaClient,
  workspaceId: string,
  propertiesDocId: string
): Promise<TrackWorkWorkflowConfigValue | null> {
  const updates = await db.update.findMany({
    where: { workspaceId, id: propertiesDocId },
    select: { blob: true },
    orderBy: { createdAt: 'asc' },
  });

  if (updates.length === 0) {
    return null;
  }

  const doc = new Doc();
  for (const update of updates) {
    applyUpdate(doc, update.blob);
  }

  const statusMap = doc.getMap('taskStatus');
  const statusRow: Record<string, unknown> = {};
  for (const [key, value] of statusMap.entries()) {
    statusRow[key] = value;
  }
  const additionalData = statusRow?.additionalData as
    | Record<string, unknown>
    | undefined;
  if (!additionalData || typeof additionalData !== 'object') {
    return null;
  }

  const boards = additionalData.taskTrackerBoards;
  const rules = additionalData.taskTrackerAutomationRules;
  const result: TrackWorkWorkflowConfigValue = {
    taskTrackerBoards: [],
    taskTrackerAutomationRules: undefined,
  };
  if (Array.isArray(boards)) {
    result.taskTrackerBoards =
      boards as TrackWorkWorkflowConfigValue['taskTrackerBoards'];
  }
  if (Array.isArray(rules)) {
    result.taskTrackerAutomationRules =
      rules as TrackWorkWorkflowConfigValue['taskTrackerAutomationRules'];
  }
  if (
    result.taskTrackerBoards.length === 0 &&
    !result.taskTrackerAutomationRules
  ) {
    return null;
  }
  return result;
}
