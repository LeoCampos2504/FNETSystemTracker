import type { ExternalSyncFields } from "./common";
import type { QuoteStatus } from "./enums";

export interface Quote extends ExternalSyncFields {
  id: string;
  code: string;
  /** Ownership is derived primarily via zone (and project, when present). */
  zoneId: string;
  projectId: string | null;
  status: QuoteStatus;
  createdAt: string;
  updatedAt: string;
}
