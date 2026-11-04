# Combustible — fecha de realización, 04/11/2026

## Causa y evidencia

La fecha visible usaba `reportedAt` (última edición de la respuesta) cuando no había una pregunta específica de fecha de carga. No representa la realización del trabajo. Las preguntas reales de inicio de preventivos y correctivos se descartaban por no tener un tópico reconocido. Se comprobó la diferencia en las vistas originales de ambos tipos de FO; además, el caso indicado por la usuaria corresponde a un trabajo del 02/10 mostrado con edición del 13/10. Los identificadores y datos operativos quedan fuera de este reporte público.

## Comportamiento corregido

- Prioridad: fecha explícita de la carga; en su defecto, inicio de tareas **informado en las respuestas del FO**, rotulado como tal.
- Se conservan las respuestas de inicio como tópico EJECUCION, en las tablas de caché ya existentes. No se toman fechas de aprobación, envío, fin, plan ni última edición como realización.
- Si falta una respuesta válida o hay conflicto entre inicios, la carga sigue existiendo como «Sin fecha en FO». Se consulta con Todas las fechas; no se inventa una fecha ni una hora.
- La fecha histórica de n8n no tiene evidencia suficiente de realización: se usa el inicio del mismo FO/sitio si está disponible, y en otro caso queda sin fecha. No se modifica n8n.
- No se deduplican eventos usando el inicio general del FO como si fuera la hora específica de una carga; se conservan los posibles duplicados para revisión.
- Si cambia la fecha, el hash del OK cambia. El evento anterior, su autor y su fecha permanecen; se muestra aviso para revisar el OK, sin volver a confirmarlo automáticamente.

## Habilitación y límites

Requiere publicar y refrescar las respuestas con la sincronización habitual para recuperar las preguntas antes descartadas. Leer las fechas de inicio de la tarea vinculada no equivale a leer la respuesta del FO, por lo que no se usa esa aproximación. Sin nuevas tablas, migraciones o modificaciones de respuestas externas. No se marcaron cargas reales OK como prueba.

La importación de stock de Intra se trabaja por separado y no forma parte de esta corrección. Su código local sin confirmar no se incluye en el commit de fechas.

## Validación

Baseline: 576 pruebas / 83 archivos. Final local: **583/583 en 84 archivos**, incluidas siete pruebas nuevas sobre preventivos/correctivos, prioridad de fecha de carga, Argentina, ausencia/conflicto, conservación en el parser real y lectura n8n. TypeScript sin errores, ESLint sin errores (cuatro advertencias previas) y compilación Webpack local aprobados. El build habitual de CI y la publicación se registrarán al verificarlos; no se consideran aprobados por este documento.
