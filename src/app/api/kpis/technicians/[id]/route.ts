import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getTechnicianKpis } from "@/server/kpis/fetch";

// GET /api/kpis/technicians/:id — matches docs/API_CONTRACTS.md exactly
// (Task -> TechnicianKpis | null, no query params required). `from`/`to` are
// an additive, backward-compatible extension for the day/month/range filters
// requested for the prototype — see the pending entry in
// docs/CONTRACT_CHANGE_REQUESTS.md to get them documented in the frozen
// contract too. Omitting them defaults to the current calendar month.
const querySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query params", details: parsed.error.flatten() }, { status: 400 });
  }

  // Response body is always the `TechnicianKpis | null` the Api contract
  // promises — 200 either way, mirroring GET /api/tasks/:id's convention.
  const kpis = await getTechnicianKpis(id, parsed.data);
  return NextResponse.json(kpis);
}
