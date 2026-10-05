import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, supplyFailure } from "@/server/supply-http";
import { uuid } from "@/server/supply-input";
import { handoffDetail } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    const page = Math.max(1, Math.min(100000, Math.floor(Number(new URL(request.url).searchParams.get("page")) || 1))); return NextResponse.json(await handoffDetail(id, page), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
