import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/server/services/auth-sessions';
import { getPrismaClient } from '@/server/prisma';
import { purchaseIntraStates, type IntraDb } from '@/server/services/mendel-intra-control';
import { operationalDateKey } from '@/lib/operational-timezone';
import { purchaseControlWorkbook } from '@/lib/purchase-control-xlsx';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const flag = (v: boolean | null) => v === null ? 'Sin confirmar' : v ? 'Sí' : 'No';
const clean = (v: string) => v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;
  try {
    const prisma = getPrismaClient();
    const purchases = await prisma.mendel_transactions.findMany({ take: 50001, orderBy: [{ transactionDate: 'desc' }, { transactionId: 'asc' }], select: { transactionId: true, transactionDate: true, userName: true, merchant: true, totalAmount: true, currency: true, budget: true, transactionCategory: true, transactionType: true, transactionStatus: true } });
    if (purchases.length > 50000) return NextResponse.json({ code: 'TOO_MANY_PURCHASES' }, { status: 503, headers });
    const ids = purchases.map(p => p.transactionId), jsonIds = JSON.stringify(ids);
    const [details, zones] = await Promise.all([
      prisma.$queryRaw<Array<{ transactionId: string; fullId: string | null; sourceInvoice: string | null; sourceDescription: string | null; manualInvoice: string | null; oppen: boolean; requiresIntra: boolean | null; version: number }>>`SELECT transaction_id AS "transactionId",full_id AS "fullId",source_invoice AS "sourceInvoice",source_description AS "sourceDescription",manual_invoice AS "manualInvoice",oppen,requires_intra AS "requiresIntra",version FROM mendel_purchase_details WHERE transaction_id IN (SELECT jsonb_array_elements_text(${jsonIds}::jsonb))`,
      prisma.$queryRaw<Array<{ transactionId: string; zone: string }>>`SELECT transaction_id AS "transactionId",zone FROM fnet_mendel_zone_expenses WHERE transaction_id IN (SELECT jsonb_array_elements_text(${jsonIds}::jsonb))`,
    ]);
    const db: IntraDb = { query: <T>(sql: string, values: unknown[] = []) => prisma.$queryRawUnsafe<T[]>(sql, ...values) };
    const states = await purchaseIntraStates(db, auth.user, purchases);
    const detailMap = new Map(details.map(d => [d.transactionId, d])), zoneMap = new Map(zones.map(z => [z.transactionId, z.zone]));
    const all = purchases.map(p => {
      const detail = detailMap.get(p.transactionId) ?? { fullId: null, sourceInvoice: null, sourceDescription: null, manualInvoice: null, oppen: false, requiresIntra: null, version: 0 };
      return { ...p, totalAmount: p.totalAmount.toString(), date: operationalDateKey(p.transactionDate), zone: zoneMap.get(p.transactionId) ?? '', details: detail, intra: states.get(p.transactionId)! };
    });
    const options = { zones: [...new Set(all.map(p => p.zone).filter(Boolean))].sort(), budgets: [...new Set(all.map(p => p.budget).filter((v): v is string => !!v))].sort(), categories: [...new Set(all.map(p => p.transactionCategory).filter((v): v is string => !!v))].sort(), transactionStatuses: [...new Set(all.map(p => p.transactionStatus).filter((v): v is string => !!v))].sort() };
    const param = (name: string) => (request.nextUrl.searchParams.get(name) ?? '').trim().slice(0, 150);
    const q=clean(param('q')), zone=param('zone'), budget=param('budget'), categoryFilter=param('category'), merchant=clean(param('merchant')), invoice=clean(param('invoice')), id=clean(param('id')), from=param('from'), to=param('to'), view=param('view'), status=param('status'), transactionStatus=param('transactionStatus');
    const matches = all.filter(p => {
      const d=p.details, intra=p.intra, name=clean(p.budget ?? ''), bill=clean(d.manualInvoice ?? d.sourceInvoice ?? '');
      const category = name.startsWith('civil') ? 'civil' : name.includes('viatico') ? 'viaticos' : 'other';
      const search = clean([p.userName,p.merchant,p.budget,p.transactionCategory,d.sourceDescription,d.fullId,p.transactionId,bill,p.zone].join(' '));
      const mismatch = (intra.uploaded === true && intra.downloaded === false) || (intra.uploaded === false && intra.downloaded === true);
      return (!q || search.includes(q)) && (!zone || p.zone === zone) && (!budget || p.budget === budget) && (!categoryFilter || p.transactionCategory === categoryFilter) && (!transactionStatus || p.transactionStatus === transactionStatus) && (!merchant || clean(p.merchant ?? '').includes(merchant)) && (!invoice || bill.includes(invoice)) && (!id || clean(d.fullId ?? '').includes(id) || clean(p.transactionId).includes(id)) && (!from || p.date >= from) && (!to || p.date <= to) && (!view || category === view) && (!status || (status === 'loaded' ? intra.uploaded === true : status === 'pending-load' ? d.requiresIntra !== false && intra.uploaded !== true : status === 'downloaded' ? intra.downloaded === true : status === 'pending-download' ? d.requiresIntra !== false && intra.downloaded !== true : status === 'mismatch' ? mismatch : true));
    });
    const summary = { total: matches.length, loaded: matches.filter(p => p.intra.uploaded === true).length, pendingLoad: matches.filter(p => p.details.requiresIntra !== false && p.intra.uploaded !== true).length, downloaded: matches.filter(p => p.intra.downloaded === true).length, pendingDownload: matches.filter(p => p.details.requiresIntra !== false && p.intra.downloaded !== true).length, unconfirmedLoad: matches.filter(p => p.details.requiresIntra !== false && p.intra.uploaded === null).length, unconfirmedDownload: matches.filter(p => p.details.requiresIntra !== false && p.intra.downloaded === null).length, mismatch: matches.filter(p => p.intra.uploaded !== null && p.intra.downloaded !== null && p.intra.uploaded !== p.intra.downloaded).length };
    if (param('export') === 'xlsx') {
      const table = [['Fecha','Zona','Usuario','Proveedor','Descripción','Categoría','Importe','Moneda','Presupuesto','Estado del pago','ID Mendel','Factura','Va en Oppen','Debe cargarse en Intra','Cargada en Intra','Descargada en Intra'], ...matches.map(p => [p.date,p.zone || 'Sin zona',p.userName ?? '',p.merchant ?? '',p.details.sourceDescription ?? p.transactionType ?? '',p.transactionCategory ?? '',p.totalAmount,p.currency,p.budget ?? '',p.transactionStatus ?? '',p.details.fullId ?? `${p.transactionId} (abreviado)`,p.details.manualInvoice ?? p.details.sourceInvoice ?? '',flag(p.details.oppen),flag(p.details.requiresIntra),flag(p.intra.uploaded),flag(p.intra.downloaded)])];
      return new Response(Buffer.from(purchaseControlWorkbook(table)), { headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="control-compras-mendel.xlsx"' } });
    }
    const page = Math.max(1, Math.min(10000, Number(param('page')) || 1));
    return NextResponse.json({ items: matches.slice((page-1)*50,page*50), summary, options, page }, { headers });
  } catch { return NextResponse.json({ code: 'PURCHASE_CONTROL_UNAVAILABLE' }, { status: 503, headers }); }
}
