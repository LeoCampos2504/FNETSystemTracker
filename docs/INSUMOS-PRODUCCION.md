# Insumos en producción

La vista principal de Insumos y `/insumos` usan PostgreSQL cuando `NEXT_PUBLIC_USE_MOCK_API` no es `true`. No hay datos de muestra ni sustitución por mocks ante un fallo. Se necesita una sesión real de Admin; otros roles no tienen autorización global todavía.

## Trabajo diario

1. En **Facturas**, registrar proveedor, tipo, número, fecha, moneda, total y cantidades de cada material. Se puede indicar un identificador exacto de una compra ya importada de Mendel. Una transacción no equivale a una factura ni informa cantidades compradas.
2. Abrir **Ver factura**, adjuntar comprobantes e imágenes y descargar el paquete. Confirmar la descarga después de guardar el archivo. La carga en la Intra de Claro sigue siendo manual: confirmarla únicamente después de completar esa carga. Se pueden reabrir ambos estados.
3. Desde el detalle de un material, registrar cantidad, técnico que lo recibió, fecha, sitio opcional y plazo de revisión. El saldo disponible de la factura disminuye.
4. En **Materiales por técnico**, abrir **Uso e historial**. Registrar cantidades usadas en uno o varios formularios FO. **Se acabó** exige distribuir todo el saldo. Se admite un FO ausente del export, identificado como pendiente de verificación.
5. Una devolución aumenta el disponible de la factura. Una corrección crea un movimiento inverso, exige motivo y mantiene el historial. No se puede revertir una devolución cuyo material ya se entregó otra vez.

Los saldos son internos de FNET. La aplicación no altera el stock oficial de Sytex. Las coincidencias por formulario son evidencia de una referencia; no autorizan consumo automático. Técnico receptor y último editor de Sytex son datos diferentes.

## Fuentes y archivos

**Sytex y Mendel** conserva la consulta sincronizada por n8n y la importación validada del XLSX de respuestas. **Compras Mendel** permite previsualizar/importar el CSV. La fecha del export y su última edición se muestran como fuente, sin afirmar que hay sincronización continua si no existe un proceso n8n actualizado.

Los comprobantes se guardan privadamente en PostgreSQL (BYTEA). Sólo un Admin autenticado puede abrirlos. Se validan formato real y tamaño: PDF, JPG, PNG o WebP, 8 MB por archivo, 6 archivos y 24 MB activos por factura. Los archivos retirados quedan preservados para auditoría. Cambiar archivos exige reabrir una carga en Intra ya confirmada y vuelve a dejar pendiente la descarga.

Operaciones con cantidades usan decimales exactos, transacciones, versiones de registro y claves de solicitud. Los conflictos se informan para actualizar antes de reintentar. El dashboard pagina de a 50 y cuenta todos los registros; no mezcla importes de monedas distintas.

## Despliegue

Pre-deploy: `npm run db:prepare-app`. Crea únicamente tablas propiedad de FNET mediante migraciones permitidas, conserva las fuentes sincronizadas y revierte la preparación si falla.

Una importación inicial autorizada puede suministrarse por la variable privada `FNET_INITIAL_SOURCES_GZIP` (o dividida en `FNET_INITIAL_SOURCES_GZIP_1` y `FNET_INITIAL_SOURCES_GZIP_2` por el límite de tamaño de Railway): JSON normalizado validado, comprimido con gzip y codificado en base64. El script usa la conexión del servicio y resuelve un Admin activo existente por `BOOTSTRAP_ADMIN_EMAIL`, o el único Admin activo si esa variable ya se retiró. No crea sesiones ni cambia contraseñas. La importación es transaccional, deduplica por hash/identificador y conserva compras ya registradas. Sólo suma referencias FO exactas. Nunca genera facturas, entregas ni existencias automáticamente. Vaciar esas variables después de confirmar la importación evita conservar el contenido en la configuración; los datos permanecen en PostgreSQL.

Todavía no hay captura automática autenticada de comprobantes desde Mendel, ni envío automático a la Intra. Esos pasos necesitan integrar sus accesos y validarse con las fuentes reales.
