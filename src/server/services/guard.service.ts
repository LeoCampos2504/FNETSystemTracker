import type { Guard, GuardPerformance } from "@/contracts";
import type { BackendRepositories, CreateGuardInput, UpdateGuardInput } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";
import { badRequest, notFound } from "@/server/http/errors";
import { createAuditService, type AuditService } from "./audit.service";
import { createNotificationService, type NotificationService } from "./notification.service";

function dedupeById(guards: Guard[]): Guard[] {
  const byId = new Map(guards.map((g) => [g.id, g]));
  return [...byId.values()];
}

export interface GuardListFilter {
  technicianId?: string;
  zoneIds?: string[];
}

export interface GuardService {
  listGuards(filter: GuardListFilter): Promise<Guard[]>;
  getGuardById(guardId: string): Promise<Guard>;
  findGuardById(guardId: string): Promise<Guard | null>;
  getGuardPerformance(guardId: string): Promise<GuardPerformance | null>;
  createGuard(actorId: string, input: CreateGuardInput): Promise<Guard>;
  updateGuard(actorId: string, guardId: string, patch: UpdateGuardInput): Promise<Guard>;
  assignGuardTechnicians(actorId: string, guardId: string, technicianIds: string[]): Promise<Guard>;
}

type GuardServiceRepositories = Pick<BackendRepositories, "guard" | "technician" | "zone">;
type GuardServiceDeps = Pick<AuditService, "recordAudit"> & Pick<NotificationService, "notifyGuardChange">;

/**
 * Pure factory: depends only on the `guard`/`technician`/`zone` ports plus
 * the audit and notification capabilities it needs (injected).
 *
 * Memory repositories mutate their stored record in place and return that
 * SAME reference (see guard.memory-repository.ts), so `before`'s fields
 * would silently reflect the NEW values if read after the repository call
 * — snapshots are taken as plain copies right after fetching, before any
 * mutating call.
 */
export function createGuardService(repositories: GuardServiceRepositories, deps: GuardServiceDeps): GuardService {
  async function getGuardById(guardId: string): Promise<Guard> {
    const guard = await repositories.guard.findById(guardId);
    if (!guard) throw notFound(`Guard not found: ${guardId}`);
    return guard;
  }

  async function findGuardById(guardId: string): Promise<Guard | null> {
    return repositories.guard.findById(guardId);
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

  async function updateGuard(actorId: string, guardId: string, patch: UpdateGuardInput): Promise<Guard> {
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
    await deps.recordAudit(actorId, "GUARD_UPDATED", "Guard", guardId, beforeSnapshot, {
      ...updated,
      technicianIds: [...updated.technicianIds],
    });

    // Only notify technicians newly added to the crew, so a no-op or
    // partial reassignment doesn't re-spam someone who was already there.
    if (patch.technicianIds) {
      const previousTechnicianIds = new Set(beforeSnapshot.technicianIds);
      const newlyAddedTechnicianIds = patch.technicianIds.filter((id) => !previousTechnicianIds.has(id));
      if (newlyAddedTechnicianIds.length > 0) {
        await deps.notifyGuardChange(guardId, newlyAddedTechnicianIds);
      }
    }
    return updated;
  }

  return {
    async listGuards(filter) {
      if (!filter.zoneIds || filter.zoneIds.length === 0) {
        return repositories.guard.list({ technicianId: filter.technicianId });
      }
      const perZone = await Promise.all(
        filter.zoneIds.map((zoneId) => repositories.guard.list({ technicianId: filter.technicianId, zoneId })),
      );
      return dedupeById(perZone.flat());
    },

    getGuardById,
    findGuardById,

    /**
     * Non-throwing counterpart for `Api.getGuardPerformance(): Promise<GuardPerformance | null>`
     * — that contract op must resolve null (not throw) when the guard
     * itself doesn't exist.
     */
    async getGuardPerformance(guardId) {
      const guard = await findGuardById(guardId);
      if (!guard) return null;
      return repositories.guard.getPerformance(guardId);
    },

    async createGuard(actorId, input) {
      await assertTechniciansExist(input.technicianIds);
      await assertZoneExists(input.zoneId);

      const guard = await repositories.guard.create(input);
      await deps.recordAudit(actorId, "GUARD_CREATED", "Guard", guard.id, null, {
        ...guard,
        technicianIds: [...guard.technicianIds],
      });
      await deps.notifyGuardChange(guard.id, guard.technicianIds);
      return guard;
    },

    updateGuard,

    /** Backs the frozen `assignGuard` contract op: replaces the guard's crew only. */
    async assignGuardTechnicians(actorId, guardId, technicianIds) {
      return updateGuard(actorId, guardId, { technicianIds });
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// and its own default audit/notification services — preserves today's call
// sites (flat function imports) untouched.
const defaultAuditService = createAuditService(defaultRepositories);
const defaultNotificationService = createNotificationService(defaultRepositories);
const defaultGuardService = createGuardService(defaultRepositories, {
  recordAudit: defaultAuditService.recordAudit,
  notifyGuardChange: defaultNotificationService.notifyGuardChange,
});
export const { listGuards, getGuardById, findGuardById, getGuardPerformance, createGuard, updateGuard, assignGuardTechnicians } =
  defaultGuardService;
