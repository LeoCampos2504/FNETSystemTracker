import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import type { SessionClaims } from "@/server/auth/session";
import { SESSION_COOKIE_NAME } from "@/server/auth/env";
import { signSession } from "@/server/auth/jwt";
import {
  canAccessTechnician,
  canAccessTechnicianRecord,
  canAccessZone,
  requireCoordinatorOrAdmin,
  requireRole,
  requireSession,
} from "./auth-guards";

const technicianSession: SessionClaims = {
  sub: "user-tech-01",
  role: UserRole.TECHNICIAN,
  technicianId: "tech-01",
  coordinatorId: null,
};

// coord-1 owns zone-noa and zone-nea (see src/mocks/coordinators.ts)
const coordinatorSession: SessionClaims = {
  sub: "user-coord-1",
  role: UserRole.COORDINATOR,
  technicianId: null,
  coordinatorId: "coord-1",
};

const adminSession: SessionClaims = {
  sub: "user-admin-1",
  role: UserRole.ADMIN,
  technicianId: null,
  coordinatorId: null,
};

describe("TECHNICIAN authorization", () => {
  it("can access only their own technician record", async () => {
    expect(await canAccessTechnician(technicianSession, "tech-01")).toBe(true);
    expect(await canAccessTechnician(technicianSession, "tech-02")).toBe(false);
  });

  it("cannot access any zone", async () => {
    expect(await canAccessZone(technicianSession, "zone-noa")).toBe(false);
  });

  it("is forbidden from coordinator/admin-only actions", () => {
    expect(() => requireCoordinatorOrAdmin(technicianSession)).toThrow();
  });
});

describe("COORDINATOR authorization", () => {
  it("can access zones they own, not zones they don't", async () => {
    expect(await canAccessZone(coordinatorSession, "zone-noa")).toBe(true);
    expect(await canAccessZone(coordinatorSession, "zone-nea")).toBe(true);
    expect(await canAccessZone(coordinatorSession, "zone-cuyo")).toBe(false);
  });

  it("can access technicians whose zone they own", async () => {
    expect(await canAccessTechnician(coordinatorSession, "tech-01")).toBe(true); // zone-noa
    expect(await canAccessTechnician(coordinatorSession, "tech-06")).toBe(false); // zone-cuyo
  });

  it("passes requireCoordinatorOrAdmin", () => {
    expect(() => requireCoordinatorOrAdmin(coordinatorSession)).not.toThrow();
  });
});

describe("ADMIN authorization", () => {
  it("can access any zone and any technician", async () => {
    expect(await canAccessZone(adminSession, "zone-cuyo")).toBe(true);
    expect(await canAccessTechnician(adminSession, "tech-06")).toBe(true);
  });

  it("requireRole is a plain membership check, not an automatic admin bypass", () => {
    expect(() => requireRole(adminSession, [UserRole.ADMIN])).not.toThrow();
    expect(() => requireRole(adminSession, [UserRole.TECHNICIAN])).toThrow();
  });
});

describe("canAccessTechnicianRecord", () => {
  it("matches canAccessTechnician's result for an already-fetched record", async () => {
    const technician = {
      id: "tech-06",
      primaryZoneId: "zone-cuyo",
      onLoanZoneId: null,
    } as Parameters<typeof canAccessTechnicianRecord>[1];

    expect(await canAccessTechnicianRecord(coordinatorSession, technician)).toBe(false); // coord-1 doesn't own zone-cuyo
    expect(await canAccessTechnicianRecord(adminSession, technician)).toBe(true);
  });
});

describe("requireSession re-validates the user on every request", () => {
  async function requestWithSession(claims: SessionClaims): Promise<NextRequest> {
    const { token } = await signSession(claims);
    return new NextRequest("http://localhost/api/whatever", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
  }

  it("accepts a session for a real, active user", async () => {
    const request = await requestWithSession(adminSession);
    await expect(requireSession(request)).resolves.toMatchObject({ sub: "user-admin-1" });
  });

  it("rejects a cryptographically valid token whose user no longer exists", async () => {
    // Regression test: a token only proves the session was valid at login
    // time. Before this fix, requireSession trusted the JWT claims alone,
    // so a deleted/deactivated account's still-unexpired token kept working
    // for up to SESSION_TTL_SECONDS after the account stopped existing.
    const request = await requestWithSession({
      sub: "user-does-not-exist",
      role: UserRole.ADMIN,
      technicianId: null,
      coordinatorId: null,
    });
    await expect(requireSession(request)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a request with no session cookie at all", async () => {
    const request = new NextRequest("http://localhost/api/whatever");
    await expect(requireSession(request)).rejects.toMatchObject({ status: 401 });
  });
});
