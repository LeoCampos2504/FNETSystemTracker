import { describe, expect, it } from "vitest";
import { MOCK_DEMO_PASSWORD } from "@/mocks";
import { getUserById, login } from "./auth.service";

describe("auth.service login", () => {
  it("logs in a known user with the correct demo password", async () => {
    const { session } = await login("tech-01@fnet.local", MOCK_DEMO_PASSWORD);
    expect(session.user.email).toBe("tech-01@fnet.local");
    expect(session.token).toEqual(expect.any(String));
  });

  it("rejects an unknown email", async () => {
    await expect(login("nobody@fnet.local", MOCK_DEMO_PASSWORD)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a wrong password", async () => {
    await expect(login("tech-01@fnet.local", "wrong-password")).rejects.toMatchObject({ status: 401 });
  });
});

describe("auth.service.getUserById", () => {
  it("returns the user for a valid id", async () => {
    const user = await getUserById("user-admin-1");
    expect(user?.role).toBe("ADMIN");
  });

  it("returns null for an unknown id", async () => {
    expect(await getUserById("does-not-exist")).toBeNull();
  });
});
