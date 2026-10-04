import { afterEach, describe, expect, it } from "vitest";
import { isLoginRateLimited, makeLoginRateLimitKey } from "./login-rate-limit";

const oldSecret = process.env.AUTH_SECRET;
afterEach(() => {
  if (oldSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = oldSecret;
});

describe("login throttling", () => {
  it("limits attempts after the allowed threshold and releases after the window", () => {
    const start = new Date("2026-09-25T12:00:00Z");
    expect(isLoginRateLimited(9, start, 10, new Date("2026-09-25T12:14:59Z"))).toBe(false);
    expect(isLoginRateLimited(10, start, 10, new Date("2026-09-25T12:14:59Z"))).toBe(false);
    expect(isLoginRateLimited(11, start, 10, new Date("2026-09-25T12:14:59Z"))).toBe(true);
    expect(isLoginRateLimited(11, start, 10, new Date("2026-09-25T12:15:00Z"))).toBe(false);
  });

  it("uses a secret HMAC and keeps IP and account buckets separate", () => {
    process.env.AUTH_SECRET = "test-secret-with-at-least-thirty-two-bytes";
    const ipKey = makeLoginRateLimitKey("ip", "192.0.2.1");
    expect(ipKey).toMatch(/^[a-f0-9]{64}$/);
    expect(ipKey).toBe(makeLoginRateLimitKey("ip", "192.0.2.1"));
    expect(ipKey).not.toBe(makeLoginRateLimitKey("account", "192.0.2.1"));
    expect(ipKey).not.toContain("192.0.2.1");
  });

  it("fails closed when the rate-limit key secret is missing or too short", () => {
    process.env.AUTH_SECRET = "short";
    expect(() => makeLoginRateLimitKey("ip", "192.0.2.1")).toThrow("AUTH_SECRET_NOT_CONFIGURED");
  });
});
