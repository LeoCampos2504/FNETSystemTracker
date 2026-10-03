CREATE TABLE "mendel_transactions" (
  "id" BIGSERIAL NOT NULL,
  "transaction_id" VARCHAR(80) NOT NULL,
  "transaction_date" TIMESTAMPTZ(6) NOT NULL,
  "confirmation_date" TIMESTAMPTZ(6),
  "user_name" VARCHAR(200),
  "merchant" VARCHAR(250),
  "total_amount" DECIMAL(18,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "international_amount" DECIMAL(18,2),
  "international_currency" VARCHAR(3),
  "bank_fee" DECIMAL(18,2),
  "budget" VARCHAR(200),
  "budget_id" VARCHAR(100),
  "payment_method" VARCHAR(100),
  "transaction_type" VARCHAR(100),
  "transaction_status" VARCHAR(100),
  "reference_code" VARCHAR(100),
  "payment_origin" VARCHAR(100),
  "channel" VARCHAR(100),
  "merchant_category" VARCHAR(150),
  "transaction_category" VARCHAR(150),
  "has_receipt" BOOLEAN,
  "document_name" VARCHAR(250),
  "invoice_total" DECIMAL(18,2),
  "invoice_difference" DECIMAL(18,2),
  "receipt_status" VARCHAR(150),
  "vat" DECIMAL(18,2),
  "gross_income_tax" DECIMAL(18,2),
  "other_taxes" DECIMAL(18,2),
  "exempt_amount" DECIMAL(18,2),
  "non_taxed_amount" DECIMAL(18,2),
  "reconciliation_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "mendel_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mendel_transactions_transaction_id_key" ON "mendel_transactions"("transaction_id");
CREATE INDEX "idx_mendel_transactions_date" ON "mendel_transactions"("transaction_date");
CREATE INDEX "idx_mendel_transactions_status" ON "mendel_transactions"("transaction_status");
CREATE INDEX "idx_mendel_transactions_receipt_status" ON "mendel_transactions"("receipt_status");
CREATE INDEX "idx_mendel_transactions_reconciliation" ON "mendel_transactions"("reconciliation_status");
CREATE INDEX "idx_mendel_transactions_user" ON "mendel_transactions"("user_name");
CREATE INDEX "idx_mendel_transactions_merchant" ON "mendel_transactions"("merchant");

CREATE TABLE "mendel_import_batches" (
  "id" BIGSERIAL NOT NULL,
  "file_hash" VARCHAR(64) NOT NULL,
  "row_count" INTEGER NOT NULL,
  "inserted_count" INTEGER NOT NULL,
  "updated_count" INTEGER NOT NULL,
  "imported_by" UUID NOT NULL,
  "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mendel_import_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_mendel_import_batches_imported_at" ON "mendel_import_batches"("imported_at");
