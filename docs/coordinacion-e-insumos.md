# Coordinación e insumos

## Insumos

La sección **Control Sytex / Intra** reúne las filas de la sincronización oficial y los exports ya importados. Un formulario, grupo e índice identifica cada registro; repetir una carga no suma cantidades.

Seleccionar una o varias zonas/proyectos y guardar un favorito lo conserva por cuenta. El Excel incluye todos los insumos del filtro de zonas, incluso los que quedan fuera de la búsqueda de pantalla o la página actual.

El detalle permite registrar inclusión por definir/incluido/no incluido, número y archivo de factura, cantidad contada y descargada, estado de Intra y observaciones. La inclusión no se decide automáticamente. “Descargado” exige cantidades coincidentes; un no incluido también exige número de factura. Un cambio posterior en Sytex vuelve a marcar el registro para revisión.

Intra no está conectado. El estado representa una confirmación manual del coordinador, no una comprobación automática de Intra. Una respuesta “OK” en una foto no es un archivo; las fotos se muestran solo cuando Sytex proporciona una URL.

Los registros sin proyecto inequívoco quedan para asignación manual del administrador. No se deduce una zona por similitud de nombres ni se mezclan cantidades de materiales repetidos en grupos distintos.

## Cronograma

Desde Cronograma o /cronograma, elegir un día y zonas, agregar sitio, tarea opcional y uno o más técnicos. Un correctivo imprevisto puede registrarse sin código Sytex. Registrar el resultado como realizado, con pendientes o cancelado antes del cierre.

Cerrar la jornada guarda una instantánea inmutable por día/proyecto. Las visitas en curso o planificadas impiden el cierre. El historial y Excel mantienen los datos y pendientes disponibles al cierre.

Las advertencias muestran pendientes vinculados al sitio y proyecto en la fuente consultada. La ausencia de advertencias no certifica que un sitio no tenga otros pendientes.

## Cuentas

El administrador habilita cuentas y proyectos en /coordinadores. Puede habilitar todas las zonas para que cada coordinador guarde su favorito, o restringir proyectos. El favorito no sustituye los permisos del servidor.

Las API generales de administración siguen reservadas a administradores; los coordinadores usan las API de operaciones con sesión y proyectos autorizados. Facturas adjuntas son privadas. Los cambios llevan versión y registro de auditoría.

## Publicación

El paso db:prepare-app instala únicamente tablas propias de FNET; debe seguir como paso previo al despliegue. No modifica las tablas oficiales de Sytex.

La actualización de Sytex sigue dependiendo de n8n o del importador de export autorizado. Actualizar la pantalla no dispara una extracción nueva. Cotizaciones conserva el estado recibido y muestra cuándo se sincronizó para no confundirlo con el estado actual del enlace Sytex.
