# Flujo de Git

## Ramas

Todas parten de `main` en el estado de este commit de fundación:

- `feature/euge-frontend-pwa`
- `feature/leo-backend-core`
- `feature/gino-data-kpis`

```bash
git checkout main
git pull
git checkout -b feature/euge-frontend-pwa   # (o la que corresponda)
```

## Reglas

- **No se trabaja directamente en `main`** después de la fundación. Todo
  cambio va por una de las tres ramas (o una rama derivada de ellas).
- Cada rama es dueña de sus carpetas según [WORK_SPLIT.md](WORK_SPLIT.md).
  Si tenés que tocar una carpeta de otra persona, coordinalo antes.
- `src/contracts/**` y la interfaz pública de `src/lib/api/` son
  compartidos/congelados — cualquier cambio pasa primero por
  [CONTRACT_CHANGE_REQUESTS.md](CONTRACT_CHANGE_REQUESTS.md).
- Antes de mergear a `main`: `npm run lint`, `npm test` y `npm run build`
  tienen que pasar.
- Commits chicos y descriptivos. No hace falta un formato estricto de
  conventional commits, pero el mensaje tiene que explicar el *por qué*, no
  solo el *qué*.

## Integración entre ramas

Como `src/lib/api/mock-api.ts` ya implementa el contrato completo, Euge no
necesita esperar merges de Leo/Gino para tener datos realistas. Cuando Leo
tenga endpoints reales:

1. Se prueban con `NEXT_PUBLIC_USE_MOCK_API=false` localmente.
2. Se mergea `feature/leo-backend-core` a `main`.
3. Euge (o quien corresponda) valida la UI contra la API real antes de
   cambiar el flag por defecto en el entorno que corresponda.

Gino sigue el mismo patrón: sus repositorios Prisma implementan los mismos
puertos (`src/server/ports/**`) que ya usan los repos en memoria, así que
reemplazar uno por otro no debería requerir tocar servicios ni rutas.
