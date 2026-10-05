import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, readInput, supplyFailure } from "@/server/supply-http";
import { uuid, movementInput } from "@/server/supply-input";
import { saveMovement } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    return NextResponse.json(await saveMovement(id, await readInput(request, movementInput), authorization.user.id), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
