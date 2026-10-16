# MENDEL-02C-R1 — Detalle compacto y confirmación de coordinación

Fecha: 2026-10-16 (Argentina).

## Pedido y alcance

Hacer el detalle del gasto más compacto y legible, retirar del detalle la asignación masiva de zona y convertir la respuesta de coordinación en la acción principal azul. La usuaria autorizó explícitamente publicar esta revisión mediante commit, push, PR, merge y despliegue, sin nuevas migraciones ni modificaciones de gastos/respuestas/permisos reales durante las pruebas.

Base: main `b93bd0920ee1ef9f5f20f188576b5935c99ba727`. La revisión se prepara en `feature/mendel-compact-confirmation`; se preservan los otros checkouts y sus cambios.

## Cambios

- Detalle de hasta 780px, resumen de comercio/persona/fecha/importe y metadatos esenciales. En escritorio, notas y respuesta se distribuyen en dos columnas; en móvil se apilan con tracks `minmax(0, 1fr)` y scroll del diálogo.
- Notas completas, sin interpretación automática, HTML ejecutable ni recorte de datos. El contenedor tiene scroll. Las dos clases de nota siguen separadas.
- Acción azul `Confirmar respuesta`, dentro de un formulario con respuesta explícita y comentario opcional. Se mantienen Pendiente, Autorizado y No autorizado; no se convierte por defecto un pendiente en autorizado.
- Historial e información de origen desplegables. La confirmación sigue siendo interna de FNET; no aprueba/rechaza en Mendel ni cambia el estado de pago.
- La asignación a todos los consumos se elimina del detalle. Solo queda un respaldo en la barra para resolver zonas faltantes cuando efectivamente existen filas sin zona; si la planilla/registro tiene todas las zonas, no se ofrece ese botón.
- Lectura del historial con estados de carga, resultado vacío confirmado y error distintos. Una consulta fallida nunca muestra simultáneamente `Sin respuestas registradas`. Reintento explícito de lectura, cancelación al cerrar y mensajes específicos para sesión vencida, falta de permiso y gasto no encontrado.

## Seguridad y límites

No cambia la API, SQL, autorización server-side, límites por zona, historial persistente, control de revisiones ni política de conflictos. No modifica PostgreSQL, Prisma schema, migraciones, n8n, integración Mendel ni tablas fuente. No crea decisiones o cuentas reales para verificar la interfaz. No agrega dependencias.

El error genérico de historial de la captura se reprodujo en la interfaz anterior. No se afirma una causa de servidor o base sin evidencia suficiente; esta revisión corrige la presentación engañosa del error y permite reintentar/identificar sesión o permisos. No declarar una reparación de infraestructura a partir de estas pruebas.

## Validación realizada

- Baseline real: 384/384 tests, 53 archivos. El primer intento aislado no ejecutó tests por EPERM al renombrar temporales; al ejecutar con los permisos necesarios pasó sin cambios de configuración del proyecto.
- Final: 403/403 tests, 55 archivos. Los 19 nuevos cubren presentación/render de React y lectura de historial: acción primaria, ausencia de asignación en el detalle, selección no automática, separación de estados/notas, notas extensas y escape HTML, no guardar gastos sin compartir, carga/errores/vacío, códigos HTTP y cancelación.
- Lint: 0 errores; los mismos cuatro warnings heredados en sytex-supply-control y sytex-sync.test.
- Build y `npx tsc --noEmit`: PASS. Compilación con URL ficticia PostgreSQL en puerto 1, no la base real.
- QA de navegador sobre componentes reales, en un arnés fuera de Git con gastos ficticios: error 503 simulado del historial, reintento sin POST, respuesta AUTORIZADO de prueba, reapertura e historial con actor/fecha/comentario. Ninguna aprobación ficticia en producción.
- Escritorio, viewport solicitado 1200x900: ancho de diálogo 780px; clientWidth/scrollWidth 1185/1185 por scrollbar clásico; botón azul rgb(33,89,199); sin asignación masiva en el detalle.
- Móvil, viewport solicitado 390x844: clientWidth/scrollWidth 375/375 por scrollbar clásico; diálogo 336.667px (left 19, right 355.667); cuerpo clientWidth/scrollWidth 321/321; botón dentro del diálogo; contenido final de nota presente. No afirmar clientWidth=390.

Los tests de render no certifican CSS: las medidas anteriores proceden del navegador. El arnés no certifica sesión/autorización en producción. La evidencia del despliegue y la verificación publicada debe comprobarse por separado; no se deriva de un build local exitoso.
