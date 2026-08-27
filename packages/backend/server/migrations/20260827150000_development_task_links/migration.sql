-- CreateTable
CREATE TABLE "development_task_links" (
  "id" VARCHAR NOT NULL,
  "workspace_id" VARCHAR NOT NULL,
  "connection_id" VARCHAR NOT NULL,
  "repository_id" VARCHAR NOT NULL,
  "task_key" VARCHAR NOT NULL,
  "entity_type" VARCHAR NOT NULL,
  "external_id" VARCHAR NOT NULL,
  "iid" VARCHAR,
  "url" VARCHAR NOT NULL,
  "title" VARCHAR NOT NULL,
  "status" VARCHAR,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "development_task_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_webhook_events" (
  "id" VARCHAR NOT NULL,
  "connection_id" VARCHAR NOT NULL,
  "idempotency_key" VARCHAR NOT NULL,
  "event_type" VARCHAR NOT NULL,
  "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "development_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "development_task_links_workspace_id_task_key_entity_type_exte_key" ON "development_task_links"("workspace_id", "task_key", "entity_type", "external_id");

-- CreateIndex
CREATE INDEX "development_task_links_workspace_id_task_key_idx" ON "development_task_links"("workspace_id", "task_key");

-- CreateIndex
CREATE INDEX "development_task_links_connection_id_idx" ON "development_task_links"("connection_id");

-- CreateIndex
CREATE INDEX "development_task_links_repository_id_idx" ON "development_task_links"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "development_webhook_events_connection_id_idempotency_key_key" ON "development_webhook_events"("connection_id", "idempotency_key");