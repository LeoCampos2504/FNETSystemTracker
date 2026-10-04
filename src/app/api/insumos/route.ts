import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getSyncedData } from "@/server/services/synced-data";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { getPrismaClient } from "@/server/prisma";
import { reconcileSupplyForms } from "@/server/supply-reconciliation";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try {
    const [data, transactions] = await Promise.all([
      getSyncedData(),
      getPrismaClient().mendel_transactions.findMany({
        select: { transactionId: true, transactionDate: true, merchant: true, totalAmount: true, currency: true, referenceCode: true, budgetId: true, transactionStatus: true, hasReceipt: true, receiptStatus: true, reconciliationStatus: true, formReferences: { select: { formCode: true } } },
        orderBy: { transactionDate: "desc" },
      }),
    ]);
    const items = reconcileSupplyForms(data.insumos, transactions);
    const matched = items.filter((item) => item.mendel.status === "MATCHED").length;
    const ambiguous = items.filter((item) => item.mendel.status === "AMBIGUOUS").length;
    const formMatches = new Map(items.map((item) => [item.formulario, item.mendel.candidateCount]));
    const synchronizationDates = items.map((item) => item.syncedAt).sort();
    return NextResponse.json({
      source: data.source,
      count: data.counts.insumos,
      items,
      synchronization: { oldestAt: synchronizationDates[0] ?? null, latestAt: synchronizationDates.at(-1) ?? null },
      mendelSummary: {
        totalTransactions: transactions.length, matchedSupplies: matched, ambiguousSupplies: ambiguous,
        unmatchedSupplies: items.length - matched - ambiguous,
        totalForms: formMatches.size, relatedForms: [...formMatches.values()].filter((count) => count > 0).length,
        transactionsWithFormReferences: transactions.filter((row) => row.formReferences.length > 0).length,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
