"use client";

import { useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, UsersRound, ArrowRightLeft, Check, Clock3 } from 'lucide-react';
import type { GuardCrew } from '@/contracts/guard-crew';
import type { GuardOverview, GuardPeriod } from '@/contracts/operations';
import { addDays, dayKind, guardDays, newGuardWindow, normalizeName, validPeriod } from '@/lib/guard-domain';
import { monthDays, shiftMonth } from '@/lib/mendel-calendar';
import { formatOperationalDate, formatOperationalDateTime, operationalDateTimeToEpoch, operationalDateTimeToInput } from '@/lib/operational-timezone';
import { Feedback, opCall, operationToday, useOperation } from './operations-common';
import { useGuardClock } from './use-guard-clock';
import s from './guard-crews.module.css';

const fmt = formatOperationalDate;
export function GuardWeekPicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false), [month, setMonth] = useState(from.slice(0, 7));
  return <div className={s.weekPicker}>
    <button type="button" className={s.weekButton} aria-expanded={open} onClick={() => setOpen(!open)}><CalendarDays size={21}/><span><small>SEMANA / PERÍODO</small><strong>{fmt(from)} <span aria-hidden>→</span> {fmt(to)}</strong></span><span className={s.timeBadge}>08:00 · Argentina</span></button>
    {open && <div className={s.calendar}>
      <div className={s.calendarHead}><button type="button" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={18}/></button><strong>{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-15T12:00:00Z'))}</strong><button type="button" aria-label="Mes siguiente" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={18}/></button></div>
      <div className={s.calendarGrid}>{['L','M','X','J','V','S','D'].map((d,i) => <small key={i}>{d}</small>)}{monthDays(month).map((day,i) => day ? <button key={day} type="button" aria-label={'Comenzar semana el ' + day} aria-pressed={day === from} className={[day >= from && day < to ? s.inRange : '', day === from ? s.rangeStart : '', day === to ? s.handover : ''].join(' ')} onClick={() => onChange(day, addDays(day, 7))}>{Number(day.slice(8))}</button> : <span key={'blank' + i}/>)}</div>
      <small>Elegí el inicio: se propone una semana. Podés escribir otras fechas abajo.</small>
    </div>}
    <div className={s.dateFields}><label>Inicio · 08:00<input type="date" required value={from} onChange={e => { if (e.target.value) onChange(e.target.value, addDays(e.target.value, 7)); }}/></label><label>Relevo · 08:00<input type="date" required min={addDays(from, 1)} value={to} onChange={e => { if (e.target.value) onChange(from, e.target.value); }}/></label></div>
    <button type="button" className={s.textButton} onClick={() => onChange(from, addDays(from, 7))}>Usar 7 días</button>
  </div>;
}

function ReplaceForm({ crew, technicians, onSaved, onClose }: { crew: GuardCrew; technicians: string[]; onSaved: () => void; onClose: () => void }) {
  const op = useOperation(), last = crew.segments.at(-1)!;
  const [outgoing, setOutgoing] = useState(last.technicians[0]), [incoming, setIncoming] = useState(''), [effectiveAt, setEffectiveAt] = useState(() => {
    const tomorrow = newGuardWindow(addDays(operationToday(), 1)).startAt;
    return operationalDateTimeToEpoch(tomorrow) > operationalDateTimeToEpoch(last.startAt) && operationalDateTimeToEpoch(tomorrow) < operationalDateTimeToEpoch(last.endAt) ? tomorrow : operationalDateTimeToInput(last.startAt);
  }), [reason, setReason] = useState(''), [requestKey] = useState(() => crypto.randomUUID());
  const submit = (e: FormEvent) => { e.preventDefault(); void op.run(async () => { await opCall('/api/operations/guard', { action: 'replaceCrew', requestKey, id: crew.id, version: crew.version, outgoing, incoming, effectiveAt, reason }); onSaved(); onClose(); }); };
  return <form onSubmit={submit} className={s.replaceForm}><h3><ArrowRightLeft size={17}/> Reemplazar un integrante</h3><p>No cambia el tramo anterior. El otro integrante continúa.</p><Feedback {...op}/><div className={s.twoColumns}><label>Sale<select value={outgoing} onChange={e => setOutgoing(e.target.value)}>{last.technicians.map(t => <option key={t}>{t}</option>)}</select></label><label>Entra<select required value={incoming} onChange={e => setIncoming(e.target.value)}><option value="">Seleccionar técnico…</option>{technicians.filter(t => !last.technicians.some(u => normalizeName(u) === normalizeName(t))).map(t => <option key={t}>{t}</option>)}</select></label><label>Desde · hora Argentina<input type="datetime-local" required value={effectiveAt} min={operationalDateTimeToInput(last.startAt)} max={operationalDateTimeToInput(last.endAt)} onChange={e => setEffectiveAt(e.target.value)}/></label><label>Motivo<input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej.: relevo por licencia"/></label></div><div className={s.actions}><button className={s.primary} disabled={op.busy}>Guardar reemplazo</button><button type="button" disabled={op.busy} onClick={onClose}>Cancelar</button></div></form>;
}

export function GuardCrewCard({ crew, technicians, editable, onSaved }: { crew: GuardCrew; technicians: string[]; editable: boolean; onSaved: () => void }) {
  const [replacing, setReplacing] = useState(false), now = useGuardClock();
  const current = crew.segments.find(t => now >= Date.parse(t.startAt) && now < Date.parse(t.endAt));
  const active = current ?? (now < Date.parse(crew.startAt) ? crew.segments[0] : crew.segments.at(-1)!);
  const status = crew.cancelled ? 'Cancelada' : now >= Date.parse(crew.endAt) ? 'Finalizada' : current ? 'En guardia' : 'Próxima';
  return <article className={s.crewCard}><div className={s.cardTop}><span className={s.zone}>{crew.zone}</span><span className={current ? s.current : s.status}>{status}</span></div><h3><UsersRound size={19}/>{active.technicians.join(' + ')}</h3><p className={s.period}><CalendarDays size={16}/>{formatOperationalDateTime(crew.startAt)} → {formatOperationalDateTime(crew.endAt)}</p><small>Hora Argentina · fin por relevo, no incluido.</small>
    <ol className={s.timeline}>{crew.segments.map((segment, i) => <li key={segment.startAt}><span className={s.dot}/><div><strong>{segment.technicians.join(' + ')}</strong><small>{formatOperationalDateTime(segment.startAt)} → {formatOperationalDateTime(segment.endAt)}</small>{i > 0 && <small>{crew.changes[i - 1]?.reason} · registrado {formatOperationalDateTime(crew.changes[i - 1].recordedAt)}</small>}</div></li>)}</ol>
    {editable && !crew.cancelled && !replacing && <button type="button" className={s.replaceButton} onClick={() => setReplacing(true)}><ArrowRightLeft size={16}/> Registrar reemplazo</button>}
    {replacing && <ReplaceForm crew={crew} technicians={technicians} onSaved={onSaved} onClose={() => setReplacing(false)}/>}
  </article>;
}

function LegacyDateEditor({ period, onSaved }: { period: GuardPeriod; onSaved: () => void }) {
  const op = useOperation(), [editing, setEditing] = useState(false), [from, setFrom] = useState(period.from), [to, setTo] = useState(period.to);
  return <><button type="button" className={s.textButton} onClick={() => setEditing(!editing)}>Corregir fechas</button>{editing && <form className={s.legacyEdit} onSubmit={e => { e.preventDefault(); void op.run(async () => { await opCall('/api/operations/guard', { action: 'updatePeriod', id: period.id, technician: period.technician, from, to }); setEditing(false); onSaved(); }); }}><Feedback {...op}/><label>Inicio 08:00<input type="date" required value={from} onChange={e => setFrom(e.target.value)}/></label><label>Relevo 08:00<input type="date" required value={to} onChange={e => setTo(e.target.value)}/></label><button disabled={op.busy || !validPeriod(from,to)}>Guardar fechas</button></form>}</>;
}

export function GuardCrewBoard({ data, onSaved }: { data: GuardOverview; onSaved: (month?:string) => void }) {
  const op = useOperation(), [zone, setZone] = useState(''), [a, setA] = useState(''), [b, setB] = useState('');
  const [from, setFrom] = useState(operationToday), [to, setTo] = useState(() => addDays(operationToday(), 7));
  const [selected, setSelected] = useState<string[]>([]), [filter, setFilter] = useState(''), [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const legacy = data.periods.filter(p => !p.crewId), valid = validPeriod(from,to);
  const weekends = valid ? guardDays(from,to).filter(day => dayKind(day,new Set()) !== 'HABIL').length : 0;
  const selectLegacy = (id: string, checked: boolean) => {
    const next = checked ? [...selected, id].slice(-2) : selected.filter(v => v !== id); setSelected(next);
    const rows = legacy.filter(p => next.includes(p.id));
    if (rows.length === 2 && rows[0].from === rows[1].from && rows[0].to === rows[1].to) { setA(rows[0].technician); setB(rows[1].technician); setFrom(rows[0].from); setTo(rows[0].to); }
  };
  const save = (e: FormEvent) => { e.preventDefault(); void op.run(async () => {
    await opCall('/api/operations/guard', { action: 'addCrew', requestKey, zone, technicians: [a,b], ...newGuardWindow(from), endAt: to + 'T08:00', legacyIds: selected });
    op.setSuccess('Cuadrilla guardada y compartida.'); setRequestKey(crypto.randomUUID()); setA(''); setB(''); setSelected([]); onSaved(from.slice(0,7));
  }); };
  const crews = (data.crews ?? []).filter(c => !filter || c.zone === filter);
  return <div className={s.board}>
    {data.crewStorageReady === false && <p className={s.warning} role="status">La carga por cuadrillas todavía necesita habilitar sus tablas internas. Los registros anteriores se conservan; no se guarda nada solo en esta PC.</p>}
    {data.canManageCrews && <section className={s.editor}><div className={s.sectionTitle}><div><span className={s.eyebrow}>ORGANIZAR EL RELEVO</span><h2>Nueva cuadrilla de guardia</h2></div><UsersRound size={24}/></div><Feedback {...op}/><form onSubmit={save}><div className={s.editorGrid}><div className={s.members}><label>Zona<select required value={zone} onChange={e => setZone(e.target.value)}><option value="">Elegir zona…</option>{data.zones?.map(z => <option key={z}>{z}</option>)}</select></label><label>Primer integrante<select required value={a} onChange={e => setA(e.target.value)}><option value="">Seleccionar técnico…</option>{data.technicians.map(t => <option key={t} disabled={normalizeName(t) === normalizeName(b)}>{t}</option>)}</select></label><label>Segundo integrante<select required value={b} onChange={e => setB(e.target.value)}><option value="">Seleccionar técnico…</option>{data.technicians.map(t => <option key={t} disabled={normalizeName(t) === normalizeName(a)}>{t}</option>)}</select></label><p className={s.hint}>Dos técnicos, una cuadrilla para esta guardia. Se pueden registrar reemplazos después.</p></div><GuardWeekPicker from={from} to={to} onChange={(f,t) => { setFrom(f); setTo(t); }}/></div>
      <div className={s.saveBar}><div><strong>{valid ? guardDays(from,to).length + ' días de guardia · ' + weekends + ' de fin de semana' : 'Revisá el período'}</strong><small><Clock3 size={13}/> Del {fmt(from)} a las 08:00 al relevo del {fmt(to)} a las 08:00. Los feriados se incluyen en el resumen mensual.</small>{selected.length > 0 && <small>Vincula {selected.length} cargas históricas seleccionadas, sin borrarlas ni duplicar sus días.</small>}</div><button className={s.primary} disabled={op.busy || !valid || !data.crewStorageReady || selected.length === 1}><Check size={17}/>{op.busy ? 'Guardando…' : 'Guardar cuadrilla'}</button></div>
    </form></section>}
    {!data.canManageCrews && !data.ctic && <p className={s.hint}>La carga requiere Admin o zonas explícitamente habilitadas para tu cuenta.</p>}
    <section><div className={s.sectionTitle}><h2>Cuadrillas del período</h2><label className={s.filter}>Zona<select aria-label="Filtrar cuadrillas por zona" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todas mis zonas</option>{[...new Set([...(data.zones ?? []),...(data.crews ?? []).map(c => c.zone)])].sort().map(z => <option key={z}>{z}</option>)}</select></label></div>{!crews.length && <p className={s.empty}>No hay cuadrillas registradas en este período.</p>}<div className={s.crewGrid}>{crews.map(c => <GuardCrewCard key={c.id + ':' + c.version} crew={c} technicians={data.technicians} editable={!!data.canManageCrews && !!data.crewStorageReady} onSaved={onSaved}/>)}</div></section>
    {!!legacy.length && <details className={s.legacy}><summary>Cargas anteriores sin pareja / zona confirmada · {legacy.length}</summary><p>Conteo corregido: la fecha final es el relevo a las 08:00. No se inventan cuadrillas. Admin puede seleccionar dos cargas del mismo período, elegir la zona arriba y guardarlas juntas.</p>{legacy.map(p => <div key={p.id} className={s.legacyRow}><label>{data.canManageLegacy && <input type="checkbox" checked={selected.includes(p.id)} onChange={e => selectLegacy(p.id,e.target.checked)}/>}<span><strong>{p.technician}</strong><small>{fmt(p.from)} → {fmt(p.to)} · {guardDays(p.from,p.to).length} días{p.from === p.to ? ' · revisar fechas: duración cero' : ''}</small></span></label>{data.canManageLegacy && <LegacyDateEditor period={p} onSaved={onSaved}/>}</div>)}</details>}
  </div>;
}
