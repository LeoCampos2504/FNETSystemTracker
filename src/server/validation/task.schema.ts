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

export const taskDayQuerySchema = z.object({
  technicianId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

export const pendingTaskQuerySchema = z.object({
  technicianId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "asOfDate must be YYYY-MM-DD")
    .optional(),
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
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "scheduledDate must be YYYY-MM-DD"),
});

export const updateTaskStatusBodySchema = z.object({
  status: z.enum(TASK_STATUSES),
});
