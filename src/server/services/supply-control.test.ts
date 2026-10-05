import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const fake = vi.hoisted(() => ({ db: {} as Record<string, unknown> }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => fake.db }));
import { createHandoff, saveMovement } from "./supply-control";
const actor = "00000000-0000-4000-8000-000000000001", lineId = "00000000-0000-4000-8000-000000000002", id = "00000000-0000-4000-8000-000000000003";
const d = (n: string) => new Prisma.Decimal(n);
const consume = () => ({ action: "CONSUMPTION" as const, requestKey: crypto.randomUUID(), version: 2, usedDate: "2026-10-04", exhausted: true, forms: [{ formCode: "FO-26-000001", quantity: "2" }] });
let tx: Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => {
 tx = {
  supply_invoice_lines: { findUnique: vi.fn(async () => ({ id: lineId, invoiceId: id, invoice: { invoiceDate: new Date("2026-09-01") } })), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})) },
  supply_handoffs: { findUnique: vi.fn(async (args) => 'lineId_requestKey' in args.where ? null : ({ id, lineId, line: { invoiceId: id }, remaining: d("2"), quantityGiven: d("2"), assignedAt: new Date("2026-09-01") })), updateMany: vi.fn(async () => ({ count: 1 })), create: vi.fn(async () => ({ id })) },
  supply_movements: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id })) },
  sytex_supply_import_items: { findMany: vi.fn(async () => []) }, supply_invoice_events: { create: vi.fn(async () => ({})) },
 };
 fake.db = { $transaction: async (run: (tx: unknown) => unknown) => run(tx) };
});
describe("supply transactional boundaries", () => {
 it("requires both the line version and sufficient stock for delivery", async () => {
  tx.supply_invoice_lines.updateMany.mockResolvedValue({ count: 0 });
  await expect(createHandoff({ lineId, version: 1, requestKey: crypto.randomUUID(), technician: "Tecnico", quantity: "3", assignedDate: "2026-10-04", reminderDays: 14 }, actor)).rejects.toThrow("STOCK_CHANGED_OR_INSUFFICIENT");
  expect(tx.supply_handoffs.create).not.toHaveBeenCalled(); expect(tx.supply_invoice_lines.updateMany.mock.calls[0][0].where).toEqual({ id: lineId, version: 1, availableQuantity: { gte: "3" } });
 });
 it("rejects stale handoff versions before recording consumption", async () => { tx.supply_handoffs.updateMany.mockResolvedValue({ count: 0 }); await expect(saveMovement(id, consume(), actor)).rejects.toThrow("STALE_VERSION"); expect(tx.supply_movements.create).not.toHaveBeenCalled(); });
 it("records unverified FO codes explicitly instead of inventing Sytex evidence", async () => { await saveMovement(id, consume(), actor); const write = tx.supply_movements.create.mock.calls[0][0].data; expect(write.allocations.create[0].verification).toBe("PENDING_VERIFICATION"); expect(tx.supply_handoffs.updateMany.mock.calls[0][0].data.status).toBe("CLOSED"); });
 it("cannot reverse returned material that was delivered again", async () => {
  tx.supply_handoffs.findUnique.mockResolvedValue({ id, lineId, line: { invoiceId: id }, remaining: d("0"), quantityGiven: d("2"), assignedAt: new Date("2026-09-01") });
  tx.supply_movements.findUnique.mockImplementation(async (args) => args.where.id ? ({ id: lineId, handoffId: id, type: "RETURN", quantity: d("2"), reversedBy: null }) : null);
  tx.supply_invoice_lines.updateMany.mockResolvedValue({ count: 0 });
  await expect(saveMovement(id, { action: "REVERSAL", requestKey: crypto.randomUUID(), version: 0, movementId: lineId, notes: "Corregir cantidad" }, actor)).rejects.toThrow("RETURN_STOCK_ALREADY_DELIVERED"); expect(tx.supply_movements.create).not.toHaveBeenCalled();
 });
 it("retries an identical request without subtracting twice", async () => {
  const input = consume(); const { createHash } = await import('node:crypto'); tx.supply_movements.findUnique.mockResolvedValue({ id, requestHash: createHash('sha256').update(JSON.stringify(input)).digest('hex') });
  expect(await saveMovement(id, input, actor)).toEqual({ id, alreadySaved: true }); expect(tx.supply_handoffs.updateMany).not.toHaveBeenCalled();
 });
});
