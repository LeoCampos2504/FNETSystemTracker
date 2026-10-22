import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect } from 'vitest';
import { SupplyReviewChoices,SupplyBatchReview } from './supply-review-controls';
describe('compact Intra controls',()=>{
  it('renders keyboard-accessible state buttons instead of dropdowns',()=>{
    const html=renderToStaticMarkup(createElement(SupplyReviewChoices,{inclusion:'INCLUIDO',onInclusion:()=>{},downloaded:false,onDownloaded:()=>{}}));
    expect(html).toContain('Sí, descargado');expect(html).toContain('No, pendiente');
    expect(html).toContain('aria-pressed="true"');expect(html).toContain('<legend>¿Descargado en Intra?</legend>');expect(html).not.toContain('<select');
  });
  it('shows the shared invoice immediately without selecting a classification first',()=>{
    const html=renderToStaticMarkup(createElement(SupplyBatchReview,{items:[],onSaved:()=>{},onCancel:()=>{}}));
    expect(html).toContain('Número de factura compartida');expect(html).toContain('type="submit"');expect(html).not.toContain('<select');
  });
});
