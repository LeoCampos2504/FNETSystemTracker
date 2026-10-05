import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), compare: vi.fn(), consume: vi.fn(), clear: vi.fn(), session: vi.fn() }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({ app_users: { findUnique: mocks.findUser } }) }));
vi.mock("@/server/services/auth-sessions", () => ({ createLoginSession: mocks.session }));
vi.mock("@/server/services/login-rate-limit", () => ({
  makeLoginRateLimitKey: (scope: string) => scope,
  consumeLoginRateLimit: mocks.consume,
  clearLoginRateLimit: mocks.clear,
  LOGIN_IP_LIMIT: 30, LOGIN_ACCOUNT_LIMIT: 10,
}));
import { POST } from "./route";

const domain = "fnetsystemtracker-production.up.railway.app";
const admin = { id: "test-admin", email: "admin@example.invalid", name: "Admin", role: "ADMIN", active: true, passwordHash: "test-hash", technicianId: null, coordinatorId: null };
function request(origin = `https://${domain}`) {
  return new Request("http://localhost:8080/api/auth/login", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "sec-fetch-site": "same-origin", "x-real-ip": "192.0.2.1" },
    body: JSON.stringify({ email: admin.email, password: "test-password-only" }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", domain);
  mocks.consume.mockResolvedValue({ limited: false, retryAfterSeconds: 0 });
  mocks.findUser.mockResolvedValue(admin);
  mocks.compare.mockResolvedValue(true);
  mocks.session.mockResolvedValue({ token: "a".repeat(43), expiresAt: new Date("2026-10-04T20:00:00Z") });
});
afterEach(() => vi.unstubAllEnvs());

describe("login through Railway public HTTPS ingress", () => {
  it("authenticates coordinators without giving them administrator rights", async () => {
    mocks.findUser.mockResolvedValue({...admin,role:"COORDINATOR"});
    const response=await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).user.role).toBe("COORDINATOR");
  });
  it("authenticates the Admin despite the internal HTTP request URL", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe(admin.id);
    expect(mocks.consume).toHaveBeenCalledTimes(2);
    expect(mocks.compare).toHaveBeenCalledWith("test-password-only", "test-hash");
    expect(mocks.session).toHaveBeenCalledWith(admin.id);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=strict/i);
  });
  it("still checks the password after accepting the public origin", async () => {
    mocks.compare.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "INVALID_CREDENTIALS" });
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before checking credentials or creating a session", async () => {
    const response = await POST(request("https://attacker.invalid"));
    expect(response.status).toBe(403);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("preserves rate limits for same-origin login", async () => {
    mocks.consume.mockResolvedValue({ limited: true, retryAfterSeconds: 60 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
