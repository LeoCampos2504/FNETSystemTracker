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

export async function getGuardPerformance(guardId: string): Promise<GuardPerformance | null> {
  await getGuardById(guardId); // 404 if the guard itself doesn't exist
  return repositories.guard.getPerformance(guardId);
}

export async function createGuard(actorId: string, input: CreateGuardInput): Promise<Guard> {
  const guard = await repositories.guard.create(input);
  await recordAudit(actorId, "GUARD_CREATED", "Guard", guard.id, null, { ...guard });
  await notifyGuardChange(guard.id, guard.technicianIds);
  return guard;
}

export async function updateGuard(actorId: string, guardId: string, patch: UpdateGuardInput): Promise<Guard> {
  const before = await getGuardById(guardId);

  const nextStart = patch.startAt ?? before.startAt;
  const nextEnd = patch.endAt ?? before.endAt;
  if (new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
    throw badRequest("endAt must be after startAt");
  }

  const updated = await repositories.guard.update(guardId, patch);
  await recordAudit(actorId, "GUARD_UPDATED", "Guard", guardId, { ...before }, { ...updated });

  if (patch.technicianIds) {
    await notifyGuardChange(guardId, patch.technicianIds);
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
