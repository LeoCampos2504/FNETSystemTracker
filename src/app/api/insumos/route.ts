import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getSyncedData } from "@/server/services/synced-data";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { getPrismaClient } from "@/server/prisma";

export const dynamic = "force-dynamic";
type MatchKey = "TRANSACTION_ID" | "REFERENCE_CODE" | "BUDGET_ID";
type MendelRow = {
  transactionId: string;
  transactionDate: Date;
  merchant: string | null;
  totalAmount: { toString(): string };
  currency: string;
  referenceCode: string | null;
  budgetId: string | null;
  transactionStatus: string | null;
  hasReceipt: boolean | null;
  receiptStatus: string | null;
  reconciliationStatus: string;
};
type MendelView = Omit<MendelRow, "transactionDate" | "totalAmount"> & { transactionDate: string; totalAmount: string };

function key(value: string | null): string { return value?.trim().toUpperCase() ?? ""; }
function view(row: MendelRow): MendelView {
  return { ...row, transactionDate: row.transactionDate.toISOString(), totalAmount: row.totalAmount.toString() };
}

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try {
    const [data, transactions] = await Promise.all([
      getSyncedData(),
      getPrismaClient().mendel_transactions.findMany({
        select: { transactionId: true, transactionDate: true, merchant: true, totalAmount: true, currency: true, referenceCode: true, budgetId: true, transactionStatus: true, hasReceipt: true, receiptStatus: true, reconciliationStatus: true },
        orderBy: { transactionDate: "desc" },
      }),
    ]);
    const index = new Map<string, Array<{ row: MendelRow; matchKey: MatchKey }>>();
    const add = (value: string | null, matchKey: MatchKey, row: MendelRow) => {
      const normalized = key(value);
      if (!normalized) return;
      const bucket = index.get(normalized) ?? [];
      bucket.push({ row, matchKey });
      index.set(normalized, bucket);
    };
    for (const row of transactions) {
      add(row.transactionId, "TRANSACTION_ID", row);
      add(row.referenceCode, "REFERENCE_CODE", row);
      add(row.budgetId, "BUDGET_ID", row);
    }
    let matched = 0;
    let ambiguous = 0;
    const items = data.insumos.map((item) => {
      const unique = new Map<string, { row: MendelRow; matchKey: MatchKey }>();
      for (const candidate of index.get(key(item.formulario)) ?? []) unique.set(candidate.row.transactionId, candidate);
      const candidates = [...unique.values()];
      if (candidates.length === 1) matched += 1;
      if (candidates.length > 1) ambiguous += 1;
      const match = candidates.length === 1 ? candidates[0] : null;
      return {
        ...item,
        mendel: {
          status: candidates.length === 1 ? "MATCHED" : candidates.length > 1 ? "AMBIGUOUS" : "UNMATCHED",
          matchKey: match?.matchKey ?? null,
          transactionId: match?.row.transactionId ?? null,
          transaction: match ? view(match.row) : null,
          candidateCount: candidates.length,
        },
      };
    });
    return NextResponse.json({
      source: data.source,
      count: data.counts.insumos,
      items,
      mendelSummary: { totalTransactions: transactions.length, matchedSupplies: matched, ambiguousSupplies: ambiguous, unmatchedSupplies: items.length - matched - ambiguous },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
