/**
 * TrackWork quorum metadata repository (OpenSpec 3.8).
 *
 * Installation-global SAFE metadata singleton (DB-enforced via PK + CHECK
 * id='current'): canonical KeySetId, current ShareSetId, quorum policy,
 * key-check artifact. ABSENT is distinct from MALFORMED/CORRUPT. No
 * arbitrary-id API; all reads use the canonical primary key.
 */

import { parseKeySetId, parseShareSetId } from '@affine/trackwork';
import type {
  TrackWorkKeyCheckError,
  TrackWorkKeyCheckVerifyResult,
  TrackWorkRandomSource,
  TrackWorkShareError,
} from '@affine/trackwork/crypto';
import {
  createTrackWorkKeyCheck,
  generateTrackWorkShares,
  verifyTrackWorkKeyCheck,
} from '@affine/trackwork/crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { AdminAuditService } from '../../core/audit';

export const TRACKWORK_QUORUM_METADATA_ID = 'current';

export const TRACKWORK_QUORUM_POLICY_THRESHOLD = 2;

export const TRACKWORK_QUORUM_POLICY_TOTAL_SHARES = 3;

export const TRACKWORK_QUORUM_METADATA_VERSION = 1;

export type TrackWorkQuorumMetadataError =
  | 'metadata-absent'
  | 'metadata-malformed'
  | 'unsupported-metadata-version'
  | 'invalid-key-set-id'
  | 'invalid-share-set-id'
  | 'invalid-quorum-policy'
  | 'invalid-key-check'
  | 'key-check-authentication-failure'
  | 'metadata-revision-conflict'
  | 'metadata-enrollment-conflict';

export interface TrackWorkQuorumMetadataRow {
  keySetId: string;
  shareSetId: string;
  threshold: number;
  totalShares: number;
  keyCheck: string;
  metadataVersion: number;
  revision: number;
}

export type TrackWorkQuorumReadResult =
  | { ok: true; row: TrackWorkQuorumMetadataRow }
  | { ok: false; error: TrackWorkQuorumMetadataError };

export type TrackWorkEnrollmentResult =
  | {
      ok: true;
      row: TrackWorkQuorumMetadataRow;
      shareSetId: string;
      shares: Array<{ index: number; value: string }>;
    }
  | { ok: false; error: TrackWorkQuorumMetadataError };

export type TrackWorkReshareResult =
  | {
      ok: true;
      row: TrackWorkQuorumMetadataRow;
      shareSetId: string;
      shares: Array<{ index: number; value: string }>;
    }
  | { ok: false; error: TrackWorkQuorumMetadataError };

const mapShareError = (
  error: TrackWorkShareError
): TrackWorkQuorumMetadataError =>
  error === 'invalid-key-set-id' ? 'invalid-key-set-id' : 'metadata-malformed';

const mapKeyCheckError = (
  error: TrackWorkKeyCheckError
): TrackWorkQuorumMetadataError =>
  error === 'key-check-authentication-failure'
    ? 'key-check-authentication-failure'
    : 'invalid-key-check';

const validateRow = (row: {
  keySetId: string;
  shareSetId: string;
  threshold: number;
  totalShares: number;
  metadataVersion: number;
}): TrackWorkQuorumMetadataError | null => {
  if (row.metadataVersion !== TRACKWORK_QUORUM_METADATA_VERSION) {
    return 'unsupported-metadata-version';
  }
  if (
    row.threshold !== TRACKWORK_QUORUM_POLICY_THRESHOLD ||
    row.totalShares !== TRACKWORK_QUORUM_POLICY_TOTAL_SHARES
  ) {
    return 'invalid-quorum-policy';
  }
  if (!parseKeySetId(row.keySetId)) {
    return 'invalid-key-set-id';
  }
  if (!parseShareSetId(row.shareSetId)) {
    return 'invalid-share-set-id';
  }
  return null;
};

@Injectable()
export class TrackWorkQuorumMetadataService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AdminAuditService
  ) {}

  async readCurrent(): Promise<TrackWorkQuorumReadResult> {
    const row = await this.prisma.trackWorkQuorumMetadata.findUnique({
      where: { id: TRACKWORK_QUORUM_METADATA_ID },
    });
    if (!row) {
      return { ok: false, error: 'metadata-absent' };
    }
    const validationError = validateRow(row);
    if (validationError) {
      return { ok: false, error: validationError };
    }
    return {
      ok: true,
      row: {
        keySetId: row.keySetId,
        shareSetId: row.shareSetId,
        threshold: row.threshold,
        totalShares: row.totalShares,
        keyCheck: row.keyCheck,
        metadataVersion: row.metadataVersion,
        revision: row.revision,
      },
    };
  }

  /** Atomic first enrollment: complete row created in ONE transaction. */
  async enroll(
    kek: Uint8Array,
    actor: { id: string; email: string },
    random: TrackWorkRandomSource
  ): Promise<TrackWorkEnrollmentResult> {
    const keySetId = 'ks_' + Buffer.from(random(16)).toString('hex');
    const generated = generateTrackWorkShares(
      parseKeySetId(keySetId) as never,
      kek,
      { random }
    );
    if (!generated.ok) {
      return { ok: false, error: mapShareError(generated.error) };
    }
    const keyCheckResult = createTrackWorkKeyCheck(
      kek,
      generated.shares[0].keySetId,
      generated.shareSetId,
      random
    );
    if (!keyCheckResult.ok) {
      return { ok: false, error: mapKeyCheckError(keyCheckResult.error) };
    }
    const row: TrackWorkQuorumMetadataRow = {
      keySetId: generated.shares[0].keySetId,
      shareSetId: generated.shareSetId,
      threshold: TRACKWORK_QUORUM_POLICY_THRESHOLD,
      totalShares: TRACKWORK_QUORUM_POLICY_TOTAL_SHARES,
      keyCheck: keyCheckResult.keyCheck,
      metadataVersion: TRACKWORK_QUORUM_METADATA_VERSION,
      revision: 1,
    };
    try {
      await this.prisma.$transaction(async tx => {
        await tx.trackWorkQuorumMetadata.create({
          data: { id: TRACKWORK_QUORUM_METADATA_ID, ...row },
        });
        await this.audit.logInTx(tx, {
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'quorum-metadata-created',
          targetType: 'trackwork-quorum',
          metadata: {
            keySetId: row.keySetId,
            shareSetId: row.shareSetId,
            revision: row.revision,
            threshold: row.threshold,
            totalShares: row.totalShares,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { ok: false, error: 'metadata-enrollment-conflict' };
      }
      throw error;
    }
    return {
      ok: true,
      row,
      shareSetId: row.shareSetId,
      shares: generated.shares.map(share => ({
        index: share.index,
        value: share.serialized,
      })),
    };
  }

  /**
   * Reshare/export CAS. REQUIRED precondition: the current env KEK must
   * verify against the persisted key-check BEFORE any generation (a changed
   * TRACKWORK_KEK_HEX must never bind a new ShareSetId to an old KeySetId).
   */
  async reshare(
    kek: Uint8Array,
    expectedRevision: number,
    actor: { id: string; email: string },
    random: TrackWorkRandomSource
  ): Promise<TrackWorkReshareResult> {
    const read = await this.readCurrent();
    if (!read.ok) {
      return read;
    }
    const { row } = read;
    const verification: TrackWorkKeyCheckVerifyResult = verifyTrackWorkKeyCheck(
      row.keyCheck,
      kek,
      parseKeySetId(row.keySetId) as never,
      parseShareSetId(row.shareSetId) as never
    );
    if (!verification.ok) {
      return { ok: false, error: mapKeyCheckError(verification.error) };
    }
    const generated = generateTrackWorkShares(
      parseKeySetId(row.keySetId) as never,
      kek,
      { random }
    );
    if (!generated.ok) {
      return { ok: false, error: mapShareError(generated.error) };
    }
    const keyCheckResult = createTrackWorkKeyCheck(
      kek,
      generated.shares[0].keySetId,
      generated.shareSetId,
      random
    );
    if (!keyCheckResult.ok) {
      return { ok: false, error: mapKeyCheckError(keyCheckResult.error) };
    }
    const newRevision = expectedRevision + 1;
    let affected = 0;
    await this.prisma.$transaction(async tx => {
      const result = await tx.trackWorkQuorumMetadata.updateMany({
        where: {
          id: TRACKWORK_QUORUM_METADATA_ID,
          revision: expectedRevision,
        },
        data: {
          shareSetId: generated.shareSetId,
          keyCheck: keyCheckResult.keyCheck,
          revision: newRevision,
        },
      });
      affected = result.count;
      if (affected === 1) {
        await this.audit.logInTx(tx, {
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'quorum-metadata-updated',
          targetType: 'trackwork-quorum',
          metadata: {
            keySetId: row.keySetId,
            shareSetId: generated.shareSetId,
            revision: newRevision,
            threshold: row.threshold,
            totalShares: row.totalShares,
          },
        });
      }
    });
    if (affected !== 1) {
      return { ok: false, error: 'metadata-revision-conflict' };
    }
    return {
      ok: true,
      row: {
        keySetId: row.keySetId,
        shareSetId: generated.shareSetId,
        threshold: row.threshold,
        totalShares: row.totalShares,
        keyCheck: keyCheckResult.keyCheck,
        metadataVersion: row.metadataVersion,
        revision: newRevision,
      },
      shareSetId: generated.shareSetId,
      shares: generated.shares.map(share => ({
        index: share.index,
        value: share.serialized,
      })),
    };
  }
}
