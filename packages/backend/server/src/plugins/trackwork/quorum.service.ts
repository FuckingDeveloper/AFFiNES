/**
 * TrackWork quorum share export (OpenSpec 3.7).
 *
 * PROVISIONING-ONLY: generates one 2-of-3 share set from the current
 * bootstrap KEK (TRACKWORK_KEK_HEX), returns the three plaintext twshare-v1
 * values ONCE, persists nothing. KeySetId/ShareSetId are provisioning
 * metadata; persistent keyset activation belongs to 3.8. No DB, no Redis,
 * no filesystem, no logging of share material.
 */

import { randomBytes } from 'node:crypto';

import { assertKeySetId } from '@affine/trackwork';
import {
  generateTrackWorkShares,
  parseTrackWorkKekInput,
  TRACKWORK_QUORUM_SHARES,
  TRACKWORK_QUORUM_THRESHOLD,
} from '@affine/trackwork/crypto';
import { Injectable } from '@nestjs/common';

import { BadRequest } from '../../base';
import { AdminAuditService } from '../../core/audit';

export interface QuorumShareExportResponse {
  keySetId: string;
  shareSetId: string;
  threshold: number;
  totalShares: number;
  shares: Array<{ index: number; value: string }>;
}

@Injectable()
export class QuorumShareExportService {
  constructor(private readonly audit: AdminAuditService) {}

  async exportShares(actor: {
    id: string;
    email: string;
  }): Promise<QuorumShareExportResponse> {
    const kekResult = parseTrackWorkKekInput(process.env.TRACKWORK_KEK_HEX);
    if (!kekResult.ok) {
      throw new BadRequest(
        kekResult.error === 'missing-kek'
          ? 'TrackWork quorum KEK is not configured.'
          : 'TrackWork quorum KEK is malformed.'
      );
    }
    const kek = kekResult.kek;
    try {
      const keySetId = assertKeySetId('ks_' + randomBytes(16).toString('hex'));
      const result = generateTrackWorkShares(keySetId, kek, {
        random: randomBytes,
      });
      if (!result.ok) {
        throw new BadRequest('TrackWork share generation failed.');
      }
      const response: QuorumShareExportResponse = {
        keySetId,
        shareSetId: result.shareSetId,
        threshold: TRACKWORK_QUORUM_THRESHOLD,
        totalShares: TRACKWORK_QUORUM_SHARES,
        shares: result.shares.map(share => ({
          index: share.index,
          value: share.serialized,
        })),
      };
      await this.audit.log({
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'quorum-share-export-generated',
        targetType: 'trackwork-quorum',
        metadata: {
          keySetId,
          shareSetId: result.shareSetId,
          shareCount: TRACKWORK_QUORUM_SHARES,
          threshold: TRACKWORK_QUORUM_THRESHOLD,
        },
      });
      return response;
    } finally {
      kek.fill(0);
    }
  }
}
