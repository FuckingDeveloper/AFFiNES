# Design: TrackWork Product Roadmap

## Purpose

This document maps the roadmap to the current AFFiNE/TrackWork codebase and defines architectural constraints for future implementation by human developers or coding agents such as Codex/DeepSeek.

The repository is brownfield. Implementations MUST inspect existing modules and extend established patterns before introducing parallel frameworks.

## Current codebase map

### Admin frontend

The current administrator application lives under:

- `packages/frontend/admin/src/app.tsx`
- `packages/frontend/admin/src/modules/dashboard/`
- `packages/frontend/admin/src/modules/settings/`
- `packages/frontend/admin/src/modules/accounts/`
- `packages/frontend/admin/src/modules/workspaces/`
- `packages/frontend/admin/src/modules/queue/`

The dashboard already queries aggregated analytics through `adminDashboardQuery`. `packages/frontend/admin/src/modules/dashboard/operations.tsx` additionally polls `/health/ready` and `/info`, displays PostgreSQL/Redis/server/build state, and renders `adminAuditLogsQuery` results.

`packages/frontend/admin/src/modules/settings/config.ts` maps server configuration descriptors into administrator settings. Existing groups include Server, Auth, Notification/SMTP, Storage, OAuth and AI. Sensitive inputs such as LDAP bind credentials, RADIUS secret, and SMTP passwords are already marked as sensitive at the UI configuration layer.

The roadmap SHALL extend these surfaces rather than creating a separate unrelated administration SPA.

### Admin/backend analytics

The server-side dashboard is implemented through the workspace admin resolver and workspace analytics model, principally:

- `packages/backend/server/src/core/workspaces/resolvers/admin.ts`
- `packages/backend/server/src/models/workspace-analytics.ts`

The self-hosted dashboard now invokes real `workspaceAnalytics.adminGetDashboard(...)` queries rather than being blocked as cloud-only. New system-health/control-plane data SHOULD NOT be forced into `WorkspaceAnalyticsModel` if it is operational state rather than workspace analytics. Prefer a dedicated operations/system-status service and GraphQL contract for dependency health, queues, migrations, encryption state, integrations and backups.

### Current Task Tracker client model

Task Tracker is currently heavily document/workspace-property based. Important implementation is under:

- `packages/frontend/core/src/desktop/pages/workspace/task-tracker/index.tsx`
- `packages/frontend/core/src/desktop/pages/workspace/task-tracker/config.ts`
- `packages/frontend/core/src/desktop/dialogs/setting/workspace-setting/task-tracker/`
- `packages/frontend/core/src/utils/task-tracker-i18n.ts`

`config.ts` defines the current persisted/property contract, including:

```ts
export const TASK_STATUS_PROPERTY = 'taskStatus';
export const TASK_PRIORITY_PROPERTY = 'taskPriority';
export const TASK_TYPE_PROPERTY = 'taskType';
export const TASK_ASSIGNEE_PROPERTY = 'taskAssignee';
export const TASK_DUE_DATE_PROPERTY = 'taskDueDate';
export const TASK_DESCRIPTION_PROPERTY = 'taskDescription';
export const TASK_ATTACHMENTS_PROPERTY = 'taskAttachments';
export const TASK_NUMBER_PROPERTY = 'taskNumber';
export const TASK_COMPLEXITY_PROPERTY = 'taskComplexity';
export const TASK_SUBTASKS_PROPERTY = 'taskSubtasks';
export const TASK_HISTORY_PROPERTY = 'taskHistory';
export const TASK_RELATED_DOCS_PROPERTY = 'taskRelatedDocs';
export const TASK_RELATIONS_PROPERTY = 'taskRelations';
```

Board/workflow configuration is similarly persisted as workspace-property additional data (`taskTrackerBoards`, flow, transitions, automation rules).

This is valid legacy state and MUST remain migration-compatible. However, it is not sufficient as the sole authority for future multi-user server-side planning, permissions, analytics, webhook processing and automation.

### Server TrackWork integration

The fork already contains server-side TrackWork behavior for task allocation/registry and development integrations, plus a provider-neutral SCM direction. Implementers SHALL search for the existing `@affine/trackwork` package, GraphQL operations such as `allocateTrackWorkTaskMutation`, `syncTrackWorkTasksMutation`, development integration queries/mutations, and SCM provider interfaces before adding new TrackWork backend modules.

The current architecture already bundles `@affine/trackwork` into the server production build; new shared domain types that are required by both frontend and backend MAY live there when they do not depend on frontend runtime APIs.

## Architectural principles

### 1. AFFiNE remains the workspace/document foundation

TrackWork SHALL extend the existing workspace, document, identity, permission, storage, synchronization and navigation concepts instead of duplicating them.

A normal AFFiNE document is a valid TrackWork workspace document even when it has zero task/planning metadata. Documentation SHALL remain usable without Task Tracker.

Do not introduce a separate `trackwork_document` table merely to represent ordinary pages. Add link tables/models only where TrackWork needs relationships that AFFiNE documents do not already represent.

### 2. Separate document-backed task representation from server authority incrementally

The existing implementation stores many task fields as document properties. A flag-day rewrite is prohibited.

Use a staged model:

1. **Legacy/current representation:** task documents and workspace properties remain readable/writable.
2. **Server index/registry:** server-side records may index identity, permissions, planning membership, normalized relationships and query-critical fields.
3. **Dual-write migration where needed:** new server-owned fields are written transactionally while compatibility adapters preserve old clients/data during a defined migration window.
4. **Authority declaration:** each field/domain must explicitly state whether the document property, server model, or external provider is authoritative.
5. **Retirement:** legacy properties are removed only after migration verification and an OpenSpec change.

Do not silently create two independent mutable copies of the same field.

A useful implementation pattern is an adapter boundary:

```ts
interface TaskRepository {
  getTask(workspaceId: string, taskId: string): Promise<Task>;
  updateTask(
    actor: Actor,
    workspaceId: string,
    taskId: string,
    patch: TaskPatch
  ): Promise<Task>;
}
```

The repository/service implementation may initially bridge AFFiNE document properties and new server records, but UI components should stop directly owning business authorization rules.

### 3. Stable task identity

Task keys such as `ABCD-123` are human-facing identifiers. Internal relationships SHALL use immutable IDs.

Do not use a mutable key as a database foreign key.

Recommended shape:

```ts
type TaskIdentity = {
  id: string;            // immutable internal ID
  workspaceId: string;
  number: number;        // immutable workspace sequence number
  key: string;           // derived/display value, e.g. ABCD-123
};
```

Renaming a workspace prefix must not corrupt relations, history, development links, API consumers or document backlinks.

### 4. Event-oriented integration boundary

Development providers, automation, notifications, audit history and analytics SHOULD consume normalized domain events rather than directly coupling to UI components.

Representative events:

```ts
type TrackWorkEvent =
  | { type: 'task.created'; taskId: string }
  | { type: 'task.updated'; taskId: string }
  | { type: 'task.transitioned'; taskId: string; from: string; to: string }
  | { type: 'task.assigned'; taskId: string; assigneeId: string | null }
  | { type: 'task.comment.created'; taskId: string; commentId: string }
  | { type: 'sprint.started'; sprintId: string }
  | { type: 'sprint.completed'; sprintId: string }
  | { type: 'scm.branch.created'; repositoryId: string; branch: string }
  | { type: 'scm.commit.pushed'; repositoryId: string; commitId: string }
  | { type: 'scm.merge_request.opened'; repositoryId: string; mrId: string }
  | { type: 'scm.merge_request.merged'; repositoryId: string; mrId: string }
  | { type: 'scm.pipeline.completed'; repositoryId: string; pipelineId: string }
  | { type: 'deployment.completed'; environmentId: string };
```

Real event envelopes SHALL additionally carry workspace/entity identifiers, actor identity where available, timestamp, event ID, causation/correlation ID, schema version, provider metadata and idempotency key for externally sourced events.

### 5. Transactional outbox for durable side effects

Do not publish critical automation/notification/webhook effects only from in-memory callbacks after a database mutation.

Where a task/planning mutation and an emitted domain event must not diverge, persist the state change and outbox event in the same database transaction. A worker can then deliver/process the event with retries and idempotency.

Pseudo-flow:

```ts
await db.$transaction(async tx => {
  const task = await updateTask(tx, input);
  await tx.domainEvent.create({
    data: {
      id: eventId,
      workspaceId,
      type: 'task.transitioned',
      entityId: task.id,
      payload,
    },
  });
});
```

External SCM/API calls SHALL occur after commit, never while holding the database transaction open.

### 6. Provider-neutral development model

GitLab is the first complete SCM provider but must not define the domain contract.

The provider abstraction SHOULD converge on explicit capabilities rather than one enormous interface where every provider throws `NotSupported`.

Example:

```ts
interface ScmProvider {
  readonly capabilities: {
    createBranch: boolean;
    createMergeRequest: boolean;
    pipelines: boolean;
    deployments: boolean;
  };

  listRepositories(ctx: ProviderContext): Promise<ScmRepository[]>;
  createBranch?(input: CreateBranchInput): Promise<ScmBranch>;
  createMergeRequest?(input: CreateMergeRequestInput): Promise<ScmMergeRequest>;
}
```

Provider-specific fields MAY be retained in metadata but must not leak into core task behavior unless explicitly gated by provider capability checks.

### 7. Permissions are capability-based and server-side

TrackWork SHALL define permissions separately for viewing/creating/editing/transitioning/archiving tasks, workflow administration, planning administration, integration management, SCM actions, automation, analytics and system administration.

Workspace administrator status may imply all workspace permissions, but implementation SHOULD avoid scattering `isAdmin` checks through React components and resolvers.

Preferred pattern:

```ts
await permissions.require(actor, {
  workspaceId,
  capability: 'task.transition',
  resourceId: taskId,
});
```

Object lookup and authorization ordering must prevent IDOR. A resolver/service must not fetch and return an object from another workspace merely because its ID is valid.

### 8. Security boundary and input validation

High-risk surfaces in this fork include GraphQL/admin APIs, document/task inputs rendered as HTML, URL/integration configuration, file attachments, webhooks, SCM provider APIs, authentication configuration, storage endpoints and AI/provider endpoints.

Rules:

- use Prisma/parameterized queries; raw SQL must interpolate only through Prisma-safe parameter binding, never string concatenation of untrusted values;
- never construct GraphQL query source from user input;
- validate and canonicalize URLs before server-side requests;
- apply explicit outbound-network/SSRF policy to configurable endpoints;
- authorize blob/file access by workspace/document relationship, not possession of an opaque ID alone;
- escape/sanitize rendered user content according to the rendering context;
- keep pagination and query complexity bounded;
- compare webhook signatures using established constant-time-safe library primitives;
- persist webhook delivery IDs/idempotency keys before performing side effects.

### 9. Quorum-controlled envelope encryption

The requested target is a 2-of-3 administrator unlock policy. Do not implement this as "store three passwords and accept any two".

Use an established threshold secret sharing implementation (e.g. Shamir Secret Sharing from a mature cryptographic library) around a random key-encryption key (KEK), combined with standard authenticated envelope encryption.

Conceptual hierarchy:

```text
Administrator shares (2 of 3)
          │
          └── reconstruct KEK in process memory
                        │
                        └── unwrap random DEK
                                  │
                                  └── AEAD-encrypt designated secrets/data
```

Recommended primitives/design constraints:

- random 256-bit DEK generated using the runtime CSPRNG;
- AES-256-GCM or XChaCha20-Poly1305 through a mature library for protected values;
- versioned envelope `{version, algorithm, keyId, nonce, ciphertext, tag}`;
- KEK split using a mature threshold-secret-sharing library into 3 shares, threshold 2;
- administrator shares delivered/exported outside the database and never persisted server-side in plaintext;
- reconstructed KEK and unwrapped DEK exist only in memory for the unlocked process lifetime and must be zeroized where the runtime/library reasonably allows;
- Redis SHALL NOT contain KEK/DEK/shares;
- restart returns to locked state unless a future separately specified HSM/KMS auto-unlock mode is introduced;
- unlocking must bind approvals to one short-lived unlock ceremony ID to prevent replaying an old approval into a new startup;
- share rotation re-encrypts/wraps key metadata without unnecessarily decrypting/re-encrypting all protected records when envelope encryption allows DEK re-wrapping.

Do not write bespoke implementations of Shamir arithmetic, AES, ChaCha, KDF or RNG.

### 10. Locked-mode service graph

Encryption cannot simply throw during bootstrap before the admin app is reachable. Bootstrap SHALL distinguish core locked-mode dependencies from protected services.

Allowed while locked SHOULD be limited to:

- liveness/basic readiness,
- static web/admin assets,
- authentication/session functions required to identify quorum administrators,
- unlock ceremony APIs,
- sanitized version/system status,
- audit recording that does not require protected secrets.

Protected provider jobs, SCM actions, SMTP requiring encrypted credentials, external webhooks requiring secrets, AI providers and secret-backed integrations SHALL remain paused/fail closed.

Implementers SHOULD represent lock state as a service rather than a global boolean:

```ts
interface EncryptionStateService {
  readonly state: 'disabled' | 'locked' | 'unlocked';
  requireUnlocked(): void;
  withKey<T>(fn: (key: Uint8Array) => Promise<T>): Promise<T>;
}
```

### 11. Admin control plane is separate from workspace analytics

The existing `adminDashboard` focuses on sync/storage/shared-link/Copilot analytics. Keep that responsibility coherent.

Add a dedicated system operations contract, for example:

```graphql
type AdminSystemStatus {
  version: String!
  uptimeSeconds: SafeInt!
  encryptionState: EncryptionState!
  postgres: DependencyStatus!
  redis: DependencyStatus!
  storage: DependencyStatus!
  migrations: MigrationStatus!
  queues: [QueueStatus!]!
  integrations: [IntegrationStatus!]!
  observability: ObservabilityStatus!
  backup: BackupStatus
}

extend type Query {
  adminSystemStatus: AdminSystemStatus!
}
```

Exact GraphQL naming may follow repository conventions, but the separation between operational status and usage analytics SHOULD remain.

Admin UI SHOULD extend existing `packages/frontend/admin/src/modules/dashboard` and `settings` modules. Do not duplicate settings in a TrackWork-only control panel unless a setting is truly TrackWork-specific.

### 12. Configuration secrets are write-only from UI perspective

Current admin settings already mark several inputs as `sensitive`. Extend this contract server-side so APIs do not return existing secret plaintext.

Preferred API semantics:

```ts
type SecretConfigView = {
  configured: boolean;
  source: 'env' | 'database' | 'none';
};
```

Saving an empty/masked field must not accidentally erase a secret. Explicit replace/clear actions should be distinguishable.

High-impact config changes SHOULD support validation/test before activation where feasible.

### 13. Archive over destructive deletion

Tasks, planning objects, automation rules and development links SHOULD be archived/soft-deleted where historical references matter. Hard deletion should be reserved for administrative cleanup and privacy requirements.

Archived entities must continue to resolve from historical activity/backlinks according to permission policy.

### 14. Localization is presentation, not stored default text

System-defined labels SHALL use stable identifiers and translation keys. User-authored names SHALL remain unchanged. The system must not persist localized strings as identifiers.

The current `task-tracker-i18n.ts` compatibility behavior for canonical `Main board`, `To Do`, `In Progress`, and `Done` is an acceptable migration bridge, not a desired long-term domain identifier scheme.

### 15. Analytics derived from durable facts

Operational/product analytics SHALL derive from domain records/events rather than frontend telemetry. Aggregation tables MAY be introduced for performance, but they must be rebuildable/reconcilable from authoritative data where feasible.

Do not reuse Prometheus operational metrics as the authoritative source for product analytics; Prometheus data may expire/downsample and is intended for operations.

### 16. Brownfield migration safety

Every schema or persistence change SHALL define migration behavior, compatibility with existing workspaces/tasks, rollback or forward-fix strategy, partially migrated deployment behavior and production-image test coverage.

For task-domain migration, fixtures MUST include legacy task documents with existing JSON-string properties for attachments, subtasks, history, related docs and relations, plus custom boards/stages/transitions.

## Proposed domain boundaries

### Task domain

Owns stable task identity, task mutable fields, archive state, checklist/subtasks, comments, watchers, relations, attachments and durable activity.

During migration it may adapt to legacy AFFiNE document properties.

### Planning domain

Owns backlog membership, sprint, epic, release/version, milestone, estimate/story points, roadmap placement and sprint lifecycle.

### Knowledge-link domain

Owns explicit TrackWork relationships between ordinary AFFiNE documents and tasks/planning entities: task references, backlinks, embedded task blocks, related documents and action-item provenance.

It does **not** own ordinary document creation/content/navigation.

### Development domain

Owns SCM connections, repositories, normalized development artifacts, task associations, provider actions, webhook ingestion and deployment/environment state.

### Automation domain

Owns triggers, conditions, actions, execution records, idempotency, retries and guardrails.

### Notification domain

Owns inbox items, user subscriptions/watchers, read state, delivery preferences, aggregation/deduplication and channel dispatch.

### Analytics domain

Owns product flow metrics, sprint metrics, workload, overdue/blocked state and engineering lifecycle metrics.

### Operations/observability domain

Owns system/dependency health, metrics exposure, structured operational events, queue/job status, migration status, backup status and sanitized diagnostics.

### Security/crypto domain

Owns protected-value encryption, key/envelope versions, encryption state, unlock ceremonies, quorum-share metadata (never plaintext shares), rotations and security audit events.

## Observability design

### Prometheus

Expose a Prometheus scrape endpoint following existing server routing/metrics conventions rather than embedding metric calculations into admin React code.

Avoid high-cardinality labels such as task ID, document title, email, full URL or exception message.

Good:

```text
trackwork_webhook_total{provider="gitlab",result="success"} 123
trackwork_webhook_total{provider="gitlab",result="failure"} 4
trackwork_automation_execution_total{result="failure"} 2
```

Bad:

```text
trackwork_task_request_total{task_id="a-million-different-values"} ...
```

Use histograms for latency where actionable and counters/gauges for event/failure/queue state.

### Logs

Use structured JSON (or the repository's structured logger abstraction producing equivalent fields). Container stdout is the default transport. Deployment documentation SHALL show collection patterns for:

- Grafana Loki via Grafana Alloy/Promtail-compatible agents;
- Elasticsearch/OpenSearch via Vector/Fluent Bit/Logstash/Data Prepper-style collectors;
- optional OTLP when implemented.

TrackWork should not implement a Loki client and an Elasticsearch client directly in every feature. Emit structured logs once; let an agent/collector route them. OTLP MAY provide a standardized direct export later.

Example event:

```json
{
  "level": "error",
  "service": "trackwork-server",
  "event": "scm.webhook.process.failed",
  "provider": "gitlab",
  "workspaceId": "...",
  "correlationId": "...",
  "errorClass": "ProviderUnavailable"
}
```

Never include webhook secret, access token, authorization header, quorum share, decrypted config secret or task/document body.

### Tracing

Distributed tracing is optional for the first stability phase but the correlation model SHOULD be OpenTelemetry-compatible so later OTLP traces can connect request → DB/job → SCM → automation → notification paths.

## Security verification design

Security testing SHALL combine code scanning and executable authorization tests. A scanner cannot prove object-level authorization.

Recommended CI/release categories:

```text
lint/typecheck/unit
        │
        ├── dependency audit / lockfile vulnerability scan
        ├── secret scan
        ├── SAST/security rules
        ├── container image vulnerability scan
        └── security integration suite
              ├── IDOR / cross-workspace access
              ├── role/capability escalation
              ├── SSRF policy
              ├── file/blob authorization
              ├── webhook replay/signature
              ├── XSS rendering regression
              └── bounded GraphQL/API requests
```

Testing SHOULD exercise both direct GraphQL/API calls and UI paths for critical operations; hiding a button is not an authorization test.

## UI strategy

Primary surfaces:

- normal AFFiNE documentation/navigation,
- workspace Task Tracker,
- backlog/planning view,
- task detail panel/document,
- document task references/blocks,
- Development section on tasks,
- workspace Development Center,
- unified Inbox,
- workspace analytics/report pages,
- workspace settings for workflow/integrations/automation,
- expanded administrator dashboard/settings/security/operations surfaces.

Complex capabilities SHOULD be introduced behind feature flags until migrations, security and permission behavior are verified.

## Testing strategy

Every capability requires an appropriate mix of model/service unit tests, GraphQL/API contract tests, migration tests, self-hosted e2e tests, browser interaction tests, provider adapter tests using stubbed/recorded payloads, security regression tests and production Docker smoke tests.

At minimum, release gating SHALL verify:

- clean self-hosted install;
- upgrade from previous supported version;
- preservation of legacy TrackWork property-backed tasks/workflows;
- server-side permission denial independent of UI;
- no cross-workspace IDOR for newly introduced objects;
- production image starts in locked mode when quorum encryption is enabled;
- two distinct shares unlock and one share does not;
- key/share/secret data never appears in API responses/log fixtures;
- observability endpoint/log behavior remains usable in self-hosted deployment.

## Implementation-agent guidance

When Codex/DeepSeek implements a task from this roadmap it SHALL:

1. inspect the referenced existing modules before coding;
2. search for an existing service/model/provider abstraction before introducing a new one;
3. state the authoritative persistence source for every new mutable field;
4. implement server-side permission checks before wiring UI controls;
5. include migration/compatibility handling for legacy property-backed TrackWork data where affected;
6. add GraphQL `.gql` documents and run the repository's GraphQL codegen rather than manually editing generated exports;
7. avoid modifying generated files by hand when a generator exists;
8. add tests covering success, permission failure and relevant security/duplicate/retry cases;
9. add EN/RU strings through established i18n patterns;
10. emit structured operational logs/metrics for new background/integration behavior;
11. never invent cryptographic primitives;
12. document significant implementation deviations back into OpenSpec.

## Risks and mitigations

### Risk: server-domain migration breaks AFFiNE sync semantics
Mitigation: incremental adapter/dual-write migration, legacy fixtures and no flag-day task rewrite.

### Risk: quorum unlock makes service operationally unrecoverable
Mitigation: 2-of-3 threshold, tested share replacement, recovery rehearsal, explicit locked mode, versioned key envelopes and documented break-glass/recovery policy before production enablement.

### Risk: admin panel becomes a dumping ground
Mitigation: separate usage analytics, system operations, security, settings and audit concepts while sharing the existing admin application/navigation.

### Risk: observability leaks sensitive workspace data
Mitigation: fixed low-cardinality metric labels, structured sanitized log schema and automated secret/log tests.

### Risk: GitLab-specific semantics contaminate tasks
Mitigation: capability-aware provider normalization and provider metadata at integration boundary only.

### Risk: coding agents implement specs literally but inconsistently with repository conventions
Mitigation: explicit codebase mapping, implementation sketches, referenced paths, generator rules, tests and requirement that agents inspect existing abstractions first.