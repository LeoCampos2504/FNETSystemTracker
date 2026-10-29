import { z } from 'zod';
import { getPrismaClient } from '@/server/prisma';
import { auditOverview } from '@/server/physical-audits';
import { auditFailure, auditHeaders, auditRunner, requireAuditSession } from '@/server/physical-audit-http';
import { filterAudits } from '@/lib/physical-audits';
import { operationalDateKey } from '@/lib/operational-timezone';
import { physicalAuditWorkbook } from '@/server/physical-audit-export';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const session = await requireAuditSession(); if (!session.ok) return session.response;
    const params = new URL(request.url).searchParams;
    const filters = z.object({ query: z.string().max(250), sector: z.string().max(120), status: z.string().max(80), due: z.string().max(40), warningDays: z.coerce.number().int().min(1).max(90) }).parse({ query: params.get('query') ?? '', sector: params.get('sector') ?? '', status: params.get('status') ?? '', due: params.get('due') ?? '', warningDays: params.get('warningDays') ?? 15 });
    const today = operationalDateKey(new Date());
    const rows = filterAudits(await auditOverview(auditRunner(getPrismaClient()), session.user), filters, today);
    const bytes = physicalAuditWorkbook(rows, filters, today, session.user.role === 'ADMIN');
    return new Response(new Uint8Array(bytes), { headers: { ...auditHeaders, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="FNET-auditorias-${today}.xlsx"` } });
  } catch (e) { return auditFailure(e); }
}
