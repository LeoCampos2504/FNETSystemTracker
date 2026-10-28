# Mendel — actualidad del CSV, descuentos y Rendido Sí/No

Estado: implementación local, no publicada. Analista permanece pausado y excluido. No se importaron gastos reales ni se modificó el CSV original.

## Evidencia y causa

CSV proporcionado por Eugenia: transacciones (25).csv, Windows-1252. El lector de la app lee sus 507 registros, sin IDs duplicados ni fechas inválidas, del 28/09 al 28/10/2026. Último horario informado: 28/10 13:13. Conteo independiente con Import-Csv: también 507. No se detectó pérdida de filas del parser en este archivo.

La pestaña productiva estaba en Control compartido FNET: 660 gastos, 368 visibles y 292 ocultos por firma. No es una consulta en vivo a Mendel ni una previsualización de este archivo nuevo. No se hizo una conciliación exhaustiva por ID con la base ni se afirma que todos los gastos ausentes se expliquen por el filtro. Hace falta actualizar los gastos compartidos con el nuevo CSV mediante la acción explícita de Admin; cargar una vista previa no los guarda. El período del archivo es parcial: no deben borrarse los gastos históricos que no aparecen en él.

Defecto confirmado: el lector ignoraba Notas de auditoria. El CSV tiene 39 notas de auditoría, 24 con descuento/descuentos. Leyendo ambos tipos de comentario hay 30 gastos distintos con menciones de descuento; 28 se encontraban solo con el lector anterior. La exclusión por firma también ocultaba gastos con descuento firmados por Eugenia. No se interpreta una mención como deducción aplicada, importe ni autorización.

Comprobantes: 421 SI y 86 NO según Hay ticket. 39 de los NO también tienen Nombre PDF: contradicción de origen, no un fallo probado de lectura. La presencia del nombre informa un adjunto, no prueba validez fiscal. No se accedió a Mendel live ni a los documentos para validarlos.

## Correcciones locales

- Solo descuentos busca palabra completa descuento/descuentos en notas de transacción, aprobación y auditoría; tolera mayúsculas/acentos. Incluye los firmados aunque esté activo ocultar firma, sin desactivar zona, fecha ni búsqueda. El estado de ocultar firma se conserva al salir de este modo.
- auditNotes separado, opcional y retrocompatible en CSV, contrato estricto de publicación/refresco, búsqueda, detalle, tarjeta, tabla y print. No se confunde con aprobación oficial ni decisión interna. Archivo sin esa columna no borra auditoría previa.
- Fecha del último gasto disponible calculada antes de filtros/paginación. Identifica CSV en vista previa versus control compartido, sin llamar al dato fecha de sincronización en vivo.
- Rendido muestra Sí/No y el botón cambia en ambos sentidos. No en esta presentación incluye dato no confirmado; el detalle mantiene el estado original. Un nombre de PDF o Hay ticket=SI da Sí informado, no aprobación. Las contradicciones siguen registradas en origen. Una revisión invalidada por cambio de evidencia no queda como Sí verificado.
- No manual persistente aunque CSV diga SI, con actor, fecha, concurrencia e historial anteriores. Se amplía el detalle JSON de ops_events con manual opcional; los eventos antiguos de deshacer (ok=false sin manual) conservan semántica de volver al origen. No cambia tablas, Prisma ni migraciones. No se ejecutaron escrituras reales como prueba.

## Validación

Datos reales solo lectura y métricas agregadas; no se copió el CSV ni datos identificables al repositorio. Pruebas automatizadas con datos sintéticos: descuentos firmados, auditoría separada, filtros combinados, fechas y preservación de origen, No manual frente a SI de CSV y alternancia Sí/No. Resultados finales al cierre de la ejecución.

Cierre local: npm test 512/512, 71 archivos PASS; npx tsc --noEmit PASS; npm run build estándar PASS; npm run lint cero errores y cuatro advertencias preexistentes. Diff --check PASS considerando CRLF. Se corrigió una expectativa de texto del test (No/no) tras el cambio solicitado de presentación. No hubo certificación visual de esta versión nueva ni pruebas de escritura contra producción. Prisma schema, migraciones, preparador y dependencias versionadas permanecen sin cambios.

Sin commit, push, deploy, cambios de permisos, n8n, integraciones live ni PostgreSQL real. La publicación del código y la actualización del registro con el CSV son acciones distintas; no se dan por hechas ni se reemplaza toda la historia por el período del archivo.

## Continuación autorizada

Eugenia autorizó publicar estas correcciones y actualizar el control con transacciones (25).csv conservando históricos y autorizaciones. Preflight de publicación: main y servicio productivo de Leo en fdfa5c9 (PR #58), sin Analista. Solo se publican los archivos de esta entrega. La importación de comentarios/comprobantes existentes usará refresh explícito sin modificar revisiones de aprobación ni zonas; los gastos nuevos solo se compartirán con zona inequívoca y sin borrar los registros fuera del período. Los conflictos se reportarán, no se forzarán. La autorización no permite cambiar permisos ni marcar gastos como Sí/No a modo de prueba. CI, despliegue y cantidades realmente actualizadas se registrarán en el PR y acta final.
