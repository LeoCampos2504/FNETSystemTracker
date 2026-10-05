CREATE TABLE "ops_user_access" (
  "user_id" UUID PRIMARY KEY REFERENCES "app_users"("id"),
  "projects" JSONB NOT NULL DEFAULT '[]',
  "updated_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ops_preferences" (
  "user_id" UUID PRIMARY KEY REFERENCES "app_users"("id"),
  "favorites" JSONB NOT NULL DEFAULT '[]',
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ops_days" (
  "day" DATE NOT NULL,
  "project" TEXT NOT NULL,
  "closed_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "closed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB NOT NULL,
  PRIMARY KEY ("day", "project")
);
CREATE TABLE "ops_visits" (
  "id" UUID PRIMARY KEY,
  "request_key" UUID NOT NULL UNIQUE,
  "request_hash" VARCHAR(64) NOT NULL,
  "day" DATE NOT NULL,
  "project" TEXT NOT NULL,
  "site_code" TEXT NOT NULL,
  "site_name" TEXT NOT NULL DEFAULT '',
  "task_type" TEXT NOT NULL CHECK ("task_type" IN ('CORRECTIVO','PREVENTIVO','OTRO')),
  "task_code" TEXT NOT NULL DEFAULT '',
  "technicians" JSONB NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('PLANIFICADO','EN_CURSO','REALIZADO','CON_PENDIENTES','CANCELADO')),
  "outcome" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "updated_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("day", "project", "site_code", "task_type", "task_code")
);
CREATE INDEX "idx_ops_visit_day_project" ON "ops_visits" ("day", "project");
CREATE TABLE "ops_supply_reviews" (
  "source_key" TEXT PRIMARY KEY,
  "project" TEXT NOT NULL,
  "classification" TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK ("classification" IN ('PENDIENTE','INCLUIDO','NO_INCLUIDO')),
  "intra_status" TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK ("intra_status" IN ('PENDIENTE','PARCIAL','DESCARGADO','NO_CORRESPONDE')),
  "invoice_number" TEXT NOT NULL DEFAULT '',
  "counted_quantity" NUMERIC(18,3) CHECK ("counted_quantity" >= 0),
  "intra_quantity" NUMERIC(18,3) CHECK ("intra_quantity" >= 0),
  "notes" TEXT NOT NULL DEFAULT '',
  "source_hash" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updated_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ops_review_files" (
  "id" UUID PRIMARY KEY,
  "source_key" TEXT NOT NULL REFERENCES "ops_supply_reviews"("source_key"),
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_count" INTEGER NOT NULL CHECK ("byte_count" > 0 AND "byte_count" <= 8388608),
  "file_hash" VARCHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("source_key", "file_hash")
);
CREATE TABLE "ops_events" (
  "id" UUID PRIMARY KEY,
  "resource_key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "detail" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "idx_ops_event_resource" ON "ops_events" ("resource_key", "created_at");
