import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Config } from '../../config';
import { metrics } from '../../metrics';
import { QUEUES } from './def';

const QUEUE_STATES = [
  'waiting',
  'active',
  'delayed',
  'failed',
  'completed',
] as const;

@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name);

  constructor(
    private readonly config: Config,
    private readonly moduleRef: ModuleRef
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async collect() {
    if (!this.config.metrics.enabled) {
      return;
    }
    for (const queue of QUEUES) {
      try {
        const instance = this.moduleRef.get(getQueueToken(queue), {
          strict: false,
        });
        const counts = await instance.getJobCounts();
        for (const state of QUEUE_STATES) {
          const count = counts[state];
          if (typeof count === 'number') {
            metrics.queue.gauge('job_depth').record(count, { queue, state });
          }
        }
      } catch {
        this.logger.debug(`Queue [${queue}] is not registered, skip metrics.`);
      }
    }
  }
}
