CREATE TABLE "sytex_form_states" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "plan_date" DATE,
  CONSTRAINT "pk_sytex_form_states" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_form_states_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_sytex_form_state" ON "sytex_form_states" ("import_id", "code");
CREATE INDEX "idx_sytex_form_state_code" ON "sytex_form_states" ("code");
