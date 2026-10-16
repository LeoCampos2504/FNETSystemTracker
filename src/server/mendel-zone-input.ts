import { z } from "zod";
import { trayDateKey } from "@/lib/mendel-bandeja";

const text = (max: number) => z.string().max(max);
const zone = z.string().trim().min(1).max(80).refine(v => !/[\u0000-\u001f]/.test(v) && v !== "__UNASSIGNED__");
const transactionId = z.string().trim().min(1).max(80).refine(v => !/[\u0000-\u001f]/.test(v));
export const sharedExpenseSchema = z.object({
  transactionId, zone, date: text(80).refine(v => !!trayDateKey(v)), person: text(250).min(1), merchant: text(400),
  amount: text(100).min(1), currency: text(10), budget: text(250), notes: text(10000).nullable(), approvalNotes: text(10000),
  receipt: z.enum(["SI", "NO", "SIN_DATO"]), locality: text(200), coordinator: text(250),
  paymentStatus: text(200), officialApproval: text(200), zoneSource: text(250),
}).strict();
export const zoneActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), rows: z.array(sharedExpenseSchema).min(1).max(200) }).strict(),
  z.object({ action: z.literal("decide"), transactionId, revision: z.number().int().positive(), expectedDecisionId: z.string().regex(/^\d+$/).nullable(), requestId: z.string().uuid(), decision: z.enum(["PENDIENTE", "AUTORIZADO", "NO_AUTORIZADO"]), comment: text(1000) }).strict(),
  z.object({ action: z.literal("access"), userId: z.string().uuid(), zone, enabled: z.boolean() }).strict(),
]);
export type ZoneAction = z.infer<typeof zoneActionSchema>;
export type SharedExpense = z.infer<typeof sharedExpenseSchema>;
