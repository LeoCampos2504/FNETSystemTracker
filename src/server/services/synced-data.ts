import type { Prisma } from "@prisma/client";
import { CrewRole, ExternalSource, QuoteStatus, TaskCriticality, TaskStatus, TaskType } from "@/contracts";
import type { InternalTaskAssignment, PostgresQuote, PostgresSupply, SyncedCounts, SyncedData } from "@/contracts";
import { getPrismaClient } from "@/server/prisma";
import { getFuelData, getPendingBySites, getPendingData } from "@/server/services/operational-data";
import { normalizeQuoteStatus } from "@/lib/quote-status";
import { splitTechnicianAssignments } from "@/lib/technician-scoring";
import { assignmentMapKey, listActiveTaskAssignments } from "@/server/services/task-assignments";

type DateLike = Date | null;
function iso(value: DateLike): string | null { return value?.toISOString() ?? null; }
function dateOnly(value: DateLike): string { return value ? value.toISOString().slice(0, 10) : "sin-fecha"; }
function decimal(value: Prisma.Decimal | null): string | null { return value?.toString() ?? null; }
function numberValue(value: Prisma.Decimal | null): number | null { return value === null ? null : Number(value.toString()); }
function normalized(value: string | null): string { return value?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[\s-]+/g, "_") ?? ""; }

function jsonText(value: Prisma.JsonValue, keys: string[]): string | null {
  const wanted = new Set(keys.map((key) => normalized(key)));
  const visit = (candidate: unknown): string | null => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) { const found = visit(item); if (found) return found; }
      return null;
    }
    if (!candidate || typeof candidate !== "object") return null;
    for (const [key, item] of Object.entries(candidate)) {
      if (wanted.has(normalized(key)) && (typeof item === "string" || typeof item === "number")) return String(item);
      const found = visit(item); if (found) return found;
    }
    return null;
  };
  return visit(value);
}

export function taskStatus(value: string | null): TaskStatus {
  const status = normalized(value);
  if (status.includes("IN_PROGRESS") || status.includes("PROCESS") || status.includes("PROCESO")) return TaskStatus.IN_PROGRESS;
  if (status.includes("IN_REVIEW") || status.includes("REVIEW") || status.includes("REVISION") || status.includes("REVISI")) return TaskStatus.IN_REVIEW;
  if (status.includes("ENVIAD") || status.includes("SENT")) return TaskStatus.SENT;
  if (status.includes("RECHAZ") || status.includes("REJECT")) return TaskStatus.REJECTED;
  if (status.includes("CANCEL")) return TaskStatus.CANCELLED;
  if ((status.includes("APROBAD") || status.includes("APPROVED") || status.includes("COMPLET")) && (status.includes("PENDIENT") || status.includes("PENDING"))) return TaskStatus.APPROVED_WITH_PENDING;
  if (status.includes("APROBAD") || status.includes("APPROVED") || status.includes("COMPLET")) return TaskStatus.APPROVED;
  if (status.includes("OPEN") || status.includes("ABIER")) return TaskStatus.OPEN;
  return TaskStatus.OPEN;
}
export function quoteStatus(value: string | null): QuoteStatus { return normalizeQuoteStatus(value); }
function siteLabel(codes: string | null): string { return codes?.trim() || "Sin sitio informado"; }
function attributeValue(attributes: string | null, keys: string[]): string | null {
  if (!attributes) return null;
  const wanted = new Set(keys.map((key) => normalized(key)));
  const visit = (value: unknown): string | null => {
    if (Array.isArray(value)) { for (const item of value) { const found = visit(item); if (found) return found; } return null; }
    if (!value || typeof value !== "object") return null;
    for (const [key, item] of Object.entries(value)) {
      if (wanted.has(normalized(key)) && (typeof item === "string" || typeof item === "number")) return String(item);
      const found = visit(item); if (found) return found;
    }
    return null;
  };
  try { const found = visit(JSON.parse(attributes)); if (found) return found; }
  catch { const match = attributes.match(/(?:prioridad|priority|criticidad|criticality)\s*[:=]\s*["']?([^,"'}\n]+)/i); if (match?.[1]) return match[1].trim(); }
  return null;
}
export function taskPriority(attributes: string | null): string { return attributeValue(attributes, ["prioridad", "priority", "criticidad", "criticality"]) ?? "Sin prioridad informada"; }
export function taskCriticality(priority: string, status: string | null): TaskCriticality { const value = normalized(priority + " " + status); return value.includes("URGENT") || value.includes("CRITIC") ? TaskCriticality.URGENT : TaskCriticality.NORMAL; }

function mapTask(row: {
  id: bigint; codigo: string; nombre: string | null; descripcion: string | null; tarea: string | null; estado: string | null;
  proyecto: string | null; codigos_sitios_afectados: string | null; plantilla: string | null; fecha_plan: Date | null;
  creado_el: Date | null; cantidad_rechazos: number | null; enlace: string | null; abierto_el: Date | null; atributos: string | null;
  contratista_asignado: string | null; asignado_a: string | null; usuario_colaborador: string | null; sincronizado_el: Date;
}, type: TaskType, internalAssignment?: InternalTaskAssignment) {
  const plannedAt = row.fecha_plan;
  const priority = taskPriority(row.atributos);
  const siteCode = siteLabel(row.codigos_sitios_afectados);
  const assignmentNames = internalAssignment ? [internalAssignment.technicianPrimary, internalAssignment.technicianCollaborator] : type === TaskType.PREVENTIVE ? splitTechnicianAssignments([row.asignado_a, row.usuario_colaborador]) : [];
  const taskId = type.toLowerCase() + "-" + row.id.toString();
  return {
    id: taskId, taskCode: row.codigo, formCode: row.plantilla, type,
    description: row.nombre ?? row.descripcion ?? row.tarea ?? "Sin descripción informada",
    priority, criticality: taskCriticality(priority, row.estado), status: taskStatus(row.estado),
    scheduledDate: dateOnly(plannedAt), scheduledAt: iso(plannedAt), requestDate: iso(row.abierto_el ?? row.creado_el),
    assignedTo: row.asignado_a, collaborator: row.usuario_colaborador, contractor: row.contratista_asignado,
    siteId: siteCode, siteCode, zoneId: row.proyecto ?? "Sin proyecto informado", coordinates: { latitude: 0, longitude: 0 },
    assignments: assignmentNames.map((technicianId, index) => ({ technicianId, crewRole: index === 0 ? CrewRole.PRIMARY : CrewRole.COLLABORATOR })),
    arrivalAt: null, departureAt: null,
    rejections: Array.from({ length: row.cantidad_rechazos ?? 0 }, (_, index) => ({ id: taskId + "-rejection-" + (index + 1), taskId, rejectedAt: iso(plannedAt) ?? "", reason: null })),
    externalSource: ExternalSource.SYTEX, externalId: row.codigo, sourceUpdatedAt: row.sincronizado_el.toISOString(), externalUrl: row.enlace,
  };
}

type FormTaskInput = { code: string; type: string; project: string; siteCode: string; description: string; technicians: unknown; status: string; planDate: Date | null; link: string | null; syncedAt: Date };
/** A form that came from the direct Sytex synchronization, shown as a task of its zone. Only preventive and corrective forms are tasks. */
export function formTask(row: FormTaskInput) {
  const type = row.type === "CORRECTIVO" ? TaskType.CORRECTIVE : row.type === "PREVENTIVO" ? TaskType.PREVENTIVE : null;
  if (!type) return null;
  const technicians = Array.isArray(row.technicians) ? row.technicians.filter((name): name is string => typeof name === "string" && name.trim() !== "") : [];
  const priority = "Sin prioridad informada", siteCode = siteLabel(row.siteCode);
  return {
    id: "form-" + row.code, taskCode: row.code, formCode: null as string | null, type, description: row.description || "Sin descripción informada",
    priority, criticality: taskCriticality(priority, row.status), status: taskStatus(row.status),
    scheduledDate: dateOnly(row.planDate), scheduledAt: iso(row.planDate), requestDate: null as string | null,
    assignedTo: technicians[0] ?? null, collaborator: technicians[1] ?? null, contractor: null as string | null,
    siteId: siteCode, siteCode, zoneId: row.project || "Sin proyecto informado", coordinates: { latitude: 0, longitude: 0 },
    assignments: technicians.slice(0, 2).map((technicianId, index) => ({ technicianId, crewRole: index === 0 ? CrewRole.PRIMARY : CrewRole.COLLABORATOR })),
    arrivalAt: null as string | null, departureAt: null as string | null, rejections: [] as { id: string; taskId: string; rejectedAt: string; reason: string | null }[],
    externalSource: ExternalSource.SYTEX, externalId: row.code, sourceUpdatedAt: row.syncedAt.toISOString(), externalUrl: row.link,
  };
}
async function getFormTasks(skip: Set<string>) {
  const prisma = getPrismaClient();
  const [contexts, states, links] = await Promise.all([
    prisma.sytex_supply_form_contexts.findMany({ include: { import: { select: { importedAt: true } } }, orderBy: [{ import: { importedAt: "asc" } }, { id: "asc" }] }),
    prisma.sytex_form_states.findMany({ orderBy: [{ import: { importedAt: "asc" } }, { id: "asc" }] }),
    prisma.sytex_form_links.findMany({ select: { code: true, link: true } }),
  ]);
  const latest = new Map(contexts.map((row) => [row.code, row])), state = new Map(states.map((row) => [row.code, row])), link = new Map(links.map((row) => [row.code, row.link]));
  return [...latest.values()].filter((row) => !skip.has(row.code)).flatMap((row) => {
    const task = formTask({ code: row.code, type: row.type, project: row.project, siteCode: row.siteCode, description: row.description, technicians: row.technicians, status: state.get(row.code)?.status ?? "", planDate: state.get(row.code)?.planDate ?? null, link: link.get(row.code) ?? null, syncedAt: row.import.importedAt });
    return task ? [task] : [];
  });
}

export async function getSyncedCounts(): Promise<SyncedCounts> {
  const prisma = getPrismaClient();
  const [correctivos, preventivos, cotizaciones, insumos] = await Promise.all([prisma.correctivos.count(), prisma.preventivos.count(), prisma.cotizaciones.count(), prisma.insumos.count()]);
  return { correctivos, preventivos, cotizaciones, insumos };
}

export async function getSyncedData(): Promise<SyncedData> {
  const prisma = getPrismaClient();
  const [correctivos, preventivos, cotizaciones, insumos, counts, fuelData, pendingData, internalAssignments] = await Promise.all([
    prisma.correctivos.findMany({ select: { id: true, codigo: true, nombre: true, descripcion: true, tarea: true, estado: true, proyecto: true, codigos_sitios_afectados: true, plantilla: true, fecha_plan: true, creado_el: true, abierto_el: true, atributos: true, contratista_asignado: true, asignado_a: true, usuario_colaborador: true, cantidad_rechazos: true, enlace: true, sincronizado_el: true }, orderBy: { actualizado_bd: "desc" } }),
    prisma.preventivos.findMany({ select: { id: true, codigo: true, nombre: true, descripcion: true, tarea: true, estado: true, proyecto: true, codigos_sitios_afectados: true, plantilla: true, fecha_plan: true, creado_el: true, abierto_el: true, atributos: true, contratista_asignado: true, asignado_a: true, usuario_colaborador: true, cantidad_rechazos: true, enlace: true, sincronizado_el: true }, orderBy: { actualizado_bd: "desc" } }),
    prisma.cotizaciones.findMany({ select: { id: true, codigo: true, estado: true, proyecto: true, proveedor: true, total: true, divisa: true, codigo_tarea: true, codigo_sitio: true, nombre_sitio: true, fecha_creacion: true, actualizado_bd: true, sincronizado_el: true, enlace: true }, orderBy: { actualizado_bd: "desc" } }),
    prisma.insumos.findMany({ select: { id: true, formulario: true, grupo: true, indice: true, cantidad: true, descripcion: true, provisto_por: true, codigo_sitio: true, nombre_sitio: true, estado: true, imagen: true, ultima_edicion_el: true, sincronizado_el: true, raw_data: true }, orderBy: { actualizado_bd: "desc" } }),
    getSyncedCounts(), getFuelData(), getPendingData(), listActiveTaskAssignments(),
  ]);
  const correctiveCodes = new Set(correctivos.map((row) => row.codigo));
  const tasks = [...correctivos.map((row) => mapTask(row, TaskType.CORRECTIVE, internalAssignments.get(assignmentMapKey("CORRECTIVO", row.codigo)))), ...preventivos.map((row) => mapTask(row, TaskType.PREVENTIVE, internalAssignments.get(assignmentMapKey("PREVENTIVO", row.codigo)))), ...await getFormTasks(new Set([...correctivos, ...preventivos].map((row) => row.codigo)))];
  const preventiveByForm = new Map(preventivos.map((row) => [row.codigo, row]));
  const pendingBySite = await getPendingBySites(tasks.map((task) => task.siteCode));
  const quotes: PostgresQuote[] = cotizaciones.map((row) => ({ id: row.id.toString(), code: row.codigo, status: quoteStatus(row.estado), sourceStatus: row.estado, syncedAt: row.sincronizado_el.toISOString(), zoneId: row.codigo_sitio ?? "Sin sitio informado", projectId: row.proyecto, supplier: row.proveedor, total: decimal(row.total), currency: row.divisa, taskCode: row.codigo_tarea, relatedCorrectiveCode: row.codigo_tarea && correctiveCodes.has(row.codigo_tarea) ? row.codigo_tarea : null, siteCode: row.codigo_sitio, siteName: row.nombre_sitio, createdAt: iso(row.fecha_creacion), updatedAt: row.actualizado_bd.toISOString(), link: row.enlace }));
  const supplies: PostgresSupply[] = insumos.map((row) => ({
    id: row.id.toString(), formulario: row.formulario, grupo: row.grupo, indice: row.indice, quantity: numberValue(row.cantidad), description: row.descripcion,
    provider: row.provisto_por, siteCode: row.codigo_sitio, siteName: row.nombre_sitio, status: row.estado, image: row.imagen,
    technician: jsonText(row.raw_data, ["tecnico", "technician", "asignado_a", "assigned_to", "responsable", "usuario_responsable"]) ?? preventiveByForm.get(row.formulario)?.asignado_a ?? null,
    lastEditedBy: jsonText(row.raw_data, ["ultima_edicion_por", "last_edited_by", "edited_by", "updated_by", "editor"]), lastEditedAt: iso(row.ultima_edicion_el),
    syncedAt: row.sincronizado_el.toISOString(),
  }));
  return { source: "postgresql", counts, tasks, quotes, insumos: supplies, fuel: fuelData.items, fuelMetrics: fuelData.metrics, pendientes: pendingData.items, pendingMetrics: pendingData.metrics, pendingBySite };
}
