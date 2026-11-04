import { NextResponse } from 'next/server';
import { requireOperationsSession } from '@/server/operations-http';
import { hasAllowedRequestOrigin } from '@/server/request-origin';
import { privateHeaders, readInput, supplyFailure } from '@/server/supply-http';
import { assertIntraAdmin, changeIntraLink, intraChange, intraHistory, intraImportMeta, intraState, intraTargets, saveIntraSnapshot } from '@/server/services/intra-stock';
import { fail, materials } from '@/server/services/operations';
import { siteControl } from '@/server/services/site-control';
import { parseIntraXlsx, readIntraUpload } from '@/server/intra-stock-import';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const session = await requireOperationsSession(); if (!session.ok) return session.response;
  try {
    assertIntraAdmin(session.actor);
    const params = new URL(request.url).searchParams;
    if (params.get('history') === '1') {
      const before = Number(params.get('before') ?? 2147483647);
      if (!Number.isInteger(before) || before < 1 || before > 2147483647) fail('INPUT_INVALID', 422);
      return NextResponse.json({ history: await intraHistory(session.actor, before) }, { headers: privateHeaders });
    }
    const [state, sites, supplies] = await Promise.all([intraState(session.actor), siteControl(session.actor), materials(session.actor)]);
    return NextResponse.json({ ...state, targets: intraTargets(sites.fuel, supplies) }, { headers: privateHeaders });
  } catch (e) { return supplyFailure(e); }
}
export async function POST(request: Request) {
  const session = await requireOperationsSession(); if (!session.ok) return session.response;
  try {
    assertIntraAdmin(session.actor);
    if (!hasAllowedRequestOrigin(request)) fail('INVALID_ORIGIN', 403);
    const mode = new URL(request.url).searchParams.get('action');
    if (mode === 'preview' || mode === 'import') {
      const rows = await parseIntraXlsx(await readIntraUpload(request));
      if (mode === 'preview') return NextResponse.json({ rows }, { headers: privateHeaders });
      let metadata: unknown;
      try { metadata = JSON.parse(decodeURIComponent(request.headers.get('x-intra-meta') ?? '')); } catch { fail('INPUT_INVALID', 422); }
      const meta = intraImportMeta.parse(metadata);
      let name: string;
      try { name = decodeURIComponent(request.headers.get('x-file-name') ?? 'Insumos.xlsx'); } catch { fail('INPUT_INVALID', 422); }
      return NextResponse.json(await saveIntraSnapshot(session.actor, rows, meta, name), { headers: privateHeaders });
    }
    if (mode !== 'link') fail('INPUT_INVALID', 422);
    const input = await readInput(request, intraChange);
    const result = await changeIntraLink(session.actor, input, async () => {
      const [sites, supplies] = await Promise.all([siteControl(session.actor), materials(session.actor)]);
      return intraTargets(sites.fuel, supplies);
    });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (e) { return supplyFailure(e); }
}
