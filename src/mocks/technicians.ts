import type { Technician } from "@/contracts";
import { ExternalSource } from "@/contracts";

interface TechnicianSeed {
  id: string;
  name: string;
  primaryZoneId: string;
  onLoanZoneId?: string;
}

const seeds: TechnicianSeed[] = [
  { id: "tech-01", name: "Bruno Alvarez", primaryZoneId: "zone-noa" },
  { id: "tech-02", name: "Carla Sosa", primaryZoneId: "zone-noa" },
  { id: "tech-03", name: "Diego Molina", primaryZoneId: "zone-noa" },
  { id: "tech-04", name: "Elena Paz", primaryZoneId: "zone-nea" },
  { id: "tech-05", name: "Franco Rios", primaryZoneId: "zone-nea", onLoanZoneId: "zone-centro" },
  { id: "tech-06", name: "Gaston Lopez", primaryZoneId: "zone-cuyo" },
  { id: "tech-07", name: "Hugo Vera", primaryZoneId: "zone-cuyo" },
  { id: "tech-08", name: "Ivan Cabrera", primaryZoneId: "zone-cuyo" },
  { id: "tech-09", name: "Julieta Nunez", primaryZoneId: "zone-centro" },
  { id: "tech-10", name: "Kevin Acosta", primaryZoneId: "zone-centro" },
  { id: "tech-11", name: "Lucia Herrera", primaryZoneId: "zone-centro", onLoanZoneId: "zone-cuyo" },
  { id: "tech-12", name: "Mauro Godoy", primaryZoneId: "zone-patagonia" },
  { id: "tech-13", name: "Natalia Suarez", primaryZoneId: "zone-patagonia" },
  { id: "tech-14", name: "Oscar Ledesma", primaryZoneId: "zone-patagonia" },
];

export const mockTechnicians: Technician[] = seeds.map((seed) => ({
  id: seed.id,
  userId: `user-${seed.id}`,
  name: seed.name,
  primaryZoneId: seed.primaryZoneId,
  onLoanZoneId: seed.onLoanZoneId ?? null,
  phone: `+54 9 11 ${seed.id.slice(-2)}00-0000`,
  active: true,
  externalId: `BF-TECH-${seed.id.slice(-2)}`,
  externalSource: ExternalSource.BIZFLOW,
  sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
}));

/**
 * Fixed two-person crews used to build tasks/guards consistently.
 * `floaterId` covers the "exceptionally a single technician" case.
 */
export const mockCrews: { zoneId: string; primaryId: string; collaboratorId: string; floaterId?: string }[] = [
  { zoneId: "zone-noa", primaryId: "tech-01", collaboratorId: "tech-02", floaterId: "tech-03" },
  { zoneId: "zone-nea", primaryId: "tech-04", collaboratorId: "tech-05" },
  { zoneId: "zone-cuyo", primaryId: "tech-06", collaboratorId: "tech-07", floaterId: "tech-08" },
  { zoneId: "zone-centro", primaryId: "tech-09", collaboratorId: "tech-10", floaterId: "tech-11" },
  { zoneId: "zone-patagonia", primaryId: "tech-12", collaboratorId: "tech-13", floaterId: "tech-14" },
];
