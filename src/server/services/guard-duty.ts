import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { GuardOverview, GuardPeriod, Holiday, OffHoursVisit, VisitStatus } from '@/contracts/operations';
import { dayKind, daysBetween, guardSummary, monthRange, validPeriod, weekdayName } from '@/lib/guard-domain';
import { allowedProject } from '@/server/operations-domain';
import { getPrismaClient } from '@/server/prisma';
import { audit, catalog, fail, type OperationsActor } from './operations';

type Db = Prisma.TransactionClient;
type PeriodRow = { id: string; technician: string; date_from: Date; date_to: Date };
type OffRow = { id: string; day: Date; project: string; site_code: string; site_name: string; task_code: string; technicians: string[]; status: VisitStatus; outcome: string; hours: Prisma.Decimal | null };
const day = (value: Date) => value.toISOString().slice(0, 10);

async function load(from: string, to: string, actor: OperationsActor) {
  const db = getPrismaClient();
  const [periods, legacy, holidays, off] = await Promise.all([
    db.$queryRaw<PeriodRow[]>`SELECT id,technician,date_from,date_to FROM ops_guard_periods WHERE date_from <= ${to}::date AND date_to >= ${from}::date`,
    // Weeks loaded before guards could be any range: Monday to Sunday.
    db.$queryRaw<PeriodRow[]>`SELECT id,technician,week_start AS date_from,week_start + 6 AS date_to FROM ops_guard_weeks WHERE week_start <= ${to}::date AND week_start + 6 >= ${from}::date`,
    db.$queryRaw<{ day: Date; name: string }[]>`SELECT day,name FROM ops_holidays WHERE day BETWEEN ${from}::date AND ${to}::date ORDER BY day`,
    db.$queryRaw<OffRow[]>`SELECT v.id,v.day,v.project,v.site_code,v.site_name,v.task_code,v.technicians,v.status,v.outcome,h.hours
      FROM ops_visits v JOIN ops_visit_shifts s ON s.visit_id=v.id AND s.shift='FUERA_DE_HORARIO' LEFT JOIN ops_visit_hours h ON h.visit_id=v.id
      WHERE v.day BETWEEN ${from}::date AND ${to}::date ORDER BY v.day DESC,v.site_code`,
  ]);
  return {
    periods: [...periods, ...legacy].map((w): GuardPeriod => ({ id: w.id, technician: w.technician, from: day(w.date_from), to: day(w.date_to) }))
      .sort((a, b) => a.from.localeCompare(b.from) || a.technician.localeCompare(b.technician, 'es')),
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

const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');
export async function addGuardPeriod(actor: OperationsActor, input: { technician: string; from: string; to: string }) {
  if (!validPeriod(input.from, input.to)) fail('GUARD_PERIOD_INVALID', 422);
  const technician = cleanName(input.technician);
  return getPrismaClient().$transaction(async (tx: Db) => {
    const [same] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ops_guard_periods WHERE lower(technician)=lower(${technician}) AND date_from=${input.from}::date AND date_to=${input.to}::date`;
    if (same) return { saved: true, alreadyLoaded: true };
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO ops_guard_periods(id,technician,date_from,date_to,created_by) VALUES (${id}::uuid,${technician},${input.from}::date,${input.to}::date,${actor.user.id}::uuid)`;
    await audit(tx, actor, id, 'GUARD_PERIOD_ADDED', { technician, from: input.from, to: input.to });
    return { saved: true, alreadyLoaded: false };
  });
}
/** Changes who or when. A week loaded in the old Monday-to-Sunday table moves to the new table when edited. */
export async function updateGuardPeriod(actor: OperationsActor, input: { id: string; technician: string; from: string; to: string }) {
  if (!validPeriod(input.from, input.to)) fail('GUARD_PERIOD_INVALID', 422);
  const technician = cleanName(input.technician);
  return getPrismaClient().$transaction(async (tx: Db) => {
    const updated = await tx.$executeRaw`UPDATE ops_guard_periods SET technician=${technician},date_from=${input.from}::date,date_to=${input.to}::date WHERE id=${input.id}::uuid`;
    if (!updated) {
      const moved = await tx.$executeRaw`DELETE FROM ops_guard_weeks WHERE id=${input.id}::uuid`;
      if (!moved) fail('NOT_FOUND', 404);
      await tx.$executeRaw`INSERT INTO ops_guard_periods(id,technician,date_from,date_to,created_by) VALUES (${input.id}::uuid,${technician},${input.from}::date,${input.to}::date,${actor.user.id}::uuid)`;
    }
    await audit(tx, actor, input.id, 'GUARD_PERIOD_UPDATED', { technician, from: input.from, to: input.to });
    return { saved: true };
  });
}
export async function removeGuardPeriod(actor: OperationsActor, id: string) {
  return getPrismaClient().$transaction(async (tx: Db) => {
    const removed = await tx.$executeRaw`DELETE FROM ops_guard_periods WHERE id=${id}::uuid` || await tx.$executeRaw`DELETE FROM ops_guard_weeks WHERE id=${id}::uuid`;
    if (!removed) fail('NOT_FOUND', 404);
    await audit(tx, actor, id, 'GUARD_PERIOD_REMOVED', {});
    return { removed: true };
  });
}
/** One holiday, or a run of days (a long weekend, a local festivity) loaded at once. The name is optional. */
export async function addHoliday(actor: OperationsActor, input: { day: string; to?: string; name?: string }) {
  const last = input.to ?? input.day, days = daysBetween(input.day, last), name = input.name?.trim() || 'Feriado';
  if (!days.length || days.length > 31) fail('HOLIDAY_RANGE_INVALID', 422);
  return getPrismaClient().$transaction(async (tx: Db) => {
    for (const holiday of days) await tx.$executeRaw`INSERT INTO ops_holidays(day,name,created_by) VALUES (${holiday}::date,${name},${actor.user.id}::uuid) ON CONFLICT (day) DO UPDATE SET name=EXCLUDED.name`;
    await audit(tx, actor, input.day, 'HOLIDAY_SAVED', { from: input.day, to: last, name });
    return { saved: true, days: days.length };
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

/** Sheets of the month-end workbook: summary per technician, the guard days, the holidays and the off-hours tasks. */
export async function guardReport(actor: OperationsActor, month: string) {
  const { from, to } = monthRange(month), data = await load(from, to, actor);
  const summary = guardSummary(data.periods, data.holidays.map((h) => h.day), data.offHours, month);
  const holidays = new Set(data.holidays.map((h) => h.day));
  const kind = (d: string) => ({ FERIADO: 'Feriado', SABADO: 'Sábado', DOMINGO: 'Domingo', HABIL: 'Lunes a viernes' })[dayKind(d, holidays)];
  return {
    summary: [['Técnico', 'Períodos de guardia', 'Días de guardia pasiva', 'Días hábiles (lunes a viernes)', 'Días no laborales (sábados, domingos y feriados)', 'Tareas fuera de horario', 'Horas fuera de horario'], ...summary.map((r) => [r.technician, r.periods, r.days, r.weekdays, r.nonWorking, r.tasks, r.hours])],
    days: [['Técnico', 'Guardia desde', 'Guardia hasta', 'Fecha', 'Día', 'Tipo de día'], ...data.periods.flatMap((w) => daysBetween(w.from, w.to).filter((d) => d >= from && d <= to).map((d) => [w.technician, w.from, w.to, d, weekdayName(d), kind(d)]))],
    holidays: [['Fecha', 'Feriado'], ...data.holidays.map((h) => [h.day, h.name])],
    offHours: [['Fecha', 'Proyecto / zona', 'Sitio', 'Nombre', 'Tarea', 'Técnicos', 'Estado', 'Horas', 'Resultado'], ...data.offHours.map((v) => [v.day, v.project, v.siteCode, v.siteName, v.taskCode, v.technicians.join(' / '), v.status, v.hours, v.outcome])],
  };
}
