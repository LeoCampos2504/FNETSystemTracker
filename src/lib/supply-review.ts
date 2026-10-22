import type { Material } from '@/contracts/operations';

export const SUPPLY_BATCH_LIMIT = 50;
export const materialProject = (item: Material) => item.review?.project || (item.projects.length === 1 ? item.projects[0] : '');
export type SupplyChoice = 'PENDIENTE' | 'INCLUIDO' | 'NO_INCLUIDO';
export function supplyReviewInput(item: Material, classification: SupplyChoice, downloaded: boolean, invoiceNumber: string) {
  const project = materialProject(item);
  if (!project) throw new Error('Asigná el proyecto en el detalle antes de seleccionar este insumo.');
  if (classification === 'INCLUIDO' && !invoiceNumber.trim()) throw new Error('Ingresá el número de factura.');
  if (classification === 'INCLUIDO' && downloaded && item.quantity === null) throw new Error('Falta la cantidad de Sytex. Revisá el insumo individualmente antes de confirmar la descarga.');
  const intraStatus = classification === 'NO_INCLUIDO' ? 'NO_CORRESPONDE' : classification === 'INCLUIDO' && downloaded ? 'DESCARGADO' : 'PENDIENTE';
  return { key: item.key, project, classification, intraStatus, invoiceNumber: invoiceNumber.trim(),
    countedQuantity: intraStatus === 'DESCARGADO' ? item.quantity : item.review?.countedQuantity ?? null,
    intraQuantity: intraStatus === 'DESCARGADO' ? item.quantity : null, notes: item.review?.notes ?? '',
    version: item.review?.version ?? 0, sourceHash: item.hash };
}
/** Selection is evaluated against the current filter: hidden rows are never saved. */
export function selectedSupplies(rows: Material[], keys: readonly string[]) {
  const selected = new Set(keys);
  return rows.filter(row => selected.has(row.key));
}
