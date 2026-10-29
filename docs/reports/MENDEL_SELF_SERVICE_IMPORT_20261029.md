# MENDEL — Importación autoservicio del CSV

Fecha: 29/10/2026. Estado: IMPLEMENTED_LOCALLY; publicación y certificación con CSV actual de la usuaria pendientes. Rama: feature/mendel-self-service-import, base main 10bc52c.

## Causa confirmada en código

Cargar CSV solo preparaba una vista local. Actualizar existentes no insertaba IDs nuevos y llamaba loadRegistry(true), descartando la vista del CSV. Por eso los nuevos desaparecían antes de compartirlos. La publicación de nuevos también dependía de filtros, firmas y zonas; no era una importación completa del archivo. Esto no demuestra por sí solo qué filas contenía el archivo particular del 29 que cargó la usuaria.

## Corrección

Un botón Guardar CSV en FNET reemplaza las dos acciones en vista CSV. Consulta versiones actuales, refresca evidencia de existentes y agrega todos los nuevos con zona sin depender de filtros, firma o paginación. Los conflictos de existentes no bloquean nuevos independientes. Se verifica por una nueva lectura que los IDs nuevos estén persistidos.

Sin zona no se inventa una: la usuaria carga su XLSX o usa Resolver zonas faltantes. Si quedan pendientes/conflictos se conserva el CSV y las asignaciones manuales para corregir y reintentar. La pantalla distingue último día del CSV de último día del control guardado. Si termina sin pendientes vuelve al control con filtros limpios y firmados visibles.

La inserción del importador usa publish con newOnly=true. El servidor exige Admin y hace ON CONFLICT DO NOTHING, contando solo filas insertadas; una carga concurrente o reintento no sobrescribe un gasto existente, su zona, su revisión ni las respuestas de coordinación. El modo de publicación anterior se conserva para compatibilidad. El refresco sigue bloqueando diferencias de datos financieros y versiones; no modifica autorizaciones ni historia.

Las operaciones se confirman por lotes, no son una transacción global para todo el CSV. Si falla la red puede haber lotes ya guardados; el mensaje lo advierte y conserva el archivo para reintento idempotente. No se informa éxito total si falla la lectura final. No hay sincronización automática con Mendel.

## Validación

- npm test: 519/519, 72 archivos, fuera del aislamiento que impedía renombrar archivos temporales. Los siete casos nuevos cubren planificación completa incluyendo firmados del 29, zonas faltantes, refresco e inserción, conflictos independientes, errores de consulta, verificación posterior, reintentos y protección SQL de registros ya autorizados con datos sintéticos en PGlite.
- npm run lint: PASS, cero errores y cuatro advertencias preexistentes fuera de este cambio.
- npm run build: FAIL local por fallo del proceso CSS de Turbopack, también fuera del aislamiento. No se alteró configuración para esconderlo.
- npm run build -- --webpack: PASS (compilación, TypeScript, generación y rutas completas). No sustituye la exigencia del build habitual exitoso en CI antes de fusionar.
- npx tsc --noEmit: PASS.
- No se ejecutaron escrituras de prueba contra la base real. No se importó un CSV nuevo real ni se afirmó que el archivo del 29 haya sido verificado.

Sin cambios de schema, migraciones, permisos, secretos, n8n o integraciones live. Analista permanece fuera de alcance. No hay commit, push, merge ni despliegue de esta corrección.

## Operación tras publicación

1. Cargar CSV actualizado.
2. Cargar la planilla o resolver zonas si hay nuevos sin zona.
3. Guardar CSV en FNET y revisar el resumen nuevos/actualizados/sin cambios/sin zona/conflictos.
4. Consultar el control compartido desde otra PC o después de recargar para certificar persistencia.

## Autorización de publicación

El 29/10/2026 Eugenia autorizó commit, push, PR y despliegue si pasa la validación automática: «si y no lo pruebes yo lo hare». Se conserva CI como condición de fusión; la comprobación manual de la interfaz y la carga real del CSV quedan a cargo de la usuaria. No se harán cargas ni aprobaciones reales como prueba. El resultado final de CI y despliegue se registrará en el PR, sin afirmar certificación manual.
