import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/server/prisma';
import { requireAdminSession } from '@/server/services/auth-sessions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try {
    const rows = await getPrismaClient().$queryRaw<Array<{
      id: bigint; importedAt: Date; rowCount: number; insertedCount: number;
      updatedCount: number; fileName: string | null; periodStart: string | null; periodEnd: string | null; invalidCount: number | null; duplicateCount: number | null;
    }>>`SELECT b.id, b.imported_at AS "importedAt", b.row_count AS "rowCount",
          b.inserted_count AS "insertedCount", b.updated_count AS "updatedCount",
          a.file_name AS "fileName", a.period_start::text AS "periodStart", a.period_end::text AS "periodEnd", a.invalid_count AS "invalidCount", a.duplicate_count AS "duplicateCount"
        FROM mendel_import_batches b LEFT JOIN mendel_csv_archives a ON a.batch_id = b.id
        ORDER BY b.imported_at DESC, b.id DESC LIMIT 100`;
    return NextResponse.json({ items: rows.map(row => ({ ...row, id: row.id.toString() })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ code: 'MENDEL_HISTORY_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
