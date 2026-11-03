import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PhysicalAudits, AuditSummary } from './physical-audits';
it('shows shared consultation and Excel download without editing controls to readers', () => {
  const html = renderToStaticMarkup(createElement(PhysicalAudits, { canEdit: false }));
  expect(html).toContain('Excel filtrado'); expect(html).toContain('Excel completo');
  expect(html).not.toContain('Agregar persona'); expect(html).not.toContain('Importar control de auditorías');
});
it('offers five clearly labelled summary filters with selected state and no write controls', () => {
  const html = renderToStaticMarkup(createElement(AuditSummary, { total: 66, counts: label => label === 'Vencida' ? 3 : 0, due: 'Vencida', onSelect: () => {} }));
  expect(html.match(/<button/g)).toHaveLength(5);
  expect(html).toContain('Requieren atención');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).toContain('data-tone="red" aria-pressed="true"');
});
it('offers Admin import, creation and configurable notices without claiming email notifications', () => {
  const html = renderToStaticMarkup(createElement(PhysicalAudits, { canEdit: true }));
  expect(html).toContain('Agregar persona'); expect(html).toContain('Importar control de auditorías');
  expect(html).toContain('no se envían correos ni WhatsApp');
});
