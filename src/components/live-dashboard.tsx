"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, ClipboardList,
  Clock3, MapPin, Package, ShieldCheck,
} from "lucide-react";
import { TaskCriticality, TaskStatus, TaskType } from "@/contracts";
import type { FuelMetrics, PendingMetrics, PendingVisit, PostgresQuote, Task } from "@/contracts";
import { isPendingQuoteStatus } from "@/lib/quote-status";
import { roleLabel } from "@/lib/scope";

type ViewKey = "dashboard" | "schedule" | "tasks" | "supplies" | "quotes" | "guards" | "vehicles";
type DatabaseState = "loading" | "ready" | "error";
type AlertKind = "urgent" | "overdue" | "unassigned" | "pending" | "quote" | "preventive";

type DashboardProps = {
  role: string;
  today: string;
  databaseState: DatabaseState;
  visibleTasks: Task[];
  setView: (view: ViewKey) => void;
  pendingBySite: Record<string, PendingVisit[]>;
  fuelMetrics: FuelMetrics | null;
  pendingMetrics: PendingMetrics | null;
};

type OperationalAlert = { id: string; kind: AlertKind; title: string; detail: string; target: ViewKey | string };

const terminalStatuses = new Set<string>([
  TaskStatus.APPROVED,
  TaskStatus.APPROVED_WITH_PENDING,
  TaskStatus.CANCELLED,
]);

const preventiveNotStartedStatuses = new Set<string>([TaskStatus.OPEN, TaskStatus.REJECTED]);

function formatDay(value: string): string {
  const label = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function isActive(task: Task): boolean {
  return !terminalStatuses.has(task.status);
}

function isAssigned(task: Task): boolean {
  return Boolean(task.assignedTo?.trim() || task.collaborator?.trim() || task.assignments.length > 0);
}

function assignmentLabel(task: Task): string {
  const raw = [task.assignedTo, task.collaborator].filter((value): value is string => Boolean(value?.trim()));
  if (raw.length > 0) return raw.join(" + ");
  if (task.assignments.length > 0) return task.assignments.map((assignment) => assignment.technicianId).join(" + ");
  return "Sin cuadrilla asignada";
}

function taskAgeInDays(task: Task): number | null {
  if (!task.requestDate) return null;
  const requestDate = new Date(task.requestDate);
  if (Number.isNaN(requestDate.getTime())) return null;
  return Math.floor((Date.now() - requestDate.getTime()) / 86_400_000);
}

function alertIcon(kind: AlertKind) {
  if (kind === "quote") return <Package size={15} />;
  if (kind === "preventive") return <CalendarDays size={15} />;
  if (kind === "pending") return <MapPin size={15} />;
  return <AlertTriangle size={15} />;
}

function LiveMetricCard({ label, value, detail, tone, icon: Icon, onClick }: { label: string; value: string | number; detail: string; tone: string; icon: typeof ClipboardList; onClick: () => void }) {
  return <button className={`kpi-card kpi-${tone} live-kpi-card`} type="button" onClick={onClick}><div className="kpi-card-top"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon size={17} /></span></div><div className="kpi-value">{value}</div><div className="kpi-detail">{detail}<ArrowUpRight size={12} /></div></button>;
}

function LiveSummaryCard({ label, value, detail, tone, onClick }: { label: string; value: string | number; detail: string; tone: string; onClick: () => void }) {
  return <button className={`summary-card live-summary-card accent-${tone}`} type="button" onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{detail} <ArrowUpRight size={11} /></small></button>;
}

function LiveDashboardView({ role, today, databaseState, visibleTasks, setView, pendingBySite, fuelMetrics, pendingMetrics }: DashboardProps) {
  const connected = databaseState === "ready";
  const [quotes, setQuotes] = useState<PostgresQuote[]>([]);
  const [quoteState, setQuoteState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void fetch("/api/cotizaciones", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("quotes_unavailable");
      return response.json() as Promise<{ items: PostgresQuote[] }>;
    }).then((data) => { if (!cancelled) { setQuotes(data.items); setQuoteState("ready"); } }).catch(() => { if (!cancelled) { setQuotes([]); setQuoteState("error"); } });
    return () => { cancelled = true; };
  }, [connected, databaseState]);

  const todayTasks = useMemo(() => visibleTasks.filter((task) => task.scheduledDate === today).sort((left, right) => (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? "")), [today, visibleTasks]);
  const completedToday = todayTasks.filter((task) => task.status === TaskStatus.APPROVED || task.status === TaskStatus.APPROVED_WITH_PENDING);
  const pendingToday = todayTasks.filter((task) => !terminalStatuses.has(task.status));
  const activeCorrectives = visibleTasks.filter((task) => task.type === TaskType.CORRECTIVE && isActive(task));
  const activePreventives = visibleTasks.filter((task) => task.type === TaskType.PREVENTIVE && isActive(task));
  const urgentCorrectives = activeCorrectives.filter((task) => task.criticality === TaskCriticality.URGENT);
  const overdueCorrectives = activeCorrectives.filter((task) => (taskAgeInDays(task) ?? -1) > 21);
  const pendingQuotes = (connected ? quotes : []).filter((quote) => isPendingQuoteStatus(quote.status));
  const relatedPendingQuotes = pendingQuotes.filter((quote) => Boolean(quote.relatedCorrectiveCode));
  const completionRate = todayTasks.length === 0 ? null : Math.round((completedToday.length / todayTasks.length) * 100);

  const crewSummaries = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of todayTasks) {
      const key = assignmentLabel(task);
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }
    return [...groups.entries()].map(([label, tasks]) => ({
      label, tasks, preventives: tasks.filter((task) => task.type === TaskType.PREVENTIVE).length,
      correctives: tasks.filter((task) => task.type === TaskType.CORRECTIVE).length,
      urgent: tasks.filter((task) => task.criticality === TaskCriticality.URGENT).length,
      pendingSites: new Set(tasks.filter((task) => (pendingBySite[task.siteCode] ?? []).length > 0).map((task) => task.siteCode)).size,
      completed: tasks.filter((task) => task.status === TaskStatus.APPROVED || task.status === TaskStatus.APPROVED_WITH_PENDING).length,
      zone: tasks.find((task) => task.zoneId && !task.zoneId.startsWith("Sin "))?.zoneId ?? "Sin zona informada",
    }));
  }, [pendingBySite, todayTasks]);

  const pendingSites = useMemo(() => Object.entries(pendingBySite).filter(([, items]) => items.length > 0).sort(([, left], [, right]) => right.length - left.length), [pendingBySite]);
  const alerts = useMemo<OperationalAlert[]>(() => {
    const result: OperationalAlert[] = [];
    const seen = new Set<string>();
    const add = (alert: OperationalAlert, uniqueKey: string) => { if (seen.has(uniqueKey)) return; seen.add(uniqueKey); result.push(alert); };
    urgentCorrectives.filter((task) => !isAssigned(task)).forEach((task) => add({ id: `urgent-${task.id}`, kind: "urgent", title: `Correctivo urgente sin asignación · ${task.taskCode}`, detail: `${task.siteCode} · prioridad urgente oficial`, target: "/correctivos" }, task.id));
    overdueCorrectives.forEach((task) => add({ id: `overdue-${task.id}`, kind: "overdue", title: `Correctivo con más de 21 días · ${task.taskCode}`, detail: `${task.siteCode} · solicitud abierta hace ${taskAgeInDays(task)} días`, target: "/correctivos" }, task.id));
    todayTasks.filter((task) => !isAssigned(task)).forEach((task) => add({ id: `unassigned-${task.id}`, kind: "unassigned", title: `Tarea del día sin cuadrilla · ${task.taskCode}`, detail: `${task.siteCode} · ${task.type === TaskType.CORRECTIVE ? "Correctivo" : "Preventivo"}`, target: "schedule" }, task.id));
    pendingSites.filter(([siteCode]) => todayTasks.some((task) => task.siteCode === siteCode)).forEach(([siteCode, items]) => add({ id: `pending-${siteCode}`, kind: "pending", title: `Pendientes de visitas anteriores · ${siteCode}`, detail: `${items.length} pendiente${items.length === 1 ? "" : "s"} para revisar`, target: "/pendientes" }, `site-${siteCode}`));
    relatedPendingQuotes.forEach((quote) => add({ id: `quote-${quote.id}`, kind: "quote", title: `QO pendiente relacionada · ${quote.code}`, detail: `Correctivo ${quote.relatedCorrectiveCode}`, target: "/cotizaciones" }, `quote-${quote.code}`));
    todayTasks.filter((task) => task.type === TaskType.PREVENTIVE && preventiveNotStartedStatuses.has(task.status)).forEach((task) => add({ id: `preventive-${task.id}`, kind: "preventive", title: `Preventivo programado no iniciado · ${task.taskCode}`, detail: `${task.siteCode} · ${formatTime(task.scheduledAt)}`, target: "schedule" }, task.id));
    return result.slice(0, 12);
  }, [overdueCorrectives, pendingSites, relatedPendingQuotes, todayTasks, urgentCorrectives]);

  const navigate = (target: ViewKey | string) => { if (target === "schedule" || target === "tasks") setView(target); else window.location.assign(target); };
  const officialValue = (value: number, detail: string) => connected ? { value, detail } : { value: "—", detail: "Sin datos oficiales" };
  const firstRow = [
    { label: "Tareas del día", ...officialValue(todayTasks.length, "planificadas hoy"), tone: "blue", icon: ClipboardList, target: "schedule" as ViewKey },
    { label: "Completadas hoy", ...officialValue(completedToday.length, "finalizadas operacionalmente"), tone: "green", icon: CheckCircle2, target: "schedule" as ViewKey },
    { label: "Pendientes del día", ...officialValue(pendingToday.length, "todavía no completadas"), tone: "orange", icon: Clock3, target: "schedule" as ViewKey },
    { label: "Correctivos urgentes", ...officialValue(urgentCorrectives.length, "criticidad urgente disponible"), tone: "red", icon: AlertTriangle, target: "/correctivos" },
  ];

  return <>
    <div className="page-heading live-dashboard-heading"><div><p className="eyebrow">{formatDay(today)}</p><h1>Estado operativo</h1><p className="page-subtitle">{connected ? "Datos oficiales consultados desde PostgreSQL." : databaseState === "loading" ? "Consultando PostgreSQL…" : "Sin datos oficiales disponibles."}</p></div><div className="live-dashboard-heading-actions"><span className={`live-database-status ${connected ? "connected" : "unavailable"}`}><span className="signal-dot" /> {connected ? "PostgreSQL conectado" : databaseState === "loading" ? "Consultando PostgreSQL" : "PostgreSQL no disponible"}</span><span className="live-role-chip">Rol activo · {roleLabel(role)}</span></div></div>
    <div className="kpi-grid live-dashboard-first-row">{firstRow.map((card) => <LiveMetricCard key={card.label} label={card.label} value={card.value} detail={card.detail} tone={card.tone} icon={card.icon} onClick={() => navigate(card.target)} />)}</div>
    <div className="task-summary-grid live-dashboard-second-row"><LiveSummaryCard label="Preventivos abiertos" value={connected ? activePreventives.length : "—"} detail={connected ? "estado activo" : "Sin datos"} tone="blue" onClick={() => navigate("/preventivos")} /><LiveSummaryCard label="Correctivos abiertos" value={connected ? activeCorrectives.length : "—"} detail={connected ? "estado activo" : "Sin datos"} tone="red" onClick={() => navigate("/correctivos")} /><LiveSummaryCard label="TA vencidas > 21 días" value={connected ? overdueCorrectives.length : "—"} detail={connected ? "fecha de solicitud" : "Sin datos"} tone="orange" onClick={() => navigate("/correctivos")} /><LiveSummaryCard label="QO pendientes" value={connected && quoteState === "ready" ? pendingQuotes.length : "—"} detail={connected && quoteState === "ready" ? "abiertas, en proceso, en espera o con pendientes" : "Sin datos"} tone="purple" onClick={() => navigate("/cotizaciones")} /><LiveSummaryCard label="Pendientes de visitas anteriores" value={connected ? pendingMetrics?.open ?? 0 : "—"} detail={connected ? "estado PENDIENTE" : "Sin datos"} tone="orange" onClick={() => navigate("/pendientes")} /><LiveSummaryCard label="Combustible del mes" value={connected && fuelMetrics ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(fuelMetrics.monthLiters)} L` : "—"} detail={connected && fuelMetrics ? `${fuelMetrics.monthCharges} cargas` : "Sin datos"} tone="green" onClick={() => navigate("/combustible")} /></div>
    <section className="panel live-alerts-panel"><div className="panel-heading"><div><p className="eyebrow">Prioridad de atención</p><h2>Alertas operativas</h2></div><span className="table-muted">{connected ? `${alerts.length} activas` : "Sin datos"}</span></div>{alerts.length === 0 ? <div className="empty-state"><ShieldCheck size={25} /><h2>{connected ? "Sin alertas operativas" : "Alertas no disponibles"}</h2><p>{connected ? "No hay alertas calculables con los datos oficiales actuales." : "No se muestran alertas demo mientras PostgreSQL no esté disponible."}</p></div> : <div className="alert-list">{alerts.map((alert) => <button className="alert-item live-alert-item" key={alert.id} type="button" onClick={() => navigate(alert.target)}><span className={`alert-icon ${alert.kind === "urgent" || alert.kind === "overdue" ? "red" : alert.kind === "quote" ? "purple" : alert.kind === "preventive" ? "green" : "orange"}`}>{alertIcon(alert.kind)}</span><span><strong>{alert.title}</strong><small>{alert.detail}</small></span><ArrowUpRight size={15} className="alert-arrow" /></button>)}</div>}</section>
    <div className="dashboard-grid live-dashboard-grid"><section className="panel day-plan-panel live-plan-panel"><div className="panel-heading"><div><p className="eyebrow">Agenda oficial</p><h2>Plan de hoy</h2></div><button className="text-button" type="button" onClick={() => setView("schedule")}>Ver cronograma <ArrowUpRight size={14} /></button></div><div className="plan-progress"><div><span>Progreso operativo</span><strong>{connected && completionRate !== null ? `${completedToday.length}/${todayTasks.length} tareas` : "—"}</strong></div><div className="progress-track"><span style={{ width: `${completionRate ?? 0}%` }} /></div></div>{!connected ? <div className="empty-state"><ClipboardList size={24} /><h2>Sin datos oficiales</h2><p>El plan se completa cuando PostgreSQL responde.</p></div> : todayTasks.length === 0 ? <div className="empty-state"><ClipboardList size={24} /><h2>Sin tareas para hoy</h2><p>No hay tareas oficiales con fecha del día.</p></div> : <div className="live-task-list">{todayTasks.slice(0, 12).map((task) => <button className="live-task-row" type="button" key={task.id} onClick={() => setView("schedule")}><span className="task-time">{formatTime(task.scheduledAt)}</span><span className={`task-type-mark ${task.type === TaskType.CORRECTIVE ? "corrective" : "preventive"}`}>{task.type === TaskType.CORRECTIVE ? "C" : "P"}</span><span className="live-task-main"><span><strong>{task.taskCode}</strong><span className="status-badge neutral">{task.status}</span>{(pendingBySite[task.siteCode] ?? []).length > 0 && <span className="pending-count-badge">⚠ {(pendingBySite[task.siteCode] ?? []).length}</span>}</span><small><MapPin size={12} /> {task.siteCode} · {task.zoneId}</small></span><span className="live-task-assignee">{assignmentLabel(task)}</span></button>)}</div>}</section><section className="panel live-crew-panel"><div className="panel-heading"><div><p className="eyebrow">Organización del día</p><h2>Trabajo por cuadrilla</h2></div><UsersIcon /></div>{!connected || crewSummaries.length === 0 ? <div className="empty-state"><UsersIcon /><h2>{connected ? "Sin cuadrillas en la agenda" : "Sin datos"}</h2><p>La asignación se muestra solo cuando existe en la fuente oficial.</p></div> : <div className="live-crew-list">{crewSummaries.map((crew) => <div className="live-crew-card" key={crew.label}><div className="live-crew-header"><div><strong>{crew.label}</strong><small>{crew.zone}</small></div><span>{crew.completed}/{crew.tasks.length}</span></div><div className="live-crew-technicians">{crew.label === "Sin cuadrilla asignada" ? "Requiere asignación" : crew.label}</div><div className="live-crew-stats"><span>{crew.tasks.length} tareas</span><span>{crew.preventives} prev.</span><span>{crew.correctives} corr.</span><span>{crew.urgent} urg.</span><span>{crew.pendingSites} sitios con pendientes</span></div><div className="crew-progress"><span style={{ width: `${crew.tasks.length === 0 ? 0 : (crew.completed / crew.tasks.length) * 100}%` }} /></div><small>Progreso del día</small></div>)}</div>}</section></div>
    <section className="panel live-sites-panel"><div className="panel-heading"><div><p className="eyebrow">Problemas por sitio</p><h2>Pendientes de visitas anteriores</h2></div><button className="text-button" type="button" onClick={() => navigate("/pendientes")}>Ver pendientes <ArrowUpRight size={14} /></button></div>{!connected || pendingSites.length === 0 ? <div className="empty-state"><MapPin size={24} /><h2>{connected ? "No hay sitios con pendientes abiertos" : "Sin datos"}</h2><p>La relación se calcula únicamente por `codigo_sitio`.</p></div> : <div className="live-site-list">{pendingSites.slice(0, 8).map(([siteCode, items]) => <button className="live-site-row" type="button" key={siteCode} onClick={() => navigate("/pendientes")}><span><MapPin size={15} /><strong>{siteCode}</strong></span><span>{items.length} pendiente{items.length === 1 ? "" : "s"} <ArrowUpRight size={13} /></span></button>)}</div>}</section>
  </>;
}

function UsersIcon() {
  return <span className="live-panel-icon"><ClipboardList size={17} /></span>;
}

export { LiveDashboardView };
