/** Internal, task-independent guard crews. Members are real names from the operations catalog. */
export type GuardCrewSegment = { startAt: string; endAt: string; technicians: string[] };
export type GuardCrewChange = { id: string; effectiveAt: string; before: string[]; after: string[]; actorId: string; recordedAt: string; reason: string };
export type GuardCrew = {
  id: string; zone: string; startAt: string; endAt: string; initialTechnicians: string[];
  version: number; cancelled: boolean; legacyIds: string[];
  segments: GuardCrewSegment[]; changes: GuardCrewChange[];
};
