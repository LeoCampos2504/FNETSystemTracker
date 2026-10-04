import { compare } from "bcryptjs";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseUserToContract, SESSION_COOKIE, SESSION_SECONDS } from "@/server/auth";
import { getPrismaClient } from "@/server/prisma";
import { createLoginSession } from "@/server/services/auth-sessions";
import { clearLoginRateLimit, consumeLoginRateLimit, LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT, makeLoginRateLimitKey } from "@/server/services/login-rate-limit";

export const dynamic = "force-dynamic";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
const DUMMY_PASSWORD_HASH = "$2b$12$vGF4wvbz9UdKxF6e0uSxG.UQ/pCJixlRJeLB2ytKLNPJXhRL4Le/.";
const MAX_BODY_BYTES = 8 * 1024;

async function readLimitedJson(request: Request): Promise<{ value?: unknown; tooLarge: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { tooLarge: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { value: JSON.parse(new TextDecoder().decode(body)), tooLarge: false };
  } catch {
    return { tooLarge: false };
  }
}

function clientIp(request: Request): string | null {
  const forwardedIp = request.headers.get("x-real-ip")?.trim();
  if (process.env.NODE_ENV === "production") return forwardedIp && isIP(forwardedIp) ? forwardedIp : null;
  return forwardedIp && isIP(forwardedIp) ? forwardedIp : "local-development";
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ code: "FORBIDDEN" }, 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ code: "FORBIDDEN" }, 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return json({ code: "PAYLOAD_TOO_LARGE" }, 413);

  const { value, tooLarge } = await readLimitedJson(request);
  if (tooLarge) return json({ code: "PAYLOAD_TOO_LARGE" }, 413);
  const parsed = credentialsSchema.safeParse(value);
  if (!parsed.success || Buffer.byteLength(parsed.data?.password ?? "", "utf8") > 72) return json({ code: "INVALID_CREDENTIALS" }, 400);

  const ip = clientIp(request);
  if (!ip) return json({ code: "AUTH_UNAVAILABLE" }, 503);

  try {
    const ipKey = makeLoginRateLimitKey("ip", ip);
    const accountKey = makeLoginRateLimitKey("account", parsed.data.email);
    const [ipLimit, accountLimit] = await Promise.all([
      consumeLoginRateLimit(ipKey, LOGIN_IP_LIMIT),
      consumeLoginRateLimit(accountKey, LOGIN_ACCOUNT_LIMIT),
    ]);
    if (ipLimit.limited || accountLimit.limited) {
      const retryAfterSeconds = Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds);
      return json({ code: "TOO_MANY_ATTEMPTS" }, 429, { "Retry-After": String(retryAfterSeconds) });
    }

    const row = await getPrismaClient().app_users.findUnique({ where: { email: parsed.data.email } });
    const passwordMatches = await compare(parsed.data.password, row?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!row || !row.active || row.role !== "ADMIN" || !passwordMatches) {
      return json({ code: "INVALID_CREDENTIALS" }, 401);
    }

    const user = databaseUserToContract(row);
    const session = await createLoginSession(user.id);
    await Promise.all([clearLoginRateLimit(ipKey), clearLoginRateLimit(accountKey)]);
    const response = json({ user, expiresAt: session.expiresAt.toISOString() }, 200);
    response.cookies.set({
      name: SESSION_COOKIE,
      value: session.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch {
    return json({ code: "AUTH_UNAVAILABLE" }, 503);
  }
}
