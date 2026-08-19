import { z } from "zod";

const CREW_ROLES = ["PRIMARY", "COLLABORATOR"] as const;
const TASK_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "IN_REVIEW",
  "SENT",
  "REJECTED",
  "APPROVED_WITH_PENDING",
  "APPROVED",
] as const;

/**
 * YYYY-MM-DD that is also a real calendar date — the regex alone accepts
 * nonsense like "2026-13-40". Round-tripping through Date and comparing the
 * ISO date back to the input catches month/day overflow (Date otherwise
 * silently rolls those over into the next month/year instead of rejecting).
 */
function dateOnlyString(label: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, `${label} must be a valid calendar date`);
}

export const taskDayQuerySchema = z.object({
  technicianId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  date: dateOnlyString("date").optional(),
});

export const pendingTaskQuerySchema = z.object({
  technicianId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  asOfDate: dateOnlyString("asOfDate").optional(),
});

const taskAssignmentSchema = z.object({
  technicianId: z.string().min(1),
  crewRole: z.enum(CREW_ROLES),
});

export const assignTechniciansBodySchema = z
  .object({ assignments: z.array(taskAssignmentSchema).min(1).max(2) })
  .refine((data) => new Set(data.assignments.map((a) => a.technicianId)).size === data.assignments.length, {
    message: "assignments must not repeat the same technicianId",
    path: ["assignments"],
  })
  .refine((data) => data.assignments.filter((a) => a.crewRole === "PRIMARY").length === 1, {
    message: "assignments must contain exactly one PRIMARY technician",
    path: ["assignments"],
  });

export const scheduleTaskBodySchema = z.object({
  scheduledDate: dateOnlyString("scheduledDate"),
});

export const updateTaskStatusBodySchema = z.object({
  status: z.enum(TASK_STATUSES),
});
