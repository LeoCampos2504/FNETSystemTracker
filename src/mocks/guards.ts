import type { Guard, GuardPerformance } from "@/contracts";
import { ExternalSource } from "@/contracts";
import { mockCrews } from "./technicians";
import { MOCK_TODAY, addDaysUtc } from "./constants";

const crewByZone = Object.fromEntries(mockCrews.map((crew) => [crew.zoneId, crew]));

function atUtc(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 8, 0, 0)).toISOString();
}

/**
 * Weekly on-call boundaries. NOA changes on Wednesdays; the rest of the
 * country changes on Fridays. This is a common pattern for the demo data,
 * not a hard business rule — do not encode it as a constraint elsewhere.
 */
const noaBoundaries = [-19, -12, -5, 2, 9];
const fridayBoundaries = [-17, -10, -3, 4, 11];

function buildWeeklyGuards(zoneId: string, boundaries: number[], idPrefix: string): Guard[] {
  const crew = crewByZone[zoneId];
  const guards: Guard[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    guards.push({
      id: `guard-${idPrefix}-${i + 1}`,
      zoneId,
      technicianIds: [crew.primaryId, crew.collaboratorId],
      startAt: atUtc(addDaysUtc(MOCK_TODAY, boundaries[i])),
      endAt: atUtc(addDaysUtc(MOCK_TODAY, boundaries[i + 1])),
      externalId: null,
      externalSource: ExternalSource.INTERNAL,
      sourceUpdatedAt: null,
    });
  }
  return guards;
}

const noaGuards = buildWeeklyGuards("zone-noa", noaBoundaries, "noa");
const neaGuards = buildWeeklyGuards("zone-nea", fridayBoundaries, "nea");
const cuyoGuards = buildWeeklyGuards("zone-cuyo", fridayBoundaries, "cuyo");
const centroGuards = buildWeeklyGuards("zone-centro", fridayBoundaries, "centro");
const patagoniaGuards = buildWeeklyGuards("zone-patagonia", fridayBoundaries, "patagonia");

// Demonstrates a temporary mixed crew: the current Centro guard is covered by
// its usual primary technician plus a technician on loan from NEA, instead of
// the normal daytime pair.
centroGuards[2] = { ...centroGuards[2], technicianIds: ["tech-09", "tech-05"] };

export const mockGuards: Guard[] = [...noaGuards, ...neaGuards, ...cuyoGuards, ...centroGuards, ...patagoniaGuards];

export const mockGuardPerformances: GuardPerformance[] = mockGuards.map((guard, index) => ({
  guardId: guard.id,
  correctivesCompleted: 2 + (index % 3),
  urgentCorrectivesCompleted: index % 4 === 0 ? 1 : 0,
  averageDurationMinutes: 60 + (index % 5) * 10,
}));
