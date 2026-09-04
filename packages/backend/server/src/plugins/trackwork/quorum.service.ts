/**
 * TrackWork quorum share export (OpenSpec 3.7 + canonical metadata 3.8).
 *
 * PROVISIONING-CANONICAL: the export is bound to the persisted canonical
 * keyset metadata. Absent metadata -> atomic enrollment (first canonical
 * KeySetId). Existing metadata -> the current env KEK MUST verify against
 * the persisted key-check before reshare (a changed TRACKWORK_KEK_HEX never
 * binds a new ShareSetId to an old KeySetId). Shares returned ONCE; nothing
 * persisted except safe metadata + key-check artifact.
 */

import { randomBytes } from 'node:crypto';

import { parseTrackWorkKekInput } from '@affine/trackwork/crypto';
import { Injectable } from '@nestjs/common';

import { BadRequest } from '../../base';
import { TrackWorkQuorumMetadataService } from './quorum-metadata.service';

export interface QuorumShareExportResponse {
  keySetId: string;
  shareSetId: string;
  threshold: number;
  totalShares: number;
  shares: Array<{ index: number; value: string }>;
}

@Injectable()
export class QuorumShareExportService {
  constructor(private readonly metadata: TrackWorkQuorumMetadataService) {}

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
      const read = await this.metadata.readCurrent();
      if (!read.ok && read.error !== 'metadata-absent') {
        throw new BadRequest('TrackWork quorum metadata is invalid.');
      }
      if (!read.ok) {
        const enrolled = await this.metadata.enroll(kek, actor, randomBytes);
        if (!enrolled.ok) {
          throw new BadRequest('TrackWork quorum enrollment failed.');
        }
        return {
          keySetId: enrolled.row.keySetId,
          shareSetId: enrolled.shareSetId,
          threshold: enrolled.row.threshold,
          totalShares: enrolled.row.totalShares,
          shares: enrolled.shares,
        };
      }
      const reshared = await this.metadata.reshare(
        kek,
        read.row.revision,
        actor,
        randomBytes
      );
      if (!reshared.ok) {
        throw new BadRequest(
          reshared.error === 'key-check-authentication-failure'
            ? 'TrackWork quorum KEK does not match the persisted keyset metadata.'
            : reshared.error === 'metadata-revision-conflict'
              ? 'TrackWork quorum metadata changed concurrently. Retry the export.'
              : 'TrackWork quorum metadata is invalid.'
        );
      }
      return {
        keySetId: reshared.row.keySetId,
        shareSetId: reshared.shareSetId,
        threshold: reshared.row.threshold,
        totalShares: reshared.row.totalShares,
        shares: reshared.shares,
      };
    } finally {
      kek.fill(0);
    }
  }
}
