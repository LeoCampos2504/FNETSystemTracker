# Matriz de regresión HTTP — backend de Leo

Inventario real de `src/app/api/**` (excepto `/api/kpis/**`, de Gino) y su
cobertura de tests, generado en la auditoría de `feature/leo-backend-core`
después del hardening (`9b0ee7a`). Objetivo: que antes de integrar Prisma y
frontend real se pueda afirmar con evidencia que cada endpoint funciona,
que auth/autorización están cubiertas sistemáticamente, y que los códigos de
error son consistentes.

**23 route.ts, 25 handlers HTTP, 23/23 con test de ruta (100%).** Además hay
tests de servicio/validación/auth más finos por debajo de cada ruta (ver
`src/server/services/*.test.ts`, `src/server/validation/*.test.ts`,
`src/server/http/*.test.ts`, `src/server/auth/*.test.ts`).

Leyenda de "Roles": T=TECHNICIAN, C=COORDINATOR, A=ADMIN. "Auth" = requiere
sesión válida (todas la requieren salvo donde se indica).

## Auth

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | No | — | 200 + cookie | 401 (pass incorrecta, email inexistente), 400 (body inválido, JSON malformado) | `auth/login/route.test.ts` |
| POST | `/api/auth/logout` | No | — | 200, limpia cookie | — (no falla) | `auth/logout/route.test.ts` |
| GET | `/api/auth/me` | Sí (soft) | cualquiera | 200 `User` | 200 `null` (sin sesión, JWT inválido, usuario borrado/inactivo) — nunca 401 | `auth/me/route.test.ts` |

## Tasks

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| GET | `/api/tasks/today` | Sí | T/C/A | 200 `Task[]` | 401, 403 (cross-zone C, cross-technician T), 400 (fecha inválida/calendario imposible) | `tasks/today/route.test.ts` |
| GET | `/api/tasks/pending` | Sí | T/C/A | 200 `Task[]` | 401, 403 (cross-zone), 400 (asOfDate inválida) | `tasks/pending/route.test.ts` |
| GET | `/api/tasks/[id]` | Sí | T/C/A | 200 `Task` | 401, 403 (T ajeno, C cross-zone), 200 `null` (inexistente, nunca 404) | `tasks/[id]/route.test.ts` |
| PUT | `/api/tasks/[id]/assignments` | Sí | C/A | 200 `Task` | 401, 403 (T, C cross-zone), 400 (2 PRIMARY, >2 técnicos, duplicado, técnico inexistente), 404 (tarea inexistente), 409 (tarea APPROVED) | `tasks/[id]/assignments/route.test.ts` |
| PUT | `/api/tasks/[id]/schedule` | Sí | C/A | 200 `Task` | 401, 403 (T, C cross-zone), 400 (fecha malformada/calendario imposible), 404, 409 (APPROVED) | `tasks/[id]/schedule/route.test.ts` |
| PUT | `/api/tasks/[id]/status` | Sí | C/A | 200 `Task` | 401, 403 (T, C cross-zone), 400 (status inválido), 404 | `tasks/[id]/status/route.test.ts` |

Side effects verificados a nivel HTTP: `AuditLog` antes/después coherente
(assignments/schedule/status), `Notification` `SCHEDULE_CHANGE` en
reprogramación real y ausencia de duplicado en reprogramación no-op.

## Guards

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| GET | `/api/guards` | Sí | T/C/A | 200 `Guard[]` | 401, 403 (C cross-zone) | `guards/route.test.ts` |
| POST | `/api/guards` | Sí | C/A | 201 `Guard` | 401, 403 (T, C zona ajena), 400 (start>=end, duplicado, técnico/zona inexistente) | `guards/route.test.ts` |
| GET | `/api/guards/[id]` | Sí | T/C/A | 200 `Guard` | 401, 403 (T ajeno, C cross-zone), 404 (adicional, no forma parte de `Api`) | `guards/[id]/route.test.ts` |
| PATCH | `/api/guards/[id]` | Sí | C/A | 200 `Guard` | 401, 403 (T, C cross-zone), 400 (body vacío, intervalo inválido con merge), 404 | `guards/[id]/route.test.ts` |
| GET | `/api/guards/[id]/performance` | Sí | T/C/A | 200 `GuardPerformance` | 401, 403 (C cross-zone), 200 `null` (guardia inexistente, nunca 404) | `guards/[id]/performance/route.test.ts` |
| PUT | `/api/guards/[id]/assignments` | Sí | C/A | 200 `Guard` | 401, 403 (T), 400 (duplicado, >2, técnico inexistente), 404 | `guards/[id]/assignments/route.test.ts` |

Side effects verificados: `AuditLog` antes/después coherente (create/update),
`Notification` `GUARD_CHANGE` solo a técnicos agregados, sin duplicado en
reasignación no-op.

## Technicians / Vehicles

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| GET | `/api/technicians/[id]` | Sí | T/C/A | 200 `Technician` | 401, 403 (T ajeno, C cross-zone), 200 `null` (inexistente) | `technicians/[id]/route.test.ts` |
| GET | `/api/technicians/[id]/vehicle` | Sí | T/C/A | 200 `Vehicle` | 401, 403 (T ajeno, C cross-zone), 200 `null` (sin vehículo, técnico inexistente) | `technicians/[id]/vehicle/route.test.ts` |
| GET | `/api/vehicles/[id]` | Sí | T/C/A | 200 `Vehicle` | 401, 403 (T no asignado, C cross-zone, vehículo sin técnico asignado), 200 `null` (inexistente) | `vehicles/[id]/route.test.ts` |

## Coordination

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| GET | `/api/coordinators/[id]/zones` | Sí | C/A | 200 `Zone[]` | 401, 403 (T, otro C), 200 `[]` (coordinador inexistente) | `coordinators/[id]/zones/route.test.ts` |
| GET | `/api/zones/[id]/technicians` | Sí | C/A | 200 `Technician[]` | 401, 403 (T, C cross-zone), 404 (zona inexistente) | `zones/[id]/technicians/route.test.ts` |
| GET | `/api/zones/[id]/sites` | Sí | C/A | 200 `Site[]` | 401, 403 (T, C cross-zone), 404 (zona inexistente) | `zones/[id]/sites/route.test.ts` |

## Quotes

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| GET | `/api/quotes` | Sí | C/A | 200 `Quote[]` | 401, 403 (T, C zona/coordinatorId ajenos, incl. regresión de bypass zoneId+coordinatorId), 400 (status inválido) | `quotes/route.test.ts` |
| GET | `/api/quotes/[id]` | Sí | C/A | 200 `Quote` | 401, 403 (T, C cross-zone), 404 (adicional, no forma parte de `Api`) | `quotes/[id]/route.test.ts` |

## Notifications

| Método | Ruta | Auth | Roles | Success | Fallas cubiertas | Test |
|---|---|---|---|---|---|---|
| GET | `/api/notifications` | Sí | T/C/A | 200 `Notification[]` | 401, 403 (otro usuario), 400 (sin `userId`) | `notifications/route.test.ts` |

Incluye test end-to-end: `PUT /api/tasks/[id]/assignments` → exactamente una
`NEW_TASK` visible vía `GET /api/notifications`, sin duplicados.

## Compartido

| Método | Ruta | Auth | Success | Test |
|---|---|---|---|---|
| GET | `/api/health` | No | 200 `{status,service}` | `health/route.test.ts` |

## Transversal (no por ruta específica)

| Área | Qué se verificó | Test |
|---|---|---|
| Forma de error | `{ error: { code, message, details? } }` consistente; un throw no-`ApiError` nunca filtra mensaje/stack interno (probado con un mensaje que contiene una connection string simulada) | `src/server/http/respond.test.ts` |
| Factories de error | status/code correctos para badRequest/notAuthenticated/forbidden/notFound/conflict | `src/server/http/errors.test.ts` |
| Content-Type | `application/json` en success y en error (401/400) | `src/server/testing/security-regression.test.ts` |
| Cookie manipulada | JWT con bytes alterados, cookie vacía → 401, igual que sin cookie | `security-regression.test.ts` |
| IDs arbitrarios/maliciosos | path traversal, SQL-like, `<script>`, `%00`, espacio → siempre `200 null`, nunca 500 | `security-regression.test.ts` |
| Query params inválidos | fecha con SQL-like payload, `zoneId=""` → 400, nunca 500 | `security-regression.test.ts` |
| Campos extra en body | un campo desconocido en el body de una mutación no rompe la request (tolerancia hacia adelante para datos futuros de Sytex) | `security-regression.test.ts` |
| JWT expirado | rechazado (`null`) | `src/server/auth/jwt.test.ts` |
| `AUTH_SECRET` en producción | ausente → throw; presente → ok | `src/server/auth/env.test.ts` |
| Sesión revalidada por request | usuario borrado/inactivo con JWT válido → 401 | `src/server/http/auth-guards.test.ts` |

## Métodos HTTP no soportados

Next.js App Router solo registra los verbos exportados por cada
`route.ts` (`GET`, `POST`, etc.); una request con un método no exportado la
maneja el propio framework devolviendo `405 Method Not Allowed` antes de que
el código de la ruta se ejecute. No se implementó ningún handler 405 manual
— no hace falta, y hacerlo sería sobrearquitecturar. Esto se verificó
manualmente contra el servidor real (ver smoke test) en vez de con un test
unitario, porque llamar al handler exportado directamente (que es como están
escritos el resto de los tests de ruta) no puede ejercitar "el método no
tiene handler" — eso solo existe a nivel del router real de Next.

## Rutas adicionales (no forman parte de `Api`)

Documentadas también en `docs/CONTRACT_CHANGE_REQUESTS.md`. No son huérfanas:
tienen test propio y una razón de ser (endpoints de escritura/lectura puntual
que el contrato compartido no necesitó tipar todavía):

- `POST /api/auth/logout`
- `GET /api/guards/[id]`, `POST /api/guards`, `PATCH /api/guards/[id]`
- `GET /api/quotes/[id]`

No se encontraron rutas huérfanas (código muerto), métodos de `http-api.ts`
sin ruta correspondiente, ni paths casi-duplicados que sugieran un error —
ver la matriz de compatibilidad en `docs/CONTRACT_CHANGE_REQUESTS.md`.
