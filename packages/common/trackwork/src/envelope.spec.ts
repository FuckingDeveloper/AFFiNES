import { describe, expect, it } from 'vitest';

import {
  canonicalizeTrackWorkStableRecordId,
  serializeTrackWorkAad,
} from './aad';
import type { TrackWorkEncryptedValueEnvelopeV1 } from './envelope';
import {
  classifyTrackWorkValue,
  parseTrackWorkEnvelopeV1,
  serializeTrackWorkEnvelopeV1,
  TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1,
  TRACKWORK_ENVELOPE_NONCE_BYTES,
  TRACKWORK_ENVELOPE_TAG_BYTES,
} from './envelope';
import { assertDataKeyId, parseDataKeyId, parseKeySetId } from './identifiers';

const fakeEnvelope = (): TrackWorkEncryptedValueEnvelopeV1 => ({
  version: 1,
  algorithm: TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1,
  keyId: assertDataKeyId('dk_' + 'a'.repeat(32)),
  nonce: new Uint8Array(TRACKWORK_ENVELOPE_NONCE_BYTES),
  ciphertext: new Uint8Array([3, 4, 5]),
  tag: new Uint8Array(TRACKWORK_ENVELOPE_TAG_BYTES),
});

const canonical =
  'twenc1.trackwork-aead-v1.dk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.AAAAAAAAAAAAAAAA.AwQF.AAAAAAAAAAAAAAAAAAAAAA';

describe('TrackWork envelope V1 serialization', () => {
  it('round-trips a canonical V1 envelope with fake ciphertext bytes', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const parsed = parseTrackWorkEnvelopeV1(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.version).toBe(1);
    expect(parsed.envelope.algorithm).toBe('trackwork-aead-v1');
    expect(parsed.envelope.keyId).toBe(fakeEnvelope().keyId);
    expect([...parsed.envelope.nonce]).toEqual([...fakeEnvelope().nonce]);
    expect([...parsed.envelope.ciphertext]).toEqual([3, 4, 5]);
    expect([...parsed.envelope.tag]).toEqual([...fakeEnvelope().tag]);
  });

  it('emits the exact canonical serialized form', () => {
    expect(serializeTrackWorkEnvelopeV1(fakeEnvelope())).toBe(canonical);
  });

  it('rejects a non-V1 version at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({ ...fakeEnvelope(), version: 2 as never })
    ).toThrow(TypeError);
  });

  it('rejects an unknown algorithm at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        algorithm: 'trackwork-aead-v2' as never,
      })
    ).toThrow(TypeError);
  });

  it('rejects a KeySetId as the envelope keyId at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        keyId: parseKeySetId('ks_' + 'b'.repeat(32)) as never,
      })
    ).toThrow(TypeError);
  });

  it('rejects wrong nonce length at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        nonce: new Uint8Array(11),
      })
    ).toThrow(TypeError);
  });

  it('rejects wrong tag length at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        tag: new Uint8Array(15),
      })
    ).toThrow(TypeError);
  });

  it('rejects empty ciphertext at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        ciphertext: new Uint8Array(0),
      })
    ).toThrow(TypeError);
  });
});

describe('TrackWork envelope V1 parsing', () => {
  it('rejects empty and malformed inputs', () => {
    expect(parseTrackWorkEnvelopeV1('').ok).toBe(false);
    expect(parseTrackWorkEnvelopeV1('twenc1.').ok).toBe(false);
    expect(parseTrackWorkEnvelopeV1('twenc1.trackwork-aead-v1').ok).toBe(false);
    expect(parseTrackWorkEnvelopeV1('not-an-envelope').ok).toBe(false);
  });

  it('rejects truncated serialization', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    expect(parseTrackWorkEnvelopeV1(serialized.slice(0, -10)).ok).toBe(false);
  });

  it('rejects extra components', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    expect(parseTrackWorkEnvelopeV1(serialized + '.extra').ok).toBe(false);
  });

  it('rejects invalid base64url', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const badNonce = serialized.replace('.AAAAAAAAAAAAAAAA.', '.!!!.');
    const parsed = parseTrackWorkEnvelopeV1(badNonce);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('invalid-base64url');
    }
  });

  it('rejects padded base64url', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const padded = serialized.replace(
      '.AAAAAAAAAAAAAAAA.',
      '.AAAAAAAAAAAAAAAA==.'
    );
    expect(parseTrackWorkEnvelopeV1(padded).ok).toBe(false);
  });

  it('rejects noncanonical base64url length (mod 4 == 1)', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const bad = serialized.replace('.AAAAAAAAAAAAAAAA.', '.AAAAA.');
    const parsed = parseTrackWorkEnvelopeV1(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('invalid-base64url');
    }
  });

  it('rejects wrong nonce length (13 decoded bytes)', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const wrong = serialized.replace(
      '.AAAAAAAAAAAAAAAA.',
      '.AAAAAAAAAAAAAAAAAA.'
    );
    const parsed = parseTrackWorkEnvelopeV1(wrong);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('wrong-nonce-length');
    }
  });

  it('rejects wrong tag length (15 decoded bytes)', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const wrong = serialized.replace(
      '.AAAAAAAAAAAAAAAAAAAAAA.',
      '.AAAAAAAAAAAAAAAAAAAAAA',
      1
    );
    const bad = wrong.replace('twenc1.', 'twenc1.') + 'AA';
    const parsed = parseTrackWorkEnvelopeV1(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('wrong-tag-length');
    }
  });

  it('rejects unknown envelope versions', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const v2 = 'twenc2.' + serialized.slice('twenc1.'.length);
    const parsed = parseTrackWorkEnvelopeV1(v2);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('unsupported-version');
    }
    expect(classifyTrackWorkValue(v2)).toBe('malformed-new-envelope');
  });

  it('rejects unknown algorithms', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const bad = serialized.replace(
      TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1,
      'trackwork-aead-v9'
    );
    const parsed = parseTrackWorkEnvelopeV1(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('unsupported-algorithm');
    }
  });

  it('rejects invalid DataKeyId inside the envelope', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const bad = serialized.replace(
      'dk_' + 'a'.repeat(32),
      'ks_' + 'b'.repeat(32)
    );
    const parsed = parseTrackWorkEnvelopeV1(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBe('invalid-data-key-id');
    }
  });

  it('rejects oversized envelopes', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    const oversized =
      'twenc1.trackwork-aead-v1.dk_' + 'a'.repeat(32) + '.' + 'A'.repeat(70000);
    expect(parseTrackWorkEnvelopeV1(oversized).ok).toBe(false);
    expect(parseTrackWorkEnvelopeV1(serialized + 'A'.repeat(70000)).ok).toBe(
      false
    );
  });

  it('never downgrades a V1-looking malformed value', () => {
    const malformed = 'twenc1.trackwork-aead-v1.dk_broken.notbase64!.x.y';
    expect(classifyTrackWorkValue(malformed)).toBe('malformed-new-envelope');
    expect(parseTrackWorkEnvelopeV1(malformed).ok).toBe(false);
  });

  it('classifies non-envelope values as not-new-envelope', () => {
    expect(classifyTrackWorkValue('')).toBe('not-new-envelope');
    expect(classifyTrackWorkValue('legacy-plaintext-or-cipher')).toBe(
      'not-new-envelope'
    );
  });
});

describe('TrackWork AAD context', () => {
  const recordA = canonicalizeTrackWorkStableRecordId(
    'connected-account',
    'row-123'
  );
  const recordB = canonicalizeTrackWorkStableRecordId(
    'connected-account',
    'row-456'
  );

  it('differs for access-token vs refresh-token on the same record', () => {
    expect(recordA).not.toBeNull();
    if (!recordA) return;
    const access = serializeTrackWorkAad({
      domain: 'connected-oauth',
      fieldPurpose: 'access-token',
      stableRecordId: recordA,
    });
    const refresh = serializeTrackWorkAad({
      domain: 'connected-oauth',
      fieldPurpose: 'refresh-token',
      stableRecordId: recordA,
    });
    expect(access).not.toBe(refresh);
  });

  it('differs for token vs webhook-secret on the same integration record', () => {
    expect(recordA).not.toBeNull();
    if (!recordA) return;
    const token = serializeTrackWorkAad({
      domain: 'integration',
      fieldPurpose: 'token',
      stableRecordId: recordA,
    });
    const secret = serializeTrackWorkAad({
      domain: 'integration',
      fieldPurpose: 'webhook-secret',
      stableRecordId: recordA,
    });
    expect(token).not.toBe(secret);
  });

  it('differs between record ids', () => {
    expect(recordA).not.toBeNull();
    expect(recordB).not.toBeNull();
    if (!recordA || !recordB) return;
    const a = serializeTrackWorkAad({
      domain: 'connected-oauth',
      fieldPurpose: 'access-token',
      stableRecordId: recordA,
    });
    const b = serializeTrackWorkAad({
      domain: 'connected-oauth',
      fieldPurpose: 'access-token',
      stableRecordId: recordB,
    });
    expect(a).not.toBe(b);
  });

  it('serializes deterministically', () => {
    expect(recordA).not.toBeNull();
    if (!recordA) return;
    const context = {
      domain: 'integration' as const,
      fieldPurpose: 'sync-token' as const,
      stableRecordId: recordA,
    };
    expect(serializeTrackWorkAad(context)).toBe(serializeTrackWorkAad(context));
    expect(serializeTrackWorkAad(context)).toBe(
      'trackwork:aead:v1:integration:sync-token:connected-account:row-123'
    );
  });

  it('rejects a field purpose outside its domain matrix', () => {
    expect(recordA).not.toBeNull();
    if (!recordA) return;
    expect(
      serializeTrackWorkAad({
        domain: 'totp',
        fieldPurpose: 'access-token' as never,
        stableRecordId: recordA,
      })
    ).toBeNull();
  });

  it('rejects non-canonical stable record ids', () => {
    expect(
      canonicalizeTrackWorkStableRecordId('not-an-alias', 'row-123')
    ).toBeNull();
    expect(
      canonicalizeTrackWorkStableRecordId('connected-account', '')
    ).toBeNull();
    expect(
      canonicalizeTrackWorkStableRecordId(
        'connected-account',
        'row:with:colons'
      )
    ).toBeNull();
    expect(
      canonicalizeTrackWorkStableRecordId('connected-account', 'row with space')
    ).toBeNull();
  });

  it('proves the envelope does not self-authorize its AAD context', () => {
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    expect(serialized).not.toContain('connected-oauth');
    expect(serialized).not.toContain('access-token');
    expect(serialized).not.toContain('connected-account');
    expect(serialized).not.toContain('trackwork:aead');
  });
});

describe('TrackWork rotation identifier model', () => {
  it('KEK/share-set rotation leaves DataKeyId (and the value) unchanged', () => {
    const keySetK1 = parseKeySetId('ks_' + 'c'.repeat(32));
    const keySetK2 = parseKeySetId('ks_' + 'd'.repeat(32));
    expect(keySetK1).not.toBeNull();
    expect(keySetK2).not.toBeNull();
    const serialized = serializeTrackWorkEnvelopeV1(fakeEnvelope());
    expect(serialized).toContain('dk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(serialized).not.toContain('ks_');
  });

  it('DEK rotation changes DataKeyId without KeySetId semantics in the envelope', () => {
    const dekD1 = parseDataKeyId('dk_' + 'e'.repeat(32));
    const dekD2 = parseDataKeyId('dk_' + 'f'.repeat(32));
    expect(dekD1).not.toBeNull();
    expect(dekD2).not.toBeNull();
    const envelopeD1 = serializeTrackWorkEnvelopeV1({
      ...fakeEnvelope(),
      keyId: dekD1 as never,
    });
    const envelopeD2 = serializeTrackWorkEnvelopeV1({
      ...fakeEnvelope(),
      keyId: dekD2 as never,
    });
    expect(envelopeD1).not.toBe(envelopeD2);
    expect(envelopeD1).toContain('dk_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(envelopeD2).toContain('dk_ffffffffffffffffffffffffffffffff');
  });

  it('DataKeyId and KeySetId cannot be interchanged (validators reject wrong prefixes)', () => {
    expect(parseDataKeyId('ks_' + 'a'.repeat(32))).toBeNull();
    expect(parseDataKeyId('lk_' + 'a'.repeat(32))).toBeNull();
    expect(parseKeySetId('dk_' + 'a'.repeat(32))).toBeNull();
    expect(parseKeySetId('lk_' + 'a'.repeat(32))).toBeNull();
    expect(parseDataKeyId('dk_' + 'A'.repeat(32))).toBeNull();
    expect(parseDataKeyId('dk_' + 'a'.repeat(31))).toBeNull();
  });
});
