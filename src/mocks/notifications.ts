import type { Notification } from "@/contracts";
import { NotificationType } from "@/contracts";
import { MOCK_TODAY, addDaysUtc } from "./constants";

const seeds: Omit<Notification, "createdAt">[] = [
  {
    id: "notif-001",
    userId: "user-tech-01",
    type: NotificationType.NEW_TASK,
    title: "Nueva tarea asignada",
    message: "Se te asigno el preventivo PM-NOA-P0001 para hoy.",
    readAt: null,
    relatedEntityType: "task",
    relatedEntityId: "task-P0001",
  },
  {
    id: "notif-002",
    userId: "user-tech-01",
    type: NotificationType.CORRECTIVE_URGENT,
    title: "Correctivo urgente",
    message: "Correctivo urgente CM-NOA-C0001 requiere atencion inmediata.",
    readAt: null,
    relatedEntityType: "task",
    relatedEntityId: "task-C0001",
  },
  {
    id: "notif-003",
    userId: "user-coord-1",
    type: NotificationType.CORRECTIVE_URGENT,
    title: "Correctivo urgente en tu zona",
    message: "Se registro un correctivo urgente en NOA.",
    readAt: null,
    relatedEntityType: "task",
    relatedEntityId: "task-C0001",
  },
  {
    id: "notif-004",
    userId: "user-tech-05",
    type: NotificationType.GUARD_CHANGE,
    title: "Cambio de guardia",
    message: "Fuiste asignado a la guardia temporal de Centro esta semana.",
    readAt: null,
    relatedEntityType: "guard",
    relatedEntityId: "guard-centro-3",
  },
  {
    id: "notif-005",
    userId: "user-tech-01",
    type: NotificationType.VEHICLE_CHANGE,
    title: "Cambio de vehiculo",
    message: "Se te asigno el vehiculo AB101CD (Toyota Hilux).",
    readAt: "2026-08-15T12:00:00.000Z",
    relatedEntityType: "vehicle",
    relatedEntityId: "veh-01",
  },
  {
    id: "notif-006",
    userId: "user-coord-2",
    type: NotificationType.SCHEDULE_CHANGE,
    title: "Cronograma reprogramado",
    message: "3 preventivos pendientes de Cuyo fueron reprogramados.",
    readAt: null,
    relatedEntityType: "zone",
    relatedEntityId: "zone-cuyo",
  },
  {
    id: "notif-007",
    userId: "user-admin-1",
    type: NotificationType.CORRECTIVE_URGENT,
    title: "Correctivos urgentes activos",
    message: "Hay 3 correctivos urgentes abiertos en el sistema.",
    readAt: null,
    relatedEntityType: "task",
    relatedEntityId: null,
  },
];

export const mockNotifications: Notification[] = seeds.map((seed, index) => ({
  ...seed,
  createdAt: addDaysUtc(MOCK_TODAY, -index * 0.2).toISOString(),
}));
