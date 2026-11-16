CREATE TABLE "mendel_purchase_source_comments" (
  "transaction_id" VARCHAR(80) PRIMARY KEY REFERENCES "mendel_transactions"("transaction_id") ON DELETE RESTRICT,
  "comment" TEXT
);
