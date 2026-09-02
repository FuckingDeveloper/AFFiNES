-- Replace the workspace-only task link key so identical external IDs from
-- different connections and repositories cannot overwrite each other.
DROP INDEX IF EXISTS "development_task_links_workspace_id_task_key_entity_type_exte_key";

CREATE UNIQUE INDEX "dev_task_links_connection_repo_task_entity_external_key"
ON "development_task_links"("connection_id", "repository_id", "task_key", "entity_type", "external_id");

-- Keep integration-owned data consistent when a workspace or connection is
-- deleted. These relations also prevent orphaned activity and webhook rows.
ALTER TABLE "development_integration_connections"
ADD CONSTRAINT "development_integration_connections_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_task_links"
ADD CONSTRAINT "development_task_links_connection_id_fkey"
FOREIGN KEY ("connection_id") REFERENCES "development_integration_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_webhook_events"
ADD CONSTRAINT "development_webhook_events_connection_id_fkey"
FOREIGN KEY ("connection_id") REFERENCES "development_integration_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_pipelines"
ADD CONSTRAINT "development_pipelines_connection_id_fkey"
FOREIGN KEY ("connection_id") REFERENCES "development_integration_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "development_activity"
ADD CONSTRAINT "development_activity_connection_id_fkey"
FOREIGN KEY ("connection_id") REFERENCES "development_integration_connections"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
