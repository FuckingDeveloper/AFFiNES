ALTER TABLE "users" ADD COLUMN "username" VARCHAR(32);

UPDATE "users"
SET "username" = 'user-' || substring(replace("id", '-', '') from 1 for 12);

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_username_idx" ON "users"("username");
