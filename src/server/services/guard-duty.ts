import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { GuardOverview, GuardWeek, Holiday, OffHoursVisit, VisitStatus } from '@/contracts/operations';
import { addDays, guardSummary, isMonday, monthRange, weekDays } from '@/lib/guard-domain';
import { allowedProject } from '@/server/operations-domain';
import { getPrismaClient } from '@/server/prisma';
import { audit, catalog, fail, type OperationsActor } from './operations';

type Db = Prisma.TransactionClient;
type WeekRow = { id: string; technician: string; week_start: Date };
type OffRow = { id: string; day: Date; project: string; site_code: string; site_name: string; task_code: string; technicians: string[]; status: VisitStatus; outcome: string; hours: Prisma.Decimal | null };
const day = (value: Date) => value.toISOString().slice(0, 10);

async function load(from: string, to: string, actor: OperationsActor) {
  const db = getPrismaClient();
  const [weeks, holidays, off] = await Promise.all([
    db.$queryRaw<WeekRow[]>`SELECT id,technician,week_start FROM ops_guard_weeks WHERE week_start <= ${to}::date AND week_start + 6 >= ${from}::date ORDER BY week_start,technician`,
    db.$queryRaw<{ day: Date; name: string }[]>`SELECT day,name FROM ops_holidays WHERE day BETWEEN ${from}::date AND ${to}::date ORDER BY day`,
    db.$queryRaw<OffRow[]>`SELECT v.id,v.day,v.project,v.site_code,v.site_name,v.task_code,v.technicians,v.status,v.outcome,h.hours
      FROM ops_visits v JOIN ops_visit_shifts s ON s.visit_id=v.id AND s.shift='FUERA_DE_HORARIO' LEFT JOIN ops_visit_hours h ON h.visit_id=v.id
      WHERE v.day BETWEEN ${from}::date AND ${to}::date ORDER BY v.day DESC,v.site_code`,
  ]);
  return {
    weeks: weeks.map((w): GuardWeek => ({ id: w.id, technician: w.technician, weekStart: day(w.week_start), weekEnd: addDays(day(w.week_start), 6) })),
    holidays: holidays.map((h): Holiday => ({ day: day(h.day), name: h.name })),
    offHours: off.filter((v) => allowedProject(v.project, actor.allowed)).map((v): OffHoursVisit => ({ id: v.id, day: day(v.day), project: v.project, siteCode: v.site_code, siteName: v.site_name, taskCode: v.task_code, technicians: v.technicians, status: v.status, outcome: v.outcome, hours: v.hours === null ? null : Number(v.hours) })),
  };
}

export async function guardOverview(actor: OperationsActor, from: string, to: string): Promise<GuardOverview> {
  const data = await load(from, to, actor);
  // CTIC never needs the technician list: it only reads.
  const technicians = actor.ctic ? [] : (await catalog(actor)).technicians;
  return { ctic: !!actor.ctic, from, to, ...data, technicians };
}

export async function addGuardWeek(actor: OperationsActor, input: { technician: string; weekStart: string }) {
  if (!isMonday(input.weekStart)) fail('WEEK_MUST_START_MONDAY', 422);
  const technician = input.technician.trim().replace(/\s+/g, ' ');
  return getPrismaClient().$transaction(async (tx: Db) => {
    const id = randomUUID();
    const saved = await tx.$executeRaw`INSERT INTO ops_guard_weeks(id,technician,week_start,created_by) VALUES (${id}::uuid,${technician},${input.weekStart}::date,${actor.user.id}::uuid) ON CONFLICT (technician,week_start) DO NOTHING`;
    if (saved) await audit(tx, actor, id, 'GUARD_WEEK_ADDED', { technician, weekStart: input.weekStart });
    return { saved: true, alreadyLoaded: !saved };
  });
}
export async function removeGuardWeek(actor: OperationsActor, id: string) {
  return getPrismaClient().$transaction(async (tx: Db) => {
    const removed = await tx.$executeRaw`DELETE FROM ops_guard_weeks WHERE id=${id}::uuid`;
    if (!removed) fail('NOT_FOUND', 404);
    await audit(tx, actor, id, 'GUARD_WEEK_REMOVED', {});
    return { removed: true };
  });
}
export async function addHoliday(actor: OperationsActor, input: { day: string; name: string }) {
  return getPrismaClient().$transaction(async (tx: Db) => {
    await tx.$executeRaw`INSERT INTO ops_holidays(day,name,created_by) VALUES (${input.day}::date,${input.name},${actor.user.id}::uuid) ON CONFLICT (day) DO UPDATE SET name=EXCLUDED.name`;
    await audit(tx, actor, input.day, 'HOLIDAY_SAVED', input);
    return { saved: true };
  });
}
export async function removeHoliday(actor: OperationsActor, holiday: string) {
  return getPrismaClient().$transaction(async (tx: Db) => {
    const removed = await tx.$executeRaw`DELETE FROM ops_holidays WHERE day=${holiday}::date`;
    if (!removed) fail('NOT_FOUND', 404);
    await audit(tx, actor, holiday, 'HOLIDAY_REMOVED', {});
    return { removed: true };
  });
}
/** Hours spent on a task that came up outside working hours; null clears them. */
export async function setVisitHours(actor: OperationsActor, input: { visitId: string; hours: number | null }) {
  return getPrismaClient().$transaction(async (tx: Db) => {
    const [visit] = await tx.$queryRaw<{ project: string; shift: string | null }[]>`SELECT v.project,s.shift FROM ops_visits v LEFT JOIN ops_visit_shifts s ON s.visit_id=v.id WHERE v.id=${input.visitId}::uuid`;
    if (!visit) fail('NOT_FOUND', 404);
    if (!allowedProject(visit.project, actor.allowed)) fail('FORBIDDEN_PROJECT', 403);
    if (visit.shift !== 'FUERA_DE_HORARIO') fail('VISIT_NOT_OUT_OF_HOURS', 422);
    if (input.hours === null) await tx.$executeRaw`DELETE FROM ops_visit_hours WHERE visit_id=${input.visitId}::uuid`;
    else await tx.$executeRaw`INSERT INTO ops_visit_hours(visit_id,hours,updated_by) VALUES (${input.visitId}::uuid,${input.hours},${actor.user.id}::uuid) ON CONFLICT (visit_id) DO UPDATE SET hours=EXCLUDED.hours,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`;
    await audit(tx, actor, input.visitId, 'VISIT_HOURS_SAVED', input);
    return { saved: true };
  });
}

/** Sheets of the month-end workbook: summary per technician, the guard weeks, the holidays and the off-hours tasks. */
export async function guardReport(actor: OperationsActor, month: string) {
  const { from, to } = monthRange(month), data = await load(from, to, actor);
  const summary = guardSummary(data.weeks, data.holidays.map((h) => h.day), data.offHours, month);
  const holidays = new Set(data.holidays.map((h) => h.day)), kind = (d: string) => holidays.has(d) ? 'Feriado' : [6, 0].includes(new Date(d + 'T00:00:00Z').getUTCDay()) ? (new Date(d + 'T00:00:00Z').getUTCDay() === 6 ? 'Sábado' : 'Domingo') : 'Lunes a viernes';
  return {
    summary: [['Técnico', 'Semanas de guardia', 'Días de guardia pasiva', 'Lunes a viernes', 'Sábados', 'Domingos', 'Feriados', 'Tareas fuera de horario', 'Horas fuera de horario'], ...summary.map((r) => [r.technician, r.weeks, r.days, r.weekdays, r.saturdays, r.sundays, r.holidays, r.tasks, r.hours])],
    days: [['Técnico', 'Semana desde (lunes)', 'Semana hasta (domingo)', 'Fecha', 'Tipo de día'], ...data.weeks.flatMap((w) => weekDays(w.weekStart).filter((d) => d >= from && d <= to).map((d) => [w.technician, w.weekStart, w.weekEnd, d, kind(d)]))],
    holidays: [['Fecha', 'Feriado'], ...data.holidays.map((h) => [h.day, h.name])],
    offHours: [['Fecha', 'Proyecto / zona', 'Sitio', 'Nombre', 'Tarea', 'Técnicos', 'Estado', 'Horas', 'Resultado'], ...data.offHours.map((v) => [v.day, v.project, v.siteCode, v.siteName, v.taskCode, v.technicians.join(' / '), v.status, v.hours, v.outcome])],
  };
}
