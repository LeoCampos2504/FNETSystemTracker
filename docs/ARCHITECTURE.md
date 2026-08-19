# Arquitectura

## Sistemas externos → n8n → base propia → aplicación

```
  Sytex ──────┐
  BizFlow ────┼──▶  n8n  ──▶  PostgreSQL (base propia, vía Prisma)  ──▶  FNET System Tracker
  MaxTracker ─┘
```

- **Sytex** es la fuente oficial de tareas y cotizaciones.
- **BizFlow** aporta coordinadores, zonas, técnicos y asignaciones organizativas.
- **MaxTracker** aporta vehículos y, a futuro, su ubicación en tiempo real.
- **n8n** hará la sincronización hacia nuestra base propia (PostgreSQL + Prisma).
- La aplicación **nunca** llama a Sytex/BizFlow/MaxTracker directamente; solo lee
  de la base propia. Por eso las entidades relevantes llevan `externalId` /
  `externalSource` / `sourceUpdatedAt`: permiten reconciliar registros
  sincronizados sin cambiar los contratos.

Nada de esto está implementado en el prototipo. Se documenta acá para que el
modelo de datos y los contratos no necesiten un rediseño cuando se conecte.

## Arquitectura interna

```
┌─────────────────────────────┐
│  UI (Euge)                  │  src/components/**, src/app/** (paginas visuales)
│  usa exclusivamente `api`   │
└──────────────┬───────────────┘
               │  import { api } from "@/lib/api"
               ▼
┌─────────────────────────────┐
│  src/lib/api/                │  selector via NEXT_PUBLIC_USE_MOCK_API
│   ├─ mock-api.ts (default)   │  lee src/mocks/**, sin red, sin backend
│   └─ http-api.ts             │  fetch a src/app/api/**
└──────────────┬───────────────┘
               │ (solo cuando NEXT_PUBLIC_USE_MOCK_API=false)
               ▼
┌─────────────────────────────┐
│  src/app/api/** (Leo)        │  Route Handlers, valida con zod, aplica
│  src/server/services/** (Leo)│  reglas de negocio (guardias, prioridad
│                               │  correctivo/preventivo, etc.)
└──────────────┬───────────────┘
               │  usa src/server/ports/* (interfaces)
               ▼
┌─────────────────────────────┐
│  src/server/repositories/    │  memory/  → en memoria sobre src/mocks (ya
│                               │             disponible, para no bloquear a Leo)
│                               │  prisma/  → implementacion real (Gino, a crear)
└──────────────┬───────────────┘
               │ (solo prisma/)
               ▼
      PostgreSQL vía prisma/schema.prisma (Gino)
```

### Por qué una capa de puertos (`src/server/ports/`)

Los servicios de Leo dependen de **interfaces** de repositorio
(`UserRepository`, `TaskRepository`, etc.), no de Prisma. Así:

- Leo puede implementar endpoints y reglas de negocio usando
  `src/server/repositories/memory/**` sin esperar el schema de Gino.
- Gino puede implementar `src/server/repositories/prisma/**` (mismo contrato
  de puerto) en paralelo, sin tocar servicios ni rutas.
- El día que el schema esté listo, se cambia la implementación inyectada —
  no la lógica de negocio.

### Por qué el frontend no depende de un backend

`mock-api.ts` implementa la interfaz `Api` completa usando únicamente
`src/mocks/**`. Euge puede construir toda la UI, incluyendo flujos de
asignación/cambio de estado, contra datos realistas y consistentes sin que
exista un solo endpoint HTTP funcionando.

## PWA (a futuro, dueño: Euge)

La aplicación será instalable como PWA. Para la fundación **no se implementa**
manifest ni service worker — queda documentado como requisito para que Euge lo
resuelva en su rama sin necesitar coordinación previa.
