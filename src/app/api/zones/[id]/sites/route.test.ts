import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/zones/[id]/sites", () => {
  it("200s for admin", async () => {
    const request = await authedRequest("http://localhost/api/zones/zone-noa/sites", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "zone-noa" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).length).toBeGreaterThan(0);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/zones/zone-noa/sites"), {
      params: Promise.resolve({ id: "zone-noa" }),
    });
    expect(response.status).toBe(401);
  });

  it("403s a technician", async () => {
    const request = await authedRequest("http://localhost/api/zones/zone-noa/sites", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "zone-noa" }) });
    expect(response.status).toBe(403);
  });

  it("403s a coordinator outside the zone", async () => {
    const request = await authedRequest("http://localhost/api/zones/zone-cuyo/sites", sessions.coord1);
    const response = await GET(request, { params: Promise.resolve({ id: "zone-cuyo" }) });
    expect(response.status).toBe(403);
  });

  it("404s an unknown zone", async () => {
    const request = await authedRequest("http://localhost/api/zones/does-not-exist/sites", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(404);
  });
});
