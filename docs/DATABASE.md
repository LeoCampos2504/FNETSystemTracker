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

## Cómo correr todo localmente

```bash
npm install               # corre `prisma generate` en postinstall
npx prisma dev -d         # servidor Postgres local, en background
# copiar el DATABASE_URL/SHADOW_DATABASE_URL que imprime a .env
npm run db:migrate        # aplica prisma/migrations/** (crea una si hace falta)
npm run db:seed           # carga los datos de demo
npm run dev                # NEXT_PUBLIC_USE_MOCK_API=false para usar la API real
```

Scripts disponibles (`package.json`):

| Script | Qué hace |
|---|---|
| `npm run db:dev` | `prisma dev` — servidor Postgres local |
| `npm run db:migrate` | `prisma migrate dev` — crea/aplica migraciones |
| `npm run db:seed` | `tsx prisma/seed.ts` — carga datos de demo |
| `npm run db:reset` | `prisma migrate reset` — dropea, re-migra y re-siembra |
| `npm run db:studio` | `prisma studio` — explorador visual |

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
