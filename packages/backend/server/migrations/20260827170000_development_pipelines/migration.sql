-- AlterTable
ALTER TABLE "development_integration_connections" ADD COLUMN "username" VARCHAR;

-- CreateTable
CREATE TABLE "development_pipelines" (
  "id" VARCHAR NOT NULL,
  "connection_id" VARCHAR NOT NULL,
  "external_id" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "number" VARCHAR NOT NULL,
  "status" VARCHAR NOT NULL,
  "url" VARCHAR NOT NULL,
  "branch" VARCHAR,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "development_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "development_pipelines_connection_id_external_id_key" ON "development_pipelines"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "development_pipelines_connection_id_status_idx" ON "development_pipelines"("connection_id", "status");
