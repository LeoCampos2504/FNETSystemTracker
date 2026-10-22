-- Internal FNET guard crews only. No Sytex tables or historical guard rows are changed.
CREATE TABLE "ops_guard_crews" (
  "id" UUID PRIMARY KEY,
  "zone" TEXT NOT NULL CHECK (length(trim("zone")) BETWEEN 1 AND 100),
  "start_at" TIMESTAMPTZ NOT NULL,
  "end_at" TIMESTAMPTZ NOT NULL,
  "initial_technicians" JSONB NOT NULL CHECK (jsonb_typeof("initial_technicians") = 'array' AND jsonb_array_length("initial_technicians") = 2 AND "initial_technicians"->>0 <> "initial_technicians"->>1),
  "legacy_ids" JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("legacy_ids") = 'array' AND jsonb_array_length("legacy_ids") IN (0, 2)),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "cancelled" BOOLEAN NOT NULL DEFAULT FALSE,
  "request_key" UUID NOT NULL UNIQUE,
  "request_hash" TEXT NOT NULL,
  "created_by" UUID NOT NULL REFERENCES "app_users"("id"),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("end_at" > "start_at" AND "end_at" - "start_at" <= INTERVAL '92 days')
);
CREATE INDEX "ops_guard_crews_window_idx" ON "ops_guard_crews" ("start_at", "end_at");
CREATE INDEX "ops_guard_crews_zone_idx" ON "ops_guard_crews" ("zone");

CREATE TABLE "ops_guard_crew_changes" (
  "id" UUID PRIMARY KEY,
  "guard_id" UUID NOT NULL REFERENCES "ops_guard_crews"("id"),
  "effective_at" TIMESTAMPTZ NOT NULL,
  "before_technicians" JSONB NOT NULL CHECK (jsonb_typeof("before_technicians") = 'array' AND jsonb_array_length("before_technicians") = 2 AND "before_technicians"->>0 <> "before_technicians"->>1),
  "after_technicians" JSONB NOT NULL CHECK (jsonb_typeof("after_technicians") = 'array' AND jsonb_array_length("after_technicians") = 2 AND "after_technicians"->>0 <> "after_technicians"->>1),
  "reason" TEXT NOT NULL CHECK (length(trim("reason")) BETWEEN 1 AND 500),
  "actor_id" UUID NOT NULL REFERENCES "app_users"("id"),
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "request_key" UUID NOT NULL UNIQUE,
  "request_hash" TEXT NOT NULL,
  UNIQUE ("guard_id", "effective_at")
);
