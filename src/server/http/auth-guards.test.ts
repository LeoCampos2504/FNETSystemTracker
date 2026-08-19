import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import type { SessionClaims } from "@/server/auth/session";
import { canAccessTechnician, canAccessZone, requireCoordinatorOrAdmin, requireRole } from "./auth-guards";

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
