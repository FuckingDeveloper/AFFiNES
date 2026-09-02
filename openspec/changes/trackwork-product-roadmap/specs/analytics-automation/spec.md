# Capability: Analytics, API, and Automation

## ADDED Requirements

### Requirement: Flow analytics
TrackWork SHALL provide task-flow analytics derived from durable task lifecycle facts.

#### Scenario: Calculate cycle time
- **GIVEN** a task has durable timestamps/events for entering and leaving configured active-work states
- **WHEN** cycle time is calculated
- **THEN** the result is reproducible from persisted facts
- **AND** changing the current board view does not rewrite historical measurements

### Requirement: Sprint analytics
TrackWork SHALL provide sprint metrics only from durable sprint membership and lifecycle history.

#### Scenario: Show burndown
- **WHEN** an active or completed sprint has estimated work and historical scope/status events
- **THEN** TrackWork can render a burndown based on those recorded facts

### Requirement: Engineering lifecycle analytics
TrackWork SHOULD calculate engineering metrics from normalized task and development events, including task-to-branch, task-to-merge-work, merge-to-deploy, deployment frequency, and pipeline failure rate where source data is available.

#### Scenario: Merge-to-deploy duration
- **GIVEN** a merged development artifact and a later normalized production deployment associated with the same work
- **WHEN** lifecycle analytics are generated
- **THEN** TrackWork can calculate the elapsed duration without relying on provider-specific UI state

### Requirement: Rebuildable aggregates
Performance-oriented analytics aggregates SHALL be reconcilable with durable source facts.

#### Scenario: Rebuild analytics table
- **WHEN** an administrator rebuilds or migrates an aggregate table
- **THEN** the resulting metrics can be regenerated from supported authoritative records/events within documented retention limits

### Requirement: Stable external API boundary
TrackWork SHALL expose versioned or compatibility-managed API contracts for supported external automation use cases.

#### Scenario: API client reads task
- **WHEN** an authenticated client with appropriate scope requests a task by immutable ID or supported human key
- **THEN** the server returns a documented representation
- **AND** permissions are equivalent to interactive access rules

### Requirement: Scoped automation credentials
External API credentials SHALL be scoped and revocable and SHALL not implicitly grant administrator access.

#### Scenario: Revoke token
- **WHEN** an administrator revokes an API token
- **THEN** subsequent requests using that token are rejected
- **AND** existing task/history data created through the token remains attributed to an identifiable automation principal where applicable

### Requirement: Outgoing webhooks
TrackWork SHALL support signed outgoing webhook deliveries with retry history and delivery observability.

#### Scenario: Webhook receiver temporarily fails
- **WHEN** a configured endpoint returns a retryable failure
- **THEN** TrackWork retries according to policy
- **AND** records delivery attempts and final state

### Requirement: Automation rule model
Automation SHALL be represented as trigger, conditions, and actions rather than hard-coded provider-specific transitions.

#### Scenario: Move task when MR merges
- **GIVEN** a rule triggered by normalized merge-work merged event and matching task conditions
- **WHEN** an associated merge request or pull request is merged
- **THEN** the configured transition action executes if allowed by workflow rules
- **AND** the execution is recorded

### Requirement: Automation idempotency and loop protection
Automation execution SHALL be idempotent for duplicate source events and SHALL prevent uncontrolled self-triggering loops.

#### Scenario: Duplicate external event
- **WHEN** the same normalized event is processed twice
- **THEN** an automation action with the same rule/event idempotency identity executes at most once

#### Scenario: Rule changes field that triggers another rule
- **WHEN** automation-generated changes produce additional eligible events
- **THEN** the engine applies documented recursion/loop limits
- **AND** records when execution is suppressed for safety