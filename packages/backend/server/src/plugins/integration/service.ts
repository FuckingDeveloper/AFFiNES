import { PayloadTooLargeException } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  extractTrackWorkKeys,
  normalizeTaskKey,
  parseTaskKey,
} from '@affine/trackwork';

import {
  BadRequest,
  CryptoHelper,
  metrics,
  NotFound,
  wrapCallMetric,
} from '../../base';
import { JobQueue } from '../../base/job/queue';
import type { ScmProviderType } from './types';
import { CiProviderRegistry } from './providers/ci';
import { ScmProviderRegistry } from './providers';
import { validateGitLabBaseUrl } from './providers/gitlab';
import { validateJenkinsBaseUrl } from './providers/jenkins';
import type {
  ConnectionTestResult,
  RepositoryInfo,
  ScmConnection,
  ScmWebhookJobData,
} from './types';

export type CreateConnectionInput = {
  workspaceId: string;
  provider: string;
  name: string;
  baseUrl: string;
  token: string;
  webhookSecret?: string;
  username?: string;
  createdById: string;
};

export type UpdateConnectionInput = {
  id: string;
  name?: string;
  baseUrl?: string;
  username?: string;
  enabled?: boolean;
};

export type RotateCredentialsInput = {
  id: string;
  token?: string;
  webhookSecret?: string;
};

@Injectable()
export class IntegrationConnectionService {
  private readonly logger = new Logger(IntegrationConnectionService.name);
  private readonly pipelineRefreshAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: CryptoHelper,
    private readonly providers: ScmProviderRegistry,
    private readonly ciProviders: CiProviderRegistry,
    private readonly queue: JobQueue
  ) {}

  async create(input: CreateConnectionInput) {
    if (input.provider !== 'gitlab' && input.provider !== 'jenkins') {
      throw new BadRequest('UNSUPPORTED_DEVELOPMENT_PROVIDER');
    }
    if (!input.name.trim() || !input.token) {
      throw new BadRequest('INVALID_DEVELOPMENT_CONNECTION');
    }
    if (input.provider === 'gitlab' && !input.webhookSecret) {
      throw new BadRequest('GITLAB_WEBHOOK_SECRET_REQUIRED');
    }

    const baseUrl =
      input.provider === 'jenkins'
        ? validateJenkinsBaseUrl(input.baseUrl)
        : validateGitLabBaseUrl(input.baseUrl);

    return this.prisma.developmentIntegrationConnection.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        name: input.name.trim(),
        baseUrl,
        tokenCipher: this.crypto.encrypt(input.token),
        webhookSecretCipher: input.webhookSecret
          ? this.crypto.encrypt(input.webhookSecret)
          : null,
        username: input.username ?? null,
        createdById: input.createdById,
      },
    });
  }

  async listByWorkspace(workspaceId: string) {
    return this.prisma.developmentIntegrationConnection.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(connectionId: string) {
    const connection =
      await this.prisma.developmentIntegrationConnection.findUnique({
        where: { id: connectionId },
      });

    if (!connection) {
      throw new NotFound('Development integration connection not found');
    }

    return connection;
  }

  async update(input: UpdateConnectionInput) {
    const connection = await this.get(input.id);

    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequest('INVALID_DEVELOPMENT_CONNECTION_NAME');
    }

    const baseUrl = input.baseUrl
      ? connection.provider === 'jenkins'
        ? validateJenkinsBaseUrl(input.baseUrl)
        : validateGitLabBaseUrl(input.baseUrl)
      : undefined;

    return this.prisma.developmentIntegrationConnection.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(input.username !== undefined
          ? { username: input.username.trim() || null }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async rotateCredentials(input: RotateCredentialsInput) {
    const connection = await this.get(input.id);

    if (input.token !== undefined && !input.token) {
      throw new BadRequest('INVALID_DEVELOPMENT_TOKEN');
    }
    if (
      connection.provider === 'gitlab' &&
      input.webhookSecret !== undefined &&
      !input.webhookSecret
    ) {
      throw new BadRequest('GITLAB_WEBHOOK_SECRET_REQUIRED');
    }

    return this.prisma.developmentIntegrationConnection.update({
      where: { id: input.id },
      data: {
        ...(input.token !== undefined
          ? { tokenCipher: this.crypto.encrypt(input.token) }
          : {}),
        ...(input.webhookSecret !== undefined
          ? { webhookSecretCipher: this.crypto.encrypt(input.webhookSecret) }
          : {}),
      },
    });
  }

  async delete(connectionId: string) {
    await this.get(connectionId);

    await this.prisma.developmentIntegrationConnection.delete({
      where: { id: connectionId },
    });
  }

  async testConnection(connectionId: string): Promise<ConnectionTestResult> {
    const connection = await this.get(connectionId);

    if (this.ciProviders.has(connection.provider)) {
      const provider = this.ciProviders.get(connection.provider);

      return wrapCallMetric(
        async () =>
          provider.testConnection({
            baseUrl: connection.baseUrl,
            username: connection.username ?? undefined,
            token: await this.decrypt(connection.tokenCipher),
          }),
        'trackwork',
        'scm_request',
        { provider: connection.provider, operation: 'test_connection' }
      )();
    }

    const provider = this.providers.get(connection.provider as ScmProviderType);

    return wrapCallMetric(
      async () =>
        provider.testConnection({
          baseUrl: connection.baseUrl,
          token: await this.decrypt(connection.tokenCipher),
        }),
      'trackwork',
      'scm_request',
      { provider: connection.provider, operation: 'test_connection' }
    )();
  }

  async refreshPipelines(connectionId: string) {
    const connection = await this.get(connectionId);

    if (!this.ciProviders.has(connection.provider)) {
      throw new NotFound('Development integration connection not found');
    }

    const lastRefreshAt = this.pipelineRefreshAt.get(connectionId) ?? 0;
    if (Date.now() - lastRefreshAt < 30_000) {
      throw new BadRequest('PIPELINE_REFRESH_RATE_LIMITED');
    }
    this.pipelineRefreshAt.set(connectionId, Date.now());

    const provider = this.ciProviders.get(connection.provider);
    const token = await this.decrypt(connection.tokenCipher);

    const pipelines = await wrapCallMetric(
      () =>
        provider.listPipelines({
          baseUrl: connection.baseUrl,
          username: connection.username ?? undefined,
          token,
          limit: 200,
        }),
      'trackwork',
      'scm_request',
      { provider: connection.provider, operation: 'list_pipelines' }
    )();

    for (const pipeline of pipelines) {
      const existing = await this.prisma.developmentPipeline.findUnique({
        where: {
          connectionId_externalId: {
            connectionId,
            externalId: pipeline.externalId,
          },
        },
      });

      const statusChanged = existing?.status !== pipeline.status;

      await this.prisma.developmentPipeline.upsert({
        where: {
          connectionId_externalId: {
            connectionId,
            externalId: pipeline.externalId,
          },
        },
        create: {
          connectionId,
          externalId: pipeline.externalId,
          name: pipeline.name ?? pipeline.externalId,
          number: pipeline.number ?? '',
          status: pipeline.status,
          url: pipeline.url ?? connection.baseUrl,
          branch: pipeline.branch ?? null,
          startedAt: pipeline.startedAt ?? null,
          finishedAt: pipeline.finishedAt ?? null,
        },
        update: {
          name: pipeline.name ?? pipeline.externalId,
          number: pipeline.number ?? '',
          status: pipeline.status,
          url: pipeline.url ?? connection.baseUrl,
          branch: pipeline.branch ?? null,
          startedAt: pipeline.startedAt ?? null,
          finishedAt: pipeline.finishedAt ?? null,
        },
      });

      const extractedTaskKeys = extractTrackWorkKeys(
        [pipeline.name, pipeline.description].filter(Boolean).join(' ')
      );
      const registeredTasks = await this.prisma.trackWorkTask.findMany({
        where: {
          workspaceId: connection.workspaceId,
          taskKey: { in: extractedTaskKeys },
        },
        select: { taskKey: true },
      });
      const taskKeys = registeredTasks.map(task => task.taskKey);

      if (statusChanged && taskKeys.length > 0) {
        await this.prisma.developmentActivity.createMany({
          data: taskKeys.map(taskKey => ({
            workspaceId: connection.workspaceId,
            connectionId,
            taskKey,
            eventType: `pipeline.${pipeline.status}`,
            title: `${pipeline.name ?? pipeline.externalId} #${pipeline.number ?? ''}`,
            url: pipeline.url ?? connection.baseUrl,
            repositoryName: null,
            metadata: {
              branch: pipeline.branch ?? null,
              commitSha: pipeline.commitSha ?? null,
              startedAt: pipeline.startedAt?.toISOString() ?? null,
              finishedAt: pipeline.finishedAt?.toISOString() ?? null,
            },
          })),
        });
      }

      for (const taskKey of taskKeys) {
        await this.prisma.developmentTaskLink.upsert({
          where: {
            connectionId_repositoryId_taskKey_entityType_externalId: {
              connectionId,
              repositoryId: '',
              taskKey,
              entityType: 'pipeline',
              externalId: pipeline.externalId,
            },
          },
          create: {
            workspaceId: connection.workspaceId,
            connectionId,
            repositoryId: '',
            taskKey,
            entityType: 'pipeline',
            externalId: pipeline.externalId,
            iid: pipeline.number ?? null,
            url: pipeline.url ?? connection.baseUrl,
            title: `${pipeline.name ?? pipeline.externalId} #${pipeline.number ?? ''}`,
            status: pipeline.status,
            metadata: {
              branch: pipeline.branch ?? null,
              commitSha: pipeline.commitSha ?? null,
              startedAt: pipeline.startedAt?.toISOString() ?? null,
              finishedAt: pipeline.finishedAt?.toISOString() ?? null,
            },
          },
          update: {
            url: pipeline.url ?? connection.baseUrl,
            title: `${pipeline.name ?? pipeline.externalId} #${pipeline.number ?? ''}`,
            status: pipeline.status,
            metadata: {
              startedAt: pipeline.startedAt?.toISOString() ?? null,
              finishedAt: pipeline.finishedAt?.toISOString() ?? null,
            },
          },
        });
      }
    }

    return this.prisma.developmentPipeline.findMany({
      where: { connectionId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async listRepositories(connectionId: string): Promise<RepositoryInfo[]> {
    const connection = await this.get(connectionId);

    const provider = this.providers.get(connection.provider as ScmProviderType);

    return wrapCallMetric(
      async () =>
        provider.listRepositories({
          baseUrl: connection.baseUrl,
          token: await this.decrypt(connection.tokenCipher),
        }),
      'trackwork',
      'scm_request',
      { provider: connection.provider, operation: 'list_repositories' }
    )();
  }

  async importRepository(connectionId: string, info: RepositoryInfo) {
    await this.get(connectionId);

    return this.prisma.developmentRepository.upsert({
      where: {
        connectionId_externalId: {
          connectionId,
          externalId: info.externalId,
        },
      },
      create: {
        connectionId,
        externalId: info.externalId,
        name: info.name,
        fullName: info.fullName,
        webUrl: info.webUrl,
        defaultBranch: info.defaultBranch ?? null,
      },
      update: {
        name: info.name,
        fullName: info.fullName,
        webUrl: info.webUrl,
        defaultBranch: info.defaultBranch ?? null,
      },
    });
  }

  async listRepositoriesByConnection(connectionId: string) {
    return this.prisma.developmentRepository.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listRepositoriesByIds(repositoryIds: string[]) {
    if (repositoryIds.length === 0) {
      return [];
    }
    return this.prisma.developmentRepository.findMany({
      where: { id: { in: [...new Set(repositoryIds)] } },
      orderBy: { fullName: 'asc' },
    });
  }

  async getRepositoryByExternalId(connectionId: string, externalId: string) {
    return this.prisma.developmentRepository.findUnique({
      where: {
        connectionId_externalId: { connectionId, externalId },
      },
    });
  }

  async createBranch(
    connectionId: string,
    repositoryId: string,
    baseBranch: string,
    name: string,
    rawTaskKey: string
  ) {
    const connection = await this.get(connectionId);
    const repository = await this.getRepositoryByExternalId(
      connectionId,
      repositoryId
    );

    if (!connection.enabled || !repository?.enabled) {
      throw new NotFound('Development repository not found');
    }

    const taskKey = await this.validateTaskKey(
      connection.workspaceId,
      rawTaskKey
    );

    const provider = this.providers.get(connection.provider as ScmProviderType);

    const branch = await wrapCallMetric(
      async () =>
        provider.createBranch({
          baseUrl: connection.baseUrl,
          token: await this.decrypt(connection.tokenCipher),
          repositoryId,
          baseBranch,
          name,
        }),
      'trackwork',
      'scm_request',
      { provider: connection.provider, operation: 'create_branch' }
    )();

    await this.prisma.developmentTaskLink.upsert({
      where: {
        connectionId_repositoryId_taskKey_entityType_externalId: {
          connectionId,
          repositoryId: repository.id,
          taskKey,
          entityType: 'branch',
          externalId: branch.name,
        },
      },
      create: {
        workspaceId: connection.workspaceId,
        connectionId,
        repositoryId: repository.id,
        taskKey,
        entityType: 'branch',
        externalId: branch.name,
        url: branch.url,
        title: branch.name,
        metadata: {},
      },
      update: { url: branch.url, title: branch.name },
    });

    return branch;
  }

  async createMergeRequest(
    connectionId: string,
    repositoryId: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string | undefined,
    rawTaskKey: string
  ) {
    const connection = await this.get(connectionId);
    const repository = await this.getRepositoryByExternalId(
      connectionId,
      repositoryId
    );

    if (!connection.enabled || !repository?.enabled) {
      throw new NotFound('Development repository not found');
    }

    const taskKey = await this.validateTaskKey(
      connection.workspaceId,
      rawTaskKey
    );

    const provider = this.providers.get(connection.provider as ScmProviderType);

    const mergeRequest = await wrapCallMetric(
      async () =>
        provider.createMergeRequest({
          baseUrl: connection.baseUrl,
          token: await this.decrypt(connection.tokenCipher),
          repositoryId,
          sourceBranch,
          targetBranch,
          title,
          description,
        }),
      'trackwork',
      'scm_request',
      { provider: connection.provider, operation: 'create_merge_request' }
    )();

    await this.prisma.developmentTaskLink.upsert({
      where: {
        connectionId_repositoryId_taskKey_entityType_externalId: {
          connectionId,
          repositoryId: repository.id,
          taskKey,
          entityType: 'merge_request',
          externalId: mergeRequest.externalId,
        },
      },
      create: {
        workspaceId: connection.workspaceId,
        connectionId,
        repositoryId: repository.id,
        taskKey,
        entityType: 'merge_request',
        externalId: mergeRequest.externalId,
        iid: mergeRequest.iid,
        url: mergeRequest.url,
        title,
        status: 'open',
        metadata: { sourceBranch, targetBranch },
      },
      update: {
        iid: mergeRequest.iid,
        url: mergeRequest.url,
        title,
        status: 'open',
        metadata: { sourceBranch, targetBranch },
      },
    });

    return mergeRequest;
  }

  async getRepository(repositoryId: string) {
    const repository = await this.prisma.developmentRepository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new NotFound('Development repository not found');
    }

    return repository;
  }

  async setRepositoryEnabled(repositoryId: string, enabled: boolean) {
    await this.getRepository(repositoryId);

    return this.prisma.developmentRepository.update({
      where: { id: repositoryId },
      data: { enabled },
    });
  }

  async getScmConnection(connectionId: string): Promise<ScmConnection> {
    const connection = await this.get(connectionId);

    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      provider: connection.provider as ScmProviderType,
      baseUrl: connection.baseUrl,
      token: await this.decrypt(connection.tokenCipher),
      webhookSecret: connection.webhookSecretCipher
        ? await this.decrypt(connection.webhookSecretCipher)
        : undefined,
      enabled: connection.enabled,
    };
  }

  async acceptScmWebhook(input: {
    connectionId: string;
    provider: ScmProviderType;
    headers: Record<string, unknown>;
    body: unknown;
  }): Promise<{ accepted: true }> {
    const { connectionId, provider: providerType } = input;

    metrics.trackwork
      .counter('webhook_received')
      .add(1, { provider: providerType });

    const recordOutcome = (result: string) => {
      metrics.trackwork
        .counter('webhook_total')
        .add(1, { provider: providerType, result });
    };

    const serialized = JSON.stringify(input.body);

    if (serialized.length > 256 * 1024) {
      recordOutcome('payload_too_large');
      throw new PayloadTooLargeException('Webhook payload too large');
    }

    let connection: ScmConnection;
    try {
      connection = await this.getScmConnection(connectionId);
    } catch (e) {
      recordOutcome(e instanceof NotFound ? 'not_found' : 'error');
      throw e;
    }

    if (connection.provider !== providerType) {
      recordOutcome('not_found');
      throw new NotFound('Development integration connection not found');
    }

    if (!connection.enabled) {
      recordOutcome('disabled');
      throw new NotFound('Development integration connection not found');
    }

    const provider = this.providers.get(providerType);

    this.logger.log({
      message: `Webhook received for connection ${connectionId} (${providerType})`,
      event: 'scm.webhook.received',
      provider: providerType,
      connectionId,
    });

    const valid = await provider.verifyWebhook({
      headers: input.headers,
      body: input.body,
      webhookSecret: connection.webhookSecret,
    });

    if (!valid) {
      recordOutcome('invalid_signature');
      this.logger.warn({
        message: `Webhook rejected for connection ${connectionId}: invalid secret`,
        event: 'scm.webhook.rejected',
        result: 'invalid_signature',
        provider: providerType,
        connectionId,
      });
      // uniform 404: do not reveal whether the connection exists
      throw new NotFound('Development integration connection not found');
    }

    const payload: ScmWebhookJobData = {
      connectionId,
      provider: providerType,
      payload: input.body,
    };

    await this.queue.add('integration.scm-webhook', payload);
    recordOutcome('queued');

    return { accepted: true };
  }

  private async decrypt(cipher: string): Promise<string> {
    try {
      return this.crypto.decrypt(cipher);
    } catch {
      throw new NotFound('Development integration connection not found');
    }
  }

  private async validateTaskKey(
    workspaceId: string,
    rawTaskKey: string
  ): Promise<string> {
    const taskKey = normalizeTaskKey(rawTaskKey);
    if (!parseTaskKey(taskKey)) {
      throw new BadRequest('INVALID_TRACKWORK_TASK_KEY');
    }
    const registered = await this.prisma.trackWorkTask.findUnique({
      where: { workspaceId_taskKey: { workspaceId, taskKey } },
      select: { id: true },
    });
    if (!registered) {
      throw new BadRequest('INVALID_TRACKWORK_TASK_KEY');
    }
    return taskKey;
  }
}
