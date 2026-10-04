import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSytexSupplyRows } from "@/server/sytex-supply-export";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), parse: vi.fn(), save: vi.fn() }));
vi.mock("@/server/services/auth-sessions", () => ({ requireAdminSession: mocks.authorize }));
vi.mock("@/server/services/sytex-supply-imports", () => ({ saveSytexSupplyExport: mocks.save }));
vi.mock("@/server/sytex-supply-export", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/sytex-supply-export")>(), parseSytexSupplyExport: mocks.parse,
}));
import { POST } from "./route";
const parsed = parseSytexSupplyRows([
  ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta"],
  ["FO-26-000001", "[#1] Insumo", "1.1", "Descripción del insumo:", "LED"],
  ["FO-26-000001", "[#1] Insumo", "1.2", "Cantidad", "1"],
]);
function request(mode = "preview", origin = "http://localhost:3000", name = "source.xlsx") {
  const body = new FormData(); body.set("file", new File(["xlsx-parser-mocked"], name)); body.set("mode", mode);
  return new NextRequest("http://localhost:3000/api/insumos/export/import", { method: "POST", headers: { origin }, body });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin-id" } });
  mocks.parse.mockResolvedValue(parsed);
  mocks.save.mockResolvedValue({ importId: "batch-id", alreadyImported: false });
});
describe("protected Sytex XLSX import", () => {
  it("previews the actual identified item count without writing", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ answerCount: 2, formCount: 1, itemCount: 1, errorCount: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("only saves after an explicit commit and attributes the batch to the authenticated Admin", async () => {
    const response = await POST(request("commit"));
    expect(await response.json()).toMatchObject({ imported: true, importId: "batch-id" });
    expect(mocks.save).toHaveBeenCalledWith(parsed, expect.stringMatching(/^[a-f0-9]{64}$/), "source.xlsx", "admin-id");
  });
  it("rejects unauthorized access before parsing the file", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before parsing or saving", async () => {
    expect((await POST(request("commit", "https://foreign.invalid"))).status).toBe(403);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects wrong file types and oversized uploads", async () => {
    expect((await POST(request("preview", "http://localhost:3000", "source.csv"))).status).toBe(400);
    const large = request(); large.headers.set("content-length", String(9 * 1024 * 1024));
    expect((await POST(large)).status).toBe(413);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("blocks conflicting or empty imports without writing a partial snapshot", async () => {
    mocks.parse.mockResolvedValueOnce({ ...parsed, errors: [{ line: 3, code: "ITEM_FIELD_CONFLICT" }] });
    expect((await POST(request("commit"))).status).toBe(422);
    mocks.parse.mockResolvedValueOnce({ ...parsed, items: [] });
    expect((await POST(request("commit"))).status).toBe(422);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reports parser and persistence failures instead of claiming an import", async () => {
    mocks.parse.mockRejectedValueOnce(new Error("SYTEX_EXPORT_HEADERS_MISSING"));
    expect((await POST(request())).status).toBe(422);
    mocks.save.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(request("commit"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "SYTEX_IMPORT_FAILED" });
  });
});
