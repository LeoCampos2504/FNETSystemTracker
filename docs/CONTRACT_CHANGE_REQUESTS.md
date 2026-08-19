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

_(vacío)_
