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
  expect(html).toContain('Marcar no rendido'); expect(html).toContain('Admin sintético');
  expect(html).toContain('No autoriza el gasto'); expect(html).not.toContain('Marcar comprobante OK');
});
it('provides a single compact action without a form, dropdown or modal', () => {
  const html = renderToStaticMarkup(createElement(MendelReceiptReview, { row, canReview: true, compact: true, onSaved: async () => {} }));
  expect(html).toContain('Cambiar rendido a Sí');
  expect(html).toContain('>No</button>');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).not.toMatch(/<(form|select|textarea|dialog)\b/);
  expect(html).toContain('No autoriza el gasto');
});
it('turns the compact action into undo after an OK and hides it for non-admin users', () => {
  const reviewed = { ...row, receiptCheck: { ok: true, actor: 'Admin sintético', needsReview: false } } as TrayRow;
  const html = renderToStaticMarkup(createElement(MendelReceiptReview, { row: reviewed, canReview: true, compact: true, onSaved: async () => {} }));
  expect(html).toContain('Cambiar rendido a No'); expect(html).toContain('>Sí</button>'); expect(html.match(/<button/g)).toHaveLength(1);
  expect(renderToStaticMarkup(createElement(MendelReceiptReview, { row, canReview: false, compact: true, onSaved: async () => {} }))).toBe('');
});
