import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
const m = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), raw: vi.fn(), states: vi.fn() }));
vi.mock('@/server/services/auth-sessions', () => ({ requireAdminSession: m.auth }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => ({ mendel_transactions: { findMany: m.find }, $queryRaw: m.raw, $queryRawUnsafe: vi.fn() }) }));
vi.mock('@/server/services/mendel-intra-control', () => ({ purchaseIntraStates: m.states }));
import { GET } from './route';
const url = 'http://localhost:3001/api/mendel/purchase-control';
const purchase = (id: string, budget: string) => ({ transactionId: id, transactionDate: new Date('2026-10-02T15:00:00Z'), userName: 'Persona inventada', merchant: 'Comercio ficticio', totalAmount: '100.00', currency: 'ARS', budget, transactionCategory: null, transactionType: null, transactionStatus: 'CONFIRMADA' });
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ ok: true, user: { id: 'admin', role: 'ADMIN', active: true } });
  m.find.mockResolvedValue([purchase('A', 'CIVIL - NOA'), purchase('B', 'VIATICOS')]);
  m.raw.mockResolvedValueOnce([{ transactionId: 'A', fullId: 'A-COMPLETO', sourceInvoice: '123', sourceDescription: null, manualInvoice: null, oppen: true, requiresIntra: true, version: 1 }]).mockResolvedValueOnce([{ transactionId: 'A', zone: 'NOA' }]).mockResolvedValueOnce([{ transactionId:'A', observation:'Observación ficticia' }]);
  m.states.mockResolvedValue(new Map([['A', { uploaded: true, downloaded: false }], ['B', { uploaded: null, downloaded: null }]]));
});
describe('control de compras', () => {
  it('requires an admin before reading purchases', async () => { m.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 403 }) }); expect((await GET(new NextRequest(url))).status).toBe(403); expect(m.find).not.toHaveBeenCalled(); });
  it('filters individual records and identifies the loading/discharge difference', async () => {
    const response = await GET(new NextRequest(url + '?view=civil&zone=NOA&status=mismatch'));
    const data = await response.json();
    expect(data.summary).toMatchObject({ total: 1, loaded: 1, pendingDownload: 1, mismatch: 1 });
    expect(data.items[0]).toMatchObject({ transactionId: 'A', details: { fullId: 'A-COMPLETO', oppen: true } });
  });
  it('exports all matching rows as literal Excel text', async () => {
    const response = await GET(new NextRequest(url + '?view=civil&export=xlsx'));
    expect(response.status).toBe(200);
    const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('A-COMPLETO'); expect(sheet).toContain('Observación ficticia'); expect(sheet).not.toContain('VIATICOS'); expect(sheet).not.toContain('<f>');
  });
  it('allows review of purchases without an assigned zone', async () => {
    const response = await GET(new NextRequest(url + '?zone=__sin_zona__'));
    const result = await response.json();
    expect(result.summary.total).toBe(1);
    expect(result.items[0].transactionId).toBe('B');
  });
});
