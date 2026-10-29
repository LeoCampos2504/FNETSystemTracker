import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/server/prisma';
import { hasAllowedRequestOrigin } from '@/server/request-origin';
import { AuditError } from '@/server/physical-audits';
import { auditFailure, auditHeaders, auditRunner, requireAuditSession } from '@/server/physical-audit-http';
import { attachAuditFile, auditDownload, boundedAuditUpload } from '@/server/physical-audit-files';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const session = await requireAuditSession(); if (!session.ok) return session.response;
    const file = await auditDownload(auditRunner(getPrismaClient()), session.user, new URL(request.url).searchParams.get('id') ?? '');
    return new Response(new Uint8Array(file.content), { headers: { ...auditHeaders, 'Content-Type': file.mime_type, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`, 'Content-Security-Policy': "sandbox; default-src 'none'" } });
  } catch (e) { return auditFailure(e); }
}
export async function POST(request: Request) {
  try {
    const session = await requireAuditSession(true); if (!session.ok) return session.response;
    if (!hasAllowedRequestOrigin(request)) throw new AuditError('INVALID_ORIGIN', 403);
    const form = await boundedAuditUpload(request), file = form.get('file');
    if (!(file instanceof File)) throw new AuditError('INPUT_INVALID', 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await getPrismaClient().$transaction(tx => attachAuditFile(auditRunner(tx), session.user, String(form.get('recordId') ?? ''), bytes, file.name));
    return NextResponse.json(result, { headers: auditHeaders });
  } catch (e) { return auditFailure(e); }
}
