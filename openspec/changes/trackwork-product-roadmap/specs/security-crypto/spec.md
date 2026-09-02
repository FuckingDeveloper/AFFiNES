# Capability: Security and Quorum Encryption

## ADDED Requirements

### Requirement: Server-side authorization on every protected object
TrackWork SHALL enforce authorization at the server boundary for every read or mutation of protected workspace, task, document, planning, integration, automation, analytics, and administrative objects.

#### Scenario: IDOR attempt against another workspace
- **GIVEN** a user who can access workspace A but not workspace B
- **WHEN** the user supplies a valid task/document/integration identifier belonging to workspace B
- **THEN** the server denies the operation without revealing protected object contents
- **AND** changing only the object ID cannot bypass authorization

### Requirement: Injection-resistant input handling
TrackWork SHALL use parameterized ORM/query APIs and context-appropriate encoding/validation so user-controlled values cannot become executable SQL, GraphQL fragments, shell commands, filesystem paths, HTML/JS, or provider requests unless explicitly intended and constrained.

#### Scenario: Malicious search/filter input
- **WHEN** a user submits SQL-like, GraphQL-like, HTML/script, path traversal, or shell metacharacters in a normal text/search field
- **THEN** the value is handled as data
- **AND** it cannot alter the query/program structure
- **AND** the request produces either a normal result or a validation error

### Requirement: SSRF-resistant outbound requests
Server features that request administrator/user-controlled URLs SHALL validate destination schemes and addresses according to an explicit outbound-network policy.

#### Scenario: Integration points at loopback or metadata service
- **WHEN** an untrusted or insufficiently privileged user configures an endpoint targeting localhost, RFC1918/link-local addresses, cloud metadata endpoints, unsupported schemes, or redirected equivalents
- **THEN** the request is rejected unless that destination is explicitly allowed by administrator policy

### Requirement: Secure browser state changes
State-changing browser/API operations SHALL use the platform's authentication/session protections and SHALL be resistant to CSRF where cookie-authenticated cross-origin requests could otherwise succeed.

#### Scenario: Cross-origin mutation attempt
- **GIVEN** an authenticated browser session
- **WHEN** an unrelated origin attempts a privileged state-changing request
- **THEN** origin/CSRF/session policy prevents the mutation unless explicitly authorized

### Requirement: Safe file handling
Uploads and downloads SHALL enforce authorization, size limits, expected content constraints, opaque storage identifiers, and safe response headers.

#### Scenario: Unauthorized attachment download
- **GIVEN** a valid attachment/blob ID from an inaccessible workspace
- **WHEN** another user requests the object directly
- **THEN** the server denies access despite knowledge of the ID

### Requirement: Abuse controls for GraphQL and APIs
TrackWork SHALL bound expensive query dimensions including pagination, batch sizes, nesting/depth or equivalent complexity, and rate-sensitive administrative/integration operations.

#### Scenario: Excessive pagination
- **WHEN** a client requests an unsupported page size or computationally excessive query
- **THEN** the server clamps or rejects it before excessive resource use occurs

### Requirement: Security verification gate
Release candidates SHALL execute security-oriented automated checks in addition to functional tests.

At minimum the gate SHALL include:

- dependency vulnerability scanning,
- static/security linting where supported,
- secret scanning,
- container/image vulnerability scanning for release images,
- authorization/IDOR regression tests for protected APIs,
- injection/XSS/SSRF-focused integration tests on high-risk entry points,
- webhook signature/replay tests,
- file authorization tests,
- tests verifying sensitive values are not returned by admin config APIs or logs.

#### Scenario: Security regression detected
- **WHEN** a release-gated security test detects a known critical/high-impact authorization or injection regression
- **THEN** the production release is blocked until the finding is resolved or explicitly risk-accepted through the documented release process

### Requirement: Sensitive-data classification
TrackWork SHALL classify which persisted values require application-level encryption rather than relying only on disk/database volume encryption.

Candidate classes SHALL include at minimum provider credentials, OAuth/SCM secrets, SMTP/LDAP/RADIUS secrets, API/webhook secrets, encryption/recovery metadata, and any future explicitly designated sensitive application data.

### Requirement: Envelope encryption
Protected application values SHALL be encrypted using authenticated encryption and a data-encryption key (DEK). The persisted ciphertext SHALL include sufficient versioned metadata to identify the cryptographic format without exposing plaintext key material.

#### Scenario: Database copied offline
- **GIVEN** an attacker obtains only PostgreSQL/Redis/storage backups and application configuration that does not contain unlock shares
- **WHEN** encrypted protected records are inspected
- **THEN** their plaintext cannot be recovered from the database contents alone

### Requirement: Two-of-three administrator quorum unlock
The key-encryption/unlock design SHALL require any two of three independently held administrator key shares to unlock the protected DEK after application startup.

#### Scenario: Only one administrator approves
- **GIVEN** the application has restarted into locked state
- **WHEN** one valid administrator supplies their share/approval
- **THEN** protected data remains locked
- **AND** the application records only non-sensitive approval state necessary for the quorum protocol

#### Scenario: Second distinct administrator approves
- **GIVEN** one valid approval exists for the current unlock ceremony
- **WHEN** a second distinct valid administrator supplies an independent share
- **THEN** the application reconstructs/unwraps the required key material in memory
- **AND** protected services become available
- **AND** no plaintext administrator share is persisted

#### Scenario: One share is permanently lost
- **GIVEN** exactly one of three administrator shares is unavailable
- **WHEN** either of the remaining two administrators participates
- **THEN** the system can still unlock and rotate to a replacement three-share set according to recovery policy

### Requirement: Locked startup mode
Before quorum unlock, the server SHALL start only the minimum control-plane functionality required for health, authentication/identity verification necessary for unlock, and the unlock ceremony. Features requiring protected secrets/data SHALL fail closed with an explicit locked status.

#### Scenario: GitLab integration while locked
- **WHEN** the server is running but the quorum unlock is incomplete
- **THEN** GitLab credentials are not decrypted
- **AND** provider jobs/actions remain paused
- **AND** the admin health surface reports the encryption state as locked

### Requirement: Key lifecycle and recovery
The system SHALL support audited key rotation, administrator-share replacement, quorum membership change, recovery rehearsal, and crypto-format version migration without reusing obsolete shares indefinitely.

#### Scenario: Replace compromised administrator share
- **GIVEN** a share is suspected compromised and quorum can still be reached
- **WHEN** authorized administrators rotate the quorum configuration
- **THEN** a new set of shares is issued
- **AND** the old compromised share cannot participate in future unlock ceremonies

### Requirement: No custom primitive invention
The implementation SHALL use established audited cryptographic primitives and libraries. Custom code MAY orchestrate envelope encryption and threshold-share workflows but SHALL NOT invent a new cipher, MAC, KDF, or random-number generator.

### Requirement: Security audit trail
Security-sensitive administrative events SHALL be durable and attributable, including unlock attempts, successful unlocks, key rotations, share changes, secret configuration changes, authentication-mode changes, and security-policy changes.

Sensitive secret/share contents SHALL never appear in the audit record.