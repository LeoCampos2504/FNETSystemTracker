CREATE TABLE "sytex_site_maintenance" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "site_code" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "last_date" DATE NOT NULL,
  "form_code" TEXT NOT NULL,
  "reported_at" TEXT NOT NULL,
  CONSTRAINT "pk_sytex_site_maintenance" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_site_maintenance_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_sytex_site_maintenance" ON "sytex_site_maintenance" ("import_id", "site_code", "kind", "form_code");
CREATE INDEX "idx_sytex_site_maintenance_site" ON "sytex_site_maintenance" ("site_code", "kind");
