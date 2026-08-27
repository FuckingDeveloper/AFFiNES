-- CreateTable
CREATE TABLE "development_activity" (
  "id" VARCHAR NOT NULL,
  "workspace_id" VARCHAR NOT NULL,
  "connection_id" VARCHAR NOT NULL,
  "task_key" VARCHAR NOT NULL,
  "event_type" VARCHAR NOT NULL,
  "title" VARCHAR NOT NULL,
  "url" VARCHAR NOT NULL,
  "author_name" VARCHAR,
  "repository_name" VARCHAR,
  "metadata" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "development_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "development_activity_workspace_id_task_key_created_at_idx" ON "development_activity"("workspace_id", "task_key", "created_at");

-- CreateIndex
CREATE INDEX "development_activity_workspace_id_created_at_idx" ON "development_activity"("workspace_id", "created_at");