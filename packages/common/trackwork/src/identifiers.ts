/**
 * TrackWork key-set / data-key / lookup-key identifiers (OpenSpec 3.3).
 *
 * These are NON-SECRET, opaque, stable identifiers:
 * - they contain no key material, no workspace/user information and no
 *   timestamp semantics;
 * - they are safe in JSON, DB columns and log metadata;
 * - they are strictly validated and canonically represented.
 *
 * Identifier generation is intentionally NOT provided here: the identifiers
 * are created by the future (3.4+) key-management code from a CSPRNG. This
 * module stays dependency-free and performs no crypto.
 */

const TRACKWORK_ID_BODY_RE = /^[0-9a-f]{32}$/;

const DATA_KEY_ID_PREFIX = 'dk_';
const KEY_SET_ID_PREFIX = 'ks_';
const LOOKUP_KEY_ID_PREFIX = 'lk_';

const SHARE_SET_ID_PREFIX = 'ss_';

const ID_PREFIX_RE = /^(?:dk|ks|lk|ss)_[0-9a-f]{32}$/;

/**
 * Identifies the DEK generation that encrypted a value.
 *
 * This is the `keyId` stored in an encrypted-value envelope. A KEK/share-set
 * rotation that merely rewraps the same DEK MUST NOT change the DataKeyId and
 * MUST NOT require rewriting every encrypted value. A true DEK rotation MAY
 * create a new DataKeyId.
 */
export type DataKeyId = string & {
  readonly __trackworkDataKeyId: unique symbol;
};

/**
 * Identifies one quorum/KEK/share generation.
 *
 * Used by wrapped-DEK metadata, wrapped-LookupKey metadata and administrator
 * share transport - NEVER by the encrypted-value envelope.
 */
export type KeySetId = string & { readonly __trackworkKeySetId: unique symbol };

/**
 * Identifies the LookupKey generation used for keyed-hash lookup indexes.
 *
 * LookupKey rotation (which requires rebuilding lookup indexes) creates a new
 * LookupKeyId; it does NOT imply DEK rotation.
 */
export type LookupKeyId = string & {
  readonly __trackworkLookupKeyId: unique symbol;
};

/**
 * Identifies one Shamir split/share generation. Changes on EVERY new split
 * (initial split, reshare of the same KEK, KEK rotation); DEK rotation
 * changes neither ShareSetId nor KeySetId.
 */
export type ShareSetId = string & {
  readonly __trackworkShareSetId: unique symbol;
};

const brand = <T extends string>(value: string): T => value as T;

export const isDataKeyId = (value: string): value is DataKeyId =>
  value.startsWith(DATA_KEY_ID_PREFIX) &&
  TRACKWORK_ID_BODY_RE.test(value.slice(DATA_KEY_ID_PREFIX.length));

export const isKeySetId = (value: string): value is KeySetId =>
  value.startsWith(KEY_SET_ID_PREFIX) &&
  TRACKWORK_ID_BODY_RE.test(value.slice(KEY_SET_ID_PREFIX.length));

export const isLookupKeyId = (value: string): value is LookupKeyId =>
  value.startsWith(LOOKUP_KEY_ID_PREFIX) &&
  TRACKWORK_ID_BODY_RE.test(value.slice(LOOKUP_KEY_ID_PREFIX.length));

export const isShareSetId = (value: string): value is ShareSetId =>
  value.startsWith(SHARE_SET_ID_PREFIX) &&
  TRACKWORK_ID_BODY_RE.test(value.slice(SHARE_SET_ID_PREFIX.length));

export const isTrackWorkKeyId = (value: string): boolean =>
  ID_PREFIX_RE.test(value);

/** Strict parse; returns `null` for anything that is not a canonical DataKeyId. */
export const parseDataKeyId = (value: string): DataKeyId | null =>
  isDataKeyId(value) ? brand<DataKeyId>(value) : null;

export const parseKeySetId = (value: string): KeySetId | null =>
  isKeySetId(value) ? brand<KeySetId>(value) : null;

export const parseLookupKeyId = (value: string): LookupKeyId | null =>
  isLookupKeyId(value) ? brand<LookupKeyId>(value) : null;

export const parseShareSetId = (value: string): ShareSetId | null =>
  isShareSetId(value) ? brand<ShareSetId>(value) : null;

/** Programmer-facing assertion; throws on any non-canonical identifier. */
export const assertDataKeyId = (value: string): DataKeyId => {
  const parsed = parseDataKeyId(value);
  if (!parsed) {
    throw new TypeError(
      `Invalid TrackWork DataKeyId: ${JSON.stringify(value)}`
    );
  }
  return parsed;
};

export const assertKeySetId = (value: string): KeySetId => {
  const parsed = parseKeySetId(value);
  if (!parsed) {
    throw new TypeError(`Invalid TrackWork KeySetId: ${JSON.stringify(value)}`);
  }
  return parsed;
};

export const assertShareSetId = (value: string): ShareSetId => {
  const parsed = parseShareSetId(value);
  if (!parsed) {
    throw new TypeError(
      `Invalid TrackWork ShareSetId: ${JSON.stringify(value)}`
    );
  }
  return parsed;
};

export const assertLookupKeyId = (value: string): LookupKeyId => {
  const parsed = parseLookupKeyId(value);
  if (!parsed) {
    throw new TypeError(
      `Invalid TrackWork LookupKeyId: ${JSON.stringify(value)}`
    );
  }
  return parsed;
};

/**
 * Lifecycle invariants (model-only, no rotation implementation):
 *
 * - KEK/share-set rotation: KeySetId K1 -> K2, DataKeyId stays D1, every
 *   encrypted value remains byte-for-byte unchanged.
 * - DEK rotation: DataKeyId D1 -> D2; a migration window may need both DEKs
 *   readable; KeySetId semantics are unaffected (the envelope stores
 *   DataKeyId, not KeySetId).
 * - LookupKey rotation: LookupKeyId L1 -> L2; requires rebuilding lookup
 *   indexes and does NOT imply DEK rotation.
 * - Share generation: ShareSetId changes on every new split; reshare keeps
 *   KeySetId (same KEK); KEK rotation changes both.
 */
