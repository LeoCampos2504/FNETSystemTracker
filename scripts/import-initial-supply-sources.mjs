import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
const nullableText = z.string().max(20000).nullable();
const date = z.string().datetime({ offset: true });
const decimal = z.string().regex(/^-?\d{1,16}(?:\.\d{1,3})?$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const fields = {
 transactionId: ['transaction_id', z.string().min(1).max(80)], transactionDate: ['transaction_date', date], confirmationDate: ['confirmation_date', date.nullable()],
 userName: ['user_name', nullableText], merchant: ['merchant', nullableText], totalAmount: ['total_amount', decimal], currency: ['currency', z.string().length(3)],
 internationalAmount: ['international_amount', decimal.nullable()], internationalCurrency: ['international_currency', nullableText], bankFee: ['bank_fee', decimal.nullable()],
 budget: ['budget', nullableText], budgetId: ['budget_id', nullableText], paymentMethod: ['payment_method', nullableText], transactionType: ['transaction_type', nullableText],
 transactionStatus: ['transaction_status', nullableText], referenceCode: ['reference_code', nullableText], paymentOrigin: ['payment_origin', nullableText], channel: ['channel', nullableText],
 merchantCategory: ['merchant_category', nullableText], transactionCategory: ['transaction_category', nullableText], hasReceipt: ['has_receipt', z.boolean().nullable()], documentName: ['document_name', nullableText],
 invoiceTotal: ['invoice_total', decimal.nullable()], invoiceDifference: ['invoice_difference', decimal.nullable()], receiptStatus: ['receipt_status', nullableText], vat: ['vat', decimal.nullable()],
 grossIncomeTax: ['gross_income_tax', decimal.nullable()], otherTaxes: ['other_taxes', decimal.nullable()], exemptAmount: ['exempt_amount', decimal.nullable()], nonTaxedAmount: ['non_taxed_amount', decimal.nullable()],
};
const form = z.string().regex(/^FO-\d{2}-\d{6}$/);
const itemFields = {
 formulario: form, grupo: z.string().max(1000), indice: z.string().max(100), description: nullableText, quantity: decimal.nullable(), provider: nullableText,
 siteCode: nullableText, siteName: nullableText, status: nullableText, image: nullableText, imageDeclared: z.boolean(), lastEditedBy: nullableText, sourceEditedAt: nullableText,
 sourceAnswers: z.array(z.object({ line: z.number().int().positive(), index: z.string(), question: z.string(), answer: nullableText, editedAt: nullableText, editor: nullableText }).strict()).max(1000),
};
const payloadSchema = z.object({ version: z.literal(1),
 sytex: z.object({ fileHash: hash, fileName: z.string().min(1).max(250), answerCount: z.number().int().nonnegative(), formCount: z.number().int().nonnegative(), sourceEditedFrom: nullableText, sourceEditedThrough: nullableText, items: z.array(z.object(itemFields).strict()).min(1).max(50000) }).strict(),
 mendel: z.object({ fileHash: hash, rows: z.array(z.object({ ...Object.fromEntries(Object.entries(fields).map(([key, [, schema]]) => [key, schema])), formReferences: z.array(form).optional() }).strict()).max(50000) }).strict(),
}).strict();
export function parseInitialSupplySources(encoded) {
 if (!encoded || encoded.length > 500000) throw new Error('INITIAL_SOURCES_INVALID');
 return payloadSchema.parse(JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8')));
}
// One-time infrastructure import. No HTTP endpoint, no authentication bypass, no credentials emitted.
// Only application-owned source snapshots/purchase tables are written; internal inventory remains empty until confirmed.
export async function importInitialSupplySources(client, encoded = process.env.FNET_INITIAL_SOURCES_GZIP, report = console.log) {
 if (!encoded) return;
 const payload = parseInitialSupplySources(encoded);
 await client.query('BEGIN');
 try {
  await client.query('SELECT pg_advisory_xact_lock(680250134141)');
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const admins = await client.query('SELECT id FROM app_users WHERE role = $1 AND active = true' + (email ? ' AND email = $2' : ''), email ? ['ADMIN', email] : ['ADMIN']);
  if (admins.rows.length !== 1) throw new Error('INITIAL_IMPORT_ADMIN_NOT_RESOLVED');
  const actor = admins.rows[0].id;
  let insertedTransactions = 0;
  const names = Object.keys(fields), columns = names.map((key) => '"' + fields[key][0] + '"').join(', '), values = names.map((_, i) => '$' + (i + 1)).join(', ');
  for (const row of payload.mendel.rows) {
   const saved = await client.query(`INSERT INTO mendel_transactions (${columns}, updated_at) VALUES (${values}, CURRENT_TIMESTAMP) ON CONFLICT (transaction_id) DO NOTHING RETURNING transaction_id`, names.map((key) => row[key]));
   insertedTransactions += saved.rowCount;
   // Add missing exact references, preserving existing purchase fields and references.
   for (const code of row.formReferences ?? []) await client.query('INSERT INTO mendel_form_references (transaction_id, form_code) VALUES ($1, $2) ON CONFLICT DO NOTHING', [row.transactionId, code]);
  }
  const previousBatch = await client.query('SELECT id FROM mendel_import_batches WHERE file_hash = $1 LIMIT 1', [payload.mendel.fileHash]);
  if (!previousBatch.rows.length) await client.query('INSERT INTO mendel_import_batches (file_hash, row_count, inserted_count, updated_count, imported_by) VALUES ($1, $2, $3, 0, $4)', [payload.mendel.fileHash, payload.mendel.rows.length, insertedTransactions, actor]);
  const source = payload.sytex, importId = randomUUID();
  const batch = await client.query('INSERT INTO sytex_supply_imports (id, file_hash, file_name, answer_count, form_count, source_edited_from, source_edited_through, imported_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (file_hash) DO NOTHING RETURNING id', [importId, source.fileHash, source.fileName, source.answerCount, source.formCount, source.sourceEditedFrom, source.sourceEditedThrough, actor]);
  if (batch.rows.length) for (const item of source.items) await client.query('INSERT INTO sytex_supply_import_items (id,import_id,formulario,grupo,indice,description,quantity,provider,site_code,site_name,status,image,image_declared,last_edited_by,source_edited_at,source_answers) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)', [randomUUID(), importId, item.formulario, item.grupo, item.indice, item.description, item.quantity, item.provider, item.siteCode, item.siteName, item.status, item.image, item.imageDeclared, item.lastEditedBy, item.sourceEditedAt, JSON.stringify(item.sourceAnswers)]);
  const counts = await client.query('SELECT (SELECT count(*) FROM mendel_transactions)::int AS purchases, (SELECT count(*) FROM mendel_form_references)::int AS references, (SELECT count(*) FROM sytex_supply_import_items)::int AS source_items');
  await client.query('COMMIT');
  report(`Fuentes reales verificadas: compras=${counts.rows[0].purchases}, referenciasFO=${counts.rows[0].references}, materialesExportados=${counts.rows[0].source_items}; comprasNuevas=${insertedTransactions}. Inventario interno sin altas automáticas.`);
  return counts.rows[0];
 } catch (error) { await client.query('ROLLBACK'); throw error; }
}
