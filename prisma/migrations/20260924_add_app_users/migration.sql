-- FNET-owned authentication table. No Sytex/n8n table is altered.
CREATE TABLE IF NOT EXISTS "app_users" (
  "id" UUID PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('ADMIN', 'COORDINATOR', 'MANAGER', 'TECHNICIAN')),
  "technician_id" TEXT,
  "coordinator_id" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_app_users_role_active"
  ON "app_users" ("role", "active");

CREATE TABLE IF NOT EXISTS "app_sessions" (
  "id" UUID PRIMARY KEY,
  "token_hash" VARCHAR(64) NOT NULL UNIQUE,
  "user_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_app_sessions_expires_at"
  ON "app_sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_app_sessions_user_id"
  ON "app_sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "app_login_attempts" (
  "key_hash" VARCHAR(64) PRIMARY KEY,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_app_login_attempts_window"
  ON "app_login_attempts" ("window_started_at");
