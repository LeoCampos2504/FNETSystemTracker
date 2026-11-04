# Combustible: cargas individuales y control OK por operación

Estado: IMPLEMENTED_LOCALLY. Publicación autorizada por Eugenia el 04/11/2026: commit, push, PR, fusión y despliegue en FNET de Leo solo si pasa CI, sin migraciones ni cargas reales de prueba. Resultado de publicación y verificación real pendientes; se registrarán en el PR.

## Pedido y comportamiento

Control de sitios → Combustible conserva una fila por carga, ordenada por fecha descendente, aunque se repita el sitio. Mantiene registros de preventivos, correctivos y otros formularios disponibles en las fuentes guardadas. No agrupa el listado por sitio ni reduce su historial a la última carga. El detalle también pagina todas las cargas, en lugar de truncar a doce.

Un botón **Marcar OK / ✓ OK** permite controlar cada carga sin formulario. Volver a tocarlo desmarca. La confirmación se guarda en el servidor, es compartida entre equipos, conserva autor/fecha e historial y suma solamente las cargas OK por operación (NON, BAS, LS, etc.). Los totales respetan los filtros actuales, combinan tipos de tarea de una misma operación y conservan tres decimales. Un registro sin litros no inventa una cantidad. El OK es revisión interna, no autorización externa ni movimiento de stock.

## Causas confirmadas en código

- `site-control.ts` descartaba **todas** las filas n8n de un formulario si había al menos una carga derivada de sus respuestas Sytex. Esto podía eliminar eventos distintos.
- `fuelLoadsFromAnswers` sumaba cantidades por formulario/repetición, perdiendo la individualidad de varias respuestas de carga.
- `siteTopic` exigía la palabra combustible en la pregunta, perdiendo variantes como «Litros cargados» dentro de un grupo de combustible.
- Un lote sin insumos no se guardaba aunque tuviera respuestas de combustible o mantenimiento. Se corrige la condición en la sincronización y en su persistencia; no se ejecutó la sincronización real.
- Fallos de lectura de las dos fuentes de combustible se convertían en listas vacías. Ahora se informa el fallo de consulta; no se presenta una lectura incompleta como completa.

La conciliación entre fuentes ya no elimina por formulario/sitio: solo consolida una coincidencia única con mismo formulario, sitio, instante, litros y mediciones, con al menos un nivel/horómetro informado. Las coincidencias ambiguas se conservan y se advierten como posibles duplicados; el total general se indica provisional. No se fusionan automáticamente cantidades diferentes ni eventos repetidos de la misma fuente.

## Fechas y cobertura

Se usa una fecha de carga explícita del grupo cuando es inequívoca. Cuando solo existe la última edición del reporte, se muestra **Fecha del reporte**: no se inventa una fecha física de carga. Horas y filtros se interpretan en Argentina. Una fecha civil permanece civil. Se mantienen los filtros y la opción Todas las fechas.

**Esto no certifica que esté descargado todo el histórico de Sytex.** La sincronización existente consulta proyectos configurados y el mes actual más dos meses cerrados. Los registros anteriores que ya están guardados siguen disponibles, pero no se hizo backfill, lectura de producción ni relevamiento de todos los formularios externos. Los grupos de insumos comprados, capacidad del tanque, aceite y otros fluidos no se convierten arbitrariamente en combustible cargado. Formularios multisitio sin correspondencia por evento requieren evidencia específica antes de asignar sus litros a un sitio.

La vista Insumos conserva su propósito de materiales declarados; el control cronológico de cargas está en **Control de sitios → Combustible**, como precisó la usuaria. No se transforman automáticamente compras de combustible en cargas realizadas.

## Persistencia, permisos y alcance

- Reutiliza `ops_events`, sin tablas ni migraciones nuevas. Cada cambio es un evento inmutable `FUEL_REVIEW`.
- Endpoint protegido `/api/operations/fuel-review`, sesión real y control de origen. ADMIN/COORDINATOR dentro del alcance existente; CTIC excluido. La carga y su proyecto se resuelven en el servidor; no se aceptan litros/proyecto enviados por el cliente.
- Bloqueo por recurso y versión dentro de una transacción. La versión prevalece sobre la fecha de inicio de una transacción para ordenar cambios concurrentes.
- Si cambia el sitio, fecha, cantidad o evidencia de origen, el OK anterior deja de aplicarse y debe revisarse de nuevo. Un envío con hash o versión obsoletos falla.
- No se modificaron tablas Sytex/n8n, datos reales, roles, secretos ni Railway. No se ejecutaron migraciones, sync, commit, push o despliegue.

## Validación

Base real de código: `origin/main` 577079f3a96429db15f761dc96a48be00fb07822. Rama local `fix/fuel-loads-per-event`, árbol inicial limpio. Baseline: 548/548, 79 archivos. Pruebas con datos ficticios y PostgreSQL PGlite en memoria; DATABASE_URL apuntó a un destino local inválido.

Verificaciones finales: **573/573 pruebas**, 83 archivos; TypeScript sin errores; ESLint sin errores (cuatro advertencias preexistentes); `git diff --check` correcto considerando los CRLF existentes. Los casos nuevos cubren cargas repetidas y de distintas fuentes, fechas operativas, lotes sin insumos, totales OK reversibles, persistencia SQL, conflictos de versión, cambios de evidencia, alcance, sesión y origen de las escrituras. La prueba manual real y la publicación no están certificadas. No se pidieron credenciales ni se hicieron cargas reales de prueba.

`npm run build` no pasa en este entorno: primero se bloqueó la descarga de Figtree; con acceso de red, Turbopack encontró el fallo local conocido al crear un proceso de transformación CSS (physical-audits.module.css). No se cambió ese módulo ni se desactivaron verificaciones. **`npm run build -- --webpack` completo PASS**, incluida la comprobación TypeScript y la nueva ruta. Antes de fusionar debe pasar CI con el build habitual; no se presenta el build alternativo como certificación de Turbopack.

## Siguiente paso

Publicar el cambio autorizado solo si pasa CI y comprobar la disponibilidad de la aplicación sin marcar cargas reales como prueba. Contrastar posteriormente las cargas reales disponibles con Sytex. Si faltan formularios no sincronizados, definir su cobertura/backfill sin alterar datos reales ni asumir que todas las compras son cargas.
