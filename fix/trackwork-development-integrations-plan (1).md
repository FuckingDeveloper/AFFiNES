# TrackWork Development Integrations — Implementation Plan

## Context

We are working in an AFFiNE fork based on the `develop` branch.

A custom task-management subsystem named **TrackWork** already exists in the application.

Recent work already addressed:

- the Admin Dashboard white-screen issue in self-hosted deployments;
- most of the TrackWork localization/i18n issues.

The next development stage is to add practical product features to TrackWork that improve day-to-day software-development workflows.

The first major feature is **GitLab integration**, but the implementation must be designed as a generic SCM/development integration layer so that GitHub, Gitea, Forgejo and other providers can be added later without rewriting the TrackWork data model.

---

# 1. Primary goal

Implement a **Development Integration layer for TrackWork**.

A TrackWork task should be able to show development activity related to it:

- commits;
- branches;
- merge requests;
- CI pipeline status;
- development activity timeline.

Example task:

```text
TW-142 — Fix refresh token race

Development

Repository
backend/auth-service

Branch
feature/TW-142-refresh-token

Commits
a83f1d2  Fix refresh token race
b91ec33  Add regression tests

Merge Request
!318 Fix refresh token handling
Status: Open

Pipeline
#8142 Passed

```

Developers should be able to reference a TrackWork task from GitLab by using its stable task key:

```text
TW-142
```

Examples:

```text
TW-142 Fix refresh token race
```

```text
fix(auth): handle expired session [TW-142]
```

```text
feature/TW-142-refresh-token
```

The GitLab integration must detect the task key and automatically associate the GitLab entity with the TrackWork task.

---

# 2. Important architecture requirement

## Do NOT build the feature as GitLab-specific TrackWork logic

GitLab is only the first provider.

Create a generic development integration model.

Preferred conceptual structure:

```text
DevelopmentIntegration
├── SCMProvider
│   ├── GitLab
│   ├── GitHub       # future
│   ├── Gitea        # future
│   └── Forgejo      # future
│
├── CIProvider
│   ├── Jenkins
│   ├── GitLab CI    # future / optional
│   ├── GitHub Actions
│   └── Generic CI webhook/API
│
├── Repository
├── Commit
├── Branch
├── MergeRequest
├── Pipeline
└── DevelopmentEvent
```

SCM and CI integrations must be independent.

Examples:

```text
GitLab + Jenkins
GitHub + Jenkins
Gitea + Jenkins
GitLab + GitLab CI
GitHub + GitHub Actions
```

Provider-specific code must be isolated.

For example:

```ts
interface ScmProvider {
  verifyWebhook(...): Promise<boolean>;
  parseWebhook(...): Promise<DevelopmentEvent[]>;
  getRepository(...): Promise<RepositoryInfo>;
  getMergeRequest(...): Promise<MergeRequestInfo>;
}

interface CiProvider {
  verifyWebhook(...): Promise<boolean>;
  parseWebhook(...): Promise<PipelineEvent[]>;
  getPipeline(...): Promise<PipelineInfo>;
}
```

The exact interfaces may differ depending on the existing AFFiNE architecture, but SCM and CI must remain separate abstractions.

Avoid code like:

```ts
if (provider === 'gitlab') {
  // hundreds of lines of TrackWork-specific GitLab behavior
}
```

Prefer:

```text
TrackWork domain
        ↑
Development Integration service
        ↑
Provider adapter
        ↑
GitLab
```

---

# 2.1 Explicit non-goal

Do NOT implement Deployments / Environments tracking in this project.

TrackWork V1 must stop at source-code activity and CI pipeline status.

Deployment/environment concepts should not be added to the database schema, UI, webhook model or automation model unless explicitly requested later.

---

# 3. Phase 0 — inspect the existing TrackWork implementation

Before changing code, inspect the existing implementation.

Determine:

- where TrackWork tasks are stored;
- how task IDs are generated;
- current board/task schema;
- GraphQL schema and resolvers;
- frontend state/data access;
- existing activity/event system;
- existing integrations architecture in AFFiNE;
- existing webhook infrastructure;
- existing feature/configuration system;
- existing encryption/secrets storage;
- existing permission model;
- existing workspace settings UI.

Do not invent parallel infrastructure if AFFiNE already provides an equivalent abstraction.

Document the findings before implementing the feature.

---

# 4. Stable TrackWork task keys

TrackWork needs human-readable stable task keys.

Example:

```text
TW-1
TW-2
TW-142
```

## Requirements

Each TrackWork task must have:

```ts
id: UUID
key: string
```

Example:

```json
{
  "id": "a64d0d8c-...",
  "key": "TW-142"
}
```

The internal UUID remains the primary database identity.

The human-readable key is used for:

- UI;
- URLs when appropriate;
- commit references;
- branch names;
- merge request titles/descriptions;
- external integrations.

## Key properties

A key must be:

- unique within the relevant TrackWork scope;
- immutable after creation;
- safe to parse;
- case-insensitive when matching external references.

Do not use the task title as an identifier.

## Prefix

Initially the default prefix can be:

```text
TW
```

If TrackWork already has a project concept, consider making the prefix project-specific later.

Do not over-engineer project-specific prefixes in V1 unless the current model already supports them naturally.

---

# 5. Task reference parser

Create a reusable parser for TrackWork task references.

It should detect references such as:

```text
TW-142
[TW-142]
(TW-142)
fix: TW-142 refresh auth
feature/TW-142-refresh-auth
```

It should avoid obvious false positives.

The parser must be reusable for:

- commit messages;
- branch names;
- merge request titles;
- merge request descriptions;
- pipeline metadata;


Do not duplicate regex logic across webhook handlers.

Example conceptual API:

```ts
extractTrackWorkKeys(text: string): string[]
```

Return normalized keys:

```ts
["TW-142", "TW-151"]
```

A single GitLab object may reference multiple TrackWork tasks.

---

# 6. Development integration data model

Create a provider-neutral data model.

Suggested entities/concepts:

## Integration connection

```ts
DevelopmentIntegrationConnection
```

Possible fields:

```text
id
workspaceId
provider
name
baseUrl
externalAccountId
createdBy
createdAt
updatedAt
enabled
```

Sensitive credentials must NOT be stored directly in plaintext fields.

---

## Repository

```text
DevelopmentRepository
```

Possible fields:

```text
id
connectionId
externalId
name
fullName
webUrl
defaultBranch
enabled
```

---

## Task development link

A task may be linked to one or more external development objects.

Conceptually:

```text
TrackWorkDevelopmentLink
```

Fields may include:

```text
taskId
provider
repositoryId
entityType
externalId
externalIid
url
createdAt
updatedAt
```

Supported entity types:

```text
commit
branch
merge_request
pipeline
```

Avoid storing the same relationship multiple times.

Use appropriate unique constraints.

---

# 7. GitLab integration — V1

Implement GitLab first.

Support both:

- GitLab.com;
- self-hosted GitLab instances.

Therefore do not hardcode:

```text
https://gitlab.com
```

Connection configuration must allow a custom GitLab base URL.

Example:

```text
https://gitlab.example.org
```

---

# 8. GitLab connection UI

Add an Integrations section to the appropriate workspace/admin settings area.

Example:

```text
Integrations
└── GitLab
```

The UI should support:

```text
GitLab URL
Access token / authentication method
Webhook secret
Repository selection
Enable / Disable
Test connection
```

Do not expose secrets after they are stored.

Show a masked representation if needed.

Example:

```text
Token: ••••••••••••••••
```

There must be a way to:

- add a connection;
- test it;
- edit safe configuration;
- rotate credentials;
- disable it;
- delete it.

---

# 9. Authentication

Prefer the best authentication mechanism supported by the existing AFFiNE integration architecture.

Possible GitLab mechanisms include:

- OAuth;
- project/group access tokens;
- personal access token.

For V1, a token-based connection is acceptable if OAuth would significantly increase scope.

However:

- credentials must be encrypted at rest using existing AFFiNE secret/encryption facilities;
- tokens must never appear in logs;
- tokens must never be returned to the frontend after creation;
- tokens must never be stored in TrackWork task data;
- errors must sanitize HTTP headers and credentials.

Use the minimum required GitLab scopes.

Document the scopes that are required.

---

# 10. GitLab webhooks

Implement webhook ingestion.

Example endpoint concept:

```text
/api/integrations/gitlab/webhook/:connectionId
```

The exact route should follow existing AFFiNE conventions.

## Security requirements

Webhook requests must be authenticated.

Use GitLab webhook secret verification.

Reject invalid webhook requests before processing payload data.

Additional requirements:

- limit payload size;
- validate JSON structure;
- validate supported event type;
- do not trust repository URLs from the webhook blindly;
- ensure the repository belongs to the configured integration;
- protect against replay/duplicate processing where possible;
- process events idempotently.

Never allow a webhook to choose an arbitrary workspace/task by raw internal UUID.

---

# 11. GitLab events to support

## Commit / Push events

When a push contains commits with:

```text
TW-142
```

associate those commits with task `TW-142`.

Store/display:

```text
commit SHA
short SHA
message
author
timestamp
repository
URL
branch/ref
```

Deduplicate commits by provider + repository + commit SHA.

---

## Branch references

If a pushed/created branch contains:

```text
TW-142
```

associate the branch with that task.

Example:

```text
feature/TW-142-refresh-token
```

Show:

```text
feature/TW-142-refresh-token
```

and a link to GitLab.

---

## Merge Request events

If the MR title, description or source branch references:

```text
TW-142
```

associate the MR with the task.

Store/display:

```text
MR IID
title
state
source branch
target branch
author
createdAt
updatedAt
mergedAt
URL
```

Supported statuses should map into a provider-neutral model such as:

```text
open
merged
closed
draft
```

Do not expose GitLab-specific state names directly throughout TrackWork domain code.

---

# 12. Universal CI pipeline integration

Pipeline status must NOT be tied to GitLab CI/CD.

The first real CI provider is expected to be **Jenkins**.

Design CI as a separate provider-neutral integration layer.

Preferred conceptual model:

```text
CIProvider
├── Jenkins
├── GitLab CI
├── GitHub Actions
└── Generic CI
```

A TrackWork task may be linked to source-code activity from one provider and CI activity from another.

Example:

```text
SCM: GitLab
CI: Jenkins
```

## Pipeline linking

A CI pipeline/build should be linkable to a TrackWork task using one or more of:

```text
task key in build parameters
task key in branch name
task key in commit message
task key in SCM revision metadata
task key in merge request metadata
explicit TrackWork task key sent by webhook/API
```

Example Jenkins metadata:

```text
TRACKWORK_TASK=TW-142
GIT_COMMIT=a83f1d2...
GIT_BRANCH=feature/TW-142-refresh-token
BUILD_NUMBER=8142
```

The integration layer must normalize this into a provider-neutral pipeline model.

Suggested normalized representation:

```ts
type PipelineStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'unstable'
  | 'unknown';

interface PipelineInfo {
  provider: string;
  externalId: string;
  number?: string;
  name?: string;
  status: PipelineStatus;
  url?: string;
  repositoryId?: string;
  commitSha?: string;
  branch?: string;
  startedAt?: Date;
  finishedAt?: Date;
}
```

## Jenkins support

The V1 CI implementation should support Jenkins first.

Acceptable integration mechanisms:

```text
Jenkins webhook / notification plugin
Jenkins post-build HTTP callback
Jenkins shared-library helper
Generic authenticated TrackWork CI endpoint
```

Prefer a generic TrackWork CI ingestion API that Jenkins can call.

Conceptual endpoint:

```text
POST /api/integrations/ci/events
```

or a connection-scoped equivalent following AFFiNE conventions.

Example normalized event payload:

```json
{
  "provider": "jenkins",
  "pipeline": {
    "id": "auth-service/8142",
    "number": "8142",
    "name": "auth-service",
    "status": "success",
    "url": "https://jenkins.example.org/job/auth-service/8142/",
    "commitSha": "a83f1d2...",
    "branch": "feature/TW-142-refresh-token"
  },
  "taskKeys": ["TW-142"]
}
```

Do not expose a completely unauthenticated generic endpoint.

Each CI connection must have its own authentication secret/token.

The backend must validate:

- integration connection;
- workspace ownership;
- authentication secret;
- payload schema;
- task key scope;
- idempotency key;
- supported status value.

## Pipeline display

TrackWork should display relevant pipeline status:

```text
Pipeline

Jenkins / auth-service #8142
Passed
```

Optionally include stages if the provider supplies them:

```text
Build                Passed
Unit tests           Passed
Lint                 Passed
Integration tests    Failed
```

At minimum V1 should support provider-neutral statuses:

```text
queued
running
success
failed
canceled
skipped
unstable
unknown
```

Display a link:

```text
Open pipeline
```

TrackWork is not intended to become a full CI frontend.

Do NOT reproduce complete Jenkins console logs in V1.

Do NOT assume pipeline data originates from GitLab.

# 13. Development section in TrackWork task UI

Add a **Development** section to the task details.

Example:

```text
Development

Repository
MRH/AFFiNES

Branches
feature/TW-142-refresh-token

Merge Requests
!318 Fix refresh token handling
Open

Commits
a83f1d2 Fix refresh token race
b91ec33 Add regression tests

Pipeline
Jenkins / auth-service #8142
Passed
```

The section should be compact.

Avoid making the task panel visually overwhelming.

Use collapsible groups if needed.

---

# 13. Development activity timeline

TrackWork should have a unified activity timeline.

Example:

```text
10:42 Task created
11:03 Status changed to In Progress
11:07 Branch feature/TW-142 created
12:51 Commit a83f1d2 pushed
13:04 MR !318 opened
13:08 Pipeline #8141 failed
13:21 Commit b91ec33 pushed
13:27 Pipeline #8142 passed
14:10 MR !318 merged
```

Do not create duplicate timeline entries when GitLab retries the same webhook.

Events should have stable idempotency keys.

---

# 13. Status automations

Support optional automation between development events and TrackWork task state.

Examples:

```text
MR opened
→ move task to In Progress
```

```text
MR merged
→ move task to Review
```

## Important

These rules must NOT be hardcoded globally.

They must be configurable.

V1 can use a simple rule system.

Example:

```ts
{
  event: 'merge_request.opened',
  action: 'task.move',
  targetStageId: '...'
}
```

Avoid building a giant Zapier-like automation engine in this phase.

Only create the abstractions needed for a small number of TrackWork development triggers/actions.

---

# 13. Create branch from TrackWork

Add an optional action:

```text
Create branch
```

User selects:

```text
Repository
Base branch
```

Suggested branch name:

```text
feature/TW-142-refresh-token
```

Branch naming should be configurable or at least generated predictably.

Do not automatically create branches without explicit user action.

---

# 13. Create Merge Request from TrackWork

Optional V1/V1.1 feature:

```text
Create Merge Request
```

Prefill:

```text
Title:
TW-142 Fix refresh token race

Description:
TrackWork: TW-142
```

User chooses:

```text
source branch
target branch
```

After creation, automatically link the MR to the task.

---

# 13. AFFiNE document ↔ TrackWork integration

TrackWork should integrate more deeply with AFFiNE documents.

This is important because TrackWork is inside AFFiNE, rather than being a standalone issue tracker.

---

## Related documents

A task may contain:

```text
Related documents

Architecture / Authentication
API / Session refresh
Incident / Auth outage
```

The document should also expose backlinks to related tasks.

Example:

```text
Related TrackWork tasks

TW-142 Fix refresh token race
TW-151 Add token rotation
```

Reuse AFFiNE's existing backlink/reference infrastructure wherever possible.

Do not build a second unrelated document-link system unless necessary.

---

# 13. Create TrackWork task from selected document text

When the user selects text in an AFFiNE document, provide an action:

```text
Create TrackWork task
```

Example selected text:

```text
Need to add retry handling for failed indexing jobs
```

Creates:

```text
TW-151 Need to add retry handling for failed indexing jobs
```

and automatically links:

```text
Created from:
Architecture / Search indexing
```

The original document should receive a backlink/reference to the new task.

---

# 13. Inline TrackWork task references

When a TrackWork key appears in supported AFFiNE content:

```text
TW-142
```

consider rendering it as a clickable task reference.

Minimum requirement:

- recognize valid TrackWork task keys;
- clicking opens/navigates to the task.

Do not replace text incorrectly inside code blocks or contexts where auto-linking is inappropriate.

---

# 13. Task relationships

Improve TrackWork task relationships.

Support at least:

```text
parent
child
blocks
blocked_by
relates_to
duplicates
```

Example:

```text
Blocked by

TW-138 Database migration
```

```text
Blocks

TW-151 Enable new auth flow
```

Store relations using task IDs, not titles.

Protect against obvious invalid relationships:

- task linking to itself;
- duplicate relationship records;
- impossible parent cycles if hierarchical relationships are used.

---

# 13. Subtasks

Support real subtasks, not just text checkboxes.

Example:

```text
TW-142 Fix auth refresh

Progress 3 / 5

✓ Backend token rotation
✓ Frontend retry logic
✓ Tests
○ Migration
○ Documentation
```

A subtask should still be a normal TrackWork task internally where practical.

Prefer a parent-child task relationship rather than a separate incompatible subtask object model.

---

# 13. Permissions

Every operation must respect workspace and TrackWork permissions.

Examples:

A user must not be able to:

- see GitLab repository data for a workspace they cannot access;
- attach external development data to a task they cannot access;
- create GitLab branches without appropriate TrackWork/integration permission;
- configure GitLab credentials without admin/owner permission;
- trigger status automation across another workspace.

Never trust IDs supplied by the frontend.

Always authorize access server-side.

---

# 13. Multi-workspace isolation

This is critical.

Integration data must be scoped correctly.

A GitLab connection belonging to workspace A must never be usable to access or modify tasks from workspace B.

Validate:

```text
connection.workspaceId
repository.connectionId
task.workspaceId
```

at every boundary where external events are resolved to internal TrackWork tasks.

Add tests specifically for cross-workspace IDOR attempts.

---

# 13. Webhook security

Treat GitLab webhooks as untrusted external input.

Required protections:

- verify webhook secret;
- validate payload schema;
- validate repository identity;
- validate connection state;
- validate workspace ownership;
- reject oversized requests;
- sanitize logs;
- avoid SSRF;
- avoid arbitrary URL fetching;
- do not execute values from commit messages;
- do not interpret Markdown/HTML unsafely;
- escape user/external content on rendering;
- process idempotently.

If the implementation fetches additional data from GitLab:

- use the configured trusted GitLab base URL;
- do not accept arbitrary API URLs from webhook payloads;
- protect against SSRF to localhost/private/internal services where applicable.

---

# 13. External content security

The following GitLab fields are attacker-controlled strings:

```text
commit message
branch
author name
MR title
MR description
repository name
pipeline name
environment name
```

They must never be rendered as trusted HTML.

Use the existing AFFiNE escaping/sanitization rules.

---

# 13. Secret handling

Never log:

```text
GitLab access token
OAuth token
webhook secret
Authorization headers
cookies
```

API responses must not return secret values.

Use existing AFFiNE secret storage / encryption infrastructure.

If no suitable existing mechanism exists, document that fact before introducing a new one.

---

# 13. Reliability

Webhook processing should not block unnecessarily.

If AFFiNE's existing job/queue infrastructure is appropriate, use it.

Preferred architecture:

```text
GitLab webhook
     │
     ▼
authenticate + validate
     │
     ▼
enqueue integration event
     │
     ▼
worker
     │
     ├─ normalize event
     ├─ resolve TW keys
     ├─ persist links
     └─ create activity events
```

This provides:

- retries;
- idempotency;
- faster webhook responses;
- failure isolation.

Do not introduce a new queueing system.

Use the existing BullMQ/job infrastructure if suitable.

---

# 13. Idempotency

GitLab may retry webhooks.

Processing the same webhook twice must not produce:

```text
duplicate commits
duplicate MR links
duplicate pipeline events
duplicate timeline events
duplicate automations
```

Use stable keys where possible, for example:

```text
provider
connection
repository
event type
external entity ID
external event identity
```

---

# 13. Failure behavior

External integration failures must not break TrackWork.

If GitLab is unavailable:

- task UI still loads;
- cached/stored development links remain visible;
- GitLab actions show a clear error;
- webhook processing retries where appropriate;
- application does not crash.

Example:

```text
GitLab temporarily unavailable
Last synchronized: 12 minutes ago
```

Do not make normal TrackWork reads depend synchronously on GitLab availability.

---

# 13. Observability

Add useful structured logs/metrics for:

```text
webhook received
webhook rejected
event processed
event duplicate
task references resolved
GitLab API request failed
automation executed
automation failed
```

Never include secrets.

If AFFiNE already has metrics/tracing conventions, follow them.

---

# 13. i18n

All new UI strings must use the existing AFFiNE localization mechanism.

At minimum include:

```text
English
Russian
```

Do NOT:

- hardcode English labels;
- add an independent i18n library;
- translate external GitLab content;
- translate task titles created by users;
- translate repository/branch/MR names.

Translate only application UI strings.

---

# 13. UI / UX guidelines

Keep the UI consistent with existing AFFiNE components.

Do not introduce an unrelated design system.

Development information should be useful but compact.

Preferred pattern:

```text
Development
  Repository
  Branches
  Merge Requests
  Commits
  Pipeline
```

Allow sections to collapse when there is a lot of data.

Use existing icons/components where possible.

---

# 13. Suggested implementation milestones

## Milestone 1 — Foundation

Implement:

- TrackWork stable keys;
- task reference parser;
- generic provider/domain model;
- integration connection model;
- provider-neutral development entity model;
- database migrations;
- backend authorization boundaries.

Acceptance:

```text
TW-123
```

exists as a stable task identifier and the backend can represent external development links without GitLab-specific fields leaking into the TrackWork domain.

---

## Milestone 2 — GitLab connection

Implement:

- GitLab provider adapter;
- GitLab base URL support;
- credential storage;
- connection test;
- repository selection;
- webhook endpoint;
- webhook validation.

Acceptance:

A workspace admin can connect a GitLab instance and receive a verified webhook safely.

---

## Milestone 3 — Commits / branches / merge requests

Implement:

- push event parsing;
- task-key extraction;
- commit linking;
- branch linking;
- MR event linking;
- Development UI section;
- deduplication.

Acceptance:

A GitLab commit:

```text
fix(auth): TW-142 refresh token
```

appears automatically in task `TW-142`.

An MR referencing `TW-142` also appears in the same task.

---

## Milestone 4 — Universal CI + Jenkins

Implement:

- generic CI provider abstraction;
- Jenkins provider/adapter;
- authenticated CI event ingestion API;
- provider-neutral pipeline status;
- task-key/commit/branch based pipeline linking;
- pipeline display in TrackWork;
- link to Jenkins.

Acceptance:

A Jenkins build associated with `TW-142` appears in the TrackWork task regardless of GitLab CI/CD usage.

---

## Milestone 5 — Activity timeline

Implement unified task activity events for:

- commit linked;
- branch linked;
- MR opened;
- MR updated;
- MR merged;
- pipeline started;
- pipeline passed;
- pipeline failed.

Acceptance:

The timeline remains idempotent when the same webhook is delivered repeatedly.

---

## Milestone 6 — Automation

Implement configurable rules such as:

```text
MR opened → In Progress
MR merged → Review
Pipeline failed → optional warning / no status change by default
```

Acceptance:

Rules are opt-in/configurable and are not hardcoded to global TrackWork stages.

---


## Milestone 7 — AFFiNE document integration

Implement:

- related document links;
- task backlinks;
- create task from selected document text;
- TrackWork task key links inside documents where appropriate.

Acceptance:

A task and AFFiNE document can reference each other without duplicating document storage.

---

## Milestone 8 — Task relations / subtasks

Implement:

- parent/child;
- blocks/blocked-by;
- relates-to;
- duplicates;
- subtask progress.

Acceptance:

Relations are stored by stable internal task IDs and do not break on rename.

---

# 13. V1 scope

The minimum useful V1 should contain:

```text
1. Stable task keys: TW-123
2. Generic development integration architecture
3. GitLab connection
4. GitLab webhook verification
5. Commit → task linking
6. Branch → task linking
7. Merge Request → task linking
8. Generic CI integration API
9. Jenkins pipeline status
10. Development section in task UI
11. Development activity timeline
12. Russian + English i18n
13. Permission and workspace-isolation tests
```

This is the first target.

Do not delay V1 by implementing every future integration feature.

---

# 13. V1.1 candidates

After V1 is stable:

```text
- configurable status automation
- Create branch from task
- Create MR from task
- related AFFiNE documents
- create task from selected document text
```

---

# 13. V2 candidates

Future providers:

```text
GitHub
Gitea
Forgejo
```

Additional CI providers may later use the same CI abstraction:

```text
GitLab CI
GitHub Actions
Buildkite
TeamCity
```

Other development integrations may later use the same activity model:

```text
Sentry
Mattermost
Slack
Telegram
```

Do not implement these now.

The current architecture should simply avoid making them impossible.

---

# 13. Database migration rules

When schema changes are required:

- use the existing migration system;
- do not manually modify generated database artifacts;
- avoid destructive migrations;
- preserve existing TrackWork tasks;
- provide safe defaults/backfill behavior;
- make migrations compatible with existing self-hosted installations.

TrackWork installations with existing tasks must upgrade without data loss.

---

# 13. GraphQL/API rules

Follow existing AFFiNE API conventions.

If GraphQL is used:

- update source schema/documents;
- run the project's GraphQL code generation;
- do not manually edit generated GraphQL code;
- make sure exports exist in `@affine/graphql`;
- run frontend/admin/backend builds after changes.

Avoid repeating the previous class of issue where frontend imports a generated GraphQL symbol that is not exported by `@affine/graphql`.

---

# 13. Tests

Add tests for at least the following.

## Reference parser

```text
TW-1
TW-142
[TW-142]
feature/TW-142-fix
multiple references
invalid references
case normalization
```

---

## Webhook authentication

```text
valid secret
invalid secret
missing secret
disabled integration
unknown connection
```

---

## Workspace isolation

Attempt to use:

```text
workspace A GitLab connection
```

with:

```text
workspace B task
```

The operation must be rejected.

---

## Idempotency

Deliver the same:

```text
push event
MR event
pipeline event
```

multiple times.

Only one logical entity/event should exist.

---

## Permissions

Test:

```text
owner/admin
normal member
unauthorized user
```

against integration configuration and task actions.

---

## GitLab unavailable

Ensure:

- TrackWork still loads;
- stored development information remains visible;
- external actions fail gracefully.

---

## i18n

Test English and Russian UI.

Ensure GitLab/user-provided content is not translated.

---

# 13. Build verification

Before considering the work complete, run all relevant project checks.

At minimum:

```text
GraphQL codegen
TypeScript typecheck
lint
TrackWork tests
backend tests for integrations
frontend tests
admin/frontend production build
backend production build
```

Also run the standard AFFiNE self-host build if available.

Do not claim completion while relevant build errors remain.

---

# 13. Git workflow

Base branch:

```text
develop
```

Create a dedicated feature branch.

Suggested:

```text
feat/trackwork-development-integrations
```

Prefer logical commits instead of one giant commit.

Example:

```text
feat(trackwork): add stable task keys
feat(integrations): add development integration model
feat(gitlab): add workspace connection and webhook support
feat(trackwork): link gitlab commits and merge requests
feat(trackwork): show pipeline and development activity
test(trackwork): cover development integrations
```

Do not force-push unless explicitly requested.

Do not modify unrelated code.

---

# 13. Required implementation approach for DeepSeek

Do not immediately start writing large amounts of code.

Proceed in this order:

```text
1. Inspect existing TrackWork architecture.
2. Inspect AFFiNE's existing integrations/secrets/webhook/job abstractions.
3. Produce a short architecture report.
4. Identify the exact files/modules that should change.
5. Implement Milestone 1.
6. Run relevant tests/build.
7. Continue milestone by milestone.
```

At each stage:

- reuse existing AFFiNE infrastructure;
- keep changes small and reviewable;
- do not rewrite unrelated modules;
- do not introduce speculative abstractions;
- do not silently change current TrackWork behavior.

---

# 13. Definition of Done for V1

V1 is complete only when all of the following are true:

- [ ] Existing TrackWork tasks continue working.
- [ ] Every TrackWork task has a stable human-readable key.
- [ ] `TW-123` references can be extracted safely.
- [ ] GitLab.com can be connected.
- [ ] A self-hosted GitLab URL can be connected.
- [ ] GitLab credentials are stored securely.
- [ ] Webhooks are authenticated.
- [ ] Webhook processing is idempotent.
- [ ] Commits referencing a task appear in that task.
- [ ] Branches referencing a task appear in that task.
- [ ] Merge Requests referencing a task appear in that task.
- [ ] CI integration is provider-neutral.
- [ ] Jenkins can publish authenticated pipeline events.
- [ ] Jenkins pipeline status appears in the task.
- [ ] GitLab CI/CD is not required.
- [ ] A unified Development section exists in the task UI.
- [ ] Development events appear in the activity timeline.
- [ ] Cross-workspace access is prevented.
- [ ] External strings are rendered safely.
- [ ] New UI is localized in English and Russian.
- [ ] GitLab/user content is not translated.
- [ ] GraphQL generated artifacts are regenerated correctly if changed.
- [ ] Relevant frontend/backend tests pass.
- [ ] Production builds pass.
- [ ] Self-host behavior is verified.
- [ ] No unrelated functionality was modified.

---

# 13. Final product direction

The goal is not to turn TrackWork into another GitLab UI.

TrackWork should become the place where a task contains its full working context:

```text
Task
├── status
├── assignee
├── description
├── subtasks
├── relationships
├── AFFiNE documents
└── Development
    ├── repository
    ├── branches
    ├── commits
    ├── merge requests
    └── pipelines
```

GitLab remains responsible for source-code hosting and CI/CD.

TrackWork is responsible for answering:

> What is happening with this piece of work?

The implementation should optimize for that workflow.

---

# 47. Reference implementation patterns for DeepSeek V4 Flash

This section exists intentionally.

DeepSeek V4 Flash should use these examples as **implementation guidance**, not as code that must be copied blindly.

Before using any example below:

1. inspect the existing AFFiNE conventions;
2. reuse existing types/helpers/services where possible;
3. adapt names and module boundaries to the real repository;
4. do not create duplicate infrastructure if AFFiNE already has it.

The examples below define the expected architecture and coding style.

---

## 47.1 Provider-neutral domain types

Prefer normalized domain types.

Do not leak GitLab or Jenkins response objects into TrackWork business logic.

Example:

```ts
export type ScmProviderType = 'gitlab' | 'github' | 'gitea' | 'forgejo';

export type CiProviderType =
  | 'jenkins'
  | 'gitlab-ci'
  | 'github-actions'
  | 'generic';

export type DevelopmentEntityType =
  | 'commit'
  | 'branch'
  | 'merge_request'
  | 'pipeline';

export type MergeRequestStatus =
  | 'open'
  | 'merged'
  | 'closed'
  | 'draft'
  | 'unknown';

export type PipelineStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'skipped'
  | 'unstable'
  | 'unknown';
```

Provider-specific values should be normalized at the adapter boundary.

Bad:

```ts
if (mr.state === 'opened') {
  ...
}
```

inside generic TrackWork code.

Better:

```ts
switch (mergeRequest.status) {
  case 'open':
    ...
    break;

  case 'merged':
    ...
    break;
}
```

where GitLab-specific `opened` was already mapped to `open`.

---

## 47.2 SCM provider interface

A provider should hide GitLab-specific API details.

Example:

```ts
export interface ScmProvider {
  readonly type: ScmProviderType;

  verifyWebhook(input: VerifyWebhookInput): Promise<boolean>;

  parseWebhook(input: ParseScmWebhookInput): Promise<DevelopmentEvent[]>;

  testConnection(
    connection: DevelopmentIntegrationConnection
  ): Promise<ConnectionTestResult>;

  listRepositories(
    connection: DevelopmentIntegrationConnection
  ): Promise<RepositoryInfo[]>;

  getMergeRequest?(
    connection: DevelopmentIntegrationConnection,
    repository: DevelopmentRepository,
    externalId: string
  ): Promise<MergeRequestInfo | null>;
}
```

Provider adapters should mostly:

```text
validate provider-specific input
call provider API
normalize provider response
return generic domain objects
```

---

## 47.3 CI provider interface

SCM and CI must remain separate.

Example:

```ts
export interface CiProvider {
  readonly type: CiProviderType;

  verifyWebhook(input: VerifyCiWebhookInput): Promise<boolean>;

  parseWebhook(input: ParseCiWebhookInput): Promise<PipelineEvent[]>;

  testConnection(
    connection: CiIntegrationConnection
  ): Promise<ConnectionTestResult>;

  getPipeline?(
    connection: CiIntegrationConnection,
    externalId: string
  ): Promise<PipelineInfo | null>;
}
```

Do not make Jenkins implement `ScmProvider`.

Do not make GitLab repository integration responsible for Jenkins pipeline state.

---

## 47.4 Provider registries

Avoid large provider switch statements spread across the codebase.

Preferred pattern:

```ts
@Injectable()
export class ScmProviderRegistry {
  private readonly providers = new Map<ScmProviderType, ScmProvider>();

  constructor(gitLabProvider: GitLabScmProvider) {
    this.providers.set(gitLabProvider.type, gitLabProvider);
  }

  get(type: ScmProviderType): ScmProvider {
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(`Unsupported SCM provider: ${type}`);
    }

    return provider;
  }
}
```

And separately:

```ts
@Injectable()
export class CiProviderRegistry {
  private readonly providers = new Map<CiProviderType, CiProvider>();

  constructor(jenkinsProvider: JenkinsCiProvider) {
    this.providers.set(jenkinsProvider.type, jenkinsProvider);
  }

  get(type: CiProviderType): CiProvider {
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(`Unsupported CI provider: ${type}`);
    }

    return provider;
  }
}
```

If AFFiNE already has a DI/provider registration pattern, use that instead.

---

## 47.5 TrackWork task-key parser

Implement reference extraction once.

Example:

```ts
const TRACKWORK_TASK_KEY_RE =
  /(?<![A-Z0-9])([A-Z][A-Z0-9]{1,15}-\d+)(?![A-Z0-9])/gi;

export function extractTrackWorkKeys(input: string): string[] {
  if (!input) {
    return [];
  }

  const result = new Set<string>();

  for (const match of input.matchAll(TRACKWORK_TASK_KEY_RE)) {
    result.add(match[1].toUpperCase());
  }

  return [...result];
}
```

Example expectations:

```ts
expect(extractTrackWorkKeys('fix: TW-142 refresh token'))
  .toEqual(['TW-142']);

expect(extractTrackWorkKeys('[TW-142] [TW-151]'))
  .toEqual(['TW-142', 'TW-151']);

expect(extractTrackWorkKeys('feature/tw-142-refresh-token'))
  .toEqual(['TW-142']);
```

Important:

- validate extracted keys against the database before linking;
- parser result alone does not authorize access;
- task-key parsing must not reveal tasks from another workspace.

---

## 47.6 Stable task-key generation

Never generate task keys using:

```ts
count(*) + 1
```

because concurrent task creation may generate duplicates.

Preferred conceptual approach:

```text
workspace/project scoped sequence
        ↓
atomic increment
        ↓
TW-142
```

Example service shape:

```ts
@Injectable()
export class TrackWorkKeyService {
  async nextKey(scopeId: string, prefix = 'TW'): Promise<string> {
    const sequence = await this.repository.nextSequence(scopeId);

    return `${prefix}-${sequence}`;
  }
}
```

The database operation behind `nextSequence()` must be atomic.

Also add a unique database constraint.

Example conceptual constraint:

```text
UNIQUE(scope_id, task_key)
```

---

## 47.7 Thin webhook controller

Controllers should stay thin.

Bad:

```ts
@Post('/gitlab/webhook/:id')
async webhook(...) {
  // verify secret
  // parse payload
  // search tasks
  // write commits
  // write MRs
  // update status
  // create timeline
  // call GitLab API
  // hundreds of lines...
}
```

Better:

```ts
@Post('/gitlab/webhook/:connectionId')
async receiveGitLabWebhook(
  @Param('connectionId') connectionId: string,
  @Req() req: Request
) {
  const result = await this.webhookService.acceptScmWebhook({
    connectionId,
    provider: 'gitlab',
    headers: req.headers,
    body: req.body,
  });

  return {
    accepted: result.accepted,
  };
}
```

Business logic belongs in services.

---

## 47.8 Webhook acceptance service

Useful high-level pattern:

```ts
@Injectable()
export class DevelopmentWebhookService {
  constructor(
    private readonly connectionService: IntegrationConnectionService,
    private readonly scmProviders: ScmProviderRegistry,
    private readonly jobs: JobService
  ) {}

  async acceptScmWebhook(
    input: AcceptScmWebhookInput
  ): Promise<{ accepted: true }> {
    const connection = await this.connectionService.getEnabledScmConnection(
      input.connectionId
    );

    const provider = this.scmProviders.get(connection.provider);

    const valid = await provider.verifyWebhook({
      connection,
      headers: input.headers,
      body: input.body,
    });

    if (!valid) {
      throw new UnauthorizedException();
    }

    await this.jobs.add('integration.scm-webhook', {
      connectionId: connection.id,
      provider: connection.provider,
      payload: input.body,
    });

    return { accepted: true };
  }
}
```

Do not put credentials or secrets into queued job payloads unless unavoidable.

---

## 47.9 Webhook worker

Example responsibility:

```ts
@OnJob('integration.scm-webhook')
async handleScmWebhook(job: Job<ScmWebhookJob>) {
  const connection =
    await this.connectionService.getEnabledScmConnection(job.data.connectionId);

  const provider = this.scmProviders.get(connection.provider);

  const events = await provider.parseWebhook({
    connection,
    body: job.data.payload,
  });

  for (const event of events) {
    await this.eventProcessor.process(event, connection);
  }
}
```

The worker should not care about GitLab-specific fields such as:

```text
object_attributes
project_id
iid
```

Those must already be normalized by the provider adapter.

---

## 47.10 Normalized development events

Use a discriminated union instead of `data: any`.

Example:

```ts
export type DevelopmentEvent =
  | {
      type: 'commit.pushed';
      idempotencyKey: string;
      repository: RepositoryRef;
      commit: CommitInfo;
      taskKeys: string[];
    }
  | {
      type: 'branch.updated';
      idempotencyKey: string;
      repository: RepositoryRef;
      branch: BranchInfo;
      taskKeys: string[];
    }
  | {
      type: 'merge_request.opened';
      idempotencyKey: string;
      repository: RepositoryRef;
      mergeRequest: MergeRequestInfo;
      taskKeys: string[];
    }
  | {
      type: 'merge_request.updated';
      idempotencyKey: string;
      repository: RepositoryRef;
      mergeRequest: MergeRequestInfo;
      taskKeys: string[];
    }
  | {
      type: 'merge_request.merged';
      idempotencyKey: string;
      repository: RepositoryRef;
      mergeRequest: MergeRequestInfo;
      taskKeys: string[];
    };
```

Avoid:

```ts
type DevelopmentEvent = {
  type: string;
  data: any;
};
```

after the provider-validation boundary.

---

## 47.11 GitLab MR normalization example

Conceptual example:

```ts
@Injectable()
export class GitLabScmProvider implements ScmProvider {
  readonly type = 'gitlab' as const;

  async parseWebhook(
    input: ParseScmWebhookInput
  ): Promise<DevelopmentEvent[]> {
    const payload = GitLabWebhookSchema.parse(input.body);

    switch (payload.object_kind) {
      case 'push':
        return this.parsePushEvent(payload);

      case 'merge_request':
        return this.parseMergeRequestEvent(payload);

      default:
        return [];
    }
  }
}
```

MR parser:

```ts
private parseMergeRequestEvent(
  payload: GitLabMergeRequestWebhook
): DevelopmentEvent[] {
  const mr = payload.object_attributes;

  const taskKeys = extractTrackWorkKeys(
    [
      mr.title,
      mr.description ?? '',
      mr.source_branch,
    ].join('\n')
  );

  return [
    {
      type: mapGitLabMrAction(mr.action),
      idempotencyKey: [
        'gitlab',
        payload.project.id,
        'mr',
        mr.iid,
        mr.updated_at,
        mr.action,
      ].join(':'),
      repository: {
        externalId: String(payload.project.id),
        name: payload.project.path_with_namespace,
        url: payload.project.web_url,
      },
      mergeRequest: {
        externalId: String(mr.id),
        iid: String(mr.iid),
        title: mr.title,
        url: mr.url,
        sourceBranch: mr.source_branch,
        targetBranch: mr.target_branch,
        status: mapGitLabMergeRequestStatus(
          mr.state,
          mr.work_in_progress
        ),
      },
      taskKeys,
    },
  ];
}
```

The exact GitLab payload fields must be verified against the actual GitLab webhook schema.

---

## 47.12 Database-backed idempotency

Before processing an event:

```ts
const alreadyProcessed =
  await this.eventRepository.existsByIdempotencyKey(event.idempotencyKey);

if (alreadyProcessed) {
  return;
}
```

But also enforce uniqueness in the database.

Conceptual constraint:

```text
UNIQUE(connection_id, idempotency_key)
```

Recommended handling:

```ts
try {
  await repository.insertEvent(event);
} catch (error) {
  if (isUniqueConstraintViolation(error)) {
    return;
  }

  throw error;
}
```

Do not rely on an in-memory `Set`.

---

## 47.13 Workspace-safe task resolution

Never:

```ts
const task = await taskRepository.findByKey(taskKey);
```

Prefer:

```ts
const task = await taskRepository.findByWorkspaceAndKey(
  connection.workspaceId,
  taskKey
);
```

Conceptually:

```ts
async resolveTask(
  workspaceId: string,
  taskKey: string
): Promise<TrackWorkTask | null> {
  return this.taskRepository.findFirst({
    workspaceId,
    key: taskKey,
  });
}
```

Every external integration boundary must be workspace-scoped.

---

## 47.14 Commit linking

Example service shape:

```ts
@Injectable()
export class TrackWorkDevelopmentLinkService {
  async linkCommit(
    task: TrackWorkTask,
    repository: DevelopmentRepository,
    commit: CommitInfo
  ) {
    await this.linkRepository.upsert({
      taskId: task.id,
      repositoryId: repository.id,
      entityType: 'commit',
      externalId: commit.sha,
      url: commit.url,
      title: commit.message,
      metadata: {
        shortSha: commit.shortSha,
        authorName: commit.authorName,
        committedAt: commit.committedAt,
      },
    });
  }
}
```

Prefer unique constraints/upsert over blind inserts.

---

## 47.15 Universal Jenkins CI ingestion endpoint

Preferred external contract:

```http
POST /api/integrations/ci/:connectionId/events
Authorization: Bearer <integration-secret>
Content-Type: application/json
```

Example request:

```json
{
  "eventId": "auth-service:8142:completed",
  "pipeline": {
    "externalId": "auth-service/8142",
    "number": "8142",
    "name": "auth-service",
    "status": "success",
    "url": "https://jenkins.example.org/job/auth-service/8142/",
    "commitSha": "a83f1d2c71...",
    "branch": "feature/TW-142-refresh-token",
    "startedAt": "2026-08-27T12:14:10Z",
    "finishedAt": "2026-08-27T12:19:44Z"
  },
  "taskKeys": ["TW-142"]
}
```

Example validation shape:

```ts
const CiEventSchema = z.object({
  eventId: z.string().min(1).max(255),

  pipeline: z.object({
    externalId: z.string().min(1).max(255),
    number: z.string().max(64).optional(),
    name: z.string().min(1).max(255),
    status: z.enum([
      'queued',
      'running',
      'success',
      'failed',
      'canceled',
      'skipped',
      'unstable',
      'unknown',
    ]),
    url: z.string().url().optional(),
    commitSha: z.string().max(128).optional(),
    branch: z.string().max(512).optional(),
    startedAt: z.string().datetime().optional(),
    finishedAt: z.string().datetime().optional(),
  }),

  taskKeys: z.array(z.string().min(1).max(64)).max(50).default([]),
});
```

Use the validation library already present in AFFiNE.

Do not introduce Zod only because this example uses it.

---

## 47.16 Jenkinsfile consumer example

This shows what the TrackWork CI API should be easy to call from.

```groovy
post {
    always {
        script {
            def trackWorkStatus = 'unknown'

            if (currentBuild.currentResult == 'SUCCESS') {
                trackWorkStatus = 'success'
            } else if (currentBuild.currentResult == 'FAILURE') {
                trackWorkStatus = 'failed'
            } else if (currentBuild.currentResult == 'ABORTED') {
                trackWorkStatus = 'canceled'
            } else if (currentBuild.currentResult == 'UNSTABLE') {
                trackWorkStatus = 'unstable'
            }

            sh """
              curl --fail --silent --show-error \
                -X POST \
                -H 'Authorization: Bearer ${TRACKWORK_CI_TOKEN}' \
                -H 'Content-Type: application/json' \
                '${TRACKWORK_URL}/api/integrations/ci/${TRACKWORK_CONNECTION_ID}/events' \
                --data '{
                  "eventId": "${JOB_NAME}:${BUILD_NUMBER}:${currentBuild.currentResult}",
                  "pipeline": {
                    "externalId": "${JOB_NAME}/${BUILD_NUMBER}",
                    "number": "${BUILD_NUMBER}",
                    "name": "${JOB_NAME}",
                    "status": "${trackWorkStatus}",
                    "url": "${BUILD_URL}",
                    "commitSha": "${GIT_COMMIT}",
                    "branch": "${GIT_BRANCH}"
                  }
                }'
            """
        }
    }
}
```

This is only an integration-consumer example.

Do not place Jenkins/Groovy code inside the AFFiNE backend package.

A future Jenkins shared library could wrap this call.

---

## 47.17 Pipeline task-resolution priority

If Jenkins explicitly provides task keys:

```text
taskKeys: ["TW-142"]
```

use them first.

Otherwise resolution can be:

```text
1. explicit taskKeys
2. existing commit SHA → task link
3. branch name task key
4. normalized pipeline metadata
```

Example:

```ts
function extractPipelineTaskKeys(
  pipeline: PipelineInfo
): string[] {
  return unique([
    ...extractTrackWorkKeys(pipeline.branch ?? ''),
    ...extractTrackWorkKeys(pipeline.name ?? ''),
  ]);
}
```

Never search all workspaces globally.

---

## 47.18 Pipeline upsert

One pipeline/build should not become a new row every time its status changes.

Conceptual pattern:

```ts
await pipelineRepository.upsert({
  connectionId,
  externalId: pipeline.externalId,

  create: {
    connectionId,
    externalId: pipeline.externalId,
    status: pipeline.status,
    name: pipeline.name,
    number: pipeline.number,
    url: pipeline.url,
    commitSha: pipeline.commitSha,
    branch: pipeline.branch,
    startedAt: pipeline.startedAt,
    finishedAt: pipeline.finishedAt,
  },

  update: {
    status: pipeline.status,
    url: pipeline.url,
    commitSha: pipeline.commitSha,
    branch: pipeline.branch,
    startedAt: pipeline.startedAt,
    finishedAt: pipeline.finishedAt,
  },
});
```

Prefer:

```text
one pipeline entity
+
multiple activity events
```

---

## 47.19 Activity timeline event

Conceptual timeline type:

```ts
type TrackWorkActivityEvent = {
  id: string;
  taskId: string;

  type:
    | 'development.commit_linked'
    | 'development.branch_linked'
    | 'development.mr_opened'
    | 'development.mr_merged'
    | 'development.pipeline_started'
    | 'development.pipeline_succeeded'
    | 'development.pipeline_failed';

  externalEntityId?: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
};
```

Example:

```ts
await activityService.createOnce({
  taskId: task.id,
  idempotencyKey: `jenkins:${pipeline.externalId}:${pipeline.status}`,
  type: 'development.pipeline_succeeded',
  externalEntityId: pipeline.externalId,
  metadata: {
    pipelineName: pipeline.name,
    pipelineNumber: pipeline.number,
    url: pipeline.url,
  },
});
```

---

## 47.20 Automation consumes generic events

Bad:

```ts
if (gitlabMr.action === 'merge') {
  moveTaskToReview();
}
```

Better:

```ts
await automationService.handle({
  workspaceId,
  taskId,
  event: {
    type: 'merge_request.merged',
    provider: 'gitlab',
  },
});
```

Conceptual rule:

```ts
type TrackWorkAutomationRule = {
  id: string;
  workspaceId: string;
  enabled: boolean;

  trigger:
    | 'merge_request.opened'
    | 'merge_request.merged'
    | 'pipeline.running'
    | 'pipeline.success'
    | 'pipeline.failed';

  action: {
    type: 'task.move';
    stageId: string;
  };
};
```

Do not create a general scripting engine in V1.

---

## 47.21 Secret storage pattern

Do not store:

```ts
{
  gitlabToken: 'glpat-...',
  webhookSecret: 'secret123'
}
```

in ordinary JSON configuration.

Preferred conceptual shape:

```ts
type IntegrationConnection = {
  id: string;
  workspaceId: string;
  provider: string;
  baseUrl: string;
  secretRef: string;
};
```

Then:

```ts
const credentials =
  await secretService.get<GitLabCredentials>(connection.secretRef);
```

If AFFiNE already provides another secret abstraction, reuse it.

---

## 47.22 Generic CI secret verification

A CI connection should have its own secret.

Conceptual pattern:

```ts
const token = parseBearerToken(request.headers.authorization);

const connection =
  await ciConnectionService.getEnabled(connectionId);

const valid = await secretService.verify(
  connection.secretRef,
  token
);

if (!valid) {
  throw new UnauthorizedException();
}
```

Prefer hashed secrets for inbound-only authentication where the original value never needs to be recovered.

---

## 47.23 Secret redaction

Never log:

```text
Authorization
PRIVATE-TOKEN
X-Gitlab-Token
Cookie
Set-Cookie
webhook secret
CI bearer token
```

Avoid logging complete HTTP client errors if they include request configuration.

---

## 47.24 SSRF-safe provider URL handling

Self-hosted GitLab requires custom base URLs.

Conceptually:

```ts
const url = new URL(input.baseUrl);

if (!['https:', 'http:'].includes(url.protocol)) {
  throw new BadRequestException('Unsupported GitLab URL protocol');
}
```

Then follow AFFiNE's existing network/SSRF policy.

Important:

A self-hosted AFFiNE deployment may legitimately use an internal GitLab address.

Therefore do not invent a blanket private-IP ban without inspecting current project conventions.

Never trust API/callback URLs from webhook payloads.

Derive GitLab API calls from the configured connection base URL.

---

## 47.25 Provider HTTP client wrapper

Conceptual:

```ts
@Injectable()
export class GitLabClient {
  async getProject(
    connection: GitLabConnection,
    projectId: string
  ): Promise<GitLabProject> {
    const credentials = await this.credentials.get(connection.id);

    return this.http.get(
      new URL(
        `/api/v4/projects/${encodeURIComponent(projectId)}`,
        connection.baseUrl
      ).toString(),
      {
        headers: {
          'PRIVATE-TOKEN': credentials.token,
        },
      }
    );
  }
}
```

Do not construct provider API requests from raw webhook URLs.

---

## 47.26 Repository model

Conceptual:

```ts
type DevelopmentRepository = {
  id: string;
  workspaceId: string;
  connectionId: string;
  externalId: string;
  name: string;
  fullName: string;
  webUrl: string;
  enabled: boolean;
};
```

A webhook repository must resolve by:

```text
connectionId + externalRepositoryId
```

to a configured repository.

Do not automatically trust every repository visible to a broad GitLab token.

---

## 47.27 Frontend Development section

Use existing AFFiNE data-fetching and UI primitives.

Conceptual component:

```tsx
function DevelopmentSection({ taskId }: { taskId: string }) {
  const { data, isLoading, error, refetch } = useDevelopmentInfo(taskId);

  if (isLoading) {
    return <DevelopmentSectionSkeleton />;
  }

  if (error) {
    return (
      <DevelopmentSectionError
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (!data || data.isEmpty) {
    return null;
  }

  return (
    <DevelopmentPanel>
      <RepositoryGroup repositories={data.repositories} />
      <BranchGroup branches={data.branches} />
      <MergeRequestGroup mergeRequests={data.mergeRequests} />
      <CommitGroup commits={data.commits} />
      <PipelineGroup pipelines={data.pipelines} />
    </DevelopmentPanel>
  );
}
```

The Development section must have independent loading/error states.

---

## 47.28 Error isolation

Do not implement:

```text
open task
→ call GitLab
→ call Jenkins
→ wait for both
→ render task
```

Preferred:

```text
open task
→ read normalized stored data
→ render task immediately
```

If the integrations are unavailable, only the Development section may degrade.

The task itself must remain usable.

---

## 47.29 External content rendering

These are untrusted external strings:

```text
commit message
branch name
MR title
MR description
pipeline name
repository name
author name
```

Never render them through:

```tsx
dangerouslySetInnerHTML
```

Use normal escaped text rendering and existing sanitization helpers.

---

## 47.30 i18n pattern

Bad:

```tsx
<Button>Open pipeline</Button>
```

Better, conceptually:

```tsx
<Button>
  {t['com.affine.trackwork.development.openPipeline']()}
</Button>
```

Copy the actual nearby AFFiNE i18n API and key conventions.

Do not introduce a second i18n system.

Translate UI labels only.

Do not translate:

```text
TW-142
feature/TW-142-auth
Fix refresh token
auth-service
```

---

## 47.31 GraphQL aggregate shape

If TrackWork currently uses GraphQL, prefer a compact aggregate.

Conceptual schema:

```graphql
type TrackWorkDevelopmentInfo {
  repositories: [DevelopmentRepository!]!
  branches: [DevelopmentBranch!]!
  commits: [DevelopmentCommit!]!
  mergeRequests: [DevelopmentMergeRequest!]!
  pipelines: [DevelopmentPipeline!]!
}

extend type TrackWorkTask {
  development: TrackWorkDevelopmentInfo!
}
```

Do not use this if TrackWork's real transport layer is not GraphQL.

---

## 47.32 Avoid N+1 queries

Bad:

```ts
for (const task of tasks) {
  task.development = await loadDevelopment(task.id);
}
```

For board/list views, use a compact summary if needed:

```ts
type DevelopmentSummary = {
  openMergeRequests: number;
  failedPipelines: number;
  latestPipelineStatus?: PipelineStatus;
  linkedCommitCount: number;
};
```

Detailed development data should load when task details are opened.

---

## 47.33 Suggested DB constraints

Conceptual constraints:

```text
TrackWork task:
UNIQUE(workspace_id, key)

Repository:
UNIQUE(connection_id, external_id)

Development link:
UNIQUE(task_id, repository_id, entity_type, external_id)

Webhook event:
UNIQUE(connection_id, idempotency_key)

Pipeline:
UNIQUE(connection_id, external_id)
```

Likely useful indexes:

```text
(task_id)
(connection_id)
(repository_id)
(workspace_id, key)
(connection_id, idempotency_key)
(repository_id, commit_sha)
```

Inspect actual query patterns before adding indexes.

---

## 47.34 Authorization pattern

Every write must authorize server-side.

Conceptual:

```ts
const task = await this.taskService.get(taskId);

await this.permissionService.assertCanEditTask({
  userId: currentUser.id,
  workspaceId: task.workspaceId,
  taskId: task.id,
});
```

Integration configuration should require admin/owner-level permission using existing AFFiNE permission helpers.

Never trust a frontend-provided `workspaceId` without authorization.

---

## 47.35 Status automation uses stage IDs

Never identify stages using localized labels.

Bad:

```ts
moveTask(task.id, 'Review');
```

Better:

```ts
const rule = await automationRepository.findMatchingRule({
  workspaceId: task.workspaceId,
  trigger: 'merge_request.merged',
});

if (rule?.action.type === 'task.move') {
  await taskService.moveTask({
    taskId: task.id,
    stageId: rule.action.stageId,
  });
}
```

Do not compare:

```text
Review
На проверке
Done
Готово
```

inside business logic.

---

## 47.36 Quick webhook responses

Preferred request lifecycle:

```text
authenticate
validate minimal payload
enqueue
return success
```

Do not synchronously perform:

```text
GitLab API requests
task linking
timeline writes
automation execution
```

before acknowledging the webhook if existing AFFiNE queue infrastructure is suitable.

---

## 47.37 Retry behavior

Retry transient errors:

```text
temporary DB error
temporary GitLab/Jenkins API failure
worker timeout
```

Do not endlessly retry permanent errors:

```text
invalid signature
invalid JSON schema
disabled connection
cross-workspace task reference
unsupported event
```

Use existing BullMQ backoff/retry conventions.

---

## 47.38 Parser unit tests

Example:

```ts
describe('extractTrackWorkKeys', () => {
  it('extracts a normal task key', () => {
    expect(
      extractTrackWorkKeys('fix(auth): TW-142 refresh token')
    ).toEqual(['TW-142']);
  });

  it('normalizes case', () => {
    expect(
      extractTrackWorkKeys('feature/tw-142-refresh')
    ).toEqual(['TW-142']);
  });

  it('deduplicates keys', () => {
    expect(
      extractTrackWorkKeys('TW-142 [TW-142]')
    ).toEqual(['TW-142']);
  });

  it('extracts multiple keys', () => {
    expect(
      extractTrackWorkKeys('TW-142 relates to TW-151')
    ).toEqual(['TW-142', 'TW-151']);
  });
});
```

---

## 47.39 Workspace-isolation test

Conceptual:

```ts
it('does not link workspace B task from workspace A integration', async () => {
  const connectionA = await createGitLabConnection({
    workspaceId: workspaceA.id,
  });

  const taskB = await createTask({
    workspaceId: workspaceB.id,
    key: 'TW-142',
  });

  await sendGitLabCommitWebhook(connectionA, {
    message: 'fix: TW-142',
  });

  const links = await developmentLinkRepository.findByTaskId(taskB.id);

  expect(links).toHaveLength(0);
});
```

Add a positive same-workspace test too.

---

## 47.40 Idempotency test

```ts
it('does not duplicate the same commit webhook', async () => {
  const payload = createGitLabPushPayload({
    eventId: 'evt-123',
    commitSha: 'abc123',
    message: 'TW-142 fix auth',
  });

  await sendWebhook(payload);
  await sendWebhook(payload);
  await sendWebhook(payload);

  const commits = await findTaskCommits('TW-142');

  expect(commits).toHaveLength(1);
});
```

Also verify that timeline events are not duplicated.

---

## 47.41 Pipeline update test

```ts
it('updates existing Jenkins pipeline status', async () => {
  await sendCiEvent({
    eventId: 'job-42-running',
    pipeline: {
      externalId: 'auth-service/42',
      name: 'auth-service',
      status: 'running',
    },
    taskKeys: ['TW-142'],
  });

  await sendCiEvent({
    eventId: 'job-42-success',
    pipeline: {
      externalId: 'auth-service/42',
      name: 'auth-service',
      status: 'success',
    },
    taskKeys: ['TW-142'],
  });

  const pipelines = await findTaskPipelines('TW-142');

  expect(pipelines).toHaveLength(1);
  expect(pipelines[0].status).toBe('success');
});
```

---

## 47.42 Compact frontend layout

Conceptually:

```tsx
<Section title={t['...development.title']()}>
  <DevelopmentGroup title={t['...development.mergeRequests']()}>
    {mergeRequests.map(mr => (
      <MergeRequestItem key={mr.id} mergeRequest={mr} />
    ))}
  </DevelopmentGroup>

  <DevelopmentGroup title={t['...development.commits']()}>
    {commits.map(commit => (
      <CommitItem key={commit.sha} commit={commit} />
    ))}
  </DevelopmentGroup>

  <DevelopmentGroup title={t['...development.pipelines']()}>
    {pipelines.map(pipeline => (
      <PipelineItem key={pipeline.id} pipeline={pipeline} />
    ))}
  </DevelopmentGroup>
</Section>
```

Do not display unlimited history by default.

Suggested initial limits:

```text
commits: 5–10
merge requests: 5
pipelines: 5
activity: 20–50
```

Then provide pagination / "Show all".

---

## 47.43 Anti-pattern: direct GitLab calls from React

Never:

```tsx
fetch('https://gitlab.example.org/api/v4/projects/...', {
  headers: {
    'PRIVATE-TOKEN': token,
  },
});
```

The browser must never receive server-side integration credentials.

All provider calls go through the AFFiNE backend.

---

## 47.44 Anti-pattern: provider-specific tables everywhere

Avoid:

```text
trackwork_gitlab_commits
trackwork_gitlab_merge_requests
trackwork_jenkins_builds
```

unless the existing architecture gives a very strong reason.

Prefer provider-neutral concepts:

```text
development_repositories
development_commits
development_merge_requests
development_pipelines
development_task_links
```

with connection/provider references.

---

## 47.45 Anti-pattern: giant JSON dump

Avoid:

```ts
task.development = {
  gitlab: { ...raw huge payload... },
  jenkins: { ...raw huge payload... }
};
```

Important IDs, relationships and statuses should remain queryable/indexable.

Provider-specific JSON metadata may contain only optional extra fields.

---

## 47.46 Anti-pattern: title-based linking

Never associate work by task title.

Bad:

```text
Fix authentication
```

Good:

```text
TW-142
```

Titles are mutable and non-unique.

Keys are stable.

---

## 47.47 Anti-pattern: hidden workflow changes

Do not silently change task state when an MR or pipeline changes.

Automation must be:

```text
visible
configurable
disableable
workspace-scoped
```

Default behavior should link development information without surprising workflow changes.

---

## 47.48 Anti-pattern: generated-code patches

Never manually patch generated GraphQL output.

Correct flow:

```text
source schema/document
        ↓
codegen
        ↓
generated artifact
        ↓
consumer import
```

If an export is missing, fix the source/codegen path.

---

## 47.49 Anti-pattern: broad unrelated refactor

Do not use this feature to:

```text
rewrite the task store
replace the permission system
replace i18n
replace queue infrastructure
rewrite unrelated AFFiNE modules
```

Small supporting refactors are acceptable only when necessary and justified.

---

# 48. DeepSeek execution template

DeepSeek should follow this pattern for every milestone.

## Step A — inspect first

Report:

```text
Existing files involved:
- ...

Reusable infrastructure:
- ...

Schema implications:
- ...

Risks:
- ...
```

Do not immediately write large amounts of code.

---

## Step B — propose exact files

Before editing:

```text
I will change:

1. file A
   - add X
   - reuse Y

2. file B
   - add Z

3. migration C
   - add fields/indexes

No unrelated modules will be changed.
```

---

## Step C — implement one vertical slice

Example first slice:

```text
stable task key
+
parser
+
tests
```

Do not implement GitLab + Jenkins + automations + document integration in one pass.

---

## Step D — verify immediately

After each slice run:

```text
targeted tests
typecheck for touched package
lint for touched package
```

Fix failures before expanding scope.

---

## Step E — report actual result

Use:

```text
Changed:
- ...

Tests executed:
- PASS ...
- FAIL ...

Remaining:
- ...

Known limitations:
- ...
```

Never claim a command passed if it was not actually run.

---

# 49. DeepSeek decision rules

## Rule 1

If AFFiNE already has infrastructure for:

```text
permissions
jobs
secrets
GraphQL
i18n
HTTP clients
migrations
events
```

reuse it.

## Rule 2

If the exact existing abstraction is unclear:

```text
inspect more code
```

Do not invent a parallel subsystem.

## Rule 3

If a provider-specific type crosses into generic TrackWork logic:

```text
normalize it first
```

## Rule 4

If an external event references a task:

```text
scope lookup to integration.workspaceId
```

before reading or modifying that task.

## Rule 5

If webhook retries can duplicate data:

```text
use DB-backed idempotency
```

not an in-memory check.

## Rule 6

If integration data fails:

```text
degrade only the Development section
```

not the complete task UI.

## Rule 7

If a feature is not listed in the current milestone:

```text
do not implement it yet
```

unless required for correctness.

## Rule 8

**Deployments / Environments are explicitly out of scope.**

Do not add:

```text
deployment entities
environment entities
deployment UI
environment UI
deployment automation triggers
```

---

# 50. Suggested first coding task for DeepSeek

Start with a deliberately narrow task.

```text
Implement only Milestone 1 foundation:

1. Inspect the current TrackWork persistence/API/frontend model.
2. Add stable immutable TrackWork task keys.
3. Add safe atomic key generation.
4. Backfill existing tasks without data loss.
5. Add a unique database constraint.
6. Add the reusable task-key parser.
7. Add unit tests for key generation and parsing.
8. Expose the key in the existing TrackWork task DTO/API/UI.
9. Do not implement GitLab or Jenkins yet.
10. Run relevant tests, typecheck and build for touched packages.
```

Expected result:

```text
TW-1
TW-2
TW-3
...
```

Existing UUIDs remain unchanged.

This is the foundation for every later GitLab/Jenkins integration feature.
