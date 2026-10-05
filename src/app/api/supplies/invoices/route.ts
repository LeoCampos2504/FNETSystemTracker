import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, readInput, supplyFailure } from "@/server/supply-http";
import { invoiceInput } from "@/server/supply-input";
import { createInvoice } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { 
    return NextResponse.json(await createInvoice(await readInput(request, invoiceInput), authorization.user.id), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
