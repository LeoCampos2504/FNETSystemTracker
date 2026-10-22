import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { GuardOverview, GuardPeriod, Holiday, OffHoursVisit, VisitStatus } from '@/contracts/operations';
import { dayKind, daysBetween, guardDailyCoverage, guardSummary, monthRange, validPeriod, weekdayName } from '@/lib/guard-domain';
import { allowedProject } from '@/server/operations-domain';
import { getPrismaClient } from '@/server/prisma';
import { audit, catalog, fail, type OperationsActor } from './operations';
import { crewDb, crewOverview, crewPeriods } from './guard-crews';
import { crewStorageReady, readCrews } from '@/server/guard-crew-store';
import { guardStart, normalizeName } from '@/lib/guard-domain';
import { operationalDateTimeToUtc } from '@/lib/operational-timezone';

type Db = Prisma.TransactionClient;
type PeriodRow = { id: string; technician: string; date_from: Date; date_to: Date };
type OffRow = { id: string; day: Date; project: string; site_code: string; site_name: string; task_code: string; technicians: string[]; status: VisitStatus; outcome: string; hours: Prisma.Decimal | null };
const day = (value: Date) => value.toISOString().slice(0, 10);

async function load(from: string, to: string, actor: OperationsActor) {
  const db = getPrismaClient();
  const [periods, legacy, holidays, off] = await Promise.all([
    db.$queryRaw<PeriodRow[]>`SELECT id,technician,date_from,date_to FROM ops_guard_periods WHERE date_from <= ${to}::date AND date_to >= ${from}::date`,
    // Old Monday–Sunday weeks end at the NEXT Monday's 08:00 handover.
    db.$queryRaw<PeriodRow[]>`SELECT id,technician,week_start AS date_from,week_start + 7 AS date_to FROM ops_guard_weeks WHERE week_start <= ${to}::date AND week_start + 7 > ${from}::date`,
    db.$queryRaw<{ day: Date; name: string }[]>`SELECT day,name FROM ops_holidays WHERE day BETWEEN ${from}::date AND ${to}::date ORDER BY day`,
    db.$queryRaw<OffRow[]>`SELECT v.id,v.day,v.project,v.site_code,v.site_name,v.task_code,v.technicians,v.status,v.outcome,h.hours
      FROM ops_visits v JOIN ops_visit_shifts s ON s.visit_id=v.id AND s.shift='FUERA_DE_HORARIO' LEFT JOIN ops_visit_hours h ON h.visit_id=v.id
      WHERE v.day BETWEEN ${from}::date AND ${to}::date ORDER BY v.day DESC,v.site_code`,
  ]);
  const crewData = await crewOverview(actor, from, to);
  const linked = new Set(crewData.crews.flatMap(c => c.legacyIds));
  // Old records have no zone. Only Admin/CTIC can inspect them; no guessed authorization.
  const old = actor.user.role === 'ADMIN' || actor.ctic ? [...periods, ...legacy].filter(p => !linked.has(p.id)) : [];
  return {
    ...crewData,
    periods: [...old.map((w): GuardPeriod => ({ id: w.id, technician: w.technician, from: day(w.date_from), to: day(w.date_to) })), ...crewPeriods(crewData.crews)]
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
  if (actor.user.role !== 'ADMIN' || actor.ctic) fail('FORBIDDEN', 403);
  if (!validPeriod(input.from, input.to)) fail('GUARD_PERIOD_INVALID', 422);
  const technician = cleanName(input.technician);
  return getPrismaClient().$transaction(async (tx: Db) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(680250134141)) AS guard_lock`;
    if (await crewStorageReady(crewDb(tx))) {
      const crews = await readCrews(crewDb(tx), {actorId:actor.user.id,admin:true,ctic:false,zones:[],technicians:[]}, operationalDateTimeToUtc(guardStart(input.from)), operationalDateTimeToUtc(guardStart(input.to)));
      if (crewPeriods(crews).some(p => normalizeName(p.technician) === normalizeName(technician))) fail('GUARD_OVERLAP');
    }
    const [same] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ops_guard_periods WHERE lower(technician)=lower(${technician}) AND date_from=${input.from}::date AND date_to=${input.to}::date`;
    if (same) return { saved: true, alreadyLoaded: true };
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO ops_guard_periods(id,technician,date_from,date_to,created_by) VALUES (${id}::uuid,${technician},${input.from}::date,${input.to}::date,${actor.user.id}::uuid)`;
    await audit(tx, actor, id, 'GUARD_PERIOD_ADDED', { technician, from: input.from, to: input.to });
    return { saved: true, alreadyLoaded: false };
  });
}
/** Explicit legacy date correction. Keep membership and audit both snapshots. Linked rows cannot change. */
export async function updateGuardPeriod(actor: OperationsActor, input: { id: string; technician: string; from: string; to: string }) {
  if (actor.user.role !== 'ADMIN' || actor.ctic) fail('FORBIDDEN', 403);
  if (!validPeriod(input.from, input.to)) fail('GUARD_PERIOD_INVALID', 422);
  const technician = cleanName(input.technician);
  return getPrismaClient().$transaction(async (tx: Db) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(680250134141)) AS guard_lock`;
    const ready = await crewStorageReady(crewDb(tx));
    if (ready) {
      const linked = await tx.$queryRaw<unknown[]>`SELECT id FROM ops_guard_crews WHERE legacy_ids @> ${JSON.stringify([input.id])}::jsonb`;
      if (linked.length) fail('GUARD_LEGACY_LINKED');
    }
    const [before] = await tx.$queryRaw<PeriodRow[]>`SELECT id,technician,date_from,date_to FROM ops_guard_periods WHERE id=${input.id}::uuid UNION ALL SELECT id,technician,week_start,week_start+7 FROM ops_guard_weeks WHERE id=${input.id}::uuid`;
    if (!before) fail('NOT_FOUND', 404);
    if (cleanName(before.technician) !== technician) fail('GUARD_HISTORY_PRESERVED', 422);
    // Do not silently introduce overlap via a historical date correction.
    const others = await tx.$queryRaw<PeriodRow[]>`SELECT id,technician,date_from,date_to FROM ops_guard_periods WHERE date_from < ${input.to}::date AND date_to > ${input.from}::date UNION ALL SELECT id,technician,week_start,week_start+7 FROM ops_guard_weeks WHERE week_start < ${input.to}::date AND week_start+7 > ${input.from}::date`;
    const crews = ready ? await readCrews(crewDb(tx), {actorId:actor.user.id,admin:true,ctic:false,zones:[],technicians:[]}, operationalDateTimeToUtc(guardStart(input.from)), operationalDateTimeToUtc(guardStart(input.to))) : [];
    const linkedIds = new Set(crews.flatMap(c => c.legacyIds));
    const conflict = others.some(p => p.id !== input.id && !linkedIds.has(p.id) && normalizeName(p.technician) === normalizeName(technician)) || crewPeriods(crews).some(p => normalizeName(p.technician) === normalizeName(technician));
    if (conflict) fail('GUARD_OVERLAP');
    const updated = await tx.$executeRaw`UPDATE ops_guard_periods SET technician=${technician},date_from=${input.from}::date,date_to=${input.to}::date WHERE id=${input.id}::uuid`;
    if (!updated) {
      const moved = await tx.$executeRaw`DELETE FROM ops_guard_weeks WHERE id=${input.id}::uuid`;
      if (!moved) fail('NOT_FOUND', 404);
      await tx.$executeRaw`INSERT INTO ops_guard_periods(id,technician,date_from,date_to,created_by) VALUES (${input.id}::uuid,${technician},${input.from}::date,${input.to}::date,${actor.user.id}::uuid)`;
    }
    await audit(tx, actor, input.id, 'GUARD_PERIOD_UPDATED', { before: { technician: before.technician, from: day(before.date_from), to: day(before.date_to) }, after: { technician, from: input.from, to: input.to } });
    return { saved: true };
  });
}
export async function removeGuardPeriod(actor: OperationsActor, id: string) {
  if (actor.user.role !== 'ADMIN' || actor.ctic) fail('FORBIDDEN', 403);
  // Legacy removals are disabled: historical assignments must not disappear.
  void id;
  fail('GUARD_HISTORY_PRESERVED', 422);
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
    days: [['Técnico', 'Fecha operativa (08:00)', 'Día', 'Tipo de día', 'Horas de cobertura', 'Días equivalentes (no liquidación)'], ...guardDailyCoverage(data.periods, month).map(r => [r.technician, r.day, weekdayName(r.day), kind(r.day), r.hours, r.days])],
    holidays: [['Fecha', 'Feriado'], ...data.holidays.map((h) => [h.day, h.name])],
    offHours: [['Fecha', 'Proyecto / zona', 'Sitio', 'Nombre', 'Tarea', 'Técnicos', 'Estado', 'Horas', 'Resultado'], ...data.offHours.map((v) => [v.day, v.project, v.siteCode, v.siteName, v.taskCode, v.technicians.join(' / '), v.status, v.hours, v.outcome])],
  };
}
