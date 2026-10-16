# MENDEL-02C — Bandeja por zonas y confirmaciones internas

Fecha: 2026-10-16 (Argentina). Entrega autorizada por la usuaria para el repositorio de Leo y su FNET publicado. La evidencia final de CI, merge y deployment se conserva en el PR de esta entrega; no confundir validaciones locales con certificación de producción.

## Alcance

- `/compras/bandeja`, enlace desde menú desktop/mobile y desde Compras.
- Desplegable de zonas, búsqueda por palabras con normalización de acentos/mayúsculas, calendario con selección de día/rango inclusivo, mes/año y accesos rápidos. Fechas civiles y operación Argentina, sin desplazamientos horarios manuales.
- CSV y XLSX reales preparados en memoria del navegador por Admin. No se guarda ningún directorio personal en Git. Una asignación visual de zona abarca todos los consumos de la misma persona exacta.
- Compartir los gastos filtrados es una acción explícita de Admin que persiste sus datos y notas en tablas propias de FNET. Se requiere ID real de transacción y zona; nunca se inventan identificadores. Batches limitados a 64 KiB; el avance parcial se informa y el reintento no duplica transacciones.
- Tabla, detalle de notas completas con scroll, exclusión reversible de Eugenia Salto / Salto Eugenia y prints PNG por zona. La firma es solo un filtro visual, no una prueba de aprobación.
- Confirmación interna: PENDIENTE, AUTORIZADO, NO_AUTORIZADO. Se registra la cuenta autenticada, fecha del servidor, comentario y revisión del gasto; el actor no se acepta desde el cliente.
- Historial por agregación, sin endpoint de borrado/edición de eventos. Una respuesta posterior conserva la anterior. Idempotencia por request UUID y rechazo de conflicto de revisión o respuesta más reciente.
- Si cambia el gasto compartido, la confirmación anterior permanece en el historial y debe reconfirmarse. No se hereda autorización para un importe/dato nuevo.

## Seguridad y separación de fuentes

La API `/api/mendel/zone-control` usa sesión real, bloqueo CTIC y autorización propia por zona. No hereda el comportamiento global de una cuenta sin proyectos del módulo histórico. Un coordinador sin habilitaciones ve cero gastos; no puede publicar CSV, conceder accesos ni consultar/responder otra zona. El permiso se vuelve a comprobar al guardar; la transacción bloquea el gasto y el acceso relevante durante la respuesta. Solo Admin habilita cuentas reales, activas y no CTIC.

GET no-store; POST valida origen, cuerpo por streaming (64 KiB), esquema estricto y límites de campos. SQL constante y parametrizado. El historial se lee dentro de transacción para impedir cambios de zona durante la comprobación. La API no aprueba/rechaza en Mendel, no modifica estados Sytex, no aplica reglas automáticas de kilómetros/comida ni descuentos salariales.

## Base y despliegue

Nueva migración aditiva `20261016_add_mendel_zone_control`:

- `fnet_mendel_zone_expenses`: snapshot por ID de transacción, zona, revisión, publicador y timestamps.
- `fnet_mendel_zone_access`: cuenta/zona, habilitación, autor del cambio y timestamp.
- `fnet_mendel_zone_decisions`: eventos de respuesta con request único, revisión, decisión, comentario, actor y timestamp.

FK solo a `app_users` y tablas nuevas propias. Ninguna FK a Sytex. Sin ALTER/DROP/DELETE ni cambios de schema.prisma o migraciones aplicadas. El preparador registra la nueva migración con los controles de checksum/transacción existentes.

El servicio correcto es FNETSystemTracker de `sublime-mindfulness` en production, repositorio `LeoCampos2504/FNETSystemTracker`. No utilizar el Railway antiguo `miraculous-learning`. Cambiar el pre-deploy a `npm run db:prepare-app -- --migrations-only`: prepara tablas pero **no** llama a `importInitialSupplySources`. El comportamiento del comando local sin ese flag se conserva. No ejecutar `db push`, `db pull`, migraciones globales, bootstrap de usuarios ni sincronizaciones.

La copia de entrega parte de main `c0023326b1deb12a6f3d0167e4db638c7c8f89d4`, rama `feature/mendel-zone-confirmations`. Se excluyeron los cambios pendientes de Claude MENDEL-02A/R1 y su SQL no habilitado. La copia anterior y su servidor local se preservan.

## Verificación

- Vitest real: suite general y ejecución explícita de los 16 casos nuevos API/SQL; PGlite con tablas y personas sintéticas, sin usar Railway. El resultado estructurado de la suite final y el conteo se adjuntan en el PR.
- Build, TypeScript después del build y lint ejecutados con URL PostgreSQL ficticia en puerto 1. Cuatro warnings preexistentes en sytex-supply-control y sytex-sync.test, sin errores de lint.
- Browser QA del componente React real en un arnés fuera del repositorio: combinación NOA + palabra clave + rango invertido 15/10→10/10 da una sola fila correcta; guardar respuesta muestra autor e historial. Sin llamadas a Mendel/Railway ni datos ficticios en producción.
- Mobile: viewport solicitado 390x844; `innerWidth=390`, clientWidth/scrollWidth=375 por scrollbar clásico. Sin overflow documental; detalle con scroll interno (clientHeight 677, scrollHeight 2658); calendario contenido (right 359.667). No presentar esos 375 como medición de 390 clientWidth.
- La creación de tablas y la carga autenticada en producción se verifican después del deployment. No aprobar gastos ficticios en la base real. La primera carga real y habilitación de coordinadores la realiza Admin.

## Riesgos preexistentes

`npm audit --omit=dev` el 16/10 informa 5 paquetes de severidad alta, 0 críticos: prisma/@prisma/config/deepmerge-ts, mysql2 y source-map-js (dependencias heredadas). No se agregan ni actualizan dependencias en esta entrega. Los casos informados afectan grafos recursivos de configuración, protocolo MySQL y mapas de fuentes; no se introducen conexiones MySQL ni carga de configuración/mapas externos. Esto no certifica ausencia de exposición: su remediación merece una tarea separada y no debe ocultarse. No ejecutar `npm audit fix --force`.

Los snapshots pueden contener notas personales. No hay exportación automática a terceros, no se loguean notas y Admin debe revisar destinatarios al habilitar zonas/compartir PNG. La política de retención y archivo de gastos queda pendiente; no se implementó borrado masivo.

## Operación y aceptación

1. Entrar en el FNET publicado con la cuenta real; abrir **Mendel por zonas**.
2. Admin carga CSV y Excel de zonas; revisa los no asociados y usa filtros.
3. **Compartir N gastos filtrados** guarda solo ese conjunto; no reemplaza ni borra todo el registro.
4. En **Permisos de coordinadores por zona**, elegir una cuenta real y la zona compartida; habilitarla explícitamente. No se asignan permisos por el nombre del Excel.
5. El coordinador entra en la misma URL, ve sus zonas, abre el gasto y guarda la respuesta. Admin puede filtrar pendientes/autorizados/no autorizados y consultar el historial.
6. La aprobación oficial de Mendel continúa independiente. La app no inventa tickets ni comprueba automáticamente el PDF/foto.

Rollback de código: volver al build anterior de Railway sin borrar las tres tablas nuevas ni el historial. No revertir SQL con DROP. Falta certificación manual del flujo real multiusuario hasta que Admin publique gastos y habilite cuentas.
