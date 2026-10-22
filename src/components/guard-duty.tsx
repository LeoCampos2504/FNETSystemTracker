"use client";
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { GuardOverview, OffHoursVisit } from '@/contracts/operations';
import { addDays, guardIsCurrent, guardStart, guardSummary, mondayOf, monthRange, weekdayName } from '@/lib/guard-domain';
import { formatOperationalDate, operationalDateTimeToEpoch } from '@/lib/operational-timezone';
import { GuardCrewBoard } from './guard-crew-board';
import { useGuardClock } from './use-guard-clock';
import { Feedback, opCall, operationToday, projectLabel, useOperation } from './operations-common';
import s from './operations.module.css';

const fmt = formatOperationalDate;
const long = (day: string) => weekdayName(day) + ' ' + fmt(day);
const statusText: Record<string, string> = { PLANIFICADO: 'Planificado', EN_CURSO: 'En curso', REALIZADO: 'Realizado', CON_PENDIENTES: 'Con pendientes', CANCELADO: 'Cancelado' };
function useOverview(from: string, to: string, revision: number) {
  const [data, setData] = useState<GuardOverview | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    opCall<GuardOverview>('/api/operations/guard?from=' + from + '&to=' + to).then(o => { if (active) { setData(o); setError(''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [from, to, revision]);
  return { data, error };
}
function OffHoursTable({ items, editable, onSaved }: { items: OffHoursVisit[]; editable: boolean; onSaved: () => void }) {
  const op = useOperation();
  const save = (id: string, value: string) => op.run(async () => {
    const hours = value.trim() === '' ? null : Number(value.replace(',', '.'));
    await opCall('/api/operations/guard', { action: 'setHours', visitId: id, hours }); onSaved(); op.setSuccess('Horas guardadas.');
  });
  if (!items.length) return <p className={s.note}>No hay tareas fuera de horario laboral en este período.</p>;
  return <><Feedback {...op}/><div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Fecha','Zona','Sitio','Tarea','Técnicos','Estado',...(editable ? ['Horas'] : ['Resultado'])].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{items.map(v => <tr key={v.id}>
    <td className={s.nowrap}>{fmt(v.day)}</td><td className={s.nowrap}>{projectLabel(v.project)}</td><td>{v.siteCode}<small>{v.siteName}</small></td><td>{v.taskCode || 'Imprevisto'}</td><td>{v.technicians.join(' / ')}</td><td>{statusText[v.status] ?? v.status}</td>
    <td>{editable ? <input aria-label={'Horas de ' + v.siteCode} style={{ width: 90 }} inputMode="decimal" defaultValue={v.hours ?? ''} placeholder="0,5" onBlur={e => { if (e.target.value !== String(v.hours ?? '')) void save(v.id, e.target.value); }}/> : v.outcome || '—'}</td>
  </tr>)}</tbody></table></div></>;
}
export function GuardDuty() {
  const op = useOperation(), [month, setMonth] = useState(() => operationToday().slice(0,7)), [revision, setRevision] = useState(0);
  const [holidayFrom, setHolidayFrom] = useState(''), [holidayTo, setHolidayTo] = useState(''), [holidayName, setHolidayName] = useState('');
  const { from, to } = monthRange(month), { data, error } = useOverview(from, to, revision), refresh = (createdMonth?:string) => { if (createdMonth) setMonth(createdMonth); setRevision(v => v + 1); };
  const summary = useMemo(() => data ? guardSummary(data.periods, data.holidays.map(h => h.day), data.offHours, month) : [], [data, month]);
  const addHoliday = (e: FormEvent) => { e.preventDefault(); void op.run(async () => {
    const r = await opCall<{ days: number }>('/api/operations/guard', { action: 'addHoliday', day: holidayFrom, ...(holidayTo && holidayTo !== holidayFrom ? { to: holidayTo } : {}), name: holidayName });
    setHolidayFrom(''); setHolidayTo(''); setHolidayName(''); refresh(); op.setSuccess(r.days > 1 ? r.days + ' feriados guardados.' : 'Feriado guardado.');
  }); };
  return <section className={s.app}>
    <header className={s.heading}><div><div className={s.kicker}>Cuadrillas · relevos · cobertura</div><h1>Guardias</h1><p className={s.note}>Una zona, dos técnicos y un período claro. Del 14 a las 08:00 al relevo del 21 a las 08:00 son 7 días, no 8.</p></div></header>
    <Feedback error={error}/><Feedback {...op}/>
    <div className={s.toolbar}><label>Mes a consultar<input type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value); }}/></label><a className={s.button} href={'/api/operations/export?kind=guard&month=' + month}>Descargar Excel del mes</a></div>
    {data ? <GuardCrewBoard data={data} onSaved={refresh}/> : !error && <p className={s.note}>Cargando guardias…</p>}
    <div className={s.card}><h2>Resumen por integrante · {month.split('-').reverse().join('/')}</h2>{!summary.length ? <p className={s.note}>Sin datos para este mes.</p> : <div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Técnico','Días de cobertura','Hábiles','No laborales','Tareas fuera de horario','Horas de tareas'].map(t => <th key={t}>{t}</th>)}</tr></thead><tbody>{summary.map(r => <tr key={r.technician}><td><strong>{r.technician}</strong></td>{[r.days,r.weekdays,r.nonWorking,r.tasks,r.hours].map((n,i) => <td key={i}>{n.toLocaleString('es-AR',{ maximumFractionDigits: 2 })}</td>)}</tr>)}</tbody></table></div>}<p className={s.note}>Cada día de cobertura va de 08:00 a 08:00. Sábados, domingos y feriados cuentan una sola vez. Los relevos parciales muestran tiempo efectivo, no dos días completos ni una liquidación de pago. Las cargas históricas ya usan este conteo.</p></div>
    <details className={s.card}><summary><strong>Feriados del mes</strong></summary><p className={s.note}>Los feriados siguen siendo fechas civiles incluidas. Podés cargar varios días seguidos; el nombre es opcional.</p><form onSubmit={addHoliday}><div className={s.fields}><label>Desde<input type="date" required value={holidayFrom} onChange={e => setHolidayFrom(e.target.value)}/></label><label>Hasta (opcional)<input type="date" min={holidayFrom} value={holidayTo} onChange={e => setHolidayTo(e.target.value)}/></label><label>Nombre<input maxLength={200} value={holidayName} onChange={e => setHolidayName(e.target.value)} placeholder="Nombre del feriado"/></label></div><button className={s.primary} disabled={op.busy}>Guardar feriado</button></form>{data?.holidays.map(h => <p key={h.day}>{long(h.day)} · {h.name} <button disabled={op.busy} onClick={() => { if (window.confirm('¿Quitar el feriado del ' + fmt(h.day) + '?')) void op.run(async () => { await opCall('/api/operations/guard', { action: 'removeHoliday', day: h.day }); refresh(); }); }}>Quitar</button></p>)}{data && !data.holidays.length && <p className={s.note}>No hay feriados cargados en este mes.</p>}</details>
    <div className={s.card}><h2>Actividad fuera de horario</h2><p className={s.note}>Visitas del cronograma marcadas como fuera de horario. Cada integrante recibe sus horas completas; no se dividen.</p>{data && <OffHoursTable items={data.offHours} editable onSaved={refresh}/>}</div>
  </section>;
}
/** Read-only CTIC uses the same half-open 08:00 boundary as reports and coordination. */
export function CticView({ onLogout }: { onLogout: () => void }) {
  const clock = useGuardClock(), today = operationToday(), from = addDays(mondayOf(today),-7), to = addDays(today,14), { data,error } = useOverview(from,to,Math.floor(clock / 60000));
  const now = new Date(clock);
  const current = data?.periods.filter(w => guardIsCurrent(w,now)) ?? [];
  const next = data?.periods.filter(w => operationalDateTimeToEpoch(w.startAt ?? guardStart(w.from)) > now.getTime()) ?? [];
  return <main className={s.shell}><div className={s.app}><header className={s.heading}><strong>FNET TRACKER · CTIC</strong><button onClick={async () => { const r = await fetch('/api/auth/logout',{ method:'POST' }); if (r.ok) onLogout(); }}>Cerrar sesión</button></header><Feedback error={error}/>
    {data && <GuardCrewBoard data={data} onSaved={() => undefined}/>}
    <div className={s.card}><h2>Integrantes de guardia ahora</h2>{data && !current.length && <p>No hay guardia cargada para este momento.</p>}{current.map(w => <p key={w.id}><strong>{w.technician}</strong> · {fmt(w.from)} → relevo {fmt(w.to)}</p>)}</div>
    <div className={s.card}><h2>Próximos relevos</h2>{data && !next.length && <p>No hay próximas guardias cargadas.</p>}{next.map(w => <p key={w.id}>{w.technician} · {fmt(w.from)} → {fmt(w.to)}</p>)}</div>
    <div className={s.card}><h2>Tareas fuera de horario laboral</h2><p className={s.note}>Fuera de lunes a viernes de 08:00 a 18:00, hora Argentina.</p>{data && <OffHoursTable items={data.offHours} editable={false} onSaved={() => undefined}/>}</div>
  </div></main>;
}
