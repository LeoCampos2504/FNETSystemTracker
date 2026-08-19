import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getTechnicianRanking } from "@/server/kpis/fetch";

// GET /api/kpis/ranking?zoneId? — path/query per docs/API_CONTRACTS.md.
// `from`/`to` are the same additive extension as the technician KPI route
// (see docs/CONTRACT_CHANGE_REQUESTS.md); omitting them defaults to the
// current calendar month.
const querySchema = z.object({
  zoneId: z.string().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ranking = await getTechnicianRanking(parsed.data);
    return NextResponse.json(ranking);
  } catch (error) {
    console.error("GET /api/kpis/ranking failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
