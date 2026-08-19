# Contexto funcional — FNET System Tracker

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
