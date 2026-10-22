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

### Guardias por cuadrilla — 2026-10-18, preparación local

Endpoint existente `GET/POST /api/operations/guard`, sesión real obligatoria, JSON estricto, origen validado y respuestas privadas `no-store`.

- GET conserva `from`, `to`, `periods`, `holidays`, `offHours`, `technicians`. Añade `crews`, `crewStorageReady`, `zones`, `canManageCrews`, `canManageLegacy`. Los períodos derivados de una cuadrilla incluyen `crewId`, `startAt`, `endAt`.
- POST `addCrew`: `{action, requestKey:uuid, zone, technicians:[nombre1,nombre2], startAt:'YYYY-MM-DDT08:00', endAt:'YYYY-MM-DDT08:00', legacyIds:uuid[]}`. Solo 0 o 2 fuentes históricas; su vinculación explícita requiere Admin, mismas fechas e integrantes. No se borran las fuentes.
- POST `replaceCrew`: `{action, requestKey:uuid, id:uuid, version:integer, outgoing, incoming, effectiveAt:'YYYY-MM-DDTHH:mm', reason}`. Se sustituye un integrante del último tramo; timestamp estrictamente posterior a su inicio y anterior al fin. Se rechazan timestamps duplicados, reescrituras de tramos anteriores, versiones viejas y superposiciones. La hora es Argentina, se persiste UTC.
- Los técnicos son nombres reales del catálogo de operaciones autorizado, no IDs ficticios. La pareja solo existe para esa guardia. No se infieren identidades equivalentes entre nombre/email ni zonas desconocidas.
- Admin o coordinador con proyectos explícitos puede crear/reemplazar dentro de sus zonas; el catálogo del coordinador permanece limitado a sus proyectos. Una cuenta sin proyectos explícitos no obtiene acceso global al nuevo módulo. CTIC solo lee.
- Las cargas históricas sin zona son visibles únicamente para Admin/CTIC. Su edición de fechas requiere Admin y registra antes/después; las ya vinculadas se bloquean. `removePeriod` se rechaza para preservar historial. `addPeriod` queda como compatibilidad histórica de Admin, sin formulario nuevo y con control contra superposición de cuadrillas.
- Nuevos códigos: `GUARD_STORAGE_PENDING` (503), `GUARD_TECHNICIAN_UNKNOWN` / `GUARD_PERIOD_INVALID` / `GUARD_LEGACY_INVALID` / `GUARD_CHANGE_ORDER` (422); `GUARD_OVERLAP`, `GUARD_LEGACY_OVERLAP`, `GUARD_LEGACY_LINKED`, `STALE_VERSION`, `REQUEST_KEY_REUSED` (409); `GUARD_HISTORY_PRESERVED` (422).
- Reporte mensual y CTIC usan el mismo intervalo [inicio 08:00, relevo 08:00). `daysBetween` de feriados conserva ambos extremos incluidos. Los tramos parciales se muestran como cobertura real (horas/24), **no como regla de liquidación de remuneraciones**.

Migración interna nueva preparada, no ejecutada: `20261018_add_guard_crews`. No cambia Prisma schema ni las migraciones anteriores.

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
