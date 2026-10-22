# MENDEL-INTRA-01 — Confirmaciones manuales en Registro de compras

## Resultado y alcance

Solicitud de Eugenia: poder cambiar la columna Intra del Registro de compras de Mendel para indicar si ya se subió a Intra y si está descargado allí. Implementación local separada de Guardias; publicación todavía pendiente.

- Rama: `feature/mendel-intra-manual`.
- Base: `13952b114dc90316f33dadc2c010546fbe56c078`, limpia antes de empezar.
- Carpeta: `work/FNET-Mendel-intra`, worktree independiente.
- Estado: `IMPLEMENTED_LOCALLY`; no se declara funcionamiento verificado en Producción.
- Baseline real de esta base publicada: **403/403 tests, 55 archivos**. Los 32 casos de la revisión de Guardias permanecen en la otra rama/carpeta y no forman parte de este cambio; no se eliminaron tests.

## Auditoría y decisión

`mendel-purchases.tsx` mostraba `Pendiente` literal en todas las filas. El modelo tenía `reconciliationStatus`, pero no dos confirmaciones independientes ni editor. No se reutiliza ese campo para otra semántica ni se confunde la confirmación del pago con un movimiento de stock.

Decisión: dos valores `boolean|null`, separados y manuales: **Subido a Intra** / **Descargado en Intra**. `null` significa Sin confirmar, no un No conocido. No se obliga que uno implique al otro ni se establece un orden de trabajo nuevo. No se exige una aprobación de coordinador para registrar este hecho: la autorización es un dato distinto.

La UI ofrece Editar control, dos selectores y Guardar control / Cancelar. Guarda autor/fecha e historial, muestra éxito solo tras respuesta del servidor y protege doble clic. Las respuestas no se guardan en localStorage. Reabrir o volver desde otra PC consulta el mismo estado compartido de FNET cuando esté desplegado.

## Persistencia y límites

Se reutiliza la tabla interna existente `ops_events` con acción `MENDEL_INTRA_MANUAL_CONFIRMED` y clave `mendel-intra:<transactionId>`. Cada evento contiene ambos valores, antes/después, versión y huella de datos relevantes; actor y fecha provienen del servidor. El estado actual se deriva de la última versión, no del orden aleatorio del UUID ni solo de un timestamp.

No se agregó tabla, columna, migración, dependencia, FK ni cambio en `schema.prisma`. No se modifican `mendel_transactions`, las respuestas de coordinadores, `reconciliationStatus`, Intra oficial, Sytex, n8n ni registros de stock. La pantalla aclara que es un control manual: marcar Sí no ejecuta una subida de archivos ni una descarga de materiales.

**Retención:** estos eventos constituyen datos funcionales. No deben borrarse mediante una futura limpieza genérica de logs. En el código revisado no hay purga de `ops_events`; no se auditó mantenimiento externo ni n8n. La inmutabilidad es de aplicación (append-only), no se afirma protección frente a SQL administrativo externo.

## Concurrencia y seguridad

- Misma autorización Admin que el Registro de compras, aplicada en servidor y nuevamente en servicio. Sin nuevos permisos de coordinadores/técnicos ni cuentas inactivas.
- Sesión real, origen validado, JSON estricto y límite de 64 KiB. No se acepta actor, fecha o versión nuevos desde el cliente.
- La compra debe existir con su ID real. SQL constante, valores parametrizados.
- Una transacción Prisma bloquea la fila de compra y añade el evento; una importación concurrente no puede cambiar la compra mientras se confirma. La lectura detallada usa bloqueo compartido para mantener estado/historial coherentes.
- Token del evento previo y huella de compra evitan sobrescribir una confirmación de otra persona o confirmar una compra que cambió desde que se abrió. UUID de solicitud soporta reintentos idempotentes; reutilizarlo con otros valores/actor se rechaza.
- La huella incluye ID, fecha, persona, comercio, importe, moneda y presupuesto. Los importes se normalizan como texto decimal, sin redondearlos mediante `Number`.
- Reimportar el mismo CSV no toca los eventos. Si cambian esos datos relevantes, se conserva el hecho anterior pero se muestra Revisar; una reconfirmación explícita registra otra versión. Cambios de disponibilidad/estado de comprobante no se interpretan por sí solos como una confirmación en Intra.
- Las notas no autorizan gastos ni alteran estas confirmaciones automáticamente. No se lee ningún secreto ni se carga `.env.local` real en la copia de trabajo.

## Archivos

- `src/components/mendel-purchases.tsx`: columna editable y aclaración de conciliación automática separada.
- `src/components/mendel-intra-control.tsx` y `.module.css`: estados, editor compacto, guardado/historial y errores.
- `src/lib/mendel-intra.ts`: DTO y etiquetas compartidas de presentación.
- `src/server/mendel-intra-input.ts`: validación estricta de entrada.
- `src/server/services/mendel-intra-control.ts`: lectura, huella, permisos, idempotencia y auditoría persistente.
- `src/app/api/mendel/intra-control/route.ts`: lectura/confirmación autenticada.
- `src/app/api/mendel/transactions/route.ts`: agrega el control persistente a la página de resultados, sin modificar compras ni resumen de conciliación.
- Cuatro archivos de tests nuevos (SQL, HTTP, listado y presentación).
- Este informe, `docs/API_CONTRACTS.md` y `docs/PROJECT_CONTEXT.md`.

## Validación

31 casos nuevos: valores independientes, desconocido distinto de No, autor/fecha/antes/después, historia, acceso Admin, rechazo de otros roles e inactivos, versiones obsoletas, reintentos, cambio de compra, reimportación, decimal exacto, no-op, ID inexistente, SQL parametrizado, rollback, orden por versión, entrada estricta, sesión/origen/límite HTTP y UI escapada.

- `npm test`: **434/434 PASS, 59 archivos** (403 baseline +31).
- `npm run lint`: PASS, cero errores; cuatro advertencias preexistentes en `sytex-supply-control.tsx` y `sytex-sync.test.ts`.
- `npm run build`: PASS con Turbopack y TypeScript, sin modificar `next.config.ts` ni el comando de build.
- `npx tsc --noEmit`: PASS en la última ejecución posterior al build.

Pruebas SQL con PGlite local y datos ficticios, usando los DDL existentes de compras y `ops_events`; no son consultas contra Railway. Las pruebas iniciales usaron las dependencias idénticas de la otra copia. Turbopack rechazó la unión de directorio por estar fuera de su raíz: se quitó exclusivamente ese enlace recién creado (no su destino) y se copiaron las dependencias existentes a esta carpeta. El build estándar pasó después, sin cambiar código/configuración de la app para sortearlo. Node local 24.11.0; CI todavía no se ejecutó.

## Revisión visual

Componentes reales del Registro de compras, en un arnés local con una única compra ficticia y API en memoria, fuera del repositorio. Verificado: Subido=Sí y Descargado=No de forma independiente, guardado, conservación al recargar, autor/fecha e historial. La integración SQL persistente se prueba por separado con la migración existente y PGlite. No se presentan los resultados del arnés como cambios reales en FNET, Mendel o Intra.

Vista previa local: `work/mendel-intra-ui-qa/intra-manual-preview.png`. La revisión de navegador permitió comprobar el editor dentro de la tabla y la separación entre comprobante Mendel y control manual.

## Entornos y siguiente paso

`SCHEMA_CHANGED=NO`, `MIGRATIONS=NONE`, `DATABASE_REAL_WRITTEN=NO`, `N8N_EXECUTED=NO`, `LIVE_INTEGRATIONS_USED=NO`, `PRODUCTION_TOUCHED=NO`, `COMMIT=NOT_CREATED`, `PUSH=NOT_RUN`, `DEPLOYMENT=NOT_RUN`.

`NEXT_ACTION=WAIT_FOR_TECHNICAL_REVIEW_AND_PUBLICATION_AUTHORIZATION`.

Antes de certificar publicado: autorización para commit/push/PR/fusión/deploy de este ajuste independiente, CI y comprobación autenticada en FNET de Leo. No requiere nuevas migraciones. No marcar compras reales ni hacer movimientos de stock como prueba sin autorización específica.

## Publicación autorizada — 2026-10-19

Eugenia autorizó expresamente commit, push, PR, fusión en main y despliegue de **este control manual de Intra**, separado de Guardias. La autorización reemplaza el siguiente paso de la sección histórica anterior; no autoriza marcar compras reales para probar ni agregar migraciones.

Preflight de publicación: `origin/main` sigue en la base `13952b1`; el servicio FNETSystemTracker de Leo está activo, sin cambios de configuración pendientes y con la misma base publicada. Se conserva la preparación existente `npm run db:prepare-app -- --migrations-only`; esta entrega no agrega archivos de migración y no debe ejecutar importaciones iniciales.

`RELEASE_STATUS=AUTHORIZED_PENDING_CI_AND_DEPLOYMENT`. No se afirma publicación ni certificación productiva en este punto. Deben comprobarse CI, SHA desplegado, salud HTTP y lectura autenticada del editor, sin guardar sobre gastos reales. Los resultados finales se comunicarán a la usuaria y se conservarán en el handoff local de la publicación.
