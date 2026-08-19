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
