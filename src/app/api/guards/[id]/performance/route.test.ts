import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/guards/[id]/performance", () => {
  it("200s with the performance record for admin", async () => {
    const request = await authedRequest("http://localhost/api/guards/guard-noa-1/performance", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "guard-noa-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).guardId).toBe("guard-noa-1");
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/guards/guard-noa-1/performance"), {
      params: Promise.resolve({ id: "guard-noa-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("403s a coordinator outside the guard's zone", async () => {
    const request = await authedRequest("http://localhost/api/guards/guard-cuyo-1/performance", sessions.coord1);
    const response = await GET(request, { params: Promise.resolve({ id: "guard-cuyo-1" }) });
    expect(response.status).toBe(403);
  });

  it("resolves null (200) for an unknown guard, matching Api.getGuardPerformance(): Promise<GuardPerformance | null>", async () => {
    const request = await authedRequest("http://localhost/api/guards/does-not-exist/performance", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
