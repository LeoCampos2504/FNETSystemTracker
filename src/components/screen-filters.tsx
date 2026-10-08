"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addMonths, fold, isoDay, MONTHS, mergeSubZones, monthName, monthRange, monthWeeks, placeKey, rangeLabel, weekRange, type DateRange, type ZoneSelection } from "@/lib/filters";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import f from "./screen-filters.module.css";

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  return { get: () => value, set: (next: T) => { value = next; listeners.forEach((listener) => listener()); }, subscribe };
}
// One choice for every screen: changing the zone or the dates in one screen changes them in all of them.
const zoneStore = store<ZoneSelection>({ places: [], type: "" });
const dateStore = store<DateRange>({ from: "", to: "" });
const subZoneStore = store<Record<string, string[]>>({});
export const setZoneSelection = zoneStore.set;
export const useZoneSelection = () => useSyncExternalStore(zoneStore.subscribe, zoneStore.get, zoneStore.get);
export const setDateRange = dateStore.set;
export const getDateRange = dateStore.get;
export const useDateRange = () => useSyncExternalStore(dateStore.subscribe, dateStore.get, dateStore.get);
export const useSubZones = () => useSyncExternalStore(subZoneStore.subscribe, subZoneStore.get, subZoneStore.get);
/** Screens report the sub-zones Sytex gave their records, so the zone list can offer them. */
export function useRegisterSubZones(pairs: { zone: string; subZone: string | null | undefined }[]) {
  useEffect(() => { const next = mergeSubZones(subZoneStore.get(), pairs); if (next) subZoneStore.set(next); }, [pairs]);
}

/** Closes a popover when clicking outside it or pressing Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open, close]);
  return ref;
}

const today = () => isoDay(new Date());
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Clickable calendar: one click picks a day, a second click closes a range; the month title switches to months. */
export function DateRangeFilter({ label = "Fecha", hint }: { label?: string; hint?: string }) {
  const range = useDateRange(), [open, setOpen] = useState(false), [mode, setMode] = useState<"days" | "months">("days");
  const [month, setMonth] = useState(() => (range.from || today()).slice(0, 7)), [start, setStart] = useState(""), [hover, setHover] = useState("");
  const close = useMemo(() => () => { setOpen(false); setStart(""); setMode("days"); }, []);
  const ref = useDismiss(open, close);
  const apply = (next: DateRange) => { setDateRange(next); close(); };
  const pick = (day: string) => {
    if (!start) { setStart(day); setDateRange({ from: day, to: day }); return; }
    const [from, to] = start <= day ? [start, day] : [day, start];
    apply({ from, to });
  };
  const shownFrom = start ? (hover && hover < start ? hover : start) : range.from, shownTo = start ? (hover && hover > start ? hover : start) : range.to;
  const year = Number(month.slice(0, 4)), now = today();
  return <div className={f.wrap} ref={ref}>
    <span className={f.label}>{label}</span>
    <button type="button" className={f.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setMonth((range.from || now).slice(0, 7)); setOpen(!open); }}>
      <CalendarDays size={16} className={f.icon} aria-hidden /><span className={f.triggerText}>{rangeLabel(range)}</span><ChevronDown size={16} className={f.caret} aria-hidden />
    </button>
    {open && <div className={f.popover} role="dialog" aria-label="Elegir fechas">
      <div className={f.calHead}>
        <button type="button" className={f.nav} aria-label={mode === "days" ? "Mes anterior" : "Año anterior"} onClick={() => setMonth(addMonths(month, mode === "days" ? -1 : -12))}><ChevronLeft size={18} aria-hidden /></button>
        <button type="button" className={f.title} onClick={() => setMode(mode === "days" ? "months" : "days")} title={mode === "days" ? "Elegir un mes entero" : "Volver a los días"}>{mode === "days" ? monthName(month) : String(year)}</button>
        <button type="button" className={f.nav} aria-label={mode === "days" ? "Mes siguiente" : "Año siguiente"} onClick={() => setMonth(addMonths(month, mode === "days" ? 1 : 12))}><ChevronRight size={18} aria-hidden /></button>
      </div>
      {mode === "days" ? <>
        <div className={f.grid} onMouseLeave={() => setHover("")}>
          {WEEKDAYS.map((d, i) => <span key={i} className={f.weekday}>{d}</span>)}
          {monthWeeks(month).flat().map((day, i) => day ? <button type="button" key={day} onClick={() => pick(day)} onMouseEnter={() => setHover(day)}
            className={[f.day, day === now ? f.today : "", shownFrom && shownTo && day >= shownFrom && day <= shownTo ? f.inRange : "", day === shownFrom || day === shownTo ? f.edge : ""].join(" ")}
            aria-pressed={!!shownFrom && day >= shownFrom && day <= (shownTo || shownFrom)}>{Number(day.slice(8))}</button> : <span key={"e" + i} />)}
        </div>
        <p className={f.help}>{start ? "Tocá otro día para cerrar el rango, o cerrá para quedarte con este día." : "Un clic elige un día; un segundo clic, un rango. Tocá el mes para elegirlo entero."}</p>
      </> : <div className={f.months}>
        {MONTHS.map((name, i) => { const m = year + "-" + String(i + 1).padStart(2, "0"), r = monthRange(m), active = range.from === r.from && range.to === r.to;
          return <button type="button" key={m} className={f.month + (active ? " " + f.edge : "")} onClick={() => apply(r)}>{name.slice(0, 3)}</button>; })}
      </div>}
      <div className={f.quick}>
        <button type="button" onClick={() => apply({ from: now, to: now })}>Hoy</button>
        <button type="button" onClick={() => apply(weekRange(now))}>Esta semana</button>
        <button type="button" onClick={() => apply(monthRange(now.slice(0, 7)))}>Este mes</button>
        <button type="button" onClick={() => apply(monthRange(addMonths(now.slice(0, 7), -1)))}>Mes anterior</button>
        <button type="button" className={f.clear} onClick={() => apply({ from: "", to: "" })}>Todas las fechas</button>
      </div>
      {hint && <p className={f.help}>{hint}</p>}
    </div>}
  </div>;
}

type ZoneOption = { zone: string; subs: string[] };
const subLabel = (zone: string, sub: string) => sub ? zone + " - " + sub : zone + " - Sin subzona";

/** Excel-style list: zones with their sub-zones as checkboxes, a search box, "Seleccionar todo" and Aplicar. */
export function ZonePlacesPicker({ zones }: { zones: string[] }) {
  const chosen = useZoneSelection(), known = useSubZones(), [open, setOpen] = useState(false), [query, setQuery] = useState(""), [draft, setDraft] = useState<Set<string>>(new Set());
  const options: ZoneOption[] = useMemo(() => zones.map((zone) => { const subs = known[zone] ?? []; return { zone, subs: subs.some(Boolean) ? subs : [] }; }), [zones, known]);
  const leaves = useMemo(() => options.flatMap((o) => o.subs.length ? o.subs.map((s) => placeKey(o.zone, s)) : [o.zone]), [options]);
  const close = useMemo(() => () => { setOpen(false); setQuery(""); }, []);
  const ref = useDismiss(open, close);
  // Ticked leaves for the stored selection: a whole zone ticks all its sub-zones; nothing stored means everything.
  const expand = (places: string[]) => new Set(places.length ? leaves.filter((leaf) => places.includes(leaf) || places.includes(leaf.split("|")[0])) : leaves);
  const begin = () => { setDraft(expand(chosen.places)); setOpen(true); };
  const term = fold(query), visible = options.map((o) => ({ ...o, subs: o.subs.filter((s) => !term || fold(subLabel(o.zone, s)).includes(term) || fold(o.zone).includes(term)) }))
    .filter((o) => !term || o.subs.length || fold(o.zone).includes(term));
  const visibleLeaves = visible.flatMap((o) => o.subs.length ? o.subs.map((s) => placeKey(o.zone, s)) : options.find((x) => x.zone === o.zone)?.subs.length ? [] : [o.zone]);
  const toggle = (keys: string[], on: boolean) => setDraft((current) => { const next = new Set(current); keys.forEach((key) => on ? next.add(key) : next.delete(key)); return next; });
  const allOn = visibleLeaves.length > 0 && visibleLeaves.every((leaf) => draft.has(leaf)), someOn = visibleLeaves.some((leaf) => draft.has(leaf));
  const apply = () => {
    // Store whole zones when all their sub-zones are ticked, and nothing at all when every zone is.
    const places = draft.size === leaves.length ? [] : options.flatMap((o) => {
      const keys = o.subs.length ? o.subs.map((s) => placeKey(o.zone, s)) : [o.zone], on = keys.filter((key) => draft.has(key));
      return on.length === keys.length ? [o.zone] : on;
    });
    setZoneSelection({ ...chosen, places }); close();
  };
  const summary = !chosen.places.length ? "Todas las zonas" : chosen.places.length === 1 ? (chosen.places[0].includes("|") ? subLabel(...(chosen.places[0].split("|") as [string, string])) : chosen.places[0]) : chosen.places.length + " seleccionadas";
  return <div className={f.wrap} ref={ref}>
    <span className={f.label}>Zona / subzona</span>
    <button type="button" className={f.trigger} aria-haspopup="dialog" aria-expanded={open} onClick={() => open ? close() : begin()}><MapPin size={16} className={f.icon} aria-hidden /><span className={f.triggerText}>{summary}</span><ChevronDown size={16} className={f.caret} aria-hidden /></button>
    {open && <div className={f.popover + " " + f.places} role="dialog" aria-label="Elegir zonas y subzonas">
      <input className={f.search} placeholder="Buscar zona o subzona" aria-label="Buscar zona o subzona" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <div className={f.list}>
        <Check label={term ? "Seleccionar todos los resultados" : "Seleccionar todo"} checked={allOn} mixed={!allOn && someOn} onChange={(on) => toggle(visibleLeaves, on)} strong />
        {visible.map((o) => {
          if (!options.find((x) => x.zone === o.zone)?.subs.length) return <Check key={o.zone} label={o.zone} checked={draft.has(o.zone)} onChange={(on) => toggle([o.zone], on)} />;
          const keys = o.subs.map((s) => placeKey(o.zone, s)), on = keys.filter((key) => draft.has(key)).length;
          return <div key={o.zone}>
            <Check label={o.zone} checked={on === keys.length && on > 0} mixed={on > 0 && on < keys.length} onChange={(value) => toggle(keys, value)} strong />
            <div className={f.children}>{o.subs.map((s) => <Check key={s} label={subLabel(o.zone, s)} checked={draft.has(placeKey(o.zone, s))} onChange={(value) => toggle([placeKey(o.zone, s)], value)} />)}</div>
          </div>;
        })}
        {!visible.length && <p className={f.help}>No hay zonas con esa búsqueda.</p>}
      </div>
      <p className={f.help}>Las subzonas salen de Sytex («Sub project»). Donde la pantalla no tiene subzona, se filtra por la zona.</p>
      <div className={f.actions}><button type="button" className={f.primary} disabled={!draft.size} onClick={apply}>Aplicar</button><button type="button" onClick={close}>Cancelar</button></div>
    </div>}
  </div>;
}

function Check({ label, checked, mixed = false, onChange, strong = false }: { label: string; checked: boolean; mixed?: boolean; onChange: (on: boolean) => void; strong?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <label className={f.check + (strong ? " " + f.strong : "")}><input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
