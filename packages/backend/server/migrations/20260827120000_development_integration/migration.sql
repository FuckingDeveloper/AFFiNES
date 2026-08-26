-- CreateTable
CREATE TABLE "development_integration_connections" (
  "id" VARCHAR NOT NULL,
  "workspace_id" VARCHAR NOT NULL,
  "provider" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "base_url" VARCHAR NOT NULL,
  "token_cipher" TEXT NOT NULL,
  "webhook_secret_cipher" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_by_id" VARCHAR NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "development_integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_repositories" (
  "id" VARCHAR NOT NULL,
  "connection_id" VARCHAR NOT NULL,
  "external_id" VARCHAR NOT NULL,
  "name" VARCHAR NOT NULL,
  "full_name" VARCHAR NOT NULL,
  "web_url" VARCHAR NOT NULL,
  "default_branch" VARCHAR,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "development_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "development_integration_connections_workspace_id_idx" ON "development_integration_connections"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "development_repositories_connection_id_external_id_key" ON "development_repositories"("connection_id", "external_id");

-- CreateIndex
CREATE INDEX "development_repositories_connection_id_idx" ON "development_repositories"("connection_id");

-- AddForeignKey
ALTER TABLE "development_repositories" ADD CONSTRAINT "development_repositories_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "development_integration_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;