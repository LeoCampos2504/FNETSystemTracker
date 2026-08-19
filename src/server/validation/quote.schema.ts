import { z } from "zod";

const QUOTE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED_WITH_PENDING", "COMPLETED"] as const;

export const quoteListQuerySchema = z.object({
  zoneId: z.string().min(1).optional(),
  coordinatorId: z.string().min(1).optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
  projectId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
});
