import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/technicians/[id]/vehicle", () => {
  it("200s with the vehicle for the technician themself", async () => {
    // tech-01 has veh-01 assigned (see src/mocks/vehicles.ts).
    const request = await authedRequest("http://localhost/api/technicians/tech-01/vehicle", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "tech-01" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("veh-01");
  });

  it("resolves null (200) for a technician with no vehicle assigned", async () => {
    // tech-02 has no vehicle in the fixture data.
    const request = await authedRequest("http://localhost/api/technicians/tech-02/vehicle", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "tech-02" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/technicians/tech-01/vehicle"), {
      params: Promise.resolve({ id: "tech-01" }),
    });
    expect(response.status).toBe(401);
  });

  it("403s technician A requesting technician B's vehicle", async () => {
    const request = await authedRequest("http://localhost/api/technicians/tech-02/vehicle", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "tech-02" }) });
    expect(response.status).toBe(403);
  });

  it("403s a coordinator outside the technician's zone", async () => {
    const request = await authedRequest("http://localhost/api/technicians/tech-06/vehicle", sessions.coord1);
    const response = await GET(request, { params: Promise.resolve({ id: "tech-06" }) });
    expect(response.status).toBe(403);
  });

  it("resolves null (200) for an unknown technicianId, for any role", async () => {
    const request = await authedRequest("http://localhost/api/technicians/does-not-exist/vehicle", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});
