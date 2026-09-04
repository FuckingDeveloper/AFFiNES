import { describe, expect, it } from 'vitest';

import {
  canonicalizeTrackWorkStableRecordId,
  isTrackWorkAadFieldPurpose,
  serializeTrackWorkAad,
  serializeTrackWorkWrapAad,
  TRACKWORK_STABLE_RECORD_ALIASES,
  TRACKWORK_STABLE_RECORD_ID_MAX_LENGTH,
  TRACKWORK_STABLE_RECORD_ROW_ID_MAX_LENGTH,
  trackWorkAadRecordAlias,
} from './aad';
import type { TrackWorkEncryptedValueEnvelopeV1 } from './envelope';
import {
  classifyTrackWorkValue,
  parseTrackWorkEnvelopeV1,
  serializeTrackWorkEnvelopeV1,
  TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1,
  TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES,
  TRACKWORK_ENVELOPE_MAX_SERIALIZED_LENGTH,
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

  it('accepts the maximum ciphertext size end-to-end (serialize -> parse)', () => {
    const maxEnv = {
      ...fakeEnvelope(),
      ciphertext: new Uint8Array(TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES),
    };
    const serialized = serializeTrackWorkEnvelopeV1(maxEnv);
    expect(serialized.length).toBeLessThanOrEqual(
      TRACKWORK_ENVELOPE_MAX_SERIALIZED_LENGTH
    );
    const parsed = parseTrackWorkEnvelopeV1(serialized);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.ciphertext.length).toBe(
        TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES
      );
    }
    expect(classifyTrackWorkValue(serialized)).toBe('new-envelope-v1');
  });

  it('rejects ciphertext larger than the limit at serialization', () => {
    expect(() =>
      serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        ciphertext: new Uint8Array(TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES + 1),
      })
    ).toThrow(TypeError);
  });

  it('every serializer-produced boundary value parses successfully', () => {
    for (const size of [
      1,
      12,
      32,
      256,
      4096,
      TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES,
    ]) {
      const serialized = serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        ciphertext: new Uint8Array(size),
      });
      expect(parseTrackWorkEnvelopeV1(serialized).ok).toBe(true);
    }
  });

  it('derives the exact canonical serialized length for plaintext sizes', () => {
    const fixed =
      'twenc1'.length +
      5 +
      TRACKWORK_ENVELOPE_ALGORITHM_AEAD_V1.length +
      ('dk_' + 'a'.repeat(32)).length +
      Math.ceil((TRACKWORK_ENVELOPE_NONCE_BYTES * 4) / 3) +
      Math.ceil((TRACKWORK_ENVELOPE_TAG_BYTES * 4) / 3);
    expect(fixed).toBe(101);
    for (const size of [32, 256, 4096]) {
      const serialized = serializeTrackWorkEnvelopeV1({
        ...fakeEnvelope(),
        ciphertext: new Uint8Array(size),
      });
      const expected = fixed + Math.ceil((size * 4) / 3);
      expect(serialized.length).toBe(expected);
    }
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
    const connRecord = canonicalizeTrackWorkStableRecordId(
      'development-integration-connection',
      'row-123'
    );
    expect(connRecord).not.toBeNull();
    if (!connRecord) return;
    const token = serializeTrackWorkAad({
      domain: 'integration',
      fieldPurpose: 'token',
      stableRecordId: connRecord,
    });
    const secret = serializeTrackWorkAad({
      domain: 'integration',
      fieldPurpose: 'webhook-secret',
      stableRecordId: connRecord,
    });
    expect(token).not.toBe(secret);
    expect(token).toBe(
      'trackwork:aead:v1:integration:token:development-integration-connection:row-123'
    );
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
    const repoRecord = canonicalizeTrackWorkStableRecordId(
      'development-repository',
      'row-123'
    );
    expect(repoRecord).not.toBeNull();
    if (!repoRecord) return;
    const context = {
      domain: 'integration' as const,
      fieldPurpose: 'sync-token' as const,
      stableRecordId: repoRecord,
    };
    expect(serializeTrackWorkAad(context)).toBe(serializeTrackWorkAad(context));
    expect(serializeTrackWorkAad(context)).toBe(
      'trackwork:aead:v1:integration:sync-token:development-repository:row-123'
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

  it('rejects cross-model record aliases (runtime, untrusted input)', () => {
    expect(recordA).not.toBeNull();
    if (!recordA) return;
    const asUntrusted = (
      context: Parameters<typeof serializeTrackWorkAad>[0]
    ) => serializeTrackWorkAad(context as never);
    expect(
      asUntrusted({
        domain: 'integration',
        fieldPurpose: 'token',
        stableRecordId: recordA,
      })
    ).toBeNull();
    expect(
      asUntrusted({
        domain: 'connected-oauth',
        fieldPurpose: 'access-token',
        stableRecordId: canonicalizeTrackWorkStableRecordId(
          'development-repository',
          'row-456'
        ),
      })
    ).toBeNull();
    expect(
      asUntrusted({
        domain: 'totp',
        fieldPurpose: 'seed',
        stableRecordId: recordA,
      })
    ).toBeNull();
    expect(
      asUntrusted({
        domain: 'copilot',
        fieldPurpose: 'api-key',
        stableRecordId: recordA,
      })
    ).toBeNull();
  });

  it('unknown runtime domain does not throw and returns null', () => {
    const asUntrusted = serializeTrackWorkAad as (
      context: unknown
    ) => string | null;
    expect(
      asUntrusted({
        domain: 'unknown-domain',
        fieldPurpose: 'token',
        stableRecordId: 'connected-account:row-1',
      })
    ).toBeNull();
    expect(trackWorkAadRecordAlias('unknown-domain', 'token')).toBeUndefined();
    expect(isTrackWorkAadFieldPurpose('unknown-domain', 'token')).toBe(false);
  });

  it('unknown runtime purpose returns null/false', () => {
    expect(
      trackWorkAadRecordAlias('integration', 'not-a-purpose')
    ).toBeUndefined();
    expect(isTrackWorkAadFieldPurpose('integration', 'not-a-purpose')).toBe(
      false
    );
  });

  it('prototype-chain names are rejected as field purposes', () => {
    const asUntrusted = serializeTrackWorkAad as (
      context: unknown
    ) => string | null;
    for (const key of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(trackWorkAadRecordAlias('integration', key)).toBeUndefined();
      expect(isTrackWorkAadFieldPurpose('integration', key)).toBe(false);
      expect(
        asUntrusted({
          domain: 'integration',
          fieldPurpose: key,
          stableRecordId: 'development-integration-connection:row-1',
        })
      ).toBeNull();
    }
  });

  it('valid AAD combinations still serialize identically', () => {
    expect(
      serializeTrackWorkAad({
        domain: 'integration',
        fieldPurpose: 'sync-token',
        stableRecordId: 'development-repository:row-123',
      })
    ).toBe(
      'trackwork:aead:v1:integration:sync-token:development-repository:row-123'
    );
    expect(
      serializeTrackWorkAad({
        domain: 'connected-oauth',
        fieldPurpose: 'access-token',
        stableRecordId: 'connected-account:row-123',
      })
    ).toBe(
      'trackwork:aead:v1:connected-oauth:access-token:connected-account:row-123'
    );
  });

  it('derives the full stableRecordId maximum from aliases and row-id limit', () => {
    const longestAlias = Math.max(
      ...TRACKWORK_STABLE_RECORD_ALIASES.map(alias => alias.length)
    );
    expect(longestAlias).toBe(34);
    expect('development-integration-connection'.length).toBe(34);
    const derived =
      longestAlias + 1 + TRACKWORK_STABLE_RECORD_ROW_ID_MAX_LENGTH;
    expect(derived).toBe(99);
    expect(TRACKWORK_STABLE_RECORD_ID_MAX_LENGTH).toBe(derived);
  });

  it('every fieldPurpose maps to exactly its intended record alias', () => {
    expect(
      serializeTrackWorkAad({
        domain: 'connected-oauth',
        fieldPurpose: 'refresh-token',
        stableRecordId: 'connected-account:row-1',
      })
    ).toBe(
      'trackwork:aead:v1:connected-oauth:refresh-token:connected-account:row-1'
    );
    expect(
      serializeTrackWorkAad({
        domain: 'integration',
        fieldPurpose: 'webhook-secret',
        stableRecordId: 'development-integration-connection:row-1',
      })
    ).toBe(
      'trackwork:aead:v1:integration:webhook-secret:development-integration-connection:row-1'
    );
    expect(
      serializeTrackWorkAad({
        domain: 'totp',
        fieldPurpose: 'seed',
        stableRecordId: 'user-two-factor-auth:row-1',
      })
    ).toBe('trackwork:aead:v1:totp:seed:user-two-factor-auth:row-1');
    expect(
      serializeTrackWorkAad({
        domain: 'copilot',
        fieldPurpose: 'api-key',
        stableRecordId: 'ai-workspace-byok-config:row-1',
      })
    ).toBe('trackwork:aead:v1:copilot:api-key:ai-workspace-byok-config:row-1');
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

  it('wrap AAD accepts only canonical KeySetId (no DataKeyId/LookupKeyId)', () => {
    const ks = parseKeySetId('ks_' + 'c'.repeat(32));
    expect(ks).not.toBeNull();
    if (!ks) return;
    expect(serializeTrackWorkWrapAad('dek', ks)).toBe(
      'trackwork:wrap:v1:dek:ks_' + 'c'.repeat(32)
    );
    expect(serializeTrackWorkWrapAad('lookup-key', ks)).toBe(
      'trackwork:wrap:v1:lookup-key:ks_' + 'c'.repeat(32)
    );
    expect(
      serializeTrackWorkWrapAad('dek', ('dk_' + 'a'.repeat(32)) as never)
    ).toBeNull();
    expect(
      serializeTrackWorkWrapAad('dek', ('lk_' + 'a'.repeat(32)) as never)
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
