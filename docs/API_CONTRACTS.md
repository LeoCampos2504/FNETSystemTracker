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

Implementado por Leo con cookie httpOnly (`fnet_session`, JWT firmado con
`jose`/`AUTH_SECRET`) + el `token` también devuelto en el body por si hace
falta un cliente sin cookies. Passwords hasheadas con bcrypt — nunca en
texto plano ni en el `User` del contrato.

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| POST | `/api/auth/login` | `LoginCredentials { email, password }` | `AuthSession { user, token, expiresAt }` |
| POST | `/api/auth/logout` | — | `{ ok: true }`. Limpia la cookie. Ver [CONTRACT_CHANGE_REQUESTS.md](CONTRACT_CHANGE_REQUESTS.md): pendiente agregar `logout()` a `Api`. |
| GET | `/api/auth/me` | — (usa cookie de sesión) | `User \| null`. Nunca 401: "no logueado" es `null`, no error. |

## Tareas

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/tasks/today` | `?technicianId?&zoneId?&date?` | `Task[]` |
| GET | `/api/tasks/pending` | `?technicianId?&zoneId?&asOfDate?` | `Task[]` (pendientes de reprogramar) |
| GET | `/api/tasks/:id` | — | `Task \| null` |
| PUT | `/api/tasks/:id/assignments` | `AssignTechniciansToTaskInput { taskId, assignments }` | `Task` |
| PUT | `/api/tasks/:id/schedule` | `ScheduleTaskInput { taskId, scheduledDate }` | `Task`. También es el endpoint de **reprogramación**: programar de nuevo con otra fecha una tarea ya programada es "reprogramar" — no hay una ruta separada, ver [CONTRACT_CHANGE_REQUESTS.md](CONTRACT_CHANGE_REQUESTS.md). |
| PUT | `/api/tasks/:id/status` | `UpdateTaskStatusInput { taskId, status }` | `Task` |

Coordinador/Admin únicamente (technician nunca muta tareas desde acá).
`assignments`/`schedule`/`status` devuelven 409 si la tarea ya está
`APPROVED`. Toda mutación registra `AuditLog` y dispara notificaciones
relevantes (`NEW_TASK`, `CORRECTIVE_URGENT` si aplica, `SCHEDULE_CHANGE`).

## Guardias

Coordinador (zona propia) / Admin para mutaciones; lectura también permitida
a un technician que integre la guardia consultada.

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/guards` | `?zoneId?&technicianId?` | `Guard[]` |
| GET | `/api/guards/:id` | — | `Guard`. Adicional, no estaba documentado originalmente. |
| POST | `/api/guards` | `{ zoneId, technicianIds (1-2), startAt, endAt }` | `Guard` (201). Adicional. |
| PATCH | `/api/guards/:id` | Subconjunto parcial de `{ zoneId, technicianIds, startAt, endAt }` | `Guard`. Adicional — permite editar horario/zona además de la cuadrilla. |
| GET | `/api/guards/:id/performance` | — | `GuardPerformance \| null` |
| PUT | `/api/guards/:id/assignments` | `AssignGuardInput { guardId, technicianIds }` | `Guard`. Atajo de `PATCH` que solo toca `technicianIds` (esta es la que expone `Api.assignGuard`). |

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

Coordinador (zona/proyecto propio, o filtra por su propio `coordinatorId` si
no manda zona) / Admin. Technician no tiene acceso (no está en su rol).

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/quotes` | `?zoneId?&coordinatorId?&status?&projectId?&from?&to?` | `Quote[]`. `projectId`/`from`/`to` son adicionales a `GetQuotesParams` (P1, ver CCR). |
| GET | `/api/quotes/:id` | — | `Quote`. Adicional, no estaba documentado originalmente. |

## Notificaciones

| Método | Ruta | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/notifications` | `?userId` | `Notification[]` |

## Notas de implementación (Leo)

- Validar todo request body/query con `zod` antes de tocar servicios
  (`src/server/validation/**`).
- Los Route Handlers no acceden a Prisma directamente: pasan por
  `src/server/services/**`, que a su vez dependen de `src/server/ports/**`
  vía `src/server/container.ts` (único lugar que sabe qué implementación de
  repositorio se está usando).
- Mientras Gino no tenga `src/server/repositories/prisma/**` listo, se usa
  `src/server/repositories/memory/**` (mismo contrato de puerto) — hoy es lo
  único que existe, cableado en `container.ts`.
- Auditoría: toda mutación P0 (assignments/schedule/status de tareas,
  create/update de guardias) registra un `AuditLog` vía
  `src/server/services/audit.service.ts`.
- Autorización (`src/server/http/auth-guards.ts`, `scope.ts`): TECHNICIAN
  siempre forzado a sus propios datos (403 si pide otra cosa); COORDINATOR
  limitado a sus zonas (`coordinator.zoneIds`, sin filtro por defecto se
  mergea sobre todas sus zonas); ADMIN sin restricciones. Nunca se confía en
  que el frontend ya filtró — todo se re-valida server-side.
- Errores: `{ error: { code, message, details? } }` con status 400/401/403/
  404/409/500 (`src/server/http/errors.ts`). `assignments`/`schedule`/
  `status` de una tarea `APPROVED` devuelven 409 (ya no se puede tocar desde acá).
- Sesión: JWT (jose, HS256) en cookie httpOnly `fnet_session`
  (`src/server/auth/**`). `AUTH_SECRET` por env var; en dev sin esa var usa
  un fallback claramente marcado como inseguro (nunca en producción).
