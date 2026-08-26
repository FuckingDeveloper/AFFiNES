import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AuthenticationRequired, CryptoHelper, NotFound } from '../../base';
import { JobQueue } from '../../base/job/queue';
import type { ScmProviderType } from './types';
import { ScmProviderRegistry } from './providers';
import { validateGitLabBaseUrl } from './providers/gitlab';
import type {
  ConnectionTestResult,
  RepositoryInfo,
  ScmConnection,
  ScmWebhookJobData,
} from './types';

export type CreateConnectionInput = {
  workspaceId: string;
  provider: ScmProviderType;
  name: string;
  baseUrl: string;
  token: string;
  webhookSecret?: string;
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
    private readonly queue: JobQueue
  ) {}

  async create(input: CreateConnectionInput) {
    const baseUrl = validateGitLabBaseUrl(input.baseUrl);

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

    const provider = this.providers.get(connection.provider as ScmProviderType);

    return provider.testConnection({
      baseUrl: connection.baseUrl,
      token: await this.decrypt(connection.tokenCipher),
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
