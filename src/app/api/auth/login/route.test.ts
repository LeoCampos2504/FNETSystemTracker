import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { MOCK_DEMO_PASSWORD } from "@/mocks";

function loginRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("returns the session and sets an httpOnly session cookie", async () => {
    const response = await POST(loginRequest({ email: "admin@fnet.local", password: MOCK_DEMO_PASSWORD }));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.user.email).toBe("admin@fnet.local");
    expect(body.token).toEqual(expect.any(String));

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("fnet_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("returns 401 for a wrong password", async () => {
    const response = await POST(loginRequest({ email: "admin@fnet.local", password: "wrong-password" }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHENTICATED");
  });

  it("returns 401 for an email that doesn't match any user", async () => {
    // Distinct code path from "wrong password": no user is found at all
    // before a password hash is even looked up.
    const response = await POST(loginRequest({ email: "nobody@fnet.local", password: MOCK_DEMO_PASSWORD }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_AUTHENTICATED");
    expect(body.error.message).not.toMatch(/user|exist/i); // doesn't reveal whether the email exists
  });

  it("returns 400 for an invalid body", async () => {
    const response = await POST(loginRequest({ email: "not-an-email" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 (not 500) for a malformed JSON body", async () => {
    const request = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: "{not-valid-json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets cookie attributes: Path=/, SameSite=Lax, HttpOnly, no Secure outside production", async () => {
    const response = await POST(loginRequest({ email: "admin@fnet.local", password: MOCK_DEMO_PASSWORD }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie.toLowerCase()).toContain("httponly");
    // NODE_ENV is not "production" while running tests.
    expect(setCookie.toLowerCase()).not.toContain("secure");
  });

  it("never includes the password hash in the response body (token is expected, the hash is not)", async () => {
    const response = await POST(loginRequest({ email: "admin@fnet.local", password: MOCK_DEMO_PASSWORD }));
    const text = await response.text();
    expect(text).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix
    expect(text).not.toContain("passwordHash");
  });
});
