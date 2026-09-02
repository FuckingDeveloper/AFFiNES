# Capability: Platform Stability

## ADDED Requirements

### Requirement: Migration-safe self-hosted upgrades
TrackWork SHALL support upgrading a persisted self-hosted deployment from the previous supported release without losing tasks, workflow configuration, planning data, task/document links, development associations, or user-authored names.

#### Scenario: Upgrade existing deployment
- **GIVEN** a self-hosted instance containing existing TrackWork data
- **WHEN** the instance is upgraded to the next supported release
- **THEN** migrations complete automatically or fail with an actionable error before destructive changes occur
- **AND** existing TrackWork entities remain readable and editable after startup

### Requirement: Production-image verification
Every release containing TrackWork persistence or backend changes SHALL verify both clean installation and upgrade startup using the production Docker image.

#### Scenario: CI verifies clean install
- **WHEN** the production image is built in CI
- **THEN** the service starts against an empty supported database
- **AND** readiness reports required dependencies as healthy
- **AND** core Task Tracker operations can be exercised

#### Scenario: CI verifies upgrade
- **GIVEN** persisted data from the previous supported release
- **WHEN** the new production image starts
- **THEN** migrations complete
- **AND** existing TrackWork data passes integrity assertions

### Requirement: Explicit permission model
TrackWork SHALL enforce server-side permissions for privileged task, workflow, planning, integration, automation, analytics, and administrative operations.

#### Scenario: Unauthorized workflow change
- **GIVEN** a user who may edit tasks but may not administer workflow
- **WHEN** the user attempts to modify stages or transition rules
- **THEN** the server rejects the operation regardless of client behavior

### Requirement: Archive semantics
Entities whose history or references are meaningful SHALL support archive/restore semantics instead of relying on destructive deletion.

#### Scenario: Archive referenced task
- **GIVEN** a task referenced by documents and development artifacts
- **WHEN** an authorized user archives the task
- **THEN** the task no longer appears in normal active views
- **AND** historical references still resolve to an archived representation
- **AND** the task can be restored if policy allows

### Requirement: Complete user-state handling
Every primary TrackWork surface SHALL define loading, empty, permission-denied, recoverable-error, and fatal-error behavior.

#### Scenario: Provider unavailable
- **GIVEN** a task with GitLab development data
- **WHEN** GitLab is temporarily unavailable
- **THEN** the task remains usable
- **AND** cached/local development data remains visible where safe
- **AND** the Development section reports a recoverable integration error instead of blanking the whole task

### Requirement: Localization of system labels
System-defined TrackWork labels SHALL be translated from stable identifiers while user-authored names remain unchanged.

#### Scenario: Russian locale with default board
- **GIVEN** a default board stored with its canonical system identity
- **WHEN** the UI locale is Russian
- **THEN** the board and default stages are displayed in Russian
- **AND** changing locale does not rewrite stored user data

### Requirement: Structured auditability
TrackWork SHALL record durable audit/activity facts for privileged configuration and task lifecycle operations sufficient to identify actor, entity, operation, and timestamp.

#### Scenario: Workflow rule changed
- **WHEN** an administrator changes allowed task transitions
- **THEN** an audit record identifies the workspace, actor, operation, affected workflow configuration, and time

### Requirement: Prometheus-compatible metrics
TrackWork SHALL expose a Prometheus-compatible metrics endpoint or equivalent scrape target for self-hosted deployments.

Metrics SHALL use stable names/labels, avoid unbounded-cardinality user content, and SHOULD cover at minimum:

- HTTP/GraphQL request count, latency, and error rate,
- PostgreSQL/Redis dependency health where available,
- task allocation conflicts/failures,
- webhook receive/process/failure/retry counts,
- SCM provider request latency/failure counts,
- automation executions/failures/retries,
- notification dispatch successes/failures,
- queue depth/job failures where supported,
- migration/startup failures,
- encryption locked/unlock attempt/result state without exposing secret material.

#### Scenario: Prometheus scrape
- **WHEN** Prometheus scrapes the configured metrics endpoint
- **THEN** TrackWork returns machine-readable metrics without authentication secrets or user document/task contents
- **AND** common failure counters can be alerted on externally

### Requirement: Structured log export
Server-side logs SHALL be emitted in a structured format suitable for collection by standard log pipelines.

The supported deployment guidance SHALL cover at least:

- container stdout/stderr collection,
- Loki-compatible collection through Promtail/Grafana Alloy or equivalent,
- Elasticsearch/OpenSearch-compatible ingestion through agents/processors such as Fluent Bit, Vector, Logstash, or Data Prepper,
- optional OTLP log export if/when implemented.

Logs SHOULD include timestamp, level, service/component, operation/event name, request/correlation ID, workspace/entity identifiers where safe, provider/job identifiers where safe, and result/error class.

Logs SHALL NOT contain plaintext passwords, tokens, quorum shares, encryption keys, full authorization headers, or user document/task bodies by default.

#### Scenario: Webhook processing failure reaches Loki/ELK
- **GIVEN** structured log collection is configured
- **WHEN** a webhook handler fails
- **THEN** TrackWork emits a structured error event containing correlation and sanitized provider/event context
- **AND** the event can be indexed by Loki or an Elasticsearch/OpenSearch-style pipeline without text parsing assumptions

### Requirement: Correlation across logs and metrics
TrackWork SHOULD propagate a request/correlation identifier through HTTP/GraphQL handling, background jobs, provider calls, webhooks, automation, and notifications where practical.

#### Scenario: Diagnose failed automation
- **WHEN** an automation triggered from a webhook fails after a provider event
- **THEN** logs allow an operator to correlate webhook receipt, normalized event, automation execution, and failure using stable IDs/correlation data

### Requirement: Health/readiness separation
Liveness, readiness, dependency diagnostics, and product/business metrics SHALL be conceptually separate so orchestrators do not restart a healthy process solely because an optional external integration is unavailable.

#### Scenario: GitLab unavailable but core app healthy
- **WHEN** GitLab is unavailable but PostgreSQL/Redis/core server are healthy
- **THEN** liveness remains healthy
- **AND** readiness follows the documented policy for required dependencies
- **AND** integration health is reported as degraded separately.