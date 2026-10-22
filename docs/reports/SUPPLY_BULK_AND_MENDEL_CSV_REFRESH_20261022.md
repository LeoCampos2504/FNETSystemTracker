# Control rápido de insumos y actualización de evidencia Mendel

Fecha: 2026-10-22. Estado inicial: `IMPLEMENTED_LOCALLY`, publicación bloqueada por validación de build pendiente. Rama `fix/mendel-csv-evidence-refresh`, base `e36504b2716af47ef2dfb5cdb5fd113fb2bb6eec`. El registro inicial sin commit, push ni deploy se conserva debajo; el avance autorizado se documenta en el cierre posterior.

## Alcance y separación

Se retomaron los cambios locales incompletos de actualización CSV de Mendel y se agregó el control rápido/múltiple solicitado por Eugenia. No se tocaron los cambios de Guardias del otro checkout. No se modificó ninguna credencial, configuración Railway, flujo n8n ni integración live. La respuesta anterior de seguridad no equivale a credenciales rotadas: ese pendiente sigue abierto y debe revisarse antes de publicar.

## Insumos

- Detalle individual: botones Incluido / No incluido / Sin definir, y Sí, descargado / No, pendiente en lugar de dos selectores. Factura siempre visible, incluso antes de clasificar. La cantidad desconocida no se inventa como cero.
- Casillas por insumo y selección de la página actual (hasta 50). El lote se arma solamente con seleccionados visibles según los filtros al abrir el formulario, y conserva una instantánea mientras se revisa. Los insumos sin proyecto unívoco se resuelven individualmente.
- Número de factura común, estado común y resumen de materiales/cantidades/facturas anteriores. Revisión y confirmación dentro del mismo diálogo, accesible por teclado, sin alerta nativa adicional.
- Una solicitud `reviewBatch` a `/api/operations`, estricta, limitada a 50 filas y 64 KiB. No se fragmenta automáticamente en lotes parcialmente confirmados. Sesión real, guardia de rol/CTIC, origen permitido y permisos de proyecto existentes conservados.
- `saveReviews` valida todos los registros con las mismas reglas de `saveReview`, y ejecuta todas las escrituras y sus eventos de auditoría en **una transacción Prisma**, en orden estable de clave. Versiones obsoletas revierten el lote completo. Cada insumo conserva su cantidad, notas y archivos; los cambios de factura/estado son explícitos y auditados con actor y fecha.
- No modifica stock oficial de Intra ni implementa aprobación de gastos Mendel. No agrega tablas, migraciones, dependencias ni cambios de contratos congelados.

Límite explícito: se comparte el **número de factura**, no se duplica un PDF entre varios insumos. Los adjuntos se mantienen y pueden cargarse desde el detalle individual. No se amplían los permisos heredados de coordinación global ni se corrigen otros hallazgos históricos de scope.

## Mendel CSV

Se conservan `Nombre PDF` y `Estado comprobacion`, además de `Hay ticket`. Si el CSV dice NO pero informa un PDF, se muestra **PDF informado · revisar**, no se afirma que falte un comprobante ni que el documento fue descargado/validado. Tabla, detalle, tarjetas, mensaje y print usan la misma interpretación.

Admin puede actualizar únicamente notas/evidencia de gastos ya compartidos mediante `refresh`; incluye filas ocultas por firma o filtros. Los nuevos gastos se comparten por separado y solo si están visibles. Se preservan zona, identidad, importes, revisión de aprobación y decisiones/historial. Se exigen ID exacto, coincidencia de datos financieros/persona y huella de origen. No se infiere aprobación de firmas o notas. Las columnas ausentes no vacían datos anteriores. Un conflicto se informa y no reemplaza esa fila; los demás resultados del lote se contabilizan explícitamente. Reintentos idénticos son idempotentes.

No existe una conexión automática a Mendel ni prueba de antigüedad del CSV: Admin debe elegir un export actualizado. No se importó ni publicó ningún gasto real para probar.

## Archivos de implementación

Insumos: `src/components/sytex-supply-control.tsx`, `src/components/supply-review-controls.tsx`, `src/components/operations.module.css`, `src/lib/supply-review.ts`, `src/server/operations-input.ts`, `src/server/services/operations.ts`, `src/app/api/operations/route.ts`.

Mendel: `src/components/mendel-expense-detail.tsx`, `src/components/mendel-zone-actions.tsx`, `src/components/mendel-zone-tray.tsx`, `src/lib/mendel-bandeja.ts`, `src/lib/mendel-receipt.ts`, `src/lib/mendel-source-refresh.ts`, `src/lib/mendel-tray-print.ts`, `src/server/mendel-zone-input.ts`, `src/server/services/mendel-zone-control.ts`.

Pruebas agregadas/ampliadas: `src/lib/supply-review.test.ts`, `src/components/supply-review-controls.test.ts`, `src/server/services/supply-review-batch.pg.test.ts`, `src/app/api/operations/route.test.ts`, `src/lib/mendel-source-refresh.test.ts`, `src/server/services/mendel-zone-control.pg.test.ts`, `src/components/mendel-expense-detail.test.ts`.

## Verificaciones realmente ejecutadas

- Baseline: **434/434**, 59 archivos. La primera ejecución aislada falló antes de descubrir tests por EPERM en el directorio temporal; se repitió fuera de ese aislamiento, sin cambiar Vitest.
- Final: **460/460**, 64 archivos. Incluye SQL real sobre PGlite **en memoria con datos sintéticos**, no PostgreSQL Railway: rollback de todas las revisiones y eventos si falla la última versión, permisos, distintas cantidades por insumo, conservación de notas/adjuntos, entradas estrictas, CSRF, cuerpo excesivo, conflictos/idempotencia de refresco y conservación de aprobaciones Mendel.
- TypeScript pasó antes de generar los validadores de Webpack. La generación posterior revela un problema existente en la base: exportación `getHealthStatus` en `src/app/api/health/route.ts`, no admitida como export de ruta Next. Verificado con `git show HEAD:src/app/api/health/route.ts`; no se modificó ese archivo ni su test.
- Se repitió `npx tsc --noEmit` después del build: falla únicamente por ese validador generado de `/api/health`. Resultado final: `TSC=BLOCKED_PREEXISTING_ROUTE_EXPORT`, no PASS.
- ESLint: 0 errores, 4 warnings preexistentes (dos constantes en `sytex-supply-control.tsx`, dos parámetros de mocks en `sytex-sync.test.ts`).
- Build normal: primer intento bloqueado al obtener Figtree de Google Fonts. Reintento con red autorizada: pánico interno Turbopack al iniciar el proceso CSS de `globals.css`, archivo no modificado.
- Build alternativo `npm run build -- --webpack`: compiló los módulos, pero falló al validar el export preexistente de `/api/health`. **Build no certificado.** No se desactivaron verificaciones ni se cambió el empaquetador del proyecto.
- Todos los builds usaron `DATABASE_URL` ficticia con puerto local 1, definida solo para ese proceso. No se usaron archivos `.env.local`. `prisma generate` generó el cliente local; no ejecuta migraciones.
- `git diff --check`: sin errores.

## Revisión visual

Se usó la habilidad de navegador para operar los **componentes reales** empaquetados en un arnés separado (`../supply-bulk-ui-qa/serve.mjs`). Solo responde con datos inventados en memoria, no lee credenciales ni conecta con servicios externos. No reemplaza una prueba de integración productiva.

En navegador se verificó: seleccionar tres insumos, ingresar una factura común, elegir Incluido y Sí descargado, revisar y confirmar dentro del diálogo; al volver al listado los tres muestran la factura y Descargado, cada uno con su cantidad. Se verificó foco inicial en factura y que el diálogo modal aísla el fondo. La versión inicial con confirmación nativa trabó la automatización; se reemplazó por revisión/confirmación inline y se repitió el recorrido con éxito.

Evidencia local fuera del repositorio: `../supply-bulk-form-20261022.png` y `../supply-bulk-saved-20261022.png`. No se midieron viewports mobile específicos ni se certifica CSS productivo con tests de markup.

## Estado y siguiente paso

`UNIT_AND_REGRESSION_TESTS=460/460`
`SQL_INTEGRATION=PGLITE_SYNTHETIC_PASS`
`LIVE_INTEGRATION_TESTS=NOT_RUN`
`BUILD=BLOCKED`
`TSC=BLOCKED_PREEXISTING_ROUTE_EXPORT`
`PRODUCTION_TOUCHED=NO`
`DATABASE_REAL_WRITTEN=NO`
`MIGRATIONS_RUN=NO`
`CREDENTIALS_ROTATED=NO`
`COMMIT=NOT_CREATED`
`PUSH=NOT_RUN`
`DEPLOYMENT=NOT_RUN`

Resolver el bloqueo de build en un ajuste mínimo revisado, repetir validaciones y revisión visual mobile antes de autorizar/publicar esta nueva funcionalidad. La situación de credenciales por el incidente Railway sigue pendiente; no declarar producción segura ni rotación realizada.

## Cierre de validación para publicación autorizada — 2026-10-22

Eugenia solicitó explícitamente «publicala». Esto autoriza preparar commit, push, PR, fusión y publicación del ajuste; no autoriza rotar credenciales, modificar permisos reales ni guardar controles de prueba sobre datos de producción.

Se corrigió el bloqueo preexistente de salud: `getHealthStatus` pasa a ser una función interna, no un export de `route.ts`. El endpoint conserva el mismo HTTP 200 y JSON; su prueba ahora ejecuta `GET` y verifica la respuesta real. No se desactivaron verificaciones de tipos.

- Pruebas repetidas: **460/460**, 64 archivos.
- ESLint repetido: **0 errores**, 4 advertencias preexistentes.
- `npm run build`: sigue fallando localmente por el proceso CSS interno de Turbopack en Windows, sin cambio en `globals.css`.
- `npm run build -- --webpack`: **PASS**, incluida la validación TypeScript, generación de páginas y trazas. No se cambió el empaquetador en `package.json` ni la configuración productiva.
- Se exige que GitHub CI pase con `npm run build` habitual antes de fusionar. La compilación local alternativa no se presenta como una ejecución local exitosa del comando estándar.
- El acceso Railway conectado pidió autenticación repetidamente. No se usó otra cuenta o proyecto como sustituto, no se leyeron valores de variables ni se alteraron credenciales. Mientras no se verifique el despliegue concreto, `DEPLOYMENT_STATUS=NOT_VERIFIED`.

No se añaden migraciones ni se ejecutan importaciones de Sytex/Mendel para verificar el despliegue. Se debe conservar la preparación productiva `--migrations-only` y revisar todos los cambios pendientes de Railway antes de aplicar el SHA de esta entrega. Los resultados finales de CI, PR y despliegue se registrarán en el PR y en el acta local de publicación; este documento no afirma que producción ya esté actualizada.
