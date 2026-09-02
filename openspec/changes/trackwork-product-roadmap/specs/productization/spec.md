# Capability: Productization

## ADDED Requirements

### Requirement: TrackWork product identity
Self-hosted user and administrator surfaces SHALL present a coherent TrackWork product identity without exposing confusing upstream-only branding in primary product flows.

#### Scenario: New self-hosted installation
- **WHEN** an administrator opens the product after installation
- **THEN** onboarding, authentication, admin, task, and workspace surfaces consistently identify the product as TrackWork

### Requirement: Installation onboarding
TrackWork SHALL provide an installation/onboarding flow or equivalent guided validation for required self-hosted configuration.

#### Scenario: Missing required configuration
- **WHEN** a required dependency or configuration value is unavailable during onboarding
- **THEN** the administrator receives an actionable validation error before completing setup

### Requirement: Health visibility
TrackWork SHALL expose health/status information for required dependencies and critical background subsystems.

#### Scenario: Redis unavailable
- **WHEN** Redis becomes unavailable
- **THEN** health status identifies the failing subsystem
- **AND** the product distinguishes degraded from fully ready state according to dependency criticality

### Requirement: Backup and restore
Supported self-hosted deployments SHALL document and verify backup and restore procedures for authoritative application data.

#### Scenario: Restore supported backup
- **GIVEN** a backup produced according to the documented procedure
- **WHEN** it is restored into a compatible TrackWork release
- **THEN** tasks, documents, workspace configuration, planning data, integrations metadata, and required relational state are recoverable according to the backup scope

### Requirement: Release and compatibility documentation
Every TrackWork release SHALL document version, migrations, compatibility notes, notable changes, and operator actions required for upgrade.

#### Scenario: Breaking operational change
- **WHEN** a release changes a required environment variable, dependency, or deployment procedure
- **THEN** release notes identify the change and migration/upgrade action before operators deploy it

### Requirement: Enterprise authentication integration boundaries
TrackWork SHOULD support self-hosted authentication integrations such as SMTP-backed account flows, OIDC/SSO, and directory integration through explicit configuration and permissions rather than product-specific hacks.

#### Scenario: OIDC enabled
- **WHEN** an administrator configures a supported OIDC provider
- **THEN** users can authenticate through the provider according to configured policy
- **AND** local workspace/TrackWork permissions remain enforced after authentication

### Requirement: Transparent telemetry
TrackWork-specific telemetry, if implemented, SHALL be documented and opt-in for self-hosted deployments.

#### Scenario: Fresh self-hosted install
- **WHEN** TrackWork is installed without an explicit telemetry choice enabling TrackWork-specific collection
- **THEN** TrackWork-specific telemetry is not transmitted