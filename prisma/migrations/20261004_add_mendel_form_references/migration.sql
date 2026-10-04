CREATE TABLE "mendel_form_references" (
  "transaction_id" VARCHAR(80) NOT NULL,
  "form_code" VARCHAR(20) NOT NULL,
  CONSTRAINT "pk_mendel_form_references" PRIMARY KEY ("transaction_id", "form_code"),
  CONSTRAINT "fk_mendel_form_reference_transaction" FOREIGN KEY ("transaction_id") REFERENCES "mendel_transactions"("transaction_id") ON DELETE CASCADE
);

CREATE INDEX "idx_mendel_form_references_form" ON "mendel_form_references"("form_code");
