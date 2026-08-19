import type { ExternalSyncFields } from "./common";

export interface Technician extends ExternalSyncFields {
  id: string;
  userId: string | null;
  name: string;
  /** Zone the technician normally belongs to. */
  primaryZoneId: string;
  /** Set when temporarily loaned to another zone. */
  onLoanZoneId: string | null;
  phone: string | null;
  active: boolean;
}
