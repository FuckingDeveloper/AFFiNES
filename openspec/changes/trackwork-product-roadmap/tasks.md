# Tasks: TrackWork Product Roadmap

This checklist is intentionally staged. Later phases should not be implemented wholesale before the acceptance criteria of earlier phases are met.

Implementation agents such as Codex/DeepSeek SHALL read `proposal.md`, `design.md`, the relevant capability spec, and the existing code paths referenced by `design.md` before changing application code.

## 1. Stability, security baseline, and operability

- [ ] 1.1 Define supported self-hosted upgrade path and version compatibility policy.
- [ ] 1.2 Add migration tests for existing Task Tracker workspaces and boards, including legacy JSON-string task properties.
- [ ] 1.3 Add production Docker upgrade smoke test using persisted data from previous supported version.
- [ ] 1.4 Define TrackWork capability permissions and replace scattered administrator-only checks where appropriate.
- [ ] 1.5 Add cross-workspace/object authorization tests for tasks, documents, integrations, planning entities, attachments and admin-only operations to detect IDOR regressions.
- [ ] 1.6 Add archive semantics for tasks and workflow/planning entities that require history retention.
- [ ] 1.7 Ensure all TrackWork surfaces have loading, empty, permission-denied, recoverable-error and fatal-error states.
- [ ] 1.8 Complete i18n coverage for all current TrackWork strings and ensure system defaults are translated by stable IDs.
- [ ] 1.9 Add structured audit events for task/workflow/integration/configuration/security changes.
- [ ] 1.10 Validate current implementation with a large-workspace fixture containing at least hundreds of tasks.
- [ ] 1.11 Add dependency vulnerability scanning to release CI.
- [ ] 1.12 Add secret scanning and security-focused static analysis/linting to release CI.
- [ ] 1.13 Add release-image/container vulnerability scanning.
- [ ] 1.14 Add targeted security integration tests for injection, XSS, SSRF, webhook replay/signature validation, file/blob authorization, abusive pagination/query complexity, and privilege escalation.
- [ ] 1.15 Document a security review checklist and require explicit review/risk acceptance for critical/high findings before major production releases.

## 2. Observability

- [x] 2.1 Identify the repository's existing metrics/logger abstractions and extend them rather than introducing a parallel stack.
- [x] 2.2 Expose Prometheus-compatible TrackWork/server metrics through a documented scrape endpoint.
- [x] 2.3 Add bounded HTTP/GraphQL request latency/error metrics using low-cardinality labels.
- [x] 2.4 Add webhook receive/process/failure/retry metrics.
- [x] 2.5 Add SCM provider request latency/failure metrics.
- [ ] 2.6 Add automation execution/failure/retry metrics.
- [ ] 2.7 Add notification/job/queue failure and queue-depth metrics where supported.
- [ ] 2.8 Add encryption state/unlock result metrics without exposing administrator/key identity or secret material.
- [x] 2.9 Standardize structured server log fields: timestamp, level, component/service, event/operation, result, correlation ID and safe entity/provider context.
- [x] 2.10 Add automated tests that reject/redact passwords, access tokens, authorization headers, quorum shares, encryption keys and protected content from logs.
- [x] 2.11 Propagate correlation IDs across request -> webhook/job -> provider -> automation -> notification paths where practical.
- [x] 2.12 Add self-hosted documentation/examples for collecting container logs into Grafana Loki using Grafana Alloy/Promtail-compatible agents.
- [x] 2.13 Add self-hosted documentation/examples for collecting structured logs into Elasticsearch/OpenSearch using Vector, Fluent Bit, Logstash or Data Prepper-style pipelines.
- [ ] 2.14 Evaluate optional OTLP logs/traces after the structured logging/correlation model is stable.

## 3. Security and quorum-controlled encryption

- [ ] 3.1 Produce a persisted-data/secrets classification identifying which values require application-level encryption.
- [ ] 3.2 Select mature libraries/primitives for AEAD envelope encryption and threshold secret sharing; document the exact algorithms/library versions before implementation.
- [ ] 3.3 Introduce a versioned encrypted-value envelope and key identifier model.
- [ ] 3.4 Generate a random DEK using the runtime CSPRNG and implement authenticated encryption/decryption through a dedicated crypto service.
- [ ] 3.5 Implement KEK wrapping/unwrapping so the persisted DEK is never stored plaintext.
- [ ] 3.6 Implement generation of three administrator shares with threshold two using a mature secret-sharing implementation.
- [ ] 3.7 Ensure plaintext administrator shares are exported to administrators and are never persisted in PostgreSQL, Redis, config files, images, logs or localStorage.
- [ ] 3.8 Add persistent encryption metadata containing only safe key/version/share identifiers and quorum policy metadata.
- [ ] 3.9 Implement `disabled | locked | unlocked` encryption-state service.
- [ ] 3.10 Implement a short-lived startup unlock ceremony with ceremony IDs, replay resistance and distinct-administrator/share enforcement.
- [ ] 3.11 Keep protected integrations/jobs/features paused while encryption state is locked.
- [ ] 3.12 Unlock only after two valid independent shares and keep reconstructed KEK/unwrapped DEK in process memory only.
- [ ] 3.13 Add tests proving one share cannot unlock and any valid pair from three can unlock.
- [ ] 3.14 Add tests proving restart returns to locked state when quorum encryption is enabled.
- [ ] 3.15 Add audited key rotation and re-wrapping flow.
- [ ] 3.16 Add administrator-share replacement/revocation flow that invalidates old compromised shares.
- [ ] 3.17 Document and test recovery when one of three shares is permanently lost.
- [ ] 3.18 Add cryptographic format/key version migration tests.
- [ ] 3.19 Perform a dedicated cryptographic design/security review before enabling quorum encryption by default.

## 4. Administrator control plane

- [ ] 4.1 Preserve existing admin application/navigation and extend `packages/frontend/admin/src/modules/dashboard` and settings rather than creating another admin SPA.
- [ ] 4.2 Introduce a backend `AdminSystemStatus`-style operations contract separate from workspace/product analytics.
- [ ] 4.3 Report application version/build, uptime, deployment type and encryption state.
- [ ] 4.4 Add PostgreSQL and Redis connectivity/latency/degraded-state diagnostics.
- [ ] 4.5 Add storage-provider health and usage/capacity data where the provider supports it.
- [ ] 4.6 Add migration/schema status and pending/failed migration diagnostics.
- [ ] 4.7 Add background queue/job health and recent failure visibility.
- [ ] 4.8 Add SMTP health/test result visibility using existing mailer test patterns.
- [ ] 4.9 Add SCM integration/provider health with sanitized errors and last-success information.
- [ ] 4.10 Add webhook, automation and notification operational health summaries.
- [ ] 4.11 Add recent critical/warning operational events to the admin dashboard.
- [ ] 4.12 Add backup freshness/status only where TrackWork has verifiable backup metadata; never synthesize a successful backup state.
- [ ] 4.13 Add observability export/status section for Prometheus and log collection configuration.
- [ ] 4.14 Add Security section showing lock/quorum setup state, last rotation, auth mode and security warnings without exposing secrets.
- [ ] 4.15 Add startup unlock ceremony UI/API showing ceremony ID and `approvals/threshold` progress without exposing submitted shares.
- [ ] 4.16 Expand admin audit filtering/search by actor, category, target, result and time range.
- [ ] 4.17 Make secret-backed settings write-only/read-masked: expose configured/source state, never existing plaintext.
- [ ] 4.18 Add explicit replace/clear secret operations so masked/empty UI values cannot unintentionally overwrite existing secrets.
- [ ] 4.19 Add validation/test-before-save or safe staged activation for high-impact auth, SMTP, storage, SCM, webhook, observability and network settings where feasible.
- [ ] 4.20 Add maintenance mode with visible user/admin state and restricted state-changing operations.

## 5. Daily task-management maturity

- [ ] 5.1 Add comments with author, timestamp, edit/delete rules, and mentions.
- [ ] 5.2 Add watchers/followers and task subscription state.
- [ ] 5.3 Consolidate task history into a durable activity timeline.
- [ ] 5.4 Add saved filters and named views.
- [ ] 5.5 Add sorting and grouping by assignee, type, priority, labels, and due date.
- [ ] 5.6 Add swimlane representation where compatible with board mode.
- [ ] 5.7 Add bulk selection and bulk field/status/archive actions.
- [ ] 5.8 Add task duplication and task templates.
- [ ] 5.9 Add fast lookup by task key and workspace-scoped full-text task search.
- [ ] 5.10 Add explicit archive and restore UI.

## 6. Planning

- [ ] 6.1 Introduce a backlog independent from active board columns.
- [ ] 6.2 Add sprint entity and sprint lifecycle: planned, active, completed.
- [ ] 6.3 Add sprint planning and move tasks between backlog/sprints.
- [ ] 6.4 Add estimates/story points with workspace configuration.
- [ ] 6.5 Add Epic hierarchy and Epic-to-task/story relationships.
- [ ] 6.6 Add release/version and milestone entities.
- [ ] 6.7 Add roadmap/timeline view for epics/releases/milestones.
- [ ] 6.8 Add sprint burndown and velocity only after sprint event history is durable.

## 7. Knowledge and documentation integration

- [ ] 7.1 Verify ordinary AFFiNE pages remain creatable/editable without Task Tracker properties or board/planning membership.
- [ ] 7.2 Preserve/extend standalone documentation navigation/hierarchy and templates without introducing synthetic task entities.
- [ ] 7.3 Add optional links from existing standalone documents to Epic, Sprint, Release and Milestone entities without changing document identity.
- [ ] 7.4 Convert recognized task keys in documents into durable task references without affecting code blocks/plain-text contexts that opt out.
- [ ] 7.5 Add live task card/block embedding inside documents.
- [ ] 7.6 Add task creation from selected document text with provenance back to the source document/block.
- [ ] 7.7 Add backlinks showing documents that reference a task, with permission-safe filtering.
- [ ] 7.8 Add meeting/action-item workflow for creating tasks from notes.
- [ ] 7.9 Evaluate synchronized checklist/task-state behavior and specify conflict rules before implementation.
- [ ] 7.10 Add templates for architecture docs, runbooks, sprint planning, review, retrospective and release notes; only planning-specific templates query planning context.

## 8. Development Center

- [ ] 8.1 Document and stabilize the provider-neutral `ScmProvider` capability contract.
- [ ] 8.2 Complete and harden GitLab repository, branch, commit, MR, pipeline, deployment and environment normalization.
- [ ] 8.3 Add workspace Development Center view across tracked repositories.
- [ ] 8.4 Add task Development section showing associated artifacts and status.
- [ ] 8.5 Add durable webhook idempotency and replay handling.
- [ ] 8.6 Add GitHub provider with parity for the agreed provider capabilities.
- [ ] 8.7 Keep Gitea/Forgejo and Bitbucket as later provider changes unless specifically prioritized.

## 9. Notifications and Inbox

- [ ] 9.1 Define notification event types and deduplication rules.
- [ ] 9.2 Add unified TrackWork items to AFFiNE Inbox.
- [ ] 9.3 Notify on assignment, mention, watched-task changes, blocked state, due dates, MR review-relevant events, failed pipelines and automation warnings.
- [ ] 9.4 Add per-user notification preferences and watcher controls.
- [ ] 9.5 Add digest/batching strategy for noisy development events.
- [ ] 9.6 Add optional external channels only through separate integration changes.

## 10. Analytics

- [ ] 10.1 Define authoritative event/fact sources for task-flow analytics.
- [ ] 10.2 Add created/completed counts, cycle time, lead time, overdue, blocked and cumulative flow metrics.
- [ ] 10.3 Add workload views by assignee/team dimension available in AFFiNE workspace membership.
- [ ] 10.4 Add sprint velocity and burndown after sprint lifecycle ships.
- [ ] 10.5 Add engineering lifecycle metrics: task-to-branch, task-to-MR, MR-to-merge, merge-to-deploy, deployment frequency and pipeline failure rate.
- [ ] 10.6 Ensure analytics aggregation can be rebuilt or reconciled from durable source data.
- [ ] 10.7 Keep product analytics authoritative data separate from Prometheus operational telemetry.

## 11. API, webhooks, and automation

- [ ] 11.1 Define stable external TrackWork API boundaries and versioning policy.
- [ ] 11.2 Add scoped API tokens/credentials suitable for automation clients and encrypt them using the protected-value service where enabled.
- [ ] 11.3 Add outgoing webhooks with signing, retries, delivery history and replay.
- [ ] 11.4 Add normalized incoming webhook/event ingestion boundary with signature verification, replay protection and idempotency.
- [ ] 11.5 Implement automation rules as trigger + conditions + actions.
- [ ] 11.6 Persist automation execution records and idempotency keys.
- [ ] 11.7 Support development-triggered task transitions and warnings without hardcoding provider-specific behavior.
- [ ] 11.8 Add scheduled automation only after event-driven execution is stable.

## 12. Productization

- [ ] 12.1 Complete TrackWork branding across self-hosted user/admin surfaces.
- [ ] 12.2 Add installation/onboarding wizard for required self-hosted configuration.
- [ ] 12.3 Add backup/restore documentation and verification flow.
- [ ] 12.4 Expand health/status documentation for database, Redis, migrations, integrations, encryption, observability and background processing.
- [ ] 12.5 Define release/versioning and release-note process.
- [ ] 12.6 Document SMTP, OIDC/SSO, LDAP/directory, base URL, storage, proxy and outbound-network/SSRF policy configuration as applicable.
- [ ] 12.7 Ensure telemetry is transparent and opt-in for TrackWork-specific collection.
- [ ] 12.8 Document quorum-share custody, startup unlock, rotation, compromised-share replacement and recovery rehearsal procedures.
- [ ] 12.9 Document Loki and ELK/OpenSearch observability deployment examples for self-hosted installations.

## 13. Release gates

- [ ] 13.1 All new user-facing strings are localized at least for English and Russian.
- [ ] 13.2 New persistent entities have migration and upgrade tests.
- [ ] 13.3 New privileged operations have explicit permission and cross-workspace IDOR tests.
- [ ] 13.4 New integration/webhook handlers are authenticated where applicable, idempotent and tested for retries/duplicates/replay.
- [ ] 13.5 Critical workflows pass self-hosted production-image smoke/e2e tests.
- [ ] 13.6 Security scans and targeted security integration tests pass required severity policy.
- [ ] 13.7 Quorum-encryption changes include locked-mode, one-share-failure, two-share-success, restart, rotation and secret-leak tests.
- [ ] 13.8 New background/integration capabilities emit documented structured logs and appropriate low-cardinality metrics.
- [ ] 13.9 Documentation and OpenSpec requirements are updated before a capability is considered complete.
- [ ] 13.10 Any implementation by a coding agent records significant deviations from this SDD rather than silently changing architecture.