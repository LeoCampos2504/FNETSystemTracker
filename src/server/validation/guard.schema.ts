import { z } from "zod";

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "must be a valid ISO date-time");

export const guardListQuerySchema = z.object({
  zoneId: z.string().min(1).optional(),
  technicianId: z.string().min(1).optional(),
});

export const createGuardBodySchema = z
  .object({
    zoneId: z.string().min(1),
    technicianIds: z.array(z.string().min(1)).min(1).max(2),
    startAt: isoDateTime,
    endAt: isoDateTime,
  })
  .refine((data) => new Date(data.endAt).getTime() > new Date(data.startAt).getTime(), {
    message: "endAt must be after startAt",
    path: ["endAt"],
  });

export const updateGuardBodySchema = z
  .object({
    zoneId: z.string().min(1).optional(),
    technicianIds: z.array(z.string().min(1)).min(1).max(2).optional(),
    startAt: isoDateTime.optional(),
    endAt: isoDateTime.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

export const assignGuardBodySchema = z.object({
  technicianIds: z.array(z.string().min(1)).min(1).max(2),
});
