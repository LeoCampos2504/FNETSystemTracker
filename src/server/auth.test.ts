import { describe, expect, it } from "vitest";
import { UserRole, type User } from "@/contracts";
import { createSessionToken, databaseUserToContract, hashSessionToken, isSessionTokenFormat } from "./auth";

describe("server-side sessions", () => {
  it("creates a fresh opaque token with enough entropy for a session identifier", () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(isSessionTokenFormat(first)).toBe(true);
  });

  it("stores only a stable one-way digest of the session token", () => {
    const token = createSessionToken();
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
    expect(isSessionTokenFormat("short-token")).toBe(false);
  });

  it("rejects roles that are not part of the current contract", () => {
    expect(() => databaseUserToContract({ id: "x", email: "x@fnet.local", name: "X", role: "OWNER", technicianId: null, coordinatorId: null, active: true })).toThrow("INVALID_USER_ROLE");
  });

  it("keeps the current user contract fields when reading the database row", () => {
    const user: User = {
      id: "user-1", email: "admin@fnet.local", name: "FNET Admin", role: UserRole.ADMIN,
      technicianId: null, coordinatorId: null, active: true,
    };
    expect(databaseUserToContract({ ...user })).toEqual(user);
  });
});
