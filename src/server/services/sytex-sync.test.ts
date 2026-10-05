import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn(), executeRaw: vi.fn((..._parts: unknown[]) => "statement"), transaction: vi.fn(async (..._statements: unknown[]) => []) }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({ $executeRaw: mocks.executeRaw, $transaction: mocks.transaction }) }));
vi.mock("@/server/services/sytex-supply-imports", () => ({ saveSytexSupplyExport: mocks.save }));
// Each fake response carries its rows as JSON instead of a real workbook.
vi.mock("read-excel-file/node", () => ({ readSheet: async (bytes: Buffer) => JSON.parse(bytes.toString("utf8")) }));
import { runSytexSync, syncWindowStart, sytexConfig, sytexSettings } from "./sytex-sync";

const config = { baseUrl: "https://sytex.example.invalid", authorization: "Token secret", organization: "1" };
const formHeaders = ["Código", "Nombre", "Plantilla", "Proyecto", "Códigos de sitios afectados", "Nombres de sitios afectados", "Asignado a", "Usuario colaborador"];
const answerHeaders = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados"];
function sytex(routes: Record<string, unknown>, calls: { url: string; headers: Record<string, string> }[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, headers: init?.headers as Record<string, string> });
    const key = Object.keys(routes).find((route) => url.includes(route));
    if (!key) return new Response(JSON.stringify([formHeaders]), { status: 200 });
    const value = routes[key];
    return value instanceof Response ? value : new Response(JSON.stringify(value), { status: 200 });
  }) as typeof fetch;
}
const projects = { "/api/project/?q=MPC": { next: null, results: [{ id: 7, name: "NON - MPC Mantenimiento Preventivo Civil O&M" }, { id: 8, name: "BAS - MPC Mantenimiento Preventivo Civil O&M" }] }, "/api/project/?q=MCC": { next: null, results: [] } };
const nonForms = [formHeaders, ["FO-26-000001", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC Mantenimiento Preventivo Civil O&M", "ST00001", "Sitio", "tecnico@example.invalid", null]];
const nonAnswers = [answerHeaders, ["FO-26-000001", "[#1] Insumo", "1.17A.1", "Descripción", "Precintos", "ST00001"], ["FO-26-000001", "[#1] Insumo", "1.17A.2", "Cantidad", 40, "ST00001"]];

beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ importId: "00000000-0000-4000-8000-00000000000a", alreadyImported: false }); });

describe("direct Sytex synchronization", () => {
  it("covers the previous and the current month in Argentina time", () => {
    expect(syncWindowStart(new Date("2026-10-05T15:00:00Z"))).toBe("2026-09-01");
    expect(syncWindowStart(new Date("2026-01-01T02:00:00Z"))).toBe("2025-11-01");
  });
  it("is disabled without a credential and never uses an insecure address", () => {
    expect(sytexSettings({})).toBeNull();
    expect(sytexSettings({ SYTEX_USER: "persona@example.invalid" })).toBeNull();
    expect(sytexSettings({ SYTEX_AUTHORIZATION: "Token x", SYTEX_BASE_URL: "http://sytex.example.invalid" })).toBeNull();
    expect(sytexSettings({ SYTEX_AUTHORIZATION: " Token x " })).toEqual({ baseUrl: "https://claro.sytex.io", organization: "1", candidates: ["Token x"] });
  });
  it("offers the profile key as user and key first, then as a token", () => {
    expect(sytexSettings({ SYTEX_USER: "persona@example.invalid", SYTEX_API_KEY: "clave" })?.candidates).toEqual(["Basic " + Buffer.from("persona@example.invalid:clave").toString("base64"), "Token clave"]);
    expect(sytexSettings({ SYTEX_API_KEY: "clave" })?.candidates).toEqual(["Token clave"]);
  });
  it("keeps the form of the credential that Sytex accepts and fails clearly when none works", async () => {
    const settings = { baseUrl: "https://sytex.example.invalid", organization: "1", candidates: ["Basic uno", "Token dos"] };
    const seen: string[] = [];
    const picky = (async (_input: string | URL | Request, init?: RequestInit) => { const value = (init?.headers as Record<string, string>).Authorization; seen.push(value); return new Response("{}", { status: value === "Token dos" ? 200 : 401 }); }) as typeof fetch;
    expect((await sytexConfig(settings, picky)).authorization).toBe("Token dos");
    expect((await sytexConfig(settings, picky)).authorization).toBe("Token dos");
    expect(seen).toEqual(["Basic uno", "Token dos"]);
    const closed = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    await expect(sytexConfig({ ...settings, candidates: ["Token otro"] }, closed)).rejects.toThrow("SYTEX_CREDENTIAL_REJECTED");
  });
  it("downloads answers only for projects with forms and stores every project in one batch", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const result = await runSytexSync("user-id", config, sytex({ ...projects, "/api/formdata/?org_id=1&plan_date__gte=2026-09-01&project=7": nonForms, "/api/entryanswerdata/?org_id=1&plan_date__gte=2026-09-01&project=7": nonAnswers }, calls), new Date("2026-10-05T15:00:00Z"));
    expect(result).toEqual({ projects: 1, forms: 1, items: 1, changed: true, since: "2026-09-01" });
    expect(calls.filter((call) => call.url.includes("/api/entryanswerdata/")).map((call) => call.url)).toEqual(["https://sytex.example.invalid/api/entryanswerdata/?org_id=1&plan_date__gte=2026-09-01&project=7"]);
    expect(calls.every((call) => call.headers.Authorization === "Token secret" && call.headers.Organization === "1")).toBe(true);
    const [parsed, identity, name, user] = mocks.save.mock.calls[0];
    expect(parsed.items[0]).toMatchObject({ formulario: "FO-26-000001", description: "Precintos", quantity: "40" });
    expect(parsed.formContexts[0]).toMatchObject({ code: "FO-26-000001", project: "NON - MPC Mantenimiento Preventivo Civil O&M", type: "PREVENTIVO" });
    expect([identity.length, name, user]).toEqual([64, "Sincronización directa Sytex", "user-id"]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("does not rewrite anything when Sytex has not changed", async () => {
    mocks.save.mockResolvedValue({ importId: "existing", alreadyImported: true });
    const routes = { ...projects, "/api/entryanswerdata/": nonAnswers, "project=7": nonForms };
    const first = await runSytexSync("user-id", config, sytex(routes)), second = await runSytexSync("user-id", config, sytex(routes));
    expect(first.changed).toBe(false);
    expect(mocks.save.mock.calls[0][1]).toBe(mocks.save.mock.calls[1][1]);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(second.items).toBe(1);
  });
  it("reports a rejected credential without saving", async () => {
    await expect(runSytexSync("user-id", config, sytex({ "/api/project/": new Response("{}", { status: 401 }) }))).rejects.toThrow("SYTEX_CREDENTIAL_REJECTED");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("saves nothing while no form has materials", async () => {
    const result = await runSytexSync("user-id", config, sytex({ ...projects, "/api/entryanswerdata/": [answerHeaders], "project=7": nonForms }));
    expect(result).toMatchObject({ projects: 1, items: 0, changed: false });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
