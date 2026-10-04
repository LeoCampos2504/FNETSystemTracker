import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import { canAccessGlobalData } from "@/server/access";

describe("global database access gate", () => {
  it("allows global access only to administrators until scoped access is implemented", () => {
    expect(canAccessGlobalData(UserRole.ADMIN)).toBe(true);
    expect(canAccessGlobalData(UserRole.MANAGER)).toBe(false);
    expect(canAccessGlobalData(UserRole.COORDINATOR)).toBe(false);
    expect(canAccessGlobalData(UserRole.TECHNICIAN)).toBe(false);
  });
});
