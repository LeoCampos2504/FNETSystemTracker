import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth";
import { revokeSession } from "@/server/services/auth-sessions";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let status = 200;
  if (token) {
    try {
      await revokeSession(token);
    } catch {
      status = 503;
    }
  }
  const response = NextResponse.json({ ok: status === 200, code: status === 200 ? undefined : "SESSION_REVOCATION_FAILED" }, { status, headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ name: SESSION_COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
