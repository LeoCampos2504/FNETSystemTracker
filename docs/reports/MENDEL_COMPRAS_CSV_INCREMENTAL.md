# Control de compras Mendel por CSV

Estado: implementación local en `testing`; pendiente de verificación visual y de una base de pruebas independiente. No se conectó Mendel ni se aplicaron migraciones.

## Uso

En Compras, seleccioná el CSV, revisá la vista previa y confirmá la importación. Se actualizan las compras existentes y se agregan las nuevas, incluso si tienen fechas anteriores. Los registros inválidos se omiten y se muestran; un conflicto de identificadores detiene toda la importación. No se reinician los controles manuales. El ID completo se muestra cuando está disponible; los registros anteriores pueden tener solamente el ID abreviado.

El CSV original de cada importación nueva queda en la tabla privada `mendel_csv_archives`. El historial muestra el archivo, período, cantidades y errores; no hay archivo ni período recuperable para cargas anteriores que no los conservaron. El CSV puede contener datos personales y financieros: su acceso debe seguir limitado a Administración.

El control distingue **Va en Oppen**, **Debe cargarse en Intra**, **Cargada** y **Descargada en Intra**. El último significa que el uso fue justificado, no que se descargó un archivo. Los controles son registros manuales de FNET; no cambian Intra ni Mendel. Las zonas provienen del control compartido de zonas de FNET; si no existe una asignación se muestra «Sin zona». Los estados sin confirmar se muestran por separado y se incluyen entre pendientes, salvo que se haya indicado que no corresponde cargar en Intra.

Los filtros se aplican antes de calcular los contadores y de descargar el Excel. Una diferencia significa que un estado está confirmado en Sí y el otro en No; los estados sin confirmar se informan por separado. El Excel incluye los registros que cumplen los filtros, no solo la página visible.

## Validaciones y límites

- El CSV de ejemplo se examinó solo en lectura: 9.383 registros válidos y uno con importe de factura inválido. El registro inválido debe revisarse y reimportarse; no se publicó ni guardó el archivo real.
- Las pruebas de importación usan una base temporal con datos inventados y comprueban importación por lotes, registros antiguos, controles preservados y rechazo de IDs completos distintos con el mismo abreviado.
- Si una compra anterior solo tenía ID abreviado, al importar por primera vez su ID completo se usa ese vínculo heredado; la identidad histórica completa no puede demostrarse con el dato abreviado por sí solo.
- El archivo original se almacena hasta 8 MB; el análisis y exportación tienen un límite explícito de 50.000 compras. La interfaz móvil y el flujo con una base real de pruebas requieren revisión humana.
- La migración nueva agrega tres tablas propias de FNET. Se debe revisar y aplicar exclusivamente en un entorno autorizado antes de usar estos cambios; no se ejecutó aquí.

## Verificación local posterior — 15/11/2026

Se comprobó que «Descargada en Intra» es una confirmación manual de uso justificado; no descarga un archivo ni modifica Intra. Se creó una base PostgreSQL exclusiva para la prueba en `127.0.0.1:55439`, con 6.000 compras y una cuenta ficticias; las tablas se prepararon solo en esa base. No se utilizó el CSV real ni se modificó Railway o Production.

En el navegador se verificaron las vistas Civil, viáticos y otros (2.000 registros ficticios cada una), búsqueda, zona, fecha y filtro de diferencias. En la compra de prueba se guardaron Oppen, factura, carga y descarga; después de reimportarla se conservaron los controles y la factura manual, y el historial mostró actor y fecha. Una compra nueva apareció en el panel después de importarla sin recargar. Para Civil + NOA, el contador y el Excel dieron 1.000 registros y se compararon todos sus IDs contra la base ficticia. Una muestra de Excel se abrió correctamente como archivo `.xlsx`.

Se detectaron y corrigieron tres problemas: el CSV que omite columnas ya no borra esos datos existentes; el panel se actualiza al terminar una importación; y la cabecera que desbordaba en pantalla angosta ahora queda contenida. En la medición posterior el ancho útil fue 381 px y el ancho del documento 381 px; la escala del navegador no permitió asegurar un viewport efectivo de 390 px exactos. La tabla anterior sigue existiendo con sus propios filtros y métricas, lo que puede resultar confuso junto al nuevo control.

Las 662 pruebas y TypeScript pasaron. ESLint terminó sin errores, con cuatro advertencias preexistentes en archivos Sytex. La compilación no se repitió después de estas correcciones, para no interrumpir el servidor local que se dejó abierto; la compilación anterior con Webpack había pasado. Los cambios posteriores a `4f7a5f8` siguen sin commit ni push. El trabajo anterior de Intra quedó preservado en `stash`.

## Controles en columnas — verificación local

El control muestra botones de un clic para Oppen, Web Claro (si debe cargarse), cargada y descargada en Intra. Se usa una columna adicional de descarga porque se trata de un paso distinto de determinar si corresponde cargar. Los valores sin confirmar se muestran como «No · Sin confirmar», conservando su estado desconocido en la base. La factura se edita en su celda y se guarda al salir o presionar Enter; cada fila informa el guardado y los errores.

Con la base temporal y compras ficticias se comprobaron ambos sentidos de los botones, guardado de factura por Enter y al salir, persistencia al recargar y reimportar, y recuperación del valor previo ante un conflicto de edición. El Excel descargado mantuvo el filtro y los valores comprobados. En pantalla angosta se midió un documento de 381/381 px y un desplazamiento propio de la tabla de 351/1200 px. No se utilizaron datos reales ni se realizó push o despliegue.

## Revisión de identidad por ID completo

Esta corrección reemplaza la descripción anterior que vinculaba automáticamente un registro histórico por su ID abreviado. Las importaciones exigen ID completo y las compras nuevas se identifican por ese valor. Se mantienen los controles de registros históricos que ya tienen una asociación completa verificada. Si una compra histórica solo tiene ID abreviado, no se vincula ni modifica automáticamente: la fila se informa para revisión. Todavía no hay una interfaz para resolver esa asociación histórica.

En localhost se importó un CSV ficticio con dos IDs completos diferentes que comparten prefijo: ambas compras quedaron separadas. Una fila inválida se indicó por número de registro, se corrigió y se importó después. La reimportación de una compra con asociación verificada conservó su factura y controles.
# Historial acumulado y observaciones locales (16/11/2026)

- Las observaciones se editan en la fila y se guardan con los controles manuales en el historial de eventos existente, con versión, autor y fecha. Se incluyen en el Excel y en la búsqueda.
- Prueba local con base aislada y CSV inventados: primera importación con dos transacciones; segunda con una repetida modificada y una nueva anterior. El resultado fue tres IDs distintos; importe actualizado y controles, factura manual y observación conservados tras recargar. Se repitió la carga luego de marcar los controles de Intra y se conservaron. Excel filtrado: tres filas y observación incluida.
- La vista identifica los estados aún no confirmados como «No · Sin confirmar», sin atribuir una revisión que no ocurrió. Los registros históricos con ID abreviado que no se pueden vincular con certeza se rechazan en la importación y requieren revisión; aún no hay herramienta visual de vinculación manual.
- La consulta protege el servidor con un límite de 50.000 transacciones; si se supera, responde con error en vez de omitir registros silenciosamente. Debe rediseñarse la paginación para eliminar ese límite antes de alcanzar ese volumen.
- Pruebas: 668/668; TypeScript correcto; lint sin errores (cuatro advertencias existentes en archivos ajenos a esta tarea). No se utilizó Railway ni información real.

# Revisión manual de ID históricos (16/11/2026)

- En Compras, «Revisar asociaciones» compara los registros sin ID completo con filas del CSV; muestra fecha, comercio, importe y factura de ambos lados. La coincidencia es solo una sugerencia y exige confirmación individual. El CSV de comparación no se importa automáticamente.
- Se conserva el registro histórico y sus controles, factura manual y observaciones. La asociación queda registrada con usuario y fecha en el historial de eventos existente; el índice único impide reutilizar el ID completo. Si existe una transacción separada con ese ID, se rechaza en vez de fusionarla.
- Prueba en PostgreSQL local aislado, con datos inventados: comparación, confirmación, conservación de controles y factura, y evento registrado. Pruebas de la API sobre base temporal cubren observaciones, autorización, intentos duplicados y compras ya existentes. Luego de asociar hay que importar nuevamente el CSV para actualizar los datos de origen.
- No se usaron datos reales, Railway ni producción; no hubo push.
