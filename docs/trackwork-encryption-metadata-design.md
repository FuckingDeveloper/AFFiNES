# TrackWork Persistent Encryption Metadata - Design Record

OpenSpec 3.8 design pass (NO Prisma/schema changes, NO 3.9 state machine, NO
migrations implemented in this pass). This document fixes the persistent
SAFE metadata model, the canonical keyset identity correction, the canonical
key-check artifact and the transactional/concurrency contracts that the 3.8
implementation slice will build.

## 1. Literal scope and boundary

- 3.8: "Add persistent encryption metadata containing only safe
  key/version/share identifiers and quorum policy metadata." -> persistent
  SAFE metadata + key-check verifier + pure validation primitives.
- 3.9: `disabled | locked | unlocked` runtime state -> NOT here.
- 3.10+: unlock ceremonies/replay/administrator enforcement -> NOT here.
- The 3.7 export service correction (canonical KeySetId) is IN 3.8 scope
  because it is required to replace the temporary provisioning identity.

## 2. Repository storage evidence

- Installation-global config precedent: `AppConfig` (schema.prisma l.1034):
  `id String @id`, JSON value, `lastUpdatedBy`, timestamps - id-keyed global
  config rows.
- Optimistic concurrency precedent: `TrackWorkWorkflowConfig.revision`
  (l.218-227) with `$transaction` + atomic create/updateMany-with-revision-
  predicate CAS (workflow.service.ts l.73-78).
- Migration naming (current): `20260902180000_trackwork_workflow_config`
  (Prisma timestamp-style).
- AdminAuditService.logInTx for same-transaction audit.
- Existing TrackWork metadata is workspace-scoped (workflow configs); 3.8
  needs an INSTALLATION-GLOBAL model (no workspace relation).

## 3. Metadata threat model

| Field                                   | Classification                                                          |
| --------------------------------------- | ----------------------------------------------------------------------- |
| KeySetId                                | SAFE NON-SECRET (canonical identity)                                    |
| ShareSetId                              | SAFE NON-SECRET (current share generation)                              |
| DataKeyId / LookupKeyId                 | SAFE NON-SECRET (referenced by wrapped DEKs; not persisted in 3.8 rows) |
| threshold / totalShares                 | SAFE NON-SECRET policy                                                  |
| metadataVersion / revision / timestamps | SAFE NON-SECRET                                                         |
| key-check artifact                      | AUTHENTICATED CRYPTO ARTIFACT (persisted; no plaintext)                 |
| plaintext share                         | SECRET - MUST NOT BE STORED                                             |
| KEK / DEK / LookupKey                   | SECRET - MUST NOT BE STORED                                             |
| submitted unlock shares                 | SECRET - MUST NOT BE STORED                                             |

## 4. Installation-global cardinality

Decision: **B - current row + historical keyset rows** via one model keyed by
KeySetId.

- Model `TrackWorkQuorumKeyset` (table `trackwork_quorum_keysets`):
  `keySetId` as PRIMARY KEY; one row per KEK generation.
- "Current" = the row with the highest `revision` (deterministic; the
  3.9 runtime reads the current row).
- Rationale: KEK rotation (3.15) inserts a NEW row; old rows remain readable
  for wrapped DEKs still referencing old KeySetIds; no destructive singleton
  overwrite. Share-generation history WITHIN a keyset is intentionally NOT
  retained (reshare replaces ShareSetId + key-check on the same row - the
  verifier replacement is the revocation mechanism).

## 5. Keyset / shareset lifecycle (normative)

| Operation                                 | KeySetId                | ShareSetId      | key-check               |
| ----------------------------------------- | ----------------------- | --------------- | ----------------------- |
| Initial enrollment (bootstrap KEK)        | K1 (created once)       | S1              | created with K1/S1      |
| Reshare same KEK (repeated export)        | K1 (stable)             | S2, S3, ...     | replaced (bound to S_i) |
| Rotate KEK                                | K2 (new row)            | S4              | new row artifact        |
| Rotate DEK only                           | unchanged               | unchanged       | unchanged               |
| Server restart                            | persisted row unchanged | unchanged       | unchanged               |
| Repeated 3.7-style export BEFORE metadata | n/a (pre-3.8)           | fresh each time | n/a                     |

MUST NOT create a new KeySetId merely because export was repeated.

## 6. Canonical KeySetId creation semantics (required correction)

- Current 3.7 defect CONFIRMED: `quorum.service.ts` generates `ks_` fresh
  per export while splitting the same TRACKWORK_KEK_HEX (K1/S1, K2/S2, ...).
  This violates the 3.6 contract (KeySetId = KEK generation).
- Corrected model: the canonical KeySetId is a PERSISTED RANDOM NON-SECRET
  identifier (`ks_` + 32 hex from CSPRNG), created ONCE at first metadata
  enrollment and reused for the lifetime of the current KEK.
- NOT derived from KEK bytes (a KEK fingerprint would create a reusable
  verification oracle / privacy leak; rejected).
- KEK rotation -> a genuinely new KeySetId (new row, new enrollment).
- Reshare of the same KEK -> same KeySetId, fresh ShareSetId.
- Pre-3.8 exports are PROVISIONING-ONLY artifacts: never treated as active;
  after 3.8 metadata exists the administrator generates/export a NEW
  canonical share set (documented in section 10).

## 7. ShareSetId update semantics

- The persisted ShareSetId update happens in ONE transaction with the
  key-check replacement: generate (in memory) -> create new key-check for
  (K, S_new) -> UPDATE row (shareSetId, keyCheck, revision+1) with CAS ->
  return shares.
- Ordering: the row is updated BEFORE the HTTP response (the response is the
  only delivery of the plaintext shares; if the response is lost, the row
  already points at S_new and the administrator re-exports - a fresh
  S_new+1, old S_new superseded).
- The server cannot prove the administrator saved downloads; no stronger
  guarantee is claimed than HTTP delivery.
- Lost response semantics: NEVER unrecoverable while the bootstrap KEK
  bridge exists - a re-export regenerates shares for the SAME KEK under a
  new ShareSetId; 3.9 will require the key-check matching the CURRENT row.

## 8. Canonical key-check artifact (selection)

Compare: A) AES-256-GCM key-check under KEK (chosen); B) reusing the
wrapped-DEK format with a fake DataKeyId (REJECTED - fabricating identity
semantics violates DataKeyId meaning); C) HMAC verifier (REJECTED - key
separation: HMAC with the same KEK reuses the key for a different purpose
without an explicit derivation, adding KDF complexity; GCM with a
purpose-specific AAD domain is the established primitive); D) other (none
simpler and equally sound).

Chosen: A - a purpose-specific AES-256-GCM artifact:

- plaintext: 16 random bytes (fixed size; the stored ciphertext is the
  verifier; the plaintext value itself is irrelevant, never persisted
  plaintext);
- nonce: 12 random bytes;
- tag: 16 bytes;
- AAD: `trackwork:key-check:v1` + 0x00 + KeySetId + 0x00 + ShareSetId
  (injective NUL framing - all alphabets exclude NUL; domain-separated from
  trackwork:aead:v1 and trackwork:kek-wrap:v1);
- usable with ZERO wrapped DEKs (fresh installs).

### ShareSetId binding decision

INCLUDE ShareSetId in the key-check AAD:

- DB modification of the persisted share-generation metadata breaks
  verification unless the verifier is changed consistently;
- every reshare naturally replaces the verifier.
  Rollback limitation documented: an attacker rolling back BOTH the metadata
  row and the verifier to an older valid pair is not detectable without an
  external monotonic anchor (3.9/ops anchors are out of 3.8 scope; not claimed).

## 9. Key-check format (conceptual, normative for implementation)

```text
twkcheck1.trackwork-key-check-v1.<keySetId>.<shareSetId>.<nonceB64url>.<ciphertextB64url>.<tagB64url>
```

- version magic twkcheck1.; algorithm fixed trackwork-key-check-v1;
- nonce 12 B, tag 16 B, ciphertext EXACTLY 16 B (fail before crypto);
- canonical unpadded base64url (same strict rules as envelope/share formats);
- serialized bound <= 256 chars;
- unknown version/algorithm fail closed; malformed -> coded error, no
  key/share material in errors/logs;
- the artifact authenticates ONLY the keyset identity pair - it never
  self-authorizes application context.

## 10. Key-check crypto API (pure common-package, 3.8 slice)

```ts
createTrackWorkKeyCheck(kek: Uint8Array, keySetId: KeySetId, shareSetId: ShareSetId)
  -> { ok: true; keyCheck: string } | { ok: false; error: TrackWorkKeyCheckError }
verifyTrackWorkKeyCheck(serialized: string, kek: Uint8Array, expected: { keySetId, shareSetId })
  -> { ok: true } | { ok: false; error: TrackWorkKeyCheckError }
```

- KEK exactly 32 bytes; node:crypto; CSPRNG nonce; no caller-provided nonce;
- strict parser; stable discriminated errors; no secret logging; caller
  buffers not mutated; no global key retention;
- errors: malformed-key-check | unsupported-version | unsupported-algorithm
  | invalid-key-set-id | invalid-share-set-id | invalid-kek-length |
  key-check-authentication-failure.

## 11. DB tamper / rollback matrix

| Attack                                   | Detection                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. modify KeySetId only                  | cryptographic (key-check AAD)                                                                                                                                                   |
| B. modify ShareSetId only                | cryptographic (key-check AAD)                                                                                                                                                   |
| C. modify threshold                      | schema/runtime validation (policy must equal 2/3)                                                                                                                               |
| D. modify totalShares                    | schema/runtime validation (must equal 3/2 policy)                                                                                                                               |
| E. replace verifier alone                | verifier is AAD-bound to ids; replacement without row change -> verify fails for old ids; replacement WITH row change -> indistinguishable from legitimate reshare (documented) |
| F. rollback metadata + verifier together | NOT detectable without external anchor (documented)                                                                                                                             |
| G. delete metadata                       | detected by 3.9 as metadata-absent (fail closed)                                                                                                                                |
| H. duplicate rows                        | keySetId PK prevents duplicates; current = max revision                                                                                                                         |

## 12. Quorum policy metadata

- threshold = 2, totalShares = 3 stored as typed Int fields AND strictly
  validated against the supported constants at read AND write (invalid DB
  values fail closed with invalid-policy); NOT treated as free-form policy.

## 13. Version metadata

Persisted: `metadataVersion` (1), plus format versions already encoded in
artifacts (share v1, wrap v1, aead v1, key-check v1) are NOT duplicated as
separate columns - they serve migration discovery through the artifacts
themselves. `revision` for CAS.

## 14. Transactionality

- Initial enrollment: CREATE row (keySetId, shareSetId, keyCheck, policy,
  revision=1) in one $transaction.
- Reshare: UPDATE (shareSetId, keyCheck, revision+1, updatedAt) with
  optimistic CAS on revision, in one $transaction.
- KEK rotation (future 3.15): CREATE new row in one transaction (old rows
  untouched).
- KeySetId + ShareSetId + key-check never become mutually inconsistent
  (single-row atomic updates; CAS rejects concurrent writers).

## 15. Concurrency

- Two concurrent exports: first transaction commits; the second gets a
  revision conflict -> `metadata-revision-conflict` (fail closed).
- Last-write-wins REJECTED: one administrator could walk away with shares
  that immediately cease to be the current generation.
- Deterministic semantics: the FIRST committed export wins per revision;
  the loser re-exports (fresh ShareSetId) or aborts.

## 16. 3.7 export integration correction (future 3.8 implementation)

- Export flow becomes: read-or-create canonical row (KeySetId stable for the
  current KEK) -> generate fresh ShareSetId + shares (3.6 primitive) ->
  create new key-check -> transactional CAS update -> return shares once.
- Ordering as in section 7; failed HTTP delivery -> re-export (new
  ShareSetId), never unrecoverable (env KEK bridge).
- The previous per-export KeySetId behavior is documented as a TEMPORARY
  pre-3.8 provisioning limitation.

## 17. Pre-3.8 exports

- Provisioning-only / pre-metadata artifacts; NOT accepted as an activated
  quorum generation; after 3.8 metadata is established the administrator
  MUST export a new canonical share set; no migration of unknown plaintext
  shares (the server never retained them).

## 18. TRACKWORK_KEK_HEX migration boundary

- 3.8: metadata + key-check exist; export uses canonical ids; the env KEK
  remains the key source.
- Removing TRACKWORK_KEK_HEX belongs to later enrollment/state work (after
  quorum activation/distribution guarantees - 3.9+/activation flow), NOT 3.8.

## 19. Fresh installation flow

- No metadata, bootstrap KEK configured, zero DEKs/values.
- Enrollment: create canonical KeySetId (random) -> generate S1 + shares ->
  create key-check (K, S1) -> persist row transactionally -> export shares.
- 3.9 will later validate a reconstructed KEK against the persisted
  key-check WITHOUT any wrapped DEK.

## 20. Existing installation flow

- TRACKWORK_KEK_HEX + possibly wrapped DEKs + no metadata.
- Enrollment assigns a NEW canonical logical KeySetId ONCE (no reliable
  existing record) and persists it; does NOT change the KEK, DataKeyIds,
  values, or silently rewrap DEKs.

## 21. Backup / restore

- DB backup contains: safe metadata, wrapped DEKs, key-check - but NO KEK,
  NO plaintext DEKs, NO shares -> backup alone insufficient to decrypt.
- Restore + threshold shares becomes sufficient once 3.9 exists.
- Transition: while TRACKWORK_KEK_HEX is the key source, restore + env KEK
  can re-verify via key-check; documented.

## 22. Future rotation compatibility

- Reshare: KeySetId same, ShareSetId changes, key-check replaced.
- KEK rotation (3.15): new KeySetId row, new ShareSetId, wrapped DEKs
  rewrapped, value ciphertext unchanged; old rows retained.
- Share replacement (3.16): reshare semantics on the current row.
- Schema supports all without redesign.

## 23. Safe audit

- Events: quorum-metadata-created, quorum-metadata-updated (reshare), with
  safe fields only: keySetId, shareSetId, revision, policy.
- NEVER: key-check bytes, KEK, shares, DEKs; serialized key-check is not
  logged unless operationally necessary.

## 24. API exposure

- Server-internal repository/service only for 3.8 (no admin read API
  required by the literal requirement); a minimal safe read (ids/policy/
  revision only) MAY be added if 3.9 needs it - no Phase 4 dashboard.

## 25. Error model (stable, fail-closed)

metadata-absent | metadata-malformed | unsupported-metadata-version |
invalid-key-set-id | invalid-share-set-id | invalid-policy |
invalid-key-check | key-check-authentication-failure |
metadata-revision-conflict. Absence and corruption are DISTINCT (3.9 needs
both); no crypto material in errors.

## 26. Schema proposal (implementation target)

```prisma
model TrackWorkQuorumKeyset {
  keySetId        String   @id @map("key_set_id") @db.VarChar // ks_<32 hex>
  shareSetId      String   @map("share_set_id") @db.VarChar   // ss_<32 hex>
  threshold       Int
  totalShares     Int
  keyCheck        String   @db.Text                            // twkcheck1... artifact
  metadataVersion Int      @default(1) @map("metadata_version")
  revision        Int      @default(1)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("trackwork_quorum_keysets")
}
```

- Constraints: keySetId PK (no duplicates); threshold/totalShares validated
  at runtime (2/3) - typed fields, no DB CHECK needed (runtime fail-closed
  mandatory regardless); keyCheck Text bound by parser (<= 256 chars).
- Migration: `20260905XXXXXXXX_trackwork_quorum_keysets` (create table);
  rollback = drop table (no existing deployments have data; no backfill).
- No secret/default test data in migration.

## 27. Test plan (implementation)

A. create metadata for bootstrap KEK; B. KeySetId stable across
restart/read; C. repeated export keeps KeySetId; D. repeated export changes
ShareSetId; E. correct KEK verifies key-check; F. wrong KEK fails;
G. modified KeySetId fails verification; H. modified ShareSetId fails
(binding chosen); I. modified nonce/tag/ciphertext fails; J. malformed
key-check fails closed; K. unknown version fails closed; L/M/N. metadata
contains no KEK/share/DEK (assert row fields); O/P. threshold 2, totalShares
3; Q. invalid DB policy rejected; R. concurrent exports -> CAS conflict, no
last-write-wins; S. transaction rollback leaves old row consistent;
T. pre-3.8 provisional shares not active; U. DB backup fixture safe-only;
V. no Redis/config/FS key-share writes.

## 28. Mutation plan (implementation)

- regenerate KeySetId per export -> test C fails;
- omit ShareSetId binding from key-check -> test H fails;
- accept wrong KEK -> F fails;
- permissive policy validation -> Q fails;
- CAS -> last-write-wins -> R fails;
- persist share plaintext -> L/M fails.

## 29. 3.9 boundary (explicitly NOT implemented in 3.8)

disabled/locked/unlocked state, in-memory KEK cache, share accumulator,
ceremony IDs, unlock submission, replay protection, job pausing, restart
lock behavior. 3.8 persists safe metadata + verifier and provides pure
validation primitives only.

## 30. Threat limitations (honest)

- Rollback of metadata+verifier together is not detectable without an
  external anchor (documented; ops/3.9 anchors out of scope).
- The server cannot prove share delivery; lost responses are handled by
  re-export (new ShareSetId) with the env KEK bridge.
- No claim of two-person control (bearer shares; 3.6 terminology).
