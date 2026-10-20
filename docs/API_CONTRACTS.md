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

### Control manual de Intra para compras Mendel — MENDEL-INTRA-01

Extensión aditiva del Registro de compras, preparada localmente el 19/10/2026; no cambia la interfaz `Api` ni los contratos compartidos del prototipo.

- `GET /api/mendel/transactions` conserva filtros/paginación/resumen y añade `items[].intra`: `uploaded` y `downloaded` (`boolean|null`), `eventId`, `version`, `updatedAt`, `updatedBy`, `sourceHash`, `needsReview`. Solo se consultan las confirmaciones de la página actual. No se interpretan estados del pago, comprobantes ni aprobación como una confirmación de Intra.
- `GET /api/mendel/intra-control?transactionId=...`: `{state, history}`; historial de hasta 100 eventos, ordenado por versión. Sesión Admin real, respuesta privada `no-store`.
- `POST /api/mendel/intra-control`: `{transactionId, uploaded:boolean|null, downloaded:boolean|null, expectedEventId:uuid|null, sourceHash:sha256, requestId:uuid}`. JSON estricto, máximo 64 KiB y control de origen. No acepta un actor suministrado por el navegador.
- Se mantiene el mismo acceso Admin del Registro de compras. Coordinadores, técnicos y cuentas inactivas no pueden leer/escribir esta ruta global. No se agregan permisos.
- Una transacción Prisma bloquea la compra existente, valida versión/huella, maneja reintentos idempotentes y agrega un evento. No actualiza `mendel_transactions`, `reconciliation_status` ni las aprobaciones de coordinación.
- Conflictos: `INTRA_STATE_CHANGED`, `MENDEL_PURCHASE_CHANGED`, `REQUEST_KEY_REUSED` (409). Registro inexistente: `NOT_FOUND` (404). Entrada inválida (422), sin sesión (401), rol/origen no autorizado (403). Un fallo de base no se transforma en estados negativos o pendientes inventados.
- Persistencia en `ops_events`: acción `MENDEL_INTRA_MANUAL_CONFIRMED`, recurso `mendel-intra:<transactionId>`. Estos eventos son datos funcionales y no deben purgarse como logs descartables. No requiere DDL ni una migración nueva.

- Validar todo request body/query con `zod` antes de tocar servicios.
- Los Route Handlers no acceden a Prisma directamente: pasan por
  `src/server/services/**`, que a su vez dependen de `src/server/ports/**`.
- Mientras Gino no tenga `src/server/repositories/prisma/**` listo, usar
  `src/server/repositories/memory/**` (mismo contrato de puerto) para poder
  levantar y probar cada endpoint.
- Auditoría: toda mutación (`PUT`/`POST`/`DELETE`) debe registrar un
  `AuditLog` vía `AuditRepository` cuando la lógica de negocio esté implementada.
