import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

interface TwoFactorAuthRow {
  userId: string;
  secretEncrypted: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class TwoFactorAuthModel extends BaseModel {
  async get(userId: string): Promise<TwoFactorAuthRow | null> {
    const rows = await this.db.$queryRaw<TwoFactorAuthRow[]>`
      SELECT user_id as "userId",
             secret_encrypted as "secretEncrypted",
             created_at as "createdAt",
             updated_at as "updatedAt"
      FROM "user_two_factor_auth"
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async upsert(userId: string, secretEncrypted: string) {
    await this.db.$executeRaw`
      INSERT INTO "user_two_factor_auth" ("user_id", "secret_encrypted")
      VALUES (${userId}, ${secretEncrypted})
      ON CONFLICT ("user_id")
      DO UPDATE SET "secret_encrypted" = EXCLUDED."secret_encrypted",
                    "updated_at" = NOW()
    `;
  }

  async delete(userId: string) {
    await this.db.$executeRaw`
      DELETE FROM "user_two_factor_auth"
      WHERE user_id = ${userId}
    `;
  }
}
