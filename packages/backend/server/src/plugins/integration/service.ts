import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { extractTrackWorkKeys } from '@affine/trackwork';

import { AuthenticationRequired, CryptoHelper, NotFound } from '../../base';
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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: CryptoHelper,
    private readonly providers: ScmProviderRegistry,
    private readonly ciProviders: CiProviderRegistry,
    private readonly queue: JobQueue
  ) {}

  async create(input: CreateConnectionInput) {
    const baseUrl =
      input.provider === 'jenkins'
        ? validateJenkinsBaseUrl(input.baseUrl)
        : validateGitLabBaseUrl(input.baseUrl);

    return this.prisma.developmentIntegrationConnection.create({
      data: {
        workspaceId: input.workspaceId,
        provider: input.provider,
        name: input.name,
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
    await this.get(input.id);

    return this.prisma.developmentIntegrationConnection.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async rotateCredentials(input: RotateCredentialsInput) {
    await this.get(input.id);

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

      return provider.testConnection({
        baseUrl: connection.baseUrl,
        username: connection.username ?? undefined,
        token: await this.decrypt(connection.tokenCipher),
      });
    }

    const provider = this.providers.get(connection.provider as ScmProviderType);

    return provider.testConnection({
      baseUrl: connection.baseUrl,
      token: await this.decrypt(connection.tokenCipher),
    });
  }

  async refreshPipelines(connectionId: string) {
    const connection = await this.get(connectionId);

    if (!this.ciProviders.has(connection.provider)) {
      throw new NotFound('Development integration connection not found');
    }

    const provider = this.ciProviders.get(connection.provider);
    const token = await this.decrypt(connection.tokenCipher);

    const pipelines = await provider.listPipelines({
      baseUrl: connection.baseUrl,
      username: connection.username ?? undefined,
      token,
      limit: 200,
    });

    for (const pipeline of pipelines) {
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

      const taskKeys = extractTrackWorkKeys(
        [pipeline.name, pipeline.description].filter(Boolean).join(' ')
      );

      for (const taskKey of taskKeys) {
        await this.prisma.developmentTaskLink.upsert({
          where: {
            workspaceId_taskKey_entityType_externalId: {
              workspaceId: connection.workspaceId,
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

    return provider.listRepositories({
      baseUrl: connection.baseUrl,
      token: await this.decrypt(connection.tokenCipher),
    });
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

  async getRepositoryByExternalId(connectionId: string, externalId: string) {
    return this.prisma.developmentRepository.findUnique({
      where: {
        connectionId_externalId: { connectionId, externalId },
      },
    });
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
    const connection = await this.getScmConnection(input.connectionId);

    if (connection.provider !== input.provider) {
      throw new NotFound('Development integration connection not found');
    }

    if (!connection.enabled) {
      throw new NotFound('Development integration connection not found');
    }

    const provider = this.providers.get(input.provider);

    const valid = await provider.verifyWebhook({
      headers: input.headers,
      body: input.body,
      webhookSecret: connection.webhookSecret,
    });

    if (!valid) {
      this.logger.warn(
        `Webhook rejected for connection ${input.connectionId}: invalid secret`
      );
      throw new AuthenticationRequired();
    }

    const payload: ScmWebhookJobData = {
      connectionId: input.connectionId,
      provider: input.provider,
      payload: input.body,
    };

    await this.queue.add('integration.scm-webhook', payload);

    return { accepted: true };
  }

  private async decrypt(cipher: string): Promise<string> {
    try {
      return this.crypto.decrypt(cipher);
    } catch {
      throw new NotFound('Development integration connection not found');
    }
  }
}
