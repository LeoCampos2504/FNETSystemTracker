import { describe, expect, it } from "vitest";
import { MOCK_TODAY, toDateString } from "@/mocks";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/tasks/pending", () => {
  it("200s for admin and only returns tasks scheduled on/before the date, not completed", async () => {
    const request = await authedRequest("http://localhost/api/tasks/pending", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const tasks = await response.json();
    expect(tasks.length).toBeGreaterThan(0);
    const today = toDateString(MOCK_TODAY);
    for (const task of tasks) {
      expect(task.scheduledDate <= today).toBe(true);
      expect(["APPROVED", "APPROVED_WITH_PENDING"]).not.toContain(task.status);
    }
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/tasks/pending"));
    expect(response.status).toBe(401);
  });

  it("403s a coordinator filtering by a technician outside their zones", async () => {
    // tech-06 is in zone-cuyo (coord-2's zone); coord-1 owns zone-noa/zone-nea.
    const request = await authedRequest(
      "http://localhost/api/tasks/pending?technicianId=tech-06",
      sessions.coord1,
    );
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("400s on a malformed asOfDate", async () => {
    const request = await authedRequest("http://localhost/api/tasks/pending?asOfDate=not-a-date", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("lets a technician see their own pending tasks", async () => {
    const request = await authedRequest("http://localhost/api/tasks/pending", sessions.tech01);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const tasks = await response.json();
    for (const task of tasks) {
      expect(task.assignments.some((a: { technicianId: string }) => a.technicianId === "tech-01")).toBe(true);
    }
  });
});
