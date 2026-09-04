# TrackWork Quorum Secret-Sharing - Design / Threat-Model Record

OpenSpec 3.6 design pass (NO Shamir runtime implemented yet, NO dependencies
added, NO production code changed). This document fixes the architecture that
the 3.6 implementation slice will build, and that 3.7 (export), 3.8
(persistent metadata) and 3.9 (encryption state) will consume.

## 1. Literal scope from OpenSpec

- 3.6: "Implement generation of three administrator shares with threshold two
  using a mature secret-sharing implementation." -> the share GENERATION
  primitive + contracts.
- 3.7: "Ensure plaintext administrator shares are exported to administrators
  and are never persisted in PostgreSQL, Redis, config files, images, logs or
  localStorage." -> export UX + non-persistence enforcement (NOT 3.6).
- 3.8: "Add persistent encryption metadata containing only safe
  key/version/share identifiers and quorum policy metadata." -> metadata
  model (NOT 3.6).
- 3.9: "Implement `disabled | locked | unlocked` encryption-state service."
  -> state machine (NOT 3.6).
- Proposal (51-63): 2-of-3 mandated; losing ONE of three shares must not make
  the deployment unrecoverable; unlock/rotation/share replacement/failed
  approvals/recovery audited; plaintext shares never persisted.

  3.6 must NOT implement 3.7/3.8/3.9 scope.

## 2. Repository evidence

- Global administrator identity: AdminGuard (core/common/admin-guard.ts) via
  FeatureService.isAdmin(userId) - installation-level, NOT workspace Owner
  (workspace Owner is a workspace-scoped role on a different trust boundary).
- Throttling: RateLimiterModule (base/throttler) - existing rate-limit infra.
- Audit: AdminAuditService (core/audit) with logInTx - existing audit infra.
- Bootstrap precedent: CryptoHelper.onModuleInit (base/helpers/crypto.ts) -
  env/config loading at startup.
- Crypto model (3.2-3.5, completed): TRACKWORK_KEK_HEX bootstrap KEK -> KEK
  wraps DEKs (wrap-v1) -> DEK encrypts values (aead-v1); KeySetId/DataKeyId/
  LookupKeyId distinct; wrapped-DEK format twkwrap1.\*; no plaintext keys.
- No multi-node/cluster infrastructure - single backend process (one NestJS
  app); no key-material models in schema.prisma; no key material in Redis.

## 3. Threat model

| Scenario                                             | Classification               | Rationale                                                                                                   |
| ---------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A. PostgreSQL backup/DB compromise                   | PROTECTED (after enrollment) | wrapped DEKs only; KEK absent from DB; quorum required                                                      |
| B. Redis compromise                                  | PROTECTED                    | no KEK/DEK/shares in Redis (design.md SHALL NOT)                                                            |
| C. filesystem/config compromise                      | PARTIALLY PROTECTED          | shares never in config/images; env KEK is the pre-enrollment bootstrap gap (migration contract, section 17) |
| D. server memory compromise AFTER unlock             | NOT PROTECTED                | in-memory KEK/DEK usable while unlocked (documented; 3.2 threat model)                                      |
| E. server process compromise BEFORE unlock           | PROTECTED                    | shares not server-held; ceremony requires independent input                                                 |
| F. one administrator compromise                      | PARTIALLY PROTECTED          | one share < threshold; reshare on suspicion (section 20)                                                    |
| G. multiple administrators compromise (>= threshold) | NOT PROTECTED                | quorum is the boundary by definition                                                                        |
| H. malicious server operator                         | PARTIALLY PROTECTED          | cannot unlock while locked without shares; can observe unlocked process (D)                                 |
| I. malicious database operator                       | PROTECTED                    | same as A                                                                                                   |
| J. leaked share                                      | PARTIALLY PROTECTED          | one share insufficient; reshare/rotation response (section 20)                                              |
| K. lost share                                        | RECOVERABLE                  | 2-of-3: one loss survivable (proposal 61)                                                                   |
| L. copied VM/server disk                             | PROTECTED                    | shares not on disk; wrapped DEKs useless without quorum                                                     |
| M. restart/crash                                     | PROTECTED                    | returns to locked; ceremony required (3.9)                                                                  |
| N. backup restore                                    | PROTECTED                    | backup alone insufficient; quorum material external                                                         |
| O. rollback to older DB/keyset                       | PARTIALLY PROTECTED          | keyset identity prevents cross-generation unwrap (3.5 auth)                                                 |

## 4. What Shamir splits

Decision: **A - the KEK is split directly** (32 random bytes -> 2-of-3).

Mandated by design.md section 9 ("KEK split using a mature
threshold-secret-sharing library into 3 shares, threshold 2") and the 3.2
record ("reconstructed threshold value IS directly the KEK"). Compared with B
(root key wrapping KEK):

- rotation: KEK rotation = re-ceremony + rewrap of wrapped DEKs (cheap, no
  value re-encryption). B would save the ceremony on KEK rotation but adds a
  wrap layer + second wrapped blob + more ceremony states.
- backup/keyset lifecycle: A keeps a single keyset identifier; B introduces a
  root-keyset generation layered over the KEK generation.
- 3.5 compatibility: A consumes the existing wrap-v1/wrapped-DEK model
  unchanged; B adds a new wrap purpose and metadata model.
- 3.9 locked state: A's unlock ceremony reconstructs the KEK directly - one
  validation step (unwrap a wrapped DEK).
- migration complexity: A minimal.

B is not chosen: no material lifecycle simplification for the quorum-scale
operation, at the cost of an extra hierarchy level. Documented as a rejected
alternative.

## 5. Critical invariant: server must not possess quorum while locked

- Shares exist ONLY outside the server: held by administrators (exported via
  3.7 transport), optionally mirrored in independent external secret managers.
- The server NEVER persists shares (DB/Redis/config/images/logs/localStorage -
  proposal 63), never auto-fetches them, never reconstructs without ceremony
  input.
- While locked, the server holds: wrapped DEKs, keyset metadata (3.8), and
  nothing else. Reconstruction requires >= threshold shares SUBMITTED to the
  ceremony by humans/external providers at unlock time.
- Hybrid model note: an external secret-manager that releases shares only on
  explicit operator action is acceptable; a server-side auto-fetch of all
  shares is NOT (no quorum meaning).

## 6. Administrator / share-holder model

- Share holder: installation-level administrator (AdminGuard /
  FeatureService.isAdmin) or an explicitly enrolled deployment operator.
  Workspace Owner is NOT equated with cryptographic administrator (different
  trust boundary).
- Who may submit shares / initiate unlock: enrolled quorum participants
  (global admins) authenticated via the existing session/auth.
- Same person may hold multiple shares: physically possible; cryptographically
  meaningless to prevent. Operational policy: shares SHOULD be held by
  distinct people (quorum value is a deployment decision, documented).
- Identity is NOT cryptographically bound to shares: shares are bearer
  secrets (no per-administrator encryption in 3.6; see section 9).
- Transferable: yes (bearer); rotation/reshare is the response to loss.
- Scope: installation-global (single deployment keyset), not workspace.

## 7. Threshold parameters

- Mandated: threshold 2, shares 3 (proposal 58; tasks 3.6).
- Validation rules: threshold >= 2; shares <= 255 (library MAX_SHARES);
  threshold <= shares; distinct share indexes required; share index within
  [1..shares].
- Duplicate detection: by share index within one keyset (reject before
  combine; the library silently skips duplicates - ceremony MUST pre-check).
- Mixed-keyset detection: keySetId in the share format (section 8), parser
  and ceremony enforce equality.
- Malformed/corrupt: format/checksum rejection; cryptographic validation via
  the reconstructed-key check (section 12).

## 8. Share format (conceptual contract)

```text
twshare-v1.<keySetId>.<index>.<base64url(shareBytes)>.<crc32hex>
```

- version magic twshare-v1; keySetId = generation id (mixing protection);
  index = share index; shareBytes = library share binary (82 B for a 32-byte
  KEK); crc32 = error-detection ONLY (transcription/truncation), never
  authentication.
- strict parser: exact fields, version, keySetId canonical, index bounds,
  canonical base64url, checksum; unknown version -> fail closed; mixed
  keySetId -> reject; duplicate index -> reject.
- authenticated share metadata is NOT needed: integrity of the reconstructed
  key is provided by the keyset key-check (section 12), not by share-level
  authentication.

## 9. Share confidentiality

Decision: plaintext bearer shares (design.md 9; 3.2 rejected password-derived
KEKs). A plaintext share is sensitive: possession of threshold shares =
possession of the KEK. Consequence documented: shares must be transported and
stored by administrators with care (3.7 export UX; external secret managers
recommended). No per-administrator encryption, no local-password wrapping, no
hardware-backed shares in 3.6 (would require a key-distribution ceremony
beyond current scope; noted as future enhancement).

## 10. Share generation ceremony (3.6 contract)

1. When: explicit admin-initiated enrollment (setup or KEK rotation).
2. Where: server process (in-memory), no share persistence.
3. RNG: node:crypto.randomBytes injected into the library (normative; the
   library default RNG is NOT relied upon).
4. Splitting: KEK = randomBytes(32) (new keyset) OR the existing env KEK
   (enrollment migration, section 17); split into 3 shares, threshold 2.
5. Presentation: shares shown/exported once (3.7 UX); server retains NO copy.
6. Server copies: none; temporary buffers best-effort fill(0).
7. Crash mid-ceremony: no persistent state -> retry; no partially active
   keyset.
8. Keyset activation: only AFTER all three shares are displayed/exported
   successfully (3.7 proves distribution; 3.6 requires the generation step to
   complete atomically in memory).
9. Proof of distribution: 3.7 responsibility (export receipts/ack); 3.6
   requires the ceremony API to fail closed if share rendering fails.

## 11. Unlock ceremony (contract for 3.9, primitives for 3.6)

- Start locked (3.9 state); share submission via authenticated admin endpoint.
- Validation per share: format/keyset/index/checksum; duplicates rejected.
- Quorum completion: threshold distinct valid shares accumulated in a
  process-local ceremony accumulator (TTL, restart loss, max attempts).
- Reconstruct KEK -> cryptographically validate (section 12) -> unwrap DEKs.
- Discard shares (best-effort zeroization); retain only minimum runtime key
  material; audit success/failure; timeout/cancel; restart aborts.

## 12. Reconstructed-secret validation

Primary: attempt AES-GCM unwrap of any wrapped DEK of the claimed keyset
(wrap-v1, AAD binds keySetId+dataKeyId) with the candidate KEK. AEAD
authentication success = valid reconstruction; failure = invalid (fail
closed, no partial state). Fallback contract: for keysets without wrapped
DEKs, persist a dedicated authenticated key-check blob (random 32 B wrapped
under the KEK with wrap purpose key-check, stored only in wrapped form -
3.8 metadata model). No hash comparison that leaks reusable verification
material; the AEAD check itself is the verifier (256-bit random KEK; offline
guessing irrelevant).

## 13. Share/session handling

- Persisted in PostgreSQL/Redis/logs/audit/errors: NO (normative).
- Temporary: process-local ceremony accumulator; TTL (e.g. 10 min); restart
  loss; max attempts (e.g. 5); duplicate identity/share rejection; uniform
  error responses (no share-content or threshold-oracle leakage).
- No Redis usage for ceremony state.

## 14. Concurrency / race semantics

- Single in-process ceremony coordinator: concurrent ceremonies rejected
  (409); duplicate share submissions idempotent per index; threshold reached
  atomically (single-threaded accumulator); lock-while-unlock-completing:
  state transitions serialized (3.9 owns the state, 3.6 defines the
  serialization requirement); restart during ceremony aborts and discards
  shares. Deterministic, implementable without double-unlock.

## 15. Rate limiting / abuse

- Endpoint: AdminGuard-authenticated; RateLimiterModule per-admin + global
  unlock-attempt limits; request body size bound (share length cap);
  malformed-share throttling; audit; uniform error bodies (no oracle).

## 16. Audit semantics

Events (contract; 3.9 wires them): quorum-setup-started, quorum-setup-
completed, unlock-attempt, share-accepted (index/keyset only - NEVER bytes),
unlock-succeeded, unlock-failed, keyset-rotation. Via AdminAuditService.
Never: share bytes, KEK, DEK, root material.

## 17. Bootstrap migration from TRACKWORK_KEK_HEX

Two modes, both specified by 3.6, implemented later (3.7 UX/3.9 bootstrap):

- Enroll-existing: split the CURRENT env KEK into shares; after successful
  distribution the env value may be removed. Same keyset; existing wrapped
  DEKs unchanged and readable.
- Rotate: ceremony generates a NEW KEK; wrapped DEKs rewrapped (same
  DataKeyIds - value ciphertext untouched); env value removed.
- Fresh installs: ceremony-only, no env KEK.
- Partial migration: env KEK retained until distribution proof (3.7);
  rollback = keep env KEK (dual-read not required - single keyset at a time).
- Never: silent new KEK generation; never unreadable wrapped DEKs.

## 18. Backup / restore

- DB backup (wrapped DEKs + metadata) alone: insufficient (no KEK).
- Recovery requires: backup + >= threshold shares + keyset identity match.
- Restoration to another server: same ceremony; keyset metadata must match.
- Disaster: ONE share lost -> recoverable (2-of-3); threshold shares lost ->
  PERMANENT DATA LOSS (explicit; external backup of shares is the mitigation).

## 19. Share rotation (distinct operations)

| Operation                         | Changes share values | Changes KeySetId | Changes wrapped KEK/DEKs | Changes value ciphertext |
| --------------------------------- | -------------------- | ---------------- | ------------------------ | ------------------------ |
| Reshare same KEK (new polynomial) | YES                  | NO (same keyset) | NO                       | NO                       |
| Rotate KEK                        | YES                  | YES              | YES (rewrap)             | NO                       |
| Rotate DEK                        | NO                   | NO               | NO                       | YES (new values only)    |

Prefer operations that avoid re-encrypting application data.

## 20. Revocation / compromised share

- One share compromised, threshold not reached: reshare the same KEK with a
  NEW polynomial -> old and new shares are on different polynomials and can
  never combine (any mix yields garbage -> key-check fails). Generation
  identity (keySetId) is unchanged; the polynomial change is the mixing
  boundary.
- Threshold-reach suspected: rotate KEK (section 19) - leaked material
  becomes useless.

## 21. Old/new share generation mixing

- Generation identifier: keySetId (share format, parser, ceremony).
- Cross-generation combination: rejected by parser (keySetId mismatch) and
  cryptographically (different secrets/polynomials fail the key-check).
- Test vectors (implementation): mix shares of different keysets -> reject;
  mix old/new polynomial shares of same keyset -> key-check fails.

## 22. Availability / restart implications

- Restart requires quorum (or an external independent share provider
  releasing shares on operator action).
- Unattended automated restart: impossible without that provider; classified
  as weaker security if auto-unlock is ever added (outside the quorum
  guarantee).
- HA/multi-node: current architecture is single-process; see section 23.

## 23. Multi-node semantics

Current repo: no cluster/horizontal-scaling infrastructure (single NestJS
process). Documented future constraint: a multi-node deployment must not
broadcast the reconstructed KEK insecurely; options (later design): one node
performs the ceremony and others derive/session keys via a secure internal
channel, or a shared external key service. NOT designed now - no insecure key
broadcast invented.

## 24. Boundary with 3.7 / 3.8 / 3.9 (exact task text)

| Item                                                               | 3.6               | 3.7 | 3.8 | 3.9 |
| ------------------------------------------------------------------ | ----------------- | --- | --- | --- |
| Share generation primitive                                         | YES (this design) | -   | -   | -   |
| Share export UX / non-persistence enforcement                      | contract only     | YES | -   | -   |
| Persistent metadata (key/version/share identifiers, quorum policy) | referenced        | -   | YES | -   |
| disabled/locked/unlocked state + runtime activation                | primitives        | -   | -   | YES |
| Unlock ceremony runtime                                            | contract          | -   | -   | YES |

## 25. Shamir library verification (re-confirmed)

shamirs-secret-sharing@2.0.1 (exact pin; MIT; zero deps; pure JS ESM; npm
owner werle/jwerle fork; published 2025-05-23; 106 stars; not archived).
Source-verified in 3.2: GF(2^8) with 128-bit padding; share = bit-count char

- x id + y data; split() REQUIRES-injectable RNG with default
  Buffer.random = WebCrypto getRandomValues (library behavior); combine()
  silently skips duplicate ids and returns bytes for any input (no integrity).
  TRACKWORK NORMATIVE: MUST inject node:crypto.randomBytes; MUST pre-check
  > = 2 distinct valid shares; MUST validate reconstruction via key-check
  > (section 12). No public audit found (stated; zero deps bounds the surface).

## 26. Cryptographic test vectors (TEST-ONLY design)

Deterministic fake KEKs (never production RNG): split 3/2 -> every 2-share
combination reconstructs identically; 1 share fails the key-check; duplicate
index rejected; mixed keysets rejected; malformed share rejected; single-bit
corruption detected via CRC or key-check; shuffled order reconstructs; bounds
(threshold 2 min, shares <= 255).

## 27. Normative MUST / MUST NOT

MUST NOT: persist plaintext root/KEK; persist submitted shares (DB/Redis/
config/images/logs/localStorage); log shares; auto-reconstruct from
server-local persisted material; rely on the library default RNG (inject
randomBytes); accept mixed generations; accept duplicate share indices; fail
open; hide permanent-loss scenarios.
MUST: cryptographically validate the reconstructed secret (AEAD key-check);
fail closed on any ceremony error; use CSPRNG only; pre-check >= 2 distinct
valid shares before combine; bind keyset identity in share format/parser/
ceremony; document that threshold-share loss = permanent loss; audit without
share content.

## 28. Decision record / non-goals / dependencies

Chosen: direct-KEK split (section 4); 2-of-3 (section 7); plaintext bearer
shares (section 9); twshare-v1 format (section 8); AEAD key-check validation
(section 12); migration modes enroll-existing/rotate (section 17).

Non-goals (3.6): share export UX (3.7), metadata persistence (3.8), state
machine (3.9), per-administrator share encryption, hardware-backed shares,
auto-unlock, multi-node key distribution, full migration implementation.

Dependencies: 3.7 proves share distribution; 3.8 persists keyset metadata;
3.9 consumes ceremony primitives.

Rejected alternatives: root-key hierarchy (section 4); server-held shares;
password-derived share protection; auto-unlock as a quorum feature;
whole-database encryption (3.1).
