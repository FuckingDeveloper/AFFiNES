# Design: TrackWork Product Roadmap

## Architectural principles

### 1. AFFiNE remains the workspace/document foundation

TrackWork SHALL extend the existing workspace, document, identity, permission, storage, and synchronization concepts instead of duplicating them. New TrackWork entities should reference workspace/document/user identifiers already used by AFFiNE wherever practical.

### 2. TrackWork domain logic must not live only in UI metadata

The current task tracker originated from workspace properties and document metadata. Future planning, relations, automation, notifications, development events, and analytics require stable server-side domain boundaries.

New persistent capabilities SHOULD use explicit backend models/services and typed GraphQL/API contracts when they need any of the following:

- cross-user consistency,
- permissions,
- audit history,
- transactional updates,
- webhooks/integrations,
- reporting,
- large-scale querying.

Client-side workspace properties may remain appropriate for lightweight view configuration such as board presentation preferences.

### 3. Stable task identity

Task keys such as `ABCD-123` are human-facing identifiers. Internal relationships SHALL use immutable IDs. Renaming a workspace prefix must not corrupt relationships, history, development links, or API consumers.

### 4. Event-oriented integration boundary

Development providers, automation, notifications, audit history, and analytics SHOULD consume normalized domain events rather than directly coupling to UI components.

Representative events:

- task.created
- task.updated
- task.transitioned
- task.assigned
- task.comment.created
- sprint.started
- sprint.completed
- scm.branch.created
- scm.commit.pushed
- scm.merge_request.opened
- scm.merge_request.merged
- scm.pipeline.completed
- deployment.completed

Events SHALL carry workspace and entity identifiers, actor identity where available, provider metadata, timestamp, and an idempotency key when sourced externally.

### 5. Provider-neutral development model

GitLab is the first complete SCM provider but must not define the domain contract. Provider adapters SHALL normalize repository, branch, commit, merge request/pull request, pipeline/check, deployment, and environment data.

Provider-specific fields MAY be retained in metadata but must not leak into core task behavior unless explicitly gated by provider capability checks.

### 6. Permissions are capability-based

TrackWork SHALL define permissions separately for:

- viewing tasks,
- creating tasks,
- editing task fields,
- transitioning tasks,
- deleting/archiving tasks,
- configuring workflows,
- managing planning objects,
- managing integrations,
- creating SCM branches/MRs,
- managing automation,
- viewing analytics.

Workspace administrator status may imply all permissions, but implementation should avoid scattering `isAdmin` checks throughout components.

### 7. Archive over destructive deletion

Tasks, planning objects, automation rules, and development links SHOULD be archived or soft-deleted where historical references matter. Hard deletion should be reserved for administrative cleanup and privacy requirements.

### 8. Localization is presentation, not stored default text

System-defined labels SHALL use stable identifiers and translation keys. User-authored names SHALL remain unchanged. The system must not persist localized strings as identifiers.

### 9. Analytics derived from durable facts

Operational analytics SHALL derive from domain records/events rather than frontend telemetry. Aggregation tables MAY be introduced for performance, but they must be rebuildable from authoritative data where feasible.

### 10. Brownfield migration safety

Every schema or persistence change SHALL define:

- migration behavior,
- compatibility with existing workspaces/tasks,
- rollback or forward-fix strategy,
- handling of partially migrated deployments,
- production-image test coverage.

## Proposed domain boundaries

### Task domain

Owns task identity, title, description, type, priority, complexity, assignee, labels, due date, status/stage, archive state, checklist/subtasks, comments, watchers, relations, attachments, and activity.

### Planning domain

Owns backlog membership, sprint, epic, release/version, milestone, estimate/story points, roadmap placement, and sprint lifecycle.

### Knowledge-link domain

Owns task/document references, backlinks, embedded task blocks, related documents, action-item provenance, and document associations with epics/sprints/releases.

### Development domain

Owns SCM connections, repositories, normalized development artifacts, task associations, provider actions, webhook ingestion, and deployment/environment state.

### Automation domain

Owns triggers, conditions, actions, execution records, idempotency, retries, and guardrails.

### Notification domain

Owns inbox items, user subscriptions/watchers, read state, delivery preferences, aggregation/deduplication, and channel dispatch.

### Analytics domain

Owns flow metrics, sprint metrics, workload, overdue/blocked state, engineering lifecycle metrics, and admin operational metrics.

## Data consistency

Cross-domain writes that must be atomic SHALL be implemented server-side in one transaction where possible. External provider calls SHALL not be part of database transactions; instead use a request/outbox/result pattern or equivalent durable state machine.

Webhook processing SHALL be idempotent. Duplicate GitLab/GitHub events must not create duplicate activity, automation transitions, or notifications.

## UI strategy

TrackWork should continue to feel native to AFFiNE rather than embedded as a foreign application.

Primary surfaces:

- workspace Task Tracker,
- backlog/planning view,
- task detail panel/document,
- document task references/blocks,
- Development section on tasks,
- workspace Development Center,
- unified Inbox,
- workspace analytics/report pages,
- workspace settings for workflow/integrations/automation.

Complex capabilities SHOULD be introduced behind feature flags until migrations and permission behavior are verified.

## Testing strategy

Every capability requires an appropriate mix of:

- model/service unit tests,
- GraphQL/API contract tests,
- migration tests,
- self-hosted e2e tests,
- browser interaction tests for critical workflows,
- provider adapter tests using recorded/stubbed API payloads,
- production Docker smoke tests.

At minimum, release gating SHALL verify that a clean self-hosted install and an upgrade from the previous supported version both start successfully and preserve tasks/workflow configuration.

## Observability

Server-side TrackWork operations SHOULD produce structured logs containing workspace ID, task/planning entity ID, operation name, result, provider where relevant, and correlation/request ID. Secrets, access tokens, document contents, and sensitive user text must not be logged.

Metrics should cover failed webhook processing, automation failures/retries, provider API failures, notification dispatch failures, migration failures, and task allocation conflicts.