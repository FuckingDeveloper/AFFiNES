CREATE TABLE "trackwork_tasks" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "task_key" VARCHAR NOT NULL,
    "number" INTEGER NOT NULL,
    "links_initialized" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trackwork_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "trackwork_document_links" (
    "id" VARCHAR NOT NULL,
    "workspace_id" VARCHAR NOT NULL,
    "task_id" VARCHAR NOT NULL,
    "document_id" VARCHAR NOT NULL,
    "created_by_id" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trackwork_document_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trackwork_tasks_workspace_id_doc_id_key"
    ON "trackwork_tasks"("workspace_id", "doc_id");
CREATE UNIQUE INDEX "trackwork_tasks_workspace_id_task_key_key"
    ON "trackwork_tasks"("workspace_id", "task_key");
CREATE UNIQUE INDEX "trackwork_tasks_workspace_id_number_key"
    ON "trackwork_tasks"("workspace_id", "number");
CREATE UNIQUE INDEX "trackwork_tasks_workspace_id_id_key"
    ON "trackwork_tasks"("workspace_id", "id");
CREATE INDEX "trackwork_tasks_workspace_id_created_at_idx"
    ON "trackwork_tasks"("workspace_id", "created_at");
CREATE UNIQUE INDEX "trackwork_document_links_task_id_document_id_key"
    ON "trackwork_document_links"("task_id", "document_id");
CREATE INDEX "trackwork_document_links_workspace_id_document_id_idx"
    ON "trackwork_document_links"("workspace_id", "document_id");
CREATE INDEX "trackwork_document_links_workspace_id_task_id_idx"
    ON "trackwork_document_links"("workspace_id", "task_id");

ALTER TABLE "trackwork_tasks"
    ADD CONSTRAINT "trackwork_tasks_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trackwork_document_links"
    ADD CONSTRAINT "trackwork_document_links_workspace_id_task_id_fkey"
    FOREIGN KEY ("workspace_id", "task_id")
    REFERENCES "trackwork_tasks"("workspace_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
