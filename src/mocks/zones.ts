import type { Zone } from "@/contracts";
import { ExternalSource } from "@/contracts";

export const mockZones: Zone[] = [
  {
    id: "zone-noa",
    name: "NOA",
    code: "NOA",
    coordinatorIds: ["coord-1"],
    externalId: "BF-ZONE-NOA",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "zone-nea",
    name: "NEA",
    code: "NEA",
    coordinatorIds: ["coord-1"],
    externalId: "BF-ZONE-NEA",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "zone-cuyo",
    name: "Cuyo",
    code: "CUYO",
    coordinatorIds: ["coord-2"],
    externalId: "BF-ZONE-CUYO",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "zone-centro",
    name: "Centro",
    code: "CENTRO",
    coordinatorIds: ["coord-2", "coord-3"],
    externalId: "BF-ZONE-CENTRO",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "zone-patagonia",
    name: "Patagonia",
    code: "PAT",
    coordinatorIds: ["coord-3"],
    externalId: "BF-ZONE-PAT",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
];
