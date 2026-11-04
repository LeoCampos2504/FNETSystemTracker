# INTRA-STOCK-01 — Excel de pendientes versus usos declarados

Estado: IMPLEMENTED_LOCALLY. La usuaria autorizó commit, push, PR, fusión y despliegue, únicamente si pasa CI, sin migraciones ni importaciones/OK reales como prueba. Resultado de publicación pendiente de verificar y registrar en el PR. Administración únicamente; no amplía permisos de coordinación.

## Contrato confirmado por la usuaria

El Excel corresponde a facturas/insumos subidos a Intra pendientes de descargar como utilizados. Una fila desaparece de la siguiente exportación cuando se descarga. La usuaria pidió conservar el historial aunque desaparezca del siguiente Excel, y cruzarlo con los OK de combustible por operación. Por lo tanto, no se debe calcular «saldo actual del Excel menos todos los OK históricos»: descontaría consumos dos veces y mezclaría períodos.

## Implementación

Control de sitios → Combustible → Comparar con Intra (Admin): Cargar Excel de Intra, revisar localidades, confirmar que el archivo está completo para esas localidades y Guardar y comparar. Se guardan todas las líneas, no solo combustible. La importación es compartida y persistente, no localStorage.

- Fuente admitida: una hoja, título opcional antes de las columnas Fecha, Factura, Proveedor, Reg-Zon-SZon, Producto, Disponible, Monto Neto y Liquidada. Hasta 2 MB comprimidos, 16 MB expandidos y 2.000 filas de datos. Rechaza fórmulas, macros, vínculos externos y hojas adicionales; no descarta hojas silenciosamente.
- Identidad de línea por contenido normalizado y ocurrencia. No deduplica por factura: varias líneas de una factura pueden representar productos o cantidades diferentes. Repeticiones idénticas se conservan, se señalan y no se vinculan mientras sean ambiguas. Cambiar cantidad/producto/proveedor/factura crea una línea nueva; no traslada usos antiguos automáticamente.
- Cada importación reemplaza solo el estado actual de las localidades expresamente incluidas. Las otras conservan su última importación. Si una localidad conocida quedó completamente vacía puede incluirse explícitamente. No se asigna saldo cero a operaciones que nunca se importaron.
- Las filas ausentes quedan en «Ya no figuran · historial» con primera importación, última presencia y primera ausencia. Reaparecer conserva su identidad y vínculos. Ausencia no identifica quién descargó ni cuándo, ni prueba que una exportación fuera completa fuera del alcance confirmado.
- «Liquidada» se conserva como dato financiero; no se interpreta como uso, descarga ni aprobación.
- Reimportar el mismo contenido es idempotente: no suma cantidades ni crea movimientos repetidos.

## Vínculos y cantidades

El botón Ver/vincular permite asociar explícitamente una cantidad de una factura a un uso. Soporta varias facturas para un FO y varias cargas contra una factura. Combustible solo aparece como carga con OK vigente; no vuelve a contarse como insumo genérico. En otros insumos se exige mismo producto normalizado y operación; si Insumos ya indica una factura se exige también esa factura. No inventa equivalencias de nombres ni unidades, ni concilia por fecha/sitio/cantidad parecida.

Las tarjetas muestran por operación: pendiente importado de Intra, uso vinculado aún presente en Intra (por descargar), pendiente de justificar y litros OK sin vincular. No suman filtros/aceites en litros ni agregan unidades de productos distintos. Se usan enteros de milésimas para no perder diferencias de 0,35 L o 0,001 L. Los vínculos históricos con facturas ausentes siguen reservando su uso; no vuelven a restarse del stock nuevo.

Quitar un vínculo conserva su cantidad, autor y fecha originales y registra autor/fecha de retiro. Un cambio en el uso, su cantidad, su revisión o un OK desmarcado invalida el cómputo del vínculo y pide revisión, conservando historial. Un nuevo OK no reconfirma silenciosamente el vínculo anterior.

## Persistencia, permisos y protección

Usa la tabla interna ya existente `ops_events`, acción INTRA_STOCK_CONTROL y clave propia, con snapshots completos inmutables de datos/vínculos, actor de sesión y fecha del servidor. No necesita tablas nuevas, Prisma schema ni migraciones. Bloqueo transaccional advisory + versión esperada serializan importaciones y vínculos; un error de auditoría revierte el cambio completo. El cliente no define actor ni fechas ni suministra filas arbitrarias en la importación: el servidor vuelve a leer el XLSX.

Todos los endpoints exigen sesión activa ADMIN en servidor, sin CTIC ni scope limitado. Escrituras verifican origen y límites de lectura; SQL parametrizado, respuestas privadas sin caché, texto escapado por React. La comprobación de ZIP limita entradas/bytes y procesa bloques comprimidos pequeños antes de permitir la lectura del XLSX. No guarda el archivo binario original: conserva filas normalizadas, nombre y huella de contenido por localidad.

Capacidad de esta primera versión: 10.000 líneas históricas, 10.000 vínculos y 4 MB por estado. Al llegar al límite se rechaza el cambio con aviso; nunca se recorta ni borra historia. Historial consultable de a 100 eventos, con acceso a anteriores. Este almacenamiento debe revisarse antes de aumentar notablemente el volumen; no se presenta como stock oficial ni conciliación automática con Intra.

## Validación y límites de certificación

Baseline del árbol actualizado con la corrección de fechas: 583 pruebas / 84 archivos. Pruebas nuevas sobre lectura XLSX real, límites, campos, duplicados, decimales, filas ausentes/reaparecidas, diferencia de cantidades, idempotencia, scopes, versiones, historial, reversión transaccional, permisos y origen. SQL ejecutado únicamente en PGlite descartable con registros inventados y URL de base inválida. Se comprobó además que el lector abre el Excel entregado por la usuaria, devolviendo todas sus filas; no se importó en la base real y sus datos no se incluyen en Git ni fixtures.

La vista local de revisión usa el componente real y un servidor en memoria con datos inventados, fuera del repositorio. Permite revisar filtros, vínculo y conservación visual de ausentes; no certifica una escritura ni permisos en producción. Certificación de la carga real y comparación de casos operativos pendientes a cargo de la usuaria tras publicar.

Resultado local final: **625/625 pruebas en 89 archivos**, TypeScript sin errores, ESLint sin errores (cuatro advertencias previas) y build Webpack aprobado. La vista de revisión comprobó vínculo de 40 contra factura de 100, quedando 60 pendientes, y visibilidad simultánea de la factura ausente en historial. Ancho documental medido 1265/1265 en la vista local; no es una certificación mobile. Falta el build habitual de CI antes de publicar.

No se modifica Intra, Sytex, n8n, Mendel ni inventario real. No se marcan OK de prueba. La corrección de fechas de combustible se publicó por separado en PR #65; esta funcionalidad nueva no está incluida allí.

## Continuación R1 — reservar cantidades pendientes de revisión

Durante el cierre se identificó un caso de borde: un vínculo activo cuya fuente cambiara dejaba de sumar como evidencia válida y liberaba capacidad para otra asignación. Si luego la fuente volvía al valor anterior, ambos vínculos podían sumar. Se separan evidencia válida y capacidad reservada: **todo vínculo activo conserva su reserva de factura y de uso**, aunque necesite revisión. Solo Quitar vínculo libera esa cantidad, con historial. La interfaz usa esa capacidad disponible para proponer cantidades y explica el bloqueo. Sin backfill, migraciones ni modificación de registros reales. Se agregan tres regresiones de dominio y una SQL descartable; la validación final de esta continuación se registra en su PR. Los 625 casos anteriores se conservan.

La comprobación inicial de reservas dio 629/629 (625 anteriores + 4 nuevos). Se agregó además una prueba SQL que verifica que las lecturas amplias de fuentes ocurren antes de abrir la transacción del control, igual que en fuel-review: no consumen su timeout ni mantienen bloqueado el ledger mientras se consultan tareas/insumos con el cliente compartido. El cambio del control y su auditoría siguen siendo una única transacción con versión y bloqueo.

R1 local final: **630/630 en los mismos 89 archivos** (625 anteriores + 5 nuevos), TypeScript y ESLint sin errores (cuatro advertencias previas), build Webpack aprobado. Build habitual de CI y publicación final pendientes de verificar.
