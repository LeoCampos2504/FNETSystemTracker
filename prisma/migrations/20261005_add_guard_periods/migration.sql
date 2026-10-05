CREATE TABLE "ops_guard_periods" (
  "id" UUID PRIMARY KEY,
  "technician" TEXT NOT NULL,
  "date_from" DATE NOT NULL,
  "date_to" DATE NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("date_to" >= "date_from" AND "date_to" - "date_from" <= 91)
);
CREATE INDEX "idx_ops_guard_periods_from" ON "ops_guard_periods" ("date_from");
