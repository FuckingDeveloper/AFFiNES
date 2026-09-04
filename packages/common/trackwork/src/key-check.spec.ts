import { describe, expect, it } from 'vitest';

import { assertKeySetId, assertShareSetId } from './identifiers';
import type { TrackWorkKeyCheckResult } from './key-check';
import {
  buildTrackWorkKeyCheckAuthenticatedBytes,
  createTrackWorkKeyCheck,
  TRACKWORK_KEY_CHECK_ALGORITHM,
  TRACKWORK_KEY_CHECK_CIPHERTEXT_BYTES,
  TRACKWORK_KEY_CHECK_NONCE_BYTES,
  TRACKWORK_KEY_CHECK_PLAINTEXT_BYTES,
  TRACKWORK_KEY_CHECK_TAG_BYTES,
  verifyTrackWorkKeyCheck,
} from './key-check';

const KEK = new Uint8Array(Buffer.from('ab'.repeat(32), 'hex'));
const OTHER_KEK = new Uint8Array(Buffer.from('cd'.repeat(32), 'hex'));
const KEY_SET_A = assertKeySetId('ks_' + 'a'.repeat(32));
const KEY_SET_B = assertKeySetId('ks_' + 'b'.repeat(32));
const SHARE_SET_A = assertShareSetId('ss_' + 'a'.repeat(32));
const SHARE_SET_B = assertShareSetId('ss_' + 'b'.repeat(32));

const deterministicRandom = (pattern: number) => {
  let counter = 0;
  return (size: number): Uint8Array => {
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      out[i] = (pattern + counter++) & 0xff;
    }
    return out;
  };
};

const create = (
  kek = KEK,
  keySetId = KEY_SET_A,
  shareSetId = SHARE_SET_A,
  random = deterministicRandom(3)
): TrackWorkKeyCheckResult =>
  createTrackWorkKeyCheck(kek, keySetId, shareSetId, random);

describe('TrackWork key-check - create/verify', () => {
  it('A. create -> verify with correct KEK', () => {
    const created = create();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const verified = verifyTrackWorkKeyCheck(
      created.keyCheck,
      KEK,
      KEY_SET_A,
      SHARE_SET_A
    );
    expect(verified).toEqual({ ok: true });
  });

  it('B. wrong KEK -> authentication failure', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const verified = verifyTrackWorkKeyCheck(
      created.keyCheck,
      OTHER_KEK,
      KEY_SET_A,
      SHARE_SET_A
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.error).toBe('key-check-authentication-failure');
    }
  });

  it('C. KeySetId substitution fails', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const tampered = created.keyCheck.replace(KEY_SET_A, KEY_SET_B);
    const verified = verifyTrackWorkKeyCheck(
      tampered,
      KEK,
      KEY_SET_A,
      SHARE_SET_A
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.error).toBe('invalid-key-set-id');
    }
  });

  it('D. ShareSetId substitution fails', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const tampered = created.keyCheck.replace(SHARE_SET_A, SHARE_SET_B);
    const verified = verifyTrackWorkKeyCheck(
      tampered,
      KEK,
      KEY_SET_A,
      SHARE_SET_A
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.error).toBe('invalid-share-set-id');
    }
  });

  it('expected-identifier mismatch fails before crypto', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    expect(
      verifyTrackWorkKeyCheck(created.keyCheck, KEK, KEY_SET_B, SHARE_SET_A)
    ).toEqual({ ok: false, error: 'invalid-key-set-id' });
    expect(
      verifyTrackWorkKeyCheck(created.keyCheck, KEK, KEY_SET_A, SHARE_SET_B)
    ).toEqual({ ok: false, error: 'invalid-share-set-id' });
  });

  it('E/F/G. nonce/ciphertext/tag bit flips fail', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const parts = created.keyCheck.split('.');
    const flip = (index: number) => {
      const bytes = Buffer.from(parts[index], 'base64url');
      bytes[bytes.length - 1] ^= 0x01;
      const modified = [parts[0], parts[1], parts[2], parts[3]];
      parts.forEach((_, i) => {
        modified[i] = i === index ? bytes.toString('base64url') : parts[i];
      });
      return modified.join('.');
    };
    for (const index of [4, 5, 6]) {
      const verified = verifyTrackWorkKeyCheck(
        flip(index),
        KEK,
        KEY_SET_A,
        SHARE_SET_A
      );
      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(verified.error).toBe('key-check-authentication-failure');
      }
    }
  });

  it('H. unknown version fails closed', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const tampered = created.keyCheck.replace('twkcheck1.', 'twkcheck2.');
    expect(
      verifyTrackWorkKeyCheck(tampered, KEK, KEY_SET_A, SHARE_SET_A)
    ).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('I. unknown algorithm fails closed', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const tampered = created.keyCheck.replace(
      TRACKWORK_KEY_CHECK_ALGORITHM,
      'trackwork-key-check-v9'
    );
    expect(
      verifyTrackWorkKeyCheck(tampered, KEK, KEY_SET_A, SHARE_SET_A)
    ).toEqual({ ok: false, error: 'unsupported-algorithm' });
  });

  it('J. malformed formats fail closed', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const inputs = [
      '',
      'not-a-key-check',
      created.keyCheck.slice(0, -10),
      created.keyCheck + '.extra',
      'twkcheck1.' + 'x'.repeat(300),
    ];
    for (const input of inputs) {
      const verified = verifyTrackWorkKeyCheck(
        input,
        KEK,
        KEY_SET_A,
        SHARE_SET_A
      );
      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(
          ['malformed-key-check', 'unsupported-version'].includes(
            verified.error
          )
        ).toBe(true);
      }
    }
  });

  it('K. noncanonical/padded base64url fails', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const parts = created.keyCheck.split('.');
    const padded = [
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      parts[4] + '==',
      parts[5],
      parts[6],
    ].join('.');
    expect(
      verifyTrackWorkKeyCheck(padded, KEK, KEY_SET_A, SHARE_SET_A)
    ).toEqual({ ok: false, error: 'malformed-key-check' });
  });

  it('L. non-string inputs fail closed', () => {
    for (const input of [null, undefined, {}, [], 123, true]) {
      const verified = verifyTrackWorkKeyCheck(
        input as never,
        KEK,
        KEY_SET_A,
        SHARE_SET_A
      );
      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(verified.error).toBe('malformed-key-check');
      }
    }
  });

  it('M. exact nonce/ciphertext/tag sizes in the artifact', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const parts = created.keyCheck.split('.');
    expect(Buffer.from(parts[4], 'base64url').length).toBe(
      TRACKWORK_KEY_CHECK_NONCE_BYTES
    );
    expect(Buffer.from(parts[5], 'base64url').length).toBe(
      TRACKWORK_KEY_CHECK_CIPHERTEXT_BYTES
    );
    expect(Buffer.from(parts[6], 'base64url').length).toBe(
      TRACKWORK_KEY_CHECK_TAG_BYTES
    );
    expect(created.keyCheck.length).toBe(167);
  });

  it('N. generated nonces differ across repeated creation (production RNG)', () => {
    const a = createTrackWorkKeyCheck(KEK, KEY_SET_A, SHARE_SET_A);
    const b = createTrackWorkKeyCheck(KEK, KEY_SET_A, SHARE_SET_A);
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect(a.keyCheck).not.toBe(b.keyCheck);
  });

  it('O. exact canonical deterministic test vector', () => {
    const created = create(KEK, KEY_SET_A, SHARE_SET_A, deterministicRandom(7));
    const again = create(KEK, KEY_SET_A, SHARE_SET_A, deterministicRandom(7));
    expect(created.ok && again.ok).toBe(true);
    if (!created.ok || !again.ok) return;
    expect(created.keyCheck).toBe(again.keyCheck);
    expect(
      created.keyCheck.startsWith('twkcheck1.trackwork-key-check-v1.')
    ).toBe(true);
  });

  it('P. no key/verification material in error strings', () => {
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    const failures = [
      verifyTrackWorkKeyCheck(
        created.keyCheck,
        OTHER_KEK,
        KEY_SET_A,
        SHARE_SET_A
      ),
      verifyTrackWorkKeyCheck('garbage', KEK, KEY_SET_A, SHARE_SET_A),
    ];
    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      if (!failure.ok) {
        expect(JSON.stringify(failure)).not.toContain('twkcheck');
        expect(JSON.stringify(failure)).not.toContain(KEY_SET_A);
      }
    }
  });

  it('Q. input buffers are not unexpectedly mutated', () => {
    const kek = new Uint8Array(KEK);
    const before = new Uint8Array(kek);
    const created = create(kek);
    if (!created.ok) throw new Error('setup failed');
    expect(new Uint8Array(kek)).toEqual(before);
    verifyTrackWorkKeyCheck(created.keyCheck, kek, KEY_SET_A, SHARE_SET_A);
    expect(new Uint8Array(kek)).toEqual(before);
  });

  it('rejects a non-32-byte KEK', () => {
    expect(create(new Uint8Array(16))).toEqual({
      ok: false,
      error: 'invalid-kek-length',
    });
    const created = create();
    if (!created.ok) throw new Error('setup failed');
    expect(
      verifyTrackWorkKeyCheck(
        created.keyCheck,
        new Uint8Array(16),
        KEY_SET_A,
        SHARE_SET_A
      )
    ).toEqual({ ok: false, error: 'invalid-kek-length' });
  });

  it('rejects invalid identities', () => {
    expect(create(KEK, 'constructor' as never, SHARE_SET_A)).toEqual({
      ok: false,
      error: 'invalid-key-set-id',
    });
    expect(create(KEK, KEY_SET_A, 'constructor' as never)).toEqual({
      ok: false,
      error: 'invalid-share-set-id',
    });
  });

  it('authenticated bytes are the exact canonical vector', () => {
    const expected = new Uint8Array(
      Buffer.concat([
        Buffer.from('trackwork:key-check:v1', 'utf8'),
        Buffer.from([0x00]),
        Buffer.from(KEY_SET_A, 'utf8'),
        Buffer.from([0x00]),
        Buffer.from(SHARE_SET_A, 'utf8'),
      ])
    );
    const actual = buildTrackWorkKeyCheckAuthenticatedBytes(
      KEY_SET_A,
      SHARE_SET_A
    );
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
  });

  it('verification plaintext size contract', () => {
    expect(TRACKWORK_KEY_CHECK_PLAINTEXT_BYTES).toBe(16);
    expect(TRACKWORK_KEY_CHECK_CIPHERTEXT_BYTES).toBe(16);
  });
});
