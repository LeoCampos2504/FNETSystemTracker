import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, readInput, supplyFailure } from "@/server/supply-http";
import { uuid, invoiceStatusInput } from "@/server/supply-input";
import { invoiceDetail, invoiceStatus } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    return NextResponse.json(await invoiceDetail(id), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    return NextResponse.json(await invoiceStatus(id, await readInput(request, invoiceStatusInput), authorization.user.id), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
