import type { SiteFuelLoad } from "@/contracts/operations";
import { operationalDateKey, operationalDateTimeToEpoch } from "./operational-timezone";
import { zoneCode, type DateRange } from "./filters";

/** Sum only checked events in the supplied (already filtered and authorized) list, never round away milliliters. */
export function reviewedFuelByOperation(rows:SiteFuelLoad[]) {
  const totals=new Map<string,{operation:string;liters:number;count:number;unknownLiters:number}>();
  for(const row of rows) if(row.review?.ok) {
    const operation=zoneCode(row.project)||"Sin operación", item=totals.get(operation)??{operation,liters:0,count:0,unknownLiters:0};
    item.count++;
    if(row.liters===null) item.unknownLiters++; else item.liters=Math.round((item.liters+row.liters)*1000)/1000;
    totals.set(operation,item);
  }
  return [...totals.values()].sort((a,b)=>a.operation.localeCompare(b.operation));
}

/** Report date and load date are different evidence. A date-only has no known hour. */
const epoch = (value: string | null) => {
  if (!value) return -Infinity;
  try { const n = operationalDateTimeToEpoch(value.length === 10 ? value + "T00:00" : value); return Number.isFinite(n) ? n : -Infinity; }
  catch { return -Infinity; }
};
export function fuelInDateRange(value: string | null, range: DateRange) {
  if (!range.from && !range.to) return true;
  if (!value) return false;
  try { const day = operationalDateKey(value); return (!range.from || day >= range.from) && (!range.to || day <= range.to); }
  catch { return false; }
}

const measure = (value: string | null) => value === null ? null : value.trim().replace(",", ".");
/** Only an exact, unique event match across sources may replace a row. Never deduplicate by site or form alone. */
function fingerprint(row: SiteFuelLoad) {
  if (row.dateBasis === 'FORM_START' || row.dateBasis === 'UNVERIFIED') return null;
  if (!row.siteCode || row.liters === null || !row.date || row.date.length <= 10 || !Number.isFinite(epoch(row.date))) return null;
  if (row.levelBefore === null && row.levelAfter === null && row.hourmeter === null) return null;
  return JSON.stringify([row.formCode, row.siteCode.trim().toUpperCase(), epoch(row.date), row.liters,
    measure(row.levelBefore), measure(row.levelAfter), measure(row.hourmeter)]);
}
export function reconcileFuelLoads(rows: SiteFuelLoad[]): SiteFuelLoad[] {
  const matches = new Map<string, SiteFuelLoad[]>();
  for (const row of rows) { const key = fingerprint(row); if (key) matches.set(key, [...(matches.get(key) ?? []), row]); }
  const replaced = new Set<string>();
  for (const group of matches.values()) {
    const sytex = group.filter((r) => r.source === "Sytex"), n8n = group.filter((r) => r.source === "n8n");
    if (sytex.length === 1 && n8n.length === 1) replaced.add(sytex[0].id);
  }
  const kept = rows.filter((r) => !replaced.has(r.id));
  const byForm = new Map<string, Set<string>>();
  for (const row of kept) { const key = JSON.stringify([row.formCode, row.siteCode.trim().toUpperCase()]); const sources = byForm.get(key) ?? new Set<string>(); sources.add(row.evidence ?? row.source); byForm.set(key, sources); }
  return kept.map((row) => ({ ...row, possibleDuplicate: (byForm.get(JSON.stringify([row.formCode, row.siteCode.trim().toUpperCase()]))?.size ?? 0) > 1 }))
    .sort((a, b) => epoch(b.date) - epoch(a.date) || a.id.localeCompare(b.id));
}
