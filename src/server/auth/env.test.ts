import { afterEach, describe, expect, it } from "vitest";
import { getAuthSecret } from "./env";

// Next's types mark process.env.NODE_ENV read-only to stop app code from
// mutating it; that's exactly what these tests need to do to exercise the
// production-fallback branch, so go through a widened alias instead of `any`.
const mutableEnv = process.env as Record<string, string | undefined>;

const originalAuthSecret = mutableEnv.AUTH_SECRET;
const originalNodeEnv = mutableEnv.NODE_ENV;

afterEach(() => {
  mutableEnv.AUTH_SECRET = originalAuthSecret;
  mutableEnv.NODE_ENV = originalNodeEnv;
});

describe("getAuthSecret", () => {
  it("uses the configured AUTH_SECRET when present", () => {
    mutableEnv.AUTH_SECRET = "a-real-secret";
    const secret = getAuthSecret();
    expect(new TextDecoder().decode(secret)).toBe("a-real-secret");
  });

  it("falls back to an insecure dev secret outside production when AUTH_SECRET is unset", () => {
    delete mutableEnv.AUTH_SECRET;
    mutableEnv.NODE_ENV = "test";
    expect(() => getAuthSecret()).not.toThrow();
    expect(new TextDecoder().decode(getAuthSecret())).toContain("insecure");
  });

  it("throws instead of falling back when NODE_ENV is production and AUTH_SECRET is unset", () => {
    delete mutableEnv.AUTH_SECRET;
    mutableEnv.NODE_ENV = "production";
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);
  });

  it("uses the configured AUTH_SECRET in production too, without needing the fallback", () => {
    mutableEnv.AUTH_SECRET = "a-real-production-secret";
    mutableEnv.NODE_ENV = "production";
    expect(() => getAuthSecret()).not.toThrow();
  });
});
