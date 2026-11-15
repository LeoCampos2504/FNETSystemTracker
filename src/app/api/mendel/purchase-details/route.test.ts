import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), transaction: vi.fn(), query: vi.fn(), execute: vi.fn() }));
vi.mock('@/server/services/auth-sessions', () => ({ requireAdminSession: m.auth }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => ({ $transaction: m.transaction }) }));
import { POST } from './route';
const url = 'http://localhost:3001/api/mendel/purchase-details';
const input = { transactionId: 'SYNTHETIC', oppen: true, requiresIntra: true, manualInvoice: 'FAC-123', expectedVersion: 0 };
function request(body: unknown = input, origin = 'http://localhost:3001') { return new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ ok: true, user: { id: '00000000-0000-4000-8000-000000000001', role: 'ADMIN', active: true } });
  m.query.mockResolvedValueOnce([{ transaction_id: 'SYNTHETIC' }]).mockResolvedValueOnce([{ oppen: false, requiresIntra: null, manualInvoice: null, version: 0 }]);
  m.transaction.mockImplementation(async cb => cb({ $queryRaw: m.query, $executeRaw: m.execute }));
});
describe('manual purchase controls', () => {
  it('blocks unauthorized and cross-site writes', async () => {
    m.auth.mockResolvedValueOnce({ ok: false, response: Response.json({}, { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request(input, 'https://foreign.invalid'))).status).toBe(403);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it('saves changes with the authenticated actor and an audit event in one transaction', async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: { oppen: true, requiresIntra: true, manualInvoice: 'FAC-123', version: 1 } });
    expect(m.execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(m.execute.mock.calls[2])).toContain('00000000-0000-4000-8000-000000000001');
  });
  it('rejects stale updates and does not append an event', async () => {
    expect((await POST(request({ ...input, expectedVersion: 4 }))).status).toBe(409);
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
});
