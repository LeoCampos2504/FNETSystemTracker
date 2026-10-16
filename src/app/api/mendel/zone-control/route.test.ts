import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/operations-http", () => ({ requireOperationsSession: mocks.session }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({ $queryRawUnsafe: mocks.query, $transaction: mocks.transaction }) }));
import { GET, POST } from "./route";
const url = "http://localhost:3001/api/mendel/zone-control";
beforeEach(() => { vi.clearAllMocks(); });
describe("Mendel zone HTTP authorization and body boundary", () => {
  it("requires a real session before querying or writing", async () => { mocks.session.mockResolvedValue({ ok: false, response: Response.json({ code: "UNAUTHENTICATED" }, { status: 401 }) }); expect((await GET(new Request(url))).status).toBe(401); expect((await POST(new Request(url, { method: "POST" }))).status).toBe(401); expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("preserves CTIC/role denial from the shared session guard", async () => { mocks.session.mockResolvedValue({ ok: false, response: Response.json({ code: "FORBIDDEN" }, { status: 403 }) }); expect((await GET(new Request(url))).status).toBe(403); expect(mocks.query).not.toHaveBeenCalled(); });
  it("rejects cross-site writes before any transaction", async () => { mocks.session.mockResolvedValue({ ok: true, actor: { user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", active: true } } }); const response = await POST(new Request(url, { method: "POST", headers: { origin: "https://foreign.invalid", "content-type": "application/json" }, body: "{}" })); expect(response.status).toBe(403); expect(mocks.transaction).not.toHaveBeenCalled(); });
  it("enforces a streamed body limit even without content-length", async () => { mocks.session.mockResolvedValue({ ok: true, actor: { user: { role: "ADMIN", active: true } } }); const response = await POST(new Request(url, { method: "POST", headers: { origin: "http://localhost:3001", "content-type": "application/json" }, body: "x".repeat(65537) })); expect(response.status).toBe(413); expect(mocks.transaction).not.toHaveBeenCalled(); });
});
