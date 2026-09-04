/**
 * TrackWork quorum share primitive (OpenSpec 3.6).
 *
 * Pure 2-of-3 Shamir share generation + strict TrackWork share
 * representation. NO persistence, NO unlock state, NO ceremony runtime -
 * 3.8 (keyset verification artifact) and 3.9 (unlock) consume this layer.
 *
 * Generation identity is TWO-FOLD: KeySetId (KEK generation, unchanged on
 * reshare) and ShareSetId (share generation, changed on EVERY new split).
 * Mixed generations are rejected BEFORE the Shamir library combine() is
 * called; the library is never relied upon for duplicate/generation/
 * threshold semantics.
 */

import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';

import sss from 'shamirs-secret-sharing';

import { decodeStrictBase64Url, encodeBase64Url } from './envelope';
import type { KeySetId, ShareSetId } from './identifiers';
import { isKeySetId, parseShareSetId } from './identifiers';

export const TRACKWORK_SHARE_FORMAT_VERSION = 'twshare-v1';

export const TRACKWORK_SHARE_PREFIX_V1 = 'twshare-v1.';

export const TRACKWORK_QUORUM_SHARES = 3;

export const TRACKWORK_QUORUM_THRESHOLD = 2;

export const TRACKWORK_SHARE_BYTES = 82;

export const TRACKWORK_SHARE_INDEX_MIN = 1;

export const TRACKWORK_SHARE_INDEX_MAX = 255;

export const TRACKWORK_SHARE_MAX_SERIALIZED_LENGTH = 256;

const SHARE_ID_HEX_LENGTH = TRACKWORK_SHARE_INDEX_MAX.toString(16).length;

const PREFIX_RE = /^twshare-v(\d+)\./;

export type TrackWorkShareError =
  | 'invalid-kek-length'
  | 'invalid-key-set-id'
  | 'invalid-share-set-id'
  | 'invalid-share-parameters'
  | 'insufficient-shares'
  | 'mixed-key-set-id'
  | 'mixed-share-set-id'
  | 'duplicate-share-index'
  | 'index-mismatch'
  | 'malformed-share'
  | 'unsupported-version'
  | 'invalid-crc'
  | 'invalid-base64url'
  | 'oversized-share'
  | 'reconstruction-failed';

export type TrackWorkRandomSource = (size: number) => Uint8Array;

export interface TrackWorkShareRecord {
  keySetId: KeySetId;
  shareSetId: ShareSetId;
  index: number;
  /** 82-byte library share binary (32-byte KEK, 128-bit padding). */
  shareBytes: Uint8Array;
  serialized: string;
}

export type TrackWorkShareResult =
  | { ok: true; shareSetId: ShareSetId; shares: TrackWorkShareRecord[] }
  | { ok: false; error: TrackWorkShareError };

export type TrackWorkReconstructResult =
  | { ok: true; kek: Uint8Array }
  | { ok: false; error: TrackWorkShareError };

const defaultRandom: TrackWorkRandomSource = (size: number): Uint8Array =>
  randomBytes(size);

const crc32hex = (input: string): string =>
  (crc32(Buffer.from(input, 'utf8')) >>> 0).toString(16).padStart(8, '0');

const innerShareIndex = (shareBytes: Uint8Array): number | null => {
  const hex = Buffer.from(shareBytes).toString('hex');
  const stripped = hex[0] === '0' ? hex.slice(1) : hex;
  if (stripped.length < 1 + SHARE_ID_HEX_LENGTH) {
    return null;
  }
  const id = parseInt(stripped.slice(1, 1 + SHARE_ID_HEX_LENGTH), 16);
  return Number.isSafeInteger(id) &&
    id >= TRACKWORK_SHARE_INDEX_MIN &&
    id <= TRACKWORK_SHARE_INDEX_MAX
    ? id
    : null;
};

const serializeShare = (
  keySetId: KeySetId,
  shareSetId: ShareSetId,
  index: number,
  shareBytes: Uint8Array
): string => {
  const payload = [
    TRACKWORK_SHARE_FORMAT_VERSION,
    keySetId,
    shareSetId,
    String(index),
    encodeBase64Url(shareBytes),
  ].join('.');
  return `${payload}.${crc32hex(payload)}`;
};

/**
 * Strict canonical serializer; throws TypeError on invalid input
 * (programmer-facing contract; adversarial input goes through the parser).
 */
export const serializeTrackWorkShare = (
  share: TrackWorkShareRecord
): string => {
  if (!isKeySetId(share.keySetId)) {
    throw new TypeError('Invalid TrackWork KeySetId');
  }
  if (!parseShareSetId(share.shareSetId)) {
    throw new TypeError('Invalid TrackWork ShareSetId');
  }
  if (
    !Number.isSafeInteger(share.index) ||
    share.index < TRACKWORK_SHARE_INDEX_MIN ||
    share.index > TRACKWORK_SHARE_INDEX_MAX
  ) {
    throw new TypeError('Invalid TrackWork share index');
  }
  if (share.shareBytes.length !== TRACKWORK_SHARE_BYTES) {
    throw new TypeError('Invalid TrackWork share bytes');
  }
  return serializeShare(
    share.keySetId,
    share.shareSetId,
    share.index,
    share.shareBytes
  );
};

/**
 * Strict parser: canonical version magic, lowercase identifiers, integer
 * index, canonical unpadded base64url, CRC-32 over the full non-checksum
 * portion (error detection ONLY, never authentication). Unknown versions
 * fail closed; malformed input returns a coded error without exposing share
 * bytes.
 */
export const parseTrackWorkShare = (
  input: string
):
  | { ok: true; share: TrackWorkShareRecord }
  | { ok: false; error: TrackWorkShareError } => {
  if (typeof input !== 'string') {
    return { ok: false, error: 'malformed-share' };
  }
  if (input.length > TRACKWORK_SHARE_MAX_SERIALIZED_LENGTH) {
    return { ok: false, error: 'oversized-share' };
  }
  if (!input.startsWith('twshare')) {
    return { ok: false, error: 'malformed-share' };
  }
  const match = PREFIX_RE.exec(input);
  if (!match || Number(match[1]) !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }
  const parts = input.slice(match[0].length).split('.');
  if (parts.length !== 5 || parts.some(part => part.length === 0)) {
    return { ok: false, error: 'malformed-share' };
  }
  const [keySetIdText, shareSetIdText, indexText, payloadText, crcText] = parts;
  const keySetId = isKeySetId(keySetIdText) ? keySetIdText : null;
  if (!keySetId) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  const shareSetId = parseShareSetId(shareSetIdText);
  if (!shareSetId) {
    return { ok: false, error: 'invalid-share-set-id' };
  }
  if (!/^[1-9][0-9]*$/.test(indexText)) {
    return { ok: false, error: 'malformed-share' };
  }
  const index = Number(indexText);
  if (!Number.isSafeInteger(index) || index > TRACKWORK_SHARE_INDEX_MAX) {
    return { ok: false, error: 'malformed-share' };
  }
  const shareBytes = decodeStrictBase64Url(payloadText);
  if (!shareBytes) {
    return { ok: false, error: 'invalid-base64url' };
  }
  if (shareBytes.length !== TRACKWORK_SHARE_BYTES) {
    return { ok: false, error: 'malformed-share' };
  }
  const expectedCrc = crc32hex(
    `${TRACKWORK_SHARE_FORMAT_VERSION}.${keySetIdText}.${shareSetIdText}.${indexText}.${payloadText}`
  );
  if (!/^[0-9a-f]{8}$/.test(crcText) || crcText !== expectedCrc) {
    return { ok: false, error: 'invalid-crc' };
  }
  const share = {
    keySetId,
    shareSetId,
    index,
    shareBytes,
    serialized: input,
  };
  return { ok: true, share };
};

/**
 * Generate exactly 3 shares (threshold 2) of a 32-byte KEK.
 *
 * - fresh ShareSetId from the injected TrackWork CSPRNG;
 * - node:crypto.randomBytes is explicitly injected into the library
 *   (production default); the library default RNG is never used;
 * - randomness is injectable for deterministic TEST-ONLY vectors;
 * - no plaintext KEK retained in module/global state; no share persistence;
 *   no logging.
 */
export const generateTrackWorkShares = (
  keySetId: KeySetId,
  kek: Uint8Array,
  options: {
    shares?: number;
    threshold?: number;
    random?: TrackWorkRandomSource;
  } = {}
): TrackWorkShareResult => {
  const shareCount = options.shares ?? TRACKWORK_QUORUM_SHARES;
  const threshold = options.threshold ?? TRACKWORK_QUORUM_THRESHOLD;
  const random = options.random ?? defaultRandom;
  if (kek.length !== 32) {
    return { ok: false, error: 'invalid-kek-length' };
  }
  if (!isKeySetId(keySetId)) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  if (
    !Number.isSafeInteger(shareCount) ||
    !Number.isSafeInteger(threshold) ||
    threshold < TRACKWORK_QUORUM_THRESHOLD ||
    shareCount < threshold ||
    shareCount > TRACKWORK_SHARE_INDEX_MAX
  ) {
    return { ok: false, error: 'invalid-share-parameters' };
  }
  const shareSetId = parseShareSetId(
    'ss_' + Buffer.from(random(16)).toString('hex')
  );
  if (!shareSetId) {
    return { ok: false, error: 'invalid-share-set-id' };
  }
  let splitShares: Buffer[];
  try {
    splitShares = sss.split(Buffer.from(kek), {
      shares: shareCount,
      threshold,
      random: (size: number) => Buffer.from(random(size)),
    });
  } catch {
    return { ok: false, error: 'reconstruction-failed' };
  }
  if (splitShares.length !== shareCount) {
    return { ok: false, error: 'reconstruction-failed' };
  }
  const shares: TrackWorkShareRecord[] = splitShares.map((bytes, i) => {
    const index = i + 1;
    return {
      keySetId,
      shareSetId,
      index,
      shareBytes: new Uint8Array(bytes),
      serialized: '',
    };
  });
  for (const share of shares) {
    share.serialized = serializeTrackWorkShare(share);
  }
  return { ok: true, shareSetId, shares };
};

const validateRecord = (
  record: TrackWorkShareRecord
):
  | { ok: true; share: TrackWorkShareRecord }
  | { ok: false; error: TrackWorkShareError } => {
  if (!isKeySetId(record.keySetId)) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  if (!parseShareSetId(record.shareSetId)) {
    return { ok: false, error: 'invalid-share-set-id' };
  }
  if (
    !Number.isSafeInteger(record.index) ||
    record.index < TRACKWORK_SHARE_INDEX_MIN ||
    record.index > TRACKWORK_SHARE_INDEX_MAX
  ) {
    return { ok: false, error: 'malformed-share' };
  }
  if (
    !(record.shareBytes instanceof Uint8Array) ||
    record.shareBytes.length !== TRACKWORK_SHARE_BYTES
  ) {
    return { ok: false, error: 'malformed-share' };
  }
  return { ok: true, share: record };
};

/**
 * Reconstruct the 32-byte KEK from TrackWork share records or serialized
 * shares.
 *
 * PRE-COMBINE validation (strict, in order): parse/format validity; >=
 * threshold shares; same KeySetId; same ShareSetId; distinct indices; outer
 * index == inner Shamir x-coordinate; bounded sizes. Mixed generations and
 * duplicates are rejected BEFORE the library combine() is called.
 *
 * 3.6 semantics: successful reconstruction means the bytes equal the
 * original 32-byte KEK in tests. Persisted key-check verification belongs
 * to 3.8.
 */
export const reconstructTrackWorkKek = (
  input: (TrackWorkShareRecord | string)[]
): TrackWorkReconstructResult => {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'malformed-share' };
  }
  const records: TrackWorkShareRecord[] = [];
  for (const item of input) {
    const parsed =
      typeof item === 'string'
        ? parseTrackWorkShare(item)
        : validateRecord(item);
    if (!parsed.ok) {
      return parsed;
    }
    records.push(parsed.share);
  }
  if (records.length < TRACKWORK_QUORUM_THRESHOLD) {
    return { ok: false, error: 'insufficient-shares' };
  }
  const keySetId = records[0].keySetId;
  if (records.some(record => record.keySetId !== keySetId)) {
    return { ok: false, error: 'mixed-key-set-id' };
  }
  const shareSetId = records[0].shareSetId;
  if (records.some(record => record.shareSetId !== shareSetId)) {
    return { ok: false, error: 'mixed-share-set-id' };
  }
  const seen = new Set<number>();
  for (const record of records) {
    if (seen.has(record.index)) {
      return { ok: false, error: 'duplicate-share-index' };
    }
    seen.add(record.index);
    const inner = innerShareIndex(record.shareBytes);
    if (inner === null || inner !== record.index) {
      return { ok: false, error: 'index-mismatch' };
    }
  }
  let kek: Buffer;
  try {
    kek = sss.combine(records.map(record => Buffer.from(record.shareBytes)));
  } catch {
    return { ok: false, error: 'reconstruction-failed' };
  }
  return { ok: true, kek: new Uint8Array(kek) };
};
