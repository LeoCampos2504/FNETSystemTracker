CREATE TABLE "sytex_site_answers" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "form_code" TEXT NOT NULL,
  "site_code" TEXT NOT NULL,
  "site_name" TEXT NOT NULL DEFAULT '',
  "topic" TEXT NOT NULL,
  "grupo" TEXT NOT NULL,
  "indice" TEXT NOT NULL,
  "pregunta" TEXT NOT NULL,
  "respuesta" TEXT NOT NULL,
  "reported_at" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "pk_sytex_site_answers" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_site_answers_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_sytex_site_answers" ON "sytex_site_answers" ("import_id", "form_code", "grupo", "indice");
CREATE INDEX "idx_sytex_site_answers_site" ON "sytex_site_answers" ("site_code");
CREATE INDEX "idx_sytex_site_answers_form" ON "sytex_site_answers" ("form_code");
