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

_(vacío)_
