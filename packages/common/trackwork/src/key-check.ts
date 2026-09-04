/**
 * TrackWork quorum key-check primitive (OpenSpec 3.8).
 *
 * Purpose-specific AES-256-GCM artifact that cryptographically binds a KEK
 * generation identity (KeySetId + current ShareSetId) so that a later unlock
 * can verify a reconstructed KEK even with zero wrapped DEKs. The decrypted
 * verification plaintext has NO semantic authority beyond successful AEAD
 * authentication.
 *
 * Format:
 *   twkcheck1.trackwork-key-check-v1.<keySetId>.<shareSetId>.<nonceB64url>.<ciphertextB64url>.<tagB64url>
 *
 * AAD: trackwork:key-check:v1 || 0x00 || keySetId || 0x00 || shareSetId
 * (injective NUL framing; domain-separated from trackwork:aead:v1 and
 * trackwork:kek-wrap:v1).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { decodeStrictBase64Url, encodeBase64Url } from './envelope';
import type { KeySetId, ShareSetId } from './identifiers';
import { isKeySetId, parseShareSetId } from './identifiers';
import type { TrackWorkRandomSource } from './quorum-shares';

export const TRACKWORK_KEY_CHECK_FORMAT_VERSION = 'twkcheck1';

export const TRACKWORK_KEY_CHECK_ALGORITHM = 'trackwork-key-check-v1';

export const TRACKWORK_KEY_CHECK_NONCE_BYTES = 12;

export const TRACKWORK_KEY_CHECK_TAG_BYTES = 16;

export const TRACKWORK_KEY_CHECK_PLAINTEXT_BYTES = 16;

export const TRACKWORK_KEY_CHECK_CIPHERTEXT_BYTES = 16;

export const TRACKWORK_KEY_CHECK_MAX_SERIALIZED_LENGTH = 256;

const PREFIX_RE = /^twkcheck(\d+)\./;

export type TrackWorkKeyCheckError =
  | 'invalid-kek-length'
  | 'invalid-key-set-id'
  | 'invalid-share-set-id'
  | 'malformed-key-check'
  | 'unsupported-version'
  | 'unsupported-algorithm'
  | 'key-check-authentication-failure';

export type TrackWorkKeyCheckResult =
  | { ok: true; keyCheck: string }
  | { ok: false; error: TrackWorkKeyCheckError };

export type TrackWorkKeyCheckVerifyResult =
  | { ok: true }
  | { ok: false; error: TrackWorkKeyCheckError };

const defaultRandom: TrackWorkRandomSource = (size: number): Uint8Array =>
  randomBytes(size);

/**
 * Injective framing: all alphabets (prefix, ks_, ss_) exclude NUL; the
 * first 0x00 uniquely splits each boundary.
 */
export const buildTrackWorkKeyCheckAuthenticatedBytes = (
  keySetId: KeySetId,
  shareSetId: ShareSetId
): Uint8Array =>
  new Uint8Array(
    Buffer.concat([
      Buffer.from('trackwork:key-check:v1', 'utf8'),
      Buffer.from([0x00]),
      Buffer.from(keySetId, 'utf8'),
      Buffer.from([0x00]),
      Buffer.from(shareSetId, 'utf8'),
    ])
  );

const validateKeysetIdentity = (
  keySetId: KeySetId,
  shareSetId: ShareSetId
): TrackWorkKeyCheckError | null => {
  if (!isKeySetId(keySetId)) {
    return 'invalid-key-set-id';
  }
  if (!parseShareSetId(shareSetId)) {
    return 'invalid-share-set-id';
  }
  return null;
};

/**
 * Create a canonical key-check artifact under a 32-byte KEK.
 *
 * - fresh random 12-byte nonce per creation (CSPRNG; no caller nonce in
 *   production; random is injectable for deterministic TEST-ONLY vectors);
 * - verification plaintext: 16 random bytes, zeroized best-effort after
 *   encryption (never returned, never persisted plaintext);
 * - strict parser contract with exact sizes.
 */
export const createTrackWorkKeyCheck = (
  kek: Uint8Array,
  keySetId: KeySetId,
  shareSetId: ShareSetId,
  random: TrackWorkRandomSource = defaultRandom
): TrackWorkKeyCheckResult => {
  if (kek.length !== 32) {
    return { ok: false, error: 'invalid-kek-length' };
  }
  const identityError = validateKeysetIdentity(keySetId, shareSetId);
  if (identityError) {
    return { ok: false, error: identityError };
  }
  const nonce = random(TRACKWORK_KEY_CHECK_NONCE_BYTES);
  const plaintext = random(TRACKWORK_KEY_CHECK_PLAINTEXT_BYTES);
  try {
    const cipher = createCipheriv('aes-256-gcm', kek, Buffer.from(nonce), {
      authTagLength: TRACKWORK_KEY_CHECK_TAG_BYTES,
    });
    cipher.setAAD(
      buildTrackWorkKeyCheckAuthenticatedBytes(keySetId, shareSetId)
    );
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext)),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      ok: true,
      keyCheck: [
        TRACKWORK_KEY_CHECK_FORMAT_VERSION,
        TRACKWORK_KEY_CHECK_ALGORITHM,
        keySetId,
        shareSetId,
        encodeBase64Url(new Uint8Array(nonce)),
        encodeBase64Url(new Uint8Array(ciphertext)),
        encodeBase64Url(new Uint8Array(tag)),
      ].join('.'),
    };
  } finally {
    plaintext.fill(0);
  }
};

/**
 * Strict parser + verification. Expected identifiers are compared BEFORE
 * crypto (mismatch -> coded invalid-* errors); wrong KEK or any byte
 * modification -> key-check-authentication-failure. Decrypted verification
 * bytes are zeroized and never returned.
 */
export const verifyTrackWorkKeyCheck = (
  serialized: string,
  kek: Uint8Array,
  expectedKeySetId: KeySetId,
  expectedShareSetId: ShareSetId
): TrackWorkKeyCheckVerifyResult => {
  if (kek.length !== 32) {
    return { ok: false, error: 'invalid-kek-length' };
  }
  if (typeof serialized !== 'string') {
    return { ok: false, error: 'malformed-key-check' };
  }
  if (serialized.length > TRACKWORK_KEY_CHECK_MAX_SERIALIZED_LENGTH) {
    return { ok: false, error: 'malformed-key-check' };
  }
  const match = PREFIX_RE.exec(serialized);
  if (!match || Number(match[1]) !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }
  const parts = serialized.slice(match[0].length).split('.');
  if (parts.length !== 6 || parts.some(part => part.length === 0)) {
    return { ok: false, error: 'malformed-key-check' };
  }
  const [
    algorithm,
    keySetIdText,
    shareSetIdText,
    nonceText,
    ciphertextText,
    tagText,
  ] = parts;
  if (algorithm !== TRACKWORK_KEY_CHECK_ALGORITHM) {
    return { ok: false, error: 'unsupported-algorithm' };
  }
  if (!isKeySetId(keySetIdText)) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  if (!parseShareSetId(shareSetIdText)) {
    return { ok: false, error: 'invalid-share-set-id' };
  }
  if (keySetIdText !== expectedKeySetId) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  if (shareSetIdText !== expectedShareSetId) {
    return { ok: false, error: 'invalid-share-set-id' };
  }
  const nonce = decodeStrictBase64Url(nonceText);
  if (!nonce || nonce.length !== TRACKWORK_KEY_CHECK_NONCE_BYTES) {
    return { ok: false, error: 'malformed-key-check' };
  }
  const ciphertext = decodeStrictBase64Url(ciphertextText);
  if (
    !ciphertext ||
    ciphertext.length !== TRACKWORK_KEY_CHECK_CIPHERTEXT_BYTES
  ) {
    return { ok: false, error: 'malformed-key-check' };
  }
  const tag = decodeStrictBase64Url(tagText);
  if (!tag || tag.length !== TRACKWORK_KEY_CHECK_TAG_BYTES) {
    return { ok: false, error: 'malformed-key-check' };
  }

  const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(nonce), {
    authTagLength: TRACKWORK_KEY_CHECK_TAG_BYTES,
  });
  decipher.setAAD(
    buildTrackWorkKeyCheckAuthenticatedBytes(
      keySetIdText as KeySetId,
      shareSetIdText as ShareSetId
    )
  );
  decipher.setAuthTag(Buffer.from(tag));

  let verification: Buffer;
  try {
    verification = Buffer.concat([
      decipher.update(Buffer.from(ciphertext)),
      decipher.final(),
    ]);
  } catch {
    return { ok: false, error: 'key-check-authentication-failure' };
  }
  verification.fill(0);
  return { ok: true };
};
