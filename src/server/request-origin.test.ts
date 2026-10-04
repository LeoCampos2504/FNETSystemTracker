import { afterEach, describe, expect, it, vi } from "vitest";
import { hasAllowedRequestOrigin } from "./request-origin";

afterEach(() => vi.unstubAllEnvs());
const domain = "fnetsystemtracker-production.up.railway.app";
function request(origin?: string, extra: Record<string, string> = {}, url = "http://localhost:8080/api/auth/login") {
  return new Request(url, { method: "POST", headers: { ...(origin === undefined ? {} : { origin }), ...extra } });
}

describe("request origins behind Railway TLS termination", () => {
  it("accepts the public HTTPS origin when Next sees an internal HTTP URL", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", domain);
    expect(hasAllowedRequestOrigin(request(`https://${domain}`))).toBe(true);
  });
  it.each(["https://attacker.invalid", `http://${domain}`, `https://${domain}.attacker.invalid`, "null", `https://${domain}/`, `https://${domain}:8443`])("rejects foreign or noncanonical origin %s", (origin) => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", domain);
    expect(hasAllowedRequestOrigin(request(origin))).toBe(false);
  });
  it("does not trust spoofed forwarded host and protocol headers", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", domain);
    expect(hasAllowedRequestOrigin(request("https://attacker.invalid", { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" }))).toBe(false);
  });
  it("rejects cross-site requests even without Origin", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", domain);
    expect(hasAllowedRequestOrigin(request(undefined, { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
  it("preserves requests without Origin for non-browser clients", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", domain);
    expect(hasAllowedRequestOrigin(request())).toBe(true);
  });
  it("preserves exact origin checks for local development", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "");
    expect(hasAllowedRequestOrigin(request("http://localhost:3000", {}, "http://localhost:3000/api/auth/login"))).toBe(true);
    expect(hasAllowedRequestOrigin(request("http://localhost:3001", {}, "http://localhost:3000/api/auth/login"))).toBe(false);
  });
  it("fails closed for malformed deployment domains", () => {
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "trusted.invalid/redirect");
    expect(hasAllowedRequestOrigin(request("https://trusted.invalid"))).toBe(false);
  });
});
