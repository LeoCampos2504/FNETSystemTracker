import { NextResponse } from 'next/server';
import { requireOperationsSession } from '@/server/operations-http';
import { catalog } from '@/server/services/operations';
import { inspectFuelPhotoSource } from '@/server/services/fuel-photo-source';
import { privateHeaders, supplyFailure } from '@/server/supply-http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
let lastRead = 0;
export async function GET(request: Request) {
  const session = await requireOperationsSession();
  if (!session.ok) return session.response;
  const actor = session.actor;
  if (!actor.user.active || actor.user.role !== 'ADMIN' || actor.allowed !== null || actor.ctic) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403, headers: privateHeaders });
  const query = new URL(request.url).searchParams, code = query.get('form') ?? '', index = query.get('index') ?? '';
  if (!/^FO-\d{2}-\d{6}$/.test(code) || !/^\d+(?:\.\d+[A-Z]?)+$/.test(index)) return NextResponse.json({ code: 'INVALID_SOURCE_REFERENCE' }, { status: 422, headers: privateHeaders });
  try {
    if (!(await catalog(actor)).tasks.some(t => t.code === code)) return NextResponse.json({ code: 'FORM_NOT_FOUND' }, { status: 404, headers: privateHeaders });
    if (Date.now() - lastRead < 30000) return NextResponse.json({ code: 'TRY_LATER' }, { status: 429, headers: privateHeaders });
    lastRead = Date.now();
    return NextResponse.json(await inspectFuelPhotoSource(code, index), { headers: privateHeaders });
  } catch (e) { return supplyFailure(e); }
}
