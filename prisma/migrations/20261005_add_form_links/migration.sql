CREATE TABLE "sytex_form_links" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  CONSTRAINT "pk_sytex_form_links" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_form_links_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_sytex_form_link" ON "sytex_form_links" ("import_id", "code");
CREATE INDEX "idx_sytex_form_link_code" ON "sytex_form_links" ("code");
