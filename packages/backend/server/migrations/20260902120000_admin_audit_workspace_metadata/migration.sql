ALTER TABLE "admin_audit_logs" ADD COLUMN "workspace_id" VARCHAR;
ALTER TABLE "admin_audit_logs" ADD COLUMN "metadata" JSONB;
