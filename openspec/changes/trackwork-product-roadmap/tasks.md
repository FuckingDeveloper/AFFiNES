# Tasks: TrackWork Product Roadmap

This checklist is intentionally staged. Later phases should not be implemented wholesale before the acceptance criteria of earlier phases are met.

Implementation agents such as Codex/DeepSeek SHALL read `proposal.md`, `design.md`, the relevant capability spec, and the existing code paths referenced by `design.md` before changing application code.

## 1. Stability, security baseline, and operability

- [x] 1.1 Define supported self-hosted upgrade path and version compatibility policy.
  - Policy: `docs/trackwork-upgrade.md`. No formal previous TrackWork release exists (no release tags); the first release under the policy becomes the baseline; upgrades are supported only from the immediately previous supported release (no skipping); PostgreSQL `pgvector/pg16` + Redis 7.4 per `.docker/selfhost/compose.yml`; migrations run pre-start via the `affine_migration` service (`prisma migrate deploy` + data migrations); rollback is restore-from-backup only; backup required before upgrade; pre-policy data remains covered by compatibility tests.
- [x] 1.2 Add migration tests for existing Task Tracker workspaces and boards, including legacy JSON-string task properties.
  - Server: `src/__tests__/e2e/trackwork/upgrade.spec.ts` seeds representative pre-policy persisted state (registry tasks/keys/numbers, task/document links, development integration associations) and proves the current migration/import path preserves it with no destructive reset, plus idempotency on clean data. Frontend: `task-tracker/config.spec.ts` exercises the real persisted workspace-property loaders (`resolveTaskTrackerBoards`, `sanitizeFlow`, `sanitizeTransitions`, `sanitizeTypeTransitions`, `sanitizeAutomationRules`) with a representative historical `additionalData` fixture — board IDs, user-authored board/stage names, flow, transitions and type transitions preserved; invalid automation rules filtered and duplicates deduplicated per current behavior; empty/corrupt config falls back to the real default board; the fixture is not mutated — plus legacy JSON-string task property (`taskAttachments`, `taskSubtasks`, `taskHistory`, `taskRelatedDocs`, `taskRelations`) parser tests.
- [ ] 1.3 Add production Docker upgrade smoke test using persisted data from previous supported version.
  - Bootstrap/pre-policy Docker upgrade rehearsal exists and is preserved: `.github/workflows/trackwork-docker-smoke.yml` + `scripts/smoke-upgrade.sh` + `scripts/docker-smoke/fixture-upgrade.sql` exercise the real production migration/startup path (`affine_migration`: `prisma migrate deploy` + data migrations) against persisted TrackWork data and verify readiness plus data integrity. This does NOT yet constitute a previous-supported-release -> current-release upgrade: no formally supported TrackWork release exists (no release tags), and the rehearsal seeds a synthetic pre-policy fixture into a database already at the current schema, so no old-schema migration or release-to-release transition is exercised. Final completion requires the first policy-governed baseline release to exist; the following release's CI must then upgrade persisted data/artifact produced by that baseline (see `docs/trackwork-upgrade.md` "Future N-1 -> N verification").
- [x] 1.4 Define TrackWork capability permissions and replace scattered administrator-only checks where appropriate.
  - Explicit TrackWork capabilities for GraphQL/server operations: `Workspace.TrackWork.Write` (Collaborator+) and `Workspace.TrackWork.Integrations.Manage` (Owner only) replace the `CreateDoc`/`Administrators.Manage` proxies; role mapping documented by unit assertions/snapshots and proven server-side for GraphQL surfaces (`core/permission/__tests__/actions.spec.ts`, `src/__tests__/e2e/trackwork/idor.spec.ts`).
  - Workspace-property sync enforcement: workflow configuration lives in the workspace custom-property schema document `db$docCustomPropertyInfo` (repo-defined `db$<table>` convention, frontend `db.ts` storageDocId). The server's sync push path now requires `Workspace.Properties.Update` for that document (generic, table-level enforcement via the established AccessController; not TrackWork-semantic). Reproduction/regression over the real socket/Yjs transport (`src/__tests__/sync/trackwork-workflow-permission.spec.ts`) proves: Collaborator workflow-config and generic property-schema pushes are rejected server-side with the standard error and not persisted; Admin and Owner pushes are accepted and persisted; Collaborator pushes to normal task documents remain accepted. The literal platform-stability scenario (a task-editing non-admin cannot modify stages/transition rules through the collaborative transport) is therefore satisfied server-side.
  - Frontend provisioning is aligned with the server boundary: `ensureProperty` (materialization of missing TASK*\* property definitions) runs only for users holding `Workspace.Properties.Update`; while the permission is loading or denied, nothing is written and no keys are marked, so a later transition to allowed re-runs provisioning. `BUILT_IN_CUSTOM_PROPERTY_TYPE` contains only generic AFFiNE properties and does NOT include TrackWork TASK*\* definitions; TrackWork functions without those rows because task values are document-resident and workflow defaults are deterministic fallbacks. Collaborators therefore generate no denied property-table sync writes, and property-schema materialization remains Admin+ per RoleActionsMap (additive when it happens later: existing task values and Admin-authored workflow configuration are never overwritten).
- [ ] 1.5 Add cross-workspace/object authorization tests for tasks, documents, integrations, planning entities, attachments and admin-only operations to detect IDOR regressions.
  - Current-object IDOR baseline implemented for tasks (registry reads/writes/links/backlinks), documents (doc-scoped write authority), integrations (configuration, credentials, repositories, SCM actions, development reads) and admin-only integration operations (`src/__tests__/e2e/trackwork/idor.spec.ts`, plus pre-existing gitlab-connection cross-workspace tests). Same-workspace object isolation is additionally covered for task/development metadata: development info and activity require Doc.Read on the task document, and unfiltered activity pagination hides rows of unreadable task documents without leaking or repeating (`src/__tests__/e2e/trackwork/task-doc-read.spec.ts`). Final completion remains blocked on server-side planning-entity and attachment capabilities: planning entities are client-only representations with no independent server object, and task attachments are client-side doc properties with no server API — both must ship before 1.5 can be checked.
- [ ] 1.6 Add archive semantics for tasks and workflow/planning entities that require history retention.
- [ ] 1.7 Ensure all TrackWork surfaces have loading, empty, permission-denied, recoverable-error and fatal-error states.
- [ ] 1.8 Complete i18n coverage for all current TrackWork strings and ensure system defaults are translated by stable IDs.
- [x] 1.9 Add structured audit events for task/workflow/integration/configuration/security changes.
  - Server/admin audit coverage (implemented, preserved): durable events for registry (`trackwork.task.sync` with bounded `taskCount`, `.allocate`, `.set_links` with `linkCount`), integration configuration/credentials/repositories, and SCM actions through the `admin_audit_logs` table + shared `AdminAuditService` (workspace-scoped, actor/entity/operation/timestamp; success-only post-commit convention; no secrets or user content). Tests: `src/__tests__/e2e/trackwork/audit.spec.ts`.
  - Task lifecycle activity (implemented): structured client-authored activity appended to the task's collaborative `taskHistory` — additive fields `operation` (stable `TaskActivityOperation` union), `actorId`/`actorName` (session account), `taskKey`, `source` (`user`/`automation`); backward-compatible parsing of legacy records; no-op edits and neighboring reindex writes do not produce activity; documented honestly as PRODUCT ACTIVITY (client-authored, collaboration-preserving) rather than security audit. Tests: `task-tracker/config.spec.ts`.
  - Privileged workflow/config audit (implemented): workflow configuration is governed by a server-authoritative boundary (`TrackWorkWorkflowConfig` row per workspace + semantic mutation `updateTrackWorkWorkflowConfig` requiring `Workspace.TrackWork.Workflow.Manage`, Admin/Owner). Accepted updates validate a bounded workflow schema (per-item limits plus an aggregate 1 MiB cap; `__proto__`/`prototype`/`constructor` identifiers explicitly rejected), and persist via an ATOMIC optimistic-concurrency write: `expectedRevision=0` uses a guarded CREATE (concurrent P2002 converted to `WorkflowConfigConflict`); `expectedRevision>=1` uses `UPDATE ... WHERE revision = expectedRevision` (`updateMany` with `revision: { increment: 1 }`); zero affected rows = `WorkflowConfigConflict`. True-concurrent reproductions prove exactly one winner, one explicit conflict, revision N+1, and exactly ONE semantic audit row (loser writes none) for both the existing-row and no-row races. The mutation records the authenticated actor and server timestamps and writes a durable semantic audit row (`trackwork.workflow.update`, target `trackwork-workflow`) in the SAME PostgreSQL transaction as the config write (`AdminAuditService.logInTx`), executed only after the conditional write proves this transaction won the race. Audit metadata is bounded (`previousRevision`, `newRevision`, `boardCount`, `stageCount`, `automationRuleCount`) and contains no user-authored names, config content, task/document contents, or secrets. All CURRENT supported workflow-management UI (settings boards/rules and the Task Tracker toolbar New/Rename/Delete board) routes through the semantic mutation with `Workspace.TrackWork.Workflow.Manage` gating (Collaborator: hidden + server-denied; Admin/Owner: allowed); no draft is mirrored before server acceptance and the mirror only ever contains the returned validated config. The generic `Workspace.Properties.Update` sync gate remains as the compatibility boundary for the collaborative schema document; the legacy `taskStatus.additionalData` copy is a non-authoritative compatibility/offline cache/mirror (server config wins whenever available; raw Yjs writes cannot change the authoritative revision or the authoritative GraphQL result and produce no workflow audit event). Client contract: workflow administration requires a client version supporting the TrackWork workflow control plane; old clients (>=0.25 per the WebSocket version floor) may still write an accepted-but-inert Yjs mirror - those edits appear locally successful but are unsupported and never alter authoritative state; self-host serves the current frontend+backend bundle together. Tests: `src/__tests__/e2e/trackwork/workflow-config.spec.ts` (authorization matrix, sequential + true-concurrent optimistic concurrency, invalid/oversized/prototype configs, bounded audit, audit/config atomicity on forced audit failure, raw-Yjs non-authority, legacy import cases), `src/data/migrations/1765000000000-trackwork-workflow-config.ts` (idempotent; malformed data skipped), `src/core/permission/__tests__/actions.spec.ts`.
- [x] 1.10 Validate current implementation with a large-workspace fixture containing at least hundreds of tasks.
  - Deterministic 500-task fixture (`src/__tests__/e2e/trackwork/large-workspace.spec.ts`): 6-stage workflow config (transitions + type transitions + 3 automation rules), registry sync of 500 tasks in one batched mutation with task keys TASK-1..TASK-500, unique numbers/keys/docIds verified against the registry unique constraints; sampled head/middle/tail lookups by key; 50 document links with backlinks; idempotent re-sync (no duplicates, next allocation TASK-501); 120 development-activity rows paginated across 3 pages (no missing/duplicate rows, stable ordering, correct hasNextPage) plus the readable-activity filter across page boundaries (12 restricted docs hidden from a Collaborator without Doc.Read); workflow read returns the seeded config with no fallback and a stable revision; exactly ONE workflow audit event across all task operations; foreign-workspace key lookup denied. Timings (local test env): workflow seed 21ms, sync 500 900ms, idempotent re-sync 65ms, activity 120 over 3 pages 36ms; full test 1.4s.
  - Frontend data handling over 500 deterministic task records (`task-tracker/large-workspace.spec.ts`): board/stage classification with exact stage distribution (80/60/120/90/70/80), per-column ordering (order + priority tiebreak), priority/type filtering, unique identity with no duplication (500/500), history parsing for 50 populated tasks (150 structured entries via buildTaskActivityEntry), relations parsing for 100 tasks (25 with blockedBy), subtask parsing for 25 tasks (2 each); classify+sort 8ms, filter <1ms, history parse <1ms.
  - Accepted limitations: task value fields (titles, stage assignments) are represented deterministically in the frontend fixture rather than via 500 Yjs documents; development metadata is seeded directly for a bounded subset; no browser-level rendering benchmark (aggregate assertions only). No correctness blocker or pathological N+1 found at this scale; no performance refactor introduced.
- [ ] 1.11 Add dependency vulnerability scanning to release CI.
  - STATUS: DEFERRED until Jenkins CI is implemented (GitLab Self-Managed migration first). The portable local infrastructure exists (`yarn trackwork:security`: OSV-Scanner v2.5.1 pinned + checksum-verified, identity-scoped baseline `.security/osv-baseline.json` - ecosystem/package/resolved-version/advisory, scanner-provided severity with unclassifiable-NEW blocking, self-tests A-E and a known-advisory fixture, exit-code semantics 0/1-accepted-else-failure). LOCAL EXECUTION IS NOT A CI/RELEASE GATE: completion requires Jenkins to invoke `scripts/ci/trackwork-security.sh` on MR Fast / release paths. Baseline review/expiry: 2026-12-01.
- [ ] 1.12 Add secret scanning and security-focused static analysis/linting to release CI.
  - STATUS: DEFERRED until Jenkins CI is implemented. Portable local infrastructure exists: Gitleaks v8.24.3 (pinned + checksum-verified, value-level allowlist `.gitleaks.toml`, tracked-tree scan, runtime-generated synthetic-secret self-test, sensitive-path bypass regression) and the CodeQL SARIF gate (`.security/check-codeql-sarif.py` with fingerprint-identity baseline `.security/codeql-baseline.json`, stable `primaryLocationLineHash` matching, 6 self-test cases) as the OPTIONAL `yarn trackwork:security:codeql` command (CodeQL CLI is a dedicated environment, documented for Jenkins). LOCAL EXECUTION IS NOT A CI/RELEASE GATE: completion requires Jenkins enforcement (MR Fast: secret scan; MR Heavy/release: secret + static gate). GitHub Actions disabled; no GitHub-specific SARIF upload is claimed.
- [ ] 1.13 Add release-image/container vulnerability scanning.
  - STATUS: DEFERRED until the Jenkins release pipeline is implemented. Portable pieces retained: per-platform Trivy baselines (`.trivyignore-amd64` with the reviewed 2026-09-03 list; `.trivyignore-arm64`/`.trivyignore-armv7` conservatively pending first real scans) and the documented per-platform digest-scan model (one immutable candidate, resolve platform child digests, scan EVERY digest before promotion, no rebuild after scan). LOCAL EXECUTION IS NOT A RELEASE GATE: completion requires the Jenkins release pipeline to build the production image, resolve platform digests, scan each with Trivy (pinned, checksum-verified) and block promotion on NEW Critical/High findings.
- [ ] 1.14 Add targeted security integration tests for injection, XSS, SSRF, webhook replay/signature validation, file/blob authorization, abusive pagination/query complexity, and privilege escalation.
- [ ] 1.15 Document a security review checklist and require explicit review/risk acceptance for critical/high findings before major production releases.

## 2. Observability

- [x] 2.1 Identify the repository's existing metrics/logger abstractions and extend them rather than introducing a parallel stack.
- [x] 2.2 Expose Prometheus-compatible TrackWork/server metrics through a documented scrape endpoint.
- [x] 2.3 Add bounded HTTP/GraphQL request latency/error metrics using low-cardinality labels.
  - GraphQL latency/error metrics pre-existed (`gql_query_duration`, `gql_query_error_counter`); the webhook ingress boundary now exposes bounded latency/error metrics via `trackwork_function_timer{name="webhook_ingest"}` and `trackwork_function_calls_total{name="webhook_ingest",error=...}` with `provider`-only labels. Generic REST HTTP middleware remains deferred.
- [x] 2.4 Add webhook receive/process/failure/retry metrics.
  - Retry attempts are observable via `trackwork_webhook_retry_total{provider}`, incremented when a webhook job is processed with `attemptsMade > 0`.
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
