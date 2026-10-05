CREATE TABLE "sytex_supply_form_contexts" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "project" TEXT NOT NULL,
  "site_code" TEXT NOT NULL,
  "site_name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "technicians" JSONB NOT NULL,
  CONSTRAINT "pk_sytex_supply_form_contexts" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_supply_form_contexts_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_sytex_supply_form_context" ON "sytex_supply_form_contexts" ("import_id", "code");
CREATE INDEX "idx_sytex_supply_form_context_code" ON "sytex_supply_form_contexts" ("code");
