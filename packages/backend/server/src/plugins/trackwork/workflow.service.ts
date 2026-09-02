import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { AdminAuditService } from '../../core/audit';
import { WorkflowConfigConflict } from '../../base/error/errors.gen';
import {
  TrackWorkWorkflowConfigValue,
  validateWorkflowConfig,
  validateWorkflowConfigOrThrow,
} from './workflow-config';

export const DEFAULT_BOARD_ID = 'default';
export const DEFAULT_BOARD_TITLE = 'Main board';
export const DEFAULT_STAGE_IDS = ['todo', 'in-progress', 'done'];
export const DEFAULT_STAGE_TITLES: Record<string, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  done: 'Done',
};

export const DEFAULT_WORKFLOW_CONFIG: TrackWorkWorkflowConfigValue = {
  taskTrackerBoards: [
    {
      id: DEFAULT_BOARD_ID,
      title: DEFAULT_BOARD_TITLE,
      flow: DEFAULT_STAGE_IDS.map(id => ({
        id,
        title: DEFAULT_STAGE_TITLES[id],
      })),
      transitions: {
        todo: ['todo', 'in-progress'],
        'in-progress': ['in-progress', 'done'],
        done: ['done'],
      },
    },
  ],
};

export type TrackWorkWorkflowReadResult = {
  revision: number;
  config: TrackWorkWorkflowConfigValue;
};

@Injectable()
export class TrackWorkWorkflowService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AdminAuditService
  ) {}

  async get(workspaceId: string): Promise<TrackWorkWorkflowReadResult> {
    const row = await this.prisma.trackWorkWorkflowConfig.findUnique({
      where: { workspaceId },
    });
    if (!row) {
      return { revision: 0, config: DEFAULT_WORKFLOW_CONFIG };
    }
    const { config, errors } = validateWorkflowConfig(row.config);
    if (errors.length > 0) {
      return { revision: row.revision, config: DEFAULT_WORKFLOW_CONFIG };
    }
    return { revision: row.revision, config };
  }

  async update(
    actor: { id: string; email: string },
    workspaceId: string,
    expectedRevision: number,
    value: unknown
  ): Promise<TrackWorkWorkflowReadResult> {
    const config = validateWorkflowConfigOrThrow(value);

    const revision = await this.prisma.$transaction(async tx => {
      let nextRevision: number;
      let previousRevision: number;

      if (expectedRevision === 0) {
        // No row may exist yet: the atomic CREATE doubles as the revision
        // check. If a concurrent transaction already created the row, the
        // repository's unique-constraint error is converted to an explicit
        // conflict - never exposed raw.
        try {
          await tx.trackWorkWorkflowConfig.create({
            data: {
              workspaceId,
              revision: 1,
              config: config as object,
              updatedBy: actor.id,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new WorkflowConfigConflict();
          }
          throw error;
        }
        nextRevision = 1;
        previousRevision = 0;
      } else {
        // Atomic conditional update: the SQL predicate includes both
        // workspaceId and revision = expectedRevision. Exactly one affected
        // row means this transaction won the revision race; zero means a
        // concurrent write already moved the revision.
        const updated = await tx.trackWorkWorkflowConfig.updateMany({
          where: { workspaceId, revision: expectedRevision },
          data: {
            revision: { increment: 1 },
            config: config as object,
            updatedBy: actor.id,
          },
        });
        if (updated.count !== 1) {
          throw new WorkflowConfigConflict();
        }
        nextRevision = expectedRevision + 1;
        previousRevision = expectedRevision;
      }

      // The audit executes only after the conditional write has proven this
      // transaction won the revision race; it commits atomically with the
      // config write in the same transaction.
      await this.audit.logInTx(tx, {
        actorId: actor.id,
        actorEmail: actor.email,
        workspaceId,
        action: 'trackwork.workflow.update',
        targetType: 'trackwork-workflow',
        targetId: workspaceId,
        metadata: {
          previousRevision,
          newRevision: nextRevision,
          boardCount: config.taskTrackerBoards.length,
          stageCount: config.taskTrackerBoards.reduce(
            (count, board) => count + (board.flow?.length ?? 0),
            0
          ),
          automationRuleCount: config.taskTrackerAutomationRules?.length ?? 0,
        },
      });

      return nextRevision;
    });

    return { revision, config };
  }
}
