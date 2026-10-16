import { afterEach, describe, expect, it, vi } from "vitest";
import { loadZoneHistory } from "./mendel-zone-history";

afterEach(() => vi.unstubAllGlobals());

describe("Mendel history read states", () => {
  it("encodes the real ID and keeps actor/date/revision without writing anything", async () => {
    const history = [{ id: "1", decision: "AUTORIZADO", comment: "Comentario de prueba", actor_name: "Cuenta ficticia", expense_revision: 2, created_at: "2026-10-16T12:00:00Z" }];
    const fetch = vi.fn().mockResolvedValue(Response.json({ history }));
    vi.stubGlobal("fetch", fetch);
    expect(await loadZoneHistory("EXAMPLE A&B")).toEqual(history);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/mendel/zone-control?transactionId=EXAMPLE%20A%26B", { cache: "no-store", signal: undefined });
  });
  it("accepts a confirmed empty history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ history: [] })));
    expect(await loadZoneHistory("EXAMPLE-1")).toEqual([]);
  });
  it.each([[401, /sesión venció/], [403, /permiso/], [404, /no está disponible/], [503, /reintentar/]])("does not turn HTTP %s into no prior replies", async (status, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "EXAMPLE_ERROR" }, { status })));
    await expect(loadZoneHistory("EXAMPLE-1")).rejects.toThrow(expected);
  });
  it("does not treat a network error as an empty history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Synthetic network error")));
    await expect(loadZoneHistory("EXAMPLE-1")).rejects.toThrow("Synthetic network error");
  });
  it.each([{ history: null }, { rows: [] }, { history: [{ id: "1", created_at: "not-a-date" }] }])("rejects an invalid history response: %j", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(loadZoneHistory("EXAMPLE-1")).rejects.toThrow(/leer el historial/);
  });
  it("passes the cancellation signal through to the read request", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ history: [] }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await loadZoneHistory("EXAMPLE-1", controller.signal);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });
});
