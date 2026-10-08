CREATE TABLE "sytex_task_dates" (
  "id" UUID NOT NULL,
  "import_id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "sub_zone" TEXT NOT NULL DEFAULT '',
  "requested_on" DATE,
  "started_on" DATE,
  "finished_on" DATE,
  CONSTRAINT "pk_sytex_task_dates" PRIMARY KEY ("id"),
  CONSTRAINT "fk_sytex_task_dates_import" FOREIGN KEY ("import_id") REFERENCES "sytex_supply_imports" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "uq_sytex_task_dates" ON "sytex_task_dates" ("import_id", "code");
CREATE INDEX "idx_sytex_task_dates_code" ON "sytex_task_dates" ("code");
