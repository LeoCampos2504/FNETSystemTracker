import type { Site, Zone } from "@/contracts";

export interface ZoneRepository {
  findById(id: string): Promise<Zone | null>;
  listByCoordinator(coordinatorId: string): Promise<Zone[]>;
  listSites(zoneId: string): Promise<Site[]>;
}
