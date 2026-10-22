# GUARDIAS-CUADRILLAS-01 — semana, relevo y cambios de integrantes

## Alcance y estado

Solicitud directa de Eugenia: mejorar Guardias, cargar dos técnicos por zona, calendario semanal o fechas escritas, corregir también el conteo existente y permitir reemplazos conservando historia.

- Rama local: `feature/guard-crews-handover`, desde `origin/main` `13952b114dc90316f33dadc2c010546fbe56c078` (Mendel publicado).
- Preflight limpio; baseline real: **403/403 tests, 55 archivos**.
- Estado: `IMPLEMENTED_LOCALLY`, pendiente de revisión y autorización de publicación/migración. No es una certificación de Producción.
- No se modifican Mendel, n8n, Sytex sync, MaxTracker, Prisma schema, dependencias ni migraciones anteriores.

## Auditoría → diseño → implementación

La pantalla, resumen y Excel anteriores enumeraban `date_from` y `date_to` inclusive mediante `daysBetween`. CTIC también incluía todo el día final, sin evaluar las 08:00. Eso convertía 14→21 en ocho fechas.

Se conserva `daysBetween` para fechas civiles/feriados y se introduce semántica de guardia **[inicio 08:00, relevo 08:00)** en Argentina. Las semanas de `ops_guard_weeks` se interpretan hasta `week_start+7` (lunes siguiente), sin reescribirlas. Un registro con inicio=fin queda visible con advertencia y cero duración, no se inventa otra fecha.

La pantalla muestra zona, dos integrantes, calendario con siete días resaltados y fin de relevo delineado, fechas escritas, resumen previo y botón único Guardar cuadrilla. Las tarjetas muestran tramos y un formulario de reemplazo (sale/entra, fecha/hora, motivo). Selector de zona y datos compartidos por servidor; no localStorage como base persistente. El reloj actualiza cada 30 segundos y CTIC refresca sus lecturas por minuto.

La procedencia del selector es el catálogo real ya existente de operaciones: `asignado_a`, `usuario_colaborador` y contextos de formularios sincronizados, filtrados por proyectos autorizados. **Se persiste el nombre de catálogo**, no un ID personal inventado. No se infieren equivalencias entre email y nombre. Si el técnico no está en el catálogo o es ambiguo, se rechaza; faltaría normalizar un catálogo oficial estable en una etapa separada si fuera necesario. No se realiza integración BizFlow live.

Las cargas anteriores sin zona/pareja se conservan en una sección histórica. Admin puede seleccionar explícitamente dos del mismo período y asignarles zona; la vinculación valida técnicos/fechas y no duplica sus días en resumen/Excel. No se reconstruyen parejas automáticamente. Las fuentes vinculadas quedan bloqueadas para edición; la corrección manual de fechas no vinculadas audita ambos estados. No se borra historial mediante la API.

## Persistencia, seguridad y transacciones

Migración **nueva y aditiva, solo preparada**: `prisma/migrations/20261018_add_guard_crews/migration.sql`.

- `ops_guard_crews`: cabecera, zona, inicio/fin `TIMESTAMPTZ`, integrantes iniciales JSONB, fuentes históricas, versión, timestamps, autor y clave/hash de idempotencia.
- `ops_guard_crew_changes`: antes/después, fecha efectiva y registrada, motivo, actor, clave/hash de idempotencia; UNIQUE guardia+instante efectivo.
- Solo relaciones a `app_users` y a la nueva cabecera; ninguna FK hacia tablas Sytex.
- Ambas se registran en el preparador existente. No cambia un checksum de migración aplicada. **Publicar esta rama ejecutaría una migración adicional en el predeploy actual: requiere autorización específica antes de merge/deploy.**
- Una transacción Prisma contiene bloqueo asesor global, validación de conflictos, inserción histórica, incremento de versión y auditoría `ops_events`. Reintentos idénticos son idempotentes. Se rechaza reutilizar la clave con otro contenido o autor.
- El bloqueo serializa escrituras de guardias, también préstamos entre zonas. No se admiten superposiciones por zona o técnico, ni conflictos con cargas históricas no vinculadas. El relevo adyacente sí se admite.
- A+B → A+C → C+D produce tres segmentos. Los cambios son append-only por aplicación; no hay un trigger ni se afirma inmutabilidad frente a SQL administrativo fuera de la aplicación.
- Admin o coordinador con proyectos explícitos puede operar en sus zonas. El nuevo módulo falla cerrado cuando al coordinador le faltan permisos explícitos; no se corrige aquí el acceso general de otros módulos. CTIC solo consulta. Las cargas históricas sin zona no se exponen a coordinadores.
- El endpoint mantiene sesión real, validación estricta, límite de 64 KiB, control de origen y `private, no-store`. La falta de tablas se informa y deshabilita Guardar, sin guardar solo en el navegador.

## Conteo y límites de interpretación

Resumen y Excel unen intervalos por técnico, evitando doble crédito por registros duplicados. Cada integrante tiene su cobertura completa: una semana A+B produce siete días para A y siete para B; no 3,5 cada uno. Producción de tarea, scoring, horas de jornada y reglas outside-hours no cambian.

Un relevo a otra hora muestra el tiempo real de cada integrante en días equivalentes de cobertura (por ejemplo 12 h = 0,5); se etiqueta expresamente que **no es una liquidación ni una política de pago**. No se crean montos, descuentos ni escrituras de nómina. Los feriados no se duplican si caen en fin de semana.

## Pruebas

Se agregan casos para semana de siete días/dos de fin de semana, 08:00 Argentina, cambio de mes/año, cobertura parcial y duplicada, calendario/fechas escritas, historial A+B→A+C→C+D, versiones y timestamps repetidos, catálogo real, permisos/scope, CTIC, origen/validación HTTP, idempotencia, vinculación histórica y rollback completo ante fallo de auditoría.

La integración SQL usa PGlite local, con la migración real y datos sintéticos descartables. No es una prueba contra Railway ni contra su servidor PostgreSQL. La UI se verifica usando los componentes reales en un arnés local fuera del repositorio, con API de prueba en memoria y datos ficticios; no se presenta como una lectura/guardado real en Producción.

Validación final ejecutada al cerrar la entrega (19/10/2026):

- `npm test`: **435/435 PASS, 59 archivos** (baseline 403/403; 32 casos adicionales netos).
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS, cero errores; cuatro advertencias preexistentes en `sytex-supply-control.tsx` y `sytex-sync.test.ts`.
- `npm run build`: PASS, Prisma Client generado y compilación Next/TypeScript completa; conexión de prueba deliberadamente inaccesible `127.0.0.1:1`, sin cargar `.env.local` real.
- Revisión de diff sin errores de espacios (reconociendo CRLF de Windows). `schema.prisma`, `package.json`, `package-lock.json` y las migraciones históricas no cambiaron.

Archivos: presentación en `guard-duty.tsx`, `guard-crew-board.tsx`, `guard-crews.module.css` y `use-guard-clock.ts`; contratos `operations.ts`/`guard-crew.ts`; reglas `guard-domain.ts`; persistencia `guard-crew-store.ts` y servicios `guard-duty.ts`/`guard-crews.ts`; endpoint existente `operations/guard/route.ts`; mensajes `operations-common.tsx`; migración nueva y registro/inventario del preparador. Se agregan pruebas de UI, SQL, servicios y HTTP, y se ajustan los casos históricos de conteo. Documentación actualizada: contexto, contratos/CCR y este informe. Ningún archivo de Mendel se modificó.

## Evidencia visual y límites

Navegador real, arnés local sin autenticación ni conexión a Railway. Calendario: seleccionar 14/10 propone 21/10 y siete días. La tarjeta muestra la pareja inicial y su reemplazo, con las 08:00 conservadas.

Mediciones en iframes de ancho controlado (no Chrome DevTools/device emulation, no certificación del shell publicado):

| Ancho iframe | html.clientWidth | html.scrollWidth |
|---|---:|---:|
| 375 | 360 | 360 |
| 390 | 375 | 375 |
| 412 | 397 | 397 |

La diferencia de 15 px es la barra vertical del navegador de prueba. Igualdad client/scroll verificada también con el calendario y reemplazo abiertos a 375. No se oculta overflow documental ni se truncaron integrantes/botones para aparentar que entra.

Pendientes antes de certificar publicado: autorización explícita de las dos tablas y despliegue, CI/revisión, verificación con cuentas reales Admin/coordinador/CTIC, lectura de las cargas históricas reales y prueba manual de escritorio/celular. No crear ni modificar guardias reales como prueba sin autorización específica.

## Protección de entornos

`DATABASE_WRITTEN=NO` (entornos reales), `MIGRATIONS_RUN=NO` (Railway), `LIVE_INTEGRATIONS_USED=NO`, `PRODUCTION_TOUCHED=NO`, `COMMIT=NOT_CREATED`, `PUSH=NOT_RUN`, `DEPLOYMENT=NOT_RUN`.

`NEXT_ACTION=WAIT_FOR_TECHNICAL_REVIEW_AND_RELEASE_AUTHORIZATION`.

## Revisión y autorización de publicación — 2026-10-22

Eugenia autorizó explícitamente revisar e integrar Guardias y, solo si pasa las validaciones, publicar y crear las dos tablas internas en la producción de Leo. Los estados de no autorización anteriores se conservan como histórico; esta autorización no permite modificar guardias reales como prueba, cambiar permisos de usuarios, integrar BizFlow live ni alterar tablas Sytex.

Revisión del SQL: únicamente CREATE TABLE de `ops_guard_crews` y `ops_guard_crew_changes`, índices y restricciones; sin backfill ni ALTER/UPDATE/DELETE de tablas existentes. Las FK apuntan a `app_users` y a la nueva cabecera, nunca a tablas Sytex. La aplicación conserva creación/reemplazo, auditoría y control de versión dentro de una transacción Prisma, además del bloqueo asesor compartido con las correcciones históricas.

Se repitieron realmente las pruebas del árbol local previo a integrar main: **435/435**, 59 archivos. El primer intento aislado falló antes de descubrir casos por EPERM al renombrar temporales; la repetición autorizada fuera de ese aislamiento pasó sin cambiar Vitest. Base de conexión deliberadamente inválida y ninguna `.env.local` en el checkout; SQL ejecutado solo en PGlite con datos sintéticos.

Siguiente paso de esta revisión: integrar main actual (que contiene Insumos/Mendel PR #55), repetir validaciones completas y CI antes de fusionar. No se declara todavía despliegue ni migración productiva ejecutados.
