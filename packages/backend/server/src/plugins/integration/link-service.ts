import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { normalizeTaskKey } from '@affine/trackwork';
import type { DevelopmentEvent } from './types';

export type DevelopmentActivityRecord = {
  workspaceId: string;
  connectionId: string;
  taskKey: string;
  eventType: string;
  title: string;
  url: string;
  authorName?: string;
  repositoryName?: string;
  metadata: Record<string, unknown>;
};

export type DevelopmentLinkEntity = {
  workspaceId: string;
  connectionId: string;
  repositoryId: string;
  taskKey: string;
  entityType: 'commit' | 'branch' | 'merge_request';
  externalId: string;
  iid?: string;
  url: string;
  title: string;
  status?: string;
  metadata: Record<string, unknown>;
};

@Injectable()
export class DevelopmentLinkService {
  constructor(private readonly prisma: PrismaClient) {}

  async listByTaskKey(workspaceId: string, taskKey: string) {
    return this.prisma.developmentTaskLink.findMany({
      where: {
        workspaceId,
        taskKey: normalizeTaskKey(taskKey),
      },
      orderBy: [{ entityType: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async upsertLink(link: DevelopmentLinkEntity) {
    const taskKey = normalizeTaskKey(link.taskKey);
    const { workspaceId, entityType, externalId } = link;

    return this.prisma.developmentTaskLink.upsert({
      where: {
        workspaceId_taskKey_entityType_externalId: {
          workspaceId,
          taskKey,
          entityType,
          externalId,
        },
      },
      create: {
        workspaceId,
        connectionId: link.connectionId,
        repositoryId: link.repositoryId,
        taskKey,
        entityType,
        externalId,
        iid: link.iid ?? null,
        url: link.url,
        title: link.title,
        status: link.status ?? null,
        metadata: link.metadata as object,
      },
      update: {
        connectionId: link.connectionId,
        repositoryId: link.repositoryId,
        iid: link.iid ?? null,
        url: link.url,
        title: link.title,
        status: link.status ?? null,
        metadata: link.metadata as object,
      },
    });
  }

  async isEventProcessed(
    connectionId: string,
    idempotencyKey: string
  ): Promise<boolean> {
    const record = await this.prisma.developmentWebhookEvent.findUnique({
      where: {
        connectionId_idempotencyKey: { connectionId, idempotencyKey },
      },
    });

    return record !== null;
  }

  async markEventProcessed(
    connectionId: string,
    idempotencyKey: string,
    eventType: string
  ): Promise<boolean> {
    try {
      await this.prisma.developmentWebhookEvent.create({
        data: {
          connectionId,
          idempotencyKey,
          eventType,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async recordActivity(activity: DevelopmentActivityRecord) {
    await this.prisma.developmentActivity.create({
      data: {
        workspaceId: activity.workspaceId,
        connectionId: activity.connectionId,
        taskKey: normalizeTaskKey(activity.taskKey),
        eventType: activity.eventType,
        title: activity.title,
        url: activity.url,
        authorName: activity.authorName ?? null,
        repositoryName: activity.repositoryName ?? null,
        metadata: activity.metadata as object,
      },
    });
  }

  async listActivity(input: {
    workspaceId: string;
    taskKey?: string;
    first: number;
    after?: string;
  }) {
    const { first } = input;

    let cursor: { createdAt: Date; id: string } | undefined;

    if (input.after) {
      const [time, id] = Buffer.from(input.after, 'base64url')
        .toString('utf8')
        .split('|');
      if (time && id) {
        cursor = { createdAt: new Date(time), id };
      }
    }

    const items = await this.prisma.developmentActivity.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.taskKey ? { taskKey: normalizeTaskKey(input.taskKey) } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  createdAt: cursor.createdAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: first + 1,
    });

    const hasNextPage = items.length > first;
    const nodes = hasNextPage ? items.slice(0, first) : items;
    const last = nodes[nodes.length - 1];
    const nextCursor =
      hasNextPage && last
        ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString(
            'base64url'
          )
        : null;

    return { nodes, nextCursor, hasNextPage };
  }

  async upsertEventLinks(
    event: DevelopmentEvent,
    context: {
      workspaceId: string;
      connectionId: string;
      repositoryId: string;
    }
  ) {
    for (const taskKey of event.taskKeys) {
      const base = {
        ...context,
        taskKey,
      };

      switch (event.type) {
        case 'commit.pushed':
          await this.upsertLink({
            ...base,
            entityType: 'commit',
            externalId: event.commit.sha,
            url: event.commit.url ?? event.repository.url,
            title: event.commit.message.split('\n')[0]!,
            metadata: {
              shortSha: event.commit.shortSha,
              authorName: event.commit.authorName,
              committedAt: event.commit.committedAt?.toISOString() ?? null,
              branch: event.commit.branch ?? null,
            },
          });
          break;

        case 'branch.updated':
          await this.upsertLink({
            ...base,
            entityType: 'branch',
            externalId: event.branch.name,
            url: event.branch.url ?? event.repository.url,
            title: event.branch.name,
            metadata: {},
          });
          break;

        case 'merge_request.opened':
        case 'merge_request.updated':
        case 'merge_request.merged':
          await this.upsertLink({
            ...base,
            entityType: 'merge_request',
            externalId: event.mergeRequest.externalId,
            iid: event.mergeRequest.iid,
            url: event.mergeRequest.url,
            title: event.mergeRequest.title,
            status: event.mergeRequest.status,
            metadata: {
              sourceBranch: event.mergeRequest.sourceBranch,
              targetBranch: event.mergeRequest.targetBranch,
              authorName: event.mergeRequest.authorName ?? null,
              mergedAt: event.mergeRequest.mergedAt?.toISOString() ?? null,
            },
          });
          break;
      }
    }
  }
}
