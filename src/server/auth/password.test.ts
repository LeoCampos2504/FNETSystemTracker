import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("never stores the plain password in the hash", () => {
    const hash = hashPassword("demo1234");
    expect(hash).not.toBe("demo1234");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt hash format
  });

  it("verifies a matching password", () => {
    const hash = hashPassword("demo1234");
    expect(verifyPassword("demo1234", hash)).toBe(true);
  });

  it("rejects a non-matching password", () => {
    const hash = hashPassword("demo1234");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });
});
