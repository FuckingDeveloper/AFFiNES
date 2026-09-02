/**
 * Centralized secret redaction for structured logging.
 *
 * Redaction policy: sensitive keys are redacted recursively by key name, and
 * well-known credential formats are redacted inside arbitrary strings.
 * Request bodies, document/task contents, headers and provider responses must
 * never be passed to the logger in the first place.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /^(token|access_token|accessToken|refresh_token|refreshToken|password|passwd|secret|client_secret|clientSecret|authorization|cookie|api_key|apiKey|apikey|private_key|privateKey|key_share|keyShare|keyshare|encryption_key|encryptionKey|dek|kek|webhook_secret|webhookSecret|credential|credential_id|session_token|ciphertext|cipher_text|cipher)$/;

const SENSITIVE_KEY_SUBSTRING_PATTERN =
  /(token|secret|password|passwd|authorization|cookie|apikey|api_key|private_key|privatekey|key_share|keyshare|encryption_key|cipher|ciphertext|webhook_secret|credential)/i;

const TOKEN_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9-._~+/]+=*/gi,
  /Basic\s+[A-Za-z0-9+/]+=*/gi,
  /glpat-[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
];

const ASSIGNMENT_PATTERN =
  /((?:api[_-]?key|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|webhook[_-]?secret|password|passwd|authorization)\s*[:=]\s*['"]?)[A-Za-z0-9-._~+/]{8,}/gi;

export function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^A-Za-z0-9]/g, '');
  return (
    SENSITIVE_KEY_PATTERN.test(normalized) ||
    SENSITIVE_KEY_SUBSTRING_PATTERN.test(normalized)
  );
}

export function redactString(input: string): string {
  let result = input;
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result.replace(
    ASSIGNMENT_PATTERN,
    (_match, prefix: string) => `${prefix}${REDACTED}`
  );
}

export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item));
  }

  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSensitiveKey(k)) {
        result[k] = REDACTED;
      } else {
        result[k] = redactValue(v);
      }
    }
    return result;
  }

  return value;
}
