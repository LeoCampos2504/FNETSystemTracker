import type { ExternalSyncFields } from "./common";

export interface Zone extends ExternalSyncFields {
  id: string;
  name: string;
  code: string;
  /** Coordinators responsible for this zone. A zone may have more than one. */
  coordinatorIds: string[];
}
