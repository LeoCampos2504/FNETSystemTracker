import { createHash } from "node:crypto";
import { readSheet } from "read-excel-file/node";
import { getPrismaClient } from "@/server/prisma";
import { parseSytexExportSheets } from "@/server/sytex-supply-export";
import { saveSytexSupplyExport } from "@/server/services/sytex-supply-imports";

/**
 * Direct Sytex synchronization, without n8n or manual files.
 * It downloads the same two exports a person takes from "Reports › Forms"
 * (form list and answers as rows) for every maintenance project, and stores
 * them through the import pipeline, so the control screens read one model.
 */
export const SYNC_SOURCE_NAME = "Sincronización directa Sytex";
const PROJECT_SEARCHES = ["MPC", "MCC"];
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 180_000;

export type SytexSyncStatus = {
  configured: boolean; running: boolean;
  startedAt: string | null; finishedAt: string | null;
  result: { projects: number; forms: number; items: number; changed: boolean; since: string } | null;
  error: string | null; errorDetail: string | null;
};
type Config = { baseUrl: string; authorization: string; organization: string };
/** What the service variables provide: an explicit header, or the user and key Sytex issues in the profile. */
type Settings = { baseUrl: string; organization: string; candidates: string[] };
type Fetcher = typeof fetch;

const state: Omit<SytexSyncStatus, "configured"> = { running: false, startedAt: null, finishedAt: null, result: null, error: null, errorDetail: null };

export function sytexSettings(env: Record<string, string | undefined> = process.env): Settings | null {
  const explicit = env.SYTEX_AUTHORIZATION?.trim(), user = env.SYTEX_USER?.trim(), key = env.SYTEX_API_KEY?.trim();
  // Sytex accepts the profile key as a Basic password or as a Token depending on the account; the first accepted form is kept.
  const candidates = explicit ? [explicit] : key ? [...(user ? ["Basic " + Buffer.from(user + ":" + key, "utf8").toString("base64")] : []), "Token " + key] : [];
  if (!candidates.length) return null;
  let baseUrl: URL;
  try { baseUrl = new URL(env.SYTEX_BASE_URL?.trim() || "https://claro.sytex.io"); } catch { return null; }
  if (baseUrl.protocol !== "https:") return null;
  return { baseUrl: baseUrl.origin, organization: env.SYTEX_ORGANIZATION_ID?.trim() || "1", candidates };
}

let accepted: { key: string; authorization: string } | null = null;
/** Finds which form of the credential Sytex accepts, with one small read, and remembers it until the variables change. */
export async function sytexConfig(settings: Settings, fetcher: Fetcher = fetch): Promise<Config> {
  const key = JSON.stringify(settings);
  if (accepted?.key === key) return { baseUrl: settings.baseUrl, organization: settings.organization, authorization: accepted.authorization };
  const refusals: string[] = [];
  for (const authorization of settings.candidates) {
    const config = { baseUrl: settings.baseUrl, organization: settings.organization, authorization };
    try { await request(config, fetcher, "/api/project/?q=MPC&limit=1", "application/json"); }
    catch (error) { if (error instanceof SytexError && error.code === "SYTEX_CREDENTIAL_REJECTED") { refusals.push(`${authorization.split(" ")[0]}: ${error.detail}`); continue; } throw error; }
    accepted = { key, authorization };
    return config;
  }
  throw new SytexError("SYTEX_CREDENTIAL_REJECTED", refusals.join(" · "));
}

export function sytexSyncStatus(): SytexSyncStatus { return { configured: sytexSettings() !== null, ...state }; }

/** First day of the previous month in Argentina: covers the month being closed and the current one. */
export function syncWindowStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value), month = Number(parts.find((part) => part.type === "month")?.value);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

class SytexError extends Error { constructor(public code: string, public detail = "") { super(code); } }

async function request(config: Config, fetcher: Fetcher, path: string, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(config.baseUrl + path, {
      headers: { Authorization: config.authorization, Organization: config.organization, Accept: accept, "Accept-Language": "es" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "error", cache: "no-store",
    });
  } catch { throw new SytexError("SYTEX_UNREACHABLE"); }
  if (response.status === 401 || response.status === 403) {
    // Sytex explains the refusal in a short "detail" text; it never contains the credential.
    const detail = await response.json().then((body: { detail?: unknown }) => typeof body?.detail === "string" ? body.detail.slice(0, 120) : "").catch(() => "");
    throw new SytexError("SYTEX_CREDENTIAL_REJECTED", `${response.status}${detail ? " " + detail : ""}`);
  }
  if (!response.ok) throw new SytexError("SYTEX_RESPONSE_" + response.status);
  return response;
}

async function listProjects(config: Config, fetcher: Fetcher): Promise<{ id: number; name: string }[]> {
  const found = new Map<number, string>();
  for (const search of PROJECT_SEARCHES) {
    let path: string | null = `/api/project/?q=${search}&limit=200`;
    for (let page = 0; path && page < 20; page++) {
      const body = await (await request(config, fetcher, path, "application/json")).json() as { next?: string | null; results?: { id?: unknown; name?: unknown }[] };
      for (const project of body.results ?? []) if (typeof project.id === "number" && typeof project.name === "string") found.set(project.id, project.name);
      // Follow pagination only inside the configured host.
      const next: URL | null = body.next ? new URL(body.next, config.baseUrl) : null;
      path = next && next.origin === config.baseUrl ? next.pathname + next.search : null;
    }
  }
  return [...found].map(([id, name]) => ({ id, name }));
}

async function sheet(config: Config, fetcher: Fetcher, kind: "formdata" | "entryanswerdata", projectId: number, since: string): Promise<unknown[][]> {
  const response = await request(config, fetcher, `/api/${kind}/?org_id=${encodeURIComponent(config.organization)}&plan_date__gte=${since}&project=${projectId}`, "*/*");
  return readSheet(Buffer.from(await response.arrayBuffer()), { trim: false });
}

async function inBatches<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += CONCURRENCY) results.push(...await Promise.all(items.slice(start, start + CONCURRENCY).map(work)));
  return results;
}

const hasRows = (rows: unknown[][]) => rows.slice(1).some((row) => row.some((cell) => cell !== null && cell !== ""));

export async function runSytexSync(userId: string, config: Config, fetcher: Fetcher = fetch, now = new Date()) {
  const since = syncWindowStart(now);
  const projects = await listProjects(config, fetcher);
  const formLists = await inBatches(projects, async (project) => ({ project, rows: await sheet(config, fetcher, "formdata", project.id, since) }));
  const active = formLists.filter((entry) => hasRows(entry.rows));
  if (!active.length) return { projects: 0, forms: 0, items: 0, changed: false, since };
  const answers = (await inBatches(active, (entry) => sheet(config, fetcher, "entryanswerdata", entry.project.id, since))).filter(hasRows);
  if (!answers.length) return { projects: active.length, forms: 0, items: 0, changed: false, since };
  const parsed = parseSytexExportSheets([...answers, ...active.map((entry) => entry.rows)]);
  const forms = parsed.formContexts?.length ?? 0;
  if (parsed.errors.length) throw new SytexError("SYTEX_EXPORT_HAS_CONFLICTS");
  if (!parsed.items.length) return { projects: active.length, forms, items: 0, changed: false, since };
  // Identity of the content, not of the files: an unchanged Sytex produces no new rows.
  const identity = createHash("sha256").update(JSON.stringify([
    parsed.items.map((item) => [item.formulario, item.grupo, item.indice, item.description, item.quantity, item.provider, item.image, item.imageDeclared, item.siteCode, item.status]).sort(),
    (parsed.formContexts ?? []).map((form) => [form.code, form.type, form.project, form.siteCode, form.siteName, form.description, form.technicians, form.link ?? null]).sort(),
    (parsed.maintenance ?? []).map((fact) => [fact.siteCode, fact.kind, fact.formCode, fact.lastDate]).sort(),
  ])).digest("hex");
  const saved = await saveSytexSupplyExport(parsed, identity, SYNC_SOURCE_NAME, userId);
  if (!saved.alreadyImported) await dropSupersededRows(saved.importId);
  return { projects: active.length, forms, items: parsed.items.length, changed: !saved.alreadyImported, since };
}

/** Earlier synchronizations keep only what the newest one no longer covers (forms outside its date window). */
async function dropSupersededRows(importId: string) {
  const db = getPrismaClient();
  await db.$transaction([
    db.$executeRaw`DELETE FROM sytex_supply_import_items prior USING sytex_supply_imports batch, sytex_supply_import_items fresh
      WHERE prior.import_id = batch.id AND batch.file_name = ${SYNC_SOURCE_NAME} AND batch.id <> ${importId}::uuid
        AND fresh.import_id = ${importId}::uuid AND fresh.formulario = prior.formulario AND fresh.grupo = prior.grupo AND fresh.indice = prior.indice`,
    db.$executeRaw`DELETE FROM sytex_supply_form_contexts prior USING sytex_supply_imports batch, sytex_supply_form_contexts fresh
      WHERE prior.import_id = batch.id AND batch.file_name = ${SYNC_SOURCE_NAME} AND batch.id <> ${importId}::uuid
        AND fresh.import_id = ${importId}::uuid AND fresh.code = prior.code`,
    db.$executeRaw`DELETE FROM sytex_form_links prior USING sytex_supply_imports batch, sytex_form_links fresh
      WHERE prior.import_id = batch.id AND batch.file_name = ${SYNC_SOURCE_NAME} AND batch.id <> ${importId}::uuid
        AND fresh.import_id = ${importId}::uuid AND fresh.code = prior.code`,
    db.$executeRaw`DELETE FROM sytex_site_maintenance prior USING sytex_supply_imports batch, sytex_site_maintenance fresh
      WHERE prior.import_id = batch.id AND batch.file_name = ${SYNC_SOURCE_NAME} AND batch.id <> ${importId}::uuid
        AND fresh.import_id = ${importId}::uuid AND fresh.site_code = prior.site_code AND fresh.kind = prior.kind AND fresh.form_code = prior.form_code`,
  ]);
}

/** Starts one synchronization in the background; a second request while it runs only reports the status. */
export function startSytexSync(userId: string): SytexSyncStatus {
  const settings = sytexSettings();
  if (!settings || state.running) return sytexSyncStatus();
  state.running = true; state.startedAt = new Date().toISOString(); state.error = null; state.errorDetail = null;
  void sytexConfig(settings).then((config) => runSytexSync(userId, config))
    .then((result) => { state.result = result; })
    .catch((error: unknown) => { state.errorDetail = error instanceof SytexError && error.detail ? error.detail : null; state.error = error instanceof SytexError ? error.code : error instanceof Error && error.message.startsWith("SYTEX_") ? error.message : "SYTEX_SYNC_FAILED"; })
    .finally(() => { state.running = false; state.finishedAt = new Date().toISOString(); });
  return sytexSyncStatus();
}
