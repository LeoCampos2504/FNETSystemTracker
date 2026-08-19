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

### [Pendiente] Agregar `logout()` a la interfaz `Api`
- Quién lo pide: Leo
- Contrato afectado: `src/contracts/api.ts` (interfaz `Api`)
- Por qué: implementé `POST /api/auth/logout` (limpia la cookie de sesión)
  porque el prototipo de auth lo necesita, pero `Api` no tiene un método
  `logout()`, así que `http-api.ts` no puede exponerlo todavía sin romper el
  tipo `Api`. El endpoint ya funciona (ver `docs/API_CONTRACTS.md`); solo
  falta el método tipado para que el frontend lo consuma vía `api.logout()`
  en lugar de un `fetch` suelto.
- Impacto: agregar `logout(): Promise<void>` a `Api`, implementarlo en
  `mock-api.ts` (solo limpia `currentUserId` en memoria) y en `http-api.ts`
  (ya tiene la ruta lista).

### [Pendiente] `from`/`to` en los endpoints de KPI de técnicos
- Quién lo pide: Gino
- Contrato afectado: `docs/API_CONTRACTS.md` (`GET /api/kpis/technicians/:id`, `GET /api/kpis/ranking`) y, si se quiere exponer en `Api`, `src/contracts/api.ts` (`getTechnicianKpis`, `getTechnicianRanking`)
- Por qué: el prototipo pide soportar filtro por día/mes/rango personalizado
  para los KPIs. Implementé `from`/`to` como query params **opcionales** en
  ambas rutas (`src/app/api/kpis/technicians/[id]/route.ts` y
  `src/app/api/kpis/ranking/route.ts`) sin tocar `src/contracts/**`: si se
  omiten, el período default es el mes calendario actual. Esto no rompe nada
  porque `Api.getTechnicianKpis`/`getTechnicianRanking` hoy no envían esos
  parámetros — es un agregado aditivo a nivel HTTP, no un cambio de contrato.
- Impacto (qué otros archivos hay que tocar si se formaliza): agregar
  `from?`/`to?` a `docs/API_CONTRACTS.md`; si además se quiere que el
  frontend pueda pedir un rango, agregar los parámetros a
  `Api.getTechnicianKpis`/`getTechnicianRanking` en `src/contracts/api.ts`,
  y actualizar `mock-api.ts` + `http-api.ts` en el mismo cambio.

### [Pendiente] Ruta de ranking: `/api/kpis/ranking` vs `/api/kpis/technicians/ranking`
- Quién lo pide: Gino
- Contrato afectado: ninguno — nota informativa, no bloquea nada
- Por qué: mi instrucción de tarea sugería implementar el ranking en
  `/api/kpis/technicians/ranking`. `docs/API_CONTRACTS.md` (congelado) ya
  documenta `GET /api/kpis/ranking?zoneId?`, y no hay conflicto de ruteo en
  Next.js App Router entre un segmento estático (`ranking`) y uno dinámico
  (`[id]`) al mismo nivel — Next resuelve el estático primero. Implementé en
  `/api/kpis/ranking` (el path del contrato ya documentado) y no en
  `/api/kpis/technicians/ranking`, para no crear un endpoint no documentado.
- Impacto: ninguno, es solo para dejar constancia de la decisión.

## Resueltos

### [Resuelto] Endpoints y decisiones agregadas durante la implementación del backend (Leo)
- Quién lo pidió: Leo (self-service, documentando antes de mergear)
- Contrato afectado: `docs/API_CONTRACTS.md` (documentación, no `src/contracts/**`)
- Por qué: al implementar `src/app/api/**` aparecieron necesidades que el
  documento original no cubría. Ninguno de estos cambios toca
  `src/contracts/api.ts` ni el tipo `Api` — son endpoints adicionales o
  parámetros de query adicionales, siempre compatibles con lo que
  `http-api.ts` ya envía.
- Decisiones:
  1. **`POST /api/auth/logout`** — nuevo, no estaba documentado ni forma
     parte de `Api` (ver pendiente arriba). Limpia la cookie de sesión.
  2. **Reprogramación = reusar `PUT /api/tasks/:id/schedule`** — el pedido
     original mencionaba un endpoint separado `POST /api/tasks/:id/reschedule`.
     No lo agregué: `Api.scheduleTask` ya es la única operación de "fijar
     scheduledDate" en el contrato congelado, y programar de nuevo una tarea
     ya programada *es* reprogramar. Crear una ruta paralela hubiera sido
     "inventar un segundo modelo" para la misma operación. El audit log de
     este endpoint registra `scheduledDate` anterior y nuevo, así que la
     reprogramación queda igual de trazable.
  3. **`GET /api/tasks/today` en vez de `/api/tasks/day`, `PUT` en vez de
     `PATCH` en `/assignments`, `/schedule` y `/status`** — así es como ya
     estaba implementado `http-api.ts` desde la fundación (`docs/API_CONTRACTS.md`
     original). Usé esas rutas/verbos tal cual para no tener que tocar
     código de frontend compartido sin necesidad.
  4. **`POST /api/guards` y `PATCH /api/guards/:id`** — nuevos, no estaban
     documentados. `Api.assignGuard` (`PUT /api/guards/:id/assignments`) solo
     cubre reemplazar la cuadrilla; estos dos endpoints adicionales permiten
     crear una guardia y editar zona/horario/cuadrilla en conjunto. No tocan
     `Api`: el frontend no los consume todavía a través de `api.*`.
  5. **`GET /api/quotes/:id`** — nuevo, no estaba documentado. Lectura
     puntual de una cotización, análogo a `GET /api/tasks/:id`.
  6. **Filtros extra en `GET /api/quotes`**: `projectId`, `from`, `to` —
     pedidos explícitamente para P1. Son query params adicionales a los que
     ya definía `GetQuotesParams` (`zoneId`, `coordinatorId`, `status`); como
     son opcionales y `http-api.ts` nunca los envía, no rompen el contrato.
- Impacto: `docs/API_CONTRACTS.md` actualizado con estos endpoints/params.
  `src/contracts/api.ts` no se tocó.

### [Resuelto] Auditoría técnica: 3 endpoints no cumplían el `X | null` de `Api` (Leo)
- Quién lo pidió: Leo (auditoría de compatibilidad `http-api.ts` vs backend)
- Contrato afectado: ninguno en `src/contracts/**` — bug de implementación en
  mi propio backend, corregido sin tocar el contrato.
- Por qué: `Api.getTask`, `Api.getGuardPerformance` y `Api.getTechnician`
  tipan `... | null` para "no existe". Las tres rutas (`GET /api/tasks/:id`,
  `GET /api/guards/:id/performance`, `GET /api/technicians/:id`) en cambio
  devolvían 404 cuando el recurso no existía. Como `http-api.ts` usa un
  `request()` genérico que lanza excepción ante cualquier respuesta no-2xx,
  `httpApi.getTask()` (etc.) iba a **rechazar la promesa** en vez de resolver
  `null` como promete el tipo — cualquier código de Euge que hiciera
  `const task = await api.getTask(id); if (!task) {...}` se hubiera roto con
  una excepción no capturada en vez de entrar al branch de "no existe".
- Corrección: las 3 rutas ahora verifican existencia primero (devolviendo
  `null` con 200 si no existe) y recién después aplican autorización. Se
  agregaron tests de regresión a nivel ruta y servicio
  (`findTaskById`/`findGuardById`/`findTechnicianById`, más
  `src/app/api/tasks/[id]/route.test.ts` y el nuevo
  `src/app/api/technicians/[id]/route.test.ts`).
- Impacto: solo `src/app/api/**` y `src/server/services/**` (mi ownership).
  `src/contracts/api.ts` y `src/lib/api/http-api.ts` no se tocaron.

### [Resuelto] Matriz de compatibilidad `http-api.ts` ↔ backend: PASS (Leo)
- Quién lo pidió: Leo (construcción de la matriz de regresión HTTP,
  `docs/API_TEST_MATRIX.md`)
- Contrato afectado: ninguno — verificación, no cambio.
- Por qué: antes de que Gino conecte Prisma y Euge consuma el backend real
  (`NEXT_PUBLIC_USE_MOCK_API=false`), había que confirmar con evidencia (no
  solo lectura de código) que cada método no-KPI de `Api` tiene una ruta real
  que coincide en método HTTP, path, query, body y forma de respuesta.
- Verificación: los 19 métodos no-KPI de `Api` (`login`, `getCurrentUser`,
  `getTodayTasks`, `getPendingTasks`, `getTask`, `assignTechniciansToTask`,
  `scheduleTask`, `updateTaskStatus`, `getGuards`, `getGuardPerformance`,
  `assignGuard`, `getTechnician`, `getCoordinatorZones`,
  `getZoneTechnicians`, `getZoneSites`, `getVehicle`,
  `getTechnicianVehicle`, `getQuotes`, `getNotifications`) tienen ruta
  implementada y test de ruta pasando. **PASS**, sin mismatches nuevos más
  allá del ya resuelto arriba. Las 5 rutas adicionales que no forman parte de
  `Api` (`POST /api/auth/logout`, `GET /api/guards/:id`, `POST /api/guards`,
  `PATCH /api/guards/:id`, `GET /api/quotes/:id`) también tienen test propio
  y no son código huérfano.
- Impacto: ninguno en código — `docs/API_TEST_MATRIX.md` documenta la matriz
  completa endpoint por endpoint.
