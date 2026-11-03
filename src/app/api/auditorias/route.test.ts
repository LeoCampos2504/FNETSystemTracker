import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock('@/server/services/auth-sessions', () => ({ getCurrentSessionUser: m.session }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => ({ $queryRawUnsafe: m.query, $transaction: m.transaction }) }));
import { GET, POST } from './route';
import { GET as download, POST as attach } from './files/route';
import { GET as excel } from './export/route';
beforeEach(() => { vi.clearAllMocks(); m.query.mockResolvedValue([]); m.transaction.mockImplementation(async fn => fn({ $queryRawUnsafe: m.query })); });
const user = (role = 'ADMIN') => ({ id: '00000000-0000-4000-8000-000000000001', role, active: true, name: 'Synthetic' });
it('requires real authentication for list, history, files and Excel', async () => {
  m.session.mockResolvedValue(null);
  expect((await GET(new Request('https://fnet.test/api/auditorias'))).status).toBe(401);
  expect((await GET(new Request('https://fnet.test/api/auditorias?personId=invalid'))).status).toBe(401);
  expect((await download(new Request('https://fnet.test/api/auditorias/files?id=invalid'))).status).toBe(401);
  expect((await excel(new Request('https://fnet.test/api/auditorias/export'))).status).toBe(401);
  expect(m.query).not.toHaveBeenCalled();
});
it('blocks direct write requests and uploads by every non-Admin role before reading their body', async () => {
  for (const role of ['COORDINATOR', 'MANAGER', 'TECHNICIAN']) {
    m.session.mockResolvedValue(user(role));
    expect((await POST(new Request('https://fnet.test/api/auditorias', { method: 'POST', body: '{"role":"ADMIN"}' }))).status).toBe(403);
    expect((await attach(new Request('https://fnet.test/api/auditorias/files', { method: 'POST' }))).status).toBe(403);
  }
  expect(m.transaction).not.toHaveBeenCalled();
});
it('protects Admin writes against cross-origin requests', async () => {
  m.session.mockResolvedValue(user());
  const req = () => new Request('https://fnet.test/api/auditorias', { method: 'POST', headers: { Origin: 'https://evil.test', 'Content-Type': 'application/json' }, body: '{}' });
  expect((await POST(req())).status).toBe(403);
  expect((await attach(req())).status).toBe(403);
  expect(m.transaction).not.toHaveBeenCalled();
});
it('keeps read-only list and export available to an active technician, with private response headers', async () => {
  m.session.mockResolvedValue(user('TECHNICIAN'));
  const response = await GET(new Request('https://fnet.test/api/auditorias'));
  expect(await response.json()).toEqual({ rows: [], canEdit: false });
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const xlsx = await excel(new Request('https://fnet.test/api/auditorias/export'));
  expect(xlsx.status).toBe(200); expect(xlsx.headers.get('Content-Type')).toContain('spreadsheetml');
});
