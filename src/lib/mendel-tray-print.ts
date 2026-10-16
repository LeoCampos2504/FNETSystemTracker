import { trayDate, trayMoney, type TrayRow } from "./mendel-bandeja";

function wrap(ctx: CanvasRenderingContext2D, value: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const char of paragraph) { if (line && ctx.measureText(line + char).width > width) { result.push(line); line = char; } else line += char; }
    result.push(line);
  }
  return result;
}

export function drawTrayPrint(rows: readonly TrayRow[], zone: string, page: number, pages: number, source: string): HTMLCanvasElement {
  const widths = [108, 88, 175, 195, 145, 145, 450, 106], headers = ["Fecha", "Zona", "Usuario", "Comercio", "Total", "Presupuesto", "Notas", "Hay ticket"];
  const canvas = document.createElement("canvas"); canvas.width = widths.reduce((a, b) => a + b, 0);
  let ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No se puede generar la imagen en este navegador."); ctx.font = "16px Arial";
  const prepared = rows.map(row => {
    const values = [trayDate(row.date), row.zone || "Sin zona", row.person || "Sin persona", row.merchant, trayMoney(row.amount, row.currency), row.budget, (row.notes ?? "Notas no disponibles") + (row.approvalNotes ? `\n\nNota de aprobación (fuente):\n${row.approvalNotes}` : ""), row.receipt === "SI" ? "Sí" : row.receipt === "NO" ? "No" : "Sin dato"];
    const lines = values.map((value, i) => wrap(ctx!, value || "—", widths[i] - 24));
    return { lines, height: Math.max(46, ...lines.map(line => line.length * 22 + 24)) };
  });
  const height = 112 + prepared.reduce((sum, row) => sum + row.height, 0) + 60;
  if (height > 14000) throw new Error("Las notas son demasiado largas para una imagen. No se recortó el texto: revisá el detalle o filtrá menos gastos.");
  canvas.height = height; ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#183746"; ctx.font = "bold 24px Arial";
  ctx.fillText(`Pendientes de Mendel · ${zone}`, 16, 32); ctx.font = "15px Arial";
  ctx.fillText(`Print ${page + 1}/${pages} · ${rows.length} gastos · ${source} · Consulta, no autorización`, 16, 59);
  let y = 78, x = 0; ctx.fillStyle = "#099bc1"; ctx.fillRect(0, y, canvas.width, 34); ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial";
  headers.forEach((header, i) => { ctx!.fillText(header, x + 12, y + 23); x += widths[i]; }); y += 34;
  prepared.forEach((row, index) => {
    ctx!.fillStyle = index % 2 ? "#f0f2f4" : "#fff"; ctx!.fillRect(0, y, canvas.width, row.height); ctx!.font = "16px Arial"; x = 0;
    row.lines.forEach((lines, i) => { ctx!.fillStyle = i === 7 && lines[0] === "No" ? "#b52231" : "#182631"; lines.forEach((line, j) => ctx!.fillText(line, x + 12, y + 29 + j * 22)); ctx!.strokeStyle = "#c4cdd3"; ctx!.strokeRect(x + .5, y + .5, widths[i], row.height); x += widths[i]; }); y += row.height;
  });
  ctx.fillStyle = "#526473"; ctx.font = "14px Arial";
  ctx.fillText("Notas completas. Compartir solo con el coordinador correspondiente. Sin dato no significa No.", 16, y + 24);
  ctx.fillText("FNET no aprueba gastos ni envía este print automáticamente.", 16, y + 46);
  return canvas;
}
