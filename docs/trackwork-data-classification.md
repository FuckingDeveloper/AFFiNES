# TrackWork Persisted-Data / Secrets Classification

OpenSpec 3.1. Inventory and classification of persisted security-relevant
values for the future TrackWork application-level envelope encryption (Phase 3
design: random DEK, KEK reconstructed from 2-of-3 administrator shares, no
plaintext shares/KEK/DEK, Redis must not hold them, locked-mode gating).
This document classifies CURRENT repository state; it implements nothing.

## Classification model

- S0 Public/non-sensitive operational data - no application-level encryption.
- S1 Internal metadata (IDs, timestamps, revision numbers, enums).
- S2 User/private content - protected by authorization, NOT an automatic
  envelope-encryption candidate (the Phase 3 architecture protects designated
  sensitive values, not whole-database content).
- S3 Sensitive configuration - infrastructure/account-disclosing, not direct
  authentication secrets; per-field decision.
- S4 Authentication/credential secret - default YES candidate when persisted
  server-side and possession enables authentication/impersonation/privileged
  access.
- S5 Cryptographic root/key material - strongest handling; future
  shares/KEK/DEK are PROHIBITED FROM PLAINTEXT PERSISTENCE.

Decision values: YES / NO / CONDITIONAL / PROHIBITED FROM PERSISTENCE /
NOT APPLICABLE.

## Inventory

### PostgreSQL / Prisma (schema.prisma)

| Asset                                        | Model/field                                          | Source          | Protection today                                          | Class | Encrypt?                                                |
| -------------------------------------------- | ---------------------------------------------------- | --------------- | --------------------------------------------------------- | ----- | ------------------------------------------------------- |
| Password hash (argon2)                       | users.password                                       | runtime sign-up | one-way verifier                                          | S4    | NO (keep verifier; never reversible plaintext)          |
| OAuth provider tokens                        | ConnectedAccount.accessToken/refreshToken            | OAuth callback  | PLAINTEXT at rest                                         | S4    | YES                                                     |
| TOTP seed                                    | UserTwoFactorAuth.secretEncrypted                    | enrollment      | AES-256-GCM cipher (CryptoHelper)                         | S4    | YES (existing cipher; future envelope re-key)           |
| API token                                    | AccessToken.token                                    | generation      | PLAINTEXT (unique; write-once return semantics to verify) | S4    | YES                                                     |
| Verification token                           | VerificationToken.token                              | generation      | PLAINTEXT (one-time)                                      | S4    | YES (or expiry-only mitigation; classify by usage)      |
| Invitation token hash                        | workspace_invitations.tokenHash                      | generation      | SHA-256 verifier                                          | S4    | NO (verifier; non-reversible by design)                 |
| SCM integration token                        | DevelopmentIntegrationConnection.tokenCipher         | provider setup  | AES-256-GCM cipher                                        | S4    | YES (existing cipher; future envelope)                  |
| Webhook secret                               | DevelopmentIntegrationConnection.webhookSecretCipher | provider setup  | AES-256-GCM cipher                                        | S4    | YES                                                     |
| SCM sync token                               | DevelopmentRepository.syncToken                      | provider sync   | PLAINTEXT                                                 | S4    | YES                                                     |
| Copilot provider API key                     | CopilotProvider.providerConfig (JSONB)               | admin config    | PLAINTEXT JSONB                                           | S4    | YES                                                     |
| Webhook event UUID/dedupe keys               | DevelopmentWebhookEvent / Redis dedupe               | webhook ingress | plaintext IDs (non-secret)                                | S1    | NO                                                      |
| Task registry rows                           | trackwork_tasks                                      | sync            | plaintext IDs/keys                                        | S1    | NO                                                      |
| Task doc properties (title/status/board/...) | Yjs documents                                        | client          | user content                                              | S2    | NO (authorization-bound)                                |
| Task lifecycle history                       | taskHistory in docs                                  | client          | user content                                              | S2    | NO                                                      |
| Workflow config (board/stage titles, rules)  | trackwork_workflow_configs.config                    | admin mutation  | plaintext JSONB                                           | S2/S3 | NO (user-authored names + rule config; not credentials) |
| Workflow audit                               | admin_audit_logs.metadata                            | mutation        | bounded counts                                            | S1    | NO                                                      |
| Development activity/links                   | development\_\* tables                               | SCM events      | internal metadata + URLs                                  | S1/S3 | NO (URLs are not credentials)                           |

### Environment / config (never persisted to DB)

| Asset                      | Source                                    | Protection                    | Class | DB encryption                                |
| -------------------------- | ----------------------------------------- | ----------------------------- | ----- | -------------------------------------------- |
| PostgreSQL credentials     | env                                       | bootstrap (memory only)       | S4    | N/A (bootstrap external)                     |
| Redis credentials          | env                                       | bootstrap                     | S4    | N/A (bootstrap external)                     |
| Object storage credentials | env                                       | bootstrap                     | S4    | N/A                                          |
| SMTP credentials           | env (config descriptor)                   | memory                        | S4    | N/A (unless DB-admin settings; current: env) |
| OAuth/OIDC client secrets  | env (plugins/oauth/config.ts descriptors) | memory                        | S4    | N/A                                          |
| AFFINE_PRO_LICENSE_AES_KEY | env                                       | memory (CryptoHelper AES key) | S5    | N/A (bootstrap external)                     |
| Session/JWT secrets        | env (session config)                      | memory                        | S4    | N/A                                          |

### Redis / cache

| Asset                          | Location                                         | Class               | Encrypt?                                                                   |
| ------------------------------ | ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------- |
| Webhook dedupe keys            | trackwork:webhook:<connectionId>:<uuid>          | S1 (non-secret IDs) | NO                                                                         |
| Calendar/oauth ephemeral state | SessionCache                                     | S4 (short-lived)    | NO (short TTL; not persisted secrets; classify: temporary tokens)          |
| Rate-limit counters            | throttler                                        | S1                  | NO                                                                         |
| Queue jobs                     | BullMQ (may carry webhook payloads, not secrets) | S1/S3               | NO (verify no credential in job payloads; current payloads are event data) |

### Client persistence

localStorage/IndexedDB: AFFiNE session tokens (browser OAuth storage), doc
data, workflow mirror. Browser-stored tokens are the client-side session
boundary - OUT OF SCOPE for server envelope encryption (separate browser
security domain); task doc content is S2 user content.

### Logs / audit / metrics

No intentional secret persistence. Classification: PROHIBITED secret storage;
redaction tests (2.10) enforce. Any leak found during inventory is reported
separately (none confirmed in current logs/metrics paths).

## Application-level encryption decision (S4 candidates)

YES candidates (persisted server-side, credential material):
ConnectedAccount access/refresh tokens, AccessToken.token, VerificationToken
(write-once), integration tokenCipher/webhookSecretCipher (existing cipher,
future envelope re-key), syncToken, Copilot provider API key,
UserTwoFactorAuth.secretEncrypted (existing cipher).

NO (excluded deliberately): password hashes (argon2 - verifier, non-reversible),
invitation tokenHash (SHA-256 verifier), webhook dedupe UUIDs, revision numbers,
audit action names, metrics labels, public provider names, task keys/IDs,
timestamps, workflow user-authored names, task content (S2 - authorization,
not envelope), board/stage titles.

CONDITIONAL: verification tokens (if used for long-lived magic links; current
one-time use - verify before finalizing), syncToken (if it grants read-only
sync access, still YES by the possession rule).

PROHIBITED FROM PERSISTENCE (future): DEK, KEK, quorum shares - must never be
persisted plaintext (or at all server-side in the case of shares).

## Bootstrap external secrets

PostgreSQL credentials, Redis credentials, object storage credentials, SMTP
credentials, OAuth client secrets, session/JWT secrets, license AES key,
TLS/private keys (reverse-proxy boundary). Encrypting these with a DEK stored
in the same DB creates a bootstrap cycle; they must remain externally sourced
(env/secret store) - classified BOOTSTRAP EXTERNAL SECRET.

## Locked-mode dependency matrix (future 3.9-3.12)

- REQUIRED WHILE LOCKED: session/auth material (admin login), DB/Redis
  credentials (bootstrap external), license key (boot critical).
- MUST REMAIN PAUSED WHILE LOCKED: SCM providers (integration tokens),
  SMTP (if credential-backed), external webhooks (webhook secrets),
  AI/copilot providers (API keys), calendar/oauth sync.
- UNAFFECTED: task registry reads, workflow config reads, task document
  access (no protected credentials consumed).

## Searchability / unique / index constraints (future 3.3+)

AccessToken.token: UNIQUE + lookup by token -> REQUIRE DESIGN DECISION
(deterministic lookup key vs hash index). ConnectedAccount tokens: not
queried by value (find by provider+accountId) -> no constraint. Integration
ciphers: not queried by value -> no constraint. Copilot providerConfig: not
searched by API key -> no constraint.

## Rotation implications

Rotation-capable today: integration token/webhook secret (create/update
flows), Copilot API key (admin config), OAuth tokens (refresh flow). The
envelope must preserve these update paths (decrypt -> update -> re-encrypt).

## Existing crypto primitives (inventory only - NOT 3.2 selection)

- CryptoHelper AES-256-GCM (node:crypto): integration ciphers, TOTP seed,
  license key - reusable pattern for the future envelope investigation.
- Argon2 (password hashing): users.password.
- SHA-256 (invitation tokenHash, webhook signature digests).
- OTel SDK (unrelated to encryption).

## Counts (meaningful security/data assets)

S0 ~10, S1 ~15, S2 ~6, S3 ~8, S4 ~14, S5 ~6. YES ~11, NO ~30,
CONDITIONAL ~2, PROHIBITED FROM PERSISTENCE ~3 (future shares/KEK/DEK),
BOOTSTRAP EXTERNAL SECRET ~8.

## Methodology

Prisma schema name search + write/read path tracing (auth service, integration
service, crypto helper), config descriptors (env), Redis/cache key audit,
client persistence review, logs/audit/metrics review. Generated types used only
as supporting evidence.

## Security defect found during inventory (separate from future encryption)

ConnectedAccount.accessToken/refreshToken are persisted PLAINTEXT at rest
(currently protected only by DB access control). Not a direct disclosure leak
(response/read paths mask them; no logging), but the future envelope encryption
targets them first. No immediate fix required by this classification; tracked
as the primary 3.1 evidence for the encryption candidate list.
