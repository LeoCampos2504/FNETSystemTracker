# División de trabajo

Objetivo: que Euge, Leo y Gino puedan trabajar en paralelo sin bloquearse.
Cada uno consume la capa compartida (contratos + `api`), nunca la
implementación interna de otro.

## Euge — frontend + UX + PWA

**Dueño de:**
- `src/components/**`
- páginas visuales de `src/app/**` (todo excepto `src/app/api/**`)
- PWA (manifest, service worker — a implementar)
- estilos, UX

**Reglas:**
- Solo importa `api` desde `src/lib/api` (nunca `mock-api.ts` / `http-api.ts`
  directamente, nunca Prisma, nunca `src/server/**`).
- Puede construir y probar toda la UI con `NEXT_PUBLIC_USE_MOCK_API=true` sin
  esperar a Leo ni a Gino.
- Si un dato que necesita no está en un contrato o en los mocks, lo pide como
  cambio de contrato (ver [CONTRACT_CHANGE_REQUESTS.md](CONTRACT_CHANGE_REQUESTS.md)) en vez de inventarlo localmente.

## Leo — backend, reglas de negocio, auth, APIs

**Dueño de:**
- `src/app/api/**` (excepto `/api/kpis/**`, de Gino)
- `src/server/services/**`
- auth (sesión, login)
- reglas de negocio: guardias, prioridad correctivo/preventivo, notificaciones, auditoría

**Reglas:**
- No importa Prisma directamente. Depende de `src/server/ports/**`
  (interfaces) para acceder a datos.
- Mientras Gino no tenga `src/server/repositories/prisma/**`, usa
  `src/server/repositories/memory/**` (ya creado, mismo contrato de puerto)
  para poder correr y probar sus endpoints de punta a punta.
- Implementa `http-api.ts` respetando exactamente `src/contracts/api.ts` — no
  cambia el shape de las respuestas sin pasar por un contract change request.

## Gino — base de datos, Prisma, seeds, KPIs

**Dueño de:**
- `prisma/**` (incluido `prisma/schema.prisma`, ahora mismo solo
  datasource/generator, sin modelos)
- `src/server/repositories/prisma/**` (implementa los mismos puertos que
  `memory/**`)
- `src/server/kpis/**` (cálculo real de KPIs)
- `src/app/api/kpis/**`
- seeds, modelo de datos

**Reglas:**
- El modelo Prisma debe poder representar todo lo que ya existe en
  `src/contracts/**` (incluidos los campos `externalId`/`externalSource`/
  `sourceUpdatedAt` para sincronización futura).
- La fórmulas de KPI documentadas en
  [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md#kpis-de-técnicos) son el punto de
  partida — `src/mocks/kpis.ts` ya las implementa sobre datos mock como
  referencia de comportamiento esperado.
- No depende de que Leo o Euge terminen nada: puede modelar, migrar y
  sembrar datos de forma independiente.

## Compartido / congelado

- `src/contracts/**`
- interfaz pública de `src/lib/api/` (el tipo `Api`, no las implementaciones internas)
- `CLAUDE.md`
- `docs/API_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_CONTEXT.md`

Nadie cambia estos archivos unilateralmente. Si hace falta un cambio: agregar
la propuesta en [CONTRACT_CHANGE_REQUESTS.md](CONTRACT_CHANGE_REQUESTS.md),
acordarlo entre quienes lo usan, y recién ahí aplicarlo (actualizando mocks y
ambas implementaciones de `api` en el mismo cambio).
