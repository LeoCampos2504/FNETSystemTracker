import type { GuardDutyHistoryEntry, GuardDutySegment } from "@/contracts";
import { operationalDateTimeToEpoch } from "./operational-timezone";

export interface GuardChange {
  at: string;
  technicianIds: string[];
  actorUserId: string | null;
  reason?: string | null;
}

export interface GuardValidationResult {
  valid: boolean;
  reason?: string;
}

export const GuardSegmentTemporalStatus = {
  PAST: "PAST",
  CURRENT: "CURRENT",
  FUTURE: "FUTURE",
} as const;
export type GuardSegmentTemporalStatus = (typeof GuardSegmentTemporalStatus)[keyof typeof GuardSegmentTemporalStatus];

function epoch(value: string | Date): number {
  return operationalDateTimeToEpoch(value);
}

export function validateGuardTechnicians(technicianIds: readonly string[]): GuardValidationResult {
  if (technicianIds.length !== 2) return { valid: false, reason: "Una guardia requiere exactamente dos técnicos." };
  if (technicianIds[0] === technicianIds[1]) return { valid: false, reason: "El técnico principal y el colaborador deben ser distintos." };
  return { valid: true };
}

export function validateGuardWindow(startAt: string, endAt: string): GuardValidationResult {
  const start = epoch(startAt);
  const end = epoch(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { valid: false, reason: "Las fechas de guardia deben ser ISO válidas." };
  if (end <= start) return { valid: false, reason: "El fin de guardia debe ser posterior al inicio." };
  return { valid: true };
}

function assertValidChange(change: GuardChange, startAt: string, endAt: string): void {
  const changeAt = epoch(change.at);
  if (!Number.isFinite(changeAt)) throw new Error("El timestamp efectivo debe ser ISO válido.");
  if (changeAt <= epoch(startAt) || changeAt >= epoch(endAt)) throw new Error("El cambio debe quedar estrictamente dentro del período de guardia.");
  const validation = validateGuardTechnicians(change.technicianIds);
  if (!validation.valid) throw new Error(validation.reason);
}

/** Builds immutable effective segments and their audit history. */
export function buildGuardSegments(
  guardDutyId: string,
  startAt: string,
  endAt: string,
  initialTechnicianIds: readonly string[] | readonly GuardChange[],
  changes: readonly GuardChange[] = [],
): { segments: GuardDutySegment[]; history: GuardDutyHistoryEntry[] } {
  const windowValidation = validateGuardWindow(startAt, endAt);
  if (!windowValidation.valid) throw new Error(windowValidation.reason);
  const legacyChanges = initialTechnicianIds.length > 0 && typeof initialTechnicianIds[0] !== "string";
  const initial = legacyChanges ? (initialTechnicianIds as readonly GuardChange[])[0]?.technicianIds ?? [] : [...initialTechnicianIds as readonly string[]];
  const effectiveChanges = legacyChanges
    ? [...initialTechnicianIds as readonly GuardChange[]].filter((change) => epoch(change.at) > epoch(startAt))
    : [...changes];
  const initialValidation = validateGuardTechnicians(initial);
  if (!initialValidation.valid) throw new Error(initialValidation.reason);
  const ordered = effectiveChanges.sort((a, b) => epoch(a.at) - epoch(b.at));
  for (let index = 0; index < ordered.length; index += 1) {
    assertValidChange(ordered[index], startAt, endAt);
    if (index > 0 && epoch(ordered[index - 1].at) === epoch(ordered[index].at)) throw new Error("No puede haber dos cambios efectivos en el mismo instante; el histórico es inmutable.");
  }
  const segments: GuardDutySegment[] = [];
  const history: GuardDutyHistoryEntry[] = [];
  let currentStart = startAt;
  let currentMembers = [...initial];
  ordered.forEach((change, index) => {
    segments.push({ id: `${guardDutyId}-segment-${index + 1}`, guardDutyId, startAt: currentStart, endAt: change.at, technicianIds: [...currentMembers], source: "INTERNAL" });
    history.push({ id: `${guardDutyId}-history-${index + 1}`, guardDutyId, changedAt: change.at, actorUserId: change.actorUserId, beforeTechnicianIds: [...currentMembers], afterTechnicianIds: [...change.technicianIds], reason: change.reason ?? "Cambio operativo de guardia" });
    currentStart = change.at;
    currentMembers = [...change.technicianIds];
  });
  segments.push({ id: `${guardDutyId}-segment-${ordered.length + 1}`, guardDutyId, startAt: currentStart, endAt, technicianIds: [...currentMembers], source: "INTERNAL" });
  return { segments, history };
}

export function getGuardAt(dateTime: string | Date, segments: readonly GuardDutySegment[]): GuardDutySegment | null {
  const value = epoch(dateTime);
  if (!Number.isFinite(value)) return null;
  return segments.find((segment) => value >= epoch(segment.startAt) && value < epoch(segment.endAt)) ?? null;
}

export function hasOverlappingGuardSegments(segments: readonly GuardDutySegment[]): boolean {
  const ordered = [...segments].sort((a, b) => epoch(a.startAt) - epoch(b.startAt));
  return ordered.some((segment, index) => index > 0 && epoch(segment.startAt) < epoch(ordered[index - 1].endAt));
}

export function getGuardSegmentTemporalStatus(segment: GuardDutySegment, evaluatedAt: string | Date): GuardSegmentTemporalStatus {
  const evaluatedEpoch = epoch(evaluatedAt);
  if (evaluatedEpoch >= epoch(segment.endAt)) return GuardSegmentTemporalStatus.PAST;
  if (evaluatedEpoch >= epoch(segment.startAt)) return GuardSegmentTemporalStatus.CURRENT;
  return GuardSegmentTemporalStatus.FUTURE;
}
