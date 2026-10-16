-- FNET-only control. No writes or foreign keys to Sytex or Mendel source tables.
CREATE TABLE "fnet_mendel_zone_expenses" (
  "transaction_id" VARCHAR(80) PRIMARY KEY,
  "zone" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "published_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "idx_fnet_mendel_zone_expenses_zone" ON "fnet_mendel_zone_expenses" ("zone");

CREATE TABLE "fnet_mendel_zone_access" (
  "user_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "zone" VARCHAR(80) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "granted_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "zone")
);

CREATE TABLE "fnet_mendel_zone_decisions" (
  "id" BIGSERIAL PRIMARY KEY,
  "request_id" UUID NOT NULL UNIQUE,
  "transaction_id" VARCHAR(80) NOT NULL REFERENCES "fnet_mendel_zone_expenses"("transaction_id"),
  "expense_revision" INTEGER NOT NULL CHECK ("expense_revision" > 0),
  "decision" TEXT NOT NULL CHECK ("decision" IN ('PENDIENTE', 'AUTORIZADO', 'NO_AUTORIZADO')),
  "comment" VARCHAR(1000) NOT NULL DEFAULT '',
  "actor_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "idx_fnet_mendel_zone_decisions_expense" ON "fnet_mendel_zone_decisions" ("transaction_id", "id" DESC);
