import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { repositories } from "@/server/container";
import { PUT } from "./route";

async function putAssignments(taskId: string, body: unknown, claims: Parameters<typeof authedRequest>[1]) {
  const request = await authedRequest(`http://localhost/api/tasks/${taskId}/assignments`, claims, jsonInit("PUT", body));
  return PUT(request, { params: Promise.resolve({ id: taskId }) });
}

describe("PUT /api/tasks/[id]/assignments", () => {
  it("succeeds for a coordinator in the task's own zone and audits the change", async () => {
    // task-C0001 is zone-noa, tech-01/tech-02, URGENT corrective, today.
    const response = await putAssignments(
      "task-C0001",
      { assignments: [{ technicianId: "tech-03", crewRole: "PRIMARY" }] },
      sessions.coord1,
    );
    expect(response.status).toBe(200);
    const task = await response.json();
    expect(task.assignments).toEqual([{ technicianId: "tech-03", crewRole: "PRIMARY" }]);

    const auditEntries = await repositories.audit.listByEntity("Task", "task-C0001");
    expect(auditEntries.at(-1)?.action).toBe("TASK_ASSIGNMENTS_UPDATED");
  });

  it("401s with no session", async () => {
    const request = unauthedRequest("http://localhost/api/tasks/task-C0001/assignments", jsonInit("PUT", {}));
    const response = await PUT(request, { params: Promise.resolve({ id: "task-C0001" }) });
    expect(response.status).toBe(401);
  });

  it("403s a technician (technicians never mutate tasks)", async () => {
    const response = await putAssignments(
      "task-C0001",
      { assignments: [{ technicianId: "tech-03", crewRole: "PRIMARY" }] },
      sessions.tech01,
    );
    expect(response.status).toBe(403);
  });

  it("403s a coordinator acting on a task outside their zones", async () => {
    // task-C0002 is zone-cuyo (coord-2's zone), coord-1 doesn't own it.
    const response = await putAssignments(
      "task-C0002",
      { assignments: [{ technicianId: "tech-06", crewRole: "PRIMARY" }] },
      sessions.coord1,
    );
    expect(response.status).toBe(403);
  });

  it("400s on two PRIMARY technicians", async () => {
    const response = await putAssignments(
      "task-C0001",
      {
        assignments: [
          { technicianId: "tech-01", crewRole: "PRIMARY" },
          { technicianId: "tech-02", crewRole: "PRIMARY" },
        ],
      },
      sessions.coord1,
    );
    expect(response.status).toBe(400);
  });

  it("400s on more than two technicians", async () => {
    const response = await putAssignments(
      "task-C0001",
      {
        assignments: [
          { technicianId: "tech-01", crewRole: "PRIMARY" },
          { technicianId: "tech-02", crewRole: "COLLABORATOR" },
          { technicianId: "tech-03", crewRole: "COLLABORATOR" },
        ],
      },
      sessions.coord1,
    );
    expect(response.status).toBe(400);
  });

  it("400s on a duplicate technicianId", async () => {
    const response = await putAssignments(
      "task-C0001",
      {
        assignments: [
          { technicianId: "tech-01", crewRole: "PRIMARY" },
          { technicianId: "tech-01", crewRole: "COLLABORATOR" },
        ],
      },
      sessions.coord1,
    );
    expect(response.status).toBe(400);
  });

  it("400s on an unknown technicianId", async () => {
    const response = await putAssignments(
      "task-C0001",
      { assignments: [{ technicianId: "does-not-exist", crewRole: "PRIMARY" }] },
      sessions.coord1,
    );
    expect(response.status).toBe(400);
  });

  it("404s (task doesn't exist — this mutation has no null variant)", async () => {
    const response = await putAssignments(
      "does-not-exist",
      { assignments: [{ technicianId: "tech-01", crewRole: "PRIMARY" }] },
      sessions.admin,
    );
    expect(response.status).toBe(404);
  });

  it("409s an already-APPROVED task", async () => {
    // task-P0006 is APPROVED (see src/mocks/tasks.ts).
    const response = await putAssignments(
      "task-P0006",
      { assignments: [{ technicianId: "tech-01", crewRole: "PRIMARY" }] },
      sessions.admin,
    );
    expect(response.status).toBe(409);
  });
});
