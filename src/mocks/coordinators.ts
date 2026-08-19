import type { Coordinator } from "@/contracts";
import { ExternalSource } from "@/contracts";

export const mockCoordinators: Coordinator[] = [
  {
    id: "coord-1",
    userId: "user-coord-1",
    name: "Ana Gimenez",
    zoneIds: ["zone-noa", "zone-nea"],
    externalId: "BF-COORD-001",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "coord-2",
    userId: "user-coord-2",
    name: "Marcos Diaz",
    zoneIds: ["zone-cuyo", "zone-centro"],
    externalId: "BF-COORD-002",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "coord-3",
    userId: "user-coord-3",
    name: "Julia Fernandez",
    zoneIds: ["zone-centro", "zone-patagonia"],
    externalId: "BF-COORD-003",
    externalSource: ExternalSource.BIZFLOW,
    sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
  },
];
