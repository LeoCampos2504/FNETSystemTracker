CREATE TABLE "sytex_supply_imports" (
  "id" UUID NOT NULL,
  "file_hash" VARCHAR(64) NOT NULL,
  "file_name" VARCHAR(250) NOT NULL,
  "answer_count" INTEGER NOT NULL,
  "form_count" INTEGER NOT NULL,
  "source_edited_from" TEXT,
  "source_edited_through" TEXT,
  "imported_by" UUID NOT NULL,
  "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_sytex_supply_imports" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_sytex_supply_imports_hash" ON "sytex_supply_imports"("file_hash");
CREATE INDEX "idx_sytex_supply_imports_date" ON "sytex_supply_imports"("imported_at");

CREATE TABLE "sytex_supply_import_items" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "formulario" TEXT NOT NULL,
  "grupo" TEXT NOT NULL,
  "indice" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DECIMAL(18, 3),
  "provider" TEXT,
  "site_code" TEXT,
  "site_name" TEXT,
  "status" TEXT,
  "image" TEXT,
  "image_declared" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_edited_by" TEXT,
  "source_edited_at" TEXT,
  "source_answers" JSONB NOT NULL,
  CONSTRAINT "pk_sytex_supply_import_items" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_supply_items_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "uq_sytex_supply_import_item" ON "sytex_supply_import_items"("import_id", "formulario", "grupo", "indice");
CREATE INDEX "idx_sytex_supply_import_items_form" ON "sytex_supply_import_items"("formulario");
