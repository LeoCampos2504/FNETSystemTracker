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

  it("returns 400 for an invalid body", async () => {
    const response = await POST(loginRequest({ email: "not-an-email" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
