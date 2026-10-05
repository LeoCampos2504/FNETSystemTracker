CREATE TABLE "ops_visit_shifts" (
  "visit_id" UUID PRIMARY KEY REFERENCES "ops_visits"("id") ON DELETE CASCADE,
  "shift" TEXT NOT NULL CHECK ("shift" IN ('LABORAL','FUERA_DE_HORARIO'))
);
