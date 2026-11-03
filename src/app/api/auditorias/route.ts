import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/server/prisma';
import { readInput } from '@/server/supply-http';
import { auditActionSchema, auditHistory, auditOverview, auditWrite } from '@/server/physical-audits';
import { auditFailure, auditHeaders, auditRunner, requireAuditSession } from '@/server/physical-audit-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const session = await requireAuditSession(); if (!session.ok) return session.response;
    const db = auditRunner(getPrismaClient());
    const id = new URL(request.url).searchParams.get('personId');
    const result = id ? { history: await auditHistory(db, session.user, id) } : { rows: await auditOverview(db, session.user), canEdit: session.user.role === 'ADMIN' };
    return NextResponse.json(result, { headers: auditHeaders });
  } catch (e) { return auditFailure(e); }
}
export async function POST(request: Request) {
  try {
    const session = await requireAuditSession(true); if (!session.ok) return session.response;
    const input = await readInput(request, auditActionSchema);
    const result = await getPrismaClient().$transaction(tx => auditWrite(auditRunner(tx), session.user, input));
    return NextResponse.json(result, { headers: auditHeaders });
  } catch (e) { return auditFailure(e); }
}
