# CLAUDE.md

## Proyecto

FNET System Tracker: app web/PWA interna para coordinar técnicos de campo (tareas, preventivos, correctivos, guardias, vehículos, KPIs). Tres roles: TECHNICIAN (solo lectura de sus propios datos), COORDINATOR (sus zonas/técnicos, asignación/programación), ADMIN (lectura global). Contexto funcional completo: [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

Fuentes externas futuras: Sytex (tareas, cotizaciones), BizFlow (coordinadores/zonas/técnicos), MaxTracker (vehículos), todas llegando vía n8n a una base propia. **El prototipo no depende de ninguna de estas** — todo corre sobre mocks detrás de un contrato de API estable. Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

Next.js (App Router, `src/`) + React + TypeScript (strict) + Tailwind CSS + ESLint, npm. Prisma (client instalado, sin schema de negocio todavía), Vitest, zod, date-fns, jose, bcryptjs, recharts, lucide-react.

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run lint    # eslint
npm run build   # build de produccion (corre el compilador de TS)
npm test        # vitest run
```

## Arquitectura

El frontend nunca importa Prisma ni código de servidor, y nunca asume que hay un backend corriendo. Siempre llama a una única interfaz:

```
src/lib/api/index.ts  -> exporta `api: Api`
  ├─ mock-api.ts   (siempre funciona, usa src/mocks, es el default)
  └─ http-api.ts   (llama a src/app/api/**, backend real)
```

Se elige con `NEXT_PUBLIC_USE_MOCK_API` (ver `.env.example`; default mock — poner `"false"` para usar http-api).

```
src/contracts/    tipos compartidos + interfaz Api (fuente de verdad, ver abajo)
src/mocks/        datos de demo realistas, deben respetar los contratos exactamente
src/lib/api/      la capa descripta arriba
src/server/ports/                interfaces de repositorios (sin Prisma)
src/server/repositories/memory/  repos en memoria sobre src/mocks, para poder
                                  correr endpoints antes de que exista Prisma
prisma/schema.prisma              solo datasource/generator, sin modelos todavia
```

## Ownership

| Área | Dueño | Notas |
|---|---|---|
| `src/components/**`, páginas visuales de `src/app/**`, PWA, estilos | Euge | frontend/UX, solo consume `api` |
| `src/app/api/**` (excepto `/kpis`), `src/server/services/**`, auth, reglas de negocio | Leo | sin imports de Prisma |
| `prisma/**`, `src/server/repositories/prisma/**`, `src/server/kpis/**`, `src/app/api/kpis/**`, seeds | Gino | modelo de datos + cálculo de KPIs |
| `src/contracts/**`, interfaz pública de `src/lib/api/`, este archivo, docs de contratos | **Compartido/congelado** | ver abajo |

Detalle completo: [docs/WORK_SPLIT.md](docs/WORK_SPLIT.md).

## Reglas de Git

- Ramas: `feature/euge-frontend-pwa`, `feature/leo-backend-core`, `feature/gino-data-kpis`, todas parten de `main`.
- No commitear directamente a `main` después de este commit de fundación.
- Flujo completo: [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md).

## No cambiar contratos compartidos unilateralmente

`src/contracts/**` y la interfaz `Api` están congelados. Si necesitás un cambio, **no lo edites y mergees en silencio** — primero agregá una entrada en [docs/CONTRACT_CHANGE_REQUESTS.md](docs/CONTRACT_CHANGE_REQUESTS.md), acordalo, y recién ahí actualizá mocks y ambas implementaciones de la api en el mismo cambio.

## Prioridades

- **P0**: cronograma diario, correctivos vs preventivos, cuadrillas, correctivos urgentes destacados, KPIs de técnicos, guardias, perfil de técnico.
- **P1**: vehículos, zonas/coordinadores, notificaciones internas, reprogramación visual, cotizaciones básicas, enlaces a Google Maps.
- **P2** (después del prototipo): integraciones reales Sytex/BizFlow/MaxTracker, sincronización n8n, optimización de rutas, GPS en tiempo real, push real, analytics de cotizaciones.
