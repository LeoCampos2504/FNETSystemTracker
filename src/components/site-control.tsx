"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SiteControl, SiteControlRow, SiteFuelLoad, SiteMaintenance, SiteServiceReport } from "@/contracts/operations";
import { Feedback, matchesZone, opCall, projectLabel, useCatalog, useZoneSelection, ZoneFilter } from "./operations-common";
import { useDateRange } from "./screen-filters";
import { fold, inDateRange, isoDay } from "@/lib/filters";
import s from "./operations.module.css";
import c from "./site-control.module.css";

type Tab = "summary" | "service" | "air" | "fuel";
const tabs: { key: Tab; label: string }[] = [
  { key: "summary", label: "Resumen por sitio" },
  { key: "service", label: "Service de grupos (anual)" },
  { key: "air", label: "Filtros de aire (cada 6 meses)" },
  { key: "fuel", label: "Combustible" },
];
type Due = "overdue" | "soon" | "ok" | "none";
const SOON_DAYS = 30;
const addDays = (day: string, days: number) => { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + days); return isoDay(d); };
/** Yearly jobs: overdue once the date passed, "soon" within the next 30 days. */
export function dueState(job: SiteMaintenance | null, today = isoDay(new Date())): Due {
  if (!job) return "none";
  if (job.dueDate <= today) return "overdue";
  return job.dueDate <= addDays(today, SOON_DAYS) ? "soon" : "ok";
}
const dueText: Record<Due, string> = { overdue: "Vencido", soon: "Vence pronto", ok: "Al día", none: "Sin informar" };
const hasData = (r: SiteControlRow) => !!(r.service || r.airFilters || r.lastService || r.lastFuel);
const dueTone: Record<Due, string> = { overdue: c.bad, soon: c.warn, ok: c.good, none: c.none };
const date = (value: string | null | undefined) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const dateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || value.length <= 10) return date(value);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
};
const liters = (value: number | null | undefined) => value === null || value === undefined ? "—" : value.toLocaleString("es-AR", { maximumFractionDigits: 2 }) + " L";
const percent = (value: string | null) => { const n = value === null ? NaN : Number(value.replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };

function DueBadge({ job }: { job: SiteMaintenance | null }) {
  const state = dueState(job);
  return <span className={c.due + " " + dueTone[state]}>{dueText[state]}</span>;
}
function JobCell({ job }: { job: SiteMaintenance | null }) {
  return <div className={c.job}><DueBadge job={job} />{job && <small>Último {date(job.lastDate)} · vence {date(job.dueDate)}</small>}</div>;
}
function Level({ before, after }: { before: string | null; after: string | null }) {
  const a = percent(before), b = percent(after);
  if (before === null && after === null) return <span className={c.muted}>—</span>;
  return <div className={c.level}>
    <span>{before ?? "?"} → {after ?? "?"}</span>
    {a !== null && b !== null && <span className={c.levelBar} aria-hidden><i style={{ width: a + "%" }} /><b style={{ left: a + "%", width: Math.max(0, b - a) + "%" }} /></span>}
  </div>;
}
function FormLink({ code, link }: { code: string; link: string | null }) {
  return link ? <a href={link} target="_blank" rel="noopener noreferrer">{code} ↗</a> : <>{code}</>;
}

export function SiteControlView() {
  const zones = useCatalog(), chosen = useZoneSelection(), range = useDateRange();
  const [data, setData] = useState<SiteControl | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<Tab>("summary"), [query, setQuery] = useState(""), [picked, setPicked] = useState<string[]>([]), [only, setOnly] = useState<Due | "">(""), [open, setOpen] = useState(""), [withoutData, setWithoutData] = useState(false);
  useEffect(() => {
    let active = true;
    opCall<SiteControl>("/api/operations?kind=sites").then((d) => { if (active) { setData(d); setError(""); } }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const term = fold(query);
  const siteOk = (code: string, name: string, project: string) => matchesZone(project, chosen) && (!picked.length || picked.includes(code)) && (!term || fold(code + " " + name).includes(term));
  const zoneSites = useMemo(() => (data?.sites ?? []).filter((r) => siteOk(r.siteCode, r.siteName, r.project)), [data, chosen, picked, term]); // eslint-disable-line react-hooks/exhaustive-deps
  // Many sites have no generator or air conditioner, or no preventive in the synchronized months: they are hidden unless asked for.
  const empty = zoneSites.filter((r) => !hasData(r)).length;
  const sites = useMemo(() => withoutData || picked.length ? zoneSites : zoneSites.filter(hasData), [zoneSites, withoutData, picked]);
  const fuel = useMemo(() => (data?.fuel ?? []).filter((f) => siteOk(f.siteCode, f.siteName, f.project) && inDateRange(f.date, range)), [data, chosen, picked, term, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const services = useMemo(() => (data?.services ?? []).filter((r) => siteOk(r.siteCode, r.siteName, r.project) && inDateRange(r.date, range)), [data, chosen, picked, term, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const allSites = data?.sites ?? [];
  const count = (pick: (r: SiteControlRow) => SiteMaintenance | null, state: Due) => sites.filter((r) => dueState(pick(r)) === state).length;
  const totalLiters = fuel.reduce((sum, f) => sum + (f.liters ?? 0), 0);
  const detail = open ? allSites.find((r) => r.siteCode === open) ?? null : null;
  const addSite = (value: string) => { const code = value.split(" · ")[0].trim().toUpperCase(); if (allSites.some((r) => r.siteCode === code) && !picked.includes(code)) setPicked([...picked, code]); setQuery(""); };

  return <section className={s.app}>
    <header className={s.heading}><div><span className={s.kicker}>Service de grupos, filtros de aire y cargas de combustible</span><h1>Control de sitios</h1></div>
      <button onClick={() => { setLoading(true); setRevision((v) => v + 1); }} disabled={loading}>{loading ? "Actualizando…" : "Actualizar datos"}</button></header>
    <ZoneFilter state={zones} dates={{ label: "Fecha del reporte", hint: "Filtra las cargas de combustible y los services por el día en que se informaron en Sytex. Los vencimientos se calculan siempre a hoy." }} />
    <div className={c.siteFilter}>
      <label className={c.siteSearch}>Sitio
        <input list="site-control-sites" value={query} placeholder="Código o nombre del sitio" onChange={(e) => { const v = e.target.value; if (v.includes(" · ") && allSites.some((r) => v.startsWith(r.siteCode + " · "))) addSite(v); else setQuery(v); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const match = allSites.find((r) => fold(r.siteCode) === term) ?? (sites.length === 1 ? sites[0] : null); if (match) addSite(match.siteCode); } }} />
        <datalist id="site-control-sites">{allSites.slice(0, 2000).map((r) => <option key={r.siteCode} value={r.siteCode + " · " + r.siteName} />)}</datalist>
      </label>
      {picked.length > 0 && <div className={c.chips}>{picked.map((code) => <button key={code} type="button" onClick={() => setPicked(picked.filter((p) => p !== code))} aria-label={"Quitar " + code}>{code} <span aria-hidden>×</span></button>)}<button type="button" className={c.clear} onClick={() => setPicked([])}>Quitar sitios</button></div>}
    </div>
    <Feedback error={error || zones.error} />
    {loading && !data ? <p role="status">Consultando los sitios…</p> : <>
      <div className={s.stats}>
        <button type="button" aria-pressed={tab === "summary" && only === ""} onClick={() => { setTab("summary"); setOnly(""); }}>Sitios<strong>{sites.length}</strong><small>con service, filtros o combustible informados</small></button>
        <button type="button" aria-pressed={tab === "summary" && only === "overdue"} onClick={() => { setTab("summary"); setOnly(only === "overdue" ? "" : "overdue"); }}>Service vencido<strong>{count((r) => r.service, "overdue")}</strong><small>{count((r) => r.service, "soon")} vencen en {SOON_DAYS} días</small></button>
        <button type="button" aria-pressed={tab === "air"} onClick={() => setTab("air")}>Filtros de aire vencidos<strong>{count((r) => r.airFilters, "overdue")}</strong><small>{count((r) => r.airFilters, "soon")} vencen en {SOON_DAYS} días</small></button>
        <button type="button" aria-pressed={tab === "fuel"} onClick={() => setTab("fuel")}>Combustible cargado<strong>{liters(Math.round(totalLiters * 100) / 100)}</strong><small>{fuel.length} cargas en el período</small></button>
      </div>
      <div className={c.tabs} role="tablist">{tabs.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>
      {empty > 0 && <p className={s.note}>{withoutData || picked.length ? <>Se muestran también {empty} sitios sin datos en Sytex (sin grupo, sin aire o sin preventivo en los meses sincronizados). </> : <>Hay {empty} sitios más sin datos en Sytex: no tienen grupo o aire acondicionado, o no tuvieron preventivo en los meses sincronizados. </>}{!picked.length && <button type="button" className={c.inlineButton} onClick={() => setWithoutData(!withoutData)}>{withoutData ? "Ocultarlos" : "Mostrarlos"}</button>}</p>}
      {tab === "summary" && <Summary rows={sites.filter((r) => !only || dueState(r.service) === only)} onOpen={setOpen} />}
      {tab === "service" && <Services rows={services} sites={sites} onOpen={setOpen} />}
      {tab === "air" && <AirFilters rows={sites} onOpen={setOpen} />}
      {tab === "fuel" && <FuelLoads rows={fuel} onOpen={setOpen} />}
    </>}
    {detail && data && <SiteDetail site={detail} fuel={data.fuel.filter((f) => f.siteCode === detail.siteCode)} services={data.services.filter((r) => r.siteCode === detail.siteCode)} onClose={() => setOpen("")} />}
  </section>;
}

const byDue = (pick: (r: SiteControlRow) => SiteMaintenance | null) => (a: SiteControlRow, b: SiteControlRow) => {
  const order: Record<Due, number> = { overdue: 0, soon: 1, ok: 2, none: 3 };
  return order[dueState(pick(a))] - order[dueState(pick(b))] || (pick(a)?.dueDate ?? "").localeCompare(pick(b)?.dueDate ?? "") || a.siteCode.localeCompare(b.siteCode, "es", { numeric: true });
};
function SiteName({ row, onOpen }: { row: { siteCode: string; siteName: string }; onOpen: (code: string) => void }) {
  return <button type="button" className={c.siteLink} onClick={() => onOpen(row.siteCode)}><strong>{row.siteCode}</strong><small>{row.siteName || "Sin nombre"}</small></button>;
}
function Paged<T>({ rows, empty, head, render }: { rows: T[]; empty: string; head: string[]; render: (row: T) => ReactNode }) {
  const [page, setPage] = useState(1), pages = Math.max(1, Math.ceil(rows.length / 50)), current = Math.min(page, pages);
  return <>
    <div className={s.tableWrap}><table className={s.compact + " " + c.table}><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice((current - 1) * 50, current * 50).map(render)}</tbody></table></div>
    {!rows.length && <p className={s.note}>{empty}</p>}
    {rows.length > 50 && <div className={s.pager}><button disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button><span>{rows.length} registros · página {current} de {pages}</span><button disabled={current >= pages} onClick={() => setPage(current + 1)}>Siguiente</button></div>}
  </>;
}

function Summary({ rows, onOpen }: { rows: SiteControlRow[]; onOpen: (code: string) => void }) {
  const sorted = [...rows].sort(byDue((r) => r.service));
  return <Paged rows={sorted} empty="No hay sitios con este filtro." head={["Sitio", "Zona", "Service del grupo", "Filtros de aire", "Último service informado", "Última carga de combustible"]} render={(r) => <tr key={r.siteCode}>
    <td><SiteName row={r} onOpen={onOpen} /></td>
    <td className={s.nowrap}>{r.project ? projectLabel(r.project) : "Sin zona"}</td>
    <td><JobCell job={r.service} /></td>
    <td><JobCell job={r.airFilters} /></td>
    <td>{r.lastService ? <><strong>{date(r.lastService.date)}</strong><small>{[r.lastService.oilLiters !== null && "Aceite " + liters(r.lastService.oilLiters), r.lastService.filters.length ? r.lastService.filters.length + " filtro(s)" : ""].filter(Boolean).join(" · ") || "Ver detalle"}</small></> : <span className={c.muted}>—</span>}</td>
    <td>{r.lastFuel ? <><strong>{liters(r.lastFuel.liters)}</strong><small>{dateTime(r.lastFuel.date)}</small></> : <span className={c.muted}>—</span>}</td>
  </tr>} />;
}

function Services({ rows, sites, onOpen }: { rows: SiteServiceReport[]; sites: SiteControlRow[]; onOpen: (code: string) => void }) {
  const job = new Map(sites.map((r) => [r.siteCode, r.service]));
  return <Paged rows={rows} empty="No hay services informados en Sytex para este filtro. Probá con otro período o con «Todas las fechas»." head={["Sitio", "Fecha", "Próximo service", "Aceite", "Agua destilada", "Refrigerante", "Filtros cambiados", "Formulario"]} render={(r) => <tr key={r.formCode}>
    <td><SiteName row={r} onOpen={onOpen} /></td>
    <td className={s.nowrap}><strong>{date(r.date)}</strong><small>{r.serviceDone ? "Service anual realizado" : "Visita sin service"}</small></td>
    <td><JobCell job={job.get(r.siteCode) ?? null} /></td>
    <td className={c.num}><strong>{liters(r.oilLiters)}</strong><small>{r.oilChanged ? "Cambio de aceite" : "Sin cambio"}</small></td>
    <td className={c.num}><strong>{liters(r.waterLiters)}</strong></td>
    <td className={c.num}><strong>{liters(r.coolantLiters)}</strong><small>{r.coolantChanged ? "Cambio de refrigerante" : "Sin cambio"}</small></td>
    <td>{r.filters.length ? <ul className={c.list}>{r.filters.map((f) => <li key={f}>{f}</li>)}</ul> : <span className={c.muted}>Ninguno informado</span>}</td>
    <td className={s.nowrap}><FormLink code={r.formCode} link={r.link} /></td>
  </tr>} />;
}

function AirFilters({ rows, onOpen }: { rows: SiteControlRow[]; onOpen: (code: string) => void }) {
  const sorted = rows.filter((r) => r.airFilters).sort(byDue((r) => r.airFilters));
  return <Paged rows={sorted} empty="No hay cambios de filtros de aire informados para estos sitios." head={["Sitio", "Zona", "Estado", "Último cambio", "Próximo cambio", "Formulario"]} render={(r) => <tr key={r.siteCode}>
    <td><SiteName row={r} onOpen={onOpen} /></td>
    <td className={s.nowrap}>{r.project ? projectLabel(r.project) : "Sin zona"}</td>
    <td><DueBadge job={r.airFilters} /></td>
    <td className={s.nowrap}>{date(r.airFilters?.lastDate)}</td>
    <td className={s.nowrap}>{date(r.airFilters?.dueDate)}</td>
    <td className={s.nowrap}>{r.airFilters?.formCode ?? "—"}</td>
  </tr>} />;
}

function FuelLoads({ rows, onOpen }: { rows: SiteFuelLoad[]; onOpen: (code: string) => void }) {
  return <Paged rows={rows} empty="No hay cargas de combustible para este filtro." head={["Fecha", "Sitio", "Litros", "Nivel antes → después", "Combustible", "Horómetro", "Origen", "Formulario"]} render={(f) => <tr key={f.id}>
    <td className={s.nowrap}>{dateTime(f.date)}</td>
    <td><SiteName row={f} onOpen={onOpen} /></td>
    <td className={c.num}><strong>{liters(f.liters)}</strong></td>
    <td><Level before={f.levelBefore} after={f.levelAfter} /></td>
    <td>{f.fuel || <span className={c.muted}>No informado</span>}</td>
    <td className={c.num}>{f.hourmeter ? f.hourmeter + " h" : <span className={c.muted}>—</span>}</td>
    <td><span className={c.origin}>{f.origin.charAt(0) + f.origin.slice(1).toLowerCase()}</span></td>
    <td className={s.nowrap}><FormLink code={f.formCode} link={f.link} /></td>
  </tr>} />;
}

function SiteDetail({ site, fuel, services, onClose }: { site: SiteControlRow; fuel: SiteFuelLoad[]; services: SiteServiceReport[]; onClose: () => void }) {
  const last = services.find((r) => r.serviceDone) ?? services[0] ?? null, total = fuel.reduce((sum, f) => sum + (f.liters ?? 0), 0);
  return <div className={s.overlay} onClick={onClose}><section className={s.dialog + " " + c.detail} role="dialog" aria-modal="true" aria-label={"Sitio " + site.siteCode} onClick={(e) => e.stopPropagation()}>
    <div className={s.heading}><div><span className={s.kicker}>{site.project ? projectLabel(site.project) : "Sin zona"}</span><h2>{site.siteCode} · {site.siteName || "Sin nombre"}</h2></div><button onClick={onClose}>Cerrar</button></div>
    <div className={c.cards}>
      <div><span>Service del grupo</span><DueBadge job={site.service} /><small>{site.service ? "Último " + date(site.service.lastDate) + ", vence " + date(site.service.dueDate) : "Sin fecha informada en Sytex"}</small></div>
      <div><span>Filtros de aire</span><DueBadge job={site.airFilters} /><small>{site.airFilters ? "Último " + date(site.airFilters.lastDate) + ", vence " + date(site.airFilters.dueDate) : "Sin fecha informada en Sytex"}</small></div>
      <div><span>Combustible</span><strong>{liters(Math.round(total * 100) / 100)}</strong><small>{fuel.length} cargas registradas</small></div>
    </div>
    {last && <><h3 className={c.subhead}>Último service informado · {date(last.date)} · <FormLink code={last.formCode} link={last.link} /></h3>
      <div className={c.fluids}><div><span>Aceite</span><strong>{liters(last.oilLiters)}</strong><small>{last.oilChanged ? "Se cambió" : "No se cambió"}</small></div><div><span>Agua destilada</span><strong>{liters(last.waterLiters)}</strong></div><div><span>Líquido refrigerante</span><strong>{liters(last.coolantLiters)}</strong><small>{last.coolantChanged ? "Se cambió" : "No se cambió"}</small></div><div><span>Filtros cambiados</span><strong>{last.filters.length || "Ninguno"}</strong><small>{last.filters.join(", ")}</small></div></div>
      {last.supplies.length > 0 && <p className={s.note}>Insumos del formulario: {last.supplies.join(" · ")}</p>}
      <details className={c.answers}><summary>Ver todas las respuestas del formulario ({last.answers.length})</summary><dl>{last.answers.map((a, i) => <div key={i}><dt>{a.question}</dt><dd>{a.answer}</dd></div>)}</dl></details></>}
    <h3 className={c.subhead}>Cargas de combustible</h3>
    {fuel.length ? <ul className={c.timeline}>{fuel.slice(0, 12).map((f) => <li key={f.id}><span>{dateTime(f.date)}</span><strong>{liters(f.liters)}</strong><Level before={f.levelBefore} after={f.levelAfter} /><FormLink code={f.formCode} link={f.link} /></li>)}</ul> : <p className={s.note}>No hay cargas registradas para este sitio.</p>}
  </section></div>;
}
