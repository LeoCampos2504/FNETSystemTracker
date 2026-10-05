import { z } from "zod";
import { Prisma } from "@prisma/client";

const decimal = (scale: number) => z.string().trim().regex(new RegExp(`^\\d{1,12}(?:\\.\\d{1,${scale}})?$`)).transform((value) => new Prisma.Decimal(value).toString());
export const positiveQuantity = decimal(3).refine((value) => new Prisma.Decimal(value).gt(0));
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const uuid = z.string().uuid();
const optionalText = z.string().trim().max(500).transform((value) => value || null).optional();
export const invoiceInput = z.object({
  requestKey: uuid, supplier: z.string().trim().min(2).max(200),
  documentType: z.enum(["A", "B", "C", "E", "TICKET", "OTRO"]), number: z.string().trim().min(1).max(80),
  invoiceDate: day, amount: decimal(2), currency: z.enum(["ARS", "USD"]),
  mendelTransactionId: z.string().trim().max(80).transform((value) => value || null).optional(),
  lines: z.array(z.object({ description: z.string().trim().min(2).max(500), quantity: positiveQuantity, unit: z.enum(["unidad", "litro", "metro", "kg", "rollo", "otro"]) })).max(100),
});
export const invoiceStatusInput = z.object({ version: z.number().int().nonnegative(), action: z.enum(["DOWNLOADED", "UPLOAD_CONFIRMED", "RESET_DOWNLOAD", "RESET_UPLOAD"]), intraReference: optionalText });
export const handoffInput = z.object({ requestKey: uuid, lineId: uuid, version: z.number().int().nonnegative(), technician: z.string().trim().min(2).max(200), quantity: positiveQuantity, site: optionalText, assignedDate: day, reminderDays: z.number().int().min(1).max(365) });
const formInput = z.object({ formCode: z.string().trim().toUpperCase().regex(/^FO-\d{2}-\d{6}$/), quantity: positiveQuantity });
export const movementInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CONSUMPTION"), requestKey: uuid, version: z.number().int().nonnegative(), usedDate: day, exhausted: z.boolean(), forms: z.array(formInput).min(1).max(50), notes: optionalText }),
  z.object({ action: z.literal("RETURN"), requestKey: uuid, version: z.number().int().nonnegative(), usedDate: day, quantity: positiveQuantity, notes: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("REVERSAL"), requestKey: uuid, version: z.number().int().nonnegative(), movementId: uuid, notes: z.string().trim().min(3).max(500) }),
]);
export type InvoiceInput = z.infer<typeof invoiceInput>;
export type HandoffInput = z.infer<typeof handoffInput>;
export type MovementInput = z.infer<typeof movementInput>;
export const localDayStart = (date: string) => new Date(`${date}T00:00:00-03:00`);
export function identityKey(value: string) { return value.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " "); }
export function consumptionTotal(forms: Array<{ formCode: string; quantity: string }>) {
  if (new Set(forms.map((form) => form.formCode)).size !== forms.length) throw new Error("DUPLICATE_FORM");
  return forms.reduce((total, form) => total.plus(form.quantity), new Prisma.Decimal(0));
}
export function remainingAfterUse(remaining: Prisma.Decimal, total: Prisma.Decimal, exhausted: boolean) {
  if (!total.gt(0) || total.gt(remaining)) throw new Error("INSUFFICIENT_REMAINING");
  const next = remaining.minus(total);
  if (exhausted && !next.isZero()) throw new Error("EXHAUSTED_REQUIRES_ALL_REMAINING");
  return next;
}
