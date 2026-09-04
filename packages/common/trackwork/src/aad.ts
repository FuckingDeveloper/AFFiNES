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

import type { KeySetId } from './identifiers';
import { parseKeySetId } from './identifiers';

export const TRACKWORK_AAD_DOMAINS = [
  'integration',
  'connected-oauth',
  'totp',
  'copilot',
] as const;

export type TrackWorkAadDomain = (typeof TRACKWORK_AAD_DOMAINS)[number];

export const TRACKWORK_STABLE_RECORD_ALIASES = [
  'connected-account',
  'development-integration-connection',
  'development-repository',
  'user-two-factor-auth',
  'ai-workspace-byok-config',
] as const;

export type TrackWorkStableRecordAlias =
  (typeof TRACKWORK_STABLE_RECORD_ALIASES)[number];

export const isTrackWorkAadDomain = (
  value: string
): value is TrackWorkAadDomain =>
  (TRACKWORK_AAD_DOMAINS as readonly string[]).includes(value);

export const isTrackWorkStableRecordAlias = (
  value: string
): value is TrackWorkStableRecordAlias =>
  (TRACKWORK_STABLE_RECORD_ALIASES as readonly string[]).includes(value);

/**
 * Single source of truth for the domain/fieldPurpose -> record-alias matrix
 * (verified against schema.prisma: ConnectedAccount l.80,
 * DevelopmentIntegrationConnection l.1474, DevelopmentRepository l.1499,
 * UserTwoFactorAuth l.1234, AiWorkspaceByokConfig l.936).
 */
export const TRACKWORK_AAD_RECORD_MATRIX = {
  'connected-oauth': {
    'access-token': 'connected-account',
    'refresh-token': 'connected-account',
  },
  integration: {
    token: 'development-integration-connection',
    'webhook-secret': 'development-integration-connection',
    'sync-token': 'development-repository',
  },
  totp: {
    seed: 'user-two-factor-auth',
  },
  copilot: {
    'api-key': 'ai-workspace-byok-config',
  },
} as const satisfies Record<
  TrackWorkAadDomain,
  Record<string, TrackWorkStableRecordAlias>
>;

export const TRACKWORK_AAD_FIELD_PURPOSES: Record<
  TrackWorkAadDomain,
  readonly string[]
> = {
  'connected-oauth': Object.keys(
    TRACKWORK_AAD_RECORD_MATRIX['connected-oauth']
  ),
  integration: Object.keys(TRACKWORK_AAD_RECORD_MATRIX['integration']),
  totp: Object.keys(TRACKWORK_AAD_RECORD_MATRIX['totp']),
  copilot: Object.keys(TRACKWORK_AAD_RECORD_MATRIX['copilot']),
};

export type TrackWorkAadFieldPurpose =
  | 'token'
  | 'webhook-secret'
  | 'sync-token'
  | 'access-token'
  | 'refresh-token'
  | 'seed'
  | 'api-key';

export const isTrackWorkAadFieldPurpose = (
  domain: TrackWorkAadDomain,
  purpose: string
): purpose is TrackWorkAadFieldPurpose =>
  purpose in TRACKWORK_AAD_RECORD_MATRIX[domain];

export const trackWorkAadRecordAlias = (
  domain: TrackWorkAadDomain,
  purpose: string
): TrackWorkStableRecordAlias | undefined =>
  TRACKWORK_AAD_RECORD_MATRIX[domain][
    purpose as keyof (typeof TRACKWORK_AAD_RECORD_MATRIX)[TrackWorkAadDomain]
  ] as TrackWorkStableRecordAlias | undefined;

/**
 * Compile-time discriminated union: obviously invalid domain/fieldPurpose/
 * alias combinations are rejected by TypeScript; runtime validation is still
 * mandatory (persisted/input strings are untrusted).
 */
export type TrackWorkAadContext =
  | {
      domain: 'connected-oauth';
      fieldPurpose: 'access-token' | 'refresh-token';
      stableRecordId: `connected-account:${string}`;
    }
  | {
      domain: 'integration';
      fieldPurpose: 'token' | 'webhook-secret';
      stableRecordId: `development-integration-connection:${string}`;
    }
  | {
      domain: 'integration';
      fieldPurpose: 'sync-token';
      stableRecordId: `development-repository:${string}`;
    }
  | {
      domain: 'totp';
      fieldPurpose: 'seed';
      stableRecordId: `user-two-factor-auth:${string}`;
    }
  | {
      domain: 'copilot';
      fieldPurpose: 'api-key';
      stableRecordId: `ai-workspace-byok-config:${string}`;
    };

/** Row-id portion limit: 64 characters (the complete `<alias>:<rowId>` may be longer). */
export const TRACKWORK_STABLE_RECORD_ROW_ID_MAX_LENGTH = 64;

export const TRACKWORK_STABLE_RECORD_ID_MAX_LENGTH =
  TRACKWORK_STABLE_RECORD_ROW_ID_MAX_LENGTH +
  1 +
  Math.max(...TRACKWORK_STABLE_RECORD_ALIASES.map(alias => alias.length));

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

/**
 * Canonical AAD serialization:
 * `trackwork:aead:v1:<domain>:<fieldPurpose>:<stableRecordId>`
 *
 * Returns `null` unless the domain, the field purpose AND the record alias
 * all agree with the authoritative matrix (cross-domain/cross-model
 * combinations are rejected).
 */
export const serializeTrackWorkAad = (
  context: TrackWorkAadContext
): string | null => {
  const expectedAlias = trackWorkAadRecordAlias(
    context.domain,
    context.fieldPurpose
  );
  if (!expectedAlias) {
    return null;
  }
  if (!isCanonicalTrackWorkStableRecordId(context.stableRecordId)) {
    return null;
  }
  if (!context.stableRecordId.startsWith(`${expectedAlias}:`)) {
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
 * semantics: binds to key-set + role, not to a record). The KeySetId is
 * validated with the canonical identifier parser - no duplicated grammar.
 */
export const serializeTrackWorkWrapAad = (
  wrapPurpose: 'dek' | 'lookup-key',
  keySetId: KeySetId
): string | null => {
  if (!parseKeySetId(keySetId)) {
    return null;
  }
  return `trackwork:wrap:v1:${wrapPurpose}:${keySetId}`;
};
