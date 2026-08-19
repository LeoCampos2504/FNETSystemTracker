import type { Guard, GuardPerformance } from "@/contracts";
import type { CreateGuardInput, UpdateGuardInput } from "@/server/ports";
import { repositories } from "@/server/container";
import { badRequest, notFound } from "@/server/http/errors";
import { recordAudit } from "./audit.service";
import { notifyGuardChange } from "./notification.service";

function dedupeById(guards: Guard[]): Guard[] {
  const byId = new Map(guards.map((g) => [g.id, g]));
  return [...byId.values()];
}

export interface GuardListFilter {
  technicianId?: string;
  zoneIds?: string[];
}

export async function listGuards(filter: GuardListFilter): Promise<Guard[]> {
  if (!filter.zoneIds || filter.zoneIds.length === 0) {
    return repositories.guard.list({ technicianId: filter.technicianId });
  }
  const perZone = await Promise.all(
    filter.zoneIds.map((zoneId) => repositories.guard.list({ technicianId: filter.technicianId, zoneId })),
  );
  return dedupeById(perZone.flat());
}

export async function getGuardById(guardId: string): Promise<Guard> {
  const guard = await repositories.guard.findById(guardId);
  if (!guard) throw notFound(`Guard not found: ${guardId}`);
  return guard;
}

/**
 * Non-throwing counterpart for `Api.getGuardPerformance(): Promise<GuardPerformance | null>`
 * — that contract op must resolve null (not throw) when the guard itself
 * doesn't exist, so `GET /api/guards/:id/performance` uses this instead of
 * the throwing `getGuardById`.
 */
export async function findGuardById(guardId: string): Promise<Guard | null> {
  return repositories.guard.findById(guardId);
}

export async function getGuardPerformance(guardId: string): Promise<GuardPerformance | null> {
  const guard = await findGuardById(guardId);
  if (!guard) return null;
  return repositories.guard.getPerformance(guardId);
}

async function assertTechniciansExist(technicianIds: string[]): Promise<void> {
  const technicians = await Promise.all(technicianIds.map((id) => repositories.technician.findById(id)));
  const unknownIds = technicianIds.filter((_, i) => !technicians[i]);
  if (unknownIds.length > 0) {
    throw badRequest(`Unknown technicianId(s): ${unknownIds.join(", ")}`);
  }
}

async function assertZoneExists(zoneId: string): Promise<void> {
  const zone = await repositories.zone.findById(zoneId);
  if (!zone) throw badRequest(`Unknown zoneId: ${zoneId}`);
}

export async function createGuard(actorId: string, input: CreateGuardInput): Promise<Guard> {
  await assertTechniciansExist(input.technicianIds);
  await assertZoneExists(input.zoneId);

  const guard = await repositories.guard.create(input);
  await recordAudit(actorId, "GUARD_CREATED", "Guard", guard.id, null, {
    ...guard,
    technicianIds: [...guard.technicianIds],
  });
  await notifyGuardChange(guard.id, guard.technicianIds);
  return guard;
}

/**
 * Memory repositories mutate their stored record in place and return that
 * SAME reference (see guard.memory-repository.ts), so `before`'s fields
 * would silently reflect the NEW values if read after the repository call
 * — the snapshot below is taken as a plain copy right after fetching,
 * before any mutating call.
 */
export async function updateGuard(actorId: string, guardId: string, patch: UpdateGuardInput): Promise<Guard> {
  const before = await getGuardById(guardId);
  const beforeSnapshot = { ...before, technicianIds: [...before.technicianIds] };

  const nextStart = patch.startAt ?? before.startAt;
  const nextEnd = patch.endAt ?? before.endAt;
  if (new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
    throw badRequest("endAt must be after startAt");
  }

  if (patch.technicianIds) await assertTechniciansExist(patch.technicianIds);
  if (patch.zoneId) await assertZoneExists(patch.zoneId);

  const updated = await repositories.guard.update(guardId, patch);
  await recordAudit(actorId, "GUARD_UPDATED", "Guard", guardId, beforeSnapshot, {
    ...updated,
    technicianIds: [...updated.technicianIds],
  });

  // Only notify technicians newly added to the crew, so a no-op or partial
  // reassignment doesn't re-spam someone who was already on the guard.
  if (patch.technicianIds) {
    const previousTechnicianIds = new Set(beforeSnapshot.technicianIds);
    const newlyAddedTechnicianIds = patch.technicianIds.filter((id) => !previousTechnicianIds.has(id));
    if (newlyAddedTechnicianIds.length > 0) {
      await notifyGuardChange(guardId, newlyAddedTechnicianIds);
    }
  }
  return updated;
}

/** Backs the frozen `assignGuard` contract op: replaces the guard's crew only. */
export async function assignGuardTechnicians(
  actorId: string,
  guardId: string,
  technicianIds: string[],
): Promise<Guard> {
  return updateGuard(actorId, guardId, { technicianIds });
}
