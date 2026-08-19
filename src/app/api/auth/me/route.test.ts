import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/auth/me", () => {
  it("returns the user for a valid session", async () => {
    const request = await authedRequest("http://localhost/api/auth/me", sessions.tech01);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const user = await response.json();
    expect(user.id).toBe("user-tech-01");
  });

  it("resolves null (200) with no session cookie at all", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/auth/me"));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("resolves null (200) for an invalid/garbage JWT", async () => {
    const request = new NextRequest("http://localhost/api/auth/me", {
      headers: { cookie: "fnet_session=not-a-real-jwt" },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("resolves null (200) for a session whose user no longer exists (stand-in for deactivated-after-issuance)", async () => {
    const request = await authedRequest("http://localhost/api/auth/me", {
      sub: "user-does-not-exist",
      role: sessions.admin.role,
      technicianId: null,
      coordinatorId: null,
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
