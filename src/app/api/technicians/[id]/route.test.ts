import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { signSession } from "@/server/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/server/auth/env";
import { GET } from "./route";

async function requestAs(technicianId: string, claims: Parameters<typeof signSession>[0]): Promise<Response> {
  const { token } = await signSession(claims);
  const request = new NextRequest(`http://localhost/api/technicians/${technicianId}`, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
  return GET(request, { params: Promise.resolve({ id: technicianId }) });
}

describe("GET /api/technicians/[id]", () => {
  it("lets a technician view their own profile", async () => {
    const response = await requestAs("tech-01", {
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("tech-01");
  });

  it("forbids technician A from viewing technician B's profile", async () => {
    const response = await requestAs("tech-02", {
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });
    expect(response.status).toBe(403);
  });

  it("lets a coordinator view a technician in their own zone", async () => {
    // coord-1 owns zone-noa; tech-01 is in zone-noa (see src/mocks).
    const response = await requestAs("tech-01", {
      sub: "user-coord-1",
      role: UserRole.COORDINATOR,
      technicianId: null,
      coordinatorId: "coord-1",
    });
    expect(response.status).toBe(200);
  });

  it("forbids a coordinator from viewing a technician outside their zones", async () => {
    // coord-1 owns zone-noa/zone-nea; tech-06 is in zone-cuyo (coord-2's zone).
    const response = await requestAs("tech-06", {
      sub: "user-coord-1",
      role: UserRole.COORDINATOR,
      technicianId: null,
      coordinatorId: "coord-1",
    });
    expect(response.status).toBe(403);
  });

  it("lets an admin view any technician", async () => {
    const response = await requestAs("tech-06", {
      sub: "user-admin-1",
      role: UserRole.ADMIN,
      technicianId: null,
      coordinatorId: null,
    });
    expect(response.status).toBe(200);
  });

  it("resolves null (200) for an unknown technician id, matching Api.getTechnician(): Promise<Technician | null>", async () => {
    const response = await requestAs("does-not-exist", {
      sub: "user-admin-1",
      role: UserRole.ADMIN,
      technicianId: null,
      coordinatorId: null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("returns 401 with no session", async () => {
    const request = new NextRequest("http://localhost/api/technicians/tech-01");
    const response = await GET(request, { params: Promise.resolve({ id: "tech-01" }) });
    expect(response.status).toBe(401);
  });
});
