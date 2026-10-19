import { z } from 'zod';

export const intraTransactionId = z.string().trim().min(1).max(80).refine(v => !/[\u0000-\u001f]/.test(v));
export const mendelIntraInput = z.object({
  transactionId: intraTransactionId,
  uploaded: z.boolean().nullable(),
  downloaded: z.boolean().nullable(),
  expectedEventId: z.string().uuid().nullable(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().uuid(),
}).strict();
export type MendelIntraInput = z.infer<typeof mendelIntraInput>;
