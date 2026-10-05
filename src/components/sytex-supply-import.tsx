"use client";

import { useRef, useState } from "react";

type Preview = {
  fileCount?: number; formContextCount?: number; projects?: string[];
  answerCount: number; formCount: number; itemCount: number; warningCount: number; errorCount: number;
  warnings: Array<{ line: number; code: string }>; errors: Array<{ line: number; code: string }>;
  items: Array<{ formulario: string; description: string | null; quantity: string | null; imageDeclared: boolean; image: string | null }>;
};
const messages: Record<string, string> = {
  IMAGE_FILE_MISSING: "La foto está declarada, pero falta el archivo o enlace.",
  QUANTITY_NOT_NUMERIC: "La cantidad no es numérica; se conserva como dato pendiente.",
  ITEM_INCOMPLETE: "Falta descripción o cantidad del insumo.",
  DUPLICATE_ANSWER_SKIPPED: "Una respuesta idéntica estaba repetida y se contó una sola vez.",
  ITEM_FIELD_CONFLICT: "Hay respuestas distintas para el mismo campo de un insumo.",
  ITEM_IDENTITY_INVALID: "No se puede identificar el formulario, grupo o índice del insumo.",
};
const errorMessages: Record<string, string> = {
  SYTEX_EXPORT_HEADERS_MISSING: "Este archivo no tiene las columnas del export de respuestas de Sytex.",
  SYTEX_EXPORT_HEADERS_AMBIGUOUS: "Hay columnas requeridas repetidas; revisá el archivo.",
  SYTEX_EXPORT_EMPTY: "El archivo no contiene respuestas.",
  SYTEX_EXPORT_TOO_MANY_ROWS: "La carga supera las 300.000 respuestas admitidas.",
  FILE_TOO_LARGE: "Los archivos superan los 40 MB admitidos por carga.",
  XLSX_REQUIRED: "Seleccioná solo archivos Excel .xlsx (hasta 80 por carga).",
  SYTEX_EXPORT_FILE_UNKNOWN: "Uno de los archivos no es un export de respuestas ni un listado de formularios de Sytex.",
  SYTEX_EXPORT_ANSWERS_REQUIRED: "Falta al menos un export de respuestas (Export answers as rows).",
  SYTEX_EXPORT_FORM_HEADERS_INVALID: "Un listado de formularios no tiene las columnas Código, Nombre, Plantilla y Proyecto.",
  SYTEX_EXPORT_FORM_PROJECT_MISSING: "Hay formularios sin código o sin proyecto en un listado.",
  SYTEX_EXPORT_FORM_CONFLICT: "Un mismo formulario figura con datos distintos en dos listados.",
  SYTEX_EXPORT_FORMS_EMPTY: "Un listado de formularios está vacío.",
  SYTEX_EXPORT_HAS_CONFLICTS: "Revisá los conflictos antes de importar.",
  SYTEX_EXPORT_NO_ITEMS: "No hay descripciones o cantidades de insumos para guardar.",
  XLSX_INVALID: "No se pudo leer el Excel. Usá el export original de Sytex.",
};

export function SytexSupplyImport({ onImported }: { onImported: (importId: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function upload(mode: "preview" | "commit") {
    if (!files.length || busy) return;
    setBusy(true); setMessage(null);
    try {
      const form = new FormData(); for (const file of files) form.append("file", file); form.set("mode", mode);
      const response = await fetch("/api/insumos/export/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code ?? "IMPORT_FAILED");
      if (mode === "preview") setPreview(result as Preview);
      else {
        setPreview(null); setFiles([]);
        if (inputRef.current) inputRef.current.value = "";
        setMessage(result.alreadyImported ? "Esta carga ya estaba guardada. Se abre su importación sin duplicarla." : "Export guardado. Ya podés consultar sus insumos.");
        onImported(result.importId);
      }
    } catch (error) {
      if (mode === "preview") setPreview(null);
      const code = error instanceof Error ? error.message : "IMPORT_FAILED";
      setMessage(errorMessages[code] ?? "No se pudo completar la carga. Reintentá o consultá con la administración.");
    } finally { setBusy(false); }
  }
  return <section className="panel resource-import-panel" aria-label="Importar export de Sytex">
    <h2>Cargar export de Sytex</h2>
    <p>Elegí juntos los Excel de Sytex de todos los proyectos: los de respuestas (Export answers as rows) y los listados de formularios (Export), que indican a qué proyecto pertenece cada formulario. Se reúnen la descripción, cantidad y foto de cada insumo del mismo formulario, grupo e índice.</p>
    <div className="resource-source-controls">
      <input ref={inputRef} aria-label="Archivos Excel exportados de Sytex" type="file" accept=".xlsx" multiple disabled={busy} onChange={(event) => { setFiles([...(event.target.files ?? [])]); setPreview(null); setMessage(null); }} />
      <button className="button secondary small" disabled={!files.length || busy} onClick={() => void upload("preview")}>{busy ? "Procesando…" : files.length > 1 ? `Revisar ${files.length} archivos` : "Revisar archivo"}</button>
    </div>
    {message && <p role="status">{message}</p>}
    {preview && <div>
      <p><strong>{preview.answerCount.toLocaleString("es-AR")} respuestas · {preview.formCount} formularios · {preview.itemCount} insumos identificados</strong></p>
      {(preview.fileCount ?? 1) > 1 && <p>{preview.fileCount} archivos leídos.</p>}
      {preview.projects && preview.projects.length > 0 ? <details><summary>{preview.formContextCount} formularios con proyecto · {preview.projects.length} proyectos</summary><ul>{preview.projects.map((project) => <li key={project}>{project}</li>)}</ul></details> : <p>Sin listado de formularios: los insumos nuevos no quedarán asociados a un proyecto y no aparecerán en los filtros por zona.</p>}
      <p>Las respuestas vacías y las preguntas generales no se cuentan como insumos.</p>
      <ul>{preview.items.map((item, index) => <li key={`${item.formulario}-${index}`}>{item.formulario} · {item.description ?? "Descripción pendiente"} · cantidad: {item.quantity ?? "pendiente"}{item.imageDeclared && !item.image ? " · foto pendiente de recuperar" : ""}</li>)}</ul>
      {preview.itemCount > preview.items.length && <p>Se muestran los primeros {preview.items.length}; la importación incluye los {preview.itemCount} insumos.</p>}
      {preview.warningCount > 0 && <details><summary>{preview.warningCount} observaciones</summary><ul>{preview.warnings.map((issue, index) => <li key={index}>Fila {issue.line}: {messages[issue.code] ?? "Revisar respuesta."}</li>)}</ul>{preview.warningCount > preview.warnings.length && <p>Se muestran las primeras {preview.warnings.length} observaciones.</p>}</details>}
      {preview.errorCount > 0 && <div role="alert"><p>{preview.errorCount} conflictos impiden importar.</p><ul>{preview.errors.map((issue, index) => <li key={index}>Fila {issue.line}: {messages[issue.code] ?? "Revisar respuesta."}</li>)}</ul></div>}
      <button className="button primary small" disabled={busy || preview.errorCount > 0 || preview.itemCount === 0} onClick={() => void upload("commit")}>Confirmar importación</button>
      <p>Se guarda el export para consulta. Esta carga no confirma consumos ni saldos de técnicos.</p>
    </div>}
  </section>;
}
