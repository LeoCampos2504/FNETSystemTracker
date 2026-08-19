import type { ExternalSource } from "./enums";

/**
 * All dates/times in contracts are ISO-8601 strings (UTC) so they cross the
 * mock-api/http-api boundary and JSON serialization without transformation.
 */
export type ISODateTimeString = string;
export type ISODateString = string;

/**
 * Fields carried by any entity that may originate in, or later sync from,
 * an external system (Sytex, BizFlow, MaxTracker). For prototype/internal
 * records, externalSource is INTERNAL and externalId/sourceUpdatedAt are null.
 */
export interface ExternalSyncFields {
  externalId: string | null;
  externalSource: ExternalSource;
  sourceUpdatedAt: ISODateTimeString | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
