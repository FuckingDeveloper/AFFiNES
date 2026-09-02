# Capability: Administrator Control Plane

## ADDED Requirements

### Requirement: Expanded system health dashboard
The self-hosted administrator dashboard SHALL expose actionable operational state rather than only aggregate product usage metrics.

The dashboard SHOULD include at minimum:

- application version/build and deployment type,
- startup/uptime and encryption lock state,
- PostgreSQL connectivity and latency,
- Redis connectivity and latency,
- storage provider status and capacity/usage where available,
- migration/schema state,
- background queue/job health,
- mailer health and last test/send result,
- configured SCM provider health,
- webhook processing health,
- automation execution health,
- notification dispatch health,
- recent critical/warning events,
- backup freshness/status when TrackWork manages or can inspect backup metadata,
- outbound observability/export status.

#### Scenario: Dependency degraded
- **WHEN** Redis is reachable but latency/error rate exceeds the configured health threshold
- **THEN** the dashboard reports Redis as degraded rather than healthy
- **AND** exposes a safe diagnostic summary without leaking credentials

### Requirement: Dependency diagnostics
Administrators SHALL be able to run safe, bounded diagnostic checks for supported dependencies and integrations.

#### Scenario: Test SMTP configuration
- **WHEN** an administrator runs the mailer test
- **THEN** the result reports success/failure and sanitized diagnostic detail
- **AND** SMTP credentials are never returned to the browser or logs

### Requirement: Configuration visibility
The admin panel SHALL distinguish effective runtime configuration, configurable values, environment-controlled values, defaults, and secrets.

#### Scenario: View secret-backed setting
- **WHEN** an administrator views settings containing a password/token/secret
- **THEN** the UI indicates whether a value is configured
- **AND** never exposes the existing secret plaintext
- **AND** replacing the secret requires an explicit new value

### Requirement: Configuration change safety
High-impact settings SHALL support validation and, where feasible, test-before-save or staged activation.

Examples include authentication mode, LDAP/RADIUS/OIDC, SMTP, storage, external URL/hosts, SCM providers, webhooks, encryption settings, observability endpoints, and proxy/network policy.

#### Scenario: Invalid storage endpoint
- **WHEN** an administrator attempts to save an invalid/unreachable storage configuration
- **THEN** TrackWork either rejects the change before activation or records it as pending/failed without destroying the previously working configuration

### Requirement: Security status section
The admin panel SHALL expose security posture information including:

- encryption lock/unlock state,
- quorum setup completeness,
- date/time of last key rotation,
- configured authentication mode,
- recent failed/suspicious admin authentication/unlock events,
- security-policy status,
- release/build security scan metadata when available,
- secret/configuration warnings.

It SHALL NOT expose administrator shares, encryption keys, access tokens, or other secrets.

### Requirement: Unlock ceremony UI
When quorum encryption is enabled, the admin control plane SHALL provide the minimum UI/API needed for independent administrators to participate in a startup unlock ceremony.

#### Scenario: Unlock progress
- **GIVEN** a locked server with a 2-of-3 quorum policy
- **WHEN** an administrator opens the unlock page
- **THEN** the UI shows the current ceremony identifier, required threshold, and number of distinct valid approvals
- **AND** does not reveal other administrators' key material

### Requirement: Audit log maturity
The administrator audit log SHALL cover all privileged control-plane changes and provide filtering/search by actor, action category, target, result, and time range.

#### Scenario: Authentication mode changed
- **WHEN** an administrator changes the authentication method
- **THEN** the audit record contains actor, timestamp, old/new non-secret configuration summary, target subsystem, and result

### Requirement: Operations and queue visibility
The admin panel SHOULD expose bounded visibility into background jobs, webhook processing, integration retries, notification delivery, and automation failures.

#### Scenario: Repeated failed webhook delivery
- **WHEN** a webhook/integration event repeatedly fails
- **THEN** an administrator can see failure count, sanitized reason, last attempt, next retry/dead-letter state, and correlation identifier

### Requirement: Observability configuration
Administrators SHALL be able to view and configure supported observability export behavior without editing application source code.

Supported design targets SHOULD include:

- Prometheus-compatible metrics scraping,
- structured stdout/file logging for agent collection,
- optional OTLP log/trace export where implemented,
- documented compatibility with Loki/Promtail/Grafana Alloy and ELK/OpenSearch-style pipelines.

### Requirement: Backup and restore status
The admin panel SHOULD expose last known backup status and restore readiness when the deployment uses supported backup tooling.

The panel SHALL NOT imply backups are valid unless a verifiable backup operation has actually occurred.

### Requirement: Maintenance mode
TrackWork SHOULD support an administrator-controlled maintenance mode for migrations, recovery, key rotation, and disruptive configuration work.

#### Scenario: Maintenance mode enabled
- **WHEN** maintenance mode is activated
- **THEN** normal state-changing user operations are rejected or paused according to policy
- **AND** administrators retain access to required diagnostics/recovery functions
- **AND** the mode is visibly indicated to users and administrators.