/**
 * TrackWork authenticated crypto service (OpenSpec 3.4).
 *
 * AES-256-GCM via node:crypto ONLY. The DEK is a raw 32-byte CSPRNG key; no
 * KEK, no wrapping, no shares, no persistence - 3.5+ owns key management.
 * Envelope output/input is the canonical V1 format from 3.3; AAD is always
 * caller-derived (never self-authorized by the envelope).
 *
 * Errors are stable non-secret codes; no plaintext, key, nonce, tag,
 * ciphertext, AAD or secret value ever appears in an error or log.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { TrackWorkAadContext } from './aad';

import { serializeTrackWorkAad } from './aad';
import type { TrackWorkEncryptedValueEnvelopeV1 } from './envelope';
import {
  parseTrackWorkEnvelopeV1,
  serializeTrackWorkEnvelopeV1,
  TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1,
  TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES,
  TRACKWORK_ENVELOPE_NONCE_BYTES,
  TRACKWORK_ENVELOPE_TAG_BYTES,
  TRACKWORK_ENVELOPE_VERSION_V1,
} from './envelope';
import type { DataKeyId } from './identifiers';

import { isDataKeyId } from './identifiers';

export const TRACKWORK_DEK_BYTES = 32;

/**
 * Authenticated metadata fed to AES-GCM setAAD():
 *
 *   canonicalCallerAadBytes || 0x00 || canonicalDataKeyIdBytes
 *
 * The DataKeyId is envelope metadata whose integrity is cryptographically
 * bound here (preventing metadata substitution / key confusion) while the
 * caller-derived semantic context remains the authoritative AAD. This is a
 * documented OpenSpec 3.4 extension; the canonical 3.2 caller-AAD string is
 * unchanged and the envelope still never self-authorizes
 * domain/fieldPurpose/stableRecordId.
 *
 * Injectivity: the canonical AAD alphabet ([A-Za-z0-9:.-]) and the DataKeyId
 * alphabet (dk_ + [0-9a-f]) both exclude NUL (0x00), so the first NUL splits
 * the byte string uniquely - no ambiguous concatenation is possible.
 */
export const buildTrackWorkAuthenticatedBytes = (
  canonicalAad: string,
  dataKeyId: DataKeyId
): Uint8Array =>
  new Uint8Array(
    Buffer.concat([
      Buffer.from(canonicalAad, 'utf8'),
      Buffer.from([0x00]),
      Buffer.from(dataKeyId, 'utf8'),
    ])
  );

export type TrackWorkCryptoError =
  | 'invalid-data-key-length'
  | 'invalid-aad-context'
  | 'invalid-plaintext'
  | 'oversized-plaintext'
  | 'invalid-data-key-id'
  | 'key-id-mismatch'
  | 'malformed-envelope'
  | 'unsupported-version'
  | 'unsupported-algorithm'
  | 'authentication-failure';

export type TrackWorkEncryptResult =
  | { ok: true; envelope: string; keyId: DataKeyId }
  | { ok: false; error: TrackWorkCryptoError };

export type TrackWorkDecryptResult =
  | { ok: true; plaintext: Uint8Array; keyId: DataKeyId }
  | { ok: false; error: TrackWorkCryptoError };

/** 32 random bytes from the runtime CSPRNG. */
export const generateTrackWorkDataEncryptionKey = (): Uint8Array =>
  randomBytes(TRACKWORK_DEK_BYTES);

/**
 * Authenticated encryption of a designated application value.
 *
 * - nonce: 12 random bytes, fresh per encryption (never derived from IDs);
 * - tag: 16 bytes;
 * - AAD: canonical caller-derived context (invalid context -> error);
 * - plaintext MUST be non-empty and <= TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES;
 * - the DataKeyId is supplied by the caller (key metadata belongs to 3.5+).
 */
export const encryptTrackWorkValue = (
  plaintext: Uint8Array,
  aadContext: TrackWorkAadContext,
  dataKey: Uint8Array,
  keyId: DataKeyId
): TrackWorkEncryptResult => {
  if (dataKey.length !== TRACKWORK_DEK_BYTES) {
    return { ok: false, error: 'invalid-data-key-length' };
  }
  if (!isDataKeyId(keyId)) {
    return { ok: false, error: 'invalid-data-key-id' };
  }
  const aad = serializeTrackWorkAad(aadContext);
  if (!aad) {
    return { ok: false, error: 'invalid-aad-context' };
  }
  if (plaintext.length === 0) {
    return { ok: false, error: 'invalid-plaintext' };
  }
  if (plaintext.length > TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES) {
    return { ok: false, error: 'oversized-plaintext' };
  }

  const nonce = randomBytes(TRACKWORK_ENVELOPE_NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', dataKey, nonce, {
    authTagLength: TRACKWORK_ENVELOPE_TAG_BYTES,
  });
  cipher.setAAD(buildTrackWorkAuthenticatedBytes(aad, keyId));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const envelope: TrackWorkEncryptedValueEnvelopeV1 = {
    version: TRACKWORK_ENVELOPE_VERSION_V1,
    algorithm: TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1,
    keyId,
    nonce: new Uint8Array(nonce),
    ciphertext: new Uint8Array(ciphertext),
    tag: new Uint8Array(tag),
  };

  return {
    ok: true,
    envelope: serializeTrackWorkEnvelopeV1(envelope),
    keyId,
  };
};

/**
 * Authenticated decryption of a canonical V1 envelope.
 *
 * - parses strictly through the 3.3 parser; malformed/unsupported envelopes
 *   fail closed (no downgrade);
 * - AAD must match EXACTLY (wrong domain/fieldPurpose/record fails
 *   authentication);
 * - the parsed envelope DataKeyId is cryptographically bound into the
 *   authenticated bytes, so changing ONLY the DataKeyId of a valid envelope
 *   fails authentication even without expectedKeyId;
 * - expectedKeyId remains as a caller-side identity assertion
 *   (defense-in-depth): a mismatch is reported as 'key-id-mismatch'.
 */
export const decryptTrackWorkValue = (
  serialized: string,
  aadContext: TrackWorkAadContext,
  dataKey: Uint8Array,
  expectedKeyId?: DataKeyId
): TrackWorkDecryptResult => {
  if (dataKey.length !== TRACKWORK_DEK_BYTES) {
    return { ok: false, error: 'invalid-data-key-length' };
  }
  const aad = serializeTrackWorkAad(aadContext);
  if (!aad) {
    return { ok: false, error: 'invalid-aad-context' };
  }

  const parsed = parseTrackWorkEnvelopeV1(serialized);
  if (!parsed.ok) {
    if (parsed.error === 'unsupported-version') {
      return { ok: false, error: 'unsupported-version' };
    }
    if (parsed.error === 'unsupported-algorithm') {
      return { ok: false, error: 'unsupported-algorithm' };
    }
    return { ok: false, error: 'malformed-envelope' };
  }

  const { envelope } = parsed;
  if (expectedKeyId && envelope.keyId !== expectedKeyId) {
    return { ok: false, error: 'key-id-mismatch' };
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    dataKey,
    Buffer.from(envelope.nonce),
    { authTagLength: TRACKWORK_ENVELOPE_TAG_BYTES }
  );
  decipher.setAAD(buildTrackWorkAuthenticatedBytes(aad, envelope.keyId));
  decipher.setAuthTag(Buffer.from(envelope.tag));

  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext)),
      decipher.final(),
    ]);
  } catch {
    return { ok: false, error: 'authentication-failure' };
  }

  return {
    ok: true,
    plaintext: new Uint8Array(plaintext),
    keyId: envelope.keyId,
  };
};
