import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrismaClient } from '@/server/prisma';
import { requireAdminSession } from '@/server/services/auth-sessions';
import { SupplyError } from '@/server/services/supply-control';
import { privateHeaders, readInput, supplyFailure } from '@/server/supply-http';
import { intraTransactionId } from '@/server/mendel-intra-input';

export const dynamic = 'force-dynamic';
const inputSchema = z.object({
  transactionId: intraTransactionId,
  oppen: z.boolean(),
  requiresIntra: z.boolean().nullable(),
  manualInvoice: z.string().trim().max(200).nullable(),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export async function GET(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;
  try {
    const transactionId = intraTransactionId.parse(new URL(request.url).searchParams.get('transactionId'));
    const events = await getPrismaClient().$queryRaw<Array<{ actor: string | null; at: Date; before: unknown; after: unknown }>>`
      SELECT u.name AS actor, e.created_at AS at, e.before, e.after FROM mendel_purchase_detail_events e
      JOIN app_users u ON u.id=e.actor_id WHERE e.transaction_id=${transactionId}
      ORDER BY e.created_at DESC,e.id DESC LIMIT 100`;
    return NextResponse.json({ events }, { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;
  try {
    const input = await readInput(request, inputSchema);
    const state = await getPrismaClient().$transaction(async tx => {
      const purchase = await tx.$queryRaw<Array<{ transaction_id: string }>>`SELECT transaction_id FROM mendel_transactions WHERE transaction_id=${input.transactionId} FOR UPDATE`;
      if (!purchase.length) throw new SupplyError('NOT_FOUND', 404);
      await tx.$executeRaw`INSERT INTO mendel_purchase_details(transaction_id) VALUES (${input.transactionId}) ON CONFLICT (transaction_id) DO NOTHING`;
      const [before] = await tx.$queryRaw<Array<{ oppen: boolean; requiresIntra: boolean | null; manualInvoice: string | null; version: number }>>`
        SELECT oppen, requires_intra AS "requiresIntra", manual_invoice AS "manualInvoice", version FROM mendel_purchase_details WHERE transaction_id=${input.transactionId} FOR UPDATE`;
      if (before.version !== input.expectedVersion) throw new SupplyError('DETAILS_CHANGED', 409);
      const after = { oppen: input.oppen, requiresIntra: input.requiresIntra, manualInvoice: input.manualInvoice || null, version: before.version + 1 };
      if (before.oppen === after.oppen && before.requiresIntra === after.requiresIntra && before.manualInvoice === after.manualInvoice) return before;
      await tx.$executeRaw`UPDATE mendel_purchase_details SET oppen=${after.oppen}, requires_intra=${after.requiresIntra}, manual_invoice=${after.manualInvoice}, version=${after.version} WHERE transaction_id=${input.transactionId}`;
      await tx.$executeRaw`INSERT INTO mendel_purchase_detail_events(id,transaction_id,actor_id,before,after) VALUES (${randomUUID()}::uuid,${input.transactionId},${auth.user.id}::uuid,${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb)`;
      return after;
    });
    return NextResponse.json({ state }, { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
