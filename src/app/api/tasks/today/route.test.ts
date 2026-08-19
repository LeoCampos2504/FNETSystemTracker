import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/tasks/today", () => {
  it("200s for admin with no filters", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const tasks = await response.json();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/tasks/today"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("NOT_AUTHENTICATED");
  });

  it("scopes a coordinator with no filter to the union of their own zones", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const tasks = await response.json();
    for (const task of tasks) expect(["zone-noa", "zone-nea"]).toContain(task.zoneId);
  });

  it("403s a coordinator who filters by a zone they don't own", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today?zoneId=zone-cuyo", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("forces a technician to their own tasks regardless of query params", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today?technicianId=tech-02", sessions.tech01);
    const response = await GET(request);
    expect(response.status).toBe(403); // tech-01 asking for tech-02's tasks
  });

  it("400s on an impossible calendar date", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today?date=2026-13-40", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns an empty array (not an error) for a valid date with no scheduled tasks", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today?date=2020-01-01", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
