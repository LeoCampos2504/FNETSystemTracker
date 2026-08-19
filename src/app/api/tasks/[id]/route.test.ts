import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { signSession } from "@/server/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/server/auth/env";
import { GET } from "./route";

async function requestAs(taskId: string, claims: Parameters<typeof signSession>[0]): Promise<Response> {
  const { token } = await signSession(claims);
  const request = new NextRequest(`http://localhost/api/tasks/${taskId}`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
  return GET(request, { params: Promise.resolve({ id: taskId }) });
}

describe("GET /api/tasks/[id]", () => {
  it("returns the task for a technician assigned to it", async () => {
    // task-P0001 is assigned to tech-01/tech-02 (see src/mocks/tasks.ts)
    const response = await requestAs("task-P0001", {
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });
    expect(response.status).toBe(200);
    const task = await response.json();
    expect(task.id).toBe("task-P0001");
  });

  it("forbids a technician not assigned to the task", async () => {
    const response = await requestAs("task-P0001", {
      sub: "user-tech-06",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-06",
      coordinatorId: null,
    });
    expect(response.status).toBe(403);
  });

  it("returns 401 with no session", async () => {
    const request = new NextRequest("http://localhost/api/tasks/task-P0001");
    const response = await GET(request, { params: Promise.resolve({ id: "task-P0001" }) });
    expect(response.status).toBe(401);
  });

  it("resolves null (200) for an unknown task id, matching Api.getTask(): Promise<Task | null>", async () => {
    // Regression test: this used to 404, which broke http-api.ts's contract
    // (its generic `request()` throws on any non-2xx, so httpApi.getTask()
    // would reject instead of resolving null like the Api type promises).
    const response = await requestAs("does-not-exist", {
      sub: "user-admin-1",
      role: UserRole.ADMIN,
      technicianId: null,
      coordinatorId: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("also resolves null for an unknown task id when queried by a technician (nothing to authorize against)", async () => {
    const response = await requestAs("does-not-exist", {
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
