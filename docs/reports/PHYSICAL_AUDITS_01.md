# PHYSICAL-AUDITS-01 — Control de auditorías de seguridad física

Fecha: 29/10/2026. Estado: IMPLEMENTED_LOCALLY, sin publicación ni migración real. Rama: feature/physical-audits-control. Base: main 946710936cad121c258d01106727e0d3bff04d2a.

## Reglas confirmadas por Eugenia

- Nueva solapa Control de auditorías, con datos persistentes y archivos Excel/PDF/fotos por auditoría.
- Todos los usuarios activos pueden consultar; solo Administración (rol real ADMIN) puede crear, editar, importar o adjuntar. No se crean cuentas ni se cambia el rol de nadie. No se retoma el desarrollo pausado del rol Analista.
- Repetición cada tres meses calendario, con próxima fecha editable y motivo de excepción. Al final de mes se ajusta al último día válido. Fechas civiles de Argentina, sin depender del navegador.
- Descargar listado completo o filtrado en Excel; los archivos originales se descargan por separado.

## Fuente y migración de la planilla

Fuente local: Control_Auditorias_Seguridad_Fisica_Fnet_v3.xlsx. No se modificó el archivo. Hojas Dashboard y Control_Auditorias. El lector de la aplicación reconoce 66 personas sin errores; identifica 25 filas con última fecha y calcula o conserva su próxima fecha, manteniendo una excepción explícita de un mes. No se inventan fechas para filas sin última/próxima fecha. Los estados originales se preservan: Pendiente, Realizada, Eximida, Solo Celular y Sin Bienes Asignados.

La importación tiene vista previa, valida todas las filas y no guarda si hay errores. Se confirma con Guardar personas en FNET. Usa CUIL como identificador textual; las nuevas se agregan, las idénticas no se duplican y las diferentes se informan sin reemplazar registros/historia. Las diferencias se revisan desde la ficha. Los lotes se limitan por cantidad y bytes; un fallo posterior puede dejar lotes confirmados y se permite reintentar. No hay importación automática ni carga del archivo real a la base durante el desarrollo. La planilla maestra no se adjunta automáticamente: los adjuntos se cargan explícitamente a un registro.

## Implementación

- Ruta /auditorias y enlace en menú real; acceso de consulta también desde el área CTIC sin ampliar sus permisos de otros módulos.
- Listado, búsqueda por nombre/localidad/notas, filtros por sector, estado y vencimiento; resumen vencidas/hoy/próximas/sin fecha. Aviso previo configurable en pantalla a 7, 15, 30 o 60 días (15 iniciales). Son avisos dentro de esta pantalla, no correo, WhatsApp, push ni tareas en segundo plano; la preferencia vuelve a 15 al recargar.
- La ficha permite editar datos o registrar una nueva auditoría. Cada guardado incrementa versión y agrega una fotografía inmutable de datos, autor, fecha y tipo (importación, edición o auditoría). No se borran auditorías anteriores. Las modificaciones compiten por versión, usan bloqueo y transacción única para estado e historial. Reintentos idénticos recuperan el resultado guardado.
- Adjuntos vinculados a un registro concreto, no a la ficha mutable. Múltiples PDF, XLSX sin macros, JPEG, PNG o WebP; 8 MB por archivo, hasta 20 archivos/48 MB por registro. Los duplicados por hash no se repiten. Las subidas múltiples son secuenciales, no una transacción global: el mensaje informa cuántos se guardaron si alguna falla.
- Archivos almacenados como BYTEA en PostgreSQL para persistir entre PCs y despliegues, con descargas autenticadas, no públicas, no-store/nosniff, sandbox y disposition attachment. Se valida contenido real, se sanea el nombre, se limita la petición y la expansión/entradas de ZIP antes de aceptar XLSX. No hay antivirus ni garantía de archivo libre de malware; no se ejecutan macros ni se previsualiza contenido activo. No se admite XLS antiguo ni XLSM. No se implementa eliminación de registros o adjuntos en este bloque.
- Excel usa el exportador existente de FNET, manteniendo filtros idénticos a pantalla. CUIL es texto y las fechas de última/próxima auditoría son fechas nativas de Excel, no texto ni instantes UTC. Las notas se exportan como texto, no fórmulas. El reporte de Administración se puede reimportar con fechas/excepción conservadas; las descargas de consulta tienen CUIL enmascarado y no son un maestro para reimportar.
- CUIL completo solo para ADMIN; en consulta y su Excel, enmascarado. La visibilidad global de nombres/notas y adjuntos para todos los activos fue confirmada por la usuaria; no modifica ámbitos de Mendel, Insumos, Guardias o Sytex. Los permisos se comprueban en servidor también para llamadas directas.

## Persistencia: pendiente de autorización

Migración nueva 20261029_add_physical_audits, registrada en el preparador sin ejecutarla. Crea únicamente fnet_audit_people, fnet_audit_records y fnet_audit_files, con PK, unicidad, NOT NULL, checks, timestamps e índices. Las únicas FK son internas a esas tablas y app_users. No altera ni enlaza tablas Sytex/n8n; no cambia Prisma schema ni migraciones ya aplicadas. Validación dry-run del preparador PASS; las pruebas SQL ejecutan la nueva migración solamente en PGlite descartable con datos ficticios.

Antes de publicar: autorización explícita para commit/push/PR/merge/despliegue y estas tres tablas en la base de Leo; CI habitual verde. Revisar espacio disponible/backups para adjuntos (no se verificaron con Railway en este desarrollo). Importar las 66 personas y archivos reales solo mediante acción autorizada de Administración. No se tocaron producción, secretos o cuentas; sin commit ni push.

## Pruebas y limitaciones

Pruebas de dominio, SQL real en PGlite, autenticación HTTP, origen, rol de sesión no falsificable, conservación de historial y adjuntos, concurrencia/versionado, reintentos, archivos rechazados, fechas/calendario, filtros compartidos y roundtrip XLSX con el lector real. Componentes renderizados estáticamente para verificar controles según rol; esto no certifica CSS/mobile ni flujo end-to-end.

Cierre local: **543/543 tests, 78 archivos** (baseline 519/519). Incluye reintento de creación sin duplicados. Lint PASS, 0 errores y cuatro advertencias preexistentes. TypeScript independiente PASS. Build habitual Turbopack falla localmente en el proceso CSS (igual que antes del cambio); build alternativo Webpack PASS completo, sin cambiar configuración. La publicación deberá exigir CI con build habitual exitoso. Sin pruebas manuales en producción ni importación real; certificación visual pendiente.

## Continuación: publicación autorizada

El 29/10/2026 Eugenia autorizó «autorizo, yo lo pruebo» a la propuesta explícita de commit, push, PR y publicación en FNET de Leo, creando únicamente las tres tablas internas de este módulo y condicionado a CI exitoso. Se conserva la preparación transaccional existente con --migrations-only, sin reimportar fuentes iniciales ni tocar datos Sytex/n8n. No se cambia ninguna migración histórica. La prueba manual y la importación de la planilla/archivos reales quedan a cargo de la usuaria. Los resultados de CI, fusión y despliegue se registrarán en el PR; esta autorización no equivale a certificación manual ni verificación de backups.
