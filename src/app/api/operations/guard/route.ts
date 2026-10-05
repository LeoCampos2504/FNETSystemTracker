import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addDays, mondayOf } from '@/lib/guard-domain';
import { requireOperationsSession } from '@/server/operations-http';
import { daySchema } from '@/server/operations-input';
import { addGuardWeek, addHoliday, guardOverview, removeGuardWeek, removeHoliday, setVisitHours } from '@/server/services/guard-duty';
import { privateHeaders, readInput, supplyFailure } from '@/server/supply-http';
export const dynamic = 'force-dynamic';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const text = z.string().trim().min(1).max(200);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('addWeek'), technician: text, weekStart: daySchema }).strict(),
  z.object({ action: z.literal('removeWeek'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('addHoliday'), day: daySchema, name: text }).strict(),
  z.object({ action: z.literal('removeHoliday'), day: daySchema }).strict(),
  z.object({ action: z.literal('setHours'), visitId: z.string().uuid(), hours: z.number().min(0).max(48).multipleOf(0.25).nullable() }).strict(),
]);
/** Reading is open to CTIC accounts; loading guards, holidays and hours is for coordination. */
export async function GET(request: Request) {
  const a = await requireOperationsSession(true); if (!a.ok) return a.response;
  try {
    const p = new URL(request.url).searchParams, monday = mondayOf(today());
    const from = p.get('from') ? daySchema.parse(p.get('from')) : monday, to = p.get('to') ? daySchema.parse(p.get('to')) : addDays(monday, 13);
    if (from > to || addDays(from, 93) < to) throw new z.ZodError([]);
    return NextResponse.json(await guardOverview(a.actor, from, to), { headers: privateHeaders });
  } catch (e) { return supplyFailure(e); }
}
export async function POST(request: Request) {
  const a = await requireOperationsSession(); if (!a.ok) return a.response;
  try {
    const input = await readInput(request, schema);
    const result = input.action === 'addWeek' ? await addGuardWeek(a.actor, input) : input.action === 'removeWeek' ? await removeGuardWeek(a.actor, input.id)
      : input.action === 'addHoliday' ? await addHoliday(a.actor, input) : input.action === 'removeHoliday' ? await removeHoliday(a.actor, input.day) : await setVisitHours(a.actor, input);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (e) { return supplyFailure(e); }
}
