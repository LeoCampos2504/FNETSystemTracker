import { describe, expect, it } from "vitest";
import { authedRequest, jsonInit, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { listNotificationsForUser } from "@/server/services/notification.service";
import { PUT } from "./route";

async function putAssignments(guardId: string, technicianIds: string[], claims: Parameters<typeof authedRequest>[1]) {
  const request = await authedRequest(
    `http://localhost/api/guards/${guardId}/assignments`,
    claims,
    jsonInit("PUT", { technicianIds }),
  );
  return PUT(request, { params: Promise.resolve({ id: guardId }) });
}

describe("PUT /api/guards/[id]/assignments", () => {
  it("succeeds, supports a single technician exceptionally, and notifies the newly-added technician", async () => {
    // guard-patagonia-1 is tech-12/tech-13.
    const response = await putAssignments("guard-patagonia-1", ["tech-14"], sessions.admin);
    expect(response.status).toBe(200);
    expect((await response.json()).technicianIds).toEqual(["tech-14"]);

    const notifications = await listNotificationsForUser("user-tech-14");
    expect(notifications.some((n) => n.relatedEntityId === "guard-patagonia-1" && n.type === "GUARD_CHANGE")).toBe(
      true,
    );
  });

  it("401s with no session", async () => {
    const request = unauthedRequest("http://localhost/api/guards/guard-patagonia-2/assignments", jsonInit("PUT", {}));
    const response = await PUT(request, { params: Promise.resolve({ id: "guard-patagonia-2" }) });
    expect(response.status).toBe(401);
  });

  it("403s a technician", async () => {
    const response = await putAssignments("guard-patagonia-2", ["tech-12"], sessions.tech01);
    expect(response.status).toBe(403);
  });

  it("400s a duplicate technicianId", async () => {
    const response = await putAssignments("guard-patagonia-2", ["tech-12", "tech-12"], sessions.admin);
    expect(response.status).toBe(400);
  });

  it("400s more than two technicians", async () => {
    const response = await putAssignments("guard-patagonia-2", ["tech-12", "tech-13", "tech-14"], sessions.admin);
    expect(response.status).toBe(400);
  });

  it("400s an unknown technicianId", async () => {
    const response = await putAssignments("guard-patagonia-2", ["does-not-exist"], sessions.admin);
    expect(response.status).toBe(400);
  });

  it("404s an unknown guard", async () => {
    const response = await putAssignments("does-not-exist", ["tech-12"], sessions.admin);
    expect(response.status).toBe(404);
  });
});
