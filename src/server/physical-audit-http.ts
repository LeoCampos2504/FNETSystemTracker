import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentSessionUser } from './services/auth-sessions';
import { AuditError, type AuditDb } from './physical-audits';
import { SupplyError } from './services/supply-control';
export const auditHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function requireAuditSession(write = false) {
  const user = await getCurrentSessionUser();
  if (!user?.active) return { ok: false as const, response: NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401, headers: auditHeaders }) };
  if (write && user.role !== 'ADMIN') return { ok: false as const, response: NextResponse.json({ code: 'FORBIDDEN' }, { status: 403, headers: auditHeaders }) };
  return { ok: true as const, user };
}
export const auditRunner = (client: { $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> }): AuditDb => ({ query: <T>(sql: string, values: unknown[] = []) => client.$queryRawUnsafe<T[]>(sql, ...values) });
export function auditFailure(error: unknown) {
  if (error instanceof AuditError || error instanceof SupplyError) return NextResponse.json({ code: error.code }, { status: error.status, headers: auditHeaders });
  if (error instanceof ZodError) return NextResponse.json({ code: 'INPUT_INVALID', fields: error.issues.map(i => i.path.join('.')) }, { status: 422, headers: auditHeaders });
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const meta = error && typeof error === 'object' && 'meta' in error ? error.meta as { code?: string } : undefined;
  if (['23505', 'P2002'].includes(meta?.code ?? code)) return NextResponse.json({ code: 'CONCURRENT_OR_DUPLICATE_RECORD' }, { status: 409, headers: auditHeaders });
  if ((meta?.code ?? code) === '42P01') return NextResponse.json({ code: 'AUDIT_STORAGE_PENDING' }, { status: 503, headers: auditHeaders });
  console.error('Physical audit unavailable', error instanceof Error ? error.name : 'UnknownError');
  return NextResponse.json({ code: 'AUDIT_UNAVAILABLE' }, { status: 503, headers: auditHeaders });
}
