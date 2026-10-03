"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, History, Plus, ShieldCheck, Users, X, Zap } from "lucide-react";
import type { UserRole, UserScope } from "@/contracts";
import { mockLeaveRecords, mockSytexActivities, mockTechnicians, mockWorkdayRecords, mockZones } from "@/mocks";
import { DEMO_NOW } from "@/mocks";
import { getLeaveForDate, getWorkdayForDate } from "@/lib/bizflow-rules";
import { GuardSegmentTemporalStatus, getGuardAt, getGuardSegmentTemporalStatus } from "@/lib/guard-duty-rules";
import { getEligibleTechniciansForZone, mockGuardPlanningService, type GuardPlanningRecord } from "@/lib/guard-planning";
import { isOutsideHoursClassification, OperationalTimeClassification, classifyOperationalActivity } from "@/lib/operational-time";
import { filterForScope } from "@/lib/scope";
import { scopedResourceForZone } from "@/mocks/national";
import { DEFAULT_WORKING_HOURS, type HolidayCalendar } from "@/lib/working-hours";
import { DEFAULT_NEW_GUARD_END, DEFAULT_NEW_GUARD_START, formatOperationalDate, formatOperationalDateTime, operationalDateKey, operationalDateTimeToEpoch, operationalDateTimeToInput, operationalDateTimeToUtc } from "@/lib/operational-timezone";

const NO_HOLIDAYS: HolidayCalendar = { isHoliday: () => false };
const todayDate = operationalDateKey(DEMO_NOW);

function zoneName(zoneId: string): string { return mockZones.find((zone) => zone.id === zoneId)?.name ?? zoneId; }
function technicianName(id: string): string { return mockTechnicians.find((technician) => technician.id === id)?.name ?? id; }
function formatDateTime(value: string): string { return formatOperationalDateTime(value); }
function formatDate(value: string): string { return formatOperationalDate(value); }
function toDateTimeInput(value: string): string { return operationalDateTimeToInput(value); }
function toIso(value: string): string { return operationalDateTimeToUtc(value); }
function isInWeek(record: GuardPlanningRecord, start: string): boolean {
  const weekStartAt = operationalDateTimeToEpoch(`${start}T00:00:00`);
  const weekEndAt = weekStartAt + 7 * 86_400_000;
  return operationalDateTimeToEpoch(record.duty.startAt) < weekEndAt && operationalDateTimeToEpoch(record.duty.endAt) > weekStartAt;
}

function SourceBadges() {
  return <div className="source-badge-row"><span className="source-tag">BizFlow <small>demo · guardias/recursos</small></span><span className="source-tag">FNET <small>planificación demo</small></span><span className="source-tag">Sytex <small>demo · actividades</small></span></div>;
}

function SegmentRows({ record }: { record: GuardPlanningRecord }) {
  return <div className="guard-segment-list">{record.segments.map((segment) => { const status = getGuardSegmentTemporalStatus(segment, DEMO_NOW); const label = status === GuardSegmentTemporalStatus.PAST ? "Finalizado" : status === GuardSegmentTemporalStatus.CURRENT ? "Vigente" : "Próximo"; const tone = status === GuardSegmentTemporalStatus.PAST ? "neutral" : status === GuardSegmentTemporalStatus.CURRENT ? "success" : "warning"; return <div className="guard-segment-row" key={segment.id}><div><strong>{formatDateTime(segment.startAt)} → {formatDateTime(segment.endAt)}</strong><small>{segment.technicianIds.map(technicianName).join(" + ")}</small></div><span className={`status-badge ${tone}`}>{label}</span></div>; })}</div>;
}

function defaultEffectiveAt(record?: GuardPlanningRecord): string {
  if (!record) return "2026-08-24T08:00";
  const evaluationAt = operationalDateTimeToEpoch(DEMO_NOW);
  const applicable = getGuardAt(DEMO_NOW, record.segments) ?? record.segments[record.segments.length - 1];
  const startAt = operationalDateTimeToEpoch(applicable.startAt);
  const endAt = operationalDateTimeToEpoch(applicable.endAt);
  const candidate = Math.max(startAt + 60 * 60 * 1000, Math.min(evaluationAt, endAt - 60 * 60 * 1000));
  return operationalDateTimeToInput(new Date(candidate));
}

function GuardForm({ scope, record, onClose, onSaved }: { scope: UserScope; record?: GuardPlanningRecord; onClose: () => void; onSaved: () => void }) {
  const initialEffectiveAt = defaultEffectiveAt(record);
  const initialSegment = record ? getGuardAt(initialEffectiveAt, record.segments) ?? record.segments[record.segments.length - 1] : undefined;
  const [zoneId, setZoneId] = useState(record?.duty.zoneId ?? scope.zoneIds[0] ?? "");
  const [startAt, setStartAt] = useState(toDateTimeInput(record?.duty.startAt ?? DEFAULT_NEW_GUARD_START));
  const [endAt, setEndAt] = useState(toDateTimeInput(record?.duty.endAt ?? DEFAULT_NEW_GUARD_END));
  const [effectiveAt, setEffectiveAt] = useState(toDateTimeInput(initialEffectiveAt));
  const [primary, setPrimary] = useState(initialSegment?.technicianIds[0] ?? "");
  const [collaborator, setCollaborator] = useState(initialSegment?.technicianIds[1] ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const eligibleTechnicians = useMemo(() => getEligibleTechniciansForZone(scope, zoneId), [scope, zoneId]);
  const selectedPrimary = eligibleTechnicians.some((technician) => technician.id === primary) ? primary : eligibleTechnicians[0]?.id ?? "";
  const selectedCollaborator = eligibleTechnicians.some((technician) => technician.id === collaborator && technician.id !== selectedPrimary) ? collaborator : eligibleTechnicians.find((technician) => technician.id !== selectedPrimary)?.id ?? "";
  const changeEffectiveAt = (value: string) => {
    setEffectiveAt(value);
    if (record) {
      const effectiveSegment = getGuardAt(value, record.segments) ?? record.segments[record.segments.length - 1];
      setPrimary(effectiveSegment?.technicianIds[0] ?? "");
      setCollaborator(effectiveSegment?.technicianIds[1] ?? "");
    }
  };
  const changeZone = (value: string) => {
    setZoneId(value);
    const zoneTechnicians = getEligibleTechniciansForZone(scope, value);
    setPrimary(zoneTechnicians[0]?.id ?? "");
    setCollaborator(zoneTechnicians[1]?.id ?? "");
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (record) await mockGuardPlanningService.replace(scope, { guardDutyId: record.duty.id, effectiveAt: toIso(effectiveAt), technicianIds: [selectedPrimary, selectedCollaborator], actorUserId: scope.userId, reason: reason || null });
      else await mockGuardPlanningService.create(scope, { zoneId, startAt: toIso(startAt), endAt: toIso(endAt), technicianIds: [selectedPrimary, selectedCollaborator], note: reason || null });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar la planificación demo."); }
  };

  return <div className="guard-modal-backdrop" role="presentation"><form className="panel guard-modal" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">FNET planificación demo</p><h2>{record ? "Modificar tramo de guardia" : "Asignar guardia"}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div>{!record && <><label>Zona<select value={zoneId} onChange={(event) => changeZone(event.target.value)}>{scope.zoneIds.map((id) => <option key={id} value={id}>{zoneName(id)}</option>)}</select></label><div className="guard-form-grid"><label>Desde<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label><label>Hasta<input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label></div></>}{record && <label>Fecha/hora efectiva del cambio<input type="datetime-local" value={effectiveAt} onChange={(event) => changeEffectiveAt(event.target.value)} /></label>}<div className="guard-form-grid"><label>Técnico responsable<select value={selectedPrimary} onChange={(event) => setPrimary(event.target.value)}>{eligibleTechnicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}</select></label><label>Técnico colaborador<select value={selectedCollaborator} onChange={(event) => setCollaborator(event.target.value)}>{eligibleTechnicians.map((technician) => <option key={technician.id} value={technician.id} disabled={technician.id === selectedPrimary}>{technician.name}</option>)}</select></label></div><p className="assignment-demo-note">{eligibleTechnicians.length} técnico{eligibleTechnicians.length === 1 ? "" : "s"} elegible{eligibleTechnicians.length === 1 ? "" : "s"} para esta zona.</p><label>Observación / motivo<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Opcional" rows={2} /></label>{error && <p className="assignment-error">{error}</p>}<div className="assignment-editor-actions"><button type="submit" className="button primary small" disabled={eligibleTechnicians.length < 2}><CheckCircle2 size={14} /> Guardar demo</button><button type="button" className="button secondary small" onClick={onClose}>Cancelar</button></div><small className="assignment-demo-note">No escribe BizFlow ni PostgreSQL. La persistencia es local y demo.</small></form></div>;
}
export function TechnicianOperationsSummary({ scope }: { scope: UserScope }) {
  const [records, setRecords] = useState<GuardPlanningRecord[]>([]);
  useEffect(() => { void mockGuardPlanningService.listForScope(scope).then(setRecords); }, [scope]);
  const technicianId = scope.technicianId;
  if (!technicianId) return null;
  const segments = records.flatMap((record) => record.segments);
  const current = records.map((record) => ({ record, segment: getGuardAt(DEMO_NOW, record.segments) })).find((item) => item.segment?.technicianIds.includes(technicianId));
  const workday = getWorkdayForDate(mockWorkdayRecords, technicianId, todayDate);
  const leave = getLeaveForDate(mockLeaveRecords, technicianId, todayDate);
  const weekStart = operationalDateTimeToEpoch("2026-08-17T00:00:00");
  const weekEnd = operationalDateTimeToEpoch("2026-08-24T00:00:00");
  const weeklyActivities = mockSytexActivities.filter((activity) => activity.technicianId === technicianId && operationalDateTimeToEpoch(activity.activityAt) >= weekStart && operationalDateTimeToEpoch(activity.activityAt) < weekEnd).map((activity) => classifyOperationalActivity({ activityAt: activity.activityAt, technicianId, segments, calendar: NO_HOLIDAYS, schedule: DEFAULT_WORKING_HOURS, onLeave: Boolean(getLeaveForDate(mockLeaveRecords, technicianId, operationalDateKey(activity.activityAt))) }));
  const outsideHours = weeklyActivities.filter((activity) => isOutsideHoursClassification(activity.classification));
  const onGuard = outsideHours.filter((activity) => activity.classification === OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD).length;
  const offGuard = outsideHours.filter((activity) => activity.classification === OperationalTimeClassification.OUTSIDE_WORKING_HOURS_NOT_ON_GUARD).length;
  const leaveConflicts = outsideHours.filter((activity) => activity.classification === OperationalTimeClassification.ON_LEAVE_CONFLICT).length;
  const nextChange = current?.record.segments.find((segment) => operationalDateTimeToEpoch(segment.startAt) > operationalDateTimeToEpoch(DEMO_NOW));
  return <section className="dashboard-grid operations-summary-grid"><div className="panel operation-card"><div className="panel-heading"><div><p className="eyebrow">BizFlow demo · guardias</p><h2>Mi guardia</h2></div><ShieldCheck size={19} className="panel-heading-icon" /></div>{current?.segment ? <><span className="operation-status success">EN GUARDIA</span><strong>{zoneName(current.record.duty.zoneId)}</strong><small>{current.segment.technicianIds.filter((id) => id !== technicianId).map(technicianName).join(" + ") || "Sin compañero informado"}</small><span>{formatDateTime(current.segment.startAt)} → {formatDateTime(current.segment.endAt)}</span>{nextChange && <small>Próximo cambio: {formatDateTime(nextChange.startAt)}</small>}</> : <><span className="operation-status neutral">NO ESTÁ DE GUARDIA</span><p className="table-muted">No hay un tramo vigente para tu UserScope.</p></>}<div className="technician-week-summary"><p className="eyebrow">Esta semana</p><div><span>Fuera de horario</span><strong>{outsideHours.length}</strong></div><div><span>Durante guardia</span><strong>{onGuard}</strong></div><div><span>Fuera de guardia</span><strong>{offGuard}</strong></div><div><span>Conflictos licencia</span><strong>{leaveConflicts}</strong></div></div></div><div className="panel operation-card"><div className="panel-heading"><div><p className="eyebrow">BizFlow demo · jornada</p><h2>Mi jornada</h2></div><Clock3 size={19} className="panel-heading-icon" /></div>{leave ? <><span className="operation-status warning">{leave.type === "VACATION" ? "VACACIONES" : "LICENCIA"}</span><strong>{formatDate(leave.startDate)} → {formatDate(leave.endDate)}</strong><small>{leave.reason ?? "Ausencia aprobada"}</small></> : workday ? <><span className={`operation-status ${workday.status === "COMPLETED" ? "success" : "warning"}`}>{workday.status === "COMPLETED" ? "JORNADA FINALIZADA" : "JORNADA ACTIVA"}</span><strong>Inicio: {workday.workdayStartedAt ? formatDateTime(workday.workdayStartedAt) : "No informado"}</strong><small>Fin: {workday.workdayEndedAt ? formatDateTime(workday.workdayEndedAt) : "En curso"}</small></> : <><span className="operation-status neutral">SIN DATOS</span><p className="table-muted">No hay registro BizFlow demo para hoy.</p></>}</div></section>;
}

function classificationLabel(classification: OperationalTimeClassification): string {
  if (classification === OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD) return "FUERA DE HORARIO · DE GUARDIA";
  if (classification === OperationalTimeClassification.OUTSIDE_WORKING_HOURS_NOT_ON_GUARD) return "FUERA DE HORARIO · SIN GUARDIA";
  if (classification === OperationalTimeClassification.ON_LEAVE_CONFLICT) return "CONFLICTO · LICENCIA/VACACIONES";
  return "SIN TÉCNICO DETERMINÍSTICO";
}

function classificationTone(classification: OperationalTimeClassification): string {
  if (classification === OperationalTimeClassification.OUTSIDE_WORKING_HOURS_ON_GUARD) return "success";
  if (classification === OperationalTimeClassification.OUTSIDE_WORKING_HOURS_NOT_ON_GUARD) return "danger";
  if (classification === OperationalTimeClassification.ON_LEAVE_CONFLICT) return "warning";
  return "neutral";
}

function OutsideHoursPanel({ scope, records }: { scope: UserScope; records: GuardPlanningRecord[] }) {
  const segments = records.flatMap((record) => record.segments);
  const activities = mockSytexActivities.filter((activity) => filterForScope([scopedResourceForZone(activity.zoneId, activity.technicianId ? [activity.technicianId] : [])], scope).length > 0).map((activity) => {
    const result = classifyOperationalActivity({ activityAt: activity.activityAt, technicianId: activity.technicianId, segments, calendar: NO_HOLIDAYS, schedule: DEFAULT_WORKING_HOURS, onLeave: Boolean(activity.technicianId && getLeaveForDate(mockLeaveRecords, activity.technicianId, operationalDateKey(activity.activityAt))) });
    return { activity, result };
  }).filter(({ result }) => isOutsideHoursClassification(result.classification));
  return <section className="panel outside-hours-panel"><div className="panel-heading"><div><p className="eyebrow">Cruce FNET · Sytex + BizFlow demo</p><h2>Actividad fuera de horario</h2></div><Zap size={18} className="panel-heading-icon" /></div>{activities.length === 0 ? <div className="empty-state"><Clock3 size={23} /><h3>Sin actividad fuera de horario</h3><p>Las actividades dentro del horario laboral no aparecen en este panel.</p></div> : <div className="outside-hours-list">{activities.map(({ activity, result }) => <div className="outside-hours-row" key={activity.id}><div><strong>{activity.taskCode}</strong><small>{activity.siteCode} · {zoneName(activity.zoneId)} · {formatDateTime(activity.activityAt)}</small></div><span>{activity.technicianId ? technicianName(activity.technicianId) : "UNASSIGNED"}</span><span className={`status-badge ${classificationTone(result.classification)}`}>{classificationLabel(result.classification)}</span></div>)}</div>}</section>;
}
export function GuardPlanningView({ role, scope }: { role: UserRole; scope: UserScope }) {
  const [records, setRecords] = useState<GuardPlanningRecord[]>([]);
  const [weekStart, setWeekStart] = useState("2026-08-17");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [form, setForm] = useState<"create" | GuardPlanningRecord | null>(null);
  const [message, setMessage] = useState("");
  const canManage = role === "COORDINATOR" || role === "ADMIN";
  const reload = () => { void mockGuardPlanningService.listForScope(scope).then(setRecords); };
  useEffect(reload, [scope]);
  const scopedRecords = useMemo(() => records.filter((record) => (zoneFilter === "all" || record.duty.zoneId === zoneFilter) && isInWeek(record, weekStart)), [records, zoneFilter, weekStart]);
  if (role === "TECHNICIAN") return <div><TechnicianOperationsSummary scope={scope} /><div className="page-heading"><div><p className="eyebrow">BizFlow demo · solo alcance propio</p><h1>Mi guardia</h1><p className="page-subtitle">Guardia efectiva, jornada y actividad fuera de horario vinculadas a tu UserScope.</p></div><div className="data-source-tag"><span className="signal-dot" /> Demo local</div></div><section className="panel"><div className="guard-scope-note"><Users size={17} /> Solo se muestran tramos donde participa el técnico autenticado en modo demo.</div><OutsideHoursPanel scope={scope} records={records} /></section></div>;
  return <><div className="page-heading"><div><p className="eyebrow">BizFlow demo · guardias y cambios efectivos</p><h1>Guardias</h1><p className="page-subtitle">Planificación FNET local sobre recursos BizFlow demo. El historial no reemplaza la fuente externa.</p></div><div className="heading-actions">{canManage && <button className="button primary" onClick={() => setForm("create")}><Plus size={16} /> Asignar guardia</button>}<div className="data-source-tag"><span className="signal-dot" /> Solo demo local</div></div></div><SourceBadges /><div className="schedule-toolbar panel"><label className="guard-filter-label">Semana<input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /></label><label className="guard-filter-label">Zona<select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}><option value="all">Todas las zonas del alcance</option>{scope.zoneIds.map((zoneId) => <option key={zoneId} value={zoneId}>{zoneName(zoneId)}</option>)}</select></label><span className="toolbar-spacer" /><span className="schedule-sync"><span className="signal-dot" /> Alcance {scope.zoneIds.length} zona{scope.zoneIds.length === 1 ? "" : "s"}</span></div>{message && <div className="source-warning"><CheckCircle2 size={15} /> {message}</div>}<div className="guard-planning-grid">{scopedRecords.map((record) => <section className="panel guard-planning-card" key={record.duty.id}><div className="panel-heading"><div><p className="eyebrow">{zoneName(record.duty.zoneId)}</p><h2>Guardia operativa</h2></div><span className="status-badge success">{record.segments.length > 1 ? "Con cambios" : "Activa"}</span></div><div className="guard-period"><strong>{formatDateTime(record.duty.startAt)} → {formatDateTime(record.duty.endAt)}</strong><small>Zona {zoneName(record.duty.zoneId)} · cobertura demo</small></div><SegmentRows record={record} />{record.history.length > 0 && <div className="guard-history"><h3><History size={15} /> Historial de cambios</h3>{record.history.map((entry) => <div key={entry.id}><span>{formatDateTime(entry.changedAt)}</span><small>{entry.beforeTechnicianIds.map(technicianName).join(" + ")} → {entry.afterTechnicianIds.map(technicianName).join(" + ")}</small><small>Actor: {entry.actorUserId ?? "No informado"} · {entry.reason ?? "Sin motivo"}</small></div>)}</div>}{canManage && <button className="button secondary small" onClick={() => setForm(record)}>Modificar desde…</button>}</section>)}{scopedRecords.length === 0 && <div className="panel empty-state"><ShieldCheck size={26} /><h2>Sin guardias en el período</h2><p>El filtro respeta el UserScope activo y no usa fixtures fuera de alcance.</p></div>}</div><OutsideHoursPanel scope={scope} records={records} />{role === "MANAGER" && <section className="panel coverage-note"><p className="eyebrow">Consulta gerencial</p><h2>Cobertura dentro del scope</h2><p>El gerente puede consultar tramos, cambios, técnicos y zonas; no modifica la planificación en esta ronda.</p></section>}{form && <GuardForm scope={scope} record={form === "create" ? undefined : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); setMessage(form === "create" ? "Guardia demo asignada y persistida localmente." : "Cambio de guardia demo guardado; el tramo anterior permanece en el historial."); reload(); }} />}</>;
}
