import { NextResponse } from "next/server";
import { requireOperationsSession } from "@/server/operations-http";
import { getPrismaClient } from "@/server/prisma";
import { privateHeaders, readInput, supplyFailure } from "@/server/supply-http";
import { zoneActionSchema } from "@/server/mendel-zone-input";
import { assertZoneRole, ZoneError, zoneHistory, zoneOverview, zoneWrite, type ZoneDb } from "@/server/services/mendel-zone-control";

export const dynamic = "force-dynamic";
type RawClient = { $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> };
const runner = (client: RawClient): ZoneDb => ({ query: <T>(sql: string, values: unknown[] = []) => client.$queryRawUnsafe<T[]>(sql, ...values) });
function failure(e: unknown) {
  if (e instanceof ZoneError) return NextResponse.json({ code: e.code }, { status: e.status, headers: privateHeaders });
  return supplyFailure(e);
}
export async function GET(request: Request) {
  try {
    const authorization = await requireOperationsSession();
    if (!authorization.ok) return authorization.response;
    const user = authorization.actor.user;
    assertZoneRole(user);
    const id = new URL(request.url).searchParams.get("transactionId");
    if (id && (id.length > 80 || /[\u0000-\u001f]/.test(id))) throw new ZoneError("INPUT_INVALID", 422);
    const prisma = getPrismaClient();
    const result = id ? await prisma.$transaction(async tx => ({ history: await zoneHistory(runner(tx), user, id) })) : await zoneOverview(runner(prisma), user);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const authorization = await requireOperationsSession();
    if (!authorization.ok) return authorization.response;
    const user = authorization.actor.user;
    assertZoneRole(user);
    const input = await readInput(request, zoneActionSchema);
    const result = await getPrismaClient().$transaction(tx => zoneWrite(runner(tx), user, input));
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
