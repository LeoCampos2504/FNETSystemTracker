import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { prisma } from "@/server/repositories/prisma/client";

/**
 * Proves the production guard (prisma/seed-guard.ts, wired into
 * prisma/seed.ts) actually stops the destructive seed BEFORE any delete —
 * not just that the pure function returns the right boolean (already
 * covered by prisma/tests/seed-guard.test.ts). A sentinel row is inserted,
 * the seed script is run as a real child process with NODE_ENV=production
 * and no override, and the test asserts both that the process failed AND
 * that the sentinel is still there. Never run against a real production
 * database — this is the local/demo DB.
 */
const SENTINEL_ID = "sentinel-production-guard-smoke";

async function insertSentinel() {
  // AuditLog is the very first table clearDatabase() touches — if the
  // sentinel survives a blocked run, nothing at all was deleted.
  await prisma.auditLog.deleteMany({ where: { id: SENTINEL_ID } }); // clean slate, in case a prior run left it
  await prisma.auditLog.create({
    data: {
      id: SENTINEL_ID,
      actorId: "test-sentinel",
      action: "SENTINEL_MARKER",
      entity: "Test",
      entityId: SENTINEL_ID,
    },
  });
}

function runSeedAsProduction(overrideValue?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  if (overrideValue === undefined) {
    delete env.FNET_ALLOW_DESTRUCTIVE_SEED;
  } else {
    env.FNET_ALLOW_DESTRUCTIVE_SEED = overrideValue;
  }
  return execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    env,
    shell: true,
    stdio: "pipe",
    encoding: "utf-8",
  });
}

describe("seed production safety smoke (real DB)", () => {
  it("NODE_ENV=production without override: seed aborts and the sentinel record survives", async () => {
    await insertSentinel();

    let threw = false;
    let combinedOutput = "";
    try {
      runSeedAsProduction(undefined);
    } catch (error) {
      threw = true;
      const e = error as { stdout?: string; stderr?: string };
      combinedOutput = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(threw, "seed.ts should exit non-zero when blocked in production").toBe(true);
    expect(combinedOutput).toMatch(/Destructive seed refused in production/);
    // never print the connection string, even in a blocked run's output
    expect(combinedOutput).not.toContain("postgres://");

    const sentinel = await prisma.auditLog.findUnique({ where: { id: SENTINEL_ID } });
    expect(sentinel, "sentinel must still exist — the block must happen before any delete").not.toBeNull();
  });

  it("NODE_ENV=production with an incorrect override value: still aborts, sentinel survives", async () => {
    await insertSentinel();

    let threw = false;
    try {
      runSeedAsProduction("1");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const sentinel = await prisma.auditLog.findUnique({ where: { id: SENTINEL_ID } });
    expect(sentinel).not.toBeNull();
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { id: SENTINEL_ID } });
  await prisma.$disconnect();
});
