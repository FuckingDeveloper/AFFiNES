import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { metrics } from '../../base';
import { OnJob } from '../../base/job/queue/def';
import { DevelopmentLinkService } from './link-service';
import { ScmProviderRegistry } from './providers';
import { IntegrationConnectionService } from './service';
import type {
  DevelopmentEvent,
  ScmProviderType,
  ScmWebhookJobData,
} from './types';

const KNOWN_EVENT_TYPES = new Set([
  'commit.pushed',
  'branch.updated',
  'merge_request.opened',
  'merge_request.updated',
  'merge_request.merged',
]);

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

    if (job.attemptsMade > 0) {
      metrics.trackwork.counter('webhook_retry').add(1, { provider });
    }

    const connection = await this.connections.get(connectionId);

    if (!connection.enabled) {
      return;
    }

    const scmProvider = this.providers.get(provider);

    const events = await scmProvider.parseWebhook({ body: payload });

    for (const event of events) {
      await this.processEvent(connectionId, provider, event);
    }
  }

  private async processEvent(
    connectionId: string,
    provider: ScmProviderType,
    event: DevelopmentEvent
  ) {
    const eventType = KNOWN_EVENT_TYPES.has(event.type)
      ? event.type
      : 'unknown';

    const recordEventResult = (result: string) => {
      metrics.trackwork
        .counter('webhook_event')
        .add(1, { provider, eventType, result });
    };

    const claimed = await this.links.markEventProcessed(
      connectionId,
      event.idempotencyKey,
      event.type
    );
    if (!claimed) {
      recordEventResult('duplicate');
      this.logger.log({
        message: 'Duplicate SCM webhook event skipped',
        event: 'scm.webhook.event.duplicate',
        provider,
        eventType,
        result: 'duplicate',
        connectionId,
      });
      return;
    }

    try {
      const repository = await this.connections.getRepositoryByExternalId(
        connectionId,
        event.repository.externalId
      );

      if (!repository?.enabled) {
        recordEventResult('untracked_repository');
        this.logger.log({
          message: 'SCM webhook event ignored for untracked repository',
          event: 'scm.webhook.event.ignored',
          provider,
          eventType,
          result: 'untracked_repository',
          connectionId,
        });
        return;
      }

      const connection = await this.connections.get(connectionId);

      const taskKeys = await this.links.upsertEventLinks(event, {
        workspaceId: connection.workspaceId,
        connectionId,
        repositoryId: repository.id,
      });

      await this.recordEventActivity(
        { ...event, taskKeys },
        {
          workspaceId: connection.workspaceId,
          connectionId,
          repositoryName: repository.fullName,
        }
      );

      recordEventResult('processed');
      this.logger.log({
        message: 'SCM webhook event processed',
        event: 'scm.webhook.event.processed',
        provider,
        eventType,
        result: 'processed',
        connectionId,
        taskCount: taskKeys.length,
      });
    } catch (error) {
      await this.links.unmarkEventProcessed(connectionId, event.idempotencyKey);
      recordEventResult('error');
      this.logger.error({
        message: 'SCM webhook event processing failed',
        event: 'scm.webhook.event.error',
        provider,
        eventType,
        result: 'error',
        connectionId,
      });
      throw error;
    }
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
