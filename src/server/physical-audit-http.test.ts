import { beforeEach, expect, it, vi } from 'vitest';
import type { User } from '@/contracts';
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('./services/auth-sessions', () => ({ getCurrentSessionUser: mocks.session }));
import { requireAuditSession } from './physical-audit-http';
beforeEach(() => { mocks.session.mockReset(); });
it('denies unauthenticated and inactive requests', async () => {
  mocks.session.mockResolvedValue(null); const no = await requireAuditSession(); expect(no.ok).toBe(false); if (!no.ok) expect(no.response.status).toBe(401);
  mocks.session.mockResolvedValue({ active: false, role: 'ADMIN' }); expect((await requireAuditSession(true)).ok).toBe(false);
});
it('grants all active roles read access but only Admin write access using the actual session', async () => {
  for (const role of ['ADMIN', 'COORDINATOR', 'MANAGER', 'TECHNICIAN'] as User['role'][]) {
    mocks.session.mockResolvedValue({ id: 'real-session-id', role, active: true });
    expect((await requireAuditSession()).ok).toBe(true);
    expect((await requireAuditSession(true)).ok).toBe(role === 'ADMIN');
  }
});
