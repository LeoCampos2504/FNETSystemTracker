import { z } from 'zod';

export const AUDIT_STATES = ['Pendiente', 'Realizada', 'Eximida', 'Solo Celular', 'Sin Bienes Asignados'] as const;
export function validAuditDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const date = z.string().refine(v => v === '' || validAuditDate(v), 'Fecha inválida');
export function nextAuditDate(last: string) {
  if (!validAuditDate(last)) return '';
  const [y, m, d] = last.split('-').map(Number);
  const end = new Date(Date.UTC(y, m + 2 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + 2, Math.min(d, end), 12)).toISOString().slice(0, 10);
}
export const auditDataSchema = z.object({
  name: z.string().trim().min(1).max(250), role: z.string().trim().max(100),
  sector: z.string().trim().min(1).max(120), location: z.string().trim().max(150),
  status: z.enum(AUDIT_STATES), lastDate: date, nextDate: date,
  notes: z.string().max(10000), exception: z.string().max(1000),
}).strict().superRefine((r, ctx) => {
  if (r.lastDate && r.nextDate && r.nextDate < r.lastDate) ctx.addIssue({ code: 'custom', path: ['nextDate'], message: 'La próxima fecha no puede ser anterior a la última.' });
  if (r.lastDate && r.nextDate && r.nextDate !== nextAuditDate(r.lastDate) && !r.exception.trim()) ctx.addIssue({ code: 'custom', path: ['exception'], message: 'Indicá el motivo de la fecha excepcional.' });
});
export type AuditData = z.infer<typeof auditDataSchema>;
export type AuditImportRow = { cuil: string; data: AuditData };
export type AuditPerson = AuditData & { id: string; cuil: string; version: number };
export type AuditFile = { id: string; file_name: string; byte_count: number; created_at: string; actor_name: string };
export type AuditHistory = { id: string; version: number; data: AuditData; created_at: string; actor_name: string; kind: string; files: AuditFile[] };

/** Civil dates only; repeat every three calendar months, clamping end of month. */
export function auditDue(row: Pick<AuditData, 'status' | 'nextDate'>, today: string, warningDays = 15) {
  if (row.status === 'Eximida' || row.status === 'Sin Bienes Asignados') return 'Exenta';
  if (!validAuditDate(row.nextDate)) return 'Sin fecha';
  const days = Math.round((Date.parse(`${row.nextDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return days < 0 ? 'Vencida' : days === 0 ? 'Vence hoy' : days <= warningDays ? 'Próxima' : 'Vigente';
}
export type AuditFilters = { query: string; sector: string; status: string; due: string; warningDays: number };
export function filterAudits(rows: AuditPerson[], filters: AuditFilters, today: string) {
  return rows.filter(r => (!filters.query || norm([r.name, r.role, r.sector, r.location, r.notes].join(' ')).includes(norm(filters.query)))
    && (!filters.sector || r.sector === filters.sector) && (!filters.status || r.status === filters.status)
    && (!filters.due || auditDue(r, today, filters.warningDays) === filters.due));
}
const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
function cellDate(v: unknown) {
  if (v == null || v === '' || norm(v) === 'sin realizar') return '';
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().slice(0, 10);
  const raw = String(v).trim();
  if (validAuditDate(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const result = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
  if (!validAuditDate(result)) throw Error('fecha no reconocida');
  return result;
}
export function parseAuditSheet(cells: unknown[][]) {
  if (!cells.length || cells.length > 5001) throw Error('La hoja está vacía o supera 5.000 personas.');
  const headers = cells[0].map(norm);
  const column = (name: string) => {
    const matches = headers.flatMap((v, i) => v === name ? [i] : []);
    if (matches.length !== 1) throw Error(`Revisá la columna ${name}.`);
    return matches[0];
  };
  const cols = ['cuil', 'nombre completo', 'rol / cuadrilla', 'sector', 'locacion', 'estado auditoria', 'fecha ultima aud.', 'observaciones / ref. email', 'proxima auditoria'].map(column);
  const rows: AuditImportRow[] = [], errors: string[] = [], seen = new Set<string>();
  cells.slice(1).forEach((cells, i) => {
    if (cells.every(v => v == null || v === '')) return;
    try {
      const [cuil, name, role, sector, location, state, last, notes, next] = cols.map(c => cells[c]);
      const identifier = String(cuil ?? '').replace(/[\s-]/g, '');
      if (!/^\d{11}$/.test(identifier)) throw Error('CUIL inválido');
      if (seen.has(identifier)) throw Error('CUIL duplicado');
      seen.add(identifier);
      const status = AUDIT_STATES.find(s => norm(s) === norm(state));
      if (!status) throw Error('estado no reconocido');
      const lastDate = cellDate(last), nextDate = cellDate(next) || nextAuditDate(lastDate);
      const originalException = String(cells[headers.indexOf('motivo excepcion')] ?? '').trim();
      const data = auditDataSchema.parse({ name: String(name ?? '').trim(), role: String(role ?? ''), sector: String(sector ?? ''), location: String(location ?? ''), status, lastDate, nextDate, notes: String(notes ?? ''), exception: originalException || (lastDate && nextDate && nextDate !== nextAuditDate(lastDate) ? 'Fecha excepcional de la planilla original' : '') });
      rows.push({ cuil: identifier, data });
    } catch { errors.push(`Fila ${i + 2}: revisá CUIL, estado o fechas. No se importó esa fila.`); }
  });
  return { rows, errors };
}
