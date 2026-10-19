import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import type {MendelIntraState} from '@/lib/mendel-intra';
import {MendelIntraControl} from './mendel-intra-control';
const initial:MendelIntraState={uploaded:null,downloaded:null,eventId:null,version:0,updatedAt:null,updatedBy:null,sourceHash:'a'.repeat(64),needsReview:false};
const render=(changes:Partial<MendelIntraState>={})=>renderToStaticMarkup(createElement(MendelIntraControl,{transactionId:'SYNTHETIC-001',state:{...initial,...changes},onSaved:()=>{}}));
describe('manual Intra status presentation',()=>{
  it('shows independent uploaded/downloaded confirmations and never labels unknown as no',()=>{const html=render();expect(html).toContain('Subido a Intra');expect(html).toContain('Descargado en Intra');expect(html.match(/Sin confirmar/g)).toHaveLength(2);expect(html).toContain('Editar control');});
  it('shows a yes and no independently',()=>{const html=render({uploaded:true,downloaded:false});expect(html).toContain('>Sí</strong>');expect(html).toContain('>No</strong>');});
  it('shows the persisted actor, operational time, history and changed-purchase warning',()=>{const html=render({uploaded:true,downloaded:true,eventId:'00000000-0000-4000-8000-000000000001',updatedBy:'Admin sintético',updatedAt:'2026-10-19T11:00:00Z',needsReview:true});expect(html).toContain('Admin sintético');expect(html).toContain('08:00');expect(html).toContain('Historial');expect(html).toContain('La compra cambió');});
  it('escapes any author text and never offers an official Mendel approval action',()=>{const html=render({updatedAt:'2026-10-19T11:00:00Z',updatedBy:'<script>synthetic</script>'});expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('Confirmar respuesta');expect(html).not.toContain('Aprobar gasto');});
});
