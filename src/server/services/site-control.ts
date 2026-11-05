import type { SiteControl, SiteControlRow, SiteFuelLoad, SiteServiceReport } from "@/contracts/operations";
import { allowedProject, projectKey, safeImage } from "@/server/operations-domain";
import { getPrismaClient } from "@/server/prisma";
import { catalog, yearlyMaintenance, type OperationsActor } from "./operations";
import { operationalDateTimeToUtc } from "@/lib/operational-timezone";
import { reconcileFuelLoads } from "@/lib/site-fuel-loads";
import { attachFuelReviews } from "./fuel-review";
import { isFormStartQuestion } from '@/lib/form-execution-date';

/** One stored Sytex answer of the site control (sytex_site_answers). */
export type StoredAnswer = { formCode: string; siteCode: string; siteName: string; topic: string; groupName: string; position: string; question: string; answer: string; reportedAt: string };

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Sytex exports decimal dots, including three decimal places. A comma is also accepted in handwritten answers. */
export function answerNumber(value: string | null | undefined): number | null {
  const match = (value ?? "").match(/-?\d+(?:[.,]\d+)*/);
  if (!match) return null;
  let text = match[0];
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}
const yes = (answer: string) => /^(si|yes|x|cambiad|reemplaz|realizad|ok)/.test(fold(answer));
const isLiters = (question: string) => { const q = fold(question); return /litro|\blts?\b|cantidad/.test(q) && !/nivel|filtro|porcentaje|%|capacidad|consumo|autonomia|comprad|solicitad|aceite|agua|refrigerante/.test(q); };
const day = (value: string | null | undefined) => value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
const sum = (values: (number | null)[]) => { const known = values.filter((v): v is number => v !== null); return known.length ? Math.round(known.reduce((a, b) => a + b, 0) * 100) / 100 : null; };
const repeat = (group: string) => group.match(/^\[#(\d+)\]/)?.[1] ?? "";

/**
 * Fuel loads reported in Sytex. In the generator preventive they are "CANTIDAD DE LITROS DE COMBUSTIBLE CARGADOS",
 * with before/after levels. Each positive loaded-quantity answer is an event, not a site/form total.
 * A report timestamp is explicitly marked as such; it must not pretend to be the physical load date.
 */
export function fuelLoadsFromAnswers(rows: StoredAnswer[]): Omit<SiteFuelLoad, "project" | "link" | "origin">[] {
  const executionDates = formExecutionDates(rows);
  const groups = new Map<string, StoredAnswer[]>();
  for (const row of rows) if (row.topic === "COMBUSTIBLE") { const key = JSON.stringify([row.formCode, row.siteCode, repeat(row.groupName)]); groups.set(key, [...(groups.get(key) ?? []), row]); }
  const hourmeters = new Map<string, StoredAnswer[]>(), amounts = new Map<string, number>();
  for (const row of rows) {
    const key=JSON.stringify([row.formCode,row.siteCode]);
    if (row.topic === "HOROMETRO") hourmeters.set(key,[...(hourmeters.get(key)??[]),row]);
    if (row.topic === "COMBUSTIBLE" && isLiters(row.question) && (answerNumber(row.answer)??0)>0) amounts.set(key,(amounts.get(key)??0)+1);
  }
  const loads: Omit<SiteFuelLoad, "project" | "link" | "origin">[] = [];
  for (const [key, answers] of groups) for (const amount of answers.filter((a) => isLiters(a.question))) {
    const quantities = answers.filter((a) => isLiters(a.question));
    // Repeated events keep their own metadata. Never attach another load's date or meter to this one.
    const context = quantities.length === 1 ? answers : answers.filter((a) => a.groupName === amount.groupName);
    const unambiguous = context.filter((a) => isLiters(a.question)).length === 1;
    const find = (test: (q: string) => boolean) => unambiguous ? context.find((a) => test(fold(a.question)))?.answer ?? null : null;
    const liters = answerNumber(amount.answer);
    if (!liters || liters <= 0) continue;
    const first = amount;
    const formSite=JSON.stringify([first.formCode,first.siteCode]);
    const meters=hourmeters.get(formSite)??[];
    const ownMeters=meters.filter(m=>m.groupName===first.groupName||(repeat(first.groupName)!==""&&repeat(m.groupName)===repeat(first.groupName)));
    const meter=ownMeters.length===1?ownMeters[0].answer:amounts.get(formSite)===1&&meters.length===1?meters[0].answer:null;
    const rawDate = find((q) => /fecha/.test(q) && /carga|combustible/.test(q));
    const loadDate = fuelDate(rawDate);
    const after = find((q) => /posterior|final|despues|salida/.test(q) && /nivel|porcentaje|%/.test(q));
    loads.push({
      id: "sytex:" + JSON.stringify([key, amount.groupName, amount.position]), formCode: first.formCode, siteCode: first.siteCode, siteName: first.siteName,
      date: loadDate ?? executionDates.get(formSite) ?? null, dateBasis: loadDate ? "LOAD" : executionDates.has(formSite) ? "FORM_START" : "UNVERIFIED", reportedAt: fuelDate(first.reportedAt), liters,
      fuel: find((q) => q.includes("tipo de combustible") || q.includes("combustible utilizado")),
      levelBefore: find((q) => (q.includes("nivel de combustible") || /inicial|antes|previo/.test(q) && /nivel|porcentaje/.test(q)) && !/posterior|final|despues/.test(q)),
      levelAfter: after,
      hourmeter: unambiguous ? meter : null,
      source: "Sytex",
    });
  }
  return loads;
}

/** A conflicting start answer is not resolved by picking the last edit or an approval. */
export function formExecutionDates(rows: StoredAnswer[]) {
  const dates = new Map<string, Set<string>>();
  for (const row of rows) if (row.topic === 'EJECUCION' && isFormStartQuestion(row.question)) {
    const date = fuelDate(row.answer);
    if (date) { const key = JSON.stringify([row.formCode, row.siteCode]); dates.set(key, new Set([...(dates.get(key) ?? []), date])); }
  }
  return new Map([...dates].filter(([, values]) => values.size === 1).map(([key, values]) => [key, [...values][0]]));
}

function fuelDate(value: string | null): string | null {
  if (!value) return null;
  const local = value.trim().replace(/^(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1").replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(local)) return null;
  const civil = local.slice(0, 10);
  try {
    if (new Date(civil + "T00:00:00Z").toISOString().slice(0, 10) !== civil) return null;
    return local.length === 10 ? local : operationalDateTimeToUtc(local);
  } catch { return null; }
}

/** Fluids bought for a form, from its insumo list (Insumo + Cantidad): oil, distilled water and coolant. */
export type FormSupply = { formCode: string; description: string; quantity: string | null; groupName?: string; position?: string };

/** Civil ECP declares consumption in its supply table, not in the tank-load questionnaire.
 * Keep every original line; neither machine identity nor tank readings can be inferred from it.
 */
export function ecpFuelFromSupplies(supplies: FormSupply[], tasks: { code: string; description: string; siteCode: string; siteName: string; project: string }[], answers: StoredAnswer[], links: Map<string, string | null>): SiteFuelLoad[] {
  const contexts = new Map(tasks.filter(t => /\becp\b/.test(fold(t.description))).map(t => [t.code, t]));
  const dates = formExecutionDates(answers);
  return supplies.flatMap(item => {
    const task = contexts.get(item.formCode), description = fold(item.description);
    // Nafta/2T may be lawnmower supplies. Parts, purchases and capacity are not consumed diesel.
    if (!task || !item.groupName || !item.position || !/insumo/.test(fold(item.groupName)) ||
      !/^(?:diesel|gasoil)\b/.test(description) || /filtro|aceite|bidon|envase|capacidad|comprad|solicitad/.test(description)) return [];
    const liters = answerNumber(item.quantity), siteCode = task.siteCode.trim().toUpperCase();
    if (!liters || liters <= 0 || !siteCode || siteCode.includes(",")) return [];
    const date = dates.get(JSON.stringify([item.formCode, siteCode])) ?? null;
    return [{ id: "sytex-supply:" + JSON.stringify([item.formCode, item.groupName, item.position]), formCode: item.formCode,
      siteCode, siteName: task.siteName, project: task.project, date, dateBasis: date ? "FORM_START" as const : "UNVERIFIED" as const,
      liters, fuel: item.description, levelBefore: null, levelAfter: null, hourmeter: null, origin: "ECP",
      evidence: "SUPPLY_DECLARATION" as const, source: "Sytex" as const, link: links.get(item.formCode) ?? null }];
  });
}
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
    const rows = await getPrismaClient().sytex_site_answers.findMany({ include: { import: { select: { importedAt: true } } } });
    return newestPerForm(rows.map((row) => ({ ...row, importedAt: row.import.importedAt })));
}

/** Insumos of every form, newest download per form, plus the n8n insumo table for forms not synchronized yet. */
async function formSupplies(): Promise<FormSupply[]> {
  const db = getPrismaClient();
  const [synced, legacy] = await Promise.all([
    db.sytex_supply_import_items.findMany({ select: { formulario: true, grupo: true, indice: true, description: true, quantity: true, import: { select: { importedAt: true } } } }),
    db.insumos.findMany({ select: { formulario: true, descripcion: true, cantidad: true } }).catch(() => []),
  ]);
  const fresh = newestPerForm(synced.map((r) => ({ formCode: r.formulario, groupName: r.grupo, position: r.indice, description: r.description ?? "", quantity: r.quantity?.toString() ?? null, importedAt: r.import.importedAt })));
  const seen = new Set(fresh.map((r) => r.formCode));
  return [...fresh, ...legacy.filter((r) => !seen.has(r.formulario)).map((r) => ({ formCode: r.formulario, description: r.descripcion ?? "", quantity: r.cantidad?.toString() ?? null }))];
}

async function n8nFuel() {
    return await getPrismaClient().cargas_combustible_ge.findMany({ orderBy: { fecha_evento: "desc" }, select: { id: true, formulario: true, codigo_sitio: true, nombre_sitio: true, origen: true, combustible: true, litros_cargados: true, nivel_antes: true, nivel_final: true, horometro: true, fecha_evento: true } });
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
  const executionDates = formExecutionDates(answers);
  const fromN8n: SiteFuelLoad[] = legacy.map((r) => {
    const siteCode = (r.codigo_sitio ?? "").trim().toUpperCase();
    const date = executionDates.get(JSON.stringify([r.formulario, siteCode])) ?? null;
    return { id: "n8n:" + r.id.toString(), formCode: r.formulario, siteCode, siteName: r.nombre_sitio ?? "", project: projectOf(r.formulario, siteCode), date, dateBasis: date ? 'FORM_START' as const : 'UNVERIFIED' as const, reportedAt: r.fecha_evento?.toISOString() ?? null, liters: r.litros_cargados === null ? null : Number(r.litros_cargados), fuel: r.combustible, levelBefore: r.nivel_antes?.toString() ?? null, levelAfter: r.nivel_final?.toString() ?? null, hourmeter: r.horometro?.toString() ?? null, origin: r.origen, source: "n8n" as const, link: link.get(r.formulario) ?? null };
  });
  const declared = ecpFuelFromSupplies(supplies, c.tasks, answers, link);
  const fuel = await attachFuelReviews(reconcileFuelLoads([...fromSytex, ...fromN8n, ...declared].filter((load) => visible(load.project))));

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
