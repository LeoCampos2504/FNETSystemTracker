import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@/contracts";
import { createSessionToken, hashSessionToken, isSessionTokenFormat, SESSION_COOKIE, SESSION_SECONDS, databaseUserToContract } from "@/server/auth";
import { canAccessGlobalData } from "@/server/access";
import { getPrismaClient } from "@/server/prisma";

export async function createLoginSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const prisma = getPrismaClient();
  const now = new Date();
  await prisma.app_sessions.deleteMany({ where: { expiresAt: { lte: now } } });
  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000);
  await prisma.app_sessions.create({
    data: { userId, tokenHash: hashSessionToken(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function getSessionUser(token: string): Promise<User | null> {
  if (!isSessionTokenFormat(token)) return null;
  const session = await getPrismaClient().app_sessions.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return databaseUserToContract(session.user);
}

export async function getCurrentSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(token) : null;
}

export async function revokeSession(token: string): Promise<void> {
  if (!isSessionTokenFormat(token)) return;
  await getPrismaClient().app_sessions.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export type AdminAuthorization = { ok: true; user: User } | { ok: false; response: NextResponse };

export async function requireAdminSession(): Promise<AdminAuthorization> {
  let user: User | null;
  try {
    user = await getCurrentSessionUser();
  } catch {
    return { ok: false, response: NextResponse.json({ code: "AUTH_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } }) };
  }
  if (!user) return { ok: false, response: NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  if (!canAccessGlobalData(user.role)) return { ok: false, response: NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store" } }) };
  return { ok: true, user };
}
