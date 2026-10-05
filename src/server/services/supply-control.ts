import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/prisma";
import { consumptionTotal, identityKey, localDayStart, remainingAfterUse, type InvoiceInput, type HandoffInput, type MovementInput } from "@/server/supply-input";

export class SupplyError extends Error { constructor(public code: string, public status = 409) { super(code); } }
function fail(code: string, status = 409): never { throw new SupplyError(code, status); }
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const fileSelect = { id: true, fileName: true, mimeType: true, byteCount: true, removedAt: true } as const;
const invoiceInclude = { lines: { orderBy: { position: "asc" as const } }, attachments: { where: { removedAt: null }, select: fileSelect } };
const handoffInclude = { line: { include: { invoice: { select: { id: true, number: true, supplier: true } } } } };
export const wire = (data: unknown) => JSON.parse(JSON.stringify(data)) as unknown;
const sameRequest = (saved: { requestHash: string }, data: unknown) => { if (saved.requestHash !== hash(data)) fail("REQUEST_KEY_REUSED"); };
function validDate(date: Date, earliest?: Date) {
  if (date.getTime() > Date.now() || (earliest && date < earliest)) fail("DATE_OUT_OF_RANGE", 422);
}

export async function overview(params: URLSearchParams) {
  const db = getPrismaClient();
  const page = (key: string) => Math.max(1, Math.min(100000, Math.floor(Number(params.get(key)) || 1)));
  const invoicePage = page("invoicePage"), handoffPage = page("handoffPage");
  const search = (params.get("search") ?? "").trim().slice(0, 200);
  const technician = (params.get("technician") ?? "").trim().slice(0, 200);
  const invoiceWhere: Prisma.supply_invoicesWhereInput = search ? { OR: [{ number: { contains: search, mode: "insensitive" } }, { supplier: { contains: search, mode: "insensitive" } }] } : {};
  const invoiceFilter = params.get("invoiceFilter");
  if (invoiceFilter === "files") invoiceWhere.attachments = { none: { removedAt: null } };
  if (invoiceFilter === "download") invoiceWhere.downloadedAt = null;
  if (invoiceFilter === "upload") invoiceWhere.uploadedAt = null;
  const handoffWhere: Prisma.supply_handoffsWhereInput = { ...(technician ? { technician } : {}), ...(params.get("overdue") === "true" ? { status: "ACTIVE", dueAt: { lte: new Date() } } : {}) };
  const result = await db.$transaction(async (tx) => {
    const [invoices, invoiceCount, handoffs, handoffCount, technicians, total, missingFiles, pendingDownload, pendingUpload, activeHandoffs, overdueHandoffs] = await Promise.all([
      tx.supply_invoices.findMany({ where: invoiceWhere, include: invoiceInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (invoicePage - 1) * 50, take: 50 }),
      tx.supply_invoices.count({ where: invoiceWhere }),
      tx.supply_handoffs.findMany({ where: handoffWhere, include: handoffInclude, orderBy: [{ assignedAt: "desc" }, { id: "desc" }], skip: (handoffPage - 1) * 50, take: 50 }),
      tx.supply_handoffs.count({ where: handoffWhere }),
      tx.supply_handoffs.findMany({ distinct: ["technician"], select: { technician: true }, orderBy: { technician: "asc" } }),
      tx.supply_invoices.count(), tx.supply_invoices.count({ where: { attachments: { none: { removedAt: null } } } }),
      tx.supply_invoices.count({ where: { downloadedAt: null } }), tx.supply_invoices.count({ where: { uploadedAt: null } }),
      tx.supply_handoffs.count({ where: { status: "ACTIVE" } }), tx.supply_handoffs.count({ where: { status: "ACTIVE", dueAt: { lte: new Date() } } }),
    ]);
    return { invoices, invoiceCount, invoicePage, handoffs, handoffCount, handoffPage, technicians: technicians.map((t) => t.technician), counts: { invoices: total, missingFiles, pendingDownload, pendingUpload, activeHandoffs, overdueHandoffs } };
  }, { isolationLevel: "RepeatableRead" });
  return wire(result);
}
export async function invoiceDetail(id: string) {
  const value = await getPrismaClient().supply_invoices.findUnique({ where: { id }, include: { ...invoiceInclude, events: { orderBy: { createdAt: "desc" }, take: 100 } } });
  if (!value) fail("NOT_FOUND", 404);
  return wire(value);
}
export async function createInvoice(input: InvoiceInput, actorId: string) {
  const db = getPrismaClient();
  return db.$transaction(async (tx) => {
    const prior = await tx.supply_invoices.findUnique({ where: { requestKey: input.requestKey } });
    if (prior) { sameRequest(prior, input); return { id: prior.id, alreadySaved: true }; }
    validDate(localDayStart(input.invoiceDate));
    if (input.mendelTransactionId && !await tx.mendel_transactions.findUnique({ where: { transactionId: input.mendelTransactionId }, select: { id: true } })) fail("MENDEL_TRANSACTION_NOT_FOUND", 422);
    const invoice = await tx.supply_invoices.create({ data: {
      requestKey: input.requestKey, requestHash: hash(input), supplier: input.supplier, supplierKey: identityKey(input.supplier), documentType: input.documentType,
      number: input.number, numberKey: identityKey(input.number), invoiceDate: new Date(`${input.invoiceDate}T00:00:00Z`), amount: input.amount, currency: input.currency, mendelTransactionId: input.mendelTransactionId, createdBy: actorId,
      lines: { create: input.lines.map((line, position) => ({ ...line, position, availableQuantity: line.quantity })) },
      events: { create: { type: "CREATED", actorId, detail: { lineCount: input.lines.length } } },
    }, select: { id: true } });
    return { id: invoice.id, alreadySaved: false };
  });
}
export async function invoiceStatus(id: string, input: { version: number; action: string; intraReference?: string | null }, actorId: string) {
  return getPrismaClient().$transaction(async (tx) => {
    const invoice = await tx.supply_invoices.findUnique({ where: { id }, include: { attachments: { where: { removedAt: null }, select: { id: true } } } });
    if (!invoice) fail("NOT_FOUND", 404);
    if (["UPLOAD_CONFIRMED", "DOWNLOADED"].includes(input.action) && !invoice.attachments.length) fail("ATTACHMENT_REQUIRED", 422);
    const data: Prisma.supply_invoicesUpdateManyMutationInput = { version: { increment: 1 } };
    if (input.action === "UPLOAD_CONFIRMED") { data.uploadedAt = new Date(); data.intraReference = input.intraReference ?? null; }
    if (input.action === "RESET_UPLOAD") { data.uploadedAt = null; data.intraReference = null; }
    if (input.action === "DOWNLOADED") data.downloadedAt = new Date();
    if (input.action === "RESET_DOWNLOAD") data.downloadedAt = null;
    if (!(await tx.supply_invoices.updateMany({ where: { id, version: input.version }, data })).count) fail("STALE_VERSION");
    await tx.supply_invoice_events.create({ data: { invoiceId: id, type: input.action, actorId, detail: { intraReference: input.intraReference ?? null } } });
    return { saved: true };
  });
}
export async function createHandoff(input: HandoffInput, actorId: string) {
  return getPrismaClient().$transaction(async (tx) => {
    const prior = await tx.supply_handoffs.findUnique({ where: { lineId_requestKey: { lineId: input.lineId, requestKey: input.requestKey } } });
    if (prior) { sameRequest(prior, input); return { id: prior.id, alreadySaved: true }; }
    const line = await tx.supply_invoice_lines.findUnique({ where: { id: input.lineId }, include: { invoice: { select: { invoiceDate: true } } } });
    if (!line) fail("NOT_FOUND", 404);
    const assignedAt = localDayStart(input.assignedDate); validDate(assignedAt, localDayStart(line.invoice.invoiceDate.toISOString().slice(0, 10)));
    if (!(await tx.supply_invoice_lines.updateMany({ where: { id: input.lineId, version: input.version, availableQuantity: { gte: input.quantity } }, data: { availableQuantity: { decrement: input.quantity }, version: { increment: 1 } } })).count) fail("STOCK_CHANGED_OR_INSUFFICIENT");
    const saved = await tx.supply_handoffs.create({ data: { lineId: input.lineId, requestKey: input.requestKey, requestHash: hash(input), technician: input.technician, quantityGiven: input.quantity, remaining: input.quantity, site: input.site, assignedAt, dueAt: new Date(assignedAt.getTime() + input.reminderDays * 86400000), createdBy: actorId }, select: { id: true } });
    await tx.supply_invoice_events.create({ data: { invoiceId: line.invoiceId, type: "HANDOFF", actorId, detail: { handoffId: saved.id, quantity: input.quantity, technician: input.technician } } });
    return saved;
  });
}
export async function handoffDetail(id: string, page: number) {
  const db = getPrismaClient();
  const handoff = await db.supply_handoffs.findUnique({ where: { id }, include: handoffInclude });
  if (!handoff) fail("NOT_FOUND", 404);
  const [movements, count] = await Promise.all([
    db.supply_movements.findMany({ where: { handoffId: id }, include: { allocations: true, reversedBy: { select: { id: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 }), db.supply_movements.count({ where: { handoffId: id } }),
  ]);
  return wire({ handoff, movements, count, page });
}
export async function saveMovement(id: string, input: MovementInput, actorId: string) {
  return getPrismaClient().$transaction(async (tx) => {
    const previous = await tx.supply_movements.findUnique({ where: { handoffId_requestKey: { handoffId: id, requestKey: input.requestKey } } });
    if (previous) { sameRequest(previous, input); return { id: previous.id, alreadySaved: true }; }
    const handoff = await tx.supply_handoffs.findUnique({ where: { id }, include: { line: true } });
    if (!handoff) fail("NOT_FOUND", 404);
    let quantity: Prisma.Decimal, remaining: Prisma.Decimal, reversalOf: string | undefined;
    const usedAt = "usedDate" in input ? localDayStart(input.usedDate) : new Date();
    validDate(usedAt, handoff.assignedAt);
    if (input.action === "CONSUMPTION") {
      quantity = consumptionTotal(input.forms); remaining = remainingAfterUse(handoff.remaining, quantity, input.exhausted);
    } else if (input.action === "RETURN") {
      quantity = new Prisma.Decimal(input.quantity); remaining = remainingAfterUse(handoff.remaining, quantity, false);
      await tx.supply_invoice_lines.update({ where: { id: handoff.lineId }, data: { availableQuantity: { increment: quantity }, version: { increment: 1 } } });
    } else {
      const original = await tx.supply_movements.findUnique({ where: { id: input.movementId }, include: { reversedBy: { select: { id: true } } } });
      if (!original || original.handoffId !== id || original.type === "REVERSAL" || original.reversedBy) fail("MOVEMENT_CANNOT_REVERSE", 422);
      quantity = original.quantity; reversalOf = original.id; remaining = handoff.remaining.plus(quantity);
      if (remaining.gt(handoff.quantityGiven)) fail("REVERSAL_EXCEEDS_GIVEN", 422);
      if (original.type === "RETURN" && !(await tx.supply_invoice_lines.updateMany({ where: { id: handoff.lineId, availableQuantity: { gte: quantity } }, data: { availableQuantity: { decrement: quantity }, version: { increment: 1 } } })).count) fail("RETURN_STOCK_ALREADY_DELIVERED");
    }
    if (!(await tx.supply_handoffs.updateMany({ where: { id, version: input.version }, data: { remaining, status: remaining.isZero() ? "CLOSED" : "ACTIVE", version: { increment: 1 } } })).count) fail("STALE_VERSION");
    // Exported forms provide evidence of a code, never automatic evidence of a physical consumption.
    const knownForms = input.action === "CONSUMPTION" ? await tx.sytex_supply_import_items.findMany({ where: { formulario: { in: input.forms.map((f) => f.formCode) } }, select: { formulario: true }, distinct: ["formulario"] }) : [];
    const known = new Set(knownForms.map((f) => f.formulario));
    const saved = await tx.supply_movements.create({ data: { handoffId: id, requestKey: input.requestKey, requestHash: hash(input), type: input.action, quantity, usedAt, notes: input.notes, actorId, reversalOf, ...(input.action === "CONSUMPTION" ? { allocations: { create: input.forms.map((form) => ({ ...form, verification: known.has(form.formCode) ? "KNOWN_SYTEX" : "PENDING_VERIFICATION" })) } } : {}) }, select: { id: true } });
    await tx.supply_invoice_events.create({ data: { invoiceId: handoff.line.invoiceId, type: input.action, actorId, detail: { handoffId: id, movementId: saved.id, quantity: quantity.toString(), reversalOf: reversalOf ?? null } } });
    return saved;
  });
}
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export function inspectFile(bytes: Uint8Array, original: string) {
  const prefix = Buffer.from(bytes.slice(0, 16));
  const mimeType = prefix.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : prefix.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png" : prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 ? "image/jpeg" : prefix.subarray(0, 4).toString() === "RIFF" && prefix.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!mimeType) fail("FILE_TYPE_INVALID", 422);
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) fail("FILE_TOO_LARGE", 413);
  const extension = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[mimeType];
  const stem = original.replace(/\.[^.]*$/, "").normalize("NFKC").replace(/[^\p{L}\p{N} _.-]/gu, "_").replace(/\.+/g, ".").slice(0, 150) || "comprobante";
  return { mimeType, fileName: stem + extension, byteCount: bytes.length, fileHash: createHash("sha256").update(bytes).digest("hex") };
}
export async function addFile(invoiceId: string, bytes: Uint8Array, original: string, actorId: string) {
  const metadata = inspectFile(bytes, original);
  return getPrismaClient().$transaction(async (tx) => {
    const invoice = await tx.supply_invoices.findUnique({ where: { id: invoiceId }, include: { attachments: { select: { id: true, fileHash: true, byteCount: true, removedAt: true } } } });
    if (!invoice) fail("NOT_FOUND", 404);
    const duplicate = invoice.attachments.find((f) => f.fileHash === metadata.fileHash);
    if (duplicate && !duplicate.removedAt) return { id: duplicate.id, alreadySaved: true };
    if (invoice.uploadedAt) fail("RESET_UPLOAD_BEFORE_CHANGING_FILES", 422);
    const active = invoice.attachments.filter((f) => !f.removedAt);
    if (active.length >= 6 || active.reduce((total, f) => total + f.byteCount, 0) + bytes.length > 24 * 1024 * 1024) fail("INVOICE_FILE_LIMIT", 422);
    if (!(await tx.supply_invoices.updateMany({ where: { id: invoiceId, version: invoice.version }, data: { version: { increment: 1 }, downloadedAt: null } })).count) fail("STALE_VERSION");
    const saved = duplicate ? await tx.supply_invoice_attachments.update({ where: { id: duplicate.id }, data: { removedAt: null }, select: { id: true } }) : await tx.supply_invoice_attachments.create({ data: { invoiceId, ...metadata, content: new Uint8Array(bytes), createdBy: actorId }, select: { id: true } });
    await tx.supply_invoice_events.create({ data: { invoiceId, type: "FILE_ADDED", actorId, detail: { fileId: saved.id, fileName: metadata.fileName } } });
    return saved;
  });
}
export async function privateFile(id: string) {
  const file = await getPrismaClient().supply_invoice_attachments.findUnique({ where: { id } });
  if (!file || file.removedAt) fail("NOT_FOUND", 404);
  return file;
}
export async function removeFile(id: string, version: number, reason: string, actorId: string) {
  return getPrismaClient().$transaction(async (tx) => {
    const file = await tx.supply_invoice_attachments.findUnique({ where: { id }, include: { invoice: true } });
    if (!file || file.removedAt) fail("NOT_FOUND", 404);
    if (file.invoice.uploadedAt) fail("RESET_UPLOAD_BEFORE_CHANGING_FILES", 422);
    if (!(await tx.supply_invoices.updateMany({ where: { id: file.invoiceId, version }, data: { version: { increment: 1 }, downloadedAt: null } })).count) fail("STALE_VERSION");
    await tx.supply_invoice_attachments.update({ where: { id }, data: { removedAt: new Date() } });
    await tx.supply_invoice_events.create({ data: { invoiceId: file.invoiceId, type: "FILE_REMOVED", actorId, detail: { fileId: id, reason } } });
    return { saved: true };
  });
}
export async function invoiceFiles(id: string) {
  const invoice = await getPrismaClient().supply_invoices.findUnique({ where: { id }, include: { attachments: { where: { removedAt: null } } } });
  if (!invoice) fail("NOT_FOUND", 404);
  if (!invoice.attachments.length) fail("ATTACHMENT_REQUIRED", 422);
  return invoice;
}
