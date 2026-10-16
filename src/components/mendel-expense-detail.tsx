"use client";

import { Receipt, MessageSquareText } from "lucide-react";
import { trayDate, trayMoney, type TrayRow } from "@/lib/mendel-bandeja";
import { ZoneDecisionEditor } from "./mendel-zone-actions";
import styles from "./mendel-zone-tray.module.css";

export function MendelExpenseDetail({ row, onSaved }: { row: TrayRow; onSaved: () => Promise<void> }) {
  const receipt = row.receipt === "SI" ? "Sí" : row.receipt === "NO" ? "Falta comprobante" : "Sin dato";
  return <>
    <div className={styles.expenseSummary}>
      <div className={styles.expenseIdentity}><span className={styles.expenseIcon}><Receipt size={21} aria-hidden="true" /></span><div><p>{trayDate(row.date)} · {row.person || "Sin persona informada"}</p><h3>{row.merchant || "Comercio sin informar"}</h3></div></div>
      <strong className={styles.expenseAmount}>{trayMoney(row.amount, row.currency)}</strong>
    </div>
    <dl className={styles.detailMeta}>
      {[["Zona / operación", row.zone || "Sin zona"], ["Presupuesto", row.budget || "Sin dato"], ["Comprobante", receipt]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className={styles.detailColumns}>
      <div className={styles.detailNotes}>
        <h3><MessageSquareText size={16} aria-hidden="true" /> Nota de la transacción</h3>
        <div className={`${styles.fullNote} ${styles.detailNote}`}>{row.notes ?? "Notas no disponibles en esta fuente."}</div>
        {row.approvalNotes && <><h3>Nota de aprobación de la fuente</h3><div className={`${styles.fullNote} ${styles.detailNote}`}>{row.approvalNotes}</div></>}
        <p className={styles.detailHint}>Leé las notas completas antes de confirmar. Un comentario no cambia por sí solo la aprobación oficial.</p>
      </div>
      <ZoneDecisionEditor row={row} onSaved={onSaved} />
    </div>
    <details className={styles.sourceDetails}>
      <summary>Información de origen</summary>
      <dl className={styles.facts}>
        {[["ID de transacción", row.transactionId], ["Fuente de zona", row.zoneSource], ["Localidad de origen", row.locality], ["Coordinador de origen", row.coordinator], ["Estado del pago (no aprobación)", row.paymentStatus], ["Aprobación oficial", row.officialApproval || "No disponible en esta fuente"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Sin dato"}</dd></div>)}
      </dl>
    </details>
  </>;
}
