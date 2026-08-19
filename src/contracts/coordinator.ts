import type { ExternalSyncFields } from "./common";

export interface Coordinator extends ExternalSyncFields {
  id: string;
  userId: string | null;
  name: string;
  /** A coordinator may administer more than one zone. */
  zoneIds: string[];
}
