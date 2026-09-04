# TrackWork Quorum Secret-Sharing - Design / Threat-Model Record

OpenSpec 3.6 design pass (corrected; NO Shamir runtime implemented, NO
dependencies added, NO production code changed). This document fixes the
architecture the 3.6 implementation slice will build, and that 3.7 (export),
3.8 (persistent metadata) and 3.9 (encryption state) will consume.

## 1. Literal scope from OpenSpec

- 3.6: "Implement generation of three administrator shares with threshold two
  using a mature secret-sharing implementation." -> the share GENERATION
  primitive + strict representation + pure tests.
- 3.7: "Ensure plaintext administrator shares are exported to administrators
  and are never persisted in PostgreSQL, Redis, config files, images, logs or
  localStorage." -> export UX + non-persistence enforcement (NOT 3.6).
- 3.8: "Add persistent encryption metadata containing only safe
  key/version/share identifiers and quorum policy metadata." -> metadata
  model INCLUDING the canonical keyset verification artifact (NOT 3.6).
- 3.9: "Implement `disabled | locked | unlocked` encryption-state service."
  -> state machine + unlock runtime (NOT 3.6).
- Proposal (51-63): 2-of-3 mandated; losing ONE of three shares must not make
  the deployment unrecoverable; unlock/rotation/share replacement/failed
  approvals/recovery audited; plaintext shares never persisted.

  3.6 must NOT implement 3.7/3.8/3.9 scope.

## 2. Repository evidence

- Global administrator identity: AdminGuard (core/common/admin-guard.ts) via
  FeatureService.isAdmin(userId) - installation-level, NOT workspace Owner.
- Throttling: RateLimiterModule (base/throttler); Audit: AdminAuditService
  (core/audit, logInTx).
- Bootstrap precedent: CryptoHelper.onModuleInit (env/config loading).
- Crypto model (3.2-3.5): TRACKWORK_KEK_HEX bootstrap KEK -> KEK wraps DEKs
  (wrap-v1) -> DEK encrypts values (aead-v1); KeySetId/DataKeyId/LookupKeyId
  distinct; wrapped-DEK format twkwrap1.\*; no plaintext keys.
- Single backend process (no cluster infra); no key-material models in
  schema.prisma; no key material in Redis.

## 3. Threat model

| Scenario                                   | Classification               | Rationale                                                                                          |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| A. PostgreSQL backup/DB compromise         | PROTECTED (after enrollment) | wrapped DEKs only; KEK absent; quorum required                                                     |
| B. Redis compromise                        | PROTECTED                    | no KEK/DEK/shares in Redis (design.md SHALL NOT)                                                   |
| C. filesystem/config compromise            | PARTIALLY PROTECTED          | shares never in config/images; env KEK is the pre-enrollment bootstrap gap (migration, section 17) |
| D. server memory compromise AFTER unlock   | NOT PROTECTED                | in-memory KEK/DEK usable while unlocked (documented)                                               |
| E. server process compromise BEFORE unlock | PROTECTED                    | shares not server-held; ceremony requires independent input                                        |
| F. one administrator compromise            | PARTIALLY PROTECTED          | one share < threshold; reshare remediation (section 20)                                            |
| G. >= threshold administrators compromised | NOT PROTECTED                | quorum is the boundary by definition                                                               |
| H. malicious server operator               | PARTIALLY PROTECTED          | cannot unlock while locked without shares; observes unlocked process (D)                           |
| I. malicious database operator             | PROTECTED                    | same as A                                                                                          |
| J. leaked share (< threshold)              | PARTIALLY PROTECTED          | KEK confidentiality holds; new ShareSetId remediation (section 20)                                 |
| J2. leaked shares (>= threshold)           | NOT PROTECTED                | KEK compromised; KEK rotation required (section 20)                                                |
| K. lost share                              | RECOVERABLE                  | 2-of-3: one loss survivable (proposal 61)                                                          |
| L. copied VM/server disk                   | PROTECTED                    | shares not on disk; wrapped DEKs useless without quorum                                            |
| M. restart/crash                           | PROTECTED                    | returns to locked; ceremony required (3.9)                                                         |
| N. backup restore                          | PROTECTED                    | backup alone insufficient; quorum material external                                                |
| O. rollback to older DB/keyset             | PARTIALLY PROTECTED          | keyset identity prevents cross-generation unwrap (3.5 auth)                                        |

## 4. What Shamir splits

Decision: **A - the KEK is split directly** (32 random bytes -> 2-of-3).
Mandated by design.md section 9 and the 3.2 record ("reconstructed value IS
directly the KEK"). Root-key hierarchy (B) rejected: KEK rotation is already
cheap (re-ceremony + rewrap, no value re-encryption); B adds a wrap layer and
second wrapped blob without lifecycle gain.

## 5. Critical invariant: server must not possess quorum while locked

- Shares exist ONLY outside the server (administrators via 3.7 transport;
  optionally mirrored in independent external secret managers).
- The server NEVER persists shares (DB/Redis/config/images/logs/localStorage),
  never auto-fetches them, never reconstructs without ceremony input.
- While locked the server holds only wrapped DEKs + keyset metadata (3.8).
- Reconstruction requires >= threshold shares submitted by humans/external
  providers at unlock time. Server-side auto-fetch of all shares is NOT a
  quorum design.

## 6. Administrator / share-holder model and quorum terminology

- Share holder: installation-level administrator (AdminGuard) or explicitly
  enrolled deployment operator. Workspace Owner is NOT equated with
  cryptographic administrator.
- **Terminology (corrected)**: the design provides a **2-of-3 SHARE quorum**,
  NOT cryptographic two-person control. Shares are bearer secrets, not
  identity-bound; a single administrator/operator CAN physically possess
  multiple shares.
  - three administrator/operator-distributed bearer shares are generated;
  - any two valid shares reconstruct the KEK;
  - distinct-person custody is RECOMMENDED OPERATIONAL POLICY;
  - enforcing distinct human identities is NOT provided by 3.6 (and not by
    the literal 3.6/3.8 task text - no conflict requiring identity binding is
    present; proposal "independently held" is aspirational wording, reported
    as such).
- Transferable: yes (bearer); scope: installation-global.

## 7. Threshold parameters and identities

- Mandated: threshold 2, shares 3 (proposal 58; tasks 3.6).
- TWO DISTINCT GENERATION IDENTITIES (corrected):
  - **KeySetId** (`ks_...`): KEK/keyset generation. Changes on KEK rotation.
  - **ShareSetId** (`ss_...`): share-generation identity. Changes on ANY
    new split (initial split, reshare, KEK rotation).
- Lifecycle table:

| Operation                         | KeySetId | ShareSetId | Wrapped DEKs  | Value ciphertext |
| --------------------------------- | -------- | ---------- | ------------- | ---------------- |
| Initial split                     | K1       | S1         | unchanged     | unchanged        |
| Reshare same KEK (new polynomial) | K1       | S2         | unchanged     | unchanged        |
| Rotate KEK                        | K2       | S3         | rewrapped     | unchanged        |
| Rotate DEK                        | K1       | S1         | n/a (new DEK) | new values only  |

- Validation: threshold >= 2; shares <= 255 (library MAX*SHARES);
  threshold <= shares; distinct share indexes in [1..shares]; keySetId and
  shareSetId canonical (ks*/ss\_ + 32 hex); duplicates/mixed identities
  rejected BEFORE combine.

## 8. Share format (conceptual contract)

```text
twshare-v1.<keySetId>.<shareSetId>.<index>.<base64url(shareBytes)>.<crc32hex>
```

- version magic twshare-v1; keySetId = KEK generation; shareSetId = share
  generation; index = share index; shareBytes = library share binary (82 B
  for a 32-byte KEK); crc32 = error-detection ONLY (never authentication).
- Parser MUST reject before reconstruction: differing keySetIds, differing
  shareSetIds, duplicate indices, invalid format/version, non-canonical
  base64url, checksum mismatch. Unknown version -> fail closed.
- Library behavior vs TrackWork normative behavior remain separate (library
  does not detect generation mismatch; TrackWork enforces it pre-combine).

## 9. Share confidentiality

Plaintext bearer shares (design.md 9; 3.2 rejected password-derived KEKs). A
share is sensitive: possession of threshold shares = possession of the KEK.
Transport/storage is the administrators' responsibility (3.7 UX; external
secret managers recommended). No per-administrator encryption, no local-
password wrapping, no hardware-backed shares in 3.6 (future enhancement).

## 10. Share generation ceremony (3.6 contract)

1. Explicit admin-initiated enrollment (setup or KEK rotation).
2. Server process, in-memory; no share persistence.
3. RNG: node:crypto.randomBytes injected (normative; library default NOT used).
4. Splitting: KEK = randomBytes(32) (new keyset) or existing env KEK
   (enrollment migration, section 17); split 3 shares threshold 2; fresh
   ShareSetId assigned.
5. Shares shown/exported once (3.7 UX); server retains NO copy.
6. Temporary buffers best-effort fill(0).
7. Crash mid-ceremony: no persistent state -> retry; no partial keyset.
8. Keyset activation only after all three shares are successfully
   displayed/exported (3.7 proves distribution).
9. Ceremony API fails closed if share rendering fails.

## 11. Unlock ceremony (contract for 3.9, primitives for 3.6)

- Start locked (3.9); share submission via authenticated admin endpoint.
- Validation per share: format/version/identities/index/checksum; duplicates
  rejected.
- Quorum: threshold distinct valid shares (same keySetId AND shareSetId) in a
  process-local accumulator (TTL, restart loss, max attempts).
- Reconstruct KEK -> validate against the 3.8 keyset verification artifact
  (section 12) -> unwrap DEKs.
- Discard shares (best-effort zeroization); audit; timeout/cancel; restart
  aborts.

## 12. Reconstructed-KEK validation dependency (corrected)

- **Primary and canonical**: OpenSpec 3.8 persistent metadata MUST provide a
  dedicated authenticated keyset verification artifact (key-check/wrapped
  verification object per the literal 3.8 task). 3.9 unlock MUST validate the
  reconstructed KEK against that persisted verifier BEFORE entering unlocked
  state.
- Existing wrapped DEKs MAY be ADDITIONAL validation evidence but MUST NOT be
  the only/primary mechanism: a fresh installation has zero wrapped DEKs.
- 3.6 does NOT implement the key-check artifact (belongs to 3.8); 3.6 proves
  only that generated 2-of-3 shares reconstruct the original 32-byte KEK
  (pure cryptographic tests).
- No hash comparison leaking reusable verification material; the AEAD
  verifier is the check (256-bit random KEK; offline guessing irrelevant).

## 13. Share/session handling

No persistence (PG/Redis/logs/audit/errors). Temporary: process-local
ceremony accumulator (TTL ~10 min, restart loss, max ~5 attempts), uniform
error responses, no Redis for ceremony state.

## 14. Concurrency / race semantics

Single in-process ceremony coordinator; concurrent ceremonies rejected (409);
duplicate submissions idempotent per index; threshold reached atomically;
state transitions serialized (3.9 owns state); restart aborts and discards
shares.

## 15. Rate limiting / abuse

AdminGuard-authenticated endpoint; RateLimiterModule per-admin + global
attempt limits; request body size bound; malformed-share throttling; audit;
uniform error bodies (no share-content/threshold-oracle leakage).

## 16. Audit semantics

Events (contract; 3.9 wires them): quorum-setup-started/completed,
unlock-attempt, share-accepted (index/keySetId/shareSetId ONLY - NEVER
bytes), unlock-succeeded/failed, keyset-rotation, share-reshare. Via
AdminAuditService. Never: share bytes, KEK, DEK.

## 17. Bootstrap migration from TRACKWORK_KEK_HEX

Two modes (specified by 3.6, implemented later):

- Enroll-existing: split the CURRENT env KEK -> shares (new ShareSetId, same
  KeySetId); after successful distribution the env value may be removed;
  existing wrapped DEKs unchanged.
- Rotate: ceremony generates a NEW KEK (new KeySetId + ShareSetId); wrapped
  DEKs rewrapped (same DataKeyIds); env value removed.
- Fresh installs: ceremony-only.
- Partial migration: env KEK retained until distribution proof (3.7);
  rollback = keep env KEK. Never: silent new KEK; never unreadable wrapped
  DEKs.

## 18. Backup / restore

- DB backup (wrapped DEKs + metadata) alone: insufficient.
- Recovery requires: backup + >= threshold shares + keyset identity match.
- Restoration to another server: same ceremony; keyset metadata must match.
- Disaster: ONE share lost -> recoverable; threshold shares lost -> PERMANENT
  DATA LOSS (explicit; external share backup is the mitigation).

## 19. Share rotation (distinct operations, corrected)

| Operation                         | Changes share values | Changes ShareSetId | Changes KeySetId | Changes wrapped KEK/DEKs | Changes value ciphertext |
| --------------------------------- | -------------------- | ------------------ | ---------------- | ------------------------ | ------------------------ |
| Reshare same KEK (new polynomial) | YES                  | YES (S1->S2)       | NO               | NO                       | NO                       |
| Rotate KEK                        | YES                  | YES (->S3)         | YES (K1->K2)     | YES (rewrap)             | NO                       |
| Rotate DEK                        | NO                   | NO                 | NO               | NO                       | YES (new values only)    |

Prefer operations that avoid re-encrypting application data.

## 20. Revocation / compromised share (corrected)

| Scenario                       | Response                                              | Security effect                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONE share leaked (< threshold) | reshare same KEK to a new ShareSetId (new polynomial) | KEK confidentiality holds; old generation unusable for future operations (mixing rejected by ShareSetId + polynomial); old shares remain SENSITIVE material (do not claim they are cryptographically destroyed) |
| >= threshold shares leaked     | rotate KEK (new KeySetId + ShareSetId), rewrap DEKs   | old KEK material useless; value ciphertext untouched                                                                                                                                                            |

Explicit: resharing the same KEK does NOT revoke an already
threshold-compromised old share set. If an attacker obtained >= threshold
shares from ANY old generation, KEK rotation is required. If fewer than
threshold old shares leaked, a new independent share generation limits
future operational use of the old generation, but old shares are still
sensitive material.

## 21. Old/new share generation mixing (corrected)

- Generation identity: BOTH keySetId (KEK generation) and shareSetId (share
  generation) in the share format, parser and ceremony.
- Rejection: differing keySetId or shareSetId -> rejected BEFORE combine()
  (TrackWork normative; the library does not detect generation mismatch).
- Cryptographically: shares from independent split generations must never be
  mixed; mixed-generation reconstruction is not a supported operation; even
  if combined, different polynomials/secrets fail the 3.8 key-check.
- Test vectors (implementation): mix keySetIds -> reject; mix shareSetIds ->
  reject; mix old/new polynomial shares of same KEK -> key-check fails.

## 22. Availability / restart implications

Restart requires quorum (or an external independent share provider releasing
shares on operator action). Unattended automated restart impossible without
it; auto-unlock (if ever added) is explicitly weaker and outside the quorum
guarantee. HA/multi-node: see section 23.

## 23. Multi-node semantics

Current repo: single-process. Future constraint: multi-node must not
broadcast the reconstructed KEK insecurely; options (later design): one node
ceremony + secure internal channel, or shared external key service. NOT
designed now.

## 24. Boundary with 3.7 / 3.8 / 3.9 (exact task text, corrected)

| Item                                                             | 3.6                     | 3.7 | 3.8                 | 3.9           |
| ---------------------------------------------------------------- | ----------------------- | --- | ------------------- | ------------- |
| Share generation primitive (2-of-3)                              | YES (this design)       | -   | -                   | -             |
| Share export UX / non-persistence enforcement                    | contract only           | YES | -                   | -             |
| Persistent metadata incl. canonical keyset verification artifact | referenced (dependency) | -   | YES                 | -             |
| disabled/locked/unlocked state + unlock runtime                  | primitives only         | -   | -                   | YES           |
| Key-check validation of reconstructed KEK                        | pure primitive tests    | -   | artifact owned here | consumed here |

3.6 depends on 3.8 for the canonical verification artifact and on 3.9 for the
unlock runtime; 3.6 itself implements only the generation/reconstruction
primitive.

## 25. Shamir library verification (re-confirmed)

shamirs-secret-sharing@2.0.1 (exact pin; MIT; zero deps; pure JS ESM; npm
owner werle/jwerle fork; published 2025-05-23; 106 stars; not archived).
Source-verified: GF(2^8) with 128-bit padding; share = bit-count char + x id

- y data; split() REQUIRES-injectable RNG with default Buffer.random
  (WebCrypto); combine() silently skips duplicate ids and returns bytes for any
  input (no integrity, no generation detection). TRACKWORK NORMATIVE: MUST
  inject node:crypto.randomBytes; MUST pre-check >= 2 distinct valid shares and
  matching keySetId/shareSetId before combine; MUST validate reconstruction via
  the 3.8 key-check. No public audit found (stated; zero deps bounds the
  surface).

## 26. Cryptographic test vectors (TEST-ONLY design)

Deterministic fake KEKs (never production RNG): split 3/2 -> every 2-share
combination reconstructs identically; 1 share fails the TrackWork threshold
contract; duplicate index rejected; mixed KeySetId rejected before combine;
mixed ShareSetId rejected before combine; malformed share rejected;
single-bit corruption detected (CRC or key-check); shuffled order
reconstructs; bounds (threshold 2 min, shares <= 255); ShareSetId assigned
fresh per split; reshare produces a new ShareSetId.

## 27. Normative MUST / MUST NOT

MUST NOT: persist plaintext root/KEK; persist submitted shares (DB/Redis/
config/images/logs/localStorage); log shares; auto-reconstruct from
server-local persisted material; rely on the library default RNG (inject
randomBytes); mix generations (keySetId/shareSetId) at combine; accept
duplicate share indices; fail open; hide permanent-loss scenarios; claim
resharing revokes threshold-compromised share sets.
MUST: keep KeySetId and ShareSetId distinct; assign a fresh ShareSetId per
split; cryptographically validate the reconstructed secret against the 3.8
verification artifact (wrapped DEKs as additional evidence only); fail closed
on any ceremony error; use CSPRNG only; pre-check >= 2 distinct valid shares
and matching identities before combine; audit without share content; document
that threshold-share loss = permanent loss.

## 28. Decision record / non-goals / dependencies

Chosen: direct-KEK split (section 4); 2-of-3 (section 7); KeySetId +
ShareSetId generation identities (section 7); plaintext bearer shares
(section 9); twshare-v1 format (section 8); validation via the 3.8 keyset
verification artifact, wrapped DEKs as additional evidence (section 12);
migration modes enroll-existing/rotate (section 17).

Non-goals (3.6): share export UX (3.7), metadata persistence incl. key-check
artifact (3.8), state machine + unlock runtime (3.9), per-administrator share
encryption, hardware-backed shares, auto-unlock, multi-node key distribution,
identity-bound shares (distinct-human enforcement), full migration
implementation, ceremony endpoint/accumulator/AdminGuard wiring.

Dependencies: 3.7 proves share distribution; 3.8 persists metadata and the
canonical verification artifact; 3.9 consumes ceremony primitives and the
verifier.

Rejected alternatives: root-key hierarchy (section 4); server-held shares;
password-derived share protection; auto-unlock as a quorum feature;
whole-database encryption (3.1); using wrapped DEKs as the ONLY
reconstruction validation (fresh installs have none - section 12).

## 29. Corrective design pass record

Corrections applied: ShareSetId introduced and separated from KeySetId
(reshare/rotate semantics table); share format extended with ShareSetId;
reconstruction validation re-based on the 3.8 canonical key-check artifact
(wrapped DEKs = additional evidence); quorum terminology corrected (2-of-3
SHARE quorum != two-person control; distinct custody is operational policy);
reshare/compromise semantics corrected (no claim of cryptographic revocation;

> = threshold leak requires KEK rotation); boundary table and implementation
> slice limited to the pure primitive scope.

## 30. Implemented primitive record (3.6)

Implemented in @affine/trackwork/crypto (packages/common/trackwork/src/
quorum-shares.ts; dependency shamirs-secret-sharing@2.0.1 exact-pinned):
generateTrackWorkShares(keySetId, kek, {shares=3, threshold=2, random?}),
reconstructTrackWorkKek(shares|serialized), serializeTrackWorkShare,
parseTrackWorkShare, TrackWorkShareRecord. ShareSetId added to identifiers
(ss\_ + 32 hex). Strict pre-combine validation (format, >=2 shares, same
KeySetId, same ShareSetId, distinct indices, outer==inner index, CRC).
Production RNG = injected node:crypto.randomBytes; deterministic TEST-ONLY
RNG injectable. No persistence, no unlock state, no ceremony runtime.
Reconstruction bytes are NOT cryptographically authenticated at 3.6 level -
the 3.8 keyset verification artifact is the authority (documented).

## 31. 3.7 implemented provisioning record

- Export path: POST /api/admin/trackwork/quorum/shares/export (AdminGuard,
  throttled, non-cacheable); generates one 2-of-3 share set from
  TRACKWORK_KEK_HEX via the 3.6 primitive; returns plaintext twshare-v1
  values ONCE; no re-fetch endpoint; server persists nothing (audit row with
  safe metadata only).
- KeySetId/ShareSetId in the export are PROVISIONING metadata; persistent
  keyset activation and the canonical key-check artifact belong to 3.8.
- Admin UI: masked per-share reveal + per-share text-file downloads
  (client-side Blob, object URL revoked); no browser persistence, no images.
- Repeated generation produces a NEW ShareSetId; nothing is re-downloadable.
