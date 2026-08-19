import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import type { SessionClaims } from "@/server/auth/session";
import { resolveScope } from "./scope";

const technicianSession: SessionClaims = {
  sub: "user-tech-01",
  role: UserRole.TECHNICIAN,
  technicianId: "tech-01",
  coordinatorId: null,
};

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

describe("resolveScope", () => {
  it("forces a technician to their own technicianId regardless of query", async () => {
    const scope = await resolveScope(technicianSession, {});
    expect(scope).toEqual({ technicianId: "tech-01" });
  });

  it("forbids a technician from querying someone else's data", async () => {
    await expect(resolveScope(technicianSession, { technicianId: "tech-02" })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("defaults a coordinator with no filter to all of their zones", async () => {
    const scope = await resolveScope(coordinatorSession, {});
    expect(scope.zoneIds).toEqual(expect.arrayContaining(["zone-noa", "zone-nea"]));
    expect(scope.zoneIds).toHaveLength(2);
  });

  it("lets a coordinator narrow to one of their own zones", async () => {
    const scope = await resolveScope(coordinatorSession, { zoneId: "zone-noa" });
    expect(scope.zoneIds).toEqual(["zone-noa"]);
  });

  it("forbids a coordinator from querying a zone they don't own", async () => {
    await expect(resolveScope(coordinatorSession, { zoneId: "zone-cuyo" })).rejects.toMatchObject({ status: 403 });
  });

  it("lets an admin query anything with no forced scope", async () => {
    const scope = await resolveScope(adminSession, {});
    expect(scope).toEqual({ technicianId: undefined, zoneIds: undefined });
  });
});
