# Runbook de base de datos — producción

Dueño: Gino. Complementa [DATABASE.md](DATABASE.md) (que cubre desarrollo
local) con lo que hace falta para un despliegue productivo real. Nada acá
depende de que exista todavía una base de datos de producción — es
preparación, no un despliegue ejecutado.

**Ningún comando de este documento se ejecutó contra una base de datos de
producción real.** Todo lo verificado en este bloque se hizo contra
instancias locales `prisma dev` (demo/dev). Los placeholders (`<...>`) nunca
son valores reales.

## 1. Seed destructivo: protección de producción

`prisma/seed.ts` es **destructivo por diseño** — `clearDatabase()` borra 13
tablas (en orden seguro para FKs: `audit_logs`, `notifications`,
`vehicle_assignments`, `vehicles`, `quotes`, `tasks` [cascada a
`task_technicians`/`task_status_history`/`task_rejections`], `guards`
[cascada a `guard_technicians`], `technicians`, `sites`,
`coordinator_zones`, `coordinators`, `zones`, `users`) antes de volver a
insertar los datos de demo. Correcto para DEV/TEST; catastrófico si corre
sin querer contra producción.

**Protección** (`prisma/seed-guard.ts`, función pura
`assertDestructiveSeedAllowed`, testeada en
`prisma/tests/seed-guard.test.ts` sin tocar ninguna DB):

```
NODE_ENV !== "production"
  → permitido

NODE_ENV === "production"  &&  FNET_ALLOW_DESTRUCTIVE_SEED !== "true"  (exacto)
  → ABORTA antes de tocar la base (antes de clearDatabase(), antes de cualquier delete)

NODE_ENV === "production"  &&  FNET_ALLOW_DESTRUCTIVE_SEED === "true"
  → permitido explícitamente (override deliberado)
```

El chequeo es la primera línea de `main()` en `prisma/seed.ts` — se ejecuta
antes de `console.log("Clearing existing data...")` y antes de la primera
query. No hay fallback silencioso: cualquier valor de
`FNET_ALLOW_DESTRUCTIVE_SEED` que no sea exactamente el string `"true"`
(`"TRUE"`, `"1"`, `"yes"`, vacío, con espacios) bloquea igual que si no
estuviera seteado.

Cuando bloquea, el mensaje es:

```
Destructive seed refused in production. NODE_ENV="production" and FNET_ALLOW_DESTRUCTIVE_SEED
is not exactly "true". ...
```

Nunca imprime `DATABASE_URL`, ningún password, ni ningún `passwordHash` —
probado explícitamente en `prisma/tests/seed-production-safety.test.ts`
(un test "sentinel": inserta un registro marcador, corre el seed con
`NODE_ENV=production` sin override, confirma que el proceso falla Y que el
marcador sigue existiendo — es decir, que el bloqueo ocurre *antes* de
cualquier borrado, no solo que el proceso termina mal en algún punto
intermedio).

`FNET_ALLOW_DESTRUCTIVE_SEED` **no está documentada todavía en
`.env.example`** — deliberado en este bloque (ver `docs/WORK_SPLIT.md`; Leo
puede estar tocando ese archivo en su integración). Trasladarla ahí después
de integrar las ramas.

## 2. Demo/dev vs. test vs. producción

| Entorno | `prisma/seed.ts` |
|---|---|
| DEV local | Permitido — es el flujo normal (`npm run db:seed`) |
| TEST (`NODE_ENV=test`, como corre Vitest por defecto) | Permitido — así funcionan los tests de integración de este repo |
| PRODUCCIÓN | **Bloqueado por defecto.** El seed de demo **no forma parte del deploy productivo normal** — nunca se corre automáticamente durante un deploy a producción. El override (`FNET_ALLOW_DESTRUCTIVE_SEED=true`) existe únicamente para una operación humana deliberada y extraordinaria (p. ej. resetear un ambiente de staging que se comporta como "producción" a nivel de infraestructura pero no tiene datos reales) — nunca para un pipeline automatizado. |

## 3. Migraciones — inventario

| # | Carpeta | Objetivo | Operaciones principales | Tablas | Clasificación |
|---|---|---|---|---|---|
| 1 | `20260819021914_init` | Schema inicial completo (17 modelos) | `CREATE TYPE` (9 enums), `CREATE TABLE` (17), `CREATE INDEX`/`CREATE UNIQUE INDEX`, `ADD CONSTRAINT` (FKs) | todas | **SAFE** — solo creación, ninguna tabla/columna preexistente que perder |
| 2 | `20260819030145_harden_persistence_integrity` | Ver [DATABASE.md § Auditoría de integridad](DATABASE.md#auditoría-de-integridadpersistencia-segundo-bloque) | `DROP INDEX` (9, todos únicos-por-columna de `externalId`), `ALTER COLUMN ... SET DATA TYPE TIMESTAMPTZ(3)` (17 tablas), `CREATE INDEX`/`CREATE UNIQUE INDEX` (14, incluye los 8 compuestos `externalSource+externalId`) | `audit_logs`, `coordinator_zones`, `coordinators`, `guard_technicians`, `guards`, `notifications`, `quotes`, `sites`, `task_rejections`, `task_status_history`, `task_technicians`, `tasks`, `technicians`, `users`, `vehicle_assignments`, `vehicles`, `zones` | **REQUIRES DATA CHECK** (constraint nueva podría fallar con duplicados preexistentes — se verificó contra la DB real antes de aplicar, cero duplicados) — **no DESTRUCTIVE**: ningún `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`. Ambas verificadas también en este bloque con un upgrade real desde datos pre-existentes (§6) |

Migraciones aplicadas se consideran **inmutables** — ninguna se modificó en
este bloque, ninguna razón (ni corrupción) para hacerlo apareció.

## 4. Migration safety — revisión estática

`prisma/tests/migration-safety.test.ts` escanea automáticamente el SQL de
**cada** migración buscando `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, y
`DELETE` sin `WHERE`. No es un parser de SQL — es una búsqueda de patrones
simple con una allowlist (`REVIEWED_DESTRUCTIVE_MIGRATIONS`) para el día que
una migración legítimamente necesite uno de esos: si aparece sin estar en
la allowlist, el test falla y obliga a una revisión humana explícita antes
de mergear. Hoy la allowlist está vacía — ninguna de las 2 migraciones
existentes dispara ninguno de esos patrones.

`DROP INDEX` no se marca como peligroso (no borra filas, solo un índice) —
la migración 2 tiene 9 de esos, todos redundantes con los índices
compuestos nuevos que los reemplazan.

## 5. Checklist antes de cada migración futura

```
[ ] backup tomado (ver §7)
[ ] SQL de la migración revisado línea por línea
[ ] búsqueda explícita de DROP TABLE / DROP COLUMN / TRUNCATE / DELETE sin WHERE
[ ] si aparece alguno: agregado a REVIEWED_DESTRUCTIVE_MIGRATIONS en
    prisma/tests/migration-safety.test.ts con la razón, o la migración se
    reescribe para no necesitarlo
[ ] constraints nuevas (unique, not null, FK) validadas contra los datos
    existentes ANTES de aplicar (ver el patrón de verificación en
    docs/DATABASE.md — se hizo así para la migración 2)
[ ] probada primero contra una copia/instancia de la DB, no directo en
    producción
[ ] `prisma migrate deploy` (nunca `migrate dev` ni `db push` en producción)
[ ] smoke test post-deploy (ver §8)
[ ] conteos/métricas básicas comparadas antes/después (ver §6)
```

## 6. Procedimiento de deploy de la base de datos

```
1. Backup (§7) — SIEMPRE antes de aplicar migraciones nuevas en producción.
2. Confirmar DATABASE_URL apunta a la instancia correcta (nunca imprimirla
   completa en logs compartidos).
3. npx prisma migrate status
   → si dice "Database schema is up to date!", no hay nada pendiente.
4. Revisar exactamente qué migraciones están pendientes antes de aplicar
   (git log de prisma/migrations/**, o la salida de `migrate status`).
5. npx prisma migrate deploy
   (NUNCA `prisma migrate dev` — es interactivo y puede intentar generar
   una migración nueva a partir de drift; NUNCA `prisma db push` — no dejsa
   rastro en el historial de migraciones)
6. `prisma generate` como parte del build/deploy de la aplicación, según lo
   defina la arquitectura de despliegue (p. ej. como paso de build previo a
   arrancar el proceso Next.js — no es parte de este runbook de DB en sí).
7. Health/smoke check (§8).
8. Estrategia de rollback si algo sale mal (§9) — decidida ANTES de
   empezar, no después.
```

**Verificado en este bloque**: `prisma migrate deploy` contra una instancia
`prisma dev` completamente vacía (nueva, sin ninguna migración aplicada)
aplicó las 2 migraciones limpio, y `npx prisma migrate status` devolvió
`Database schema is up to date!` — ver el reporte externo de este bloque
para los comandos exactos y la salida real.

## 7. Backup / restore

Formato recomendado para Postgres: `pg_dump` en formato custom (`-Fc`),
restaurado con `pg_restore` (permite restore paralelo/selectivo; más
flexible que un dump SQL plano).

```bash
# Backup (formato custom, comprimido)
pg_dump --format=custom --file=<backup-file>.dump "<DATABASE_URL>"

# Backup (formato SQL plano, alternativa human-readable/greppable)
pg_dump --format=plain --file=<backup-file>.sql "<DATABASE_URL>"

# Restore (formato custom) — contra una base VACÍA o una réplica de prueba,
# nunca sobre una base con datos que no querés perder
pg_restore --clean --if-exists --dbname="<DATABASE_URL>" <backup-file>.dump

# Restore (formato SQL plano)
psql "<DATABASE_URL>" -f <backup-file>.sql
```

`<DATABASE_URL>` y `<backup-file>` son placeholders — nunca pegar acá una
connection string real. Reemplazar `<DATABASE_URL>` por la variable de
entorno real al ejecutar (`pg_dump ... "$DATABASE_URL"`), nunca hardcodeada
en un script versionado.

### Prueba local de backup/restore (este bloque)

**`NOT EXECUTED — TOOLING UNAVAILABLE`**: `pg_dump`/`pg_restore`/`psql` no
están instalados en este entorno (`prisma dev` es un servidor embebido, no
trae el toolset cliente de Postgres). Se dejan documentados los comandos
exactos arriba para cuando haya un entorno con el cliente de Postgres
instalado (cualquier instalación estándar de PostgreSQL, o
`apt install postgresql-client` / `brew install libpq`, trae los tres).

## 8. Health / smoke post-deploy

Después de aplicar migraciones, antes de considerar el deploy exitoso:

```bash
npx prisma migrate status        # "Database schema is up to date!"
```

y, a nivel aplicación (no específico de este runbook de DB, pero parte del
mismo smoke): que un endpoint de lectura simple responda 200 contra la DB
recién migrada (p. ej. `GET /api/health`, o una query de conteo básica
sobre una tabla estable como `zones`).

## 9. Rollback

**Las migraciones de Prisma no se "deshacen" automáticamente.** No existe
un `prisma migrate undo`. Para producción:

- **Backup previo (§7) es la red de seguridad real** — si una migración
  causa un problema serio, restaurar desde el backup tomado justo antes es
  la opción confiable.
- **Forward-fix cuando corresponda**: si el problema es menor (p. ej. un
  índice faltante, una constraint demasiado estricta), la respuesta normal
  es escribir una migración NUEVA que corrija el problema hacia adelante,
  no intentar revertir la anterior.
- **Restore completo si el incidente lo exige**: cuando el forward-fix no
  alcanza o los datos ya se corrompieron.

**No se inventó SQL de rollback para las migraciones existentes** — ninguno
fue escrito ni probado en este bloque, y documentar un rollback no probado
sería peor que no tener ninguno (falsa sensación de seguridad).

## 10. Si `prisma migrate deploy` falla a mitad de camino

1. **No entrar en pánico ni ejecutar `migrate resolve` especulativamente.**
   Leer el mensaje de error completo primero — casi siempre dice
   exactamente qué sentencia SQL falló y por qué.
2. Confirmar el estado real con `npx prisma migrate status` — te dice si la
   migración quedó marcada como "failed" en `_prisma_migrations`.
3. Si la causa es una constraint que no puede satisfacerse con los datos
   actuales (el escenario más probable dado el historial de este proyecto —
   ver la migración 2), **corregir los datos primero** (con una query
   explícita, revisada, no un script improvisado) y reintentar
   `migrate deploy`.
4. `prisma migrate resolve --applied <migration>` o
   `--rolled-back <migration>` existen para casos donde vos (una persona)
   ya sabés con certeza qué pasó realmente en la base (p. ej. aplicaste el
   SQL a mano y necesitás que Prisma se entere) — **nunca como intento a
   ciegas de "destrabar" un deploy**. Si no estás seguro de cuál de los dos
   corresponde, parar y backup/restore en vez de adivinar.
5. Si nada de esto resuelve con confianza: restore desde el backup de §7 y
   re-planificar la migración.

## 11. Retención de datos / cascadas

Revisado (sin cambiar nada — documentando el comportamiento actual, ya
correcto desde el bloque de hardening):

- `TaskStatusHistory`, `TaskRejection`: `onDelete: Cascade` desde `Task` —
  correcto porque no tiene sentido que sobrevivan sin la tarea que
  describen; en operación normal `Task` nunca se borra (viene de
  Sytex/actualiza, no se elimina), así que esta cascada casi nunca se
  ejercita en la práctica.
- `VehicleAssignment`: sin `onDelete` en las FKs a `Vehicle`/`Technician` →
  `RESTRICT` por default de Postgres — no se puede borrar un vehículo o
  técnico que tiene historial de asignaciones, protegiendo exactamente el
  historial que pide este punto.
- `AuditLog`: sin FK a ninguna otra tabla (polimórfico: `entity`+`entityId`
  son strings planos) — nunca puede perderse por una cascada de otra tabla.

No se cambió ningún `onDelete` — el comportamiento ya era el correcto.

## 12. Tamaño de storage / índices (a futuro, sin tooling nuevo)

Sin hacer tuning prematuro ni instalar monitoring — queries estándar de
Postgres para revisar esto más adelante si hiciera falta:

```sql
-- Tamaño total de la base
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Tamaño por tabla (incluye índices y TOAST)
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Tamaño por índice
SELECT indexrelname AS index_name, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_catalog.pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

## 13. Concurrencia / transacciones cross-repository

Sin cambios en este bloque (no correspondía — ver `docs/PRISMA_PORT_MATRIX.md`
para el detalle). El transaction boundary entre repositories (p. ej. "tarea
+ audit + notificación" atómico) se evalúa como parte de la integración de
Leo (`integration/leo-gino-prisma`), no acá. No se agregaron locks, no se
cambiaron transacciones existentes, no se tocó ningún adapter.

## 14. `prisma dev` — no es Postgres productivo

Limitación ya documentada en `docs/DATABASE.md`, repetida acá porque es
relevante para production readiness: el servidor local `prisma dev`
(embebido, PGlite) puede degradarse después de varias suites de test
pesadas consecutivas dentro de la misma sesión — visto de nuevo en este
bloque. **No es una limitación de PostgreSQL real** — es una característica
del servidor de desarrollo liviano. No se rediseñó nada por esta
limitación; simplemente no se lo trata como si fuera productivo en ningún
razonamiento de este documento.
