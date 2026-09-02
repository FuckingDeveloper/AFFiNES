-- Pre-policy TrackWork persisted-state fixture for the production image
-- upgrade smoke test.
--
-- This fixture represents TrackWork data written before the first release
-- governed by the upgrade compatibility policy (docs/trackwork-upgrade.md).
-- The current production image must start against this state and preserve it.
--
-- No secrets: token/webhook ciphertext fields contain inert marker strings.
-- Placeholders are substituted by the caller (psql -v workspace_id=...).
-- All statements are idempotent so the phase can be re-run after failures.

INSERT INTO trackwork_tasks
  (id, workspace_id, doc_id, task_key, number, links_initialized, created_by_id)
VALUES
  ('fixture-task-0001', :'workspace_id', 'fixture-doc-1', 'TW-10', 10, false, :'created_by_id'),
  ('fixture-task-0002', :'workspace_id', 'fixture-doc-2', 'TW-11', 11, false, :'created_by_id'),
  ('fixture-task-0003', :'workspace_id', 'fixture-doc-3', 'TW-12', 12, false, :'created_by_id')
ON CONFLICT DO NOTHING;

INSERT INTO trackwork_document_links
  (id, workspace_id, task_id, document_id, created_by_id)
VALUES
  ('fixture-link-0001', :'workspace_id', 'fixture-task-0001', 'fixture-related-a', :'created_by_id'),
  ('fixture-link-0002', :'workspace_id', 'fixture-task-0001', 'fixture-related-b', :'created_by_id')
ON CONFLICT DO NOTHING;

INSERT INTO development_integration_connections
  (id, workspace_id, provider, name, base_url, token_cipher, webhook_secret_cipher, enabled, created_by_id, created_at, updated_at)
VALUES
  ('fixture-connection-0001', :'workspace_id', 'gitlab', 'Fixture GitLab',
   'https://gitlab.example.org', 'cipher:fixture-marker-not-a-secret',
   'cipher:fixture-marker-not-a-secret', true, :'created_by_id',
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO development_repositories
  (id, connection_id, external_id, name, full_name, web_url, enabled, created_at, updated_at)
VALUES
  ('fixture-repository-0001', 'fixture-connection-0001', '1',
   'fixture-repo', 'org/fixture-repo', 'https://gitlab.example.org/org/fixture-repo',
   true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO development_task_links
  (id, workspace_id, connection_id, repository_id, task_key, entity_type, external_id,
   url, title, metadata, created_at, updated_at)
VALUES
  ('fixture-devlink-0001', :'workspace_id', 'fixture-connection-0001', 'fixture-repository-0001',
   'TW-10', 'commit.pushed', 'fixture-sha-0001',
   'https://gitlab.example.org/org/fixture-repo/-/commit/fixture-sha-0001',
   'fix: TW-10 fixture state', '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
