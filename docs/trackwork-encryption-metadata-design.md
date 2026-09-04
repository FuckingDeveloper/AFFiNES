# TrackWork Persistent Encryption Metadata - Design Record (corrected)

OpenSpec 3.8 design pass (corrected; NO Prisma/schema changes, NO 3.9 state,
NO migrations implemented in this pass). This document fixes the persistent
SAFE metadata model, the canonical keyset identity, the canonical key-check
artifact and the transactional/concurrency contracts for the 3.8
implementation slice.

## 1. Literal scope and boundary

- 3.8: "Add persistent encryption metadata containing only safe
  key/version/share identifiers and quorum policy metadata."
- 3.9: `disabled | locked | unlocked` runtime state -> NOT here.
- 3.10+: unlock ceremonies/replay/administrator enforcement -> NOT here.
- The 3.7 export service correction (canonical KeySetId) is IN 3.8 scope.

## 2. Repository storage evidence

- Installation-global config precedent: `AppConfig` (schema.prisma l.1034):
  id-keyed global rows.
- Optimistic concurrency precedent: `TrackWorkWorkflowConfig.revision` with
  $transaction + CAS (workflow.service.ts l.73-78).
- Migration naming: `20260902180000_trackwork_workflow_config` style.
- AdminAuditService.logInTx.

## 3. Pre-3.8 wrapped-DEK production evidence (CRITICAL, verified)

Repository inspection (2026-09-05, branch base origin/develop + 3.7):

- production callers of generateTrackWorkDataKey / unwrapTrackWorkDataKey /
  rewrapTrackWorkDataKey: NONE (grep of packages/backend/server/src minus
  spec/**tests**: empty);
- twkwrap1 serialized-wrapped-DEK persistence: NONE (production sources:
  empty);
- DataKeyId/wrappedDataKey/plaintextDataKey production usage: NONE;
- wrapped-DEK schema columns: NONE (schema.prisma grep: empty);
- the ONLY callers are the primitive (kek-wrap.ts) and its tests
  (kek-wrap.spec.ts).

CONCLUSION: NO persisted production wrapped DEKs exist. 3.8 may safely
establish the FIRST canonical KeySetId without any rewrap. Option A holds.
This evidence must be re-run as a migration test before 3.8 is marked
complete (section 14 of the test plan).

## 4. Authoritative current identity (max-revision INVALID)

- `revision` is ROW-LOCAL CAS state, NOT an installation-global generation
  selector. max(revision)/max(updatedAt)/max(createdAt) MUST NOT select the
  current keyset (counterexample: K1 reshared 6x has revision 7; K2 created
  fresh has revision 1 - max would wrongly select K1).
- Chosen model: **Option A - ONE installation-global singleton metadata row
  with a FIXED id** (the well-known constant `'current'`). The PK on the
  fixed id is the DB-ENFORCED singleton: a second row with the same id
  cannot exist.
- The singleton IS the explicit authoritative current metadata identity:
  its keySetId field = canonicalKeySetId, its shareSetId = current share
  generation, its keyCheck = current verifier.
- Not 3.9 state: a persisted current KeySetId/ShareSetId is METADATA
  IDENTITY, not proof that runtime keys are loaded. No disabled/locked/
  unlocked fields; encryption-state terminology reserved for 3.9. Use
  canonicalKeySetId / current metadata generation wording.

## 5. Cardinality / history decision

- 3.8: SINGLETON only (Option A). No keyset-history table.
- Rationale: 3.8 literal scope is safe current metadata; unwrapping old
  wrapped DEKs NEVER required metadata history (KEK-based, KeySetId is
  authenticated inside each twkwrap1 string); audit history is served by
  AdminAuditService.
- Future 3.15 (KEK rotation): may append a history table without breaking
  the 3.8 contract (the singleton remains the current authority; rotation
  REPLACES singleton content after rewrapping; a new non-breaking history
  model can be added then). Documented, not built.

## 6. KeySetId / ShareSetId lifecycle (normative)

| Operation                             | canonicalKeySetId                    | current ShareSetId | key-check               |
| ------------------------------------- | ------------------------------------ | ------------------ | ----------------------- |
| Initial enrollment (bootstrap KEK E1) | K1 (created once)                    | S1                 | K1/S1 artifact          |
| Reshare/export same KEK               | K1 (stable)                          | S2, S3, ...        | replaced (bound to S_i) |
| Server restart                        | K1 (persisted)                       | S_i (persisted)    | unchanged               |
| KEK rotation (3.15, future)           | K2 (singleton replaced after rewrap) | S_new              | K2/S_new artifact       |
| DEK rotation only                     | unchanged                            | unchanged          | unchanged               |

A share-export request alone MUST NEVER create a new KeySetId when KEK
bytes have not changed.

## 7. Initial enrollment (atomic, race-free)

First-enrollment race (exact):

```
T1: read singleton -> absent
T2: read singleton -> absent
T1: generate K1/S1 + shares + keyCheck(K1,S1) in memory
T2: generate K2/S2 + shares + keyCheck(K2,S2) in memory
T1: CREATE (id='current', keySetId=K1, shareSetId=S1, keyCheck=..., policy=2/3, revision=1) -> COMMIT
T2: CREATE (id='current', keySetId=K2, ...) -> PK violation (P2002) -> deterministic conflict
```

- The PK on the fixed id is the INSTALLATION-GLOBAL SERIALIZATION POINT
  (DB-enforced; independent of Node single-threading).
- NO placeholder/fake ShareSetId/keyCheck/policy: the row is created
  COMPLETE in one atomic statement after all material is generated in
  memory. Crash before commit -> no row; crash after commit -> row is
  complete and consistent.
- Exactly ONE canonical KEK-generation identity can become current.
- T2 maps the P2002 to `metadata-revision-conflict` (or retries by reading
  the winner, then follows reshare semantics); T2's generated shares are
  discarded and never returned/logged/persisted.

## 8. Reshare/export CAS transaction (3.7 integration correction)

```
read canonical singleton: K1 / S_old / revision R
generate in memory: S_new, shares, keyCheck(K1, S_new)
transactional CAS:
  UPDATE trackwork_quorum_metadata
  SET shareSetId=S_new, keyCheck=<new>, revision=R+1, updatedAt=now()
  WHERE id='current' AND revision=R
if affected==1: return plaintext shares
if affected==0: DISCARD generated shares; return metadata-revision-conflict
```

- KeySetId remains K1 (never re-generated on export).
- Two concurrent exports: exactly one CAS succeeds; the loser's shares are
  discarded and never returned/logged/persisted.
- Update happens BEFORE the HTTP response (response is the only delivery of
  plaintext shares).

## 9. Lost response semantics

- Commit OK, response lost -> metadata points at S2, administrator lacks
  S2; next export -> S3 + CAS replaces S2 verifier; S3 becomes canonical.
- Recoverable while TRACKWORK_KEK_HEX remains the transition bridge.
- The server cannot prove downloads; no stronger claim.
- S2 shares, if partially observed, remain sensitive but are no longer the
  current share generation.

## 10. Key-check artifact (reconfirmed, unchanged)

- Format: `twkcheck1.trackwork-key-check-v1.<keySetId>.<shareSetId>.<nonceB64url>.<ciphertextB64url>.<tagB64url>`
- AES-256-GCM; 32-byte KEK; 12-byte nonce; 16-byte tag; 16-byte verification
  plaintext (random; never persisted plaintext; decrypted plaintext needs no
  semantic authority beyond successful AEAD authentication).
- AAD: `trackwork:key-check:v1 || 0x00 || keySetId || 0x00 || shareSetId`
  (injective NUL framing; domain-separated from aead:v1 and kek-wrap:v1).
- keySetId substitution fails; shareSetId substitution fails; wrong KEK
  fails; validates fresh installs with zero DEKs.
- No fake DataKeyId; no HMAC with the same KEK (key separation).

## 11. DB tamper matrix (singleton model)

| Attack                                                | Detection                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A. modify canonical keySetId (in singleton)           | AEAD (key-check AAD)                                                                      |
| B. modify current ShareSetId                          | AEAD (key-check AAD)                                                                      |
| C. modify threshold/totalShares                       | runtime validation (must be 2/3)                                                          |
| D. modify keyCheck alone                              | AEAD mismatch with ids -> 3.9 verification fails                                          |
| E. create second keyset row                           | PK 'current' constraint (DB) - impossible                                                 |
| F. delete singleton                                   | 3.9 validation: metadata-absent (fail closed)                                             |
| G. stale revision                                     | CAS detected (update affected==0)                                                         |
| H. rollback entire singleton row (older valid pair)   | NOT detectable without external monotonic anchor (documented; ops/3.9 anchors out of 3.8) |
| I. rollback pointer+history (n/a - no history in 3.8) | n/a                                                                                       |

No rollback overclaims: H is explicit.

## 12. Quorum policy + versions

- threshold=2, totalShares=3 stored as typed Int and strictly validated at
  read and write (invalid DB values fail closed with invalid-policy).
- Persisted versions: metadataVersion (1) + revision (CAS). Artifact format
  versions are encoded inside each artifact (share v1, wrap v1, aead v1,
  key-check v1) and not duplicated as columns.

## 13. Transactionality

- Enrollment: single CREATE (complete row).
- Reshare: single UPDATE with CAS (section 8).
- keySetId + shareSetId + keyCheck never mutually inconsistent (atomic
  single-row statements).
- KEK rotation (future): replace singleton content inside one transaction
  after rewrapping (3.15); history table appended later if needed.

## 14. Concurrency

- First enrollment: DB PK serialization (section 7); exactly one canonical
  identity; loser -> deterministic conflict.
- Reshare: optimistic revision CAS (section 8); first commit wins;
  last-write-wins rejected.

## 15. TRACKWORK_KEK_HEX migration boundary

- 3.8: metadata + key-check exist; env KEK remains the key source.
- Removing TRACKWORK_KEK_HEX belongs to later enrollment/state work (after
  quorum activation/distribution guarantees), NOT 3.8.

## 16. Pre-3.8 exports

- Provisioning-only artifacts; never treated as an activated generation;
  after 3.8 metadata exists the administrator MUST export a new canonical
  share set; no migration of unknown plaintext shares.

## 17. Fresh / existing installation flows

- Fresh: no metadata, bootstrap KEK configured -> enrollment (section 7) ->
  canonical K1/S1 + key-check; 3.9 later validates reconstructed KEK
  against the persisted key-check with zero wrapped DEKs.
- Existing: TRACKWORK_KEK_HEX + possibly wrapped DEKs (none today per
  section 3) -> enrollment assigns a NEW canonical logical KeySetId ONCE
  and persists it; does NOT change KEK/DataKeyIds/values/rewrap (safe
  because no persisted wrapped DEKs exist; if any appear before 3.8, the
  evidence gate in section 3 blocks completion).

## 18. Backup / restore

- DB backup: safe metadata + key-check + (future) wrapped DEKs - no KEK/
  DEK/shares -> insufficient alone; restore + threshold shares sufficient
  after 3.9; env KEK bridge during transition.

## 19. Safe audit

- quorum-metadata-created / quorum-metadata-updated (reshare) with safe
  fields only (keySetId, shareSetId, revision, policy); never key-check
  bytes/KEK/shares/DEKs.

## 20. API exposure / errors

- Server-internal repository/service for 3.8; minimal safe read if 3.9
  needs it.
- Errors: metadata-absent | metadata-malformed | unsupported-metadata-
  version | invalid-key-set-id | invalid-share-set-id | invalid-policy |
  invalid-key-check | key-check-authentication-failure |
  metadata-revision-conflict. Absence vs corruption distinct (3.9 needs
  both). No crypto material in errors.

## 21. Exact Prisma proposal (corrected)

```prisma
model TrackWorkQuorumMetadata {
  id              String   @id @db.VarChar // fixed constant 'current' - DB-enforced singleton
  keySetId        String   @map("key_set_id") @db.VarChar // ks_<32 hex> - canonicalKeySetId
  shareSetId      String   @map("share_set_id") @db.VarChar // ss_<32 hex> - current generation
  threshold       Int
  totalShares     Int
  keyCheck        String   @db.Text // twkcheck1... artifact (<= 256 chars, parser-bound)
  metadataVersion Int      @default(1) @map("metadata_version")
  revision        Int      @default(1) // row-local CAS
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("trackwork_quorum_metadata")
}
```

- Singleton enforcement: the application ALWAYS writes id='current'; the PK
  on a fixed id makes a second row impossible (DB-enforced, migration SQL =
  plain CREATE TABLE with PRIMARY KEY; no extra unique index needed).
- Migration: `20260905XXXXXXXX_trackwork_quorum_metadata` (create table);
  rollback = drop table (no data exists); no secret/default test data.
- Runtime validation is mandatory regardless of DB constraints (Prisma
  types are not a security boundary).

## 22. Test plan (implementation)

A. create metadata for bootstrap KEK; B. canonicalKeySetId stable across
restart/read; C. repeated export keeps KeySetId; D. repeated export changes
ShareSetId; E. correct KEK verifies key-check; F. wrong KEK fails; G.
modified keySetId fails verification; H. modified ShareSetId fails; I.
modified nonce/tag/ciphertext fails; J. malformed key-check fails closed;
K. unknown version fails closed; L/M/N. metadata contains no KEK/share/DEK;
O/P. threshold 2, totalShares 3; Q. invalid DB policy rejected; R.
concurrent reshare exports -> one CAS winner, one conflict; S. transaction
rollback leaves the singleton internally consistent; T. pre-3.8 provisional
shares not active; U. DB backup fixture safe-only; V. no Redis/config/FS
key-share writes.

Concurrency tests (corrected model): A. two concurrent FIRST enrollments ->
exactly one canonical result; B. loser receives conflict; C. DB contains
exactly one 'current' row after race; D. two concurrent RESHARES -> one
succeeds, one conflicts; E. loser does not return plaintext shares; F.
KeySetId identical across successful reshares; G. KEK-rotation path later
can create a new KeySetId without ambiguity; H. no max(revision) selection
exists anywhere.

Migration test / repository evidence gate (BEFORE 3.8 completion): re-run
the section 3 grep (production callers of wrap APIs, twkwrap1 persistence,
wrapped-DEK columns) as an automated static test; if any production
persisted wrapped-DEK state exists, 3.8 is BLOCKED until a compatibility
identity mapping is defined.

## 23. Mutation plan (implementation)

- regenerate KeySetId per export -> C fails;
- omit ShareSetId binding from key-check -> H fails;
- accept wrong KEK -> F fails;
- permissive policy validation -> Q fails;
- CAS -> last-write-wins -> R fails;
- persist share plaintext -> L/M fails;
- current selection via max(revision) -> concurrency test H fails.

## 24. 3.9 boundary

NOT in 3.8: disabled/locked/unlocked, in-memory KEK cache, share
accumulator, ceremony IDs, unlock submission, replay protection, job
pausing, restart lock behavior. Terminology: canonicalKeySetId / current
metadata generation; never "unlocked"/"active" runtime wording.

## 25. Threat limitations (honest)

- Rollback of the whole singleton to an older valid pair is not detectable
  without an external monotonic anchor (documented; not claimed).
- The server cannot prove share delivery; lost responses -> re-export (new
  ShareSetId) with the env KEK bridge.
- No two-person control claims (bearer shares).
