CREATE TABLE "supply_invoices" (
  "id" UUID NOT NULL PRIMARY KEY,
  "request_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplier_key" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "number_key" TEXT NOT NULL,
  "invoice_date" DATE NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "mendel_transaction_id" VARCHAR(80),
  "downloaded_at" TIMESTAMPTZ,
  "uploaded_at" TIMESTAMPTZ,
  "intra_reference" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  UNIQUE ("request_key"),
  UNIQUE ("supplier_key", "document_type", "number_key"),
  CHECK (amount >= 0),
  CHECK (currency IN ('ARS','USD')),
  CHECK (version >= 0)
);

CREATE INDEX "idx_supply_invoices_created_at" ON "supply_invoices" ("created_at");

CREATE TABLE "supply_invoice_lines" (
  "id" UUID NOT NULL PRIMARY KEY,
  "invoice_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(18, 3) NOT NULL,
  "available_quantity" DECIMAL(18, 3) NOT NULL,
  "unit" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("invoice_id") REFERENCES "supply_invoices" ("id") ON DELETE RESTRICT,
  UNIQUE ("invoice_id", "position"),
  CHECK (quantity > 0),
  CHECK (available_quantity >= 0 AND available_quantity <= quantity),
  CHECK (version >= 0)
);

CREATE TABLE "supply_invoice_attachments" (
  "id" UUID NOT NULL PRIMARY KEY,
  "invoice_id" UUID NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "byte_count" INTEGER NOT NULL,
  "file_hash" VARCHAR(64) NOT NULL,
  "content" BYTEA NOT NULL,
  "removed_at" TIMESTAMPTZ,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("invoice_id") REFERENCES "supply_invoices" ("id") ON DELETE RESTRICT,
  UNIQUE ("invoice_id", "file_hash"),
  CHECK (byte_count > 0 AND byte_count <= 8388608)
);

CREATE TABLE "supply_invoice_events" (
  "id" UUID NOT NULL PRIMARY KEY,
  "invoice_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("invoice_id") REFERENCES "supply_invoices" ("id") ON DELETE RESTRICT
);

CREATE INDEX "idx_supply_invoice_events_invoice_id_created_at" ON "supply_invoice_events" ("invoice_id", "created_at");

CREATE TABLE "supply_handoffs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "line_id" UUID NOT NULL,
  "request_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "technician" TEXT NOT NULL,
  "site" TEXT,
  "quantity_given" DECIMAL(18, 3) NOT NULL,
  "remaining" DECIMAL(18, 3) NOT NULL,
  "assigned_at" TIMESTAMPTZ NOT NULL,
  "due_at" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("line_id") REFERENCES "supply_invoice_lines" ("id") ON DELETE RESTRICT,
  UNIQUE ("line_id", "request_key"),
  CHECK (quantity_given > 0),
  CHECK (remaining >= 0 AND remaining <= quantity_given),
  CHECK (status IN ('ACTIVE','CLOSED')),
  CHECK (version >= 0)
);

CREATE INDEX "idx_supply_handoffs_status_due_at" ON "supply_handoffs" ("status", "due_at");

CREATE TABLE "supply_movements" (
  "id" UUID NOT NULL PRIMARY KEY,
  "handoff_id" UUID NOT NULL,
  "request_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "type" TEXT NOT NULL,
  "quantity" DECIMAL(18, 3) NOT NULL,
  "notes" TEXT,
  "used_at" TIMESTAMPTZ NOT NULL,
  "actor_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversal_of" UUID,
  FOREIGN KEY ("reversal_of") REFERENCES "supply_movements" ("id") ON DELETE RESTRICT,
  FOREIGN KEY ("handoff_id") REFERENCES "supply_handoffs" ("id") ON DELETE RESTRICT,
  UNIQUE ("reversal_of"),
  UNIQUE ("handoff_id", "request_key"),
  CHECK (quantity > 0),
  CHECK (type IN ('CONSUMPTION','RETURN','REVERSAL'))
);

CREATE INDEX "idx_supply_movements_handoff_id_created_at" ON "supply_movements" ("handoff_id", "created_at");

CREATE TABLE "supply_consumption_forms" (
  "id" UUID NOT NULL PRIMARY KEY,
  "movement_id" UUID NOT NULL,
  "form_code" VARCHAR(20) NOT NULL,
  "quantity" DECIMAL(18, 3) NOT NULL,
  "verification" TEXT NOT NULL,
  FOREIGN KEY ("movement_id") REFERENCES "supply_movements" ("id") ON DELETE RESTRICT,
  UNIQUE ("movement_id", "form_code"),
  CHECK (quantity > 0),
  CHECK (form_code ~ '^FO-[0-9]{2}-[0-9]{6}$'),
  CHECK (verification IN ('KNOWN_SYTEX','PENDING_VERIFICATION'))
);

CREATE INDEX "idx_supply_consumption_forms_form_code" ON "supply_consumption_forms" ("form_code");
