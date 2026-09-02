import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export type AuditMetadata = Record<string, string | number | boolean>;

export type AuditInput = {
  actorId: string;
  actorEmail: string;
  workspaceId?: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: AuditMetadata;
};

@Injectable()
export class AdminAuditService {
  constructor(private readonly db: PrismaClient) {}

  async log(input: AuditInput) {
    await this.db.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        workspaceId: input.workspaceId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: input.metadata,
      },
    });
  }
}
