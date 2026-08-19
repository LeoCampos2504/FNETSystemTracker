# Checklist de integración Prisma (para Gino)

Este documento describe, desde el lado de Leo, exactamente qué necesita el
backend de `src/server/repositories/prisma/**` para poder reemplazar
`src/server/repositories/memory/**` sin tocar ni un servicio ni una ruta.
No se integró Prisma en esta rama — esto es preparación, no integración.

**Regla de lectura de este documento:** todo lo marcado **CONFIRMADO** viene
de leer el código real de `feature/leo-backend-core`. Todo lo marcado
**PENDIENTE DE VERIFICAR EN RAMA DE GINO** es lo que el estado conocido
reporta (`653b0e8 feat: add data model and technician kpis`, 9 repositorios
reportados) pero que esta rama nunca importó, mergeó ni inspeccionó
directamente — por regla explícita de la tarea que generó este documento. No
asumir que coincide con lo que sigue hasta confirmarlo en la rama de Gino.

## 1. Ports que el backend de Leo necesita

Los 10 en `src/server/ports/**`, agregados en el tipo
`BackendRepositories` (`src/server/ports/backend-repositories.ts`):

| Port | Archivo |
|---|---|
| `UserRepository` | `src/server/ports/user.repository.ts` |
| `TechnicianRepository` | `src/server/ports/technician.repository.ts` |
| `TaskRepository` | `src/server/ports/task.repository.ts` |
| `GuardRepository` | `src/server/ports/guard.repository.ts` |
| `VehicleRepository` | `src/server/ports/vehicle.repository.ts` |
| `ZoneRepository` | `src/server/ports/zone.repository.ts` |
| `QuoteRepository` | `src/server/ports/quote.repository.ts` |
| `NotificationRepository` | `src/server/ports/notification.repository.ts` |
| `AuditRepository` | `src/server/ports/audit.repository.ts` |
| `AuthCredentialsRepository` | `src/server/ports/auth-credentials.repository.ts` |

## 2. Adapters Prisma que Gino reportó tener

**PENDIENTE DE VERIFICAR EN RAMA DE GINO.** Según el estado conocido al
iniciar este bloque, `653b0e8` reporta 9 repositorios Prisma: User,
Technician, Task, Guard, Vehicle, Zone, Quote, Notification, Audit. Esta
rama no inspeccionó `feature/gino-data-kpis` ni su código — no se puede
confirmar el shape exacto, la semántica null/not-found, ni si cumplen la
interfaz de puerto tal como está hoy.

## 3. Adapter que falta (según lo reportado)

**`AuthCredentialsRepository` — PENDIENTE DE VERIFICACIÓN / ADAPTER
NECESARIO.** Los 9 repositorios reportados por Gino no incluyen
`AuthCredentialsRepository`. Este port es chico a propósito — separado de
`UserRepository` porque la contraseña es un dato de auth interno que nunca
debería viajar en el contrato `User` compartido (ver
`src/server/ports/auth-credentials.repository.ts`):

```ts
export interface AuthCredentialsRepository {
  getPasswordHash(userId: string): Promise<string | null>;
}
```

`AuthService` (`src/server/services/auth.service.ts`) depende de
`Pick<BackendRepositories, "user" | "authCredentials">`. Sin un adapter
Prisma para `authCredentials`, el login no puede funcionar contra datos
reales — es un bloqueante concreto para la integración, no un detalle
menor. Qué necesita modelar Prisma para esto (a decisión de Gino, no
prescrito acá): dónde vive el hash de password por usuario y cómo se
llega desde un `userId`.

## 4. Métodos que cada port debe soportar

| Port | Métodos |
|---|---|
| `UserRepository` | `findById(id)`, `findByEmail(email)` |
| `TechnicianRepository` | `findById(id)`, `listByZone(zoneId)` |
| `TaskRepository` | `findById(id)`, `listByDate(date, filter?)`, `listPending(asOfDate, filter?)`, `updateAssignments(taskId, assignments)`, `updateSchedule(taskId, scheduledDate)`, `updateStatus(taskId, status)` |
| `GuardRepository` | `findById(id)`, `list(filter?)`, `getPerformance(guardId)`, `updateTechnicians(guardId, technicianIds)`, `create(input)`, `update(guardId, patch)` |
| `VehicleRepository` | `findById(id)`, `findByTechnician(technicianId)` |
| `ZoneRepository` | `findById(id)`, `listByCoordinator(coordinatorId)`, `listSites(zoneId)` |
| `QuoteRepository` | `list(filter?)`, `findById(id)` |
| `NotificationRepository` | `listByUser(userId)`, `create(entry)` |
| `AuditRepository` | `append(entry)`, `listByEntity(entity, entityId)` |
| `AuthCredentialsRepository` | `getPasswordHash(userId)` |

`TaskListFilter`, `GuardListFilter`, `QuoteListFilter`, `CreateGuardInput`,
`UpdateGuardInput` — shapes exactas en cada archivo de port. No duplicados
acá a propósito; el port es la fuente de verdad.

## 5. Comportamiento null/not-found que el backend requiere

Confirmado con tests de regresión reales
(`docs/CONTRACT_CHANGE_REQUESTS.md`, entrada "3 endpoints no cumplían el
`X | null`"): un repositorio Prisma que lance en vez de devolver `null`
para "no existe" en estos casos rompería el contrato HTTP:

- `TaskRepository.findById` → `null` si no existe (nunca throw). Usado por
  `GET /api/tasks/:id` (`Api.getTask`).
- `GuardRepository.findById` → `null` si no existe. Usado por
  `GET /api/guards/:id/performance` (`Api.getGuardPerformance`) — ahí el
  servicio primero llama `findById` y solo si existe llama
  `getPerformance`.
- `GuardRepository.getPerformance` → `null` si la guardia existe pero no
  tiene rendimiento calculado todavía.
- `TechnicianRepository.findById` → `null` si no existe. Usado por
  `GET /api/technicians/:id` (`Api.getTechnician`).
- `VehicleRepository.findById` / `findByTechnician` → `null` si no existe.
- `QuoteRepository.findById` → `null` si no existe.
- `UserRepository.findById` / `findByEmail` → `null` si no existe.
- `AuthCredentialsRepository.getPasswordHash` → `null` si no hay hash
  (no crear uno "vacío" ni lanzar).

Las mutaciones (`updateAssignments`, `updateSchedule`, `updateStatus`,
`GuardRepository.update`, etc.) SÍ pueden lanzar si el id no existe — esos
casos ya están cubiertos por un chequeo de existencia en el servicio antes
de llamar al repositorio (`getTaskById`/`getGuardById`, no las variantes
`find*`), así que un throw ahí nunca llega al cliente sin convertirse antes
en un 404 controlado.

## 6. Side effects que siguen siendo responsabilidad de los services

**No mover a Prisma:** la decisión de QUÉ auditar/notificar y con qué
contenido vive en `src/server/services/task.service.ts` y
`guard.service.ts` (vía las funciones inyectadas `recordAudit`,
`notifyTaskAssignment`, `notifyScheduleChange`, `notifyGuardChange` —
ver `src/server/backend-container.ts`). Un repositorio Prisma para
`audit`/`notification` solo necesita persistir lo que el servicio ya
armó (`AuditRepository.append`, `NotificationRepository.create`) — no debe
decidir de nuevo cuándo auditar, a quién notificar, ni deduplicar
(la deduplicación de "solo notificar a técnicos recién agregados" y de
"no auditar/notificar en un no-op" ya la resuelve el servicio, antes de
llamar al repositorio).

**Riesgo a evaluar, NO resuelto acá:** hoy, en memory, una mutación de
tarea + su auditoría + su notificación son 3 llamadas secuenciales
independientes (sin transacción). Con Prisma real, si `updateAssignments`
persiste pero `audit.append` falla, quedarían inconsistentes. Esto no se
implementó — evaluarlo cuando Gino conecte Prisma de verdad (ver sección
28 del pedido que originó este documento: no implementar transacciones
distribuidas todavía).

## 7. Qué NO debe duplicar Prisma

- Reglas de autorización (viven en `src/server/http/auth-guards.ts`,
  `scope.ts` — HTTP layer, no repository layer).
- Validación de forma/negocio (zod en `src/server/validation/**` +
  chequeos de servicio como "no duplicar `technicianId`", "no más de 2
  técnicos", "`endAt` > `startAt`", existencia de `technicianId`/`zoneId`
  referenciados).
- El shape de error HTTP (`src/server/http/errors.ts`/`respond.ts`).
- La decisión de prioridad operacional (`src/server/services/priority.service.ts`,
  pura, no toca ningún repositorio) ni el cálculo de pertenencia a guardia
  (`guard-interval.service.ts`, también pura).
- Los contratos (`src/contracts/**`) — un adapter Prisma debe devolver
  exactamente los tipos que ya existen ahí, mapeando desde el modelo de
  datos real, sin inventar un shape paralelo.

## 8. Cómo enchufar Prisma cuando esté listo (para referencia futura, no implementado acá)

1. Crear `src/server/repositories/prisma/*.repository.ts`, uno por port,
   implementando exactamente la interfaz (mismos métodos, misma semántica
   null/not-found de la sección 5).
2. En `src/server/container.ts`, cambiar la única línea
   `export const repositories: BackendRepositories = createMemoryRepositories();`
   por el equivalente con los repositorios Prisma (o un
   `createPrismaRepositories()` análogo a `createMemoryRepositories()`).
   Ningún otro archivo de `src/server/services/**` ni `src/app/api/**`
   debería necesitar cambios — si alguno los necesita, es señal de que algo
   quedó mal abstraído (ver `createBackendContainer` en
   `src/server/backend-container.ts` para el punto de integración
   alternativo/explícito).
3. Correr la suite de tests como regresión (sección 9).
4. NO agregar un switch por variable de entorno (`USE_PRISMA`,
   `REPOSITORY_PROVIDER`) todavía si Prisma no está realmente disponible en
   todos los entornos — decisión explícitamente fuera de alcance de esta
   preparación.

## 9. Tests que sirven como regresión para la integración

- Los 307 tests existentes al cierre de `6acf56a` (rutas, servicios,
  auth, validación) — deberían seguir pasando sin cambios si los adapters
  Prisma cumplen los ports correctamente, porque servicios y rutas no
  saben ni les importa qué implementación reciben.
- `src/server/backend-container.test.ts` (nuevo en este bloque) —
  demuestra que `createBackendContainer(repositories)` funciona con
  cualquier `BackendRepositories` que cumpla los ports; correrlo con
  repositorios Prisma reales (no memory) sería la prueba más directa de
  que la integración es correcta.
- `docs/API_TEST_MATRIX.md` — matriz completa de qué debería seguir
  devolviendo cada endpoint.
