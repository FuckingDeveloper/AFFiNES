/**
 * TrackWork encrypted-value envelope V1 - persisted FORMAT/MODEL only
 * (OpenSpec 3.3). No encryption/decryption, no key material, no crypto
 * execution. 3.4 owns authenticated encryption through a crypto service.
 *
 * Canonical serialized grammar (compact prefixed text, repository precedent:
 * the `ut_`-prefixed access-token format):
 *
 *   twenc1.<algorithm>.<dataKeyId>.<nonceB64url>.<ciphertextB64url>.<tagB64url>
 *
 * - version is unmistakable before decryption (the `twenc1.` magic);
 * - binary fields use canonical base64url (URL-safe, unpadded);
 * - nonce MUST decode to exactly 12 bytes, tag to exactly 16 bytes;
 * - a value that CLAIMS the envelope prefix but is malformed MUST fail as
 *   malformed-new-envelope and MUST NOT fall back to legacy/plaintext;
 * - the envelope carries NO AAD context (domain/fieldPurpose/record) - AAD is
 *   caller-derived (see aad.ts), so an envelope cannot self-authorize a move.
 */

import type { DataKeyId } from './identifiers';
import { assertDataKeyId, parseDataKeyId } from './identifiers';

export const TRACKWORK_ENVELOPE_VERSION_V1 = 1;

export const TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1 = 'trackwork-aead-v1';

export const TRACKWORK_ENVELOPE_PREFIX_V1 = 'twenc1.';

export const TRACKWORK_ENVELOPE_NONCE_BYTES = 12;

export const TRACKWORK_ENVELOPE_TAG_BYTES = 16;

export const TRACKWORK_ENVELOPE_MAX_SERIALIZED_LENGTH = 65536;

export const TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES = 32768;

export interface TrackWorkEncryptedValueEnvelopeV1 {
  version: typeof TRACKWORK_ENVELOPE_VERSION_V1;
  algorithm: typeof TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1;
  /** DataKeyId - the DEK generation; NEVER a KeySetId. */
  keyId: DataKeyId;
  /** Exactly TRACKWORK_ENVELOPE_NONCE_BYTES bytes. */
  nonce: Uint8Array;
  /** Opaque ciphertext bytes (GCM ciphertext length == plaintext length). */
  ciphertext: Uint8Array;
  /** Exactly TRACKWORK_ENVELOPE_TAG_BYTES bytes. */
  tag: Uint8Array;
}

export type TrackWorkEnvelopeParseError =
  | 'not-new-envelope'
  | 'malformed-envelope'
  | 'unsupported-version'
  | 'unsupported-algorithm'
  | 'invalid-data-key-id'
  | 'invalid-base64url'
  | 'wrong-nonce-length'
  | 'wrong-tag-length'
  | 'oversized-envelope';

export type TrackWorkEnvelopeParseResult =
  | { ok: true; envelope: TrackWorkEncryptedValueEnvelopeV1 }
  | { ok: false; error: TrackWorkEnvelopeParseError };

export type TrackWorkValueClassification =
  | 'new-envelope-v1'
  | 'malformed-new-envelope'
  | 'not-new-envelope';

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const PREFIX_RE = /^twenc(\d+)\./;

/** Low-level canonical base64url decoder (internal utility for package crypto modules). */
export const decodeStrictBase64Url = (input: string): Uint8Array | null => {
  if (!input || !BASE64URL_RE.test(input) || input.length % 4 === 1) {
    return null;
  }
  const buf = Buffer.from(input, 'base64url');
  if (buf.toString('base64url') !== input) {
    return null;
  }
  return new Uint8Array(buf);
};

export const encodeBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url');

const isNonEmptyBytes = (bytes: Uint8Array): boolean => bytes.length > 0;

/** Canonical serialization; throws TypeError for invalid (programmer-facing) input. */
export const serializeTrackWorkEnvelopeV1 = (
  envelope: TrackWorkEncryptedValueEnvelopeV1
): string => {
  if (envelope.version !== TRACKWORK_ENVELOPE_VERSION_V1) {
    throw new TypeError('Unsupported TrackWork envelope version');
  }
  if (envelope.algorithm !== TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1) {
    throw new TypeError('Unsupported TrackWork envelope algorithm');
  }
  assertDataKeyId(envelope.keyId);
  if (envelope.nonce.length !== TRACKWORK_ENVELOPE_NONCE_BYTES) {
    throw new TypeError('Invalid TrackWork envelope nonce length');
  }
  if (envelope.tag.length !== TRACKWORK_ENVELOPE_TAG_BYTES) {
    throw new TypeError('Invalid TrackWork envelope tag length');
  }
  if (!isNonEmptyBytes(envelope.ciphertext)) {
    throw new TypeError('Invalid TrackWork envelope ciphertext');
  }
  if (envelope.ciphertext.length > TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES) {
    throw new TypeError('TrackWork envelope ciphertext exceeds the size limit');
  }
  const serialized = [
    TRACKWORK_ENVELOPE_PREFIX_V1.slice(0, -1),
    envelope.algorithm,
    envelope.keyId,
    encodeBase64Url(envelope.nonce),
    encodeBase64Url(envelope.ciphertext),
    encodeBase64Url(envelope.tag),
  ].join('.');
  if (serialized.length > TRACKWORK_ENVELOPE_MAX_SERIALIZED_LENGTH) {
    throw new TypeError('TrackWork envelope exceeds the serialized size limit');
  }
  return serialized;
};

export const parseTrackWorkEnvelopeV1 = (
  value: string
): TrackWorkEnvelopeParseResult => {
  if (typeof value !== 'string') {
    return { ok: false, error: 'malformed-envelope' };
  }
  if (!value.startsWith('twenc')) {
    return { ok: false, error: 'not-new-envelope' };
  }
  if (value.length > TRACKWORK_ENVELOPE_MAX_SERIALIZED_LENGTH) {
    return { ok: false, error: 'oversized-envelope' };
  }

  const match = PREFIX_RE.exec(value);
  if (!match) {
    return { ok: false, error: 'malformed-envelope' };
  }
  const version = Number(match[1]);
  if (version !== TRACKWORK_ENVELOPE_VERSION_V1) {
    return { ok: false, error: 'unsupported-version' };
  }

  const rest = value.slice(match[0].length);
  const parts = rest.split('.');
  if (parts.length !== 5 || parts.some(part => part.length === 0)) {
    return { ok: false, error: 'malformed-envelope' };
  }
  const [algorithm, keyIdText, nonceText, ciphertextText, tagText] = parts;

  if (algorithm !== TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1) {
    return { ok: false, error: 'unsupported-algorithm' };
  }

  const keyId = parseDataKeyId(keyIdText);
  if (!keyId) {
    return { ok: false, error: 'invalid-data-key-id' };
  }

  const nonce = decodeStrictBase64Url(nonceText);
  if (!nonce) {
    return { ok: false, error: 'invalid-base64url' };
  }
  if (nonce.length !== TRACKWORK_ENVELOPE_NONCE_BYTES) {
    return { ok: false, error: 'wrong-nonce-length' };
  }

  const tag = decodeStrictBase64Url(tagText);
  if (!tag) {
    return { ok: false, error: 'invalid-base64url' };
  }
  if (tag.length !== TRACKWORK_ENVELOPE_TAG_BYTES) {
    return { ok: false, error: 'wrong-tag-length' };
  }

  const ciphertext = decodeStrictBase64Url(ciphertextText);
  if (!ciphertext) {
    return { ok: false, error: 'invalid-base64url' };
  }
  if (!isNonEmptyBytes(ciphertext)) {
    return { ok: false, error: 'malformed-envelope' };
  }
  if (ciphertext.length > TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES) {
    return { ok: false, error: 'oversized-envelope' };
  }

  return {
    ok: true,
    envelope: { version, algorithm, keyId, nonce, ciphertext, tag },
  };
};

/**
 * Classification for future migration:
 *
 * - `new-envelope-v1`: canonical V1 envelope;
 * - `malformed-new-envelope`: claims the envelope magic but is invalid - MUST
 *   fail closed, NEVER downgrade to legacy decrypt or plaintext;
 * - `not-new-envelope`: no TrackWork envelope marker - the caller applies the
 *   per-field legacy classification (plaintext vs CryptoHelper legacy
 *   ciphertext) from the 3.1 contract, never inferred from a failed parse.
 */
export const classifyTrackWorkValue = (
  value: string
): TrackWorkValueClassification => {
  if (typeof value !== 'string') {
    return 'not-new-envelope';
  }
  if (!value.startsWith('twenc')) {
    return 'not-new-envelope';
  }
  return parseTrackWorkEnvelopeV1(value).ok
    ? 'new-envelope-v1'
    : 'malformed-new-envelope';
};
