import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { OnJob } from '../../base/job/queue/def';
import { DevelopmentLinkService } from './link-service';
import { ScmProviderRegistry } from './providers';
import { IntegrationConnectionService } from './service';
import type { DevelopmentEvent, ScmWebhookJobData } from './types';

@Injectable()
export class IntegrationJob {
  private readonly logger = new Logger(IntegrationJob.name);

  constructor(
    private readonly connections: IntegrationConnectionService,
    private readonly providers: ScmProviderRegistry,
    private readonly links: DevelopmentLinkService
  ) {}

  @OnJob('integration.scm-webhook')
  async onScmWebhook(job: Job<{ payload: ScmWebhookJobData }>) {
    const { connectionId, provider, payload } = job.data.payload;

    const connection = await this.connections.get(connectionId);

    if (!connection.enabled) {
      return;
    }

    const scmProvider = this.providers.get(provider);

    const events = await scmProvider.parseWebhook({ body: payload });

    for (const event of events) {
      await this.processEvent(connectionId, event);
    }
  }

  private async processEvent(connectionId: string, event: DevelopmentEvent) {
    if (await this.links.isEventProcessed(connectionId, event.idempotencyKey)) {
      this.logger.log(
        `Skipping duplicate webhook event [${event.type}] for connection ${connectionId}`
      );
      return;
    }

    const repository = await this.connections.getRepositoryByExternalId(
      connectionId,
      event.repository.externalId
    );

    if (!repository?.enabled) {
      this.logger.log(
        `Ignoring event [${event.type}] for untracked repository ${event.repository.externalId}`
      );
      await this.links.markEventProcessed(
        connectionId,
        event.idempotencyKey,
        event.type
      );
      return;
    }

    const connection = await this.connections.get(connectionId);

    await this.links.upsertEventLinks(event, {
      workspaceId: connection.workspaceId,
      connectionId,
      repositoryId: repository.id,
    });

    await this.recordEventActivity(event, {
      workspaceId: connection.workspaceId,
      connectionId,
      repositoryName: repository.fullName,
    });

    await this.links.markEventProcessed(
      connectionId,
      event.idempotencyKey,
      event.type
    );

    this.logger.log(
      `Linked webhook event [${event.type}] for keys [${event.taskKeys.join(', ')}]`
    );
  }

  private async recordEventActivity(
    event: DevelopmentEvent,
    context: {
      workspaceId: string;
      connectionId: string;
      repositoryName: string;
    }
  ) {
    for (const taskKey of event.taskKeys) {
      switch (event.type) {
        case 'commit.pushed':
          await this.links.recordActivity({
            ...context,
            taskKey,
            eventType: 'commit.pushed',
            title: event.commit.message.split('\n')[0]!,
            url: event.commit.url ?? event.repository.url,
            authorName: event.commit.authorName,
            metadata: { shortSha: event.commit.shortSha },
          });
          break;

        case 'branch.updated':
          await this.links.recordActivity({
            ...context,
            taskKey,
            eventType: 'branch.updated',
            title: event.branch.name,
            url: event.branch.url ?? event.repository.url,
            metadata: {},
          });
          break;

        case 'merge_request.opened':
        case 'merge_request.updated':
        case 'merge_request.merged':
          await this.links.recordActivity({
            ...context,
            taskKey,
            eventType: event.type,
            title: event.mergeRequest.title,
            url: event.mergeRequest.url,
            authorName: event.mergeRequest.authorName,
            metadata: { iid: event.mergeRequest.iid },
          });
          break;
      }
    }
  }
}
