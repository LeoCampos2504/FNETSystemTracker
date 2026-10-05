# Contract Change Requests

`src/contracts/**` y la interfaz pública `Api` (`src/lib/api/`) están
congelados: ningún cambio se hace ahí sin pasar por este documento primero.

Si necesitás modificar un contrato compartido (agregar un campo, cambiar un
enum, agregar/cambiar un método de `Api`, etc.):

1. Agregá una entrada acá abajo con el formato de la plantilla.
2. Avisá a quienes consumen ese contrato (frontend si es un tipo de dominio o
   `Api`; Leo/Gino si afecta repos o KPIs).
3. Una vez acordado, aplicá el cambio en **un solo commit/PR** que actualice:
   - el contrato en `src/contracts/**`,
   - `src/mocks/**` si corresponde,
   - `mock-api.ts` **y** `http-api.ts` si el cambio toca `Api`,
   - `docs/API_CONTRACTS.md` si agregaste/cambiaste un endpoint.
4. Movés la entrada a "Resueltos" con la fecha y el commit.

No hay "cambios chicos que no ameritan pasar por acá": si toca
`src/contracts/**`, pasa por acá.

## Plantilla

```md
### [Pendiente] Título corto del cambio
- Quién lo pide:
- Contrato afectado:
- Por qué:
- Impacto (qué otros archivos hay que tocar):
```

## Pendientes

_(vacío — agregar acá)_

## Resueltos

### [Resuelto 2026-10-05] Insumos repetidos agrupados con su recuento (aditivo)
- Quién lo pide: Eugenia (coordinación).
- Contrato afectado: `src/contracts/operations.ts` — se agrega `lines?: number` a `SourceMaterial` (cuántas líneas de Sytex componen la fila).
- Por qué: el mismo insumo repetido en un formulario (por ejemplo tres líneas de "Llave térmica de C63", una unidad cada una) se mostraba como tres filas iguales; ahora es una fila con la cantidad total.
- Impacto: ninguno en `Api`, mocks ni Prisma. La revisión de una fila agrupada se guarda con la clave de su primera línea.

### [Resuelto 2026-10-05] Enlace a Sytex en `Task` (aditivo)
- Quién lo pide: Eugenia (coordinación).
- Contrato afectado: `src/contracts/task.ts` — se agrega `externalUrl?: string | null` a `Task`. Es opcional: mocks y `http-api` siguen siendo válidos.
- Por qué: poder abrir la tarea en Sytex desde la lista de Tareas. El servidor ya devolvía el campo; solo faltaba declararlo.
- Impacto: ninguno en `Api`, mocks ni Prisma.

### [Resuelto 2026-10-05] Tipos de guardia pasiva y fuera de horario (aditivo)
- Quién lo pide: Eugenia (coordinación).
- Contrato afectado: `src/contracts/operations.ts` — se agregan `GuardPeriod` (guardia pasiva desde–hasta, cualquier día de inicio), `Holiday`, `OffHoursVisit`, `GuardOverview`. No se modifica ningún tipo existente ni `UserRole`.
- Por qué: cargar la guardia pasiva por técnico con fecha de inicio y fin, sacar el Excel de fin de mes y dar una vista de solo lectura a CTIC.
- Decisión: CTIC **no** es un valor nuevo de `UserRole` (eso exigiría tocar `app_users` y a Leo/Gino). Es una marca en la tabla propia `ops_ctic_users` sobre una cuenta de coordinación; el servidor le niega todas las rutas de operaciones salvo la lectura de `/api/operations/guard`.
- Impacto: tablas nuevas `ops_guard_weeks` (primera versión, solo lectura: sus filas se siguen mostrando como períodos lunes–domingo y pasan a `ops_guard_periods` al editarlas), `ops_guard_periods`, `ops_holidays`, `ops_visit_hours`, `ops_ctic_users`; sin cambios en `Api`, mocks ni Prisma.
