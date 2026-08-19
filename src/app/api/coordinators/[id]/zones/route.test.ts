import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/coordinators/[id]/zones", () => {
  it("200s for admin querying any coordinator", async () => {
    const request = await authedRequest("http://localhost/api/coordinators/coord-2/zones", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "coord-2" }) });
    expect(response.status).toBe(200);
    const zones = await response.json();
    expect(zones.map((z: { id: string }) => z.id).sort()).toEqual(["zone-centro", "zone-cuyo"]);
  });

  it("200s for a coordinator querying their own id", async () => {
    const request = await authedRequest("http://localhost/api/coordinators/coord-1/zones", sessions.coord1);
    const response = await GET(request, { params: Promise.resolve({ id: "coord-1" }) });
    expect(response.status).toBe(200);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/coordinators/coord-1/zones"), {
      params: Promise.resolve({ id: "coord-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("403s a technician", async () => {
    const request = await authedRequest("http://localhost/api/coordinators/coord-1/zones", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "coord-1" }) });
    expect(response.status).toBe(403);
  });

  it("403s a coordinator querying a different coordinator's id", async () => {
    const request = await authedRequest("http://localhost/api/coordinators/coord-2/zones", sessions.coord1);
    const response = await GET(request, { params: Promise.resolve({ id: "coord-2" }) });
    expect(response.status).toBe(403);
  });

  it("returns an empty array (not an error) for an unknown coordinator id", async () => {
    const request = await authedRequest("http://localhost/api/coordinators/does-not-exist/zones", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
