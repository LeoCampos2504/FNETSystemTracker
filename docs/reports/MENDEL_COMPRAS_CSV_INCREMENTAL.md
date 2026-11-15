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
