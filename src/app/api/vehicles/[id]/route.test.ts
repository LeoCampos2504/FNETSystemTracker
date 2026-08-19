import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/vehicles/[id]", () => {
  it("200s for admin", async () => {
    const request = await authedRequest("http://localhost/api/vehicles/veh-01", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "veh-01" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("veh-01");
  });

  it("200s for the technician the vehicle is assigned to", async () => {
    const request = await authedRequest("http://localhost/api/vehicles/veh-01", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "veh-01" }) });
    expect(response.status).toBe(200);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/vehicles/veh-01"), {
      params: Promise.resolve({ id: "veh-01" }),
    });
    expect(response.status).toBe(401);
  });

  it("403s a technician the vehicle is NOT assigned to", async () => {
    // veh-01 is tech-01's; tech-06 has no claim to it.
    const request = await authedRequest("http://localhost/api/vehicles/veh-01", sessions.tech06);
    const response = await GET(request, { params: Promise.resolve({ id: "veh-01" }) });
    expect(response.status).toBe(403);
  });

  it("403s a coordinator outside the assigned technician's zone", async () => {
    // veh-01 -> tech-01 -> zone-noa; coord2 owns zone-cuyo/zone-centro.
    const request = await authedRequest("http://localhost/api/vehicles/veh-01", sessions.coord2);
    const response = await GET(request, { params: Promise.resolve({ id: "veh-01" }) });
    expect(response.status).toBe(403);
  });

  it("resolves null (200) for an unknown vehicle id", async () => {
    const request = await authedRequest("http://localhost/api/vehicles/does-not-exist", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("403s a non-admin for a vehicle with no assigned technician (nothing to authorize against, deny by default)", async () => {
    // veh-08 has assignedTechnicianId: null (see src/mocks/vehicles.ts).
    const request = await authedRequest("http://localhost/api/vehicles/veh-08", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "veh-08" }) });
    expect(response.status).toBe(403);
  });

  it("200s admin for a vehicle with no assigned technician", async () => {
    const request = await authedRequest("http://localhost/api/vehicles/veh-08", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "veh-08" }) });
    expect(response.status).toBe(200);
  });
});
