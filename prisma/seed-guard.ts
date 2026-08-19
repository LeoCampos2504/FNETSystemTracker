/**
 * Pure decision logic for whether prisma/seed.ts (a destructive
 * delete-then-reinsert script — see clearDatabase() in seed.ts) is allowed
 * to run. Deliberately has zero I/O and zero Prisma imports so it can be
 * unit-tested without touching a database (see prisma/tests/seed-guard.test.ts).
 *
 * Semantics:
 *   NODE_ENV !== "production"                                    -> allowed
 *   NODE_ENV === "production" && FNET_ALLOW_DESTRUCTIVE_SEED === "true"  -> allowed (explicit override)
 *   NODE_ENV === "production" && anything else                   -> blocked
 *
 * The override must be the exact string "true" — no truthy-string
 * shortcuts ("1", "yes", "TRUE"), no silent fallback. Blocking is the
 * default for any unrecognized override value.
 */
export interface SeedGuardEnv {
  NODE_ENV?: string;
  FNET_ALLOW_DESTRUCTIVE_SEED?: string;
}

export interface SeedGuardDecision {
  allowed: boolean;
  /** Safe to log/print — never includes env values beyond NODE_ENV, never a secret. */
  reason: string;
}

export function assertDestructiveSeedAllowed(env: SeedGuardEnv): SeedGuardDecision {
  const nodeEnv = env.NODE_ENV ?? "development";

  if (nodeEnv !== "production") {
    return {
      allowed: true,
      reason: `NODE_ENV="${nodeEnv}" (not "production") — destructive seed allowed.`,
    };
  }

  if (env.FNET_ALLOW_DESTRUCTIVE_SEED === "true") {
    return {
      allowed: true,
      reason: 'NODE_ENV="production" but FNET_ALLOW_DESTRUCTIVE_SEED="true" — explicit override, destructive seed allowed.',
    };
  }

  return {
    allowed: false,
    reason:
      'Destructive seed refused in production. NODE_ENV="production" and FNET_ALLOW_DESTRUCTIVE_SEED is not exactly "true". ' +
      "This is not something to run against a production database as part of a normal deploy — see docs/DB_PRODUCTION_RUNBOOK.md. " +
      'If this is a deliberate, human-approved one-off operation, re-run with FNET_ALLOW_DESTRUCTIVE_SEED=true.',
  };
}
