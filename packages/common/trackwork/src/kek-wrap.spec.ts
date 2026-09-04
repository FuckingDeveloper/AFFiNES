import { describe, expect, it } from 'vitest';

import { assertDataKeyId, parseKeySetId } from './identifiers';
import {
  buildTrackWorkWrapAuthenticatedBytes,
  generateTrackWorkDataKey,
  parseTrackWorkKekInput,
  rewrapTrackWorkDataKey,
  unwrapTrackWorkDataKey,
} from './kek-wrap';

const KEK_HEX = 'ab'.repeat(32);
const OTHER_KEK_HEX = 'cd'.repeat(32);
const KEK = parseTrackWorkKekInput(KEK_HEX);
if (!KEK.ok) throw new Error('setup: KEK parse failed');
const OTHER_KEK = parseTrackWorkKekInput(OTHER_KEK_HEX);
if (!OTHER_KEK.ok) throw new Error('setup: other KEK parse failed');
const KEY_SET_A = parseKeySetId('ks_' + 'a'.repeat(32));
const KEY_SET_B = parseKeySetId('ks_' + 'b'.repeat(32));
if (!KEY_SET_A || !KEY_SET_B) throw new Error('setup: key sets');

const replaceSegment = (wrapped: string, from: string, to: string): string => {
  const index = wrapped.indexOf(from);
  if (index < 0) throw new Error('segment not found: ' + from);
  return wrapped.slice(0, index) + to + wrapped.slice(index + from.length);
};

describe('TrackWork KEK input contract', () => {
  it('parses exactly 64 hex chars to 32 bytes', () => {
    expect(KEK.ok).toBe(true);
    if (!KEK.ok) return;
    expect(KEK.kek.length).toBe(32);
  });

  it('missing KEK fails closed without random fallback', () => {
    expect(parseTrackWorkKekInput(undefined)).toEqual({
      ok: false,
      error: 'missing-kek',
    });
    expect(parseTrackWorkKekInput('')).toEqual({
      ok: false,
      error: 'missing-kek',
    });
  });

  it('malformed KEK fails closed', () => {
    expect(parseTrackWorkKekInput('zz')).toEqual({
      ok: false,
      error: 'malformed-kek',
    });
    expect(parseTrackWorkKekInput('ab'.repeat(31))).toEqual({
      ok: false,
      error: 'malformed-kek',
    });
    expect(parseTrackWorkKekInput('ab'.repeat(33))).toEqual({
      ok: false,
      error: 'malformed-kek',
    });
  });

  it('is deterministic across restart (same input, same KEK bytes)', () => {
    const first = parseTrackWorkKekInput(KEK_HEX);
    const second = parseTrackWorkKekInput(KEK_HEX);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(Buffer.from(first.kek).equals(Buffer.from(second.kek))).toBe(true);
  });
});

describe('TrackWork KEK wrapping - generate/wrap/unwrap', () => {
  it('generate -> unwrap returns the same 32-byte DEK', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    expect(gen.plaintextDataKey.length).toBe(32);
    expect(gen.dataKeyId).toMatch(/^dk_[0-9a-f]{32}$/);
    const unwrapped = unwrapTrackWorkDataKey(gen.wrappedDataKey, KEK.kek);
    expect(unwrapped.ok).toBe(true);
    if (!unwrapped.ok) return;
    expect(
      Buffer.from(unwrapped.dataKey).equals(Buffer.from(gen.plaintextDataKey))
    ).toBe(true);
    expect(unwrapped.dataKeyId).toBe(gen.dataKeyId);
    expect(unwrapped.keySetId).toBe(KEY_SET_A);
  });

  it('wraps the same DEK twice with a fresh nonce -> distinct serialized forms', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const rewrap1 = rewrapTrackWorkDataKey(
      gen.wrappedDataKey,
      KEK.kek,
      KEK.kek,
      KEY_SET_A
    );
    if (!rewrap1.ok) throw new Error('rewrap failed');
    expect(rewrap1.wrappedDataKey).not.toBe(gen.wrappedDataKey);
    const unwrapped = unwrapTrackWorkDataKey(rewrap1.wrappedDataKey, KEK.kek);
    expect(unwrapped.ok).toBe(true);
    if (!unwrapped.ok) return;
    expect(
      Buffer.from(unwrapped.dataKey).equals(Buffer.from(gen.plaintextDataKey))
    ).toBe(true);
  });

  it('plaintext key material never appears in the serialized wrapped form', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const hex = Buffer.from(gen.plaintextDataKey).toString('hex');
    const b64 = Buffer.from(gen.plaintextDataKey).toString('base64url');
    expect(gen.wrappedDataKey).not.toContain(hex);
    expect(gen.wrappedDataKey).not.toContain(b64);
    expect(gen.wrappedDataKey.startsWith('twkwrap1.')).toBe(true);
  });

  it('wrapping AAD is the exact canonical byte vector', () => {
    const expected = new Uint8Array(
      Buffer.concat([
        Buffer.from('trackwork:kek-wrap:v1', 'utf8'),
        Buffer.from([0x00]),
        Buffer.from(KEY_SET_A, 'utf8'),
        Buffer.from([0x00]),
        Buffer.from(assertDataKeyId('dk_' + 'a'.repeat(32)), 'utf8'),
      ])
    );
    const actual = buildTrackWorkWrapAuthenticatedBytes(
      KEY_SET_A,
      assertDataKeyId('dk_' + 'a'.repeat(32))
    );
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
  });

  it('wrap AAD is domain-separated from value AAD', () => {
    const wrap = buildTrackWorkWrapAuthenticatedBytes(
      KEY_SET_A,
      assertDataKeyId('dk_' + 'a'.repeat(32))
    );
    const valueAad = new TextEncoder().encode(
      'trackwork:aead:v1:integration:token:development-integration-connection:row-1'
    );
    expect(
      Buffer.from(wrap)
        .subarray(0, valueAad.length)
        .equals(Buffer.from(valueAad))
    ).toBe(false);
    expect(
      new TextDecoder().decode(wrap.subarray(0, 'trackwork:kek-wrap:'.length))
    ).toBe('trackwork:kek-wrap:');
  });
});

describe('TrackWork KEK wrapping - tampering', () => {
  const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
  if (!gen.ok) throw new Error('setup failed');
  const wrapped = gen.wrappedDataKey;
  const segments = wrapped.split('.');

  it('wrong KEK fails authentication', () => {
    const result = unwrapTrackWorkDataKey(wrapped, OTHER_KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('changed KeySetId fails authentication (bound in wrap AAD)', () => {
    const tampered = replaceSegment(wrapped, KEY_SET_A, KEY_SET_B);
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('KeySet A cannot be relabeled as KeySet B', () => {
    const tampered = replaceSegment(wrapped, KEY_SET_A, KEY_SET_B);
    expect(unwrapTrackWorkDataKey(tampered, KEK.kek).ok).toBe(false);
  });

  it('changed DataKeyId fails authentication (bound in wrap AAD)', () => {
    const otherId = assertDataKeyId('dk_' + 'b'.repeat(32));
    const tampered = replaceSegment(wrapped, gen.dataKeyId, otherId);
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('changed nonce fails authentication', () => {
    const modified = segments[4].replace(/[A-Za-z0-9_-]/g, 'A');
    const tampered = [
      segments[0],
      segments[1],
      segments[2],
      segments[3],
      modified,
      segments[5],
      segments[6],
    ].join('.');
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('changed ciphertext fails authentication', () => {
    const modified = segments[5].replace(/[A-Za-z0-9_-]/g, 'A');
    const tampered = [
      segments[0],
      segments[1],
      segments[2],
      segments[3],
      segments[4],
      modified,
      segments[6],
    ].join('.');
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('changed tag fails authentication', () => {
    const modified = segments[6].replace(/[A-Za-z0-9_-]/g, 'A');
    const tampered = [
      segments[0],
      segments[1],
      segments[2],
      segments[3],
      segments[4],
      segments[5],
      modified,
    ].join('.');
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('unknown version fails closed', () => {
    const tampered = replaceSegment(wrapped, 'twkwrap1.', 'twkwrap2.');
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('unsupported-version');
    }
  });

  it('unknown algorithm fails closed', () => {
    const tampered = wrapped.replace('trackwork-wrap-v1', 'trackwork-wrap-v9');
    const result = unwrapTrackWorkDataKey(tampered, KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('unsupported-algorithm');
    }
  });

  it('malformed encodings, truncation and extra fields fail closed', () => {
    expect(unwrapTrackWorkDataKey('', KEK.kek).ok).toBe(false);
    expect(unwrapTrackWorkDataKey('not-a-wrapped-key', KEK.kek).ok).toBe(false);
    expect(unwrapTrackWorkDataKey(wrapped.slice(0, -10), KEK.kek).ok).toBe(
      false
    );
    expect(unwrapTrackWorkDataKey(wrapped + '.extra', KEK.kek).ok).toBe(false);
    const badB64 = replaceSegment(wrapped, segments[4], '!!!');
    expect(unwrapTrackWorkDataKey(badB64, KEK.kek).ok).toBe(false);
  });

  it('prototype/reserved identifiers are rejected', () => {
    const tampered = replaceSegment(wrapped, KEY_SET_A, 'constructor');
    expect(unwrapTrackWorkDataKey(tampered, KEK.kek).ok).toBe(false);
    expect(
      unwrapTrackWorkDataKey(
        replaceSegment(wrapped, KEY_SET_A, '__proto__'),
        KEK.kek
      ).ok
    ).toBe(false);
  });

  it('non-string wrapped input fails through the discriminated API', () => {
    for (const input of [null, undefined, {}, [], 123, true]) {
      const result = unwrapTrackWorkDataKey(input as never, KEK.kek);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('malformed-wrapped-key');
      }
    }
  });

  it('oversized wrapped input fails closed', () => {
    const oversized = 'twkwrap1.trackwork-wrap-v1.' + 'a'.repeat(5000);
    expect(unwrapTrackWorkDataKey(oversized, KEK.kek).ok).toBe(false);
  });

  it('invalid KEK length fails before crypto', () => {
    const short = new Uint8Array(16);
    expect(unwrapTrackWorkDataKey(wrapped, short).ok).toBe(false);
    expect(generateTrackWorkDataKey(KEY_SET_A, short).ok).toBe(false);
  });

  it('error results contain no key material', () => {
    const wrong = unwrapTrackWorkDataKey(wrapped, OTHER_KEK.kek);
    expect(wrong.ok).toBe(false);
    const rendered = JSON.stringify(wrong);
    expect(rendered).not.toContain('twkwrap1');
    expect(rendered).not.toContain(KEY_SET_A);
    expect(rendered).not.toContain(gen.dataKeyId);
  });
});

describe('TrackWork KEK wrapping - restart and rotation semantics', () => {
  it('same external KEK after restart unwraps the previously wrapped DEK', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const afterRestartKek = parseTrackWorkKekInput(KEK_HEX);
    if (!afterRestartKek.ok) throw new Error('setup failed');
    const unwrapped = unwrapTrackWorkDataKey(
      gen.wrappedDataKey,
      afterRestartKek.kek
    );
    expect(unwrapped.ok).toBe(true);
    if (!unwrapped.ok) return;
    expect(
      Buffer.from(unwrapped.dataKey).equals(Buffer.from(gen.plaintextDataKey))
    ).toBe(true);
  });

  it('wrong KEK after restart fails authentication', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const result = unwrapTrackWorkDataKey(gen.wrappedDataKey, OTHER_KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('missing KEK yields a deterministic unavailable-style error', () => {
    expect(parseTrackWorkKekInput(undefined)).toEqual({
      ok: false,
      error: 'missing-kek',
    });
  });

  it('DEK rotation creates a new DataKeyId and a distinct wrapped DEK', () => {
    const gen1 = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    const gen2 = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen1.ok || !gen2.ok) throw new Error('setup failed');
    expect(gen1.dataKeyId).not.toBe(gen2.dataKeyId);
    expect(gen1.wrappedDataKey).not.toBe(gen2.wrappedDataKey);
    expect(
      Buffer.from(gen1.plaintextDataKey).equals(
        Buffer.from(gen2.plaintextDataKey)
      )
    ).toBe(false);
    expect(gen1.dataKeyId).toMatch(/^dk_[0-9a-f]{32}$/);
    expect(gen2.dataKeyId).toMatch(/^dk_[0-9a-f]{32}$/);
  });

  it('KEK/KeySet rotation via rewrap preserves the DEK and DataKeyId', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const rewrap = rewrapTrackWorkDataKey(
      gen.wrappedDataKey,
      KEK.kek,
      OTHER_KEK.kek,
      KEY_SET_B
    );
    expect(rewrap.ok).toBe(true);
    if (!rewrap.ok) return;
    expect(rewrap.keySetId).toBe(KEY_SET_B);
    expect(rewrap.dataKeyId).toBe(gen.dataKeyId);
    const unwrapped = unwrapTrackWorkDataKey(
      rewrap.wrappedDataKey,
      OTHER_KEK.kek
    );
    expect(unwrapped.ok).toBe(true);
    if (!unwrapped.ok) return;
    expect(
      Buffer.from(unwrapped.dataKey).equals(Buffer.from(gen.plaintextDataKey))
    ).toBe(true);
    expect(unwrapped.keySetId).toBe(KEY_SET_B);
  });

  it('old wrapped DEK fails with the new KEK (no silent acceptance)', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const result = unwrapTrackWorkDataKey(gen.wrappedDataKey, OTHER_KEK.kek);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('rewrap with an invalid new KeySetId fails', () => {
    const gen = generateTrackWorkDataKey(KEY_SET_A, KEK.kek);
    if (!gen.ok) throw new Error('setup failed');
    const result = rewrapTrackWorkDataKey(
      gen.wrappedDataKey,
      KEK.kek,
      OTHER_KEK.kek,
      'constructor' as never
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-key-set-id');
    }
  });
});
