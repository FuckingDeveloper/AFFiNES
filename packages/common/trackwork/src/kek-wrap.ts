/**
 * TrackWork KEK wrapping / key hierarchy (OpenSpec 3.5).
 *
 * KEK -> wraps DEK -> DEK encrypts TrackWork values.
 *
 * - KEK: 32-byte external/bootstrap secret supplied through
 *   configuration/environment (canonical env contract: TRACKWORK_KEK_HEX, 64
 *   hex chars). No random fallback for persistent data, no plaintext storage,
 *   no logging, no committed default, deterministic across restart.
 * - Wrapping: AES-256-GCM via node:crypto; fresh random 12-byte nonce per
 *   wrap; 16-byte tag; wrapping AAD binds format version, purpose, KeySetId
 *   and DataKeyId (see buildTrackWorkWrapAuthenticatedBytes).
 * - The wrapped-DEK representation never contains plaintext key material.
 * - The global locked-mode state machine (3.9+) is NOT implemented here; only
 *   the lower-level behavior it will consume.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { TRACKWORK_DEK_BYTES } from './crypto-service';
import { decodeStrictBase64Url, encodeBase64Url } from './envelope';
import type { DataKeyId, KeySetId } from './identifiers';
import { assertDataKeyId, parseDataKeyId, parseKeySetId } from './identifiers';

export const TRACKWORK_KEK_BYTES = 32;

export const TRACKWORK_WRAP_ALGORITHM = 'trackwork-wrap-v1';

export const TRACKWORK_WRAP_PREFIX_V1 = 'twkwrap1.';

export const TRACKWORK_WRAP_NONCE_BYTES = 12;

export const TRACKWORK_WRAP_TAG_BYTES = 16;

export const TRACKWORK_WRAP_MAX_SERIALIZED_LENGTH = 512;

const KEK_HEX_RE = /^[0-9a-fA-F]{64}$/;

const PREFIX_RE = /^twkwrap(\d+)\./;

export type TrackWorkKekInputError = 'missing-kek' | 'malformed-kek';

export type TrackWorkKekInputResult =
  | { ok: true; kek: Uint8Array }
  | { ok: false; error: TrackWorkKekInputError };

export type TrackWorkKekWrapError =
  | 'malformed-wrapped-key'
  | 'unsupported-version'
  | 'unsupported-algorithm'
  | 'invalid-key-set-id'
  | 'invalid-data-key-id'
  | 'invalid-kek-length'
  | 'authentication-failure';

export type TrackWorkGenerateDataKeyResult =
  | {
      ok: true;
      dataKeyId: DataKeyId;
      plaintextDataKey: Uint8Array;
      wrappedDataKey: string;
    }
  | { ok: false; error: TrackWorkKekWrapError };

export type TrackWorkUnwrapResult =
  | {
      ok: true;
      keySetId: KeySetId;
      dataKeyId: DataKeyId;
      dataKey: Uint8Array;
    }
  | { ok: false; error: TrackWorkKekWrapError };

export type TrackWorkRewrapResult =
  | {
      ok: true;
      keySetId: KeySetId;
      dataKeyId: DataKeyId;
      wrappedDataKey: string;
    }
  | { ok: false; error: TrackWorkKekWrapError };

/**
 * Strict KEK input contract: exactly 64 hex chars (32 bytes).
 *
 * Missing/empty -> 'missing-kek'; malformed -> 'malformed-kek'. There is NO
 * random fallback: persistent wrapped DEKs must stay deterministic across
 * restarts, and a missing/misconfigured KEK must fail closed once the
 * feature is enabled.
 */
export const parseTrackWorkKekInput = (
  value: string | undefined
): TrackWorkKekInputResult => {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, error: 'missing-kek' };
  }
  if (!KEK_HEX_RE.test(value)) {
    return { ok: false, error: 'malformed-kek' };
  }
  return { ok: true, kek: new Uint8Array(Buffer.from(value, 'hex')) };
};

/**
 * Wrapping AAD: canonical framing
 *
 *   trackwork:kek-wrap:v1 || 0x00 || <keySetId> || 0x00 || <dataKeyId>
 *
 * Injective: the wrap prefix alphabet and both identifier alphabets
 * (ks_/dk_ + [0-9a-f]) exclude NUL, so the framing is unambiguous. The
 * purpose/domain identifier `trackwork:kek-wrap:v1` separates wrapping from
 * value encryption (value AAD domain is `trackwork:aead:v1:...`).
 */
export const buildTrackWorkWrapAuthenticatedBytes = (
  keySetId: KeySetId,
  dataKeyId: DataKeyId
): Uint8Array =>
  new Uint8Array(
    Buffer.concat([
      Buffer.from('trackwork:kek-wrap:v1', 'utf8'),
      Buffer.from([0x00]),
      Buffer.from(keySetId, 'utf8'),
      Buffer.from([0x00]),
      Buffer.from(dataKeyId, 'utf8'),
    ])
  );

const wrapBytes = (
  dataKey: Uint8Array,
  keySetId: KeySetId,
  dataKeyId: DataKeyId,
  kek: Uint8Array
): string => {
  const nonce = randomBytes(TRACKWORK_WRAP_NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', kek, nonce, {
    authTagLength: TRACKWORK_WRAP_TAG_BYTES,
  });
  cipher.setAAD(buildTrackWorkWrapAuthenticatedBytes(keySetId, dataKeyId));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(dataKey)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    TRACKWORK_WRAP_PREFIX_V1.slice(0, -1),
    TRACKWORK_WRAP_ALGORITHM,
    keySetId,
    dataKeyId,
    encodeBase64Url(new Uint8Array(nonce)),
    encodeBase64Url(new Uint8Array(ciphertext)),
    encodeBase64Url(new Uint8Array(tag)),
  ].join('.');
};

const unwrapBytes = (
  wrapped: string,
  kek: Uint8Array
): TrackWorkUnwrapResult => {
  if (kek.length !== TRACKWORK_KEK_BYTES) {
    return { ok: false, error: 'invalid-kek-length' };
  }
  if (typeof wrapped !== 'string') {
    return { ok: false, error: 'malformed-wrapped-key' };
  }
  if (wrapped.length > TRACKWORK_WRAP_MAX_SERIALIZED_LENGTH) {
    return { ok: false, error: 'malformed-wrapped-key' };
  }
  const match = PREFIX_RE.exec(wrapped);
  if (!match) {
    return { ok: false, error: 'malformed-wrapped-key' };
  }
  if (Number(match[1]) !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }
  const parts = wrapped.slice(match[0].length).split('.');
  if (parts.length !== 6 || parts.some(part => part.length === 0)) {
    return { ok: false, error: 'malformed-wrapped-key' };
  }
  const [
    algorithm,
    keySetIdText,
    dataKeyIdText,
    nonceText,
    ciphertextText,
    tagText,
  ] = parts;
  if (algorithm !== TRACKWORK_WRAP_ALGORITHM) {
    return { ok: false, error: 'unsupported-algorithm' };
  }
  const keySetId = parseKeySetId(keySetIdText);
  if (!keySetId) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  const dataKeyId = parseDataKeyId(dataKeyIdText);
  if (!dataKeyId) {
    return { ok: false, error: 'invalid-data-key-id' };
  }
  const nonce = decodeStrictBase64Url(nonceText);
  if (!nonce || nonce.length !== TRACKWORK_WRAP_NONCE_BYTES) {
    return { ok: false, error: 'malformed-wrapped-key' };
  }
  const tag = decodeStrictBase64Url(tagText);
  if (!tag || tag.length !== TRACKWORK_WRAP_TAG_BYTES) {
    return { ok: false, error: 'malformed-wrapped-key' };
  }
  const ciphertext = decodeStrictBase64Url(ciphertextText);
  if (!ciphertext || ciphertext.length !== TRACKWORK_DEK_BYTES) {
    return { ok: false, error: 'malformed-wrapped-key' };
  }

  const decipher = createDecipheriv('aes-256-gcm', kek, Buffer.from(nonce), {
    authTagLength: TRACKWORK_WRAP_TAG_BYTES,
  });
  decipher.setAAD(buildTrackWorkWrapAuthenticatedBytes(keySetId, dataKeyId));
  decipher.setAuthTag(Buffer.from(tag));

  let dataKey: Buffer;
  try {
    dataKey = Buffer.concat([
      decipher.update(Buffer.from(ciphertext)),
      decipher.final(),
    ]);
  } catch {
    return { ok: false, error: 'authentication-failure' };
  }

  return { ok: true, keySetId, dataKeyId, dataKey: new Uint8Array(dataKey) };
};

/**
 * Generate a fresh 32-byte DEK, assign a new DataKeyId (CSPRNG-derived,
 * non-secret identifier) and return the wrapped form under the given KEK.
 *
 * The plaintext DEK is returned once to the caller; ownership and best-effort
 * zeroization are the caller's responsibility. No global plaintext DEK cache.
 */
export const generateTrackWorkDataKey = (
  keySetId: KeySetId,
  kek: Uint8Array
): TrackWorkGenerateDataKeyResult => {
  if (kek.length !== TRACKWORK_KEK_BYTES) {
    return { ok: false, error: 'invalid-kek-length' };
  }
  if (!parseKeySetId(keySetId)) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  const dataKey = randomBytes(TRACKWORK_DEK_BYTES);
  const dataKeyId = assertDataKeyId('dk_' + randomBytes(16).toString('hex'));
  return {
    ok: true,
    dataKeyId,
    plaintextDataKey: new Uint8Array(dataKey),
    wrappedDataKey: wrapBytes(dataKey, keySetId, dataKeyId, kek),
  };
};

/**
 * Unwrap a wrapped DEK; returns the DEK only on authenticated success.
 * Wrong KEK, any metadata substitution, or any byte modification fails
 * closed (authentication-failure or pre-crypto validation).
 */
export const unwrapTrackWorkDataKey = (
  wrapped: string,
  kek: Uint8Array
): TrackWorkUnwrapResult => unwrapBytes(wrapped, kek);

/**
 * Pure rewrap primitive for KEK/KeySet rotation: unwrap with the old KEK and
 * rewrap the SAME DEK (same DataKeyId) under a new KeySetId and new KEK.
 * Value ciphertext does NOT need re-encryption when the DEK is preserved.
 */
export const rewrapTrackWorkDataKey = (
  wrapped: string,
  oldKek: Uint8Array,
  newKek: Uint8Array,
  newKeySetId: KeySetId
): TrackWorkRewrapResult => {
  const unwrapped = unwrapBytes(wrapped, oldKek);
  if (!unwrapped.ok) {
    return unwrapped;
  }
  if (newKek.length !== TRACKWORK_KEK_BYTES) {
    return { ok: false, error: 'invalid-kek-length' };
  }
  if (!parseKeySetId(newKeySetId)) {
    return { ok: false, error: 'invalid-key-set-id' };
  }
  return {
    ok: true,
    keySetId: newKeySetId,
    dataKeyId: unwrapped.dataKeyId,
    wrappedDataKey: wrapBytes(
      unwrapped.dataKey,
      newKeySetId,
      unwrapped.dataKeyId,
      newKek
    ),
  };
};
