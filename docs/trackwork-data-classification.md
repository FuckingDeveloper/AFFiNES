# TrackWork Persisted-Data / Secrets Classification

OpenSpec 3.1 (corrected final pass). Inventory and classification of persisted
security-relevant values for the future TrackWork application-level envelope
encryption (Phase 3 design: random DEK, KEK reconstructed from 2-of-3
administrator shares, no plaintext shares/KEK/DEK, Redis must not hold them,
restart returns to locked mode, protected services fail closed while locked).
This document classifies CURRENT repository state; it implements nothing.

## Classification model

S0 Public/non-sensitive operational data. S1 Internal metadata (IDs,
timestamps, revisions, enums). S2 User/private content - authorization-bound,
NOT an automatic envelope candidate. S3 Sensitive configuration. S4
Authentication/credential secret - the class the future envelope targets.
S5 Cryptographic root/key material.

Lifecycle categories (per asset, mutually exclusive):

- A PLAINTEXT_REVERSIBLE_CANDIDATE - plaintext credential persisted; future
  envelope encryption required.
- B ALREADY_ENCRYPTED_REKEY_CANDIDATE - already AES-256-GCM via CryptoHelper;
  requires migration/re-key under the future KEK/DEK hierarchy, not first-time
  encryption.
- C HASH_VERIFIER - non-reversible verifier; envelope encryption NOT applicable.
- D KEYED_LOOKUP_DESIGN - equality lookup on a secret; future representation
  needs a keyed hash index (REQUIRES_3_3_LOOKUP_DESIGN); no reversible envelope.
- E BOOTSTRAP_EXTERNAL - required before the future DEK can be unlocked;
  protecting it with that DEK would create a bootstrap cycle.
- F CONDITIONAL - depends on the exact deployment/auth mode (condition stated).
- G PROHIBITED_FROM_PERSISTENCE - future shares/KEK/DEK must never persist
  plaintext (nor in Redis).

## Persisted-value inventory (PostgreSQL / Prisma)

| Asset                                 | Model/field                                          | Stored value today (evidence)                                                                                                                                                                                                 | Read path (evidence)                                                                                                     | Class | Category                                                                     |
| ------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------- |
| Password                              | users.password                                       | argon2 hash                                                                                                                                                                                                                   | verify-only (sign-in compare)                                                                                            | S4    | C HASH_VERIFIER                                                              |
| OAuth provider tokens                 | ConnectedAccount.accessToken/refreshToken            | PLAINTEXT at rest; written only in plugins/oauth/controller.ts callback (l.280-324); never returned by any resolver/controller; not logged                                                                                    | refresh flow only (no recovery for outbound elsewhere)                                                                   | S4    | A PLAINTEXT_REVERSIBLE_CANDIDATE                                             |
| TOTP seed                             | UserTwoFactorAuth.secretEncrypted                    | AES-256-GCM ciphertext (CryptoHelper)                                                                                                                                                                                         | decrypt at verify                                                                                                        | S4    | B ALREADY_ENCRYPTED_REKEY_CANDIDATE                                          |
| API token                             | AccessToken.token                                    | SHA-256 hex of `ut_<random>`; raw returned ONCE at create (models/access-token.ts create: `sha256(token).toString('hex')` stored; `getByToken` hashes inbound, `findUnique` by hash; `list(revealed)` returns REDACTED_TOKEN) | inbound bearer verification/lookup only; never recovered, never sent outbound                                            | S4    | C HASH_VERIFIER                                                              |
| Verification token                    | VerificationToken.token                              | PLAINTEXT randomUUID stored (models/verification-token.ts create stores `token: plaintextToken`; inbound link value = `crypto.encrypt(token)`); short TTL (30 min default), one-time                                          | `get`: decrypt inbound, `findUnique` by plaintext equality (l.52-59) - comparison only, never recovered for outbound use | S4    | D KEYED_LOOKUP_DESIGN (future: keyed hash index; REQUIRES_3_3_LOOKUP_DESIGN) |
| Invitation token                      | workspace_invitations.tokenHash                      | SHA-256 verifier                                                                                                                                                                                                              | hash lookup                                                                                                              | S4    | C HASH_VERIFIER                                                              |
| SCM integration token                 | DevelopmentIntegrationConnection.tokenCipher         | AES-256-GCM ciphertext (CryptoHelper)                                                                                                                                                                                         | decrypt at provider call                                                                                                 | S4    | B ALREADY_ENCRYPTED_REKEY_CANDIDATE                                          |
| Webhook secret                        | DevelopmentIntegrationConnection.webhookSecretCipher | AES-256-GCM ciphertext (CryptoHelper)                                                                                                                                                                                         | decrypt at signature verify                                                                                              | S4    | B ALREADY_ENCRYPTED_REKEY_CANDIDATE                                          |
| SCM sync token                        | DevelopmentRepository.syncToken                      | PLAINTEXT                                                                                                                                                                                                                     | used for provider sync                                                                                                   | S4    | A PLAINTEXT_REVERSIBLE_CANDIDATE                                             |
| Copilot provider API key              | CopilotProvider.providerConfig (JSONB)               | PLAINTEXT within JSONB                                                                                                                                                                                                        | read raw at provider call                                                                                                | S4    | A PLAINTEXT_REVERSIBLE_CANDIDATE                                             |
| Webhook dedupe UUIDs                  | DevelopmentWebhookEvent / Redis dedupe keys          | plaintext IDs                                                                                                                                                                                                                 | equality                                                                                                                 | S1    | not a secret                                                                 |
| Task registry rows                    | trackwork_tasks                                      | plaintext IDs/keys                                                                                                                                                                                                            | -                                                                                                                        | S1    | not a secret                                                                 |
| Task doc content (title/status/board) | Yjs documents                                        | user content                                                                                                                                                                                                                  | authorization-bound                                                                                                      | S2    | not a secret (no whole-doc encryption)                                       |
| Task lifecycle history                | taskHistory in docs                                  | user content                                                                                                                                                                                                                  | authorization-bound                                                                                                      | S2    | not a secret                                                                 |
| Workflow config                       | trackwork_workflow_configs.config                    | plaintext JSONB (user-authored names + rules)                                                                                                                                                                                 | -                                                                                                                        | S2/S3 | not a secret (no credentials)                                                |
| Workflow audit                        | admin_audit_logs.metadata                            | bounded counts                                                                                                                                                                                                                | -                                                                                                                        | S1    | not a secret                                                                 |
| SCM activity/links                    | development\_\* tables                               | metadata + URLs                                                                                                                                                                                                               | -                                                                                                                        | S1/S3 | not a secret (URLs are not credentials)                                      |

## Bootstrap / locked-mode reclassification (ENV source is NOT evidence)

Evidence files: core/auth/config.ts (session.secret env descriptor, l.12/41),
core/mail/config.ts (SMTP.host/user/password env, l.10-53), plugins/oauth/
config.ts + controller.ts (sign-in provider /api/oauth, pkce+state via
SessionCache), plugins/gcloud (blob/object storage), base/cache/instances.ts
(SessionCache - Redis-backed), base/helpers/crypto.ts (license AES key loaded
at onModuleInit, selfhosted only, l.82-89), core/auth/session.ts (session
cookie auth).

| Secret                     | Exact classification            | Repository evidence                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL credentials     | E BOOTSTRAP_EXTERNAL            | required before ANY DB access; the app (incl. admin/role lookup and the future DEK record) cannot run without it; DEK protection = cycle                                                                                                                                                                                                                     |
| Redis credentials          | E BOOTSTRAP_EXTERNAL            | SessionCache is Redis-backed (base/cache/instances.ts); sessions are required to authenticate quorum admins; DEK protection = cycle                                                                                                                                                                                                                          |
| Object-storage credentials | PAUSED_UNTIL_UNLOCK             | consumed only by the blob/storage service (plugins/gcloud); the unlock/admin path is the web app + API, which do not read object storage                                                                                                                                                                                                                     |
| SMTP credentials           | PAUSED_UNTIL_UNLOCK             | core/mail/\* used for outbound emails (verification/notifications); the unlock ceremony presents shares directly, no email dependency; the future locked surface (design.md) does not include mail                                                                                                                                                           |
| OAuth/OIDC client secrets  | F CONDITIONAL                   | plugins/oauth is a sign-in provider (/api/oauth): if the deployment authenticates quorum administrators through the configured OAuth/OIDC provider, the client secrets are required to authenticate them and MUST stay available while locked (LOCKED_MODE_REQUIRED, not DEK-protected - cycle); otherwise the provider services pause (PAUSED_UNTIL_UNLOCK) |
| Session/JWT secrets        | LOCKED_MODE_REQUIRED            | core/auth/config.ts session.secret signs session cookies; sessions identify quorum administrators; encrypting this secret under the locked DEK would block the only admin-auth path - explicitly NOT a DEK candidate                                                                                                                                         |
| AFFINE_PRO_LICENSE_AES_KEY | E BOOTSTRAP_EXTERNAL            | loaded at CryptoHelper.onModuleInit (selfhosted, crypto.ts l.82-89) for boot-time license validation; needed for the process to run in pro deployments before any unlock                                                                                                                                                                                     |
| TLS/private keys           | NOT_QUORUM_ENCRYPTION_CANDIDATE | no TLS termination inside the backend server; selfhost deployments terminate TLS at an external reverse proxy - an infrastructure boundary, not a TrackWork-DEK subject                                                                                                                                                                                      |

## Crypto inventory (existing primitives - no new selection)

CryptoHelper (base/helpers/crypto.ts): AES-256-GCM.

- Key source: `keyPair.sha256.privateKey` - SHA-256 of the RSA private key from
  the env descriptor `config.crypto.privateKey` (crypto.ts l.105-108, l.241);
  fallback `generatePrivateKey()` when the env key is unset (per-boot random
  key - persisted ciphertexts become undecryptable after restart unless the
  env key is set; deployment requirement).
- Scope: ONE global key for all encrypted values (integration ciphers, TOTP
  seed, verification-token inbound) - no domain separation.
- Identity/version: none persisted; rotation: none; ciphertext format: not
  versioned (iv || authTag(12) || ciphertext, base64).
- Future: every currently-encrypted value requires rewrap/re-key under the
  KEK/DEK hierarchy (category B).

## Locked-mode dependency matrix (exact columns)

| Secret/dependency          | Needed before DB access | Needed to authenticate quorum admins                               | Needed for unlock UI/ceremony | Protected service can remain paused | Final classification            |
| -------------------------- | ----------------------- | ------------------------------------------------------------------ | ----------------------------- | ----------------------------------- | ------------------------------- |
| PostgreSQL credentials     | YES                     | no (indirect)                                                      | no                            | no                                  | E BOOTSTRAP_EXTERNAL            |
| Redis credentials          | YES (sessions/cache)    | YES (session store)                                                | no                            | no                                  | E BOOTSTRAP_EXTERNAL            |
| Object-storage credentials | no                      | no                                                                 | no                            | YES                                 | PAUSED_UNTIL_UNLOCK             |
| SMTP credentials           | no                      | no                                                                 | no                            | YES                                 | PAUSED_UNTIL_UNLOCK             |
| OAuth/OIDC client secrets  | no                      | CONDITIONAL (only if OAuth is the configured admin-auth mechanism) | CONDITIONAL                   | YES (unless admin-auth)             | F CONDITIONAL                   |
| Session/JWT secrets        | no                      | YES                                                                | YES                           | no                                  | LOCKED_MODE_REQUIRED            |
| AFFINE_PRO_LICENSE_AES_KEY | no                      | no                                                                 | no                            | YES                                 | E BOOTSTRAP_EXTERNAL            |
| TLS/private keys           | n/a (proxy boundary)    | no                                                                 | no                            | YES                                 | NOT_QUORUM_ENCRYPTION_CANDIDATE |
| SCM provider tokens        | no                      | no                                                                 | no                            | YES                                 | PAUSED_UNTIL_UNLOCK             |
| Webhook secrets            | no                      | no                                                                 | no                            | YES                                 | PAUSED_UNTIL_UNLOCK             |
| Copilot/AI API keys        | no                      | no                                                                 | no                            | YES                                 | PAUSED_UNTIL_UNLOCK             |
| Calendar/oauth sync tokens | no                      | no                                                                 | no                            | YES                                 | PAUSED_UNTIL_UNLOCK             |

Invariant: the future DEK must never protect the only credential required to
unlock that same DEK (session/JWT + the configured admin-auth mechanism stay
outside the DEK).

## Searchability / unique / index constraints (future 3.3+)

- AccessToken.token: UNIQUE + lookup by SHA-256 hash - the hash IS the lookup
  key; the raw token is never persisted. No auxiliary index needed.
- VerificationToken.token: equality lookup on plaintext today; future
  representation REQUIRES_3_3_LOOKUP_DESIGN (keyed hash index, e.g. HMAC of
  the token with a server-side key, or the AccessToken pattern).
- ConnectedAccount tokens / integration ciphers / TOTP seed / Copilot key: not
  queried by value - no searchability constraint.

## Rotation implications

Rotatable today: integration token/webhook secret (create/update flows),
Copilot API key (admin config), OAuth tokens (refresh flow). Envelope must
preserve update paths (decrypt -> update -> re-encrypt) and add key rotation
with versioned ciphertext format (missing today).

## Counts (meaningful security/data assets)

- S0 ~10, S1 ~15, S2 ~6, S3 ~8, S4 ~14, S5 ~6.
- A PLAINTEXT_REVERSIBLE_CANDIDATE ~4: ConnectedAccount accessToken,
  ConnectedAccount refreshToken, DevelopmentRepository.syncToken,
  CopilotProvider API key (counted per field).
- B ALREADY_ENCRYPTED_REKEY_CANDIDATE ~3: tokenCipher, webhookSecretCipher,
  UserTwoFactorAuth.secretEncrypted.
- C HASH_VERIFIER ~3: users.password, AccessToken.token, invitation tokenHash.
- D KEYED_LOOKUP_DESIGN ~1: VerificationToken.token (REQUIRES_3_3_LOOKUP_DESIGN).
- E BOOTSTRAP_EXTERNAL ~3: PostgreSQL, Redis, license AES key.
- LOCKED_MODE_REQUIRED ~1: session/JWT secrets.
- PAUSED_UNTIL_UNLOCK ~6: object storage, SMTP, SCM providers, webhooks,
  Copilot/AI, calendar/oauth sync.
- F CONDITIONAL ~1: OAuth/OIDC client secrets (admin-auth mode).
- G PROHIBITED_FROM_PERSISTENCE ~3: future shares/KEK/DEK (incl. Redis).
- NOT_QUORUM_ENCRYPTION_CANDIDATE ~1: TLS/private keys.

## Methodology

Prisma schema search + write/read path tracing (models/access-token.ts,
models/verification-token.ts, core/auth config/session, plugins/oauth
controller, core/mail config, base/helpers/crypto.ts, base/cache/instances.ts,
plugins/gcloud). Generated types used only as supporting evidence.

## Security finding (separate from 3.1 completion)

ConnectedAccount.accessToken/refreshToken: PLAINTEXT at rest.

- Attack prerequisite: database compromise (no direct API/log disclosure -
  written only in the OAuth callback, never returned by resolvers, not logged).
- Token capability/impact: OAuth provider scopes granted by the user; DB
  compromise exposes live bearer credentials usable against the provider
  (identity impersonation).
- Refresh-token implication: refreshToken permits minting NEW access tokens
  even after the current access token expires - exposure is not time-bounded
  by access-token expiry.
- Final severity: MEDIUM (requires a second compromise; impact significant but
  bounded to connected identities; mitigations: DB access control, existing
  rotation paths, future envelope category A).
- Not fixed in this pass: no direct disclosure exists; fix belongs to the
  Phase 3.3+ envelope work.
