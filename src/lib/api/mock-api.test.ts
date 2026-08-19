import { describe, expect, it } from "vitest";
import { mockApi } from "./mock-api";
import { MOCK_TODAY, mockTechnicians, toDateString } from "@/mocks";

describe("mock-api", () => {
  it("logs in a known user and exposes them as the current user", async () => {
    const session = await mockApi.login({ email: "admin@fnet.local", password: "demo1234" });
    expect(session.user.email).toBe("admin@fnet.local");

    const currentUser = await mockApi.getCurrentUser();
    expect(currentUser?.id).toBe(session.user.id);
  });

  it("rejects login for an unknown email", async () => {
    await expect(mockApi.login({ email: "nobody@fnet.local", password: "x" })).rejects.toThrow();
  });

  it("returns today's tasks scheduled for the mock 'today'", async () => {
    const tasks = await mockApi.getTodayTasks({});
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.scheduledDate).toBe(toDateString(MOCK_TODAY));
    }
  });

  it("filters today's tasks by zone", async () => {
    const tasks = await mockApi.getTodayTasks({ zoneId: "zone-noa" });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.zoneId).toBe("zone-noa");
    }
  });

  it("returns pending tasks from previous days", async () => {
    const tasks = await mockApi.getPendingTasks({});
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.scheduledDate <= toDateString(MOCK_TODAY)).toBe(true);
    }
  });

  it("returns KPIs for a technician matching the contract shape", async () => {
    const technicianId = mockTechnicians[0].id;
    const kpis = await mockApi.getTechnicianKpis(technicianId);

    expect(kpis).not.toBeNull();
    expect(kpis?.technicianId).toBe(technicianId);
    expect(typeof kpis?.complianceRate).toBe("number");
    expect(typeof kpis?.rejections).toBe("number");
  });

  it("returns null for an unknown technician", async () => {
    const kpis = await mockApi.getTechnicianKpis("does-not-exist");
    expect(kpis).toBeNull();
  });
});
