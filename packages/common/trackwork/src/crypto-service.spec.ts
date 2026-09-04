import { describe, expect, it } from 'vitest';

import {
  canonicalizeTrackWorkStableRecordId,
  serializeTrackWorkAad,
  type TrackWorkAadContext,
} from './aad';
import {
  buildTrackWorkAuthenticatedBytes,
  decryptTrackWorkValue,
  encryptTrackWorkValue,
  generateTrackWorkDataEncryptionKey,
  TRACKWORK_DEK_BYTES,
  type TrackWorkCryptoError,
} from './crypto-service';
import {
  parseTrackWorkEnvelopeV1,
  TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES,
  TRACKWORK_ENVELOPE_NONCE_BYTES,
  TRACKWORK_ENVELOPE_TAG_BYTES,
} from './envelope';
import { assertDataKeyId } from './identifiers';

const KEY_ID = assertDataKeyId('dk_' + 'a'.repeat(32));

const integrationRecord = () =>
  canonicalizeTrackWorkStableRecordId(
    'development-integration-connection',
    'row-123'
  );

const aadContext = (): TrackWorkAadContext => ({
  domain: 'integration',
  fieldPurpose: 'token',
  stableRecordId: integrationRecord() as string,
});

const otherAadContext = (): TrackWorkAadContext => ({
  domain: 'integration',
  fieldPurpose: 'webhook-secret',
  stableRecordId: integrationRecord() as string,
});

const secret = () => new TextEncoder().encode('scm-token-value');

const errors: readonly TrackWorkCryptoError[] = [
  'invalid-data-key-length',
  'invalid-aad-context',
  'invalid-plaintext',
  'oversized-plaintext',
  'invalid-data-key-id',
  'key-id-mismatch',
  'malformed-envelope',
  'unsupported-version',
  'unsupported-algorithm',
  'authentication-failure',
];

describe('TrackWork crypto service - generation', () => {
  it('generates 32-byte DEKs', () => {
    expect(generateTrackWorkDataEncryptionKey().length).toBe(
      TRACKWORK_DEK_BYTES
    );
    expect(generateTrackWorkDataEncryptionKey().length).toBe(32);
  });

  it('generates distinct DEKs', () => {
    const a = generateTrackWorkDataEncryptionKey();
    const b = generateTrackWorkDataEncryptionKey();
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('uses 12-byte nonces and 16-byte tags in produced envelopes', () => {
    const result = encryptTrackWorkValue(
      secret(),
      aadContext(),
      generateTrackWorkDataEncryptionKey(),
      KEY_ID
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseTrackWorkEnvelopeV1(result.envelope);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.nonce.length).toBe(TRACKWORK_ENVELOPE_NONCE_BYTES);
    expect(parsed.envelope.tag.length).toBe(TRACKWORK_ENVELOPE_TAG_BYTES);
  });
});

describe('TrackWork crypto service - encrypt/decrypt round-trip', () => {
  it('round-trips plaintext through the canonical V1 envelope', () => {
    const key = generateTrackWorkDataEncryptionKey();
    const enc = encryptTrackWorkValue(secret(), aadContext(), key, KEY_ID);
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const dec = decryptTrackWorkValue(enc.envelope, aadContext(), key);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    expect(Buffer.from(dec.plaintext).toString()).toBe('scm-token-value');
    expect(dec.keyId).toBe(KEY_ID);
  });

  it('uses a different nonce for repeated encryption of identical plaintext', () => {
    const key = generateTrackWorkDataEncryptionKey();
    const enc1 = encryptTrackWorkValue(secret(), aadContext(), key, KEY_ID);
    const enc2 = encryptTrackWorkValue(secret(), aadContext(), key, KEY_ID);
    expect(enc1.ok).toBe(true);
    expect(enc2.ok).toBe(true);
    if (!enc1.ok || !enc2.ok) return;
    expect(enc1.envelope).not.toBe(enc2.envelope);
    const p1 = parseTrackWorkEnvelopeV1(enc1.envelope);
    const p2 = parseTrackWorkEnvelopeV1(enc2.envelope);
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;
    expect(
      Buffer.from(p1.envelope.nonce).equals(Buffer.from(p2.envelope.nonce))
    ).toBe(false);
  });

  it('empty plaintext is rejected explicitly', () => {
    const result = encryptTrackWorkValue(
      new Uint8Array(0),
      aadContext(),
      generateTrackWorkDataEncryptionKey(),
      KEY_ID
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-plaintext');
    }
  });

  it('max-size plaintext round-trips', () => {
    const key = generateTrackWorkDataEncryptionKey();
    const payload = new Uint8Array(
      TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES
    ).fill(7);
    const enc = encryptTrackWorkValue(payload, aadContext(), key, KEY_ID);
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    const dec = decryptTrackWorkValue(enc.envelope, aadContext(), key);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    expect(dec.plaintext.length).toBe(TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES);
  });

  it('max+1 plaintext fails before producing an envelope', () => {
    const result = encryptTrackWorkValue(
      new Uint8Array(TRACKWORK_ENVELOPE_MAX_CIPHERTEXT_BYTES + 1),
      aadContext(),
      generateTrackWorkDataEncryptionKey(),
      KEY_ID
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('oversized-plaintext');
    }
  });
});

describe('TrackWork crypto service - misuse and adversarial input', () => {
  const key = generateTrackWorkDataEncryptionKey();
  const enc = encryptTrackWorkValue(secret(), aadContext(), key, KEY_ID);
  if (!enc.ok) throw new Error('setup encryption failed');
  const envelope = enc.envelope;

  const replaceSegment = (needle: string, replacement: string): string => {
    const index = envelope.indexOf(needle);
    if (index < 0) throw new Error('segment not found: ' + needle);
    return (
      envelope.slice(0, index) +
      replacement +
      envelope.slice(index + needle.length)
    );
  };

  it('wrong DEK fails authentication', () => {
    const wrong = generateTrackWorkDataEncryptionKey();
    const result = decryptTrackWorkValue(envelope, aadContext(), wrong);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('wrong AAD domain fails', () => {
    const wrongDomain: TrackWorkAadContext = {
      domain: 'connected-oauth',
      fieldPurpose: 'access-token',
      stableRecordId: 'connected-account:row-123',
    };
    const result = decryptTrackWorkValue(envelope, wrongDomain, key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('wrong fieldPurpose fails', () => {
    const result = decryptTrackWorkValue(envelope, otherAadContext(), key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('wrong stableRecordId fails', () => {
    const wrongRecord: TrackWorkAadContext = {
      domain: 'integration',
      fieldPurpose: 'token',
      stableRecordId: 'development-integration-connection:row-999',
    };
    const result = decryptTrackWorkValue(envelope, wrongRecord, key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('modified ciphertext fails authentication', () => {
    const segments = envelope.split('.');
    const ciphertext = segments[4];
    const modified = segments[4].replace(
      /A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z/g,
      'Z'
    );
    expect(modified).not.toBe(ciphertext);
    const result = decryptTrackWorkValue(
      [
        segments[0],
        segments[1],
        segments[2],
        segments[3],
        modified,
        segments[5],
      ].join('.'),
      aadContext(),
      key
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('modified tag fails authentication', () => {
    const segments = envelope.split('.');
    const modifiedTag = segments[5].replace(/[A-Za-z0-9_-]/g, 'A');
    expect(modifiedTag).not.toBe(segments[5]);
    const result = decryptTrackWorkValue(
      [
        segments[0],
        segments[1],
        segments[2],
        segments[3],
        segments[4],
        modifiedTag,
      ].join('.'),
      aadContext(),
      key
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('modified nonce fails authentication', () => {
    const segments = envelope.split('.');
    const modifiedNonce = segments[3].replace(/[A-Za-z0-9_-]/g, 'B');
    expect(modifiedNonce).not.toBe(segments[3]);
    const result = decryptTrackWorkValue(
      [
        segments[0],
        segments[1],
        segments[2],
        modifiedNonce,
        segments[4],
        segments[5],
      ].join('.'),
      aadContext(),
      key
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('modifying ONLY the DataKeyId fails authentication (expectedKeyId omitted)', () => {
    const otherKeyId = assertDataKeyId('dk_' + 'b'.repeat(32));
    const tampered = replaceSegment(KEY_ID, otherKeyId);
    const result = decryptTrackWorkValue(tampered, aadContext(), key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('authentication-failure');
    }
  });

  it('modifying ONLY the DataKeyId fails closed (expectedKeyId supplied)', () => {
    const otherKeyId = assertDataKeyId('dk_' + 'b'.repeat(32));
    const tampered = replaceSegment(KEY_ID, otherKeyId);
    const result = decryptTrackWorkValue(tampered, aadContext(), key, KEY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('key-id-mismatch');
    }
  });

  it('original envelope with wrong expectedKeyId -> key-id-mismatch', () => {
    const otherKeyId = assertDataKeyId('dk_' + 'b'.repeat(32));
    const result = decryptTrackWorkValue(
      envelope,
      aadContext(),
      key,
      otherKeyId
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('key-id-mismatch');
    }
  });

  it('envelopes with different legitimate DataKeyIds are not interchangeable', () => {
    const keyId2 = assertDataKeyId('dk_' + 'b'.repeat(32));
    const enc1 = encryptTrackWorkValue(secret(), aadContext(), key, KEY_ID);
    const enc2 = encryptTrackWorkValue(secret(), aadContext(), key, keyId2);
    expect(enc1.ok).toBe(true);
    expect(enc2.ok).toBe(true);
    if (!enc1.ok || !enc2.ok) return;
    expect(enc1.envelope).not.toBe(enc2.envelope);
    const tampered = enc1.envelope.replace(KEY_ID, keyId2);
    expect(decryptTrackWorkValue(tampered, aadContext(), key).ok).toBe(false);
    expect(decryptTrackWorkValue(enc2.envelope, aadContext(), key).ok).toBe(
      true
    );
    const dec2 = decryptTrackWorkValue(enc2.envelope, aadContext(), key);
    if (dec2.ok) {
      expect(dec2.keyId).toBe(keyId2);
    }
  });

  it('malformed envelope fails closed', () => {
    const result = decryptTrackWorkValue(
      'twenc1.trackwork-aead-v1.dk_broken.!.x.y',
      aadContext(),
      key
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('malformed-envelope');
    }
  });

  it('unsupported version fails closed', () => {
    const tampered = replaceSegment('twenc1.', 'twenc2.');
    const result = decryptTrackWorkValue(tampered, aadContext(), key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('unsupported-version');
    }
  });

  it('unsupported algorithm fails closed', () => {
    const tampered = envelope.replace('trackwork-aead-v1', 'trackwork-aead-v9');
    const result = decryptTrackWorkValue(tampered, aadContext(), key);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('unsupported-algorithm');
    }
  });

  it('non-string serialized inputs fail through the discriminated API', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      {},
      [],
      123,
      true,
      new Uint8Array(8),
    ];
    for (const input of inputs) {
      const result = decryptTrackWorkValue(input as never, aadContext(), key);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('malformed-envelope');
      }
    }
  });

  it('invalid key length fails before crypto', () => {
    const shortKey = new Uint8Array(16);
    expect(
      encryptTrackWorkValue(secret(), aadContext(), shortKey, KEY_ID)
    ).toEqual({ ok: false, error: 'invalid-data-key-length' });
    expect(decryptTrackWorkValue(envelope, aadContext(), shortKey)).toEqual({
      ok: false,
      error: 'invalid-data-key-length',
    });
  });

  it('invalid AAD context fails before crypto', () => {
    const badContext = {
      domain: 'integration',
      fieldPurpose: 'token',
      stableRecordId: 'connected-account:row-123',
    } as never;
    const result = encryptTrackWorkValue(secret(), badContext, key, KEY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid-aad-context');
    }
    expect(serializeTrackWorkAad(badContext)).toBeNull();
  });

  it('authenticated bytes are the exact canonical AAD + NUL + DataKeyId vector', () => {
    const aad = serializeTrackWorkAad(aadContext());
    expect(aad).not.toBeNull();
    if (!aad) return;
    const expected = new Uint8Array(
      Buffer.concat([
        Buffer.from(aad, 'utf8'),
        Buffer.from([0x00]),
        Buffer.from(KEY_ID, 'utf8'),
      ])
    );
    const actual = buildTrackWorkAuthenticatedBytes(aad, KEY_ID);
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
    expect(new TextDecoder().decode(actual.slice(0, aad.length))).toBe(aad);
    expect(actual[aad.length]).toBe(0);
    expect(new TextDecoder().decode(actual.slice(aad.length + 1))).toBe(KEY_ID);
  });

  it('authenticated bytes are collision-free for distinct (AAD, DataKeyId) pairs', () => {
    const aad1 = serializeTrackWorkAad(aadContext());
    const otherRecord: TrackWorkAadContext = {
      domain: 'integration',
      fieldPurpose: 'token',
      stableRecordId: 'development-integration-connection:row-456',
    };
    const aad2 = serializeTrackWorkAad(otherRecord);
    const keyId2 = assertDataKeyId('dk_' + 'b'.repeat(32));
    if (!aad1 || !aad2) throw new Error('setup failed');
    const bytes1 = buildTrackWorkAuthenticatedBytes(aad1, KEY_ID);
    const bytes2 = buildTrackWorkAuthenticatedBytes(aad2, keyId2);
    expect(Buffer.from(bytes1).equals(Buffer.from(bytes2))).toBe(false);
    const boundaryA = buildTrackWorkAuthenticatedBytes(aad1, keyId2);
    const boundaryB = buildTrackWorkAuthenticatedBytes(aad2, KEY_ID);
    expect(Buffer.from(boundaryA).equals(Buffer.from(boundaryB))).toBe(false);
  });

  it('canonical AAD and DataKeyId alphabets exclude NUL (framing safety)', () => {
    const aad = serializeTrackWorkAad(aadContext());
    if (!aad) throw new Error('setup failed');
    expect(aad.includes(String.fromCharCode(0))).toBe(false);
    expect(KEY_ID.includes(String.fromCharCode(0))).toBe(false);
    expect(/^dk_[0-9a-f]{32}$/.test(KEY_ID)).toBe(true);
  });

  it('no secret material appears in thrown error messages', () => {
    const probe = 'SENSITIVE-PLAINTEXT-MARKER';
    const plaintext = new TextEncoder().encode(probe);
    const keyProbe = generateTrackWorkDataEncryptionKey();
    const keyString = Buffer.from(keyProbe).toString('hex');
    const wrongKey = generateTrackWorkDataEncryptionKey();
    const encResult = encryptTrackWorkValue(
      plaintext,
      aadContext(),
      keyProbe,
      KEY_ID
    );
    expect(encResult.ok).toBe(true);
    if (!encResult.ok) return;
    const failures: TrackWorkCryptoError[] = [
      (
        decryptTrackWorkValue(encResult.envelope, aadContext(), wrongKey) as {
          ok: false;
        }
      ).error,
      (
        decryptTrackWorkValue(
          encResult.envelope,
          otherAadContext(),
          keyProbe
        ) as { ok: false }
      ).error,
      (
        decryptTrackWorkValue(
          'twenc1.trackwork-aead-v1.dk_broken.!.x.y',
          aadContext(),
          keyProbe
        ) as { ok: false }
      ).error,
    ];
    for (const error of failures) {
      expect(errors).toContain(error);
      const rendered = JSON.stringify(error);
      expect(rendered).not.toContain(probe);
      expect(rendered).not.toContain(keyString);
      expect(rendered).not.toContain(encResult.envelope);
    }
  });
});
