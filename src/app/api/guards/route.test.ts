import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET, POST } from "./route";

describe("GET /api/guards", () => {
  it("200s for admin", async () => {
    const request = await authedRequest("http://localhost/api/guards", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect((await response.json()).length).toBeGreaterThan(0);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/guards"));
    expect(response.status).toBe(401);
  });

  it("403s a coordinator filtering by a zone they don't own", async () => {
    const request = await authedRequest("http://localhost/api/guards?zoneId=zone-cuyo", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("scopes a technician to guards they're actually part of", async () => {
    const request = await authedRequest("http://localhost/api/guards", sessions.tech01);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const guards = await response.json();
    for (const guard of guards) expect(guard.technicianIds).toContain("tech-01");
  });
});

describe("POST /api/guards", () => {
  it("succeeds (201) for a coordinator creating a guard in their own zone", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.coord1,
      jsonInit("POST", {
        zoneId: "zone-noa",
        technicianIds: ["tech-01"],
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-08T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(201);
    const guard = await response.json();
    expect(guard.zoneId).toBe("zone-noa");
    expect(guard.id).toEqual(expect.any(String));
  });

  it("401s with no session", async () => {
    const request = unauthedRequest("http://localhost/api/guards", jsonInit("POST", {}));
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("403s a technician (technicians never create guards)", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.tech01,
      jsonInit("POST", {
        zoneId: "zone-noa",
        technicianIds: ["tech-01"],
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-08T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("403s a coordinator creating a guard in a zone they don't own", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.coord1,
      jsonInit("POST", {
        zoneId: "zone-cuyo",
        technicianIds: ["tech-06"],
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-08T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("400s when startAt >= endAt", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.coord1,
      jsonInit("POST", {
        zoneId: "zone-noa",
        technicianIds: ["tech-01"],
        startAt: "2026-10-08T08:00:00.000Z",
        endAt: "2026-10-01T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("400s on a duplicate technicianId", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.coord1,
      jsonInit("POST", {
        zoneId: "zone-noa",
        technicianIds: ["tech-01", "tech-01"],
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-08T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("400s on an unknown technicianId", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.admin,
      jsonInit("POST", {
        zoneId: "zone-noa",
        technicianIds: ["does-not-exist"],
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-08T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("400s on an unknown zoneId", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards",
      sessions.admin,
      jsonInit("POST", {
        zoneId: "does-not-exist",
        technicianIds: ["tech-01"],
        startAt: "2026-10-01T08:00:00.000Z",
        endAt: "2026-10-08T08:00:00.000Z",
      }),
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
