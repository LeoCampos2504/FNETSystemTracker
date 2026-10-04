import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), createBatch: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/services/auth-sessions", () => ({ requireAdminSession: mocks.authorize }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({ mendel_transactions: { findMany: mocks.findMany }, $transaction: mocks.transaction }) }));
import { POST } from "./route";

function request(notes: string | undefined, mode = "commit") {
  const csv = `ID Transaccion,Fecha transaccion,Importe Total,Moneda${notes === undefined ? "" : ",Notas"}\nABC-123,2026/09/25 08:33,1,ARS${notes === undefined ? "" : `,${notes}`}`;
  const form = new FormData();
  form.set("file", new File([csv], "mendel.csv", { type: "text/csv" }));
  form.set("mode", mode);
  return new NextRequest("http://localhost:3000/api/mendel/transactions/import", { method: "POST", headers: { origin: "http://localhost:3000" }, body: form });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
  mocks.findMany.mockResolvedValue([{ transactionId: "ABC-123" }]);
  mocks.transaction.mockImplementation(async (callback) => callback({
    mendel_transactions: { upsert: mocks.upsert },
    mendel_form_references: { deleteMany: mocks.deleteMany, createMany: mocks.createMany },
    mendel_import_batches: { create: mocks.createBatch },
  }));
});

describe("Mendel reference reimport", () => {
  it("replaces references within the transaction without changing internal reconciliation", async () => {
    const response = await POST(request("FO-26-610350 y FO-26-610351"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imported: true, insertedCount: 0, updatedCount: 1 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { transactionId: "ABC-123" } });
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [
      { transactionId: "ABC-123", formCode: "FO-26-610350" },
      { transactionId: "ABC-123", formCode: "FO-26-610351" },
    ] });
    expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty("reconciliationStatus");
    expect(mocks.upsert.mock.calls[0][0].update).not.toHaveProperty("formReferences");
    expect(mocks.createBatch).toHaveBeenCalledTimes(1);
  });
  it("preserves existing references if the CSV does not have a notes column", async () => {
    expect((await POST(request(undefined))).status).toBe(200);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
  it("clears prior references when notes are explicitly empty", async () => {
    expect((await POST(request(""))).status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
  it("previews references without writing", async () => {
    const response = await POST(request("FO-26-610350", "preview"));
    expect(await response.json()).toMatchObject({ transactionsWithFormReferences: 1 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before any purchase query or write", async () => {
    const input = request("FO-26-610350");
    input.headers.set("origin", "https://foreign.invalid");
    expect((await POST(input)).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
