import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { TrayRow } from '@/lib/mendel-bandeja';
import { MendelReceiptReview } from './mendel-receipt-review';
const row = { revision: 1, snapshotHash: 'a'.repeat(64) } as TrayRow;
const render = (canReview: boolean, changes = {}) => renderToStaticMarkup(createElement(MendelReceiptReview, { row: { ...row, ...changes }, canReview, onSaved: async () => {} }));
it('offers a clear OK button only to the reviewing admin on a shared expense', () => {
  expect(render(true)).toContain('Marcar comprobante OK');
  expect(render(false)).not.toContain('Marcar comprobante OK');
  expect(render(true, { revision: undefined })).not.toContain('Marcar comprobante OK');
});
it('shows reviewer and undo without turning a receipt into approval', () => {
  const html = render(true, { receiptCheck: { ok: true, actor: 'Admin sintético', at: '2026-10-27T12:00:00Z', needsReview: false } });
  expect(html).toContain('Deshacer OK manual'); expect(html).toContain('Admin sintético');
  expect(html).toContain('No autoriza el gasto'); expect(html).not.toContain('Marcar comprobante OK');
});
