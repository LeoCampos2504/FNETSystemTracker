import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { repositories } from "@/server/container";
import { GET, PATCH } from "./route";

describe("GET /api/guards/[id]", () => {
  it("200s for a technician who is part of the guard", async () => {
    // guard-centro-3 is the mixed crew tech-09/tech-05 (see src/mocks/guards.ts).
    const request = await authedRequest("http://localhost/api/guards/guard-centro-3", {
      sub: "user-tech-05",
      role: sessions.tech01.role,
      technicianId: "tech-05",
      coordinatorId: null,
    });
    const response = await GET(request, { params: Promise.resolve({ id: "guard-centro-3" }) });
    expect(response.status).toBe(200);
  });

  it("403s a technician not part of the guard", async () => {
    const request = await authedRequest("http://localhost/api/guards/guard-centro-3", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "guard-centro-3" }) });
    expect(response.status).toBe(403);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/guards/guard-noa-1"), {
      params: Promise.resolve({ id: "guard-noa-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("404s an unknown guard (this endpoint is additional, not part of Api — no null contract to honor)", async () => {
    const request = await authedRequest("http://localhost/api/guards/does-not-exist", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/guards/[id]", () => {
  it("succeeds for a coordinator in their own zone and audits the change", async () => {
    // guard-cuyo-1 is zone-cuyo, tech-06/tech-07.
    const request = await authedRequest(
      "http://localhost/api/guards/guard-cuyo-1",
      sessions.coord2,
      jsonInit("PATCH", { endAt: "2026-08-10T08:00:00.000Z" }),
    );
    const response = await PATCH(request, { params: Promise.resolve({ id: "guard-cuyo-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).endAt).toBe("2026-08-10T08:00:00.000Z");

    const auditEntries = await repositories.audit.listByEntity("Guard", "guard-cuyo-1");
    expect(auditEntries.at(-1)?.action).toBe("GUARD_UPDATED");
  });

  it("401s with no session", async () => {
    const request = unauthedRequest("http://localhost/api/guards/guard-cuyo-1", jsonInit("PATCH", {}));
    const response = await PATCH(request, { params: Promise.resolve({ id: "guard-cuyo-1" }) });
    expect(response.status).toBe(401);
  });

  it("403s a technician", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards/guard-cuyo-1",
      sessions.tech01,
      jsonInit("PATCH", { endAt: "2026-08-10T08:00:00.000Z" }),
    );
    const response = await PATCH(request, { params: Promise.resolve({ id: "guard-cuyo-1" }) });
    expect(response.status).toBe(403);
  });

  it("403s a coordinator acting outside their zones", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards/guard-cuyo-1",
      sessions.coord1,
      jsonInit("PATCH", { endAt: "2026-08-10T08:00:00.000Z" }),
    );
    const response = await PATCH(request, { params: Promise.resolve({ id: "guard-cuyo-1" }) });
    expect(response.status).toBe(403);
  });

  it("400s an empty patch body", async () => {
    const request = await authedRequest("http://localhost/api/guards/guard-cuyo-1", sessions.admin, jsonInit("PATCH", {}));
    const response = await PATCH(request, { params: Promise.resolve({ id: "guard-cuyo-1" }) });
    expect(response.status).toBe(400);
  });

  it("400s when a lone startAt patch would cross the guard's existing endAt", async () => {
    // guard-cuyo-2's original endAt is 2026-08-15T08:00:00.000Z (see
    // src/mocks/guards.ts fridayBoundaries) — untouched by other tests in
    // this file, so this doesn't depend on execution order.
    const request = await authedRequest(
      "http://localhost/api/guards/guard-cuyo-2",
      sessions.admin,
      jsonInit("PATCH", { startAt: "2026-08-20T08:00:00.000Z" }),
    );
    const response = await PATCH(request, { params: Promise.resolve({ id: "guard-cuyo-2" }) });
    expect(response.status).toBe(400);
  });

  it("404s an unknown guard", async () => {
    const request = await authedRequest(
      "http://localhost/api/guards/does-not-exist",
      sessions.admin,
      jsonInit("PATCH", { endAt: "2026-08-10T08:00:00.000Z" }),
    );
    const response = await PATCH(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(404);
  });
});
