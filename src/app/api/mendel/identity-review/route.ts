import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseMendelCsv } from '@/server/mendel-csv';
import { getPrismaClient } from '@/server/prisma';
import { requireAdminSession } from '@/server/services/auth-sessions';
import { hasAllowedRequestOrigin } from '@/server/request-origin';
import { intraTransactionId } from '@/server/mendel-intra-input';
import { privateHeaders, readInput, supplyFailure } from '@/server/supply-http';
import { SupplyError } from '@/server/services/supply-control';

export const dynamic = 'force-dynamic';
const schema = z.object({ shortId: intraTransactionId, fullId: intraTransactionId }).strict();

// This comparison reads the supplied CSV but does not import it or establish associations.
export async function POST(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;
  if (!hasAllowedRequestOrigin(request)) return NextResponse.json({ code: 'INVALID_ORIGIN' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 8 * 1024 * 1024) return NextResponse.json({ code: 'FILE_TOO_LARGE' }, { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv') || file.size === 0 || file.size > 8 * 1024 * 1024) return NextResponse.json({ code: 'CSV_INVALID' }, { status: 422 });
    const parsed = parseMendelCsv(new Uint8Array(await file.arrayBuffer()), { requireFullId: true });
    if (parsed.identityConflict) return NextResponse.json({ code: 'CSV_ID_CONFLICT' }, { status: 422 });
    const ids = JSON.stringify([...new Set(parsed.rows.filter(r => r.fullId && r.transactionId !== r.fullId).map(r => r.transactionId))]);
    const historical = await getPrismaClient().$queryRaw<Array<{ transactionId: string; transactionDate: Date; merchant: string | null; totalAmount: string; currency: string; invoice: string | null }>>`
      SELECT t.transaction_id AS "transactionId",t.transaction_date AS "transactionDate",t.merchant,t.total_amount::text AS "totalAmount",t.currency,COALESCE(d.manual_invoice,d.source_invoice) AS invoice
      FROM mendel_transactions t LEFT JOIN mendel_purchase_details d ON d.transaction_id=t.transaction_id
      WHERE t.transaction_id IN (SELECT jsonb_array_elements_text(${ids}::jsonb)) AND d.full_id IS NULL`;
    const byId = new Map(historical.map(row => [row.transactionId, row]));
    const candidates = parsed.rows.flatMap(row => {
      const original = byId.get(row.transactionId);
      return original && row.fullId && row.fullId !== row.transactionId ? [{ historical: original, csv: { fullId: row.fullId, transactionDate: row.transactionDate, merchant: row.merchant, totalAmount: row.totalAmount, currency: row.currency, invoice: row.sourceInvoice ?? null } }] : [];
    });
    return NextResponse.json({ candidates, invalidRows: parsed.invalidRowCount }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('CSV_')) return NextResponse.json({ code: 'CSV_INVALID' }, { status: 422 });
    return supplyFailure(error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;
  try {
    const { shortId, fullId } = await readInput(request, schema);
    if (fullId === shortId || !fullId.startsWith(shortId)) throw new SupplyError('INVALID_PAIR', 422);
    const result = await getPrismaClient().$transaction(async tx => {
      // A full ID already stored under its own transaction is never merged silently.
      const rows = await tx.$queryRaw<Array<{ transaction_id: string }>>`SELECT transaction_id FROM mendel_transactions WHERE transaction_id IN (${shortId},${fullId}) ORDER BY transaction_id FOR UPDATE`;
      if (!rows.some(row => row.transaction_id === shortId)) throw new SupplyError('NOT_FOUND', 404);
      if (rows.some(row => row.transaction_id === fullId)) throw new SupplyError('FULL_ID_ALREADY_EXISTS', 409);
      await tx.$executeRaw`INSERT INTO mendel_purchase_details(transaction_id) VALUES (${shortId}) ON CONFLICT (transaction_id) DO NOTHING`;
      const [before] = await tx.$queryRaw<Array<{ fullId: string | null; oppen: boolean; requiresIntra: boolean | null; manualInvoice: string | null; version: number }>>`SELECT full_id AS "fullId",oppen,requires_intra AS "requiresIntra",manual_invoice AS "manualInvoice",version FROM mendel_purchase_details WHERE transaction_id=${shortId} FOR UPDATE`;
      if (before.fullId) throw new SupplyError('ALREADY_ASSOCIATED', 409);
      const used = await tx.$queryRaw<Array<{ transaction_id: string }>>`SELECT transaction_id FROM mendel_purchase_details WHERE full_id=${fullId}`;
      if (used.length) throw new SupplyError('FULL_ID_ALREADY_EXISTS', 409);
      const [latest] = await tx.$queryRaw<Array<{ observation: string | null }>>`SELECT after->>'observation' AS observation FROM mendel_purchase_detail_events WHERE transaction_id=${shortId} ORDER BY (after->>'version')::int DESC,created_at DESC,id DESC LIMIT 1`;
      const previous = { ...before, observation: latest?.observation ?? '' };
      const after = { ...previous, fullId, version: before.version + 1 };
      await tx.$executeRaw`UPDATE mendel_purchase_details SET full_id=${fullId},version=${after.version} WHERE transaction_id=${shortId}`;
      const [event] = await tx.$queryRaw<Array<{ createdAt: Date }>>`INSERT INTO mendel_purchase_detail_events(id,transaction_id,actor_id,before,after) VALUES (${randomUUID()}::uuid,${shortId},${auth.user.id}::uuid,${JSON.stringify(previous)}::jsonb,${JSON.stringify(after)}::jsonb) RETURNING created_at AS "createdAt"`;
      return event;
    });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
