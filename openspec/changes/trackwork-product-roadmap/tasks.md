# Tasks: TrackWork Product Roadmap

This checklist is intentionally staged. Later phases should not be implemented wholesale before the acceptance criteria of earlier phases are met.

## 1. Stability and operability

- [ ] 1.1 Define supported self-hosted upgrade path and version compatibility policy.
- [ ] 1.2 Add migration tests for existing Task Tracker workspaces and boards.
- [ ] 1.3 Add production Docker upgrade smoke test using persisted data from previous supported version.
- [ ] 1.4 Define TrackWork capability permissions and replace scattered administrator-only checks where appropriate.
- [ ] 1.5 Add archive semantics for tasks and workflow/planning entities that require history retention.
- [ ] 1.6 Ensure all TrackWork surfaces have loading, empty, permission-denied, recoverable-error, and fatal-error states.
- [ ] 1.7 Complete i18n coverage for all current TrackWork strings and ensure system defaults are translated by stable IDs.
- [ ] 1.8 Add structured audit events for task/workflow/integration configuration changes.
- [ ] 1.9 Add observability for task allocation, webhook failures, provider API failures, and automation execution.
- [ ] 1.10 Validate current implementation with a large-workspace fixture containing at least hundreds of tasks.

## 2. Daily task-management maturity

- [ ] 2.1 Add comments with author, timestamp, edit/delete rules, and mentions.
- [ ] 2.2 Add watchers/followers and task subscription state.
- [ ] 2.3 Consolidate task history into a durable activity timeline.
- [ ] 2.4 Add saved filters and named views.
- [ ] 2.5 Add sorting and grouping by assignee, type, priority, labels, and due date.
- [ ] 2.6 Add swimlane representation where compatible with board mode.
- [ ] 2.7 Add bulk selection and bulk field/status/archive actions.
- [ ] 2.8 Add task duplication and task templates.
- [ ] 2.9 Add fast lookup by task key and workspace-scoped full-text task search.
- [ ] 2.10 Add explicit archive and restore UI.

## 3. Planning

- [ ] 3.1 Introduce a backlog independent from active board columns.
- [ ] 3.2 Add sprint entity and sprint lifecycle: planned, active, completed.
- [ ] 3.3 Add sprint planning and move tasks between backlog/sprints.
- [ ] 3.4 Add estimates/story points with workspace configuration.
- [ ] 3.5 Add Epic hierarchy and Epic-to-task/story relationships.
- [ ] 3.6 Add release/version and milestone entities.
- [ ] 3.7 Add roadmap/timeline view for epics/releases/milestones.
- [ ] 3.8 Add sprint burndown and velocity only after sprint event history is durable.

## 4. Knowledge integration

- [ ] 4.1 Convert recognized task keys in documents into durable task references without affecting code blocks/plain-text contexts that opt out.
- [ ] 4.2 Add live task card/block embedding inside documents.
- [ ] 4.3 Add task creation from selected document text with provenance back to the source document/block.
- [ ] 4.4 Add backlinks showing documents that reference a task.
- [ ] 4.5 Allow documents to associate with Epic, Sprint, Release, and Milestone entities.
- [ ] 4.6 Add meeting/action-item workflow for creating tasks from notes.
- [ ] 4.7 Evaluate synchronized checklist/task-state behavior and specify conflict rules before implementation.
- [ ] 4.8 Add templates for sprint planning, review, retrospective, and release notes that query current planning context.

## 5. Development Center

- [ ] 5.1 Document and stabilize the provider-neutral `ScmProvider` capability contract.
- [ ] 5.2 Complete GitLab repository, branch, commit, MR, pipeline, deployment, and environment normalization.
- [ ] 5.3 Add workspace Development Center view across tracked repositories.
- [ ] 5.4 Add task Development section showing associated artifacts and status.
- [ ] 5.5 Add durable webhook idempotency and replay handling.
- [ ] 5.6 Add GitHub provider with parity for the agreed provider capabilities.
- [ ] 5.7 Keep Gitea/Forgejo and Bitbucket as later provider changes unless specifically prioritized.

## 6. Notifications and Inbox

- [ ] 6.1 Define notification event types and deduplication rules.
- [ ] 6.2 Add unified TrackWork items to AFFiNE Inbox.
- [ ] 6.3 Notify on assignment, mention, watched-task changes, blocked state, due dates, MR review-relevant events, failed pipelines, and automation warnings.
- [ ] 6.4 Add per-user notification preferences and watcher controls.
- [ ] 6.5 Add digest/batching strategy for noisy development events.
- [ ] 6.6 Add optional external channels only through separate integration changes.

## 7. Analytics

- [ ] 7.1 Define authoritative event/fact sources for task-flow analytics.
- [ ] 7.2 Add created/completed counts, cycle time, lead time, overdue, blocked, and cumulative flow metrics.
- [ ] 7.3 Add workload views by assignee/team dimension available in AFFiNE workspace membership.
- [ ] 7.4 Add sprint velocity and burndown after sprint lifecycle ships.
- [ ] 7.5 Add engineering lifecycle metrics: task-to-branch, task-to-MR, MR-to-merge, merge-to-deploy, deployment frequency, pipeline failure rate.
- [ ] 7.6 Ensure analytics aggregation can be rebuilt or reconciled from durable source data.

## 8. API, webhooks, and automation

- [ ] 8.1 Define stable external TrackWork API boundaries and versioning policy.
- [ ] 8.2 Add scoped API tokens/credentials suitable for automation clients.
- [ ] 8.3 Add outgoing webhooks with signing, retries, delivery history, and replay.
- [ ] 8.4 Add normalized incoming webhook/event ingestion boundary.
- [ ] 8.5 Implement automation rules as trigger + conditions + actions.
- [ ] 8.6 Persist automation execution records and idempotency keys.
- [ ] 8.7 Support development-triggered task transitions and warnings without hardcoding provider-specific behavior.
- [ ] 8.8 Add scheduled automation only after event-driven execution is stable.

## 9. Productization

- [ ] 9.1 Complete TrackWork branding across self-hosted user/admin surfaces.
- [ ] 9.2 Add installation/onboarding wizard for required self-hosted configuration.
- [ ] 9.3 Add backup/restore documentation and verification flow.
- [ ] 9.4 Add health/status surface for database, Redis, migrations, integrations, and background processing.
- [ ] 9.5 Define release/versioning and release-note process.
- [ ] 9.6 Document SMTP, OIDC/SSO, LDAP/directory, base URL, storage, and proxy configuration as applicable.
- [ ] 9.7 Ensure telemetry is transparent and opt-in for TrackWork-specific collection.

## 10. Release gates

- [ ] 10.1 All new user-facing strings are localized at least for English and Russian.
- [ ] 10.2 New persistent entities have migration and upgrade tests.
- [ ] 10.3 New privileged operations have explicit permission tests.
- [ ] 10.4 New integration/webhook handlers are idempotent and tested for retries/duplicates.
- [ ] 10.5 Critical workflows pass self-hosted production-image smoke/e2e tests.
- [ ] 10.6 Documentation and OpenSpec requirements are updated before a capability is considered complete.