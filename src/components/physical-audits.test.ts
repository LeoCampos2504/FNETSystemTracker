import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PhysicalAudits } from './physical-audits';
it('shows shared consultation and Excel download without editing controls to readers', () => {
  const html = renderToStaticMarkup(createElement(PhysicalAudits, { canEdit: false }));
  expect(html).toContain('Excel filtrado'); expect(html).toContain('Excel completo');
  expect(html).not.toContain('Agregar persona'); expect(html).not.toContain('Importar control de auditorías');
});
it('offers Admin import, creation and configurable notices without claiming email notifications', () => {
  const html = renderToStaticMarkup(createElement(PhysicalAudits, { canEdit: true }));
  expect(html).toContain('Agregar persona'); expect(html).toContain('Importar control de auditorías');
  expect(html).toContain('no se envían correos ni WhatsApp');
});
