import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { BaseModel } from './base';

export type UpsertAiWorkspaceByokConfigInput = {
  id?: string | null;
  workspaceId: string;
  provider: string;
  name: string;
  description: string | null;
  encryptedApiKey?: string;
  endpoint: string | null;
  sortOrder: number;
  enabled: boolean;
  userId?: string;
};

@Injectable()
export class CopilotWorkspaceByokConfigModel extends BaseModel {
  private missingDelegateWarned = false;

  private get delegate() {
    const delegate = (this.db as any).aiWorkspaceByokConfig;
    if (!delegate && !this.missingDelegateWarned) {
      this.logger.warn(
        'Prisma delegate "aiWorkspaceByokConfig" is unavailable. ' +
          'BYOK server profiles will be treated as empty.'
      );
      this.missingDelegateWarned = true;
    }
    return delegate;
  }

  async list(workspaceId: string) {
    const delegate = this.delegate;
    if (!delegate) {
      return [];
    }
    return await delegate.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listEnabled(workspaceId: string) {
    const delegate = this.delegate;
    if (!delegate) {
      return [];
    }
    return await delegate.findMany({
      where: { workspaceId, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const delegate = this.delegate;
    if (!delegate) {
      return null;
    }
    return await delegate.findUnique({
      where: { id },
    });
  }

  @Transactional()
  async upsert(input: UpsertAiWorkspaceByokConfigInput) {
    const data = {
      provider: input.provider,
      name: input.name,
      description: input.description,
      endpoint: input.endpoint,
      sortOrder: input.sortOrder,
      enabled: input.enabled,
      updatedBy: input.userId,
      ...(input.encryptedApiKey
        ? {
            encryptedApiKey: input.encryptedApiKey,
            lastValidatedAt: new Date(),
            lastValidationError: null,
            disabledReason: null,
            lastError: null,
            lastErrorAt: null,
          }
        : {}),
    };

    return input.id
      ? await this.db.aiWorkspaceByokConfig.update({
          where: { id: input.id, workspaceId: input.workspaceId },
          data,
        })
      : await this.db.aiWorkspaceByokConfig.create({
          data: {
            ...data,
            encryptedApiKey: input.encryptedApiKey ?? '',
            workspaceId: input.workspaceId,
            createdBy: input.userId,
          },
        });
  }

  @Transactional()
  async reorder(workspaceId: string, ids: string[], userId?: string) {
    await Promise.all(
      ids.map((id, sortOrder) =>
        this.db.aiWorkspaceByokConfig.update({
          where: { id, workspaceId },
          data: { sortOrder, updatedBy: userId },
        })
      )
    );
  }

  @Transactional()
  async delete(workspaceId: string, id: string) {
    await this.db.aiWorkspaceByokConfig.delete({ where: { id, workspaceId } });
  }

  @Transactional()
  async clear(workspaceId: string, provider?: string | null) {
    await this.db.aiWorkspaceByokConfig.deleteMany({
      where: { workspaceId, ...(provider ? { provider } : {}) },
    });
  }

  @Transactional()
  async markValidated(workspaceId: string, id: string, userId?: string) {
    await this.db.aiWorkspaceByokConfig.update({
      where: { id, workspaceId },
      data: {
        enabled: true,
        disabledReason: null,
        lastValidatedAt: new Date(),
        lastValidationError: null,
        lastError: null,
        lastErrorAt: null,
        updatedBy: userId,
      },
    });
  }

  @Transactional()
  async markFailure(workspaceId: string, id: string, message: string) {
    await this.db.aiWorkspaceByokConfig.update({
      where: { id, workspaceId },
      data: {
        enabled: false,
        disabledReason: 'recent_failure',
        lastValidationError: message,
        lastError: message,
        lastErrorAt: new Date(),
      },
    });
  }

  @Transactional()
  async touchUsed(workspaceId: string, id: string) {
    await this.db.aiWorkspaceByokConfig.updateMany({
      where: { id, workspaceId },
      data: { lastUsedAt: new Date() },
    });
  }
}
