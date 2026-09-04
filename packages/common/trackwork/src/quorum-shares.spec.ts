import { describe, expect, it } from 'vitest';

import { assertKeySetId, assertShareSetId, parseKeySetId } from './identifiers';
import type { TrackWorkShareRecord } from './quorum-shares';
import {
  generateTrackWorkShares,
  parseTrackWorkShare,
  reconstructTrackWorkKek,
  serializeTrackWorkShare,
  TRACKWORK_SHARE_BYTES,
  TRACKWORK_SHARE_INDEX_MAX,
} from './quorum-shares';

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

const gen = (
  keySetId = KEY_SET_A,
  kek = KEK,
  random?: (n: number) => Uint8Array
) => generateTrackWorkShares(keySetId, kek, random ? { random } : {});

const serializeOrThrow = (share: TrackWorkShareRecord): string => {
  const s = serializeTrackWorkShare(share);
  if (!s) throw new Error('serialize failed');
  return s;
};

describe('TrackWork shares - generation', () => {
  it('A. generates exactly 3 shares', () => {
    const result = gen();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shares.length).toBe(3);
  });

  it('H. production runs produce fresh ShareSetIds and share material', () => {
    const a = gen();
    const b = gen();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.shareSetId).not.toBe(b.shareSetId);
    expect(a.shares[0].serialized).not.toBe(b.shares[0].serialized);
  });

  it('G. deterministic injected RNG gives a deterministic test vector', () => {
    const a = gen(KEY_SET_A, KEK, deterministicRandom(7));
    const b = gen(KEY_SET_A, KEK, deterministicRandom(7));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.shareSetId).toBe(b.shareSetId);
    expect(a.shares.map(s => s.serialized)).toEqual(
      b.shares.map(s => s.serialized)
    );
  });

  it('rejects a non-32-byte KEK', () => {
    const result = gen(KEY_SET_A, new Uint8Array(16));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-kek-length');
    }
  });

  it('rejects an invalid KeySetId', () => {
    const result = gen('constructor' as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-key-set-id');
    }
  });

  it('rejects invalid share parameters', () => {
    const base = { random: deterministicRandom(1) };
    expect(gen(KEY_SET_A, KEK, base.random).ok).toBe(true);
    const low = generateTrackWorkShares(KEY_SET_A, KEK, {
      ...base,
      threshold: 1,
    });
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.error).toBe('invalid-share-parameters');
    const many = generateTrackWorkShares(KEY_SET_A, KEK, {
      ...base,
      shares: TRACKWORK_SHARE_INDEX_MAX + 1,
    });
    expect(many.ok).toBe(false);
    if (!many.ok) expect(many.error).toBe('invalid-share-parameters');
  });

  it('all shares carry the same KeySetId and ShareSetId with distinct indices', () => {
    const result = gen();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const share of result.shares) {
      expect(share.keySetId).toBe(KEY_SET_A);
      expect(share.shareSetId).toBe(result.shareSetId);
      expect(share.shareBytes.length).toBe(TRACKWORK_SHARE_BYTES);
    }
    expect(new Set(result.shares.map(s => s.index)).size).toBe(3);
    expect(result.shares.map(s => s.index)).toEqual([1, 2, 3]);
  });
});

describe('TrackWork shares - reconstruction (combinatorial)', () => {
  const result = gen();
  if (!result.ok) throw new Error('setup failed');
  const [s1, s2, s3] = result.shares;

  it('B/C/D/E. every valid combination reconstructs the KEK', () => {
    for (const pair of [
      [s1, s2],
      [s1, s3],
      [s2, s3],
    ] as const) {
      const rec = reconstructTrackWorkKek([
        pair[0].serialized,
        pair[1].serialized,
      ]);
      expect(rec.ok).toBe(true);
      if (rec.ok) {
        expect(Buffer.from(rec.kek).equals(Buffer.from(KEK))).toBe(true);
      }
    }
    const all = reconstructTrackWorkKek([s1, s2, s3]);
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(Buffer.from(all.kek).equals(Buffer.from(KEK))).toBe(true);
    }
  });

  it('F. shuffled share order reconstructs', () => {
    const rec = reconstructTrackWorkKek([s3.serialized, s1.serialized]);
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      expect(Buffer.from(rec.kek).equals(Buffer.from(KEK))).toBe(true);
    }
  });

  it('J. exact serializer/parser round-trip', () => {
    const parsed = parseTrackWorkShare(s1.serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.share.index).toBe(1);
    expect(parsed.share.keySetId).toBe(KEY_SET_A);
    expect(parsed.share.shareSetId).toBe(result.shareSetId);
    expect(serializeOrThrow(parsed.share)).toBe(s1.serialized);
  });

  it('K. known fake KEK exact vector', () => {
    const rec = reconstructTrackWorkKek([
      'twshare-v1.' +
        KEY_SET_A +
        '.' +
        result.shareSetId +
        '.1.' +
        Buffer.from(s1.shareBytes).toString('base64url') +
        '.deadbeef',
    ]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('invalid-crc');
    }
  });

  it('L. one share is rejected before combine', () => {
    const rec = reconstructTrackWorkKek([s1.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('insufficient-shares');
    }
  });
});

describe('TrackWork shares - adversarial', () => {
  const result = gen();
  if (!result.ok) throw new Error('setup failed');
  const [s1, s2] = result.shares;

  const flipPayload = (serialized: string): string => {
    const parts = serialized.split('.');
    const bytes = Buffer.from(parts[4], 'base64url');
    bytes[bytes.length - 1] ^= 0x01;
    return [
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      bytes.toString('base64url'),
      parts[5],
    ].join('.');
  };

  it('M. duplicate outer index is rejected', () => {
    const rec = reconstructTrackWorkKek([s1.serialized, s1.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('duplicate-share-index');
    }
  });

  it('N. duplicate underlying share/x coordinate is rejected', () => {
    const clone = { ...s2, index: 1, serialized: '' };
    clone.serialized = serializeOrThrow(clone);
    const rec = reconstructTrackWorkKek([s1.serialized, clone.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('duplicate-share-index');
    }
  });

  it('O. mixed KeySetId is rejected', () => {
    const tampered = { ...s2, keySetId: KEY_SET_B, serialized: '' };
    tampered.serialized = serializeOrThrow(tampered);
    const rec = reconstructTrackWorkKek([s1.serialized, tampered.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('mixed-key-set-id');
    }
  });

  it('P. mixed ShareSetId is rejected', () => {
    const tampered = { ...s2, shareSetId: SHARE_SET_B, serialized: '' };
    tampered.serialized = serializeOrThrow(tampered);
    const rec = reconstructTrackWorkKek([s1.serialized, tampered.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('mixed-share-set-id');
    }
  });

  it('Q. outer index != inner Shamir index is rejected', () => {
    const tampered = { ...s2, index: 3, serialized: '' };
    tampered.serialized = serializeOrThrow(tampered);
    const rec = reconstructTrackWorkKek([s1.serialized, tampered.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('index-mismatch');
    }
  });

  it('R. bit flip in payload fails CRC (error detection)', () => {
    const rec = reconstructTrackWorkKek([
      flipPayload(s1.serialized),
      s2.serialized,
    ]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('invalid-crc');
    }
  });

  it('S. bad CRC is rejected', () => {
    const parts = s1.serialized.split('.');
    const bad = [
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      parts[4],
      '00000000',
    ].join('.');
    const rec = reconstructTrackWorkKek([bad, s2.serialized]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('invalid-crc');
    }
  });

  it('T. malformed base64url is rejected', () => {
    const parts = s1.serialized.split('.');
    const bad = [parts[0], parts[1], parts[2], parts[3], '!!!', parts[5]].join(
      '.'
    );
    expect(parseTrackWorkShare(bad).ok).toBe(false);
  });

  it('U. padded base64url is rejected', () => {
    const parts = s1.serialized.split('.');
    const padded = parts[4] + '==';
    const bad = [parts[0], parts[1], parts[2], parts[3], padded, parts[5]].join(
      '.'
    );
    expect(parseTrackWorkShare(bad).ok).toBe(false);
  });

  it('V. wrong version fails closed', () => {
    const v2 = s1.serialized.replace('twshare-v1.', 'twshare-v2.');
    const parsed = parseTrackWorkShare(v2);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('unsupported-version');
    }
  });

  it('W. extra field is rejected', () => {
    expect(parseTrackWorkShare(s1.serialized + '.extra').ok).toBe(false);
  });

  it('X. truncated share is rejected', () => {
    expect(parseTrackWorkShare(s1.serialized.slice(0, -10)).ok).toBe(false);
  });

  it('Y. oversized share is rejected', () => {
    const big = 'twshare-v1.' + 'a'.repeat(400);
    const parsed = parseTrackWorkShare(big);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('oversized-share');
    }
  });

  it('Z. non-string parser inputs fail without throwing', () => {
    for (const input of [
      null,
      undefined,
      {},
      [],
      123,
      true,
      new Uint8Array(4),
    ]) {
      const parsed = parseTrackWorkShare(input as never);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error).toBe('malformed-share');
      }
    }
  });

  it('AA. prototype-looking strings are rejected', () => {
    for (const probe of ['constructor', '__proto__', 'toString']) {
      const parts = s1.serialized.split('.');
      const bad = [
        parts[0],
        probe,
        parts[2],
        parts[3],
        parts[4],
        parts[5],
      ].join('.');
      expect(parseTrackWorkShare(bad).ok).toBe(false);
    }
  });

  it('AB/AC. malformed KeySetId/ShareSetId are rejected', () => {
    const parts = s1.serialized.split('.');
    const badKs = [
      parts[0],
      'dk_' + 'a'.repeat(32),
      parts[2],
      parts[3],
      parts[4],
      parts[5],
    ].join('.');
    const parsedKs = parseTrackWorkShare(badKs);
    expect(parsedKs.ok).toBe(false);
    if (!parsedKs.ok) expect(parsedKs.error).toBe('invalid-key-set-id');
    const badSs = [
      parts[0],
      parts[1],
      'ks_' + 'a'.repeat(32),
      parts[3],
      parts[4],
      parts[5],
    ].join('.');
    const parsedSs = parseTrackWorkShare(badSs);
    expect(parsedSs.ok).toBe(false);
    if (!parsedSs.ok) expect(parsedSs.error).toBe('invalid-share-set-id');
  });

  it('AD/AE. invalid indices 0 and > max are rejected', () => {
    const parts = s1.serialized.split('.');
    const zero = [parts[0], parts[1], parts[2], '0', parts[4], parts[5]].join(
      '.'
    );
    expect(parseTrackWorkShare(zero).ok).toBe(false);
    const big = [
      parts[0],
      parts[1],
      parts[2],
      String(TRACKWORK_SHARE_INDEX_MAX + 1),
      parts[4],
      parts[5],
    ].join('.');
    expect(parseTrackWorkShare(big).ok).toBe(false);
  });

  it('AF. record-level corruption with re-serialization is NOT silently accepted as the KEK', () => {
    const corrupted = {
      ...s2,
      shareBytes: new Uint8Array(s2.shareBytes),
      serialized: '',
    };
    corrupted.shareBytes[corrupted.shareBytes.length - 1] ^= 0xff;
    corrupted.serialized = serializeOrThrow(corrupted);
    const rec = reconstructTrackWorkKek([s1.serialized, corrupted.serialized]);
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      expect(Buffer.from(rec.kek).equals(Buffer.from(KEK))).toBe(false);
    }
  });

  it('AG. 2 valid + 1 malformed fails deterministically', () => {
    const result3 = gen();
    if (!result3.ok) throw new Error('setup failed');
    const rec = reconstructTrackWorkKek([
      s1.serialized,
      s2.serialized,
      'twshare-v1.' + 'broken',
    ]);
    expect(rec.ok).toBe(false);
    if (!rec.ok) {
      expect(rec.error).toBe('malformed-share');
    }
  });

  it('I. reshare of the same KEK keeps KeySetId, changes ShareSetId and bytes', () => {
    const second = gen(KEY_SET_A, KEK);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.shareSetId).not.toBe(result.shareSetId);
    expect(second.shares[0].keySetId).toBe(KEY_SET_A);
    expect(second.shares[0].serialized).not.toBe(s1.serialized);
    const mixed = reconstructTrackWorkKek([
      s1.serialized,
      second.shares[0].serialized,
    ]);
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) {
      expect(mixed.error).toBe('mixed-share-set-id');
    }
  });
});

describe('TrackWork shares - error secrecy', () => {
  const result = gen();
  if (!result.ok) throw new Error('setup failed');
  const [s1, s2] = result.shares;

  it('errors never contain KEK/share material', () => {
    const kekHex = Buffer.from(KEK).toString('hex');
    const failures = [
      reconstructTrackWorkKek([s1.serialized]),
      reconstructTrackWorkKek([s1.serialized, s2.serialized, 'garbage']),
      reconstructTrackWorkKek([s1.serialized.slice(0, -10), s2.serialized]),
      parseTrackWorkShare('twshare-v1.' + 'x'.repeat(50)),
    ];
    for (const failure of failures) {
      expect(failure.ok).toBe(false);
      if (!failure.ok) {
        const rendered = JSON.stringify(failure);
        expect(rendered).not.toContain(kekHex);
        expect(rendered).not.toContain('twshare-v1');
        expect(rendered).not.toContain(s1.shareSetId);
      }
    }
  });

  it('a wrong KEK generation produces different shares that never mix', () => {
    const other = gen(KEY_SET_A, OTHER_KEK);
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    const mixed = reconstructTrackWorkKek([
      s1.serialized,
      other.shares[0].serialized,
    ]);
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) {
      expect(mixed.error).toBe('mixed-share-set-id');
    }
  });
});

describe('TrackWork shares - parser direct', () => {
  it('serializer throws on invalid input', () => {
    const result = gen();
    if (!result.ok) throw new Error('setup failed');
    const share = result.shares[0];
    expect(() => serializeTrackWorkShare({ ...share, index: 0 })).toThrow(
      TypeError
    );
    expect(() =>
      serializeTrackWorkShare({ ...share, shareBytes: new Uint8Array(8) })
    ).toThrow(TypeError);
  });

  it('parseKeySetId rejects ShareSetId and vice versa', () => {
    expect(parseKeySetId(SHARE_SET_A)).toBeNull();
    expect(parseKeySetId('ss_' + 'a'.repeat(32))).toBeNull();
  });
});
