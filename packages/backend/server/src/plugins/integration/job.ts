import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { OnJob } from '../../base/job/queue/def';
import { ScmProviderRegistry } from './providers';
import { IntegrationConnectionService } from './service';
import type { ScmWebhookJobData } from './types';

export class IntegrationJob {
  private readonly logger = new Logger(IntegrationJob.name);

  constructor(
    private readonly connections: IntegrationConnectionService,
    private readonly providers: ScmProviderRegistry
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
      // TODO(M3): persist development links and activity events
      this.logger.log(
        `Webhook event [${event.type}] for keys [${event.taskKeys.join(', ')}]`
      );
    }
  }
}