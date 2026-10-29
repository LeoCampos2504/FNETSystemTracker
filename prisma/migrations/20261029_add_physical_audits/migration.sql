CREATE TABLE "fnet_audit_people" (
  "id" UUID PRIMARY KEY,
  "cuil" VARCHAR(11) NOT NULL UNIQUE CHECK ("cuil" ~ '^[0-9]{11}$'),
  "data" JSONB NOT NULL CHECK (jsonb_typeof("data") = 'object'),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "fnet_audit_records" (
  "id" UUID PRIMARY KEY,
  "person_id" UUID NOT NULL REFERENCES "fnet_audit_people"("id"),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "data" JSONB NOT NULL CHECK (jsonb_typeof("data") = 'object'),
  "kind" VARCHAR(16) NOT NULL CHECK ("kind" IN ('IMPORT', 'EDIT', 'AUDIT')),
  "request_id" UUID NOT NULL UNIQUE,
  "request_hash" VARCHAR(64) NOT NULL,
  "actor_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("person_id", "version")
);

CREATE TABLE "fnet_audit_files" (
  "id" UUID PRIMARY KEY,
  "record_id" UUID NOT NULL REFERENCES "fnet_audit_records"("id"),
  "file_name" VARCHAR(180) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "byte_count" INTEGER NOT NULL CHECK ("byte_count" > 0 AND "byte_count" <= 8388608),
  "file_hash" VARCHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "actor_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("record_id", "file_hash")
);

CREATE INDEX "fnet_audit_records_person_date_idx" ON "fnet_audit_records" ("person_id", "created_at" DESC);
CREATE INDEX "fnet_audit_files_record_idx" ON "fnet_audit_files" ("record_id");
