CREATE TABLE "user_two_factor_auth" (
  "user_id" VARCHAR NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_two_factor_auth_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_two_factor_auth_created_at_idx"
  ON "user_two_factor_auth" ("created_at");

ALTER TABLE "user_two_factor_auth"
  ADD CONSTRAINT "user_two_factor_auth_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
