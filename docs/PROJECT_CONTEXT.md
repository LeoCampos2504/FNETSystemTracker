# Contexto funcional — FNET System Tracker

## 2026-10-29 — Control de auditorías de seguridad física (local)

Preparado /auditorias con consulta para todos los usuarios activos y edición/importación/adjuntos solo ADMIN, según confirmación de Eugenia. Usa su planilla de 66 personas, historial persistente por registro, archivos privados, fechas a tres meses con excepciones y avisos dentro de la pantalla. Descarga Excel completo/filtrado con fechas nativas y CUIL enmascarado para lectores. Requiere tres tablas internas nuevas; la migración está preparada y NO ejecutada. No hay publicación ni carga real. El rol Analista permanece fuera de alcance. Ver [diseño, seguridad, pruebas y habilitación pendiente](reports/PHYSICAL_AUDITS_01.md).

## 2026-10-29 — Importación autoservicio Mendel (local, pendiente de publicación)

Corregido el flujo que actualizaba solo existentes y descartaba los nuevos al volver al control: Guardar CSV en FNET procesa existentes y nuevos con zona de todo el archivo, sin depender de filtros/firmas, conserva CSV y asignaciones si hay pendientes y verifica persistencia. Inserción newOnly protegida en servidor, sin sobrescribir registros concurrentes ni autorizaciones. Sin migración ni cambio de permisos. Ver [causa, alcance, validación y operación](reports/MENDEL_SELF_SERVICE_IMPORT_20261029.md). Esta corrección todavía no está publicada; se conserva el histórico siguiente.

## 2026-10-28 — Descuentos, notas de auditoría y actualidad de Mendel (local)

CSV actual verificado: 507 filas hasta el 28/10, sin pérdida de filas del lector; la vista publicada consultaba otro registro compartido y excluía firmados. Corregida localmente la omisión de Notas de auditoria y agregado Solo descuentos incluyendo firmados, fecha del último gasto cargado y Rendido Sí/No editable en ambos sentidos con historial. No hay conexión automática Mendel ni importación real realizada. Sin migración, Analista sigue pausado. Ver [diagnóstico, semántica y validación](reports/MENDEL_DISCOUNTS_FRESHNESS_20261028.md).

## 2026-10-27 — Revisión manual de comprobantes Mendel (local, no publicada)

Analista queda pausado en su checkout, sin mezclarlo con este ajuste aislado. Admin puede marcar/deshacer OK manual de comprobantes de gastos compartidos, con actor, fecha e historial en ops_events; no modifica CSV, aprobación ni Mendel. Estado compartido por cuenta/PC y usado en filtros/prints, con revisión si cambia la evidencia. Sin tablas nuevas ni migraciones. Ver [alcance y validación](reports/MENDEL_RECEIPT_MANUAL_20261027.md). Publicación no ejecutada.

Continuación: PR #57 publicado y verificado en producción el 27/10/2026. A pedido de Eugenia se simplifica la presentación: **Comprobante OK / Deshacer OK** directamente en fila/tarjeta, sin abrir un formulario, reutilizando el mismo control protegido. Pruebas locales 505/505; la publicación de esta simplificación se registra en el PR siguiente. Analista sigue pausado y no incluido.

## Continuación 2026-10-22 — Guardias autorizadas para revisión y publicación

Eugenia autorizó explícitamente integrar Guardias con main actual y, solo si pasan las validaciones, publicar con sus dos tablas internas nuevas. La implementación histórica siguiente se conserva; el estado final depende de CI y del despliegue verificado, no solo de la autorización. No se permite crear guardias reales como prueba ni cambiar permisos de usuarios. Ver la continuación del informe GUARDIAS_CUADRILLAS_01.

## Actualización 2026-10-18 — GUARDIAS-CUADRILLAS-01 (local, no publicada)

Preparada en `feature/guard-crews-handover`: guardias por zona con dos integrantes, selector semanal visual y fechas escritas, relevo a las 08:00 Argentina y reemplazos efectivos con historial. Del 14 a las 08:00 al 21 a las 08:00 son siete días (cinco hábiles/dos de fin de semana si no hay feriados). El conteo histórico se corrige al leer y exportar, sin backfill ni modificación automática de filas reales. Las semanas antiguas lunes–domingo terminan el lunes siguiente a las 08:00; las cargas individuales no se emparejan automáticamente.

Los reemplazos conservan los tramos previos, actor, motivo y fecha registrada/efectiva; la escritura y auditoría son una única transacción. Las cargas antiguas pueden vincularse explícitamente de a dos por Admin sin borrarlas. No existe pareja permanente. Los relevos parciales muestran cobertura temporal, sin definir importes ni una política salarial nueva.

Necesita dos tablas internas nuevas (`ops_guard_crews`, `ops_guard_crew_changes`). Se preparó la migración y su registro en el preparador, pero **no se ejecutó sobre Railway, no hubo commit/push/deploy y todavía no está disponible en Producción**. No usa BizFlow/Sytex live, no cambia n8n ni Prisma schema. Ver [alcance, pruebas, limitaciones y publicación pendiente](reports/GUARDIAS_CUADRILLAS_01.md). La certificación histórica de P1-T02 se conserva como antecedente; esta revisión requiere su propia verificación publicada.

## Actualización 2026-10-22 — Insumos múltiples + evidencia CSV Mendel (local, NO publicado)

Se implementaron controles por botones para Intra y número de factura común para hasta 50 insumos, con permisos existentes, versiones por registro, auditoría y guardado atómico. Las notas y archivos existentes se conservan; adjuntar un mismo PDF a varios registros no forma parte de este ajuste. Mendel agrega refresco explícito de notas/evidencia de gastos compartidos, incluso los ocultos, sin alterar respuestas de coordinación, e informa las contradicciones entre Hay ticket y Nombre PDF.

Pruebas locales finales: 460/460. Build pendiente: Turbopack falló al iniciar un proceso CSS; Webpack compila pero detecta el export preexistente `getHealthStatus` en `/api/health`. No se modificó ese endpoint, no se desactivaron verificaciones y no hubo publicación. La rotación de credenciales por el incidente Railway sigue pendiente, no se ejecutó. Detalles, archivos y límites en [informe del ajuste](reports/SUPPLY_BULK_AND_MENDEL_CSV_REFRESH_20261022.md). Se preserva todo el contexto histórico siguiente.

**Continuación autorizada:** Eugenia pidió publicar el ajuste. Se cerró el export no admitido de `/api/health` manteniendo intacta su respuesta. Pruebas 460/460, lint sin errores y build alternativo Webpack completo PASS; Turbopack local sigue fallando al iniciar su proceso CSS en Windows. CI debe pasar con el comando de build habitual antes de fusionar. La publicación productiva y la autenticación del conector Railway requieren comprobación independiente; no se afirma deploy exitoso ni credenciales rotadas. Ver el cierre posterior del mismo informe.

## Actualización 2026-10-19 — MENDEL-INTRA-01 (implementado localmente, publicación autorizada)

El Registro de compras `/compras` prepara dos confirmaciones manuales independientes por transacción: **Subido a Intra** y **Descargado en Intra**, cada una Sí / No / Sin confirmar. Antes, la columna mostraba `Pendiente` fijo. Los controles conservan el acceso global existente de Admin y no autorizan gastos en Mendel ni suben archivos/mueven stock oficial.

La persistencia y el historial reutilizan `ops_events` con una acción y clave de recurso propias. Se guardan autor, fecha, estado anterior/nuevo, versión y huella de los datos de compra; no requiere tablas nuevas, migraciones ni cambios de Prisma. Si cambia un dato relevante de la compra se pide revisión, sin borrar lo ya confirmado. Ver [diseño, límites y evidencia](reports/MENDEL_INTRA_01.md).

Trabajo aislado en `feature/mendel-intra-manual`, basado en `13952b1`. No incluye ni modifica las mejoras pendientes de Guardias. Eugenia autorizó commit, push, PR, fusión y despliegue de este ajuste. Al preparar esta entrega, la publicación y su comprobación productiva siguen pendientes; las pruebas locales pasan 434/434. No se modificaron compras reales. La autorización no incluye guardar confirmaciones reales como prueba ni agregar migraciones.

## Actualización 2026-10-16 — MENDEL-02C

El texto histórico del prototipo se preserva debajo. La bandeja `/compras/bandeja` agrega control por zona y confirmaciones internas persistentes, con acceso real Admin/coordinador. No es una integración automática con Mendel: Admin prepara CSV/XLSX en el navegador y comparte explícitamente los gastos filtrados. Los coordinadores solo acceden a zonas habilitadas para su cuenta por Admin; sin habilitación no ven datos. Respuestas: PENDIENTE, AUTORIZADO y NO_AUTORIZADO, con autor, fecha e historial. No modifican aprobaciones oficiales ni descuentos. Ver [informe y operación](reports/MENDEL_02C_ZONE_CONFIRMATIONS.md); la evidencia final de CI y despliegue se registra en el PR de esta entrega.

La publicación usa preparación `--migrations-only` para no repetir importaciones iniciales de Sytex/Mendel. Se agregan tres tablas `fnet_mendel_zone_*`; no se cambian Prisma schema, migraciones históricas, n8n ni tablas fuente. Las habilitaciones a cuentas reales y la publicación de gastos son decisiones explícitas de Admin, no tareas automáticas del despliegue.

### Revisión de interfaz MENDEL-02C-R1

El detalle compacto prioriza notas y respuesta de coordinación con botón azul `Confirmar respuesta`. La asignación masiva de zona ya no forma parte del detalle; solo se ofrece un respaldo para filas sin zona. Historial e información de origen son desplegables y los errores de consulta no se presentan como un historial vacío. Se mantiene íntegra la separación entre confirmación FNET y aprobación oficial de Mendel, sin nueva migración ni cambio de permisos. Ver [revisión, alcance y evidencia local](reports/MENDEL_02C_R1_COMPACT_DETAIL.md); la publicación requiere su verificación independiente.

App web/PWA interna para técnicos de campo de FNET. Consume datos de coordinación
y trabajo de campo; **el trabajo técnico real se completa en Sytex**, esta app
no lo reemplaza.

## Roles

**TECHNICIAN** — solo consulta sus propios datos: tareas del día, preventivos,
correctivos, guardias, vehículo asignado, KPIs, notificaciones. Puede abrir un
sitio en Google Maps. No modifica tareas desde acá.

**COORDINATOR** — ve sus zonas y técnicos; asigna técnicos a tareas; programa
tareas para un día; reprograma pendientes; administra/asigna guardias; ve
vehículos; cambia estados de tareas según el flujo interno; consulta
cotizaciones de sus zonas; ve KPIs de sus técnicos, cronograma diario y
rutas/sitios que recorren las cuadrillas; recibe notificaciones.

**ADMIN** — acceso global de solo lectura a zonas, coordinadores, técnicos,
tareas, guardias, vehículos, KPIs y cotizaciones.

## Fuentes externas futuras (no implementadas en el prototipo)

```
SYTEX      \
BIZFLOW  --- n8n ---> base propia ---> FNET System Tracker
MAXTRACKER /
```

- **Sytex**: fuente oficial de tareas y cotizaciones.
- **BizFlow**: coordinadores, zonas, técnicos, asignaciones organizativas.
- **MaxTracker**: vehículos (patente, marca, modelo, km, estado, ubicación futura).

El prototipo trabaja con mocks y contratos estables. El modelo contempla
`externalId` / `externalSource` / `sourceUpdatedAt` en las entidades que algún
día sincronizarán, para no tener que romper contratos más adelante.

## Tareas

Tipos: `PREVENTIVE`, `CORRECTIVE`. Estados: `OPEN → IN_PROGRESS → IN_REVIEW →
SENT → REJECTED | APPROVED_WITH_PENDING | APPROVED`.

Cada tarea contiene: id interno, `externalId`/`externalSource`, task code, form
code, tipo, descripción, prioridad, criticidad, estado, fecha programada,
fecha/hora, sitio, código de sitio, zona, coordenadas, técnicos asignados
(principal/colaborador), llegada, salida, e historial de rechazos.

Las cuadrillas normalmente son de dos técnicos (`PRIMARY` + `COLLABORATOR`),
pero excepcionalmente una tarea puede tener un solo técnico. Cada tarea
completada suma +1 para cada técnico participante.

## Correctivos y prioridades

Los correctivos tienen prioridad sobre los preventivos. Criticidad: `NORMAL`,
`URGENT`.

**Regla de negocio futura (documentada, no implementada todavía):** si una
cuadrilla está en un `PREVENTIVE` y aparece un `CORRECTIVE` `URGENT`, el
preventivo se interrumpe operacionalmente y el correctivo urgente pasa
primero. Si aparece un `CORRECTIVE` `NORMAL`, la cuadrilla puede terminar el
preventivo actual y después atender el correctivo.

## Programación

Los preventivos pueden existir durante todo el mes; el coordinador programa el
día en que se realizan. La pantalla principal diferencia correctivos de
preventivos. Los pendientes de días anteriores se conservan para poder
reprogramarlos.

## Guardias

Normalmente corresponden a una cuadrilla, pero pueden modificarse y existir
cuadrillas temporales con técnicos mezclados. Cambios de guardia: NOA
usualmente miércoles, el resto del país usualmente viernes — **esto es un
patrón habitual, no una restricción rígida**, puede haber excepciones y no
debe codificarse como tal.

Horario laboral normal: 08:00–18:00. Para determinar si una tarea pertenece a
una guardia **no alcanza con "después de las 18"**: hay que comparar el
intervalo real de la tarea contra el intervalo registrado de la guardia
(`Guard.startAt` / `Guard.endAt`).

Debe poder conocerse: cuadrilla de guardia, inicio/fin, correctivos realizados
durante la guardia, urgentes, duración promedio, rendimiento de guardia
(`GuardPerformance`).

## Vehículos

Se asignan normalmente a un técnico de la cuadrilla y pueden cambiar. Datos:
id, patente, marca, modelo, kilometraje, estado. Existe historial conceptual
de asignaciones (`VehicleAssignment`). Más adelante, datos desde MaxTracker.

## Coordinación y zonas

Un coordinador puede administrar varias zonas. Un técnico tiene normalmente
una zona principal pero puede ser prestado temporalmente a otra
(`onLoanZoneId`).

Navegación deseada: Coordinadores → Coordinador → Zonas → Zona → Sitios →
Técnicos. Debe poder abrirse el perfil completo de un técnico con sus tareas,
vehículo, guardias y KPIs.

## Cotizaciones

Estados: `OPEN → IN_PROGRESS → WAITING → COMPLETED_WITH_PENDING → COMPLETED`.
"En bandeja" = `OPEN`. "Completadas" = `COMPLETED`. La pertenencia al
coordinador se determina principalmente por zona y proyecto. No es prioridad
P0 del prototipo; a futuro se quiere cantidad por coordinador, listado,
histórico, tiempo promedio en bandeja y rendimiento de coordinadores.

## KPIs de técnicos

Contratos necesarios: tareas completadas, preventivos completados, correctivos
completados, tareas pendientes, % de cumplimiento, % de cumplimiento
preventivo, rechazos, duración promedio por tarea, productividad diaria,
ranking, correctivos en guardia, urgentes de guardia, tiempo promedio en
tareas, tareas por día.

Reglas:
- Una tarea con Juan + Pedro suma +1 para cada uno.
- Duración = `departureAt - arrivalAt`.
- Cada evento de rechazo cuenta (rechazado → corregido → rechazado → aprobado
  ⇒ `rejections = 2`).
- Cumplimiento (fórmula propuesta para el prototipo): `tareas programadas
  completadas / tareas programadas * 100`.
- Cumplimiento preventivo: `preventivos programados completados / preventivos
  programados * 100`.
- Pendiente: `scheduledDate <= fecha consultada` y la tarea no está
  completada/aprobada.

## Rutas

Los sitios tienen coordenadas. A futuro: mapa, cálculo de recorrido,
distancia, tiempo, km, origen desde la ubicación actual del técnico, y
reordenar la ruta cuando aparece un correctivo urgente. **Para P0 no se
implementa optimización** — solo el contrato de sitio/coordenadas y un enlace
a Google Maps construido a partir de `latitude`/`longitude`
(`src/lib/maps.ts`).

## Notificaciones

Casos: nueva tarea, correctivo urgente, cambio de guardia, cambio de
vehículo, cambio de cronograma/ruta. En P0 existe el contrato `Notification`;
el push real (PWA) queda para más adelante.

## Auditoría

Toda mutación futura debe poder auditarse: `actor`, `action`, `entity`,
`entityId`, `before`, `after`, `timestamp` (contrato `AuditLog`).

## Prioridades del prototipo (24 horas)

**P0**: cronograma de tareas del día · correctivos y preventivos separados ·
cuadrillas · correctivos urgentes destacados · KPIs de técnicos · guardias ·
perfil de técnico.

**P1**: vehículos · zonas/coordinadores · notificaciones internas ·
reprogramación visual · cotizaciones básicas · Google Maps.

**P2 (después del prototipo)**: integración real Sytex/BizFlow/MaxTracker ·
sincronización n8n · optimización real de rutas · GPS en tiempo real · push
notifications reales · analytics avanzados de cotizaciones.
