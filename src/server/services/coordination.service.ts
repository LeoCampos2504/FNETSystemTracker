import type { Site, Technician, Zone } from "@/contracts";
import { repositories } from "@/server/container";
import { notFound } from "@/server/http/errors";

export async function getCoordinatorZones(coordinatorId: string): Promise<Zone[]> {
  return repositories.zone.listByCoordinator(coordinatorId);
}

export async function getZoneTechnicians(zoneId: string): Promise<Technician[]> {
  const zone = await repositories.zone.findById(zoneId);
  if (!zone) throw notFound(`Zone not found: ${zoneId}`);
  return repositories.technician.listByZone(zoneId);
}

export async function getZoneSites(zoneId: string): Promise<Site[]> {
  const zone = await repositories.zone.findById(zoneId);
  if (!zone) throw notFound(`Zone not found: ${zoneId}`);
  return repositories.zone.listSites(zoneId);
}
