import type { Prisma } from '@prisma/client';
import type { MendelTransactionImport } from './mendel-csv';

// The identifiers below are fixed source-code constants, never CSV values.
const columns = [
  ['transactionId','transaction_id'],['transactionDate','transaction_date'],['confirmationDate','confirmation_date'],
  ['userName','user_name'],['merchant','merchant'],['totalAmount','total_amount'],['currency','currency'],
  ['internationalAmount','international_amount'],['internationalCurrency','international_currency'],['bankFee','bank_fee'],
  ['budget','budget'],['budgetId','budget_id'],['paymentMethod','payment_method'],['transactionType','transaction_type'],
  ['transactionStatus','transaction_status'],['referenceCode','reference_code'],['paymentOrigin','payment_origin'],['channel','channel'],
  ['merchantCategory','merchant_category'],['transactionCategory','transaction_category'],['hasReceipt','has_receipt'],
  ['documentName','document_name'],['invoiceTotal','invoice_total'],['invoiceDifference','invoice_difference'],['receiptStatus','receipt_status'],
  ['vat','vat'],['grossIncomeTax','gross_income_tax'],['otherTaxes','other_taxes'],['exemptAmount','exempt_amount'],['nonTaxedAmount','non_taxed_amount'],
] as const satisfies ReadonlyArray<readonly [keyof MendelTransactionImport, string]>;
const names = columns.map(([, name]) => `"${name}"`);
function sourceSql(present: Set<keyof MendelTransactionImport>) {
  const updates = columns.slice(1).filter(([key]) => present.has(key)).map(([, name]) => `"${name}"=EXCLUDED."${name}"`);
  return `INSERT INTO mendel_transactions (${names.join(',')},"updated_at")
    SELECT ${names.map(name => `r.${name}`).join(',')}, NOW() FROM jsonb_populate_recordset(NULL::mendel_transactions,$1::jsonb) r
    ON CONFLICT (transaction_id) DO UPDATE SET ${[...updates, '"updated_at"=NOW()'].join(',')}`;
}
const detailsSql = `INSERT INTO mendel_purchase_details(transaction_id,full_id,source_invoice,source_description)
  SELECT r.transaction_id,r.full_id,r.source_invoice,r.source_description
  FROM jsonb_to_recordset($1::jsonb) AS r(transaction_id text,full_id text,source_invoice text,source_description text)
  ON CONFLICT (transaction_id) DO UPDATE SET
    full_id=COALESCE(EXCLUDED.full_id,mendel_purchase_details.full_id),
    source_invoice=CASE WHEN $2::boolean THEN EXCLUDED.source_invoice ELSE mendel_purchase_details.source_invoice END,
    source_description=CASE WHEN $3::boolean THEN EXCLUDED.source_description ELSE mendel_purchase_details.source_description END
  WHERE mendel_purchase_details.full_id IS NULL OR EXCLUDED.full_id IS NULL OR mendel_purchase_details.full_id=EXCLUDED.full_id`;

export async function importMendelBatch(tx: Prisma.TransactionClient, rows: MendelTransactionImport[], presentSourceKeys: Array<keyof MendelTransactionImport>) {
  if (!rows.length) return;
  const source = rows.map(row => Object.fromEntries(columns.map(([key, name]) => [name, row[key]])));
  const details = rows.map(row => ({ transaction_id: row.transactionId, full_id: row.fullId ?? null, source_invoice: row.sourceInvoice ?? null, source_description: row.sourceDescription ?? null }));
  await tx.$executeRawUnsafe(sourceSql(new Set(presentSourceKeys)), JSON.stringify(source));
  const updated = await tx.$executeRawUnsafe(detailsSql, JSON.stringify(details), rows[0].sourceInvoice !== undefined, rows[0].sourceDescription !== undefined);
  if (updated !== rows.length) throw new Error('MENDEL_ID_CONFLICT');
  const references = rows.filter(row => row.formReferences !== undefined);
  if (references.length) {
    await tx.mendel_form_references.deleteMany({ where: { transactionId: { in: references.map(row => row.transactionId) } } });
    const values = references.flatMap(row => (row.formReferences ?? []).map(formCode => ({ transactionId: row.transactionId, formCode })));
    if (values.length) await tx.mendel_form_references.createMany({ data: values });
  }
}
