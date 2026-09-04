/**
 * TrackWork AAD (associated-data) context model (OpenSpec 3.3).
 *
 * The encrypted-value envelope NEVER carries its own AAD context: domain,
 * field purpose and stable record id come from the CALLER / schema context at
 * future encrypt/decrypt time. Otherwise an attacker could move an envelope
 * together with self-declared AAD metadata and defeat substitution
 * protection. This module only serializes/validates the caller-derived
 * context; it performs no crypto.
 */

export const TRACKWORK_AAD_DOMAINS = [
  'integration',
  'connected-oauth',
  'totp',
  'copilot',
] as const;

export type TrackWorkAadDomain = (typeof TRACKWORK_AAD_DOMAINS)[number];

export const TRACKWORK_AAD_FIELD_PURPOSES: Record<
  TrackWorkAadDomain,
  readonly string[]
> = {
  integration: ['token', 'webhook-secret', 'sync-token'],
  'connected-oauth': ['access-token', 'refresh-token'],
  totp: ['seed'],
  copilot: ['api-key'],
};

export type TrackWorkAadFieldPurpose =
  | 'token'
  | 'webhook-secret'
  | 'sync-token'
  | 'access-token'
  | 'refresh-token'
  | 'seed'
  | 'api-key';

export const isTrackWorkAadDomain = (
  value: string
): value is TrackWorkAadDomain =>
  (TRACKWORK_AAD_DOMAINS as readonly string[]).includes(value);

export const isTrackWorkAadFieldPurpose = (
  domain: TrackWorkAadDomain,
  purpose: string
): purpose is TrackWorkAadFieldPurpose =>
  TRACKWORK_AAD_FIELD_PURPOSES[domain].includes(purpose);

/**
 * Closed semantic aliases for stable record identity (NOT arbitrary SQL table
 * text supplied by callers and NOT mutable display/class names). Maps to the
 * Prisma models owning the 3.1 encryption/re-key candidates.
 */
export const TRACKWORK_STABLE_RECORD_ALIASES = [
  'connected-account',
  'development-integration-connection',
  'development-repository',
  'user-two-factor-auth',
  'ai-workspace-byok-config',
] as const;

export type TrackWorkStableRecordAlias =
  (typeof TRACKWORK_STABLE_RECORD_ALIASES)[number];

export const TRACKWORK_STABLE_RECORD_ID_MAX_LENGTH = 64;

export const isTrackWorkStableRecordAlias = (
  value: string
): value is TrackWorkStableRecordAlias =>
  (TRACKWORK_STABLE_RECORD_ALIASES as readonly string[]).includes(value);

const ROW_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Canonical form: `<alias>:<rowId>`.
 *
 * The alias must be a closed semantic alias; the row id must be non-empty,
 * bounded (<= 64 chars), free of ':' (no delimiter ambiguity) and free of
 * whitespace/control characters. Returns `null` for any non-canonical input.
 */
export const canonicalizeTrackWorkStableRecordId = (
  alias: string,
  rowId: string
): string | null => {
  if (!isTrackWorkStableRecordAlias(alias)) {
    return null;
  }
  if (!ROW_ID_RE.test(rowId)) {
    return null;
  }
  return `${alias}:${rowId}`;
};

export const isCanonicalTrackWorkStableRecordId = (
  value: string
): value is string => {
  const colon = value.indexOf(':');
  if (colon <= 0 || colon !== value.lastIndexOf(':')) {
    return false;
  }
  return (
    isTrackWorkStableRecordAlias(value.slice(0, colon)) &&
    ROW_ID_RE.test(value.slice(colon + 1))
  );
};

export interface TrackWorkAadContext {
  domain: TrackWorkAadDomain;
  fieldPurpose: TrackWorkAadFieldPurpose;
  /** Canonical `<alias>:<rowId>` form (see canonicalizeTrackWorkStableRecordId). */
  stableRecordId: string;
}

/**
 * Canonical AAD serialization:
 * `trackwork:aead:v1:<domain>:<fieldPurpose>:<stableRecordId>`
 *
 * Returns `null` when the context is not canonical (unknown domain, field
 * purpose not valid for the domain, or non-canonical stable record id).
 */
export const serializeTrackWorkAad = (
  context: TrackWorkAadContext
): string | null => {
  if (
    !isTrackWorkAadDomain(context.domain) ||
    !isTrackWorkAadFieldPurpose(context.domain, context.fieldPurpose) ||
    !isCanonicalTrackWorkStableRecordId(context.stableRecordId)
  ) {
    return null;
  }
  return [
    'trackwork:aead:v1',
    context.domain,
    context.fieldPurpose,
    context.stableRecordId,
  ].join(':');
};

/**
 * AAD context for the future key-wrapping contract (separate identity
 * semantics: binds to key-set + role, not to a record).
 */
export const serializeTrackWorkWrapAad = (
  wrapPurpose: 'dek' | 'lookup-key',
  keySetId: string
): string | null =>
  /^ks_[0-9a-f]{32}$/.test(keySetId)
    ? `trackwork:wrap:v1:${wrapPurpose}:${keySetId}`
    : null;
