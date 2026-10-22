import type { Prisma } from '@prisma/client';
import { zoneCode } from '@/lib/filters';
import { addDays, guardStart } from '@/lib/guard-domain';
import { operationalDateKey, operationalDateTimeToUtc } from '@/lib/operational-timezone';
import { canWriteCrews, createCrewInTransaction, crewStorageReady, readCrews, replaceCrewInTransaction, type CrewAccess, type CrewCreate, type CrewDb, type CrewReplace } from '@/server/guard-crew-store';
import { getPrismaClient } from '@/server/prisma';
import { catalog, fail, type OperationsActor } from './operations';

export const crewDb = (db: Pick<Prisma.TransactionClient, '$queryRawUnsafe'>): CrewDb => ({ query: <T>(sql: string, values: unknown[] = []) => db.$queryRawUnsafe<T[]>(sql, ...values) });
export async function guardCrewAccess(actor: OperationsActor): Promise<CrewAccess> {
  const admin = actor.user.role === 'ADMIN';
  // Fail closed for unconfigured coordinators, independently of legacy global operations access.
  if (actor.ctic || (!admin && !actor.allowed?.length)) return { actorId: actor.user.id, admin, ctic: !!actor.ctic, zones: [], technicians: [] };
  const c = await catalog(actor);
  return { actorId: actor.user.id, admin, ctic: !!actor.ctic, zones: [...new Set(c.projects.map(zoneCode))].sort(), technicians: c.technicians };
}
export async function crewOverview(actor: OperationsActor, from: string, to: string) {
  const access = await guardCrewAccess(actor), db = crewDb(getPrismaClient()), ready = await crewStorageReady(db);
  const crews = ready ? await readCrews(db, access, operationalDateTimeToUtc(guardStart(from)), operationalDateTimeToUtc(guardStart(addDays(to, 1)))) : [];
  return { crews, crewStorageReady: ready, zones: access.zones, canManageCrews: canWriteCrews(access), canManageLegacy: access.admin && !access.ctic };
}
export async function addGuardCrew(actor: OperationsActor, input: CrewCreate) {
  const access = await guardCrewAccess(actor);
  if (!canWriteCrews(access)) fail('FORBIDDEN', 403);
  return getPrismaClient().$transaction(async tx => {
    const db = crewDb(tx);
    if (!await crewStorageReady(db)) fail('GUARD_STORAGE_PENDING', 503);
    return createCrewInTransaction(db, access, input);
  });
}
export async function replaceGuardCrew(actor: OperationsActor, input: CrewReplace) {
  const access = await guardCrewAccess(actor);
  if (!canWriteCrews(access)) fail('FORBIDDEN', 403);
  return getPrismaClient().$transaction(async tx => {
    const db = crewDb(tx);
    if (!await crewStorageReady(db)) fail('GUARD_STORAGE_PENDING', 503);
    return replaceCrewInTransaction(db, access, input);
  });
}
export const crewPeriods = (crews: Awaited<ReturnType<typeof readCrews>>) => crews.filter(c => !c.cancelled).flatMap(c => c.segments.flatMap((s, index) => s.technicians.map(technician => ({ id: c.id + ':' + index + ':' + technician, crewId: c.id, technician, from: operationalDateKey(s.startAt), to: operationalDateKey(s.endAt), startAt: s.startAt, endAt: s.endAt }))));
