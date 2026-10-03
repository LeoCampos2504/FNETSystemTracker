# FNET en el Railway de Leo

## Versión integrada

Esta rama combina la versión actual de Eugenia con la configuración de Prisma de Leo y conserva la autenticación más reciente. Incluye:

- Pantallas operativas que consultan PostgreSQL y los datos sincronizados por n8n.
- Demo de facturas dentro de Insumos: detalle, imágenes, descarga/carga marcadas manualmente, entrega a técnicos, consumos en varios formularios y aviso desde 14 días.
- Compras Mendel en `/compras`: importación CSV con revisión previa y actualización por ID de transacción.

El control de facturas sigue siendo un demo que guarda su estado e imágenes en el navegador. No transmite documentos a Intra Claro. Los datos Mendel se guardan en PostgreSQL para Admin; el cruce con los artículos de Sytex/Intra requiere identificadores verificables.

## Accesos necesarios

La cuenta de Railway que opera el despliegue debe poder entrar al workspace pago de Leo. El repositorio de GitHub puede ser de otro propietario; la facturación corresponde al workspace de Railway donde se crea el proyecto.

Si el código debe publicarse en `LeoCampos2504/FNETSystemTracker`, el operador necesita permiso de escritura allí. Mientras se resuelve, esta rama se puede desplegar directamente desde `EugeniaCeleste/FNETSystemTracker` en el workspace de Leo.

## Proyecto y servicios

1. Abrir el workspace pago de Leo en Railway.
2. Crear un proyecto FNET y agregar un servicio PostgreSQL. Conservar el nombre `Postgres` para usar la referencia de abajo.
3. Agregar el servicio web desde el repo y la rama que contienen esta integración.
4. Configurar las variables del servicio web:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXT_PUBLIC_USE_MOCK_API=true
```

5. Usar `npm run build` para compilar, `npm run start` para iniciar y `/api/health` para el healthcheck. Railway detecta los scripts npm con Railpack.
6. Configurar `npm run db:prepare-app` como comando Pre-Deploy.
7. Generar un dominio para el servicio web y comprobar `/api/health` y la navegación demo.

El comando de preparación crea solamente las tablas de aplicación FNET y su registro de migraciones, con transacción y bloqueo para despliegues concurrentes. Conserva las instalaciones manuales compatibles, no reaplica SQL ya registrado y rechaza cambios de checksum. El comando no crea las tablas oficiales de Sytex.

Para revisar su alcance sin conexión:

```powershell
npm.cmd run db:prepare-app -- --dry-run
```

## Conexión de datos reales

1. Recuperar un respaldo de la base anterior o configurar el flujo `FNET_BD` de n8n para escribir en la base nueva.
2. Verificar que las tablas sincronizadas existen y reciben filas: `correctivos`, `preventivos`, `cotizaciones`, `insumos`, `cargas_combustible_ge` y `pendientes_visita`. No ejecutar `prisma db push` ni una migración global sobre ellas.
3. Configurar `AUTH_SECRET` con al menos 32 bytes aleatorios y las variables temporales `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` y `BOOTSTRAP_ADMIN_NAME`.
4. Ejecutar `npm run auth:bootstrap-admin` una vez desde el entorno conectado a esa base. Retirar `BOOTSTRAP_ADMIN_*` después del alta.
5. Cambiar `NEXT_PUBLIC_USE_MOCK_API=false` y recompilar. Esta variable se incorpora al bundle durante la compilación.
6. Ingresar como Admin y revisar `/api/db/summary`, las pantallas operativas y la última sincronización.
7. Importar el CSV Mendel desde `/compras`. Subirlo de nuevo actualiza las transacciones por su ID y conserva el estado interno de conciliación.

Una base nueva comienza vacía. Los usuarios, sesiones, compras Mendel y asignaciones internas de la base anterior requieren respaldo/restauración o recarga; no se recuperan al conectar el repo. La sincronización desde Sytex depende de los rangos y fuentes que cubre n8n.

## Comprobaciones antes de publicar

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd exec tsc -- --noEmit
npm.cmd run lint
npm.cmd test
```

No incluir `.env.local`, CSV privados, imágenes reales de facturas ni credenciales en GitHub. Las variables de conexión y autenticación se configuran en Railway.
