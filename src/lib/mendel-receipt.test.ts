import { describe, expect, it } from 'vitest';
import { mendelReceipt, renditionLabel } from './mendel-receipt';
import { EMPTY_TRAY_FILTERS, filterTray, type TrayRow } from './mendel-bandeja';
const row = { key: 'SYNTHETIC', transactionId: 'SYNTHETIC', receipt: 'NO', date: '2026-10-27', notes: '', approvalNotes: '', zone: 'TEST',
  person: 'Persona sintética', merchant: 'Prueba', amount: '100', currency: 'ARS', budget: '', locality: '', coordinator: '', paymentStatus: '', officialApproval: '', zoneSource: '' } as TrayRow;
const checked = { ...row, receiptCheck: { ok: true, eventId: 'synthetic', version: 1, actor: 'Admin sintético', at: '2026-10-27T12:00:00Z', needsReview: false } };
describe('receipt manual override presentation and filters', () => {
  it('keeps a manual No even when the source claims a receipt, with compact binary labels', () => {
    const no = { ...checked, receipt: 'SI' as const, receiptCheck: { ...checked.receiptCheck, ok: false, choice: false } };
    expect(renditionLabel(no)).toBe('No'); expect(mendelReceipt(no).missing).toBe(true);
    expect(renditionLabel(checked)).toBe('Sí');
    expect(renditionLabel({ ...row, documentName: 'synthetic.pdf' })).toBe('Sí');
    expect(renditionLabel({ ...row, receipt: 'SIN_DATO' })).toBe('No');
  });
  it('removes checked expenses from missing receipts without changing CSV', () => {
    expect(mendelReceipt(checked)).toMatchObject({ kind: 'MANUAL_OK', missing: false });
    expect(checked.receipt).toBe('NO');
    expect(filterTray([row, checked], { ...EMPTY_TRAY_FILTERS, receipt: 'NO' })).toEqual([row]);
    expect(filterTray([row, checked], { ...EMPTY_TRAY_FILTERS, receipt: 'MANUAL_OK' })).toEqual([checked]);
  });
  it('undo falls back to source evidence and changed evidence is review, not automatically OK', () => {
    expect(mendelReceipt({ ...checked, receiptCheck: { ...checked.receiptCheck, ok: false } }).missing).toBe(true);
    const changed = { ...checked, receiptCheck: { ...checked.receiptCheck, needsReview: true } };
    expect(mendelReceipt(changed).kind).toBe('REVIEW');
    expect(filterTray([changed], { ...EMPTY_TRAY_FILTERS, receipt: 'MANUAL_OK' })).toHaveLength(0);
    expect(filterTray([changed], { ...EMPTY_TRAY_FILTERS, receipt: 'REVIEW' })).toHaveLength(1);
  });
  it('preserves PDF evidence and no-receipt-required logic', () => {
    expect(mendelReceipt({ ...row, documentName: 'example.pdf' }).missing).toBe(false);
    expect(mendelReceipt({ ...row, receiptStatus: 'NO REQUIERE' }).kind).toBe('NOT_REQUIRED');
  });
});
