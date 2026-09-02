CREATE TABLE "trackwork_workflow_configs" (
  "workspace_id" VARCHAR NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "updated_by" VARCHAR,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "trackwork_workflow_configs_pkey" PRIMARY KEY ("workspace_id")
);

CREATE INDEX "trackwork_workflow_configs_workspace_id_idx"
  ON "trackwork_workflow_configs"("workspace_id");
