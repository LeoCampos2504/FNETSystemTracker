import type { Site, Technician, Zone } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";
import { notFound } from "@/server/http/errors";

export interface CoordinationService {
  getCoordinatorZones(coordinatorId: string): Promise<Zone[]>;
  getZoneTechnicians(zoneId: string): Promise<Technician[]>;
  getZoneSites(zoneId: string): Promise<Site[]>;
}

type CoordinationRepositories = Pick<BackendRepositories, "zone" | "technician">;

/** Pure factory: depends only on the `zone`/`technician` ports. */
export function createCoordinationService(repositories: CoordinationRepositories): CoordinationService {
  return {
    async getCoordinatorZones(coordinatorId) {
      return repositories.zone.listByCoordinator(coordinatorId);
    },

    async getZoneTechnicians(zoneId) {
      const zone = await repositories.zone.findById(zoneId);
      if (!zone) throw notFound(`Zone not found: ${zoneId}`);
      return repositories.technician.listByZone(zoneId);
    },

    async getZoneSites(zoneId) {
      const zone = await repositories.zone.findById(zoneId);
      if (!zone) throw notFound(`Zone not found: ${zoneId}`);
      return repositories.zone.listSites(zoneId);
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — preserves today's call sites (flat function imports) untouched.
const defaultCoordinationService = createCoordinationService(defaultRepositories);
export const { getCoordinatorZones, getZoneTechnicians, getZoneSites } = defaultCoordinationService;
