import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSytexSupplyRows } from "@/server/sytex-supply-export";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({ sytex_supply_imports: mocks }) }));
import { saveSytexSupplyExport } from "./sytex-supply-imports";
const parsed = parseSytexSupplyRows([
  ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta"],
  ["FO-26-000001", "[#1] Insumo", "1.1", "Descripción del insumo:", "LED"],
  ["FO-26-000001", "[#1] Insumo", "1.2", "Cantidad", "1"],
]);
beforeEach(() => { vi.resetAllMocks(); mocks.findUnique.mockResolvedValue(null); mocks.create.mockResolvedValue({ id: "saved-id" }); });
describe("Sytex export persistence", () => {
  it("saves the batch and its items as one atomic nested create in FNET-owned tables", async () => {
    expect(await saveSytexSupplyExport(parsed, "hash", "source.xlsx", "admin-id")).toEqual({ importId: "saved-id", alreadyImported: false });
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fileHash: "hash", importedBy: "admin-id", answerCount: 2, items: { create: parsed.items } }), select: { id: true } });
  });
  it("returns an existing batch without duplicating or replacing it", async () => {
    mocks.findUnique.mockResolvedValue({ id: "existing-id" });
    expect(await saveSytexSupplyExport(parsed, "hash", "source.xlsx", "admin-id")).toEqual({ importId: "existing-id", alreadyImported: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("handles concurrent imports of the same file using the unique file hash", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "concurrent-id" });
    mocks.create.mockRejectedValue({ code: "P2002" });
    expect(await saveSytexSupplyExport(parsed, "hash", "source.xlsx", "admin-id")).toEqual({ importId: "concurrent-id", alreadyImported: true });
  });
  it("refuses conflicting or empty snapshots before any database write", async () => {
    await expect(saveSytexSupplyExport({ ...parsed, errors: [{ line: 3, code: "ITEM_FIELD_CONFLICT" }] }, "hash", "source.xlsx", "admin-id")).rejects.toThrow("SYTEX_EXPORT_HAS_CONFLICTS");
    await expect(saveSytexSupplyExport({ ...parsed, items: [] }, "hash", "source.xlsx", "admin-id")).rejects.toThrow("SYTEX_EXPORT_NO_ITEMS");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("propagates a failed create instead of claiming that the export was saved", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));
    await expect(saveSytexSupplyExport(parsed, "hash", "source.xlsx", "admin-id")).rejects.toThrow("database unavailable");
  });
});
