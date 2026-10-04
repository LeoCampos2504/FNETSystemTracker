# FNET System Tracker

Prototipo de PWA interna para planificación, coordinación y seguimiento de operaciones de campo FNET.

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL Railway existente para la futura lectura de tablas sincronizadas

## Variables de entorno

Copiar `.env.example` a `.env.local`:

```env
NEXT_PUBLIC_USE_MOCK_API=true
DATABASE_URL=
AUTH_SECRET=
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PASSWORD=
BOOTSTRAP_ADMIN_NAME=Administradora FNET
```

`DATABASE_URL` se mantiene del lado servidor. Con `NEXT_PUBLIC_USE_MOCK_API=false`, las vistas operativas consultan PostgreSQL Railway; con `true`, usan exclusivamente el modo demo explícito. Nunca se mezclan fuentes y la app no crea ni modifica las tablas oficiales `correctivos`, `preventivos`, `cotizaciones` e `insumos`.

`AUTH_SECRET` debe ser un valor aleatorio de al menos 32 bytes. La migración aditiva `prisma/migrations/20260924_add_app_users/migration.sql` crea únicamente tablas propias de autenticación (`app_users`, `app_sessions` y `app_login_attempts`); debe aplicarse explícitamente a la base FNET antes del primer acceso real. La app no ejecuta DDL ni migraciones automáticamente. El Admin inicial se crea una sola vez desde un entorno confiable mediante `npm run auth:bootstrap-admin`; la contraseña se guarda con bcrypt y las sesiones aleatorias se almacenan en PostgreSQL como hashes, con vencimiento absoluto a los 30 minutos y revocación al cerrar sesión. Después de crear el Admin, retirar `BOOTSTRAP_ADMIN_*` del entorno.

Hasta que el filtrado por `UserScope` esté implementado en todos los endpoints, solo `ADMIN` puede iniciar sesión y consultar los datos reales. Cada endpoint operativo vuelve a verificar en PostgreSQL que la sesión exista, no haya vencido y el usuario siga activo y autorizado. Las cuentas `TECHNICIAN`, `COORDINATOR` y `MANAGER` no obtienen acceso a datos reales. El inicio de sesión aplica límites persistentes por IP y cuenta; los mensajes de credenciales fallidas son genéricos.

## Instalación y desarrollo

```bash
npm ci
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

El acceso inicial abre la vista de Coordinador Demo. Desde el selector de perfil se pueden recorrer las vistas de Coordinador, Técnico y Administrador; cerrar sesión muestra nuevamente el acceso demo.

## Prisma y base de datos

`prisma/schema.prisma` contiene el esquema real introspectado de PostgreSQL: `correctivos`, `preventivos`, `cotizaciones` e `insumos`. `prisma.config.ts` carga `.env.local` solo para las operaciones CLI; el runtime usa el adapter PostgreSQL server-side.

La introspección inicial, únicamente cuando la conexión desde la PC esté disponible, se realiza con:

```bash
npx prisma db pull
npx prisma generate
```

No ejecutar migraciones destructivas sobre las tablas sincronizadas por n8n. Los contratos actuales mantienen las relaciones de tareas e insumos por identificadores confiables, no por coincidencia aproximada de nombres.

La app expone consultas read-only:

- `/correctivos`, `/preventivos`, `/cotizaciones`, `/insumos`: vistas reales sin mocks cuando el modo PostgreSQL está activo.
- `/combustible`: cargas reales de `cargas_combustible_ge`, filtros por fecha/sitio/origen/combustible/formulario y detalle de campos disponibles.
- `/pendientes`: pendientes reales de `pendientes_visita`, filtros por sitio/origen/formulario/estado y detalle completo.
- `/api/db/summary`: devuelve los cuatro totales consultados desde PostgreSQL.
- `/api/synced-data`: devuelve el read model consolidado para el dashboard.

Las cargas de combustible se agrupan únicamente en métricas sobre filas reales; no se interpreta el texto del combustible como litros. Las zonas no se inventan porque `cargas_combustible_ge` no tiene un campo de zona explícito. Los pendientes se relacionan al cronograma por igualdad exacta de código de sitio, incluso si la tarea actual es correctiva o preventiva.

En cotizaciones, `codigo_tarea` solo se considera relacionado cuando coincide con `correctivos.codigo`. En insumos se conserva `formulario + grupo + indice` como identidad lógica.

## PWA

La app incluye `public/manifest.webmanifest`, registro de service worker y viewport móvil. La navegación responsive funciona como sidebar en escritorio y menú lateral en celular.

## Validación

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

## Deploy

Configurar `DATABASE_URL` y `AUTH_SECRET` como secretos del entorno de deploy. Mantener las credenciales fuera del navegador y conservar el proceso n8n → PostgreSQL como capa de sincronización oficial con Sytex.

Para habilitar la prueba real en Railway, en este orden:

1. Confirmar que `DATABASE_URL` del servicio de la app referencia `FNET-Postgres`.
2. Ejecutar `npm run db:prepare-app` sobre esa base, o configurarlo como comando Pre-Deploy de Railway. Prepara las tablas propias de FNET en una transacción y admite instalaciones previas compatibles. No ejecuta una migración general sobre las tablas sincronizadas.
3. Configurar `AUTH_SECRET` con al menos 32 bytes aleatorios y, temporalmente, las variables `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (mínimo 15 caracteres y hasta 72 bytes) y `BOOTSTRAP_ADMIN_NAME`.
4. Desde un entorno confiable conectado a la misma `DATABASE_URL`, ejecutar `npm run auth:bootstrap-admin` una sola vez y retirar `BOOTSTRAP_ADMIN_*` después de confirmar el alta.
5. Cambiar `NEXT_PUBLIC_USE_MOCK_API` a `false` y desplegar de nuevo. Esta variable se incorpora durante la compilación.
6. Iniciar sesión como Admin y revisar que la fuente indique PostgreSQL. Mantener la app en solo lectura.

Si todavía no se aplicó el SQL o faltan secretos, dejar `NEXT_PUBLIC_USE_MOCK_API=true`: el acceso real no quedará operativo.

## Compras Mendel

La ruta `/compras` está protegida para Admin. Desde allí se puede subir un CSV de transacciones, revisar altas/actualizaciones y confirmar la importación. El identificador de transacción de Mendel evita duplicados; las importaciones se registran con hash y conteos, sin conservar el archivo original.

FNET guarda los datos operativos y contables necesarios para conciliar compras. Omite correos, identificaciones personales, datos de tarjeta y notas de auditoría. La exportación disponible no da una relación verificable entre transacciones, archivos de comprobantes e ítems de Intraoperativa: esos cruces quedan pendientes y el stock oficial no se modifica.

En `/insumos`, las compras relacionadas se buscan por código FO exacto en `referenceCode` o en las referencias extraídas de la columna `Notas` del CSV Mendel. No se compara un formulario con IDs de transacción o presupuesto. Solo se guardan los códigos FO extraídos en la tabla propia `mendel_form_references`, nunca las notas completas. Una compra puede referenciar varios formularios y un formulario puede tener varias compras; todas se muestran para revisión, sin confirmar consumo ni alterar cantidades.

Antes de desplegar esta versión, ejecutar `npm run db:prepare-app` como Pre-Deploy para crear la tabla aditiva de referencias. Para transacciones importadas con una versión anterior, volver a importar el CSV original con `Notas`; la app actualiza las mismas transacciones y conserva su conciliación interna. Un CSV sin esa columna conserva las referencias ya importadas; uno con notas vacías las elimina para esa transacción.

La vista pagina todos los registros consultados, muestra por separado técnico asignado y último editor, y expone el rango de `sincronizado_el` almacenado en PostgreSQL. El editor no prueba quién conserva un insumo. “Consultar de nuevo” vuelve a leer PostgreSQL y no ejecuta una extracción de Sytex: la actualización de la fuente sigue a cargo de n8n o del importador autorizado. Una descarga del export por sí sola no demuestra que se haya actualizado la base.

La descarga diaria requiere que Mendel habilite una API o entrega SFTP para la cuenta. Hasta entonces, se puede repetir la exportación CSV y subirla desde `/compras`; las transacciones existentes se actualizan sin perder su estado interno de conciliación.

## Insumos y despliegue en Railway

El menú Insumos incorpora el demo de control de facturas con detalle, imágenes, seguimiento de carga/descarga, entregas a técnicos y consumos en uno o varios formularios. Las entregas abiertas desde 14 días requieren revisión. El demo guarda su estado en el navegador; la pestaña Registros Sytex conserva la fuente sincronizada.

La guía [FNET en el Railway de Leo](docs/deploy-railway-leo.md) incluye servicios, variables, preparación de tablas propias, alta del Admin y conexión del flujo n8n a la base nueva.

## Alcance futuro reservado

Los contratos `src/contracts/air-conditioner.ts` y `src/contracts/generator.ts` dejan preparado el modelado separado `site → equipos → mantenimientos`, sin crear tablas ni UI completa todavía. Los aires acondicionados y grupos electrógenos son equipamientos distintos; sus mantenimientos deberán relacionarse a formularios Sytex e insumos únicamente mediante claves determinísticas.
