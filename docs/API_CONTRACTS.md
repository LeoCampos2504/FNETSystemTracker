# Contratos de API

Estos son los endpoints que `src/lib/api/http-api.ts` espera. **No existen
todavía** (salvo `/api/health`); son el contrato que Leo implementa en
`src/app/api/**` (y Gino en `/api/kpis/**`). Los tipos de request/response
están definidos en `src/contracts/**` — este documento solo mapea método +
ruta + payload; los shapes exactos viven en el código.

Cualquier cambio de forma acá implica cambiar `src/contracts/api.ts` primero
(ver [CONTRACT_CHANGE_REQUESTS.md](CONTRACT_CHANGE_REQUESTS.md)).

## Compartido

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Ya implementado. `{ status: "ok", service: "fnet-system-tracker" }`. |

## Auth

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | `LoginCredentials { email, password }` | `AuthSession { user, token, expiresAt }` |
| GET | `/api/auth/me` | — (usa cookie/token de sesión) | `User \| null` |

## Tareas

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/tasks/today` | `?technicianId?&zoneId?&date?` | `Task[]` |
| GET | `/api/tasks/pending` | `?technicianId?&zoneId?&asOfDate?` | `Task[]` (pendientes de reprogramar) |
| GET | `/api/tasks/:id` | — | `Task \| null` |
| PUT | `/api/tasks/:id/assignments` | `AssignTechniciansToTaskInput { taskId, assignments }` | `Task` |
| PUT | `/api/tasks/:id/schedule` | `ScheduleTaskInput { taskId, scheduledDate }` | `Task` |
| PUT | `/api/tasks/:id/status` | `UpdateTaskStatusInput { taskId, status }` | `Task` |

## Guardias

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/guards` | `?zoneId?&technicianId?` | `Guard[]` |
| GET | `/api/guards/:id/performance` | — | `GuardPerformance \| null` |
| PUT | `/api/guards/:id/assignments` | `AssignGuardInput { guardId, technicianIds }` | `Guard` |

## Técnicos

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/technicians/:id` | — | `Technician \| null` |
| GET | `/api/technicians/:id/vehicle` | — | `Vehicle \| null` |

## KPIs (dueño: Gino)

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/kpis/technicians/:id` | — | `TechnicianKpis \| null` |
| GET | `/api/kpis/ranking` | `?zoneId?` | `TechnicianRankingEntry[]` |

## Coordinadores / Zonas

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/coordinators/:id/zones` | — | `Zone[]` |
| GET | `/api/zones/:id/technicians` | — | `Technician[]` |
| GET | `/api/zones/:id/sites` | — | `Site[]` |

## Vehículos

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/vehicles/:id` | — | `Vehicle \| null` |

## Cotizaciones

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/quotes` | `?zoneId?&coordinatorId?&status?` | `Quote[]` |

## Notificaciones

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/notifications` | `?userId` | `Notification[]` |

## Notas de implementación (Leo)

- Validar todo request body/query con `zod` antes de tocar servicios.
- Los Route Handlers no acceden a Prisma directamente: pasan por
  `src/server/services/**`, que a su vez dependen de `src/server/ports/**`.
- Mientras Gino no tenga `src/server/repositories/prisma/**` listo, usar
  `src/server/repositories/memory/**` (mismo contrato de puerto) para poder
  levantar y probar cada endpoint.
- Auditoría: toda mutación (`PUT`/`POST`/`DELETE`) debe registrar un
  `AuditLog` vía `AuditRepository` cuando la lógica de negocio esté implementada.
