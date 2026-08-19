# KPIs de técnicos

Dueño: Gino. Implementación pura en [`src/server/kpis/`](../src/server/kpis)
(sin I/O, testeada en `*.test.ts`); la carga de datos desde Prisma vive en
[`src/server/kpis/fetch.ts`](../src/server/kpis/fetch.ts) y llama a esas
funciones puras. Fórmulas base tomadas de
[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#kpis-de-técnicos); este documento las
detalla con los casos borde que importan para el prototipo.

## Filtros (día / mes / rango)

Un solo mecanismo para los tres: `from`/`to` (ambos `YYYY-MM-DD`).

- **Día**: `from === to`.
- **Mes**: `from`/`to` cubriendo el mes calendario.
- **Rango personalizado**: cualquier `from`/`to`.
- **Sin parámetros**: default al mes calendario actual
  (`src/server/kpis/period.ts#resolveDefaultPeriod`).

## KPI 1 — Completadas (`completedTasks`)

Tareas con `status` en `{APPROVED, APPROVED_WITH_PENDING}` y
`scheduledDate` dentro del período, donde el técnico aparece en
`assignments`. Una tarea con Juan + Pedro suma +1 a cada uno — se cuenta por
técnico, no por tarea.

## KPI 2 — Preventivo / correctivo (`completedPreventive`, `completedCorrective`)

Mismo conjunto que KPI 1, separado por `type`.

## KPI 3 — Duración (`averageTaskDurationMinutes`, también expuesto como `averageTimeInTaskMinutes`)

`duration = departureAt - arrivalAt` en minutos, por tarea. Reglas:

- Si falta `arrivalAt` o `departureAt`, la tarea se **ignora** (no cuenta ni
  sume ni reste al promedio).
- Si el resultado es negativo (dato inconsistente en el origen), también se
  **excluye** — nunca se genera ni se muestra una duración negativa, y no se
  "arregla" con `Math.max(0, ...)` porque eso escondería un dato mal cargado.
- El promedio es sobre las tareas que sí tienen ambos timestamps y duración
  válida (KPI 9 usa la misma lógica).

## KPI 4 — Rechazos (`rejections`)

Cuenta **eventos** de `TaskRejection`, no formularios únicos: una tarea
rechazada dos veces (`rechazado → corregido → rechazado → aprobado`) suma 2,
no 1.

## KPI 5 — Cumplimiento (`complianceRate`)

```
completedTasks / scheduledTasksInPeriod * 100
```

`scheduledTasksInPeriod` = tareas del técnico con `scheduledDate` en
`[periodStart, periodEnd]` (completadas o no). Si no hay tareas programadas
en el período, `complianceRate = 0` (nunca se divide por cero).

## KPI 6 — Cumplimiento preventivo (`preventiveComplianceRate`)

Igual que KPI 5, restringido a `type === PREVENTIVE`. También 0 si no hay
preventivos programados en el período.

## KPI 7 — Pendientes (`pendingTasks`)

```
scheduledDate <= asOfDate AND status NOT IN (APPROVED, APPROVED_WITH_PENDING)
```

`asOfDate` default es `periodEnd` (se puede pasar explícito). A diferencia
del resto de los KPIs, esto mira **todas** las tareas del técnico, no solo
las del período pedido: una tarea de hace dos semanas que sigue sin
completarse sigue estando pendiente hoy aunque el período consultado sea
"este mes".

## KPI 8 — Productividad (`dailyProductivity`)

```
completedTasks / activeWorkDays
```

`activeWorkDays` (MVP, documentado explícitamente porque no hay datos de
asistencia real): cantidad de valores **distintos** de `scheduledDate` entre
las tareas del técnico en el período (mínimo 1, para no dividir por cero).
Es una aproximación a "días con trabajo programado", no un cálculo de
asistencia/horas trabajadas. No se implementó ningún scoring laboral más
complejo — no estaba pedido.

## KPI 9 — Duración promedio de tarea

Ver KPI 3 — es el mismo cálculo.

## KPI 10 — Guardias

Por técnico: `guardCorrectivesCompleted` y `guardUrgentCount` en el contrato
`TechnicianKpis` (suma de `GuardPerformance.correctivesCompleted` /
`urgentCorrectivesCompleted` de cada guardia en la que el técnico participó,
solapada con el período consultado).

`GuardPerformance` (por guardia, no persistida — ver
[DATABASE.md](DATABASE.md)) se calcula en
`src/server/kpis/guard-performance.ts#computeGuardPerformance`:

- Se toman las tareas `CORRECTIVE` completadas (`APPROVED`/
  `APPROVED_WITH_PENDING`) de la zona de la guardia.
- Una tarea "pertenece" a la guardia si su `arrivalAt` cae dentro de
  `[Guard.startAt, Guard.endAt]` **y** al menos uno de sus técnicos
  asignados está en `Guard.technicianIds`. Nunca se usa una regla fija tipo
  "después de las 18:00" — el intervalo real de la guardia es la única
  fuente de verdad (ver [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#guardias)).
- `averageDurationMinutes` usa la misma regla de duración válida que KPI 3.
- "Rechazos asociados a la guardia": no se agregó un campo separado al
  contrato (`TechnicianKpis` está congelado y no lo pide) — se puede derivar
  cruzando `TaskRejection` de las tareas de guardia si hace falta más
  adelante.

## KPI 11 — Ranking (`ranking` en `TechnicianKpis`, y `GET /api/kpis/ranking`)

Sin fórmula secreta: orden por `completedTasks` descendente, empate resuelto
por `technicianId` (orden estable). El endpoint de ranking devuelve además
`complianceRate` para que el frontend pueda comparar por otras métricas sin
otro round-trip.

`?zoneId` filtra la lista de salida por `Technician.primaryZoneId`, **sin
recalcular el ranking** — el número de posición sigue siendo el global (así
se comporta hoy `mock-api.ts`, y así se mantuvo la paridad).

## Endpoints

| Método | Ruta | Query | Nota |
|---|---|---|---|
| GET | `/api/kpis/technicians/:id` | `from?`, `to?` | Path y respuesta según `docs/API_CONTRACTS.md`; `from`/`to` es una extensión aditiva — ver `docs/CONTRACT_CHANGE_REQUESTS.md`. |
| GET | `/api/kpis/ranking` | `zoneId?`, `from?`, `to?` | Path según `docs/API_CONTRACTS.md` (no `/api/kpis/technicians/ranking` — no hacía falta por conflicto de ruteo, ver CONTRACT_CHANGE_REQUESTS.md). |

Ambos devuelven `200` con el body tipado por el contrato (`TechnicianKpis |
null`, `TechnicianRankingEntry[]`), nunca `404` — igual que el resto de los
endpoints `X | null` del contrato. Un error inesperado de la capa de datos
(DB caída, timeout, etc.) devuelve `500` con `{ error: "Internal server
error" }` — nunca el mensaje/stack real, que solo se loguea server-side
(`console.error`). Ver `prisma/tests/api/kpis-error-handling.test.ts`.
