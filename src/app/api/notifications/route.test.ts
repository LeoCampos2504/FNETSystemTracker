import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET as getNotifications } from "./route";
import { PUT as putAssignments } from "../tasks/[id]/assignments/route";

describe("GET /api/notifications", () => {
  it("200s and returns only the requested user's own notifications", async () => {
    const request = await authedRequest(
      "http://localhost/api/notifications?userId=user-coord-1",
      sessions.coord1,
    );
    const response = await getNotifications(request);
    expect(response.status).toBe(200);
    const notifications = await response.json();
    for (const n of notifications) expect(n.userId).toBe("user-coord-1");
  });

  it("401s with no session", async () => {
    const response = await getNotifications(unauthedRequest("http://localhost/api/notifications?userId=user-coord-1"));
    expect(response.status).toBe(401);
  });

  it("400s when userId is missing", async () => {
    const request = await authedRequest("http://localhost/api/notifications", sessions.admin);
    const response = await getNotifications(request);
    expect(response.status).toBe(400);
  });

  it("403s a user requesting someone else's notifications", async () => {
    const request = await authedRequest(
      "http://localhost/api/notifications?userId=user-coord-2",
      sessions.coord1,
    );
    const response = await getNotifications(request);
    expect(response.status).toBe(403);
  });

  it("lets admin read any user's notifications", async () => {
    const request = await authedRequest("http://localhost/api/notifications?userId=user-tech-01", sessions.admin);
    const response = await getNotifications(request);
    expect(response.status).toBe(200);
  });

  it("resolves an empty array (not an error) for a user with no notifications", async () => {
    const request = await authedRequest("http://localhost/api/notifications?userId=user-tech-13", sessions.admin);
    const response = await getNotifications(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("end-to-end: assigning a technician to a task creates exactly one NEW_TASK notification visible via this route", async () => {
    // task-C0003 is zone-patagonia, tech-12/tech-13 (today, URGENT corrective).
    const assignRequest = await authedRequest(
      "http://localhost/api/tasks/task-C0003/assignments",
      sessions.admin,
      jsonInit("PUT", { assignments: [{ technicianId: "tech-14", crewRole: "PRIMARY" }] }),
    );
    const assignResponse = await putAssignments(assignRequest, { params: Promise.resolve({ id: "task-C0003" }) });
    expect(assignResponse.status).toBe(200);

    const notifRequest = await authedRequest("http://localhost/api/notifications?userId=user-tech-14", sessions.admin);
    const notifResponse = await getNotifications(notifRequest);
    const notifications = await notifResponse.json();

    const newTaskNotifs = notifications.filter(
      (n: { relatedEntityId: string; type: string }) => n.relatedEntityId === "task-C0003" && n.type === "NEW_TASK",
    );
    expect(newTaskNotifs).toHaveLength(1); // exactly one, no duplicates
  });
});
