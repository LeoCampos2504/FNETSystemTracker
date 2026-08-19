# Matriz de ports ↔ adapters Prisma

Estado del lado Prisma del checkpoint de integración con Leo. Los 10 ports
que `BackendRepositories` de Leo necesita, cada uno con su adapter Prisma,
qué lo prueba, y su estado. Pensado para que Leo pueda integrar sin tener
que re-auditar esta capa entera.

**Ninguno de estos 10 adapters hace autorización, dispara notificaciones,
escribe auditoría implícita, ni decide reglas de negocio (URGENT/NORMAL,
políticas de compliance, etc.).** Son persistencia pura — leen/escriben
exactamente lo que su método dice y nada más. Ver `SIDE EFFECTS` por fila.

| # | Port (`src/server/ports/`) | Adapter Prisma | Métodos | Null semantics | Tests | Side effects | Status |
|---|---|---|---|---|---|---|---|
| 1 | `UserRepository` | `userPrismaRepository` | `findById`, `findByEmail` | `T \| null` en ambos — nunca throw | `prisma/tests/repositories/user.test.ts` (6) | NO | PASS |
| 2 | `TechnicianRepository` | `technicianPrismaRepository` | `findById`, `listByZone` | `findById`: `T \| null`; `listByZone`: `[]` si no hay match | `prisma/tests/repositories/technician.test.ts` (5) | NO | PASS |
| 3 | `TaskRepository` | `taskPrismaRepository` | `findById`, `listByDate`, `listPending`, `updateAssignments`, `updateSchedule`, `updateStatus` | `findById`: `T \| null`; lists: `[]`; las 3 mutaciones devuelven `Task` (no nullable en el port) — `throw` en id inexistente es correcto ahí, no una violación | `prisma/tests/repositories/task.test.ts` (12) | NO — `updateStatus` inserta `TaskStatusHistory` (persistencia del propio dominio del port, no un side effect de otro dominio) | PASS |
| 4 | `GuardRepository` | `guardPrismaRepository` | `findById`, `list`, `getPerformance`, `updateTechnicians` | `findById`/`getPerformance`: `T \| null`; `list`: `[]`; `updateTechnicians`: `Guard` (no nullable, throw correcto) | `prisma/tests/repositories/guard.test.ts` (8) | NO | PASS |
| 5 | `VehicleRepository` | `vehiclePrismaRepository` | `findById`, `findByTechnician` | `T \| null` en ambos | `prisma/tests/repositories/vehicle.test.ts` (6) | NO | PASS |
| 6 | `ZoneRepository` | `zonePrismaRepository` | `findById`, `listByCoordinator`, `listSites` | `findById`: `T \| null`; lists: `[]` | `prisma/tests/repositories/zone.test.ts` (6) | NO | PASS |
| 7 | `QuoteRepository` | `quotePrismaRepository` | `list` | `[]` si no hay match | `prisma/tests/repositories/quote.test.ts` (6) | NO | PASS |
| 8 | `NotificationRepository` | `notificationPrismaRepository` | `listByUser` | `[]` si no hay match | `prisma/tests/repositories/notification.test.ts` (4) | NO | PASS |
| 9 | `AuditRepository` | `auditPrismaRepository` | `append`, `listByEntity` | `append`: `AuditLog` (no nullable, siempre construye la fila); `listByEntity`: `[]` | `prisma/tests/repositories/audit.test.ts` (4) | NO — `append` solo persiste la fila que le pasan, no decide cuándo auditar | PASS |
| 10 | `AuthCredentialsRepository` | `authCredentialsPrismaRepository` | `getPasswordHash` | `string \| null` — `null` si el usuario no existe | `prisma/tests/repositories/auth-credentials.test.ts` (6) | NO — no compara password, no usa bcrypt para verificar, no aplica política active/inactive | PASS |

**Factory**: `createPrismaRepositories()` en
`src/server/repositories/prisma/factory.ts` devuelve los 10 como un objeto
`{ user, technician, task, guard, vehicle, zone, quote, notification, audit,
authCredentials }`, cada campo tipado contra el port real (chequeo
estructural en compile-time) + tests runtime que confirman las 10 claves
exactas (`src/server/repositories/prisma/factory.test.ts`, sin DB) y que
cada una funciona contra datos reales (`prisma/tests/factory.test.ts`, con
DB).

## AuthCredentialsRepository — detalle

`src/server/ports/auth-credentials.repository.ts` **no existía en esta
rama** (Leo lo definió/auditó en la suya, `feature/leo-backend-core`, no
mergeada acá). Como `src/server/ports/**` no está en la lista de contratos
congelados de `docs/WORK_SPLIT.md` (solo `src/contracts/**` y `Api` lo
están), se creó acá con el contrato exacto reportado:

```ts
interface AuthCredentialsRepository {
  getPasswordHash(userId: string): Promise<string | null>;
}
```

No se creó ninguna tabla/campo nuevo — `User.passwordHash` ya existía desde
el bloque anterior. El adapter hace `prisma.user.findUnique({ where: { id },
select: { passwordHash: true } })`: selecciona *solo* esa columna (nunca
carga la fila `User` completa), y devuelve `null` si no hay match. No
compara contraseñas, no usa bcrypt para verificar nada — eso es de
`AuthService` (Leo). Ningún log/test imprime el valor del hash.

## Transacciones / riesgo cross-repository (documentado, no resuelto acá)

Las únicas transacciones internas hoy son de un solo repository:
`TaskRepository.updateAssignments`/`updateStatus` y
`GuardRepository.updateTechnicians` usan `prisma.$transaction([...])` para
que sus propias escrituras relacionadas (p. ej. reemplazar
`TaskTechnician`, o `Task` + `TaskStatusHistory`) sean atómicas. **Ninguna
transacción cubre operaciones de OTRO repository** — por ejemplo, si un
futuro flujo de negocio necesita "cambiar el estado de una tarea +
persistir un `AuditLog` + crear una `Notification`" de forma atómica, hoy
eso son 3 llamadas independientes a 3 repositories distintos, sin ninguna
garantía conjunta de todo-o-nada. Eso es orquestación de nivel de servicio
(Leo), no de repository. **No se construyó ningún UnitOfWork ni mecanismo
de transacción cross-repository en este bloque** — deliberadamente fuera de
alcance.

Repositories que participan en esa orquestación futura, para referencia:
`TaskRepository`, `GuardRepository`, `AuditRepository`,
`NotificationRepository`.

## Qué necesita importar Leo

```ts
import { createPrismaRepositories } from "@/server/repositories/prisma";
// o, para el tipo:
import type { PrismaRepositories } from "@/server/repositories/prisma";

const repos = createPrismaRepositories();
// repos.user, repos.technician, repos.task, repos.guard, repos.vehicle,
// repos.zone, repos.quote, repos.notification, repos.audit, repos.authCredentials
```

`PrismaRepositories` (el tipo de retorno) está deliberadamente **separado**
de cualquier `BackendRepositories` que exista en la rama de Leo — ese tipo
no se importó ni se recreó acá porque no existe en esta rama. El tipado
final contra `BackendRepositories` (renombrar campos si hiciera falta,
adaptar shape si el container de Leo espera algo distinto) es responsabilidad
de Leo al integrar — cada campo de `PrismaRepositories` ya es estructuralmente
el port real, así que un simple `satisfies BackendRepositories` o una
asignación directa debería alcanzar si los nombres de campo coinciden.
