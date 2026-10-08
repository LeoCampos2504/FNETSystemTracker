import type { SiteControl, SiteControlRow, SiteFuelLoad, SiteServiceReport } from "@/contracts/operations";
import { allowedProject, projectKey, safeImage } from "@/server/operations-domain";
import { getPrismaClient } from "@/server/prisma";
import { catalog, yearlyMaintenance, type OperationsActor } from "./operations";

/** One stored Sytex answer of the site control (sytex_site_answers). */
export type StoredAnswer = { formCode: string; siteCode: string; siteName: string; topic: string; groupName: string; position: string; question: string; answer: string; reportedAt: string };

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** First number of an answer: "40", "40 L", "1.709,4", "12,5 litros". Null when there is none. */
export function answerNumber(value: string | null | undefined): number | null {
  const match = (value ?? "").match(/-?\d+(?:[.,]\d+)*/);
  if (!match) return null;
  let text = match[0];
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
const yes = (answer: string) => /^(si|yes|x|cambiad|reemplaz|realizad|ok)/.test(fold(answer));
const isLiters = (question: string) => { const q = fold(question); return /litro|\blts?\b|cantidad/.test(q) && !/nivel|filtro|porcentaje|%/.test(q); };
const day = (value: string | null | undefined) => value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
const sum = (values: (number | null)[]) => { const known = values.filter((v): v is number => v !== null); return known.length ? Math.round(known.reduce((a, b) => a + b, 0) * 100) / 100 : null; };
const latestReport = (rows: StoredAnswer[]) => rows.map((row) => row.reportedAt).sort().at(-1) ?? "";
const repeat = (group: string) => group.match(/^\[#(\d+)\]/)?.[1] ?? "";

/**
 * Fuel loads reported in Sytex. In the generator preventive they are "CANTIDAD DE LITROS DE COMBUSTIBLE CARGADOS",
 * with "NIVEL DE COMBUSTIBLE [%]" before and "PORCENTAJE DE COMBUSTIBLE POSTERIOR A LA CARGA" after. One load per form
 * (and per repetition when the group repeats), only when it says how many liters were loaded.
 */
export function fuelLoadsFromAnswers(rows: StoredAnswer[]): Omit<SiteFuelLoad, "project" | "link" | "origin">[] {
  const groups = new Map<string, StoredAnswer[]>();
  for (const row of rows) if (row.topic === "COMBUSTIBLE") { const key = row.formCode + "#" + repeat(row.groupName); groups.set(key, [...(groups.get(key) ?? []), row]); }
  const hourmeter = new Map<string, string>();
  for (const row of rows) if (row.topic === "HOROMETRO" && !hourmeter.has(row.formCode)) hourmeter.set(row.formCode, row.answer);
  const loads: Omit<SiteFuelLoad, "project" | "link" | "origin">[] = [];
  for (const [key, answers] of groups) {
    const find = (test: (q: string) => boolean) => answers.find((a) => test(fold(a.question)))?.answer ?? null;
    const liters = sum(answers.filter((a) => isLiters(a.question)).map((a) => answerNumber(a.answer)));
    if (!liters || liters <= 0) continue;
    const first = answers[0];
    const after = find((q) => /posterior|final|despues|salida/.test(q) && /nivel|porcentaje|%/.test(q));
    loads.push({
      id: "sytex:" + key, formCode: first.formCode, siteCode: first.siteCode, siteName: first.siteName,
      date: latestReport(answers) || null, liters,
      fuel: find((q) => q.includes("tipo de combustible") || q.includes("combustible utilizado")),
      levelBefore: find((q) => (q.includes("nivel de combustible") || /inicial|antes|previo/.test(q) && /nivel|porcentaje/.test(q)) && !/posterior|final|despues/.test(q)),
      levelAfter: after,
      hourmeter: hourmeter.get(first.formCode) ?? null,
      source: "Sytex",
    });
  }
  return loads;
}

/** Fluids bought for a form, from its insumo list (Insumo + Cantidad): oil, distilled water and coolant. */
export type FormSupply = { formCode: string; description: string; quantity: string | null };
const fluidKind = (description: string) => { const d = fold(description); if (/filtro|gas/.test(d)) return null; if (d.includes("destilada")) return "water"; if (d.includes("refrigerante") || d.includes("anticongelante")) return "coolant"; if (d.includes("aceite")) return "oil"; return null; };

/** What each generator form reports about the yearly service: if it was done, what was changed and the fluids used. */
export function serviceReportsFromAnswers(rows: StoredAnswer[], supplies: FormSupply[] = []): Omit<SiteServiceReport, "project" | "link" | "date">[] {
  const forms = new Map<string, StoredAnswer[]>();
  for (const row of rows) if (row.topic === "SERVICE_GE" || row.topic === "FLUIDOS" || row.topic === "HOROMETRO") forms.set(row.formCode, [...(forms.get(row.formCode) ?? []), row]);
  const byForm = new Map<string, FormSupply[]>();
  for (const item of supplies) if (fluidKind(item.description)) byForm.set(item.formCode, [...(byForm.get(item.formCode) ?? []), item]);
  const reports: Omit<SiteServiceReport, "project" | "link" | "date">[] = [];
  for (const [formCode, answers] of forms) {
    if (!answers.some((a) => a.topic === "SERVICE_GE")) continue;
    const said = (start: RegExp) => answers.some((a) => start.test(fold(a.question).replace(/^[¿¡]+/, "")) && yes(a.answer));
    const filters = answers.filter((a) => /^cambio de filtro/.test(fold(a.question)) && yes(a.answer))
      .map((a) => a.question.replace(/^cambio de /i, "").replace(/^\w/, (c) => c.toUpperCase()).replace(/[?\s]+$/, ""));
    const fluids = byForm.get(formCode) ?? [];
    const total = (kind: string) => sum(fluids.filter((f) => fluidKind(f.description) === kind).map((f) => answerNumber(f.quantity)));
    reports.push({
      formCode, siteCode: answers[0].siteCode, siteName: answers[0].siteName,
      serviceDone: said(/^va a realizar service/), oilChanged: said(/^cambio de aceite/), coolantChanged: said(/^cambio de liquido refrigerante/),
      oilLiters: total("oil"), waterLiters: total("water"), coolantLiters: total("coolant"),
      supplies: fluids.map((f) => f.description + (f.quantity ? ": " + f.quantity : "")),
      filters: [...new Set(filters)], hourmeter: answers.find((a) => a.topic === "HOROMETRO")?.answer ?? null,
      answers: [...answers].sort((a, b) => a.position.localeCompare(b.position, "es", { numeric: true })).map((a) => ({ question: a.question, answer: a.answer })),
    });
  }
  return reports;
}

/** Only the newest import of each form counts: an older download of the same form is replaced, not added. */
function newestPerForm<T extends { formCode: string; importedAt: Date }>(rows: T[]) {
  const newest = new Map<string, number>();
  for (const row of rows) newest.set(row.formCode, Math.max(newest.get(row.formCode) ?? 0, row.importedAt.getTime()));
  return rows.filter((row) => row.importedAt.getTime() === newest.get(row.formCode));
}

async function storedAnswers() {
  try {
    const rows = await getPrismaClient().sytex_site_answers.findMany({ include: { import: { select: { importedAt: true } } } });
    return newestPerForm(rows.map((row) => ({ ...row, importedAt: row.import.importedAt })));
  } catch { return []; /* table created by db:prepare-app */ }
}

/** Insumos of every form, newest download per form, plus the n8n insumo table for forms not synchronized yet. */
async function formSupplies(): Promise<FormSupply[]> {
  const db = getPrismaClient();
  const [synced, legacy] = await Promise.all([
    db.sytex_supply_import_items.findMany({ select: { formulario: true, description: true, quantity: true, import: { select: { importedAt: true } } } }).catch(() => []),
    db.insumos.findMany({ select: { formulario: true, descripcion: true, cantidad: true } }).catch(() => []),
  ]);
  const fresh = newestPerForm(synced.map((r) => ({ formCode: r.formulario, description: r.description ?? "", quantity: r.quantity?.toString() ?? null, importedAt: r.import.importedAt })));
  const seen = new Set(fresh.map((r) => r.formCode));
  return [...fresh, ...legacy.filter((r) => !seen.has(r.formulario)).map((r) => ({ formCode: r.formulario, description: r.descripcion ?? "", quantity: r.cantidad?.toString() ?? null }))];
}

async function n8nFuel() {
  try {
    return await getPrismaClient().cargas_combustible_ge.findMany({ orderBy: { fecha_evento: "desc" }, select: { id: true, formulario: true, codigo_sitio: true, nombre_sitio: true, origen: true, combustible: true, litros_cargados: true, nivel_antes: true, nivel_final: true, horometro: true, fecha_evento: true } });
  } catch { return []; }
}

/** Every site the account can see with its yearly jobs, its last service report and its last fuel load. */
export async function siteControl(actor: OperationsActor): Promise<SiteControl> {
  const db = getPrismaClient();
  const [c, answers, legacy, facts, links, supplies] = await Promise.all([
    catalog(actor), storedAnswers(), n8nFuel(),
    db.sytex_site_maintenance.findMany({ select: { siteCode: true, kind: true, lastDate: true, formCode: true, reportedAt: true } }),
    db.sytex_form_links.findMany({ select: { code: true, link: true } }),
    formSupplies(),
  ]);
  const link = new Map(links.map((l) => [l.code, safeImage(l.link)]));
  const projectOfForm = new Map(c.tasks.map((t) => [t.code, t.project]));
  // A site belongs to the project it appears in most often.
  const votes = new Map<string, Map<string, number>>(), names = new Map<string, string>();
  for (const t of c.tasks) {
    const code = t.siteCode.trim().toUpperCase(); if (!code || code.includes(",")) continue;
    const v = votes.get(code) ?? new Map<string, number>(); v.set(t.project, (v.get(t.project) ?? 0) + 1); votes.set(code, v);
    if (t.siteName && !names.has(code)) names.set(code, t.siteName);
  }
  const projectOfSite = (code: string) => [...(votes.get(code)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const projectOf = (formCode: string, siteCode: string) => projectOfForm.get(formCode) ?? projectOfSite(siteCode);
  const visible = (project: string) => actor.allowed === null || (!!project && allowedProject(project, actor.allowed));

  const typeOfForm = new Map(c.tasks.map((t) => [t.code, t.type]));
  const fromSytex: SiteFuelLoad[] = fuelLoadsFromAnswers(answers).map((load) => ({ ...load, origin: typeOfForm.get(load.formCode) ?? "Sytex", project: projectOf(load.formCode, load.siteCode), link: link.get(load.formCode) ?? null }));
  const sytexForms = new Set(fromSytex.map((load) => load.formCode));
  const fromN8n: SiteFuelLoad[] = legacy.filter((r) => !sytexForms.has(r.formulario)).map((r) => {
    const siteCode = (r.codigo_sitio ?? "").trim().toUpperCase();
    return { id: "n8n:" + r.id.toString(), formCode: r.formulario, siteCode, siteName: r.nombre_sitio ?? "", project: projectOf(r.formulario, siteCode), date: r.fecha_evento?.toISOString() ?? null, liters: r.litros_cargados === null ? null : Number(r.litros_cargados), fuel: r.combustible, levelBefore: r.nivel_antes?.toString() ?? null, levelAfter: r.nivel_final?.toString() ?? null, hourmeter: r.horometro?.toString() ?? null, origin: r.origen, source: "n8n" as const, link: link.get(r.formulario) ?? null };
  });
  const fuel = [...fromSytex, ...fromN8n].filter((load) => visible(load.project)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const serviceDate = new Map(facts.filter((f) => f.kind === "SERVICE_GE").map((f) => [f.formCode, f.lastDate.toISOString().slice(0, 10)]));
  const reportedAt = new Map<string, string>();
  for (const a of answers) if (a.reportedAt > (reportedAt.get(a.formCode) ?? "")) reportedAt.set(a.formCode, a.reportedAt);
  const services: SiteServiceReport[] = serviceReportsFromAnswers(answers, supplies)
    .map((r) => ({ ...r, project: projectOf(r.formCode, r.siteCode), link: link.get(r.formCode) ?? null, date: (r.serviceDone ? day(reportedAt.get(r.formCode)) : serviceDate.get(r.formCode)) ?? day(reportedAt.get(r.formCode)) }))
    .filter((r) => visible(r.project)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const codes = new Set<string>([...votes.keys(), ...facts.map((f) => f.siteCode), ...fuel.map((f) => f.siteCode), ...services.map((s) => s.siteCode)].filter((code) => !!code && !code.includes(",")));
  const factsBySite = new Map<string, typeof facts>();
  for (const f of facts) factsBySite.set(f.siteCode, [...(factsBySite.get(f.siteCode) ?? []), f]);
  const sites: SiteControlRow[] = [];
  for (const code of codes) {
    const project = projectOfSite(code) || fuel.find((f) => f.siteCode === code)?.project || services.find((s) => s.siteCode === code)?.project || "";
    if (!visible(project)) continue;
    const yearly = yearlyMaintenance(factsBySite.get(code) ?? []);
    const lastService = services.find((s) => s.siteCode === code && s.serviceDone) ?? services.find((s) => s.siteCode === code) ?? null, lastFuel = fuel.find((f) => f.siteCode === code) ?? null;
    sites.push({
      siteCode: code, siteName: names.get(code) || lastService?.siteName || lastFuel?.siteName || "", project: projectKey(project),
      service: yearly.find((m) => m.kind === "SERVICE_GE") ?? null, airFilters: yearly.find((m) => m.kind === "FILTROS_AA") ?? null, lastService, lastFuel,
    });
  }
  sites.sort((a, b) => a.siteCode.localeCompare(b.siteCode, "es", { numeric: true }));
  return { sites, fuel, services };
}
