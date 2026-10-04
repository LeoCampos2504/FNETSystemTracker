import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), batch: vi.fn(), technicians: vi.fn(), purchases: vi.fn() }));
vi.mock("@/server/services/auth-sessions", () => ({ requireAdminSession: mocks.authorize }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({
  sytex_supply_imports: { findFirst: mocks.batch },
  preventivos: { findMany: mocks.technicians },
  mendel_transactions: { findMany: mocks.purchases },
}) }));
import { GET } from "./route";
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const batch = {
  id, fileName: "source.xlsx", importedAt: new Date("2026-10-04T21:00:00Z"), answerCount: 100, formCount: 3,
  sourceEditedFrom: "2026-10-01T10:00:00", sourceEditedThrough: "2026-10-02T18:00:00",
  items: [{ id: "item-1", formulario: "FO-26-000001", grupo: "[#1] Insumo", indice: "1A", description: "LED", quantity: "0", provider: null, siteCode: "ST00001", siteName: "Sitio", status: "Enviado", image: null, imageDeclared: true, lastEditedBy: "Editor", sourceEditedAt: "2026-10-02T18:00:00" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ ok: true }); mocks.batch.mockResolvedValue(batch);
  mocks.technicians.mockResolvedValue([{ codigo: "FO-26-000001", asignado_a: "Técnico asignado" }]); mocks.purchases.mockResolvedValue([]);
});
describe("imported Sytex source read model", () => {
  it("reports the export scope separately from material count and preserves zero quantities and missing photos", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/insumos/export"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ source: "sytex-export", count: 1,
      exportDetails: { answerCount: 100, formCount: 3, fileName: "source.xlsx" },
      items: [{ quantity: 0, image: null, imageDeclared: true, technician: "Técnico asignado", lastEditedBy: "Editor", mendel: { consumptionConfirmed: false } }],
    });
  });
  it("opens the exact batch returned by import rather than substituting a different latest file", async () => {
    await GET(new NextRequest(`http://localhost:3000/api/insumos/export?importId=${id}`));
    expect(mocks.batch.mock.calls[0][0].where).toEqual({ id });
  });
  it("does not infer an assigned technician from the editor when assignment data is absent", async () => {
    mocks.technicians.mockResolvedValue([]);
    const response = await GET(new NextRequest("http://localhost:3000/api/insumos/export"));
    expect((await response.json()).items[0]).toMatchObject({ technician: null, lastEditedBy: "Editor" });
  });
  it("returns an explicit empty export source when no file has been saved", async () => {
    mocks.batch.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost:3000/api/insumos/export"));
    expect(await response.json()).toEqual({ source: "sytex-export", count: 0, items: [], exportDetails: null });
    expect(mocks.purchases).not.toHaveBeenCalled();
  });
  it("rejects unauthorized queries and malformed IDs before querying the source", async () => {
    mocks.authorize.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 }) });
    expect((await GET(new NextRequest("http://localhost:3000/api/insumos/export"))).status).toBe(401);
    expect((await GET(new NextRequest("http://localhost:3000/api/insumos/export?importId=invalid"))).status).toBe(400);
    expect(mocks.batch).not.toHaveBeenCalled();
  });
});
