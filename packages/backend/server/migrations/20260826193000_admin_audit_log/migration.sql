CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "actor_id" VARCHAR NOT NULL,
  "actor_email" VARCHAR NOT NULL,
  "action" VARCHAR NOT NULL,
  "target_type" VARCHAR NOT NULL,
  "target_id" VARCHAR,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_logs_created_at_idx"
  ON "admin_audit_logs"("created_at");
CREATE INDEX "admin_audit_logs_actor_id_created_at_idx"
  ON "admin_audit_logs"("actor_id", "created_at");
