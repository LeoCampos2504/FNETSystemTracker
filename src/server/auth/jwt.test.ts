import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import { signSession, verifySession } from "./jwt";

describe("session JWT", () => {
  it("signs and verifies a round trip", async () => {
    const { token, expiresAt } = await signSession({
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });

    expect(typeof token).toBe("string");
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const claims = await verifySession(token);
    expect(claims).toEqual({
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });
  });

  it("rejects a tampered token", async () => {
    const { token } = await signSession({
      sub: "user-tech-01",
      role: UserRole.TECHNICIAN,
      technicianId: "tech-01",
      coordinatorId: null,
    });
    const tampered = `${token}tampered`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull();
  });
});
