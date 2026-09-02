# Proposal: TrackWork Product Roadmap

## Why

TrackWork has evolved beyond a simple AFFiNE task-board experiment. The current fork already includes task boards, configurable stages and transitions, task/document references, related documents, task relations, GitLab development data, branch/MR creation, automation hooks, self-hosted administration, and Russian localization.

The next risk is uncontrolled feature growth. Without a product-level specification, new capabilities can become tightly coupled, duplicate AFFiNE concepts, or turn TrackWork into an unfocused enterprise suite.

This change establishes a staged product roadmap and architectural constraints before further implementation.

## Product direction

TrackWork SHALL become an integrated workspace combining:

1. knowledge and documents,
2. project/task planning,
3. software-development activity,
4. automation and notifications,
5. operational analytics.

The differentiator SHALL be the shared workspace model: tasks, documents, development artifacts, and planning objects should reference each other directly rather than behave as separate applications glued together by links.

## What changes

The roadmap introduces seven capability areas:

- platform stability and operability,
- task-management maturity,
- backlog/sprint/release planning,
- deep document and knowledge integration,
- provider-neutral development center,
- notifications and inbox,
- analytics, API, webhooks, and automation.

## Delivery order

### Phase 1 — Stability and task-management foundation

Make the current product safe to operate and pleasant for daily use. Focus on migrations, permissions, auditability, error states, production-image tests, comments/activity, saved filters, bulk actions, archive, templates, watchers, and search.

### Phase 2 — Planning

Add backlog, sprint lifecycle, epics, estimates, releases, milestones, and roadmap/timeline views without attempting to reproduce every Jira feature.

### Phase 3 — Knowledge integration

Make documents first-class participants in task workflows: live task references, task blocks, meeting-note action items, backlinks, document-to-epic/sprint/release associations, and synchronized checklist behavior.

### Phase 4 — Development center

Polish GitLab support and generalize the SCM abstraction for GitHub and later providers. Surface branches, commits, merge requests, pipelines, deployments, and environments against tasks.

### Phase 5 — Notifications and analytics

Add actionable inbox notifications, delivery preferences, workload and flow analytics, sprint analytics, engineering metrics, and reliable event history.

### Phase 6 — API and automation platform

Expose stable APIs, tokens, incoming/outgoing webhooks, and a rule engine for task/development automation.

### Phase 7 — Productization

Complete TrackWork branding, onboarding, installation/upgrade flows, backup/restore, health/status, release notes, authentication integrations, and administrator documentation.

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

- a team can use TrackWork as its primary planning and engineering-workspace tool,
- common workflows do not require Jira/Linear plus a separate knowledge base for the same project,
- task/document/development relationships remain coherent and queryable,
- self-hosted upgrades are predictable and migration-safe,
- every major new capability has explicit permissions, observability, i18n, tests, and API boundaries.