# Corrección de cargas por tanque en correctivos

Continuación del control de combustible publicado en PR #63. La usuaria aportó dos formularios que faltaban. Se contrastaron sus originales en Sytex y sus datos guardados en FNET, con consultas PostgreSQL verificadas y forzadas a solo lectura. Los identificadores operativos y la evidencia concreta quedan en el acta local; no se incluyen datos de personas ni fotos en el repositorio.

## Causa confirmada

Los dos formularios sí estaban sincronizados. La plantilla Correctivo Civil FT-00691 registra el detalle como `[#n] Tanque`: `¿Se carga a:?`, `Nivel Antes`, `Litros cargados`, `Valor horómetro`, `Nivel final`. El lector reconocía horómetro, pero descartaba los litros y niveles porque ni el grupo ni esas preguntas repetían la palabra combustible. Volver a consultar la tabla del panel no podía recuperar respuestas descartadas durante la importación.

Se reconoce expresamente ese grupo y sus preguntas conocidas, conservando una carga por tanque y su propio horómetro/niveles. No se toman litros solicitados del texto de la tarea ni se inventan a partir de un comentario. El valor numérico de la respuesta de carga prevalece sobre la cantidad solicitada y no se cambia para hacerla coincidir con el comentario libre.

## Precisión numérica

También se contrastó un preventivo cuyo campo numérico Sytex contiene `31.515`. El lector interpretaba un punto con tres cifras finales como miles, generando `31515` litros. Ahora se conserva el punto decimal del export y hasta tres decimales: `31.515` → `31,515 L`. Se sigue admitiendo la coma decimal y el formato mixto `1.709,4` → `1709.4`. Esto corrige el cálculo al leer, sin modificar las respuestas originales.

## Alcance y publicación

No hay tablas, migraciones, dependencias, cambios de permisos ni edición de respuestas en Sytex. Se conserva el botón OK, sus versiones/historial y los totales por operación. Una evidencia cuyo valor corregido cambie requiere nueva revisión según el hash ya implementado. Las coincidencias ambiguas entre fuentes siguen identificadas como posibles duplicados.

La autorización de publicación de este control permanece vigente: commit, push, PR, fusión y despliegue en FNET de Leo solo si pasa CI. Para recuperar los registros omitidos hace falta volver a descargar sus respuestas mediante la sincronización normal de Sytex; no basta desplegar el lector nuevo. Ese refresco real forma parte de corregir la omisión solicitada y no debe crear cargas manuales ficticias ni editar datos en Sytex. El resultado se verificará contra los dos formularios aportados y quedará registrado en el cierre del PR/acta.

## Validación

Baseline publicado: 573 pruebas, 83 archivos, main 83b1ac0695f0a10abe39b4fe1e6bf657f72d3e7e. Las pruebas nuevas cubren el tanque de un correctivo, varios tanques independientes, exclusión de capacidad/agua/solicitud textual y decimales numéricos de tres posiciones. El test de sincronización sin insumos usa el grupo Tanque para comprobar el circuito completo del parser.

Verificación local final: **576/576 pruebas** en 83 archivos; TypeScript sin errores; ESLint sin errores y cuatro advertencias preexistentes; build Webpack completo PASS, con la conexión a la base real deshabilitada. Debe pasar el build habitual en CI antes de fusionar. La publicación y el refresco de respuestas todavía deben verificarse y registrarse en el cierre del PR. No se certifica cobertura de todo el histórico externo ni de proyectos fuera de la sincronización configurada.
