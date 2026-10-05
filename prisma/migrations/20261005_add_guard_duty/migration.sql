CREATE TABLE "ops_guard_weeks" (
  "id" UUID PRIMARY KEY,
  "technician" TEXT NOT NULL,
  "week_start" DATE NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("technician", "week_start")
);
CREATE INDEX "idx_ops_guard_weeks_start" ON "ops_guard_weeks" ("week_start");
CREATE TABLE "ops_holidays" (
  "day" DATE PRIMARY KEY,
  "name" TEXT NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ops_visit_hours" (
  "visit_id" UUID PRIMARY KEY REFERENCES "ops_visits"("id") ON DELETE CASCADE,
  "hours" NUMERIC(5,2) NOT NULL CHECK ("hours" >= 0 AND "hours" <= 48),
  "updated_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ops_ctic_users" (
  "user_id" UUID PRIMARY KEY REFERENCES "app_users"("id"),
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
