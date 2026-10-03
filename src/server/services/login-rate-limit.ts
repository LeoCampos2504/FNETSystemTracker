import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/server/prisma";

const WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_IP_LIMIT = 30;
export const LOGIN_ACCOUNT_LIMIT = 10;

export function makeLoginRateLimitKey(scope: "ip" | "account", value: string): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) throw new Error("AUTH_SECRET_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
}

export function isLoginRateLimited(
  attemptCount: number,
  windowStartedAt: Date,
  maximum: number,
  now = new Date(),
): boolean {
  return attemptCount > maximum && now.getTime() - windowStartedAt.getTime() < WINDOW_MS;
}

/** Atomically reserves an attempt so concurrent requests cannot all pass a read-then-increment check. */
export async function consumeLoginRateLimit(
  key: string,
  maximum: number,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const rows = await getPrismaClient().$queryRaw<Array<{ attempt_count: number; window_started_at: Date }>>(Prisma.sql`
    INSERT INTO "app_login_attempts" ("key_hash", "attempt_count", "window_started_at")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key_hash") DO UPDATE SET
      "attempt_count" = CASE
        WHEN "app_login_attempts"."window_started_at" <= NOW() - INTERVAL '15 minutes' THEN 1
        ELSE "app_login_attempts"."attempt_count" + 1
      END,
      "window_started_at" = CASE
        WHEN "app_login_attempts"."window_started_at" <= NOW() - INTERVAL '15 minutes' THEN NOW()
        ELSE "app_login_attempts"."window_started_at"
      END
    RETURNING "attempt_count", "window_started_at"
  `);
  const state = rows[0];
  if (!state || !isLoginRateLimited(state.attempt_count, state.window_started_at, maximum)) {
    return { limited: false, retryAfterSeconds: 0 };
  }
  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((state.window_started_at.getTime() + WINDOW_MS - Date.now()) / 1000)),
  };
}

export async function clearLoginRateLimit(key: string): Promise<void> {
  await getPrismaClient().app_login_attempts.deleteMany({ where: { keyHash: key } });
}
