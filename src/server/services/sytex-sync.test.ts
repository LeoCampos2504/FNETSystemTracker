import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ save: vi.fn(), executeRaw: vi.fn((..._parts: unknown[]) => "statement"), transaction: vi.fn(async (..._statements: unknown[]) => []) }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({ $executeRaw: mocks.executeRaw, $transaction: mocks.transaction }) }));
vi.mock("@/server/services/sytex-supply-imports", () => ({ saveSytexSupplyExport: mocks.save }));
// Each fake response carries its rows as JSON instead of a real workbook.
vi.mock("read-excel-file/node", () => ({ readSheet: async (bytes: Buffer) => JSON.parse(bytes.toString("utf8")) }));
import { configuredProjectIds, runSytexSync, syncWindowStart, syncWindows, sytexConfig, sytexSettings } from "./sytex-sync";

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
  it("covers the two closed months and the current one in Argentina time", () => {
    expect(syncWindowStart(new Date("2026-10-05T15:00:00Z"))).toBe("2026-08-01");
    expect(syncWindowStart(new Date("2026-01-01T02:00:00Z"))).toBe("2025-10-01");
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
    const result = await runSytexSync("user-id", config, sytex({ ...projects, "/api/formdata/?org_id=1&plan_date__gte=2026-10-01&project=7": nonForms, "/api/entryanswerdata/?org_id=1&plan_date__gte=2026-10-01&project=7": nonAnswers }, calls), new Date("2026-10-05T15:00:00Z"));
    expect(result).toEqual({ projects: 1, forms: 1, items: 1, changed: true, since: "2026-08-01" });
    expect(calls.filter((call) => call.url.includes("/api/entryanswerdata/")).map((call) => call.url)).toEqual(["https://sytex.example.invalid/api/entryanswerdata/?org_id=1&plan_date__gte=2026-10-01&project=7"]);
    expect(calls.filter((call) => call.url.includes("/api/formdata/") && call.url.includes("project=7")).map((call) => call.url.split("?")[1])).toEqual(["org_id=1&plan_date__gte=2026-08-01&plan_date__lte=2026-08-31&project=7", "org_id=1&plan_date__gte=2026-09-01&plan_date__lte=2026-09-30&project=7", "org_id=1&plan_date__gte=2026-10-01&project=7"]);
    expect(calls.every((call) => call.headers.Authorization === "Token secret" && call.headers.Organization === "1")).toBe(true);
    const [parsed, identity, name, user] = mocks.save.mock.calls[0];
    expect(parsed.items[0]).toMatchObject({ formulario: "FO-26-000001", description: "Precintos", quantity: "40" });
    expect(parsed.formContexts[0]).toMatchObject({ code: "FO-26-000001", project: "NON - MPC Mantenimiento Preventivo Civil O&M", type: "PREVENTIVO" });
    expect([identity.length, name, user]).toEqual([64, "Sincronización directa Sytex", "user-id"]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("keeps going when one form has contradictory answers and reports which one", async () => {
    const answers = [...nonAnswers, ["FO-26-000009", "[#1] Insumo", "1.17A.1", "Descripción", "Diésel", "ST00001"], ["FO-26-000009", "[#1] Insumo", "1.17A.1", "Descripción", "Nafta", "ST00001"], ["FO-26-000009", "[#1] Insumo", "1.17A.2", "Cantidad", 5, "ST00001"]];
    const result = await runSytexSync("user-id", config, sytex({ ...projects, "/api/entryanswerdata/": answers, "project=7": nonForms }));
    expect((result as { skipped?: string[] }).skipped).toEqual(["FO-26-000009"]);
    expect(mocks.save.mock.calls[0][0].items.map((item: { formulario: string }) => item.formulario)).toEqual(["FO-26-000001"]);
    expect(mocks.save.mock.calls[0][0].errors).toEqual([]);
  });
  it("deletes insumos that a listed form no longer has, but never touches skipped forms", async () => {
    const answers = [...nonAnswers, ["FO-26-000009", "[#1] Insumo", "1.17A.1", "Descripción", "Diésel", "ST00001"], ["FO-26-000009", "[#1] Insumo", "1.17A.1", "Descripción", "Nafta", "ST00001"]];
    const forms = [...nonForms, ["FO-26-000009", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC Mantenimiento Preventivo Civil O&M", "ST00001", "Sitio", "tecnico@example.invalid", null]];
    await runSytexSync("user-id", config, sytex({ ...projects, "/api/entryanswerdata/": answers, "project=7": forms }));
    const call = mocks.executeRaw.mock.calls.find((parts) => String((parts[0] as string[]).join("?")).includes("NOT EXISTS"));
    expect(call?.[2]).toEqual(["FO-26-000001"]);
    expect(call?.[3]).toEqual(["FO-26-000001"]);
  });
  it("saves the rest when a closed month cannot be downloaded, and does not delete what that month had", async () => {
    const augustForms = [formHeaders, ["FO-26-000002", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC Mantenimiento Preventivo Civil O&M", "ST00001", "Sitio", "tecnico@example.invalid", null]];
    const routes = { "/api/formdata/?org_id=1&plan_date__gte=2026-08-01&plan_date__lte=2026-08-31&project=7": augustForms, "/api/entryanswerdata/?org_id=1&plan_date__gte=2026-08-01&plan_date__lte=2026-08-31&project=7": new Response("", { status: 504 }),
      ...projects, "/api/entryanswerdata/": nonAnswers, "project=7": nonForms };
    const result = await runSytexSync("user-id", config, sytex(routes), new Date("2026-10-05T15:00:00Z"), [0]);
    expect(result).toMatchObject({ items: 1, incomplete: 1 });
    const cleanup = mocks.executeRaw.mock.calls.find((parts) => String((parts[0] as string[]).join("?")).includes("NOT EXISTS"));
    expect(cleanup?.[2]).toEqual(["FO-26-000001"]);
  });
  it("still fails when the current month cannot be downloaded", async () => {
    const routes = { "/api/entryanswerdata/?org_id=1&plan_date__gte=2026-10-01&project=7": new Response("", { status: 504 }), ...projects, "/api/entryanswerdata/": nonAnswers, "project=7": nonForms };
    await expect(runSytexSync("user-id", config, sytex(routes), new Date("2026-10-05T15:00:00Z"), [0])).rejects.toThrow("SYTEX_RESPONSE_504");
  });
  it("cleans removed insumos even when the rest of Sytex has not changed", async () => {
    mocks.save.mockResolvedValue({ importId: "existing", alreadyImported: true });
    await runSytexSync("user-id", config, sytex({ ...projects, "/api/entryanswerdata/": nonAnswers, "project=7": nonForms }));
    expect(mocks.executeRaw.mock.calls.some((parts) => String((parts[0] as string[]).join("?")).includes("NOT EXISTS"))).toBe(true);
    expect(mocks.transaction).not.toHaveBeenCalled();
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
    await expect(runSytexSync("user-id", config, sytex({ "/api/": new Response("{}", { status: 401 }) }))).rejects.toThrow("SYTEX_CREDENTIAL_REJECTED");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses the known maintenance projects when the key only opens the export addresses", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const result = await runSytexSync("user-id", config, sytex({ "/api/project/": new Response("{}", { status: 401 }), "/api/entryanswerdata/": nonAnswers, "project=8677": nonForms }, calls));
    expect(result).toMatchObject({ projects: 1, items: 1 });
    expect(calls.filter((call) => call.url.includes("/api/formdata/")).length).toBe(configuredProjectIds().length * syncWindows().length);
    expect(configuredProjectIds({ SYTEX_PROJECT_IDS: "8677, 2346;8677 x" })).toEqual([8677, 2346]);
  });
  it("asks month by month and retries an export that Sytex could not serve at first", async () => {
    expect(syncWindows(new Date("2026-03-10T15:00:00Z"))).toEqual(["plan_date__gte=2026-01-01&plan_date__lte=2026-01-31", "plan_date__gte=2026-02-01&plan_date__lte=2026-02-28", "plan_date__gte=2026-03-01"]);
    let failures = 1;
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/api/entryanswerdata/") && failures-- > 0) return new Response("", { status: 504 });
      return sytex({ ...projects, "/api/entryanswerdata/": nonAnswers, "plan_date__gte=2026-10-01&project=7": nonForms })(input, init);
    }) as typeof fetch;
    expect(await runSytexSync("user-id", config, flaky, new Date("2026-10-05T15:00:00Z"), [0, 0])).toMatchObject({ projects: 1, items: 1 });
    const down = (async (input: string | URL | Request, init?: RequestInit) => String(input).includes("/api/entryanswerdata/") ? new Response("", { status: 504 }) : sytex({ ...projects, "plan_date__gte=2026-10-01&project=7": nonForms })(input, init)) as typeof fetch;
    await expect(runSytexSync("user-id", config, down, new Date("2026-10-05T15:00:00Z"), [0])).rejects.toThrow("SYTEX_RESPONSE_504");
  });
  it("asks only for the current month in a quick pass", async () => {
    const asked: string[] = [];
    const spy = (async (input: string | URL | Request, init?: RequestInit) => { asked.push(String(input)); return sytex({ ...projects, "/api/entryanswerdata/": nonAnswers, "plan_date__gte=2026-10-01&project=7": nonForms })(input, init); }) as typeof fetch;
    expect(await runSytexSync("user-id", config, spy, new Date("2026-10-05T15:00:00Z"), [0], () => undefined, true)).toMatchObject({ items: 1, since: "2026-08-01" });
    const exports = asked.filter((url) => url.includes("/api/formdata/") && !url.includes("2999"));
    expect(exports.length).toBeGreaterThan(0);
    expect(exports.every((url) => url.includes("plan_date__gte=2026-10-01") && !url.includes("plan_date__lte"))).toBe(true);
  });
  it("asks for the task list of every project (forms take their sub-zone and dates from it) and saves the corrective tasks", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const mccForms = [formHeaders, ["FO-26-000002", "Cerrar", "Correctivo Civil Integral", "NON - MCCIntegral Mantenimiento Correctivo Civil O&M", "ST00213", "Salta", null, null]];
    const taskHead = ["Code", "Task description", "Project", "Affected sites codes", "Affected sites names", "Task type", "Status"];
    const tasks = [taskHead, ["TA-26-412547", "Correctivo Civil Integral", "NON - MCCIntegral Mantenimiento Correctivo Civil O&M", "ST00213", "Salta", "Correctivo", "Open"]];
    const routes = { "/api/project/?q=MPC": { next: null, results: [{ id: 7, name: "NON - MPC" }, { id: 9, name: "NON - MCC" }] }, "/api/project/?q=MCC": { next: null, results: [] },
      "/api/formdata/?org_id=1&plan_date__gte=2026-10-01&project=7": nonForms, "/api/formdata/?org_id=1&plan_date__gte=2026-10-01&project=9": mccForms,
      "/api/entryanswerdata/": nonAnswers, "/api/taskdata/?org_id=1&plan_date__gte=2026-10-01&project=9": tasks };
    await runSytexSync("user-id", config, sytex(routes, calls), new Date("2026-10-05T15:00:00Z"), [0], () => undefined, true);
    expect(calls.filter((call) => call.url.includes("/api/taskdata/")).map((call) => call.url.split("?")[1])).toEqual(["org_id=1&plan_date__gte=2026-10-01&project=7", "org_id=1&plan_date__gte=2026-10-01&project=9"]);
    const [parsed] = mocks.save.mock.calls[0];
    expect(parsed.formContexts.find((form: { code: string }) => form.code === "TA-26-412547")).toMatchObject({ type: "CORRECTIVO", status: "Open", planDate: "2026-10-01" });
  });
  it("saves nothing while no form has materials", async () => {
    const result = await runSytexSync("user-id", config, sytex({ ...projects, "/api/entryanswerdata/": [answerHeaders], "project=7": nonForms }));
    expect(result).toMatchObject({ projects: 1, items: 0, changed: false });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
