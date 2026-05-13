import { createHmac } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeBase32(input: string) {
  return input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
}

export function encodeBase32(bytes: Uint8Array) {
  let value = 0;
  let bits = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(input: string) {
  const normalized = normalizeBase32(input);
  let value = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid base32 secret.');
    }

    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function hotp(secret: string, counter: number, digits = 6) {
  const key = decodeBase32(secret);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const otp = binary % 10 ** digits;

  return otp.toString().padStart(digits, '0');
}

export function generateTotpSecret(bytes: Uint8Array) {
  return encodeBase32(bytes);
}

export function verifyTotp(
  secret: string,
  code: string,
  options?: { digits?: number; periodSeconds?: number; window?: number }
) {
  const digits = options?.digits ?? 6;
  const periodSeconds = options?.periodSeconds ?? 30;
  const window = options?.window ?? 1;
  const normalized = code.replace(/\s+/g, '');

  if (!new RegExp(`^\\d{${digits}}$`).test(normalized)) {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / periodSeconds);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i, digits);
    if (expected === normalized) {
      return true;
    }
  }

  return false;
}

export function toOtpAuthUrl(
  secret: string,
  options: { accountName: string; issuer: string }
) {
  const issuer = options.issuer.trim() || 'MRH ManSys';
  const accountName = options.accountName.trim();
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });

  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
