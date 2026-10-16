"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { monthDays, orderedRange, shiftMonth } from "@/lib/mendel-calendar";
import { trayDate, trayDateKey } from "@/lib/mendel-bandeja";
import styles from "./mendel-date-range.module.css";

export function MendelDateRange({ from, to, onChange }: { from: string; to: string; onChange: (range: { from: string; to: string }) => void }) {
  const today = trayDateKey(new Date().toISOString());
  const [open, setOpen] = useState(false), [month, setMonth] = useState(today.slice(0, 7)), [start, setStart] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close(); }, [open]);
  function apply(a: string, b = a) { onChange(orderedRange(a, b)); setStart(""); setOpen(false); }
  function pick(day: string) { if (!start) setStart(day); else apply(start, day); }
  function quick(delta: number) { const m = shiftMonth(today.slice(0, 7), delta), days = monthDays(m).filter((v): v is string => !!v); apply(days[0], days.at(-1)!); }
  const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" });
  return <div className={styles.root}><span>Fecha del gasto</span><button type="button" className={styles.trigger} onClick={() => { setMonth((from || today).slice(0, 7)); setStart(""); setOpen(true); }}><CalendarDays size={17} />{from ? `${trayDate(from)} — ${trayDate(to || from)}` : "Elegir día o rango"}</button>
    <dialog ref={ref} className={styles.dialog} aria-label="Calendario de gastos" onCancel={() => setOpen(false)}>
      <header><strong>Fecha del gasto</strong><button type="button" onClick={() => setOpen(false)}>Cerrar</button></header>
      <div className={styles.shortcuts}><button type="button" onClick={() => apply(today)}>Hoy</button><button type="button" onClick={() => quick(0)}>Este mes</button><button type="button" onClick={() => quick(-1)}>Mes anterior</button><button type="button" onClick={() => { onChange({ from: "", to: "" }); setOpen(false); }}>Todas las fechas</button></div>
      <div className={styles.navigation}><button type="button" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18} /></button><label>Mes<select aria-label="Mes del calendario" value={month.slice(5)} onChange={e => setMonth(`${month.slice(0, 4)}-${e.target.value}`)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{monthName.format(new Date(Date.UTC(2026, i, 1)))}</option>)}</select></label><label>Año<input aria-label="Año del calendario" type="number" min={2000} max={2100} value={+month.slice(0, 4)} onChange={e => { const y = Number(e.target.value); if (y >= 2000 && y <= 2100) setMonth(`${y}-${month.slice(5)}`); }} /></label><button type="button" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18} /></button></div>
      <p aria-live="polite">{start ? `Desde ${trayDate(start)}. Elegí el último día, o el mismo para un solo día.` : "Elegí el primer y el último día del rango."}</p>
      <div className={styles.grid}>{["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map(d => <span key={d}>{d}</span>)}{monthDays(month).map((day, i) => day ? <button type="button" key={day} aria-label={trayDate(day)} aria-pressed={day === start || (!start && !!from && day >= from && day <= (to || from))} data-today={day === today} onClick={() => pick(day)}>{+day.slice(8)}</button> : <span key={`empty-${i}`} />)}</div>
      <div className={styles.manual}><label>Desde<input aria-label="Desde" type="date" max={to || undefined} value={from} onChange={e => onChange({ from: e.target.value, to: to && to < e.target.value ? e.target.value : to })} /></label><label>Hasta<input aria-label="Hasta" type="date" min={from || undefined} value={to} onChange={e => onChange({ from: from && from > e.target.value ? e.target.value : from, to: e.target.value })} /></label></div>
    </dialog></div>;
}
