# TrackWork Quorum Encryption - Cryptographic Primitive Selection

OpenSpec 3.2. Selection gate for the future TrackWork application-level
envelope encryption. This document is the decision record; NO encryption is
implemented yet. Exact algorithms, parameters, libraries and versions are
fixed here so that 3.3+ cannot silently choose different primitives.

Authoritative architecture: openspec/changes/trackwork-product-roadmap/
design.md section 9 (quorum-controlled envelope encryption) and the 3.1
classification (docs/trackwork-data-classification.md).

Hierarchy (fixed):

```text
Administrator shares (2 of 3)
   -> reconstruct KEK material (32 bytes, random, never persisted)
        -> KEK unwraps wrapped DEK (AES-256-GCM)
        -> KEK unwraps wrapped LookupKey (AES-256-GCM, separate purpose)
             -> DEK encrypts designated application values (AES-256-GCM)
             -> LookupKey keyed-hashes VerificationToken lookup values (HMAC-SHA-256)
```

## 1. Normative decision table

| Purpose                                         | Algorithm           | Parameters                                                                           | Implementation                                            | Persisted algorithm ID | Rationale                                                                                                            |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Random generation                               | CSPRNG              | n/a                                                                                  | `node:crypto.randomBytes` (server)                        | trackwork-rng-v1       | Native OpenSSL-backed CSPRNG; zero dependency; FIPS-compatible source                                                |
| Value AEAD                                      | AES-256-GCM         | key 32 B, nonce 12 B, tag 16 B, AAD required                                         | `node:crypto.createCipheriv`/`createDecipheriv` (OpenSSL) | trackwork-aead-v1      | Native; already the repository pattern (CryptoHelper prior art); FIPS-capable; no new dependency                     |
| Key wrapping (DEK and LookupKey)                | AES-256-GCM         | key 32 B (KEK), nonce 12 B, tag 16 B, AAD required (wrap purpose: dek or lookup-key) | `node:crypto`                                             | trackwork-wrap-v1      | Same native primitive; authenticated unwrap provides share-integrity detection and protects both wrapped keys        |
| Threshold secret sharing                        | Shamir over GF(2^8) | threshold 2, shares 3, secret 32 B                                                   | `shamirs-secret-sharing@2.0.1` (exact pin)                | trackwork-share-v1     | Mature maintained library; zero deps; RNG optional-with-default but MUST be injected (trackwork-rng-v1); server-only |
| Keyed lookup (VerificationToken, 3.3 structure) | HMAC-SHA-256        | key 32 B                                                                             | `node:crypto.createHmac`                                  | trackwork-lookup-v1    | Keyed PRF; no deterministic AEAD; no raw SHA-256 of low-entropy values                                               |
| KDF                                             | NONE                | -                                                                                    | -                                                         | -                      | NO KDF: shares originate from random high-entropy machine-generated material                                         |
| Secure comparison                               | constant-time       | n/a                                                                                  | `node:crypto.timingSafeEqual`                             | -                      | Share/token equality without timing leak                                                                             |
| Transport checksum (shares)                     | CRC-32              | 4 B                                                                                  | `@node-rs/crc32` (already in server deps)                 | -                      | ERROR DETECTION only, never authentication                                                                           |

Normative wording:

- MUST: value AEAD = AES-256-GCM as specified above; nonces random 12 B per
  encryption; tag 16 B; AAD always provided; DEK and KEK generated with
  `randomBytes(32)`; wrapped DEK is the only persisted DEK form; shares via
  `shamirs-secret-sharing@2.0.1` exactly; share transport encoding as defined
  in section 12; algorithm IDs as defined in section 18; explicitly inject
  `node:crypto.randomBytes` as the Shamir RNG (options.random) and MUST NOT
  rely on the library default RNG (Buffer.random / WebCrypto getRandomValues).
- MUST NOT: implement Shamir arithmetic by hand; use AES-CBC; use
  unauthenticated encryption; use deterministic encryption as a search index;
  persist plaintext KEK/DEK/shares anywhere (DB, Redis, files, logs); store
  shares in Redis; derive the KEK from a password; use Math.random, UUIDs or
  timestamps as key/nonce entropy; reuse the existing CryptoHelper RSA-derived
  key as the quorum KEK/DEK hierarchy.
- SHOULD: zeroize temporary key buffers best-effort (`buf.fill(0)` where
  practical); keep key material in memory for the shortest possible lifetime;
  rotate the DEK (re-wrap) at the ceremony-based key-set rotation.
- MAY: use a future HSM/KMS auto-unlock mode (separately specified later).

## 2. Mandatory primitive separation

A. random byte generation -> `node:crypto.randomBytes` (trackwork-rng-v1)
B. AEAD for application values -> AES-256-GCM via `node:crypto` (trackwork-aead-v1)
C. DEK wrapping -> AES-256-GCM via `node:crypto` (trackwork-wrap-v1)
D. threshold secret sharing -> `shamirs-secret-sharing@2.0.1` (trackwork-share-v1)
E. KDF -> NONE selected
F. secure comparison -> `node:crypto.timingSafeEqual`
G. serialization/encoding -> base64url (Node `Buffer.toString('base64url')`),
envelope byte layout defined in 3.3 per design.md
`{version, algorithm, keyId, nonce, ciphertext, tag}`

One package does NOT own unrelated primitives. The threshold library is the
only third-party cryptographic dependency.

## 3. AEAD candidates compared

| Criterion            | AES-256-GCM (node:crypto)                 | XChaCha20-Poly1305 (@noble/ciphers)                                                                           | ChaCha20-Poly1305                                                                            |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Runtime support      | Native (OpenSSL)                          | Pure JS dep (not in server deps today)                                                                        | Native (OpenSSL 3: node:crypto 'chacha20-poly1305' - verified Node v24.14.0 / OpenSSL 3.5.5) |
| Nonce size           | 12 B (96-bit)                             | 24 B (192-bit)                                                                                                | 12 B                                                                                         |
| Nonce-reuse behavior | Catastrophic (zeroization)                | Forbidden/dangerous with same key; 192-bit nonce only makes random collisions vastly less likely - NOT "safe" | Same as XChaCha class                                                                        |
| Tag                  | 16 B (configurable 12-16)                 | 16 B                                                                                                          | 16 B                                                                                         |
| FIPS/deployment      | FIPS-capable                              | Not FIPS                                                                                                      | Not FIPS                                                                                     |
| External dependency  | none                                      | @noble/ciphers@2.4.0 (new direct dep)                                                                         | none (native)                                                                                |
| Existing repo usage  | CryptoHelper uses AES-256-GCM (prior art) | none (noble/hashes transitive via @paralleldrive/cuid2 only)                                                  | none                                                                                         |
| Audit                | NIST SP 800-38D standard                  | no public audit verified in this pass                                                                         | -                                                                                            |

Decision: AES-256-GCM (node:crypto). XChaCha's larger nonce does not change
the decision: the collision probability at our scale is bounded (section 6);
AES-GCM adds zero dependencies, native performance and FIPS compatibility.
XChaCha20-Poly1305 remains the documented fallback ONLY IF a future FIPS-free
deployment explicitly requires it and a mature audited implementation is
pinned then (documented rejected alternative, section 30).

## 4. Selected value AEAD (exact)

```text
algorithm = AES-256-GCM
keyBytes = 32
nonceBytes = 12 (96-bit, random per encryption)
tagBytes = 16 (authTagLength 16; NOT the current CryptoHelper's 12)
rng = node:crypto.randomBytes(12)
aad = required (section 7)
plaintext assumptions = bounded values, <= 4 KiB typical; no streaming API
failure semantics = authentication failure on ANY mismatch (fail closed)
envelope version = trackwork-aead-v1
```

Tag length: 16 B per NIST SP 800-38D recommendation (the existing CryptoHelper
uses 12 B; new envelopes MUST use 16 B).

## 5. Nonce strategy

- Source: `node:crypto.randomBytes(12)` - cryptographically random.
- Fresh per encryption; MUST NOT be derived from workspace ID / DB ID /
  timestamp; MUST NOT be reused intentionally.
- Persisted inside the envelope (design.md envelope shape: nonce field).
- No global counter (no distributed synchronization; random nonces avoid it).
- Collision probability (birthday, 96-bit random nonces): P(n) = n^2 / 2^97.

| Encryptions n | P(collision) |
| ------------- | ------------ |
| 1e6           | 7.9e-18      |
| 1e9           | 6.3e-12      |
| 1e10          | 6.3e-10      |
| 1e11          | 6.3e-8       |

Consequence: the DEK MUST be rotated (re-wrapped under a fresh KEK ceremony)
before ~1e9 encryptions under one DEK - the project's conservative rotation
threshold (birthday collision probability ~6e-12 at 1e9), chosen
independently of the standards limit. Separately, NIST SP 800-38D (sec. 8.3):
for IVs generated by an approved RBG, the total number of invocations of the
encryption function per key SHALL not exceed 2^32 (~4.3e9) - the standards
bound; the project threshold is deliberately more conservative. At realistic
TrackWork scales (< 1e8 protected values per deployment) the risk is
negligible; the bounds are documented, not hand-waved.

## 6. AAD contract

AAD = UTF-8 bytes of the canonical string:

```text
trackwork:aead:v1:<domain>:<fieldPurpose>:<stableRecordId>
```

- `<domain>`: fixed registry value from a closed enum (stable, not display
  names): `integration`, `connected-oauth`, `totp`, `copilot`.
- `<fieldPurpose>`: stable closed-enum field identifier (per-field table
  below). REQUIRED because two encrypted fields can share domain + record
  (e.g. ConnectedAccount accessToken/refreshToken); without it, swapping
  their complete ciphertext envelopes under the same DEK would still
  authenticate.
- `<stableRecordId>`: non-secret stable identifier `table:rowId` (e.g.
  `dev_int_conn:clxyz`), stable across migrations.
- Canonical serialization: exactly the string above, UTF-8, no JSON, no
  whitespace, no ambiguity.
- Purpose: binds ciphertext to its semantic record AND field, preventing
  cross-field/cross-record ciphertext substitution.
- Survives rotation/migration: domain + fieldPurpose + recordId are stable;
  envelope version/algorithm are separate envelope fields, not AAD.
- AAD mismatch MUST cause authentication failure (fail closed).
- NOT included: workspace ID (redundant for single-DEK scope), display names,
  mutable property names, anything secret.

Per-field AAD purposes (MUST NOT be shared by two fields of the same record):

| 3.1 asset                                            | domain          | fieldPurpose   |
| ---------------------------------------------------- | --------------- | -------------- |
| ConnectedAccount accessToken                         | connected-oauth | access-token   |
| ConnectedAccount refreshToken                        | connected-oauth | refresh-token  |
| DevelopmentIntegrationConnection tokenCipher         | integration     | token          |
| DevelopmentIntegrationConnection webhookSecretCipher | integration     | webhook-secret |
| UserTwoFactorAuth secretEncrypted                    | totp            | seed           |
| DevelopmentRepository syncToken                      | integration     | sync-token     |
| CopilotProvider API key                              | copilot         | api-key        |

accessToken vs refreshToken: distinct purposes (no shared AAD). Integration
token vs webhook secret: distinct purposes. No mutable display/property names.

Key-wrapping AAD (separate contract - identity semantics differ; binds to
key-set + role, not to a record):

```text
trackwork:wrap:v1:<wrapPurpose>:<keySetId>
```

- `<wrapPurpose>`: closed enum `dek` | `lookup-key`.
- `<keySetId>`: the deployment key-set identifier (also in share transport).
- DEK and LookupKey MUST be wrapped with distinct wrap purposes.

## 7. DEK scope model

Decision: ONE GLOBAL APPLICATION DEK PER DEPLOYMENT (single DEK).

Rationale (follows design.md section 9, which specifies a single random DEK,
a single encryption state service and one unlock ceremony per deployment):

- blast radius: whole deployment DB - acceptable because protection is the
  quorum gate, not per-tenant separation;
- rotation cost: one wrapped DEK -> single re-wrap at key-set rotation;
- number of wrapped keys: 1;
- locked-mode behavior: single gate matches EncryptionStateService
  (disabled/locked/unlocked);
- migration complexity: one DEK for all category A/B values;
- multi-workspace isolation: NOT provided by this roadmap (documented
  non-goal; per-workspace DEKs would multiply ceremony cost);
- backup/restore: single wrapped DEK + key-set id;
- future re-key: re-wrap one DEK without re-encrypting records (design.md
  explicit requirement).
- LookupKey lives in the same hierarchy: wrapped by the KEK under
  trackwork-wrap-v1 (purpose lookup-key), persisted only in wrapped form.
  Unlock unwraps both DEK and LookupKey. If DEK unwrap succeeds but LookupKey
  unwrap fails, the encryption state MUST NOT become fully unlocked (fail
  closed; the deployment stays locked).

## 8. KEK semantics

Decision: the reconstructed threshold value IS directly the KEK
(32 random bytes). NO KDF.

- Shares are generated from a random 32-byte KEK
  (`randomBytes(32)` -> `shamirs-secret-sharing.split(kek, {shares:3, threshold:2})`).
- KDFs (PBKDF2/scrypt/Argon2) solve password-entropy stretching; the KEK is
  machine-generated high-entropy material - stretching is cryptographically
  unnecessary. Explicitly: NO KDF (section 1 table).

## 9. Threshold secret sharing requirements

- threshold = 2, shares = 3, secret = 32-byte random KEK.
- Arbitrary high-entropy binary secret: supported (measured: 82-byte shares
  for a 32-byte secret).
- Cryptographically secure coefficient generation: random is OPTIONAL in the
  library (if omitted it defaults to Buffer.random = globalThis.crypto.
  getRandomValues) and injectable via `opts.random` (library API); a
  non-function random value is rejected with TypeError. TRACKWORK NORMATIVE
  REQUIREMENT (our security contract, not a library requirement): the
  implementation MUST explicitly inject `node:crypto.randomBytes`
  (trackwork-rng-v1) and MUST NOT rely on the library default RNG.
- Integrity/error behavior: NONE in the library (measured: 1 share, duplicate
  same share, and corrupted share all return without error) - see section 10.
- Share serialization: library binary format (Buffer); transport encoding
  defined in section 12.
- TypeScript/Node: pure JS, CommonJS, no native code.
- Maintenance: jwerle/shamirs-secret-sharing (npm owner: werle), version
  2.0.1, published 2025-05-23, MIT, zero dependencies, 106 stars, not
  archived; original dsprenkels repo is 404 (ownership moved to jwerle fork).
- Browser inclusion risk: N/A (server-only service).
- Accidental share mutation: no checksum in the library - the transport
  encoding adds CRC-32 (error detection only).
- Maximum secret size: not a constraint for 32-byte KEK.
- GF: GF(2^8) with 128-bit padding (library description).

## 10. Shamir integrity nuance (critical)

Classic Shamir secret sharing provides confidentiality and threshold
reconstruction, NOT authenticated share integrity. Verified empirically with
the selected library: combine() with 1 share, with the same share twice, and
with a corrupted share all return without error.

Detection architecture (fixed):

```text
shares -> reconstruct candidate KEK -> AES-256-GCM unwrap of wrapped DEK
        -> authentication failure means the reconstruction is invalid
```

This is SUFFICIENT for the ceremony: any wrong share set produces a candidate
KEK that fails the authenticated unwrap; the ceremony aborts with no partial
state. Source-verified: combine() silently SKIPS duplicate share ids
(if (x.indexOf(share.id) === -1)) and returns bytes for any input length -
combine returning bytes is NOT evidence of a valid reconstruction. The
ceremony MUST therefore enforce >= 2 distinct, format-valid shares BEFORE
calling combine, MUST reject duplicate share indexes (same share supplied
twice) and MUST treat only a successful authenticated unwrap as the final
cryptographic validation.

## 11. Share identity and metadata

Allowed alongside/exported with a share:

- share format version (trackwork-share-v1)
- share index (cryptographic x-coordinate, from the library share)
- key-set identifier (deployment/key-generation id)
- creation epoch/version (key-set creation time)
- CRC-32 checksum (error detection for typo/truncation, explicitly NOT
  authentication)

MUST NOT be stored with a share: administrator email/name as cryptographic
identity (human ownership/assignment is separate operational metadata, not
crypto identity), secrets, plaintext KEK/DEK, or enough material for
reconstruction below threshold (a single share never contains it by design).

## 12. Share encoding

Transport string (copy/paste safe, deterministic, versioned):

```text
twshare-v1.<keySetId>.<index>.<base64url(shareBytes)>.<crc32hex>
```

- base64url: unambiguous alphabet, no padding ambiguity (`Buffer.toString('base64url')`).
- `<crc32hex>`: 8 hex chars of `@node-rs/crc32` computed over the canonical
  complete non-checksum portion
  `twshare-v1.<keySetId>.<index>.<base64url(shareBytes)>` (version, keySetId
  and index included) - ERROR DETECTION ONLY (typo/truncation), never
  authentication.
- Parsing MUST be strict: exact field count, version must equal v1,
  keySetId must match the persisted key-set, index within [1..3], checksum
  verified. Any deviation -> malformed-share error (fail closed).
- Outer transport `<index>` MUST equal the inner Shamir share x-coordinate
  (parsed from the library share encoding); the parser MUST reject
  disagreement BEFORE combine() is called.
- No QR codes / UI in this task.

## 13. RNG

- DEK: `randomBytes(32)` (trackwork-rng-v1)
- KEK: `randomBytes(32)`
- AEAD nonce: `randomBytes(12)` per encryption
- Shamir coefficients: library `opts.random` explicitly injected with
  `randomBytes` (MUST NOT rely on the library default Buffer.random)
- Lookup key: `randomBytes(32)`
- IDs: only if security-relevant (none currently)
- MUST NOT: Math.random, UUID-as-secret-entropy, timestamps.

## 14. Existing CryptoHelper review (exact current scheme)

Current implementation (packages/backend/server/src/base/helpers/crypto.ts):

- algorithm: AES-256-GCM (`aes-256-gcm`), authTagLength = 12
- key source: SHA-256 of the RSA private key from env `config.crypto.privateKey`
  (`keyPair.sha256.privateKey`); fallback `generatePrivateKey()` when unset
  (per-boot random key -> persisted ciphertext undecryptable after restart)
- IV: 12 bytes random (`NONCE_LENGTH = 12`)
- tag: 12 bytes, appended after IV
- serialization: `base64(iv || tag || ciphertext)` - NO version marker, NO AAD
- key lifetime: process lifetime; rotation: none; format versioning: none
- malformed ciphertext: throws from `decipher.final()` (fail closed)

Reuse determination:

- A. primitive pattern: REUSABLE (node:crypto AES-GCM is the same primitive)
- B. envelope format: NOT reusable (no version, no AAD, 12-byte tag)
- C. key management: NOT reusable (RSA-derived env key MUST NOT become the
  quorum KEK/DEK hierarchy)
- D. overall: primitive only

## 15. Existing ciphertext migration compatibility

Targets (from 3.1, category B): DevelopmentIntegrationConnection.tokenCipher,
webhookSecretCipher, UserTwoFactorAuth.secretEncrypted.

Compatibility contract (implementation later):

- identification: legacy ciphertext has no version marker; detection = try
  new envelope decode (version byte + algorithm id) -> if invalid, treat as
  legacy CryptoHelper format;
- decrypt-old/encrypt-new: migrate during a dual-read window (read tries new
  envelope, falls back to legacy decrypt with the existing env key, rewrites
  under the DEK);
- version marker: new envelopes MUST carry one (section 18); legacy has none;
- malformed/unknown: any ciphertext that decodes as neither new nor legacy
  -> fail closed (error), never silent plaintext;
- resumable/idempotent: migration keyed by record id + a per-record migrated
  flag; re-running is safe;
- rollback: dual-read support kept until migration completes; rollback =
  keep legacy decrypt path available during the window.

## 16. VerificationToken keyed-lookup design constraint

- 3.1: KEYED_LOOKUP_DESIGN / REQUIRES_3_3_LOOKUP_DESIGN.
- Primitive selected NOW: HMAC-SHA-256 (trackwork-lookup-v1), 32-byte key,
  `node:crypto.createHmac`.
- Separate lookup key vs DEK: YES - an independent random 32-byte lookup key;
  NOT derived from the DEK (no shared root material; no HKDF needed).
- COMPLETE lifecycle (model A - no plaintext persistence): LookupKey =
  `randomBytes(32)`; wrapped by the KEK independently from the DEK under
  trackwork-wrap-v1 (wrap purpose `lookup-key`); persisted ONLY as
  authenticated wrapped-key metadata next to the wrapped DEK. Unlock:
  reconstruct KEK -> unwrap DEK and LookupKey. KEK/key-set rotation rewraps
  BOTH. Lookup-key rotation is a separate operation (rebuilding lookup
  indexes). The LookupKey is NOT counted as plaintext persisted key material.
- Failure semantics: if DEK unwrap succeeds but LookupKey unwrap fails, the
  encryption state MUST NOT become fully unlocked (fail closed).
- Rotation: lookup-key rotation re-hashes tokens; independent of DEK rotation.
- 3.2 selects the primitive and lifecycle; 3.3 defines the structure (index
  table, wrapped-key metadata model).
- MUST NOT: raw SHA-256 for low-entropy tokens (VerificationToken is
  high-entropy randomUUID - the existing AccessToken raw-SHA-256 pattern is
  acceptable for that asset only); deterministic AEAD as search index.

## 17. Key separation

Independent random keys (no derivation):

- DEK: 32 B random (value AEAD; wrapped by KEK; only wrapped form persisted)
- KEK: 32 B random (wrap only; reconstructed from shares; never persisted)
- Lookup key: 32 B random (HMAC-SHA-256; separate purpose)

No key bytes are shared across purposes. HKDF NOT selected (no shared root
material to domain-separate). If a future design introduces a root material,
HKDF-SHA-256 with explicit info strings is the prescribed derivation, but that
is out of scope now.

## 18. Algorithm identifiers / versioning

Persisted semantic IDs (NOT npm package names):

| ID                  | Meaning                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| trackwork-aead-v1   | AES-256-GCM value encryption, 32B key, 12B nonce, 16B tag, AAD per section 6                                |
| trackwork-wrap-v1   | AES-256-GCM key wrapping (DEK and LookupKey) under KEK, same parameters, AAD wrap purpose dek or lookup-key |
| trackwork-share-v1  | Shamir GF(2^8), 2-of-3, 32B secret, transport encoding per section 12                                       |
| trackwork-lookup-v1 | HMAC-SHA-256, 32B key                                                                                       |
| trackwork-rng-v1    | node:crypto randomBytes                                                                                     |

Envelope version field: v1 (design.md envelope shape). Formats remain decodable
if implementation libraries change (IDs are semantic, not implementation).

## 19. Dependency pinning

Third-party cryptographic dependency (the ONLY one):

- package: shamirs-secret-sharing
- exact version: 2.0.1 (MUST be pinned exactly; no ^ range)
- license: MIT
- runtime target: Node (pure JS, CommonJS)
- native/WASM/pure-JS: pure JS
- maintenance: published 2025-05-23 (v2.0.1); npm owner werle; repo
  jwerle/shamirs-secret-sharing (106 stars, active, not archived); original
  dsprenkels repo unavailable (ownership moved)
- maturity rationale: zero dependencies, established algorithm (classic
  Shamir), used widely; supply-chain surface limited to one small pure-JS
  package

Everything else uses Node built-ins (node:crypto) or already-present
dependencies (@node-rs/crc32 for the error-detection checksum). The dependency
is NOT added in this task.

## 20. Supply-chain analysis (selected external package)

- provenance: jwerle/shamirs-secret-sharing fork of dsprenkels' original;
  npm ownership: werle (joseph.werle@gmail.com)
- recent releases: 2.0.0, 2.0.1 (2025-05-23)
- published artifacts vs source: small pure-JS package (71.5 KB unpacked),
  no install scripts, no native binaries
- transitive dependency count: 0
- known advisories: none found in this pass (no public audit found either -
  stated without claiming "audited")
- package ownership changes: evident (dsprenkels -> jwerle); the exact-pin
  version 2.0.1 + zero deps bounds the risk; implementation MUST treat the
  library output as unauthenticated (section 10).

## 21. Constant-time / secret handling

- constant-time matters for: token equality (timingSafeEqual), share
  comparison during ceremony (timingSafeEqual), HMAC verification (inherent).
- temporary key buffers: fill(0) after use where practical; keep lifetime
  minimal; never log or string-convert keys.
- explicit limitation: JavaScript/GC cannot guarantee memory zeroization;
  copies made by the runtime are NOT guaranteed erased. No "secure erase"
  claims (design.md wording: zeroized "where the runtime/library reasonably
  allows").

## 22. Error semantics

Internal error taxonomy (future):

- malformed-envelope (undecodable/truncated)
- unsupported-version/algorithm
- authentication-failure (AEAD tag/AAD mismatch)
- insufficient-shares (fewer than threshold distinct shares)
- malformed-share (parse/checksum/format failure)
- duplicate-share-index
- unwrap-failure (candidate KEK fails wrapped-DEK auth) - same class as
  authentication-failure internally
- locked-state (operation requires unlocked state)

Public vs internal: external callers MUST receive a generic
"operation unavailable" + lock state; they MUST NOT receive distinctions that
create an oracle (auth-failure vs unwrap-failure vs malformed-share).
Internal audit records the precise code.

## 23. Size overhead (PROJECTED - exact widths deferred to 3.3)

The exact 3.3 byte layout was NOT decided in the 3.2 pass; it is now fixed
in section 32 (3.3 implementation record). The figures below use the
candidate COMPACT layout (version 1 B + algorithmId 1 B + keyId 8 B +
nonce 12 B + tag 16 B = 38 B + plaintext; base64url expansion x4/3) and are
ILLUSTRATIVE: 3.3 MUST fix the physical widths, and any change to them
recomputes these numbers.

| Value                  | candidate binary envelope | base64url  |
| ---------------------- | ------------------------- | ---------- |
| 32-byte token          | 70 B                      | 94 chars   |
| 256-byte secret/config | 294 B                     | 392 chars  |
| 4 KiB protected value  | 4134 B                    | 5512 chars |

Legacy CryptoHelper format overhead was 24 bytes (iv12+tag12) - the candidate
envelope adds ~14 bytes of versioning/keyId metadata.

Effective maximum envelope size: the ciphertext cap (32768 B) is binding -
max serialized = 101 + ceil(32768\*4/3) = 101 + 43691 = 43792 chars. The
65536 serialized cap is a defensive upper bound that cannot be reached while
the ciphertext cap holds; the serializer enforces BOTH caps symmetrically
with the parser (serialize -> parse invariant, tested).

## 24. Performance (measured, non-production spike)

Node v24.14.0, OpenSSL 3 backend, 2026-09-04, local mac; 20000-iteration
benchmarks; spike kept outside the repository (temp dir, removed):

- AES-256-GCM encrypt 32 B: ~0.004 ms/op
- AES-256-GCM decrypt 32 B: ~0.005 ms/op
- AES-256-GCM encrypt 256 B: ~0.003 ms/op
- AES-256-GCM encrypt 4 KiB: ~0.005 ms/op
- Shamir split 2-of-3 (32 B): ~0.68 ms/op
- Shamir combine (2 shares, 32 B): ~0.47 ms/op

Ceremony impact: a single unlock performs one split-equivalent (generation)
or combine (unlock) - sub-millisecond; negligible. Per-value encryption at
~5 microseconds is irrelevant for the protected-value workloads.

## 25. Failure/misuse analysis (fail-closed matrix)

| Scenario                               | Expected behavior                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| nonce reuse (same DEK)                 | catastrophic for that key; prevented by random 96-bit nonces + DEK rotation bound (section 5); no counter to collide |
| wrong AAD                              | authentication failure (fail closed)                                                                                 |
| wrong key                              | authentication failure                                                                                               |
| corrupted ciphertext                   | authentication failure                                                                                               |
| truncated ciphertext                   | malformed-envelope error (fail closed)                                                                               |
| wrong share                            | unwrap authentication failure                                                                                        |
| duplicate same share twice             | ceremony rejects duplicate share index BEFORE combine (combine itself silently skips duplicates)                     |
| 1-of-3 attempt                         | combine returns a candidate; unwrap authentication fails; ceremony aborts                                            |
| 2 correct shares                       | KEK reconstructed; unwrap succeeds                                                                                   |
| 3 shares                               | same as 2 (threshold 2); extra share harmless if distinct                                                            |
| shares from different key sets         | keySetId mismatch -> malformed-share; even if mixed, unwrap fails (wrong KEK)                                        |
| old envelope version                   | unsupported-version error (fail closed; no silent downgrade)                                                         |
| unknown algorithm                      | unsupported-version error                                                                                            |
| DEK unwrap OK + LookupKey unwrap fail  | state stays locked (fail closed); no partial unlock                                                                  |
| accidental plaintext passed to decrypt | envelope parse fails (version/algorithm mismatch) -> malformed-envelope                                              |

## 26. Backup/restore implications (cryptographic only)

- DB backup WITHOUT sufficient admin shares -> protected values
  unrecoverable (by design; documented consequence).
- Shares WITHOUT DB/wrapped DEK -> insufficient (wrapped DEK + key-set id
  required; keyset identity prevents combining shares with a foreign wrapped
  DEK).
- Old backup + newer key generation -> keySetId in envelope and in shares
  MUST match; mismatch -> unwrap fails; no accidental silent decryption.
- LookupKey is part of the same hierarchy: a backup without shares yields
  neither DEK nor LookupKey; after a valid unlock the LookupKey is unwrapped
  and the existing keyed-hash index remains valid (no index rebuild needed
  for already-hashed tokens).

## 27. Threat model fit

Protects: DATABASE-AT-REST SECRET COMPROMISE WITHOUT QUORUM SHARES - an
attacker with a full DB (and Redis) dump, WITHOUT two administrator shares,
cannot recover category A/B protected values (after migration; category A
values are plaintext today - 3.1 finding).

Does NOT protect (explicit):

- fully compromised running unlocked application (in-memory DEK usable);
- malicious code executing after unlock;
- quorum administrators intentionally cooperating;
- client-side compromise;
- secrets supplied externally before unlock (session/JWT, DB/Redis creds -
  bootstrap external by 3.1);
- plaintext user content (S2) excluded by 3.1.

No overclaiming: the gate is the quorum ceremony, not the running process.

## 28. Decision document (this file)

Normative table in section 1. All decisions MUST/MUST NOT/SHOULD/MAY as
specified. The implementation does not exist yet.

## 29. ADR-style rejected alternatives

| Alternative                                           | Reason rejected                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom Shamir implementation                          | design.md forbids bespoke arithmetic; measured library behavior shows integrity must come from AEAD, not hand-rolled code                                                                                                           |
| AES-CBC                                               | unauthenticated; padding-oracle class; no integrity                                                                                                                                                                                 |
| Unauthenticated encryption (any)                      | tampering undetected; envelope must be authenticated                                                                                                                                                                                |
| Deterministic encryption for searchable secrets       | nonce-derivation misuse; 3.1 requires keyed lookup instead (HMAC)                                                                                                                                                                   |
| Storing KEK directly                                  | defeats quorum (single point of compromise)                                                                                                                                                                                         |
| Storing DEK plaintext                                 | defeats the entire hierarchy                                                                                                                                                                                                        |
| Storing shares in Redis                               | design.md: Redis SHALL NOT contain KEK/DEK/shares                                                                                                                                                                                   |
| Password-derived KEK                                  | no password-based design requirement; KDF misuse (NO KDF, section 8)                                                                                                                                                                |
| Whole-database encryption as Phase 3 mechanism        | 3.1: S2 user content explicitly excluded; envelope targets designated values                                                                                                                                                        |
| XChaCha20-Poly1305 as primary                         | node:crypto lacks XChaCha (only 12-byte-nonce chacha20-poly1305, which IS native); XChaCha needs a new pure-JS dep (@noble/ciphers, no public audit verified); AES-GCM native+FIPS+zero-dep; documented fallback only               |
| ChaCha20-Poly1305 as primary                          | natively available (node:crypto 'chacha20-poly1305', verified Node v24/OpenSSL 3.5.5) but no advantage over AES-GCM for this workload (same 12 B nonce class, same tag); AES-GCM kept for FIPS compatibility + repository prior art |
| Reusing CryptoHelper format/key for the new hierarchy | format unversioned/no AAD/12B tag; RSA-derived env key must not become quorum KEK/DEK (section 14)                                                                                                                                  |

## 30. OpenSpec completion rule

3.2 [x] - the repository now has an explicit, evidence-backed,
implementation-ready decision for: AEAD primitive (AES-256-GCM, exact
parameters), RNG (randomBytes), key separation (independent random keys),
KEK->DEK protection (wrap-v1), 2-of-3 library and format
(shamirs-secret-sharing@2.0.1 + trackwork-share-v1 transport), persisted
algorithm/version IDs, failure semantics, migration compatibility constraints,
dependency/version selection. No encryption implemented. 3.3 remains [ ].

Corrected final pass (no primary selection changed): AAD now binds
fieldPurpose; LookupKey lifecycle completed (wrapped by KEK, never plaintext);
ChaCha20-Poly1305 factual correction (native in node:crypto); XChaCha
nonce-reuse wording corrected; share transport CRC covers the full
non-checksum portion and outer index MUST equal inner share id; size overhead
marked PROJECTED; NIST 2^32 limit separated from the project rotation
threshold; shamirs-secret-sharing@2.0.1 verified from source.

## 31. Evidence references

- design.md section 9: hierarchy, DEK 256-bit CSPRNG, AES-256-GCM or
  XChaCha20-Poly1305, versioned envelope, shares never persisted, Redis
  exclusion, zeroization wording.
- docs/trackwork-data-classification.md: category A/B/C/D assets, bootstrap
  list, locked-mode matrix, CryptoHelper key-source tracing.
- packages/backend/server/src/base/helpers/crypto.ts: current scheme
  (NONCE_LENGTH=12, AUTH_TAG_LENGTH=12, key = sha256(RSA privateKey), no AAD).
- packages/backend/server/package.json: @node-rs/argon2, @node-rs/crc32.
- yarn.lock: @noble/hashes@1.8.0 transitive via @paralleldrive/cuid2.
- npm registry + GitHub (2026-09-04): shamirs-secret-sharing@2.0.1 metadata,
  jwerle/shamirs-secret-sharing repo state, @noble/ciphers@2.4.0 metadata.
- Measured spike (temp, removed): AES-GCM and Shamir timings; library
  non-error behavior on 1-share/duplicate/corrupted input.
- shamirs-secret-sharing@2.0.1 source (2026-09-04): options.random is
  OPTIONAL in split.js (if (!('random' in options)) options.random =
  Buffer.random; the default uses globalThis.crypto.getRandomValues); a
  non-function random value throws TypeError; polynomial coefficients = one
  GF(2^8) field byte from prng(1); share encoding = '0'-prefixed hex:
  bit-count char + x id (fixed hex length) + y data; combine.js parses id via
  regex and silently skips duplicate ids; no threshold validation at combine
  time; zero runtime dependencies; ESM (type: module).

## 32. 3.3 implementation record (V1 envelope, format/model only)

Implemented in @affine/trackwork (packages/common/trackwork/src): envelope.ts,
identifiers.ts, aad.ts. No crypto execution anywhere.

### Identifier concepts

- DataKeyId (`dk_<32 lowercase hex>`, 35 chars): the DEK generation stored in
  the value envelope. KEK/share-set rotation (KeySetId change) MUST NOT change
  DataKeyId and MUST NOT rewrite values; true DEK rotation creates a new
  DataKeyId.
- KeySetId (`ks_<32 lowercase hex>`): quorum/KEK/share generation; used by
  wrapped-DEK metadata, wrapped-LookupKey metadata and share transport; NEVER
  in the value envelope.
- LookupKeyId (`lk_<32 lowercase hex>`): lookup-key generation; changes only
  on lookup-key rotation (index rebuild), independent of DEK rotation.
- Identifiers are non-secret; generation intentionally deferred to 3.4+
  key management (CSPRNG); validated via branded types + strict parsers
  (parseDataKeyId/parseKeySetId/parseLookupKeyId; wrong-prefix interchange
  rejected).

### V1 serialized grammar (normative)

```text
twenc1.<algorithm>.<dataKeyId>.<nonceB64url>.<ciphertextB64url>.<tagB64url>
```

- version magic `twenc1.` unmistakable before decryption; algorithm fixed to
  `trackwork-aead-v1`; exactly 6 dot-separated fields; canonical base64url
  (URL-safe alphabet, unpadded, decode->re-encode equality, length mod 4 != 1);
  nonce decodes to exactly 12 bytes; tag to exactly 16 bytes; ciphertext
  non-empty; serialized length <= 65536 chars; ciphertext <= 32768 bytes.

### Actual V1 overhead

Fixed decoded crypto overhead: nonce 12 B + tag 16 B = 28 B. Fixed
SERIALIZED overhead = 101 chars:
`twenc1` (6) + 5 separators + `trackwork-aead-v1` (17) + DataKeyId (35) +
nonce base64url (16) + tag base64url (22). Derived and asserted in
envelope.spec.ts (no drift).

| plaintext | ciphertext b64url | total serialized |
| --------- | ----------------- | ---------------- |
| 32 B      | 43 chars          | 144 chars        |
| 256 B     | 342 chars         | 443 chars        |
| 4096 B    | 5462 chars        | 5563 chars       |

### Parser / downgrade semantics

- classifyTrackWorkValue: `new-envelope-v1` | `malformed-new-envelope` |
  `not-new-envelope`. A value claiming the `twenc` magic but invalid is
  malformed-new-envelope and MUST NOT fall back to legacy/plaintext;
  not-new-envelope delegates to the per-field legacy contract (3.1), never
  inferred from a failed parse.
- parseTrackWorkEnvelopeV1: discriminated errors - not-new-envelope,
  malformed-envelope, unsupported-version, unsupported-algorithm,
  invalid-data-key-id, invalid-base64url, wrong-nonce-length, wrong-tag-length,
  oversized-envelope. No authentication failure yet (3.4 owns AEAD).
- Envelope carries NO AAD fields (no self-authorization); AAD context
  (domain/fieldPurpose/stableRecordId) is caller-derived via
  serializeTrackWorkAad (aad.ts) and wrap AAD via serializeTrackWorkWrapAad.

### Rotation model (documented, not implemented)

KEK rotation: KeySetId K1->K2, DataKeyId D1 unchanged, values byte-identical.
DEK rotation: DataKeyId D1->D2; migration window may need both DEKs.
LookupKey rotation: LookupKeyId L1->L2; index rebuild; no DEK change.

### Storage compatibility (checked, no schema change)

All candidate columns are @db.Text (PG TEXT): ConnectedAccount
accessToken/refreshToken (l.86-87), DevelopmentRepository.syncToken (l.1368),
DevelopmentIntegrationConnection tokenCipher/webhookSecretCipher (l.1480-1481),
UserTwoFactorAuth.secretEncrypted (l.1236), AiWorkspaceByokConfig.
encryptedApiKey (l.942, verified already encrypted via CryptoHelper -
plugins/copilot/byok/service.ts l.204). Max serialized envelope at 4 KiB
plaintext ~5.6 KB - fits TEXT; the 64 KiB serialized bound prevents bloat.
