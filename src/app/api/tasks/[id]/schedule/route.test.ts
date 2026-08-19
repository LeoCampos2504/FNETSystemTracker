import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { repositories } from "@/server/container";
import { listNotificationsForUser } from "@/server/services/notification.service";
import { PUT } from "./route";

async function putSchedule(taskId: string, scheduledDate: string, claims: Parameters<typeof authedRequest>[1]) {
  const request = await authedRequest(
    `http://localhost/api/tasks/${taskId}/schedule`,
    claims,
    jsonInit("PUT", { scheduledDate }),
  );
  return PUT(request, { params: Promise.resolve({ id: taskId }) });
}

describe("PUT /api/tasks/[id]/schedule (also the reschedule endpoint)", () => {
  it("succeeds, audits old->new date, and notifies the assigned crew", async () => {
    // task-P0206 is zone-noa, OPEN, tech-01/tech-02, dayOffset -6.
    const response = await putSchedule("task-P0206", "2026-09-15", sessions.coord1);
    expect(response.status).toBe(200);
    expect((await response.json()).scheduledDate).toBe("2026-09-15");

    const auditEntries = await repositories.audit.listByEntity("Task", "task-P0206");
    const entry = auditEntries.at(-1)!;
    expect((entry.before as { scheduledDate: string }).scheduledDate).not.toBe("2026-09-15");
    expect((entry.after as { scheduledDate: string }).scheduledDate).toBe("2026-09-15");

    const notifications = await listNotificationsForUser("user-tech-01");
    expect(notifications.some((n) => n.relatedEntityId === "task-P0206" && n.type === "SCHEDULE_CHANGE")).toBe(true);
  });

  it("re-calling with the SAME date (no-op) does not add a duplicate notification", async () => {
    const first = await putSchedule("task-P0206", "2026-09-20", sessions.coord1);
    expect(first.status).toBe(200);
    const countBefore = (await listNotificationsForUser("user-tech-01")).filter(
      (n) => n.relatedEntityId === "task-P0206" && n.type === "SCHEDULE_CHANGE",
    ).length;

    const second = await putSchedule("task-P0206", "2026-09-20", sessions.coord1); // identical date
    expect(second.status).toBe(200);
    const countAfter = (await listNotificationsForUser("user-tech-01")).filter(
      (n) => n.relatedEntityId === "task-P0206" && n.type === "SCHEDULE_CHANGE",
    ).length;
    expect(countAfter).toBe(countBefore);
  });

  it("401s with no session", async () => {
    const request = unauthedRequest("http://localhost/api/tasks/task-P0206/schedule", jsonInit("PUT", { scheduledDate: "2026-09-01" }));
    const response = await PUT(request, { params: Promise.resolve({ id: "task-P0206" }) });
    expect(response.status).toBe(401);
  });

  it("403s a technician", async () => {
    const response = await putSchedule("task-P0206", "2026-09-01", sessions.tech01);
    expect(response.status).toBe(403);
  });

  it("400s a malformed date", async () => {
    const response = await putSchedule("task-P0206", "not-a-date", sessions.coord1);
    expect(response.status).toBe(400);
  });

  it("400s an impossible calendar date", async () => {
    const response = await putSchedule("task-P0206", "2026-02-30", sessions.coord1);
    expect(response.status).toBe(400);
  });

  it("404s an unknown task", async () => {
    const response = await putSchedule("does-not-exist", "2026-09-01", sessions.admin);
    expect(response.status).toBe(404);
  });

  it("409s an already-APPROVED task", async () => {
    const response = await putSchedule("task-P0006", "2026-09-01", sessions.admin);
    expect(response.status).toBe(409);
  });
});
