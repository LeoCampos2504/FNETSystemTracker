import type { Coordinates, ExternalSyncFields } from "./common";

export interface Site extends ExternalSyncFields {
  id: string;
  code: string;
  name: string;
  zoneId: string;
  coordinates: Coordinates;
  address: string | null;
}
