import { afterAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { MOCK_DEMO_PASSWORD } from "@/mocks";
import { authCredentialsPrismaRepository } from "@/server/repositories/prisma";
import { prisma } from "@/server/repositories/prisma/client";

/**
 * AuthCredentialsRepository is the one adapter that touches a secret value.
 * These tests deliberately never `console.log`/print the hash itself — only
 * assert on it (matches, comparisons) — and never call bcrypt.compare
 * against anything but the known DEMO password already documented in
 * docs/DATABASE.md. No login flow is exercised here; that's Leo's
 * AuthService, once it's wired to this adapter.
 */
describe("authCredentialsPrismaRepository (real DB)", () => {
  it("user existente -> devuelve el hash", async () => {
    const hash = await authCredentialsPrismaRepository.getPasswordHash("user-admin-1");
    expect(hash).not.toBeNull();
    expect(typeof hash).toBe("string");
  });

  it("user inexistente -> null", async () => {
    expect(await authCredentialsPrismaRepository.getPasswordHash("user-does-not-exist")).toBeNull();
  });

  it("el resultado tiene el formato bcrypt esperado ($2a$/$2b$/$2y$, cost factor)", async () => {
    const hash = await authCredentialsPrismaRepository.getPasswordHash("user-admin-1");
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("nunca devuelve la contraseña en texto plano", async () => {
    const hash = await authCredentialsPrismaRepository.getPasswordHash("user-admin-1");
    expect(hash).not.toBe(MOCK_DEMO_PASSWORD);
    expect(hash).not.toContain(MOCK_DEMO_PASSWORD);
  });

  it("dos usuarios distintos devuelven sus propios hashes (cada uno verifica contra la misma password demo)", async () => {
    const hashAdmin = await authCredentialsPrismaRepository.getPasswordHash("user-admin-1");
    const hashTech = await authCredentialsPrismaRepository.getPasswordHash("user-tech-01");
    expect(hashAdmin).not.toBeNull();
    expect(hashTech).not.toBeNull();
    // bcrypt salts independently, so identical plaintext passwords produce different hash strings.
    expect(hashAdmin).not.toBe(hashTech);
    // but both are real, valid bcrypt hashes of the documented demo password.
    await expect(bcrypt.compare(MOCK_DEMO_PASSWORD, hashAdmin!)).resolves.toBe(true);
    await expect(bcrypt.compare(MOCK_DEMO_PASSWORD, hashTech!)).resolves.toBe(true);
  });

  it("un usuario inactive sigue teniendo el hash accesible (active/inactive es política de AuthService, no de este adapter)", async () => {
    const user = await prisma.user.findUnique({ where: { id: "user-tech-14" } });
    expect(user?.active).toBe(false); // confirms the fixture is actually inactive

    const hash = await authCredentialsPrismaRepository.getPasswordHash("user-tech-14");
    expect(hash).not.toBeNull();
    await expect(bcrypt.compare(MOCK_DEMO_PASSWORD, hash!)).resolves.toBe(true);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
