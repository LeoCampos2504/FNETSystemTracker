# MENDEL — Corrección manual de comprobantes (2026-10-27)

Estado: IMPLEMENTED_LOCALLY. No publicado. Analista/Auditoría permanece pausado y sus cambios se conservan en el checkout anterior; esta rama aislada no los incluye.

## Causa y alcance

La bandeja por zonas muestra evidencia importada desde CSV, no consulta documentos de Mendel en vivo. Un CSV anterior o una exportación incompleta puede seguir informando NO. No se verificó un comprobante real contra Mendel en esta etapa y no se atribuye un caso particular al CSV sin esa comparación.

Admin puede marcar **Marcar comprobante OK** en el detalle de un gasto compartido, tras revisar personalmente la foto/PDF en Mendel. Puede **Deshacer OK manual**; esto retira la revisión y vuelve a la evidencia original, no elimina un documento ni cambia el CSV. Coordinadores ven el resultado dentro de sus zonas habilitadas pero no pueden autocertificar comprobantes. La autorización del gasto es un control independiente.

La tabla, las tarjetas, el filtro de pendientes y los prints usan el mismo estado efectivo. Se agrega filtro OK · revisión manual FNET. La vista previa CSV sigue identificada como fuente local; para corregir manualmente se debe abrir el gasto desde Cargar control compartido, no desde la previsualización.

## Persistencia y seguridad

Se reutiliza ops_events con acción MENDEL_RECEIPT_REVIEWED y recurso mendel-receipt:ID. Historial append-only con anterior/nuevo, versión, cuenta real y fecha. No se cambia el payload fuente ni las respuestas de coordinación. No necesita migración ni Prisma schema.

El POST existente conserva sesión, protección de escrituras y validación estricta; la nueva acción exige Admin activo en servidor. Bloqueo del gasto, comprobación de snapshot/último evento e inserción ocurren en una transacción Prisma existente. Reintentos idénticos son idempotentes; una clave reutilizada con contenido distinto o cambios concurrentes producen conflicto. El cliente no puede proporcionar actor o fecha.

La revisión sobrevive al mismo CSV y a cambios de notas. Si cambian datos financieros/identidad/evidencia del comprobante, se conserva el historial pero aparece a revisar; no se considera un OK vigente hasta reconfirmar. Esta marca interna no prueba automáticamente autenticidad fiscal ni aprobación oficial.

## Validación

Suite existente 492/492 PASS; con nuevos casos 503/503, 70 archivos PASS, repetida con las dependencias independientes y el texto final de la interfaz. SQL solo con PGlite descartable y datos sintéticos; pruebas de permisos, historial, deshacer, persistencia, conflictos, rollback, filtros y markup. Lint sin errores y cuatro advertencias preexistentes. La primera compilación falló por el enlace temporal de node_modules fuera de la raíz Turbopack; se reemplazó solamente ese enlace por dependencias locales, sin modificar configuración de producto. Repetición del build estándar npm run build PASS y npx tsc --noEmit PASS. git diff --check PASS considerando los CRLF existentes. Prisma schema, migraciones, preparador y dependencias versionadas sin cambios.

No se certificó visualmente en producción ni se guardaron comprobantes de prueba sobre gastos reales. No hubo conexión a base real, integración Mendel, cambios en Railway/n8n, migraciones, commit, push ni deploy. Publicación requiere autorización específica.

## Continuación de publicación autorizada

Eugenia autorizó publicar este ajuste. Preflight: main e3eb717, servicio FNETSystemTracker del proyecto de Leo sublime-mindfulness fijado al mismo commit, sin cambios pendientes en ese servicio. Se publica exclusivamente esta mejora; Analista sigue pausado. No hay migraciones nuevas: el preparador de despliegue existente conserva --migrations-only y no debe importar datos fuente. La autorización no incluye marcar gastos reales como prueba. La comprobación de CI, commit publicado y despliegue se registrará en el PR y en el acta final de entrega.

## Publicación inicial y simplificación a un clic

PR #57 integrado en main db68cca6ee3763145ac4f921a682b6f3ff63aaa6. CI 503/503 y todos los pasos aprobados. Railway 3e4744b8-3207-49b4-9580-ffe05b20bc0d SUCCESS el 27/10/2026 a las 09:22:46 Argentina; healthcheck aprobado. Bandeja compartida y botón del detalle verificados con sesión Admin, sin pulsar confirmaciones ni guardar gastos de prueba. Captura de evidencia conservada fuera del repositorio para no publicar datos operativos.

Eugenia solicitó simplificar el flujo durante el cierre: botón **Comprobante OK** directamente en la columna de comprobante y en cada tarjeta móvil, sin abrir detalle/formulario. Luego ofrece **Deshacer OK**. Reutiliza exactamente el mismo servidor, permisos, historial, transacción y conflictos; no hay nuevas reglas de aprobación ni cambios en la API. Recarga compartida conserva filtros y página; el gasto sale del filtro de faltantes al quedar OK. El detalle y la información de origen siguen disponibles como consulta opcional. CSV local no permite persistir un OK hasta usar el control compartido.

Validación local del ajuste de presentación: 505/505 tests (70 archivos), incluyendo acción única sin form/select/textarea/modal y ocultamiento para no-admin. npm run build y npx tsc --noEmit PASS; npm run lint sin errores, cuatro advertencias preexistentes; diff --check PASS considerando CRLF. Analista continúa excluido. No se realizaron escrituras de prueba sobre gastos reales.
