import type { Site } from "@/contracts";
import { ExternalSource } from "@/contracts";

interface ZoneBase {
  zoneId: string;
  prefix: string;
  baseLat: number;
  baseLng: number;
  cityLabel: string;
}

const zoneBases: ZoneBase[] = [
  { zoneId: "zone-noa", prefix: "NOA", baseLat: -24.7821, baseLng: -65.4232, cityLabel: "Salta" },
  { zoneId: "zone-nea", prefix: "NEA", baseLat: -27.4692, baseLng: -58.8306, cityLabel: "Corrientes" },
  { zoneId: "zone-cuyo", prefix: "CUYO", baseLat: -32.8895, baseLng: -68.8458, cityLabel: "Mendoza" },
  { zoneId: "zone-centro", prefix: "CTR", baseLat: -31.4201, baseLng: -64.1888, cityLabel: "Cordoba" },
  { zoneId: "zone-patagonia", prefix: "PAT", baseLat: -38.9516, baseLng: -68.0591, cityLabel: "Neuquen" },
];

// Small deterministic offsets (degrees) applied per site index within a zone.
const offsets: [number, number][] = [
  [0, 0],
  [0.03, -0.02],
  [-0.04, 0.05],
  [0.06, 0.04],
];

export const mockSites: Site[] = zoneBases.flatMap((zone) =>
  offsets.map(([latOffset, lngOffset], index) => {
    const siteNumber = index + 1;
    const code = `${zone.prefix}-${String(siteNumber).padStart(3, "0")}`;
    return {
      id: `site-${zone.zoneId}-${siteNumber}`,
      code,
      name: `${zone.cityLabel} - Sitio ${siteNumber}`,
      zoneId: zone.zoneId,
      coordinates: {
        latitude: Number((zone.baseLat + latOffset).toFixed(4)),
        longitude: Number((zone.baseLng + lngOffset).toFixed(4)),
      },
      address: `Av. Demo ${100 + siteNumber * 10}, ${zone.cityLabel}`,
      externalId: `SYTEX-SITE-${code}`,
      externalSource: ExternalSource.SYTEX,
      sourceUpdatedAt: "2026-08-01T09:00:00.000Z",
    };
  }),
);
