import { describe, expect, it } from "vitest";
import { assertDestructiveSeedAllowed } from "../seed-guard";

/**
 * Pure function tests — no DB, no I/O. Deliberately kept this way (per the
 * task) so blocking behavior can be proven without ever risking a real
 * delete. The DB-touching proof that the block happens BEFORE any delete
 * lives in prisma/tests/seed-production-safety.test.ts (sentinel test).
 */
describe("assertDestructiveSeedAllowed", () => {
  it("DEV (NODE_ENV unset/development): seed permitido", () => {
    expect(assertDestructiveSeedAllowed({}).allowed).toBe(true);
    expect(assertDestructiveSeedAllowed({ NODE_ENV: "development" }).allowed).toBe(true);
  });

  it("TEST (NODE_ENV=test): seed permitido", () => {
    expect(assertDestructiveSeedAllowed({ NODE_ENV: "test" }).allowed).toBe(true);
  });

  it("PRODUCTION sin override: BLOCKED", () => {
    const decision = assertDestructiveSeedAllowed({ NODE_ENV: "production" });
    expect(decision.allowed).toBe(false);
  });

  it('PRODUCTION con override "false": BLOCKED', () => {
    const decision = assertDestructiveSeedAllowed({
      NODE_ENV: "production",
      FNET_ALLOW_DESTRUCTIVE_SEED: "false",
    });
    expect(decision.allowed).toBe(false);
  });

  it("PRODUCTION con override incorrecto (mayúsculas, '1', vacío): BLOCKED — sin fallback silencioso", () => {
    for (const badOverride of ["TRUE", "1", "yes", "", " true", "true "]) {
      const decision = assertDestructiveSeedAllowed({
        NODE_ENV: "production",
        FNET_ALLOW_DESTRUCTIVE_SEED: badOverride,
      });
      expect(decision.allowed, `override=${JSON.stringify(badOverride)} should still block`).toBe(false);
    }
  });

  it('PRODUCTION con override "true" exacto: permitido', () => {
    const decision = assertDestructiveSeedAllowed({
      NODE_ENV: "production",
      FNET_ALLOW_DESTRUCTIVE_SEED: "true",
    });
    expect(decision.allowed).toBe(true);
  });

  it("el reason nunca incluye valores de env más allá de NODE_ENV (nunca un secreto)", () => {
    const decision = assertDestructiveSeedAllowed({
      NODE_ENV: "production",
      FNET_ALLOW_DESTRUCTIVE_SEED: "definitely-not-a-secret-but-still-should-not-appear",
    });
    expect(decision.reason).not.toContain("definitely-not-a-secret-but-still-should-not-appear");
  });
});
