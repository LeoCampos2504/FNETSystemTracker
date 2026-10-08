import { createHash } from "node:crypto";
import { readSheet } from "read-excel-file/node";
import { getPrismaClient } from "@/server/prisma";
import { parseSytexExportSheets, parseSytexFormRows, parseSytexTaskRows } from "@/server/sytex-supply-export";
import { saveSytexSupplyExport } from "@/server/services/sytex-supply-imports";

/**
 * Direct Sytex synchronization, without n8n or manual files.
 * It downloads the same two exports a person takes from "Reports › Forms"
 * (form list and answers as rows) for every maintenance project, and stores
 * them through the import pipeline, so the control screens read one model.
 */
export const SYNC_SOURCE_NAME = "Sincronización directa Sytex";
const PROJECT_SEARCHES = ["MPC", "MCC"];
/**
 * The key Sytex issues for data sources (the one Excel uses) only opens the export addresses,
 * not the project list. These are the civil maintenance projects (MPC, MCC and MCCIntegral)
 * where FNET had forms on 2026-10-05; SYTEX_PROJECT_IDS replaces the list without a new release.
 */
const KNOWN_PROJECT_IDS = [2273, 2274, 2277, 2340, 2344, 2345, 2346, 2347, 2350, 8677, 8678, 1824, 1950, 1971, 1972, 1974, 1975, 1976, 1977, 1978, 1979, 1980, 1981, 1982, 1983, 1984, 2061, 2284, 8149, 8182, 8183, 8184, 8185, 8186, 8187, 8188, 8189, 8190, 8191, 8192, 8193, 8679, 8680];
export function configuredProjectIds(env: Record<string, string | undefined> = process.env): number[] {
  const custom = (env.SYTEX_PROJECT_IDS ?? "").split(/[\s,;]+/).map(Number).filter((id) => Number.isInteger(id) && id > 0);
  return custom.length ? [...new Set(custom)] : KNOWN_PROJECT_IDS;
}
const CONCURRENCY = 4;
const ANSWER_CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 240_000;

export type SytexSyncStatus = {
  configured: boolean; running: boolean;
  startedAt: string | null; finishedAt: string | null;
  result: { projects: number; forms: number; items: number; changed: boolean; since: string; skipped?: string[]; incomplete?: number } | null;
  error: string | null; errorDetail: string | null;
  progress: { done: number; total: number } | null;
};
type Config = { baseUrl: string; authorization: string; organization: string };
/** What the service variables provide: an explicit header, or the user and key Sytex issues in the profile. */
type Settings = { baseUrl: string; organization: string; candidates: string[] };
type Fetcher = typeof fetch;

/** When the closed months were last downloaded; routine passes skip it until then. */
const FULL_EVERY_MS = 12 * 60 * 60 * 1000;
let lastFullAt = 0;
const state: Omit<SytexSyncStatus, "configured"> = { running: false, startedAt: null, finishedAt: null, result: null, error: null, errorDetail: null, progress: null };

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
    // Checked against an export address with a date that matches nothing: that is what the data-source key opens.
    try { await request(config, fetcher, `/api/formdata/?org_id=${encodeURIComponent(settings.organization)}&plan_date__gte=2999-01-01&project=${configuredProjectIds()[0]}`, "*/*"); }
    catch (error) { if (error instanceof SytexError && error.code === "SYTEX_CREDENTIAL_REJECTED") { refusals.push(`${authorization.split(" ")[0]}: ${error.detail}`); continue; } throw error; }
    accepted = { key, authorization };
    return config;
  }
  throw new SytexError("SYTEX_CREDENTIAL_REJECTED", refusals.join(" · "));
}

export function sytexSyncStatus(): SytexSyncStatus { return { configured: sytexSettings() !== null, ...state }; }

/** Closed months the synchronization goes back to, besides the current one (2 in October → August and September). */
const CLOSED_MONTHS = 2;
/** First day of the oldest closed month in Argentina: covers the months being closed and the current one. */
export function syncWindowStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value), month = Number(parts.find((part) => part.type === "month")?.value);
  const oldest = new Date(Date.UTC(year, month - 1 - CLOSED_MONTHS, 1));
  return `${oldest.getUTCFullYear()}-${String(oldest.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Sytex exports one month at a time, like the spreadsheet did: each closed month, then the current one with no end. */
export function syncWindows(now = new Date()): string[] {
  const [year, month] = syncWindowStart(now).split("-").map(Number), windows: string[] = [];
  for (let step = 0; step < CLOSED_MONTHS; step++) {
    const first = new Date(Date.UTC(year, month - 1 + step, 1)), last = new Date(Date.UTC(year, month + step, 0)).getUTCDate();
    const prefix = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`;
    windows.push(`plan_date__gte=${prefix}-01&plan_date__lte=${prefix}-${String(last).padStart(2, "0")}`);
  }
  const current = new Date(Date.UTC(year, month - 1 + CLOSED_MONTHS, 1));
  windows.push(`plan_date__gte=${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-01`);
  return windows;
}

class SytexError extends Error { constructor(public code: string, public detail = "") { super(code); } }

async function request(config: Config, fetcher: Fetcher, path: string, accept: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(config.baseUrl + path, {
      headers: { Authorization: config.authorization, Organization: config.organization, Accept: accept, "Accept-Language": "es" },
      // Exports may be served from another address; fetch drops the Authorization header when the host changes.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: "follow", cache: "no-store",
    });
  } catch (error) {
    // Only the kind of failure and the address without its query are kept, never the credential.
    const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined)?.code ?? error.name : "desconocido";
    throw new SytexError("SYTEX_UNREACHABLE", `${path.split("?")[0]} ${String(cause).slice(0, 60)}`);
  }
  if (response.status === 401 || response.status === 403) {
    // Sytex explains the refusal in a short "detail" text; it never contains the credential.
    const detail = await response.json().then((body: { detail?: unknown }) => typeof body?.detail === "string" ? body.detail.slice(0, 120) : "").catch(() => "");
    throw new SytexError("SYTEX_CREDENTIAL_REJECTED", `${response.status}${detail ? " " + detail : ""}`);
  }
  if (!response.ok) throw new SytexError("SYTEX_RESPONSE_" + response.status, path.split("?")[0]);
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

const RETRY_WAITS_MS = [5_000, 20_000];
/** One export. A busy or timed-out Sytex (429 or 5xx) is asked again after a pause before giving up. */
async function sheet(config: Config, fetcher: Fetcher, kind: "formdata" | "entryanswerdata" | "taskdata", projectId: number, window: string, waits = RETRY_WAITS_MS): Promise<unknown[][]> {
  const path = `/api/${kind}/?org_id=${encodeURIComponent(config.organization)}&${window}&project=${projectId}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await request(config, fetcher, path, "*/*");
      return await readSheet(Buffer.from(await response.arrayBuffer()), { trim: false });
    } catch (error) {
      const retryable = error instanceof SytexError && (error.code === "SYTEX_UNREACHABLE" || /^SYTEX_RESPONSE_(429|5\d\d)$/.test(error.code));
      if (!retryable || attempt >= waits.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}

async function inBatches<T, R>(items: T[], work: (item: T) => Promise<R>, size = CONCURRENCY): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) results.push(...await Promise.all(items.slice(start, start + size).map(work)));
  return results;
}

const hasRows = (rows: unknown[][]) => rows.slice(1).some((row) => row.some((cell) => cell !== null && cell !== ""));
/** Only corrective projects need their task list: a preventive task is already represented by its forms. */
const projectColumn = (rows: unknown[][]) => rows[0]?.findIndex((cell) => /^(proyecto|project)$/i.test(String(cell ?? "").trim())) ?? -1;
const hasCorrectiveForms = (rows: unknown[][]) => { const column = projectColumn(rows); return column >= 0 && rows.slice(1).some((row) => /correctiv|\bmcc/i.test(String(row[column] ?? ""))); };

export async function runSytexSync(userId: string, config: Config, fetcher: Fetcher = fetch, now = new Date(), waits = RETRY_WAITS_MS, onProgress: (done: number, total: number) => void = () => undefined, quick = false) {
  const since = syncWindowStart(now);
  // A quick pass asks only for the current month; the closed month is saved by a full pass and stays untouched.
  const windows = quick ? syncWindows(now).slice(-1) : syncWindows(now);
  const projects = await listProjects(config, fetcher).catch((error: unknown) => {
    if (error instanceof SytexError && error.code === "SYTEX_CREDENTIAL_REJECTED") return configuredProjectIds().map((id) => ({ id, name: "" }));
    throw error;
  });
  const requests = projects.flatMap((project) => windows.map((window) => ({ project, window })));
  const formLists = await inBatches(requests, async (entry) => ({ ...entry, rows: await sheet(config, fetcher, "formdata", entry.project.id, entry.window, waits) }));
  const active = formLists.filter((entry) => hasRows(entry.rows)), activeProjects = new Set(active.map((entry) => entry.project.id)).size;
  if (!active.length) return { projects: 0, forms: 0, items: 0, changed: false, since };
  // Corrective tasks (TA-…) come from their own list; the corrective forms found above say which projects have them.
  const taskEntries = active.filter((entry) => hasCorrectiveForms(entry.rows));
  // Answer exports are the heavy ones: only a few at a time, and the screen is told how far they got.
  let done = 0;
  onProgress(0, taskEntries.length + active.length);
  const taskSheets = (await inBatches(taskEntries, async (entry) => { const rows = await sheet(config, fetcher, "taskdata", entry.project.id, entry.window, waits); onProgress(++done, taskEntries.length + active.length); return { entry, rows }; }, ANSWER_CONCURRENCY)).filter((task) => hasRows(task.rows));
  // A closed month that Sytex cannot serve right now is asked again later; the current month has to arrive.
  const incomplete: typeof active = [];
  const answers = (await inBatches(active, async (entry) => {
    try { return await sheet(config, fetcher, "entryanswerdata", entry.project.id, entry.window, waits); }
    catch (error) {
      const busy = error instanceof SytexError && (error.code === "SYTEX_UNREACHABLE" || /^SYTEX_RESPONSE_(429|5\d\d)$/.test(error.code));
      if (!busy || !entry.window.includes("plan_date__lte")) throw error;
      incomplete.push(entry); return [];
    } finally { onProgress(++done, taskEntries.length + active.length); }
  }, ANSWER_CONCURRENCY)).filter(hasRows);
  if (!answers.length) return { projects: activeProjects, forms: 0, items: 0, changed: false, since };
  const parsed = parseSytexExportSheets([...answers, ...active.map((entry) => entry.rows), ...taskSheets.map((task) => task.rows)]);
  // Without a plan date in the list, the month of the window it was asked in tells when the form is planned.
  const windowStart = new Map<string, string>();
  for (const entry of active) {
    const start = entry.window.match(/plan_date__gte=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (start) for (const form of parseSytexFormRows(entry.rows)) if (!windowStart.has(form.code)) windowStart.set(form.code, start);
  }
  for (const { entry, rows } of taskSheets) {
    const start = entry.window.match(/plan_date__gte=(\d{4}-\d{2}-\d{2})/)?.[1];
    if (start) for (const task of parseSytexTaskRows(rows)) if (!windowStart.has(task.code)) windowStart.set(task.code, start);
  }
  for (const form of parsed.formContexts ?? []) if (!form.planDate && windowStart.has(form.code)) form.planDate = windowStart.get(form.code);
  const forms = parsed.formContexts?.length ?? 0;
  // A form whose answers contradict each other must not stop everyone else: it keeps what was saved before and is reported.
  const contradictory = [...new Set(parsed.errors.map((issue) => issue.form))];
  if (contradictory.length && contradictory.some((code) => !code)) throw new SytexError("SYTEX_EXPORT_HAS_CONFLICTS");
  const skipped = contradictory.filter((code): code is string => !!code).sort();
  if (skipped.length) { parsed.items = parsed.items.filter((item) => !skipped.includes(item.formulario)); parsed.errors = []; }
  const skippedInfo = { ...(skipped.length ? { skipped } : {}), ...(incomplete.length ? { incomplete: incomplete.length } : {}) };
  if (!parsed.items.length) return { projects: activeProjects, forms, items: 0, changed: false, since, ...skippedInfo };
  // Identity of the content, not of the files: an unchanged Sytex produces no new rows.
  const identity = createHash("sha256").update(JSON.stringify([
    parsed.items.map((item) => [item.formulario, item.grupo, item.indice, item.description, item.quantity, item.provider, item.image, item.imageDeclared, item.siteCode, item.status]).sort(),
    (parsed.formContexts ?? []).map((form) => [form.code, form.type, form.project, form.siteCode, form.siteName, form.description, form.technicians, form.link ?? null, form.status ?? null, form.planDate ?? null]).sort(),
    (parsed.maintenance ?? []).map((fact) => [fact.siteCode, fact.kind, fact.formCode, fact.lastDate]).sort(),
  ])).digest("hex");
  const saved = await saveSytexSupplyExport(parsed, identity, SYNC_SOURCE_NAME, userId);
  if (!saved.alreadyImported) await dropSupersededRows(saved.importId);
  // Also when nothing else changed: an insumo the technicians deleted from a form must disappear here too.
  const notComplete = new Set([...skipped, ...incomplete.flatMap((entry) => parseSytexFormRows(entry.rows).map((form) => form.code))]);
  await dropRemovedItems(parsed.items, (parsed.formContexts ?? []).map((form) => form.code).filter((code) => !notComplete.has(code)));
  return { projects: activeProjects, forms, items: parsed.items.length, changed: !saved.alreadyImported, since, ...skippedInfo };
}

/**
 * Forms that Sytex just listed are complete in this pass, so an insumo saved earlier that the form no longer has
 * (a technician added it by mistake and removed it) is deleted. Forms outside the window or skipped stay untouched.
 */
async function dropRemovedItems(items: { formulario: string; grupo: string; indice: string }[], covered: string[]) {
  if (!covered.length) return;
  await getPrismaClient().$executeRaw`DELETE FROM sytex_supply_import_items prior USING sytex_supply_imports batch
    WHERE prior.import_id = batch.id AND batch.file_name = ${SYNC_SOURCE_NAME} AND prior.formulario = ANY(${covered}::text[])
      AND NOT EXISTS (SELECT 1 FROM unnest(${items.map((item) => item.formulario)}::text[], ${items.map((item) => item.grupo)}::text[], ${items.map((item) => item.indice)}::text[]) AS cur(formulario, grupo, indice)
        WHERE cur.formulario = prior.formulario AND cur.grupo = prior.grupo AND cur.indice = prior.indice)`;
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
    db.$executeRaw`DELETE FROM sytex_form_states prior USING sytex_supply_imports batch, sytex_form_states fresh
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
  state.running = true; state.startedAt = new Date().toISOString(); state.error = null; state.errorDetail = null; state.progress = null;
  const quick = Date.now() - lastFullAt < FULL_EVERY_MS, startedFull = Date.now();
  void sytexConfig(settings).then((config) => runSytexSync(userId, config, fetch, new Date(), RETRY_WAITS_MS, (done, total) => { state.progress = { done, total }; }, quick))
    .then((result) => {
      state.result = result;
      // With downloads left over, the full pass comes back in half an hour instead of waiting twelve.
      if (!quick) lastFullAt = "incomplete" in result ? startedFull - FULL_EVERY_MS + 30 * 60 * 1000 : startedFull;
    })
    .catch((error: unknown) => { state.errorDetail = error instanceof SytexError && error.detail ? error.detail : null; state.error = error instanceof SytexError ? error.code : error instanceof Error && error.message.startsWith("SYTEX_") ? error.message : "SYTEX_SYNC_FAILED"; })
    .finally(() => { state.progress = null; state.running = false; state.finishedAt = new Date().toISOString(); });
  return sytexSyncStatus();
}
