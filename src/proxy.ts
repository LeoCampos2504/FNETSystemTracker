import { NextRequest, NextResponse } from "next/server";
import { isSessionTokenFormat, SESSION_COOKIE } from "@/server/auth";

const publicApiPaths = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/health"]);

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  if (publicApiPaths.has(path)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !isSessionTokenFormat(token)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
