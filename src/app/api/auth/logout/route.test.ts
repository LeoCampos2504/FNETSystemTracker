import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie with the same attributes it was set with", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("fnet_session=");
    expect(setCookie).toMatch(/Max-Age=0/i); // deletion
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie).toContain("Path=/");
  });

  it("is idempotent — works the same with no prior session", async () => {
    // POST takes no request/cookie input at all, so "no session" and "existing
    // session" produce identical behavior; this documents that on purpose.
    const response = await POST();
    expect(response.status).toBe(200);
  });

  it("returns application/json", async () => {
    const response = await POST();
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
