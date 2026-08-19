import type { Coordinates } from "@/contracts";

/** Builds a Google Maps link from site coordinates. Prototype-only routing aid; no optimization. */
export function buildGoogleMapsUrl({ latitude, longitude }: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
