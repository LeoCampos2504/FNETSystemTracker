import type { Task, TaskAssignment, TaskRejection } from "@/contracts";
import { CrewRole, ExternalSource, TaskCriticality, TaskStatus, TaskType } from "@/contracts";
import { mockCrews } from "./technicians";
import { mockSites } from "./sites";
import { MOCK_TODAY, addDaysUtc, toDateString } from "./constants";

const ZONE_IDS = ["zone-noa", "zone-nea", "zone-cuyo", "zone-centro", "zone-patagonia"] as const;
type ZoneId = (typeof ZONE_IDS)[number];

const sitesByZone: Record<ZoneId, typeof mockSites> = Object.fromEntries(
  ZONE_IDS.map((zoneId) => [zoneId, mockSites.filter((s) => s.zoneId === zoneId)]),
) as Record<ZoneId, typeof mockSites>;

const crewByZone: Record<ZoneId, (typeof mockCrews)[number]> = Object.fromEntries(
  mockCrews.map((crew) => [crew.zoneId, crew]),
) as Record<ZoneId, (typeof mockCrews)[number]>;

type AssignMode = "pair" | "floaterSolo";

function buildAssignments(zoneId: ZoneId, mode: AssignMode): TaskAssignment[] {
  const crew = crewByZone[zoneId];
  if (mode === "floaterSolo" && crew.floaterId) {
    return [{ technicianId: crew.floaterId, crewRole: CrewRole.PRIMARY }];
  }
  return [
    { technicianId: crew.primaryId, crewRole: CrewRole.PRIMARY },
    { technicianId: crew.collaboratorId, crewRole: CrewRole.COLLABORATOR },
  ];
}

interface TaskSpec {
  idSuffix: string;
  type: (typeof TaskType)[keyof typeof TaskType];
  zoneId: ZoneId;
  siteIdx: number;
  dayOffset: number;
  plannedHour: number;
  status: (typeof TaskStatus)[keyof typeof TaskStatus];
  criticality: (typeof TaskCriticality)[keyof typeof TaskCriticality];
  priority: string;
  assignMode: AssignMode;
  durationMin?: number;
  rejectionsCount?: number;
}

const WORKED_STATUSES = new Set<TaskSpec["status"]>([
  TaskStatus.IN_REVIEW,
  TaskStatus.SENT,
  TaskStatus.REJECTED,
  TaskStatus.APPROVED_WITH_PENDING,
  TaskStatus.APPROVED,
]);

function buildTask(spec: TaskSpec): Task {
  const site = sitesByZone[spec.zoneId][spec.siteIdx];
  const scheduledDateObj = addDaysUtc(MOCK_TODAY, spec.dayOffset);
  const scheduledDate = toDateString(scheduledDateObj);
  const scheduledAt = new Date(`${scheduledDate}T${String(spec.plannedHour).padStart(2, "0")}:00:00.000Z`).toISOString();

  const worked = WORKED_STATUSES.has(spec.status) || spec.status === TaskStatus.IN_PROGRESS;
  const completedDuration = spec.durationMin ?? 60;
  const arrivalAt = worked ? scheduledAt : null;
  const departureAt =
    worked && spec.status !== TaskStatus.IN_PROGRESS
      ? new Date(new Date(scheduledAt).getTime() + completedDuration * 60_000).toISOString()
      : null;

  const rejections: TaskRejection[] = Array.from({ length: spec.rejectionsCount ?? 0 }).map((_, i) => ({
    id: `rej-${spec.idSuffix}-${i + 1}`,
    taskId: `task-${spec.idSuffix}`,
    rejectedAt: new Date(new Date(scheduledAt).getTime() - (spec.rejectionsCount! - i) * 3 * 86_400_000).toISOString(),
    reason: i === 0 ? "Documentacion fotografica incompleta" : "Falta firma de conformidad del sitio",
  }));

  const prefix = spec.type === TaskType.PREVENTIVE ? "PM" : "CM";
  const zonePrefix = spec.zoneId.replace("zone-", "").toUpperCase();

  return {
    id: `task-${spec.idSuffix}`,
    taskCode: `${prefix}-${zonePrefix}-${spec.idSuffix}`,
    formCode: spec.status === TaskStatus.OPEN ? null : `FORM-${spec.idSuffix}`,
    type: spec.type,
    description:
      spec.type === TaskType.PREVENTIVE
        ? `Mantenimiento preventivo mensual - ${site.name}`
        : `Atencion correctivo - ${site.name}`,
    priority: spec.priority,
    criticality: spec.criticality,
    status: spec.status,
    scheduledDate,
    scheduledAt,
    siteId: site.id,
    siteCode: site.code,
    zoneId: spec.zoneId,
    coordinates: site.coordinates,
    assignments: buildAssignments(spec.zoneId, spec.assignMode),
    arrivalAt,
    departureAt,
    rejections,
    externalId: `SYTEX-TASK-${spec.idSuffix}`,
    externalSource: ExternalSource.SYTEX,
    sourceUpdatedAt: scheduledAt,
  };
}

// ---------------------------------------------------------------------------
// PREVENTIVE (32 total): today (6), upcoming (10), past-pending (6), historical (10)
// ---------------------------------------------------------------------------

const preventiveToday: TaskSpec[] = [
  { idSuffix: "P0001", type: TaskType.PREVENTIVE, zoneId: "zone-noa", siteIdx: 0, dayOffset: 0, plannedHour: 9, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0002", type: TaskType.PREVENTIVE, zoneId: "zone-nea", siteIdx: 0, dayOffset: 0, plannedHour: 10, status: TaskStatus.IN_PROGRESS, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0003", type: TaskType.PREVENTIVE, zoneId: "zone-cuyo", siteIdx: 0, dayOffset: 0, plannedHour: 9, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "pair" },
  { idSuffix: "P0004", type: TaskType.PREVENTIVE, zoneId: "zone-centro", siteIdx: 0, dayOffset: 0, plannedHour: 11, status: TaskStatus.IN_PROGRESS, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0005", type: TaskType.PREVENTIVE, zoneId: "zone-patagonia", siteIdx: 0, dayOffset: 0, plannedHour: 9, status: TaskStatus.IN_REVIEW, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0006", type: TaskType.PREVENTIVE, zoneId: "zone-noa", siteIdx: 1, dayOffset: 0, plannedHour: 8, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "floaterSolo", durationMin: 45 },
];

const preventiveUpcomingZones: ZoneId[] = ["zone-noa", "zone-nea", "zone-cuyo", "zone-centro", "zone-patagonia", "zone-noa", "zone-nea", "zone-cuyo", "zone-centro", "zone-patagonia"];
const preventiveUpcoming: TaskSpec[] = preventiveUpcomingZones.map((zoneId, i) => ({
  idSuffix: `P01${String(i + 1).padStart(2, "0")}`,
  type: TaskType.PREVENTIVE,
  zoneId,
  siteIdx: (i % 3) + 1,
  dayOffset: i + 1,
  plannedHour: 9 + (i % 3),
  status: TaskStatus.OPEN,
  criticality: TaskCriticality.NORMAL,
  priority: i % 2 === 0 ? "MEDIA" : "BAJA",
  assignMode: "pair",
}));

const preventivePastPending: TaskSpec[] = [
  { idSuffix: "P0201", type: TaskType.PREVENTIVE, zoneId: "zone-noa", siteIdx: 2, dayOffset: -1, plannedHour: 9, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0202", type: TaskType.PREVENTIVE, zoneId: "zone-nea", siteIdx: 1, dayOffset: -2, plannedHour: 9, status: TaskStatus.IN_REVIEW, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0203", type: TaskType.PREVENTIVE, zoneId: "zone-cuyo", siteIdx: 2, dayOffset: -3, plannedHour: 10, status: TaskStatus.REJECTED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", rejectionsCount: 1 },
  { idSuffix: "P0204", type: TaskType.PREVENTIVE, zoneId: "zone-centro", siteIdx: 1, dayOffset: -4, plannedHour: 9, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "pair" },
  { idSuffix: "P0205", type: TaskType.PREVENTIVE, zoneId: "zone-patagonia", siteIdx: 1, dayOffset: -5, plannedHour: 9, status: TaskStatus.SENT, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "P0206", type: TaskType.PREVENTIVE, zoneId: "zone-noa", siteIdx: 2, dayOffset: -6, plannedHour: 9, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "pair" },
];

const preventiveHistorical: TaskSpec[] = [
  { idSuffix: "P0301", type: TaskType.PREVENTIVE, zoneId: "zone-noa", siteIdx: 3, dayOffset: -10, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 55 },
  { idSuffix: "P0302", type: TaskType.PREVENTIVE, zoneId: "zone-nea", siteIdx: 2, dayOffset: -14, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 70 },
  { idSuffix: "P0303", type: TaskType.PREVENTIVE, zoneId: "zone-cuyo", siteIdx: 3, dayOffset: -15, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 65, rejectionsCount: 2 },
  { idSuffix: "P0304", type: TaskType.PREVENTIVE, zoneId: "zone-centro", siteIdx: 2, dayOffset: -18, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "pair", durationMin: 50 },
  { idSuffix: "P0305", type: TaskType.PREVENTIVE, zoneId: "zone-centro", siteIdx: 3, dayOffset: -20, plannedHour: 9, status: TaskStatus.APPROVED_WITH_PENDING, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 80, rejectionsCount: 1 },
  { idSuffix: "P0306", type: TaskType.PREVENTIVE, zoneId: "zone-patagonia", siteIdx: 2, dayOffset: -21, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 60 },
  { idSuffix: "P0307", type: TaskType.PREVENTIVE, zoneId: "zone-noa", siteIdx: 0, dayOffset: -25, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "pair", durationMin: 40 },
  { idSuffix: "P0308", type: TaskType.PREVENTIVE, zoneId: "zone-nea", siteIdx: 0, dayOffset: -28, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 90 },
  { idSuffix: "P0309", type: TaskType.PREVENTIVE, zoneId: "zone-cuyo", siteIdx: 0, dayOffset: -32, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 55 },
  { idSuffix: "P0310", type: TaskType.PREVENTIVE, zoneId: "zone-patagonia", siteIdx: 3, dayOffset: -36, plannedHour: 9, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "BAJA", assignMode: "pair", durationMin: 45 },
];

// ---------------------------------------------------------------------------
// CORRECTIVE (18 total): today urgent (3), today normal (3), recent pending (4), historical (8)
// ---------------------------------------------------------------------------

const correctiveTodayUrgent: TaskSpec[] = [
  { idSuffix: "C0001", type: TaskType.CORRECTIVE, zoneId: "zone-noa", siteIdx: 1, dayOffset: 0, plannedHour: 8, status: TaskStatus.IN_PROGRESS, criticality: TaskCriticality.URGENT, priority: "ALTA", assignMode: "pair" },
  { idSuffix: "C0002", type: TaskType.CORRECTIVE, zoneId: "zone-cuyo", siteIdx: 1, dayOffset: 0, plannedHour: 8, status: TaskStatus.OPEN, criticality: TaskCriticality.URGENT, priority: "ALTA", assignMode: "pair" },
  { idSuffix: "C0003", type: TaskType.CORRECTIVE, zoneId: "zone-patagonia", siteIdx: 1, dayOffset: 0, plannedHour: 8, status: TaskStatus.OPEN, criticality: TaskCriticality.URGENT, priority: "ALTA", assignMode: "pair" },
];

const correctiveTodayNormal: TaskSpec[] = [
  { idSuffix: "C0004", type: TaskType.CORRECTIVE, zoneId: "zone-nea", siteIdx: 2, dayOffset: 0, plannedHour: 13, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "C0005", type: TaskType.CORRECTIVE, zoneId: "zone-centro", siteIdx: 2, dayOffset: 0, plannedHour: 13, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "C0006", type: TaskType.CORRECTIVE, zoneId: "zone-noa", siteIdx: 3, dayOffset: 0, plannedHour: 14, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "floaterSolo" },
];

const correctivePastPending: TaskSpec[] = [
  { idSuffix: "C0101", type: TaskType.CORRECTIVE, zoneId: "zone-nea", siteIdx: 3, dayOffset: -1, plannedHour: 10, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "C0102", type: TaskType.CORRECTIVE, zoneId: "zone-cuyo", siteIdx: 3, dayOffset: -2, plannedHour: 10, status: TaskStatus.REJECTED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", rejectionsCount: 1 },
  { idSuffix: "C0103", type: TaskType.CORRECTIVE, zoneId: "zone-centro", siteIdx: 3, dayOffset: -3, plannedHour: 10, status: TaskStatus.OPEN, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
  { idSuffix: "C0104", type: TaskType.CORRECTIVE, zoneId: "zone-patagonia", siteIdx: 3, dayOffset: -4, plannedHour: 10, status: TaskStatus.IN_REVIEW, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair" },
];

const correctiveHistorical: TaskSpec[] = [
  { idSuffix: "C0201", type: TaskType.CORRECTIVE, zoneId: "zone-noa", siteIdx: 0, dayOffset: -5, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 90 },
  { idSuffix: "C0202", type: TaskType.CORRECTIVE, zoneId: "zone-nea", siteIdx: 1, dayOffset: -7, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 120 },
  { idSuffix: "C0203", type: TaskType.CORRECTIVE, zoneId: "zone-cuyo", siteIdx: 2, dayOffset: -9, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 75 },
  { idSuffix: "C0204", type: TaskType.CORRECTIVE, zoneId: "zone-centro", siteIdx: 0, dayOffset: -12, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.URGENT, priority: "ALTA", assignMode: "pair", durationMin: 100, rejectionsCount: 2 },
  { idSuffix: "C0205", type: TaskType.CORRECTIVE, zoneId: "zone-patagonia", siteIdx: 0, dayOffset: -16, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 60 },
  { idSuffix: "C0206", type: TaskType.CORRECTIVE, zoneId: "zone-noa", siteIdx: 3, dayOffset: -19, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 85 },
  { idSuffix: "C0207", type: TaskType.CORRECTIVE, zoneId: "zone-patagonia", siteIdx: 2, dayOffset: -22, plannedHour: 10, status: TaskStatus.APPROVED_WITH_PENDING, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 95, rejectionsCount: 1 },
  { idSuffix: "C0208", type: TaskType.CORRECTIVE, zoneId: "zone-cuyo", siteIdx: 1, dayOffset: -30, plannedHour: 10, status: TaskStatus.APPROVED, criticality: TaskCriticality.NORMAL, priority: "MEDIA", assignMode: "pair", durationMin: 110 },
];

export const mockTasks: Task[] = [
  ...preventiveToday,
  ...preventiveUpcoming,
  ...preventivePastPending,
  ...preventiveHistorical,
  ...correctiveTodayUrgent,
  ...correctiveTodayNormal,
  ...correctivePastPending,
  ...correctiveHistorical,
].map(buildTask);
