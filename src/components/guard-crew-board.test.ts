import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GuardOverview } from '@/contracts/operations';
import type { GuardCrew } from '@/contracts/guard-crew';
import { GuardCrewBoard, GuardCrewCard, GuardWeekPicker } from './guard-crew-board';

const data:GuardOverview={ctic:false,from:'2026-10-01',to:'2026-10-31',periods:[],holidays:[],offHours:[],technicians:['Técnico A','Técnico B'],zones:['NOA'],canManageCrews:true,crewStorageReady:true};
describe('guard crew presentation (not a real CSS certification)',()=>{
  it('shows two members and a zone, one save action, never individual creation or an inclusive end',()=>{
    const html=renderToStaticMarkup(createElement(GuardCrewBoard,{data,onSaved:()=>{}}));
    for(const text of ['Primer integrante','Segundo integrante','Zona','Guardar cuadrilla','7 días de guardia','08:00']) expect(html).toContain(text);
    expect(html).not.toContain('Hasta (incluido)'); expect(html).not.toContain('Agregar guardia');
  });
  it('lets users type civil dates and opens a seven-day calendar selector with an exclusive handover',()=>{
    const html=renderToStaticMarkup(createElement(GuardWeekPicker,{from:'2026-10-14',to:'2026-10-21',onChange:()=>{}}));
    expect(html).toContain('14/10');expect(html).toContain('21/10');expect(html.match(/type="date"/g)).toHaveLength(2);
    expect(html).toContain('Relevo · 08:00');expect(html).toContain('aria-expanded="false"');
  });
  it('explains missing database storage and disables save rather than silently using localStorage',()=>{
    const html=renderToStaticMarkup(createElement(GuardCrewBoard,{data:{...data,crewStorageReady:false},onSaved:()=>{}}));
    expect(html).toContain('no se guarda nada solo en esta PC');expect(html).toMatch(/button[^>]*disabled=""[^>]*>[\s\S]*?Guardar cuadrilla/);
  });
  it('does not show write controls for CTIC or ungranted accounts',()=>{
    const html=renderToStaticMarkup(createElement(GuardCrewBoard,{data:{...data,ctic:true,canManageCrews:false},onSaved:()=>{}}));
    expect(html).not.toContain('Guardar cuadrilla');expect(html).not.toContain('Registrar reemplazo');
  });
  it('shows the full crew timeline, preserving original members and escaped change reasons',()=>{
    const crew:GuardCrew={id:'example',zone:'NOA',startAt:'2026-10-14T11:00:00Z',endAt:'2026-10-21T11:00:00Z',initialTechnicians:['Técnico A','Técnico B'],version:2,cancelled:false,legacyIds:[],segments:[{startAt:'2026-10-14T11:00:00Z',endAt:'2026-10-16T11:00:00Z',technicians:['Técnico A','Técnico B']},{startAt:'2026-10-16T11:00:00Z',endAt:'2026-10-21T11:00:00Z',technicians:['Técnico A','Técnico C']}],changes:[{id:'change',effectiveAt:'2026-10-16T11:00:00Z',before:['Técnico A','Técnico B'],after:['Técnico A','Técnico C'],actorId:'example',recordedAt:'2026-10-16T11:30:00Z',reason:'Relevo <script>example</script>'}]};
    const html=renderToStaticMarkup(createElement(GuardCrewCard,{crew,technicians:data.technicians,editable:true,onSaved:()=>{}}));
    expect(html).toContain('Técnico A + Técnico B');expect(html).toContain('Técnico A + Técnico C');expect(html).toContain('16/10');expect(html).toContain('08:00');expect(html).toContain('&lt;script&gt;');
  });
});
