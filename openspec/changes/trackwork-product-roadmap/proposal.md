# Proposal: TrackWork Product Roadmap

## Why

TrackWork has evolved beyond a simple AFFiNE task-board experiment. The current fork already includes task boards, configurable stages and transitions, task/document references, related documents, task relations, GitLab development data, branch/MR creation, automation hooks, self-hosted administration, operational dashboard data, and Russian localization.

The next risk is uncontrolled feature growth. Without a product-level specification, new capabilities can become tightly coupled, duplicate AFFiNE concepts, weaken security boundaries, or turn TrackWork into an unfocused enterprise suite.

This change establishes a staged product roadmap, security baseline, administrator control-plane direction, and architectural constraints before further implementation.

## Product direction

TrackWork SHALL become an integrated workspace combining:

1. knowledge and documentation,
2. project/task planning,
3. software-development activity,
4. automation and notifications,
5. operational analytics and administration,
6. security suitable for self-hosted organizational data.

The differentiator SHALL be the shared workspace model: tasks, documents, development artifacts, and planning objects should reference each other directly rather than behave as separate applications glued together by links.

TrackWork SHALL also preserve normal documentation use. A document/page SHALL NOT require association with a Kanban board, task, sprint, epic, release, or other planning entity.

## Security as a product goal

Security is a release criterion, not a later hardening phase.

TrackWork SHALL maintain a documented threat model and verification program covering at minimum:

- authentication and session handling,
- authorization and object-level access control / IDOR,
- SQL/ORM/GraphQL injection paths,
- command/template/path injection where applicable,
- stored and reflected XSS,
- CSRF for state-changing browser actions,
- SSRF through URL preview, integrations, imports, webhooks, AI/provider configuration, and admin-configured endpoints,
- unsafe redirects and URL handling,
- file upload/download validation and authorization,
- webhook authenticity, replay, and duplicate delivery,
- GraphQL query complexity/depth and abusive pagination,
- secrets handling and accidental logging,
- dependency and container vulnerabilities,
- privilege escalation through admin/configuration APIs.

Critical authorization checks SHALL be performed server-side and SHALL NOT rely on hidden UI controls.

Every release candidate SHOULD include automated dependency/SAST checks and security-focused integration tests. Major releases SHALL receive an explicit application-security review before production use.

## Encryption and quorum unlock goal

TrackWork SHALL introduce application-level encryption for designated sensitive data and a startup unlock mechanism based on a **2-of-3 administrator key quorum**.

The target behavior is:

- a high-value data-encryption key (DEK) SHALL never be stored persistently in plaintext;
- the key material required to unwrap the DEK SHALL require any two of three independently held administrator key shares;
- after process start/restart, encrypted application data remains locked until two valid administrators approve/unlock the instance;
- one administrator key alone SHALL be insufficient to decrypt protected data;
- losing one of the three administrator shares SHALL NOT make the deployment unrecoverable;
- unlock, key rotation, share replacement, failed approvals, and recovery operations SHALL be audited;
- plaintext administrator shares SHALL NOT be stored in PostgreSQL, Redis, application config, container images, logs, or browser local storage.

The exact cryptographic construction SHALL be specified in `security-crypto/spec.md` and `design.md` before implementation. The system SHALL prefer established primitives/libraries over custom cryptography.

## What changes

The roadmap introduces ten capability areas:

- platform stability and operability,
- security and quorum-controlled encryption,
- administrator control plane,
- task-management maturity,
- backlog/sprint/release planning,
- deep document and knowledge integration,
- provider-neutral development center,
- notifications and inbox,
- analytics, API, webhooks, and automation,
- productization.

## Delivery order

### Phase 1 — Stability, security baseline, and administration

Make the current product safe to operate. Focus on migrations, permissions, auditability, error states, production-image tests, structured logging, Prometheus metrics, security regression tests, administrator health/status, configuration visibility, and the design/prototype of quorum unlock.

### Phase 2 — Task-management foundation

Focus on comments/activity, saved filters, bulk actions, archive, templates, watchers, search, and consistent task permissions.

### Phase 3 — Planning

Add backlog, sprint lifecycle, epics, estimates, releases, milestones, and roadmap/timeline views without attempting to reproduce every Jira feature.

### Phase 4 — Knowledge integration

Make documents first-class participants in task workflows while preserving standalone documentation: live task references, task blocks, meeting-note action items, backlinks, document-to-epic/sprint/release associations, and ordinary pages/folders that have no Task Tracker dependency.

### Phase 5 — Development center

Complete and harden GitLab support, then generalize the SCM abstraction for GitHub and later providers. Surface branches, commits, merge requests, pipelines, deployments, and environments against tasks.

### Phase 6 — Notifications and analytics

Add actionable inbox notifications, delivery preferences, workload and flow analytics, sprint analytics, engineering metrics, and reliable event history.

### Phase 7 — API and automation platform

Expose stable APIs, tokens, incoming/outgoing webhooks, and a rule engine for task/development automation.

### Phase 8 — Productization

Complete TrackWork branding, onboarding, installation/upgrade flows, backup/restore, expanded health/status, release notes, authentication integrations, administrator documentation, security operations, and recovery procedures.

## Explicit non-goals for this roadmap

The following are intentionally deferred unless a later OpenSpec change justifies them:

- CRM,
- invoicing or accounting,
- helpdesk/ticketing as a separate product,
- employee time tracking,
- payroll,
- broad ERP functionality.

TrackWork should not become a generic corporate suite before the core Knowledge + Project Management + Development experience is excellent.

## Success criteria

The roadmap is successful when:

- a team can use TrackWork as its primary planning, documentation, and engineering-workspace tool,
- users can create documentation without creating or joining a Kanban/planning structure,
- common workflows do not require Jira/Linear plus a separate knowledge base for the same project,
- task/document/development relationships remain coherent and queryable,
- self-hosted upgrades are predictable and migration-safe,
- the admin panel exposes actionable system health, configuration, audit, security, and integration state,
- Prometheus-compatible metrics and structured logs can be routed into standard observability stacks,
- security tests cover common web/API vulnerability classes and object-level authorization,
- protected application data can require a 2-of-3 administrator quorum to unlock after startup,
- every major new capability has explicit permissions, observability, i18n, tests, security considerations, and API boundaries.