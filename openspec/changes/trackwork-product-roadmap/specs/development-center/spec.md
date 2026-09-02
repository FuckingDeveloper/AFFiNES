# Capability: Development Center

## ADDED Requirements

### Requirement: Provider-neutral SCM contract
TrackWork SHALL expose development data through a provider-neutral domain contract rather than coupling task behavior directly to GitLab-specific payloads.

#### Scenario: Render GitLab and GitHub merge work
- **GIVEN** one task linked to a GitLab merge request and another linked to a GitHub pull request
- **WHEN** their Development sections render
- **THEN** both are represented through the same core merge-work model
- **AND** provider-specific fields are shown only where supported

### Requirement: Repository tracking
Workspace administrators SHALL be able to connect supported SCM providers and choose repositories TrackWork tracks.

#### Scenario: Track repository
- **WHEN** an administrator enables a repository on an authenticated connection
- **THEN** TrackWork persists the repository identity and provider capability metadata
- **AND** eligible webhook/development events can be associated with workspace tasks

### Requirement: Task development summary
A task SHALL expose associated branches, commits, merge requests/pull requests, pipelines/checks, deployments, environments, and normalized activity where available.

#### Scenario: Merge request linked by task key
- **WHEN** a provider event contains an unambiguous TrackWork task key according to configured matching rules
- **THEN** the development artifact is associated with that task idempotently
- **AND** the task Development section reflects the artifact

### Requirement: Development actions
Authorized users SHALL be able to invoke supported provider actions such as creating a branch or merge request from a task.

#### Scenario: Create branch from task
- **WHEN** an authorized user selects repository and base branch and submits a valid branch name
- **THEN** TrackWork invokes the provider adapter
- **AND** records the created branch association on success
- **AND** reports provider failure without corrupting task state

### Requirement: Workspace Development Center
TrackWork SHALL provide a workspace-level Development Center aggregating tracked repositories and normalized development activity.

#### Scenario: View active development
- **WHEN** a user opens Development Center
- **THEN** the user can inspect accessible repositories, recent merge work, pipeline state, deployments, and task associations
- **AND** provider outages are isolated from unrelated repositories/providers where possible

### Requirement: Idempotent webhook processing
External development events SHALL be processed idempotently and tolerate duplicate or retried deliveries.

#### Scenario: Duplicate webhook
- **WHEN** the same provider event is delivered twice with the same provider delivery/event identity
- **THEN** TrackWork does not duplicate activity entries, task transitions, automation executions, or notifications

### Requirement: Replay and recovery
Administrators SHOULD be able to inspect failed webhook/provider event processing and retry safe processing after correcting configuration.

#### Scenario: Retry failed event
- **GIVEN** a webhook failed because the provider connection was temporarily unavailable
- **WHEN** an administrator retries the event after recovery
- **THEN** processing resumes idempotently
- **AND** the original failure and retry outcome remain observable