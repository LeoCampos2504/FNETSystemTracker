import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { repositories } from "@/server/container";
import { PUT } from "./route";

async function putStatus(taskId: string, status: string, claims: Parameters<typeof authedRequest>[1]) {
  const request = await authedRequest(
    `http://localhost/api/tasks/${taskId}/status`,
    claims,
    jsonInit("PUT", { status }),
  );
  return PUT(request, { params: Promise.resolve({ id: taskId }) });
}

describe("PUT /api/tasks/[id]/status", () => {
  it("succeeds and audits old->new status", async () => {
    // task-C0101 is zone-nea, OPEN, tech-04/tech-05, dayOffset -1.
    const response = await putStatus("task-C0101", "IN_PROGRESS", sessions.coord1);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("IN_PROGRESS");

    const auditEntries = await repositories.audit.listByEntity("Task", "task-C0101");
    const entry = auditEntries.at(-1)!;
    expect((entry.before as { status: string }).status).toBe("OPEN");
    expect((entry.after as { status: string }).status).toBe("IN_PROGRESS");
  });

  it("401s with no session", async () => {
    const request = unauthedRequest("http://localhost/api/tasks/task-C0101/status", jsonInit("PUT", { status: "OPEN" }));
    const response = await PUT(request, { params: Promise.resolve({ id: "task-C0101" }) });
    expect(response.status).toBe(401);
  });

  it("403s a technician", async () => {
    const response = await putStatus("task-C0101", "IN_PROGRESS", sessions.tech01);
    expect(response.status).toBe(403);
  });

  it("403s a coordinator acting outside their zones", async () => {
    // task-C0101 is zone-nea; coord2 owns zone-cuyo/zone-centro.
    const response = await putStatus("task-C0101", "IN_PROGRESS", sessions.coord2);
    expect(response.status).toBe(403);
  });

  it("400s an invalid status value", async () => {
    const response = await putStatus("task-C0101", "DONE", sessions.coord1);
    expect(response.status).toBe(400);
  });

  it("404s an unknown task", async () => {
    const response = await putStatus("does-not-exist", "IN_PROGRESS", sessions.admin);
    expect(response.status).toBe(404);
  });
});
