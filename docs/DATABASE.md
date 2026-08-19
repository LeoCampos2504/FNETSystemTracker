# Base de datos

Dueño: Gino ([WORK_SPLIT.md](WORK_SPLIT.md)). Cubre `prisma/**`,
`src/server/repositories/prisma/**`, `src/server/kpis/**` y
`src/app/api/kpis/**`.

## Motor y por qué

**Objetivo productivo: PostgreSQL.** El `datasource` de
[`prisma/schema.prisma`](../prisma/schema.prisma) usa
`provider = "postgresql"` — nunca se cambió por SQLite ni por otro motor.

Para el prototipo, en vez de bloquear todo esperando un servidor Postgres
externo (Docker, RDS, etc.), corremos localmente **`prisma dev`**: un
servidor Postgres embebido que viene con Prisma 7 (basado en PGlite, un
Postgres compilado a WASM). No es "compatible con Postgres" ni "parecido a
Postgres" — habla el protocolo Postgres real y corre las mismas queries SQL,
así que el schema, las migraciones y los repositorios son exactamente lo que
se usaría contra una instancia real. Migrar a producción es cambiar
`DATABASE_URL` a una instancia de Postgres real; nada en el schema depende de
una particularidad de PGlite.

```bash
npx prisma dev        # levanta el servidor local (foreground)
npx prisma dev -d     # o en background
```

Al levantar imprime `DATABASE_URL` (y `SHADOW_DATABASE_URL`, usada por
`prisma migrate dev` para detectar drift). Copiá esos valores a tu `.env`
(ver [`.env.example`](../.env.example)).

## Prisma 7: conexión fuera de schema.prisma

Prisma 7 sacó `url` del bloque `datasource` — ya no se puede poner la
connection string en `schema.prisma`. En su lugar:

- **CLI** (`prisma migrate`, `prisma studio`, `prisma db seed`, `prisma dev`):
  lee la config de [`prisma.config.ts`](../prisma.config.ts), que resuelve
  `DATABASE_URL`/`SHADOW_DATABASE_URL` desde el entorno (cargando `.env` con
  `dotenv/config`, porque `@prisma/config` no lo hace solo).
- **Runtime de la app**: el `PrismaClient` ya no abre la conexión por su
  cuenta — hay que pasarle un *driver adapter* explícito. Usamos
  `@prisma/adapter-pg` (`pg` por debajo, protocolo Postgres estándar) en
  [`src/server/repositories/prisma/client.ts`](../src/server/repositories/prisma/client.ts).
  Ese mismo adapter funciona sin cambios contra `prisma dev` local y contra
  Postgres real en producción.

El cliente generado no va a `node_modules/@prisma/client` (Prisma 7 requiere
un `output` explícito) sino a `src/generated/prisma/` — está en `.gitignore`,
se regenera con `npx prisma generate` (también corre solo en `postinstall`).

## Cómo correr todo localmente (de cero, en una PC nueva)

```bash
git clone <repo> && cd fnet-system-tracker
npm install                # corre `prisma generate` en postinstall
npx prisma dev -d          # servidor Postgres local, en background — imprime
                            # DATABASE_URL y SHADOW_DATABASE_URL
cp .env.example .env       # y pegar ahí el DATABASE_URL/SHADOW_DATABASE_URL impresos arriba
npx prisma migrate deploy  # aplica prisma/migrations/** tal cual están (no
                            # crea migraciones nuevas — para eso, ver abajo)
npm run db:seed            # carga los datos de demo
npm test                   # 56 tests puros, sin DB (formulas de KPI, mappers, mocks)
npm run test:db            # ~76 tests de integración contra la DB real (re-siembra sola)
npm run dev                 # NEXT_PUBLIC_USE_MOCK_API=false en .env para usar la API real
```

Este flujo completo (servidor nuevo, sin datos previos → migrate deploy →
generate → seed → consultar) se probó de punta a punta como parte de la
auditoría de este bloque: se levantó un segundo servidor `prisma dev`
completamente separado (`npx prisma dev -n rebuild -d`, apuntando a un
`template1` vacío) y se corrió exactamente esta secuencia contra él.

Si en cambio estás desarrollando el schema y necesitás generar una migración
nueva a partir de un cambio en `schema.prisma`, usá `npm run db:migrate`
(`prisma migrate dev`) — ojo que ese comando es interactivo (pide
confirmación si detecta un cambio riesgoso) y **no corre bien en un shell no
interactivo** (agentes, CI); en ese caso generá el SQL con `prisma migrate
diff` (comando de solo lectura) y armá el archivo de migración a mano — así
se hizo la migración `harden_persistence_integrity` de este bloque, ver ese
archivo para el patrón exacto.

Scripts disponibles (`package.json`):

| Script | Qué hace |
|---|---|
| `npm run db:dev` | `prisma dev` — servidor Postgres local |
| `npm run db:migrate` | `prisma migrate dev` — crea/aplica migraciones (interactivo) |
| `npm run db:seed` | `tsx prisma/seed.ts` — carga datos de demo |
| `npm run db:reset` | `prisma migrate reset` — dropea, re-migra y re-siembra (**destructivo**, pide confirmación) |
| `npm run db:studio` | `prisma studio` — explorador visual |
| `npm test` | tests puros (KPIs, mappers, mocks) — sin DB, corren siempre |
| `npm run test:db` | tests de integración contra la DB real — necesitan `prisma dev` corriendo y `DATABASE_URL` en `.env` |

### Si el servidor local deja de responder

`prisma dev` es un proceso de Node corriendo en background. Si lo matás por
accidente (p. ej. un `taskkill`/`kill` genérico que le pega a un PID
equivocado — nos pasó armando este mismo bloque) vas a ver errores tipo
`ECONNREFUSED` o `Connection terminated unexpectedly` en cualquier query.
Solución: `npx prisma dev -d` de nuevo con el mismo `--name` — reusa los
mismos datos, no hace falta re-migrar ni re-sembrar.

### Resetear la demo

```bash
npm run db:reset
```

o, si el servidor ya está migrado y solo querés datos frescos:

```bash
npm run db:seed
```

`prisma/seed.ts` es idempotente: borra sus propias tablas (en orden seguro
para FKs) antes de insertar, así que correrlo de nuevo deja la demo en el
mismo estado.

## Entidades y relaciones

Ver [`prisma/schema.prisma`](../prisma/schema.prisma) como fuente de verdad;
resumen:

- **User** — auth. `passwordHash` (bcrypt, nunca texto plano). `Technician`/
  `Coordinator` opcionalmente apuntan a un `User` (`userId` único).
- **Zone**, **CoordinatorZone**, **Coordinator** — muchos a muchos: un
  coordinador puede tener varias zonas y viceversa, vía tabla puente.
- **Site** — pertenece a una `Zone`, tiene lat/lng propios (no un JSON de
  coordenadas) y `metadata Json?` para datos sueltos del origen externo.
- **Technician** — `primaryZoneId` (obligatoria) + `onLoanZoneId` (opcional).
  El préstamo temporal es un campo separado, nunca sobrescribe la zona
  principal — así no se pierde el historial de a qué zona pertenece
  normalmente el técnico.
- **Task** — snapshot de `siteCode`/`zoneId`/lat/lng además de la relación a
  `Site`, igual que el contrato `Task` (así se preserva lo que mandó la
  fuente externa aunque el sitio cambie de zona después).
  - **TaskTechnician** — tabla puente con `role` (`PRIMARY`/`COLLABORATOR`)
    en vez de columnas `technician1Id`/`technician2Id`. Permite el caso
    normal (dupla) y la excepción (un solo `PRIMARY`).
  - **TaskStatusHistory** — una fila por transición de estado.
  - **TaskRejection** — una fila por **evento** de rechazo. Un formulario
    rechazado dos veces son dos filas, nunca un contador.
- **Guard** + **GuardTechnician** — cuadrilla de guardia como tabla puente,
  para poder tener guardias temporales con técnicos mezclados sin tocar el
  modelo de `Guard`.
  - **`GuardPerformance` no es una tabla.** Se calcula on-the-fly
    (`src/server/kpis/guard-performance.ts`) comparando el intervalo real de
    cada tarea correctiva (`arrivalAt`) contra `[Guard.startAt, Guard.endAt]`
    — nunca con una regla fija de "después de las 18". Ver
    [KPI_DEFINITIONS.md](KPI_DEFINITIONS.md).
- **Vehicle** + **VehicleAssignment** — igual que Guard: el vehículo actual
  de un técnico **no es una columna**, se deriva de la asignación con
  `endAt: null`. Esto es intencional: sobreescribir un campo
  `assignedTechnicianId` en cada cambio destruiría el historial. La pregunta
  "¿qué vehículo tenía Juan el 18/08?" es un range query sobre
  `VehicleAssignment`.
- **Quote** — `coordinatorId` es opcional y adicional al contrato (no lo
  expone la API todavía); la pertenencia real sigue siendo por zona/proyecto
  como pide el contrato.
- **Notification**, **AuditLog** — persistencia simple, un mapeo directo del
  contrato (`AuditLog.actor` se guarda como `actorId` en la tabla).

## Decisiones y limitaciones del prototipo

- **No hay columnas `assignedTechnicianId` (Vehicle) ni `GuardPerformance`
  como tabla** — se derivan de eventos reales (ver arriba). Es más código en
  el repositorio, pero evita que un `UPDATE` borre historial.
- **IDs**: el seed usa los mismos IDs legibles que `src/mocks/**`
  (`zone-noa`, `tech-01`, `task-P0001`, ...) en vez de CUIDs generados,
  para que la demo sea fácil de inspeccionar. El schema no lo exige — en
  producción, los IDs que vengan de Sytex/BizFlow/MaxTracker se resuelven
  vía `externalId`/`externalSource`, no vía el `id` interno.
- **TaskStatusHistory sintético**: `src/mocks/tasks.ts` solo tiene el estado
  final de cada tarea, no una transición real. El seed sintetiza una entrada
  `OPEN` inicial y, si corresponde, una segunda con el estado actual — es
  una aproximación razonable para la demo, no un reemplazo de los eventos
  reales que va a mandar Sytex.
- **`prisma dev` es un servidor local para desarrollo**, no para producción.
  El paso a producción es: apuntar `DATABASE_URL`/`SHADOW_DATABASE_URL` a una
  instancia real de PostgreSQL y correr `prisma migrate deploy`. Nada del
  schema ni de los repositorios cambia.
- **n8n / Sytex / BizFlow / MaxTracker reales**: no implementado (fuera de
  alcance del prototipo). El modelo ya lleva `externalId`/`externalSource`/
  `sourceUpdatedAt` en las entidades sincronizables para no tener que romper
  el schema cuando se conecten.

## Auditoría de integridad/persistencia (segundo bloque)

Migración `20260819030145_harden_persistence_integrity`. Cambios reales,
cada uno con una razón concreta (no cambios de estilo):

1. **`externalId` único → `@@unique([externalSource, externalId])`** en
   Technician/Coordinator/Zone/Site/Task/Guard/Vehicle/Quote. Un
   `externalId @unique` a secas es incorrecto para un modelo multi-fuente:
   dos filas de sistemas distintos (SYTEX/BIZFLOW/MAXTRACKER) que
   coincidieran en el string de id en la misma tabla se rechazarían como
   duplicado aunque no tengan relación. Verificado antes de aplicar: cero
   filas violaban la nueva constraint en los datos ya sembrados.
2. **Todos los timestamps a `@db.Timestamptz(3)`** (excepto
   `Task.scheduledDate`, que es una fecha pura, `@db.Date`). Estaban
   guardándose como `timestamp` sin zona horaria — un tipo que depende de la
   timezone de la sesión que lee/escribe para significar algo, exactamente
   el problema de "asumir timezone local silenciosamente". La app siempre
   lee/escribe ISO-8601 UTC (`src/contracts/common.ts`), así que
   `timestamptz` es el tipo que realmente corresponde.
3. **Índices agregados** porque coinciden con una query real ya existente en
   el código (no especulativos):
   - `VehicleAssignment(vehicleId, endAt)` / `(technicianId, endAt)`: el
     "vehículo actual" (`findByTechnician`, `mapVehicle`'s include) filtra
     por `endAt: null`, no por `startAt` — el índice anterior
     `(vehicleId/technicianId, startAt)` no ayuda a esa consulta.
   - `Notification(userId, createdAt)` reemplaza el `@@index([userId])`
     suelto: `listByUser` siempre hace `WHERE userId = X ORDER BY createdAt
     DESC` — el compuesto sirve exactamente esa consulta y ya cubre las
     búsquedas por `userId` solo como prefijo, así que el índice viejo era
     redundante.
   - `Quote(createdAt)`: `list()` siempre hace `ORDER BY createdAt DESC` sin
     `LIMIT` — sin índice, cada llamada ordena el resultado completo desde
     cero.
   - `AuditLog(actorId)` y `AuditLog(createdAt)`: el enunciado de la tarea
     pide explícitamente poder consultar "acciones de usuario" y "período"
     además de por entidad — baratos de tener (los audit logs se escriben
     con poca frecuencia) aunque el port actual (`listByEntity` solamente)
     todavía no los usa.
4. **`mapVehicle`'s include ahora tiene `orderBy: {startAt: "desc"}, take:
   1`** en vez de solo `where: {endAt: null}` — si alguna vez existieran dos
   asignaciones abiertas para el mismo vehículo (hoy imposible: no hay
   método de escritura para `VehicleAssignment` en el port), la elección
   deja de ser una fila arbitraria y pasa a ser "la más reciente".
5. **Los dos endpoints KPI ahora envuelven la consulta en `try/catch`** y
   devuelven `{ error: "Internal server error" }` con `500` — antes un error
   de DB se propagaba sin control. Nunca se reenvía el mensaje/stack del
   error real al cliente (se loguea server-side con `console.error`).

### Encontrado pero deliberadamente NO corregido con un cambio de schema

- **`User.email` es case-sensitive** (`user@x.com` y `User@x.com` podrían
  coexistir). No se agregó una solución a nivel DB: `citext` de Postgres
  necesita el preview feature `postgresqlExtensions` de Prisma (no es algo
  para meter en un schema pensado para mapear limpio a producción), y un
  índice único por expresión (`lower(email)`) escrito a mano en SQL no es
  representable en `schema.prisma` — una futura corrida de `prisma migrate
  dev` podría proponer borrarlo sin que nadie lo pida explícitamente, lo
  cual es peor que no tenerlo. Tampoco hay ningún método de escritura para
  crear usuarios todavía (`UserRepository` es de solo lectura). Mitigación
  recomendada cuando exista ese código (auth de Leo): normalizar el email a
  minúsculas antes de cada escritura.
- **`Task.arrivalAt`/`departureAt`, `Guard.startAt`/`endAt`,
  `VehicleAssignment.startAt`/`endAt`**: no se agregó ningún CHECK
  constraint (p. ej. "endAt > startAt", "no departureAt sin arrivalAt").
  Ninguno de los tres ports (`TaskRepository`, `GuardRepository`,
  `VehicleRepository`) expone hoy un método capaz de escribir esos campos
  con un valor inconsistente — el único lugar que los escribe es
  `prisma/seed.ts`, que ya los genera correctos. Si en el futuro se agrega
  un método de escritura para alguno de estos, revisar este punto.
- **`Quote.coordinatorId`**: existe en el modelo (columna opcional) pero
  nada lo escribe ni lo consulta todavía — `prisma/seed.ts` lo deja siempre
  `null`. Deliberadamente sin índice: agregarle uno ahora sería indexar una
  columna sin uso real.

## Advertencia de dependencias (para revisión humana, no acción automática)

`npm audit` reporta 3 vulnerabilidades "high" vía **GHSA-ggr8-5vv4-36mx**
(`deepmerge-ts < 8.0.0`, dependencia transitiva de `@prisma/config` →
`prisma`). El único fix que ofrece `npm audit fix --force` es **downgradear
`prisma` a `6.12.0`** — un cambio breaking que además vuelve a la sintaxis
vieja de `datasource.url` en `schema.prisma` (incompatible con todo lo
armado en este bloque). No se ejecutó ese fix ni ningún downgrade/override.

Alcance real: `deepmerge-ts` solo aparece vía `@prisma/config`, que es una
dependencia del **CLI de Prisma** (`devDependency`, usado en build-time/
dev-time — `prisma generate`/`migrate`/`dev`). No es una dependencia de
`@prisma/client` ni de `@prisma/adapter-pg` (los paquetes que sí corren en
producción), así que no es parte de la superficie de ataque de la app
desplegada — es una herramienta de desarrollo local. Queda para que un
humano decida si/cuándo actualizar Prisma a una versión que resuelva esto
sin downgrade (o esperar un patch de Prisma).
