import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { auditDue, validAuditDate, type AuditFilters, type AuditPerson } from '@/lib/physical-audits';
import { operationalWorkbook } from './operations-xlsx';

export function physicalAuditWorkbook(rows: AuditPerson[], filters: AuditFilters, today: string, admin: boolean) {
  const files = unzipSync(operationalWorkbook([{ name: 'Control_Auditorias', rows: [
    ['CUIL', 'Nombre Completo', 'Rol / Cuadrilla', 'Sector', 'Locación', 'Estado Auditoría', 'Fecha Última Aud.', 'Próxima Auditoría', 'Vencimiento', 'Observaciones / Ref. Email', 'Motivo excepción'],
    ...rows.map(r => [r.cuil, r.name, r.role, r.sector, r.location, r.status, r.lastDate, r.nextDate, auditDue(r, today, filters.warningDays), r.notes, r.exception]),
  ] }, { name: 'Datos del reporte', rows: [['Campo', 'Valor'], ['Fecha operativa', today], ['Aviso previo (días)', filters.warningDays], ['Sector', filters.sector || 'Todos'], ['Estado', filters.status || 'Todos'], ['Vencimiento', filters.due || 'Todos'], ['Búsqueda', filters.query], ['Filas', rows.length], ['Privacidad', admin ? 'Administración: CUIL completo' : 'Consulta: CUIL enmascarado'], ['Archivos', 'Los adjuntos originales se descargan por separado desde cada auditoría']] }]));
  // Keep CUIL as text, but export civil dates as native Excel dates (sortable, no host timezone).
  let sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  sheet = sheet.replace(/<c r="([GH])(\d+)" s="0" t="inlineStr"><is><t xml:space="preserve">([^<]*)<\/t><\/is><\/c>/g, (cell, col, row, date) => {
    if (Number(row) < 2 || !validAuditDate(date)) return cell;
    const serial = (Date.parse(`${date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
    return `<c r="${col}${row}" s="3" t="n"><v>${serial}</v></c>`;
  });
  files['xl/worksheets/sheet1.xml'] = strToU8(sheet);
  const styles = strFromU8(files['xl/styles.xml']).replace('<fonts ', '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts ').replace('<cellXfs count="3">', '<cellXfs count="4">').replace('</cellXfs>', '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="top"/></xf></cellXfs>');
  files['xl/styles.xml'] = strToU8(styles);
  return zipSync(files, { level: 6 });
}
