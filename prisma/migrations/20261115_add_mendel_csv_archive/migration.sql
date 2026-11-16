CREATE TABLE "mendel_csv_archives" (
  "batch_id" BIGINT NOT NULL REFERENCES "mendel_import_batches"("id") ON DELETE RESTRICT,
  "file_name" VARCHAR(255) NOT NULL,
  "file_content" BYTEA NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "invalid_count" INTEGER NOT NULL DEFAULT 0,
  "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mendel_csv_archives_pkey" PRIMARY KEY ("batch_id"),
  CONSTRAINT "mendel_csv_archives_nonempty" CHECK (octet_length("file_content") BETWEEN 1 AND 8388608),
  CONSTRAINT "mendel_csv_archives_period" CHECK ("period_start" <= "period_end")
);

CREATE TABLE "mendel_purchase_details" (
  "transaction_id" VARCHAR(80) NOT NULL REFERENCES "mendel_transactions"("transaction_id") ON DELETE RESTRICT,
  "full_id" VARCHAR(80) UNIQUE,
  "source_invoice" VARCHAR(200),
  "source_description" TEXT,
  "manual_invoice" VARCHAR(200),
  "oppen" BOOLEAN NOT NULL DEFAULT FALSE,
  "requires_intra" BOOLEAN,
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mendel_purchase_details_pkey" PRIMARY KEY ("transaction_id")
);

CREATE TABLE "mendel_purchase_detail_events" (
  "id" UUID NOT NULL,
  "transaction_id" VARCHAR(80) NOT NULL REFERENCES "mendel_transactions"("transaction_id") ON DELETE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "app_users"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  CONSTRAINT "mendel_purchase_detail_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mendel_purchase_detail_events_transaction_idx" ON "mendel_purchase_detail_events"("transaction_id", "created_at");
