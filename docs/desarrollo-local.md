# Desarrollo local

Rutas relativas a `C:\Users\mente\Documents\Psicologa\sanarycriar`.

## Servicios (Docker)
`dev/docker-compose.yml` levanta:

| Servicio | Puerto host | Notas |
|---|---|---|
| Postgres (pgvector) | 127.0.0.1:5433 | usuario/clave/db `learnhouse` |
| Redis | 127.0.0.1:6380 | |
| Mailpit | 127.0.0.1:1025 (SMTP), http://localhost:8025 (bandeja) | captura todos los correos |
| API LearnHouse | http://localhost:1338 (Swagger en `/docs`) | código montado desde `learnhouse/apps/api`, recarga automática al editar `src/` (si cambias `app.py`, reinicia: `docker compose -f dev/docker-compose.yml restart api`) |
| PayPal simulado | http://localhost:8099 | solo desarrollo; ver "PayPal en local" |

```bash
docker compose -f dev/docker-compose.yml up -d --build
```

Variables de la API: `dev/api.env`. Está en `.gitignore` y contiene secretos locales generados al azar. Ahí están el correo y la contraseña del admin inicial: `LEARNHOUSE_INITIAL_ADMIN_*`.

Si cambias `dev/api.env`:
1. Recrea la API con `docker compose -f dev/docker-compose.yml up -d --force-recreate api`.
2. Borra la caché de `instance/info`:
   ```bash
   docker compose -f dev/docker-compose.yml exec -T redis redis-cli del org_cache:instance_info:v2
   ```

## Usuarios de prueba
- Administradora: `LEARNHOUSE_INITIAL_ADMIN_EMAIL` / `LEARNHOUSE_INITIAL_ADMIN_PASSWORD` en `dev/api.env`.
- Alumnas de prueba: `dev/usuarios-prueba.local.env`. El archivo dice qué correo va con cada variable: `alumna.api.prueba@example.com` → `SC_TEST_PW_1`, `alumna.api.webhook@example.com` → `SC_TEST_PW_2`.
  - Son valores solo locales. El archivo está ignorado por git (`dev/*.env`): no lo copies a ningún otro sitio y no pegues las contraseñas en documentos ni chats.
  - Para entrar desde un script, lee el archivo como `CLAVE=VALOR` sin imprimirlo.
- Todo lo que sea de prueba usa correos `@example.com` y nombres con "(borrar)". `deploy/scripts/limpiar-datos-de-prueba.py` lo borra: sin opciones solo simula; con `--aplicar`, borra. Las instrucciones están en su cabecera.
- Cerrar sesión revoca **todas** las sesiones de ese usuario. Si pruebas en un navegador aparte, no cierres sesión con la administradora mientras alguien usa el panel.

## Tests de la API
Corren dentro del contenedor, con SQLite en memoria. Desde Git Bash:
```bash
export MSYS_NO_PATHCONV=1   # Git Bash en Windows: no reescribir /srv/api
docker compose -f dev/docker-compose.yml run --rm --no-deps -T \
  -e LEARNHOUSE_REDIS_CONNECTION_STRING= \
  -v "C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api:/srv/api" -w /srv/api \
  api pytest src/tests/<ruta> -q -p no:cacheprovider
```
- **`-e LEARNHOUSE_REDIS_CONNECTION_STRING=`** (vacía) es obligatoria. Si no la pones, los tests escriben revocaciones de sesión en el Redis de desarrollo y cierran la sesión de quien esté usando la web en ese momento.
- **El código va montado en `/srv/api`, no en `/app`.** En `/app`, `/app/__init__.py` hace que `import app` cargue el paquete en vez de `app.py`, y fallan 7 tests por razones de entorno.
- La suite completa (`src/tests`) tarda unos 16 minutos. Hay un fallo previo que también ocurre en upstream: `test_email_unsubscribe_support::…forwards_headers_to_the_provider`.
- Pagos y progreso: `pytest src/tests/payments -q -p no:cacheprovider`.
- Boletín: `pytest src/tests/newsletter -q -p no:cacheprovider`.
- Blog: `pytest src/tests/blog -q -p no:cacheprovider` (nunca llama a Anthropic: usa el modo de prueba y un cliente falso).
- Carrito y Pago Móvil: `pytest src/tests/payments/test_cart_manual.py src/tests/payments/test_fx.py -q -p no:cacheprovider` (también entran con `src/tests/payments`). No salen a la red: la tasa del BCV y los correos están simulados.

## Web de LearnHouse (Next.js)
- Dependencias: `cd learnhouse/apps/web && bun install --frozen-lockfile`. Se usa bun 1.4.3, instalado con `npm i -g bun@1.4.3`.
- Variables: `learnhouse/apps/web/.env.local`. La API está en `http://localhost:1338/` y la web en `localhost:3200`.
- Servidor de desarrollo: http://localhost:3200. Se inicia con la configuración `learnhouse-web` de `.claude/launch.json` (en la carpeta superior `Psicologa`). Equivale a `node node_modules/next/dist/bin/next dev --turbopack -p 3200`. Arranca uno solo.
- Typecheck: `cd learnhouse/apps/web && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`. Tarda unos 35 s y debe terminar sin salida.
- ESLint de los archivos que tocaste: `node node_modules/eslint/bin/eslint.js <archivos>`.
- Tests unitarios: `bun test <archivo>` (por ejemplo `bun test tests/sc-fixes.test.mjs`) o `bun test ./tests`.

## Configurar la organización
`deploy/scripts/configurar-organizacion.py` deja la organización como la de producción. Configura:
- la marca: nombre, descripción, color, idioma `es`, sin marca de agua, SEO y logos;
- el menú: solo "Cursos" y "Tienda";
- las funciones que no usamos, apagadas: biblioteca, pódcasts, comunidades, espacios interactivos, tableros e IA.

Es idempotente: la segunda vez todo sale "sin cambios". Solo usa la biblioteca estándar de Python. La contraseña se lee del archivo y nunca se imprime.
```bash
python deploy/scripts/configurar-organizacion.py --env-file dev/api.env --web http://localhost:3200 --simular   # ver qué cambiaría
python deploy/scripts/configurar-organizacion.py --env-file dev/api.env --web http://localhost:3200            # aplicar
```
- `--web` renueva la caché de la web al terminar.
- `--reemplazar-imagenes` vuelve a subir los logos aunque ya existan.
- En producción se usa con `--api`, `--web` y `--email` (`docs/despliegue.md` §5).
- Lo que configura está descrito en `docs/spec-tecnica.md` §4.4.

## Sitio de marketing (Astro)
- `cd web && npm install && npm run dev`. Queda en http://localhost:4321; la configuración se llama `sitio-marketing`.
- `npm run build` genera `web/dist/client` (páginas estáticas) y `web/dist/server` (Node, para `/blog`). `npm run preview -- --port 4322` lo sirve como en producción; con `LH_API_INTERNAL=http://localhost:1338/api/v1` lee la API local. En `npm run dev` el blog usa `PUBLIC_LH_API` de `.env.development`.

## Blog con IA
Los artículos del blog se escriben en el panel (Blog) y la API los guarda en `sc_blog_post`. "Crear con IA" y "Mejorar con IA" corren en segundo plano: el panel consulta la tarea cada 3 s.
- **En local la IA va en modo de prueba por defecto.** `dev/docker-compose.yml` pone `SC_BLOG_AI_MOCK=1`: la API no llama a Anthropic y devuelve en unos 3 s un artículo fijo (rabietas si es informativo, un taller si es novedad o taller). El panel lo indica con "Modo de prueba".
- **Para probar con Claude de verdad:**
  1. Pon `ANTHROPIC_API_KEY=…` en `dev/api.env`. No la compartas ni la pegues en documentos o chats.
  2. Recrea la API sin el modo de prueba:
     ```bash
     SC_BLOG_AI_MOCK=0 docker compose -f dev/docker-compose.yml up -d --force-recreate api
     ```
  3. Al terminar, vuelve al modo de prueba con `docker compose -f dev/docker-compose.yml up -d --force-recreate api`.
- `SC_BLOG_AI_MODEL` es opcional; por defecto se usa `claude-opus-5-5`.
- Cada artículo con Claude cuesta unos US$0,10–0,30. Hay un límite de 15 usos de la IA por hora por organización y una sola tarea a la vez.
- Tests del blog: `pytest src/tests/blog -q -p no:cacheprovider` (con el comando de "Tests de la API").

## PayPal en local
Hay un PayPal simulado en `dev/paypal-mock`, en http://localhost:8099. Su `README.md` tiene todos los detalles.

**Cómo lo usa la API**
- Solo en modo desarrollo, a través de `LEARNHOUSE_PAYPAL_API_BASE` (llamadas entre contenedores) y `LEARNHOUSE_PAYPAL_WEB_BASE` (la página que abre el navegador).
- Fuera de `development_mode` esas variables se ignoran. En producción no deben existir.
- El simulador guarda todo en memoria: al reiniciar su contenedor se olvidan las órdenes.

**Configurarlo en el panel** (Pagos → Configuración → PayPal)
- Client ID y Secret: cualquiera, por ejemplo `mock-client` / `mock-secret`. Entorno: `sandbox`.
- **Webhook ID: `WH-MOCK-SANARYCRIAR`**. Tiene que coincidir con `MOCK_WEBHOOK_ID` del simulador; con otro valor los webhooks se rechazan por firma.
- La tarjeta muestra la URL del webhook (`settings.webhook_url`). El simulador ya envía a `http://api:1338/api/v1/payments/webhooks/paypal/1`.
- Para probar el error de credenciales: un secreto igual a `invalid`, o un Client ID que empiece por `bad`.

**Comprar** con una alumna de prueba en la tienda (`/store`). La página de pago simulada ofrece:
- "Aprobar pago (simulado)": vuelve a la tienda y se captura.
- "Cancelar".
- "Aprobar y cerrar sin volver": la tienda captura sola por el webhook `CHECKOUT.ORDER.APPROVED`.
- **"Más casos de prueba"**: captura pendiente (`PENDING`, la pantalla "Tu pago está en revisión") o tarjeta rechazada (`INSTRUMENT_DECLINED`, estado `retry`).

**Ayudas del simulador**
- `GET http://localhost:8099/mock/webhooks`: últimas entregas y la respuesta de la API.
- `POST http://localhost:8099/mock/webhooks/<event_id>/resend`: reenvía un evento (prueba de deduplicación).
- `POST http://localhost:8099/mock/captures/<capture_id>/complete`: una captura pendiente pasa a completada.

**Con credenciales sandbox reales**: quita las dos variables `LEARNHOUSE_PAYPAL_*` de `dev/api.env`, recrea la API y configura PayPal desde el panel con tu Webhook ID real.

## Probar Pago Móvil en local
Pago Móvil no tiene simulador: quien compra paga desde su banco y la administradora confirma a mano. En local se prueba todo el recorrido sin dinero.

**Activarlo** (Pagos → Configuración → tarjeta «Pago Móvil»)
- Usa datos de prueba: banco 0134 Banesco, teléfono 0424-1234567, cédula V-12345678, titular «Prueba (borrar)», un WhatsApp cualquiera y, si quieres el aviso de pedidos nuevos, un correo `@example.com`.
- Enciende «Aceptar Pago Móvil». Si falta un dato obligatorio, la API responde `INCOMPLETE` y dice cuál.

**La tasa**
- Sale de https://ve.dolarapi.com (la pide la API desde el contenedor). Se guarda 30 min en Redis y una vez por día en `sc_pay_fx_rate`.
- Sin internet, elige «Tasa manual» en la tarjeta.
- Solo en modo desarrollo, `SC_PAY_FX_URL` en `dev/api.env` apunta la API a otra URL que responda con la misma forma (después, recrea la API).

**Comprar y confirmar**
- Con una alumna de prueba, agrega cursos al carrito (`/store/cart`), confirma el pedido y abre `/store/purchases/<uuid>`.
- Los correos (datos para pagar, aviso a la administradora, acceso y rechazo) llegan a Mailpit: http://localhost:8025.
- Marca el pedido como pagado, recházalo o anúlalo desde Pedidos (`/dash/orders`).
- Los pedidos sin pagar vencen solos: 24 h por defecto, y la reconciliación pasa cada 5 min.

**Comprobar la API**: `curl -s -X POST -H 'Content-Type: application/json' -d '{"offer_uuids":[]}' http://localhost:1338/api/v1/payments/1/cart/quote` responde 200.

Al terminar, borra lo que creaste (correos `@example.com`, nombres con «(borrar)»). Los pedidos se borran con su usuario.

## Probar el kit de producción
- `deploy/local-smoke/smoke.sh` levanta el kit completo con su propio proyecto Docker (`sanarycriar-smoke`), sin tocar este entorno. Lo comprueba de punta a punta: primer despliegue, salud, páginas, redirecciones, CORS, cabeceras, copia de seguridad, actualización y restauración. Al final lo borra todo.
  ```bash
  docker build -t sanarycriar/lms:local learnhouse   # una vez, o tras cambiar el código
  deploy/local-smoke/smoke.sh                        # --conservar lo deja arriba para mirarlo
  ```
  - Usa `127.0.0.1:80/443`. Si están ocupados, cámbialos con `SC_SMOKE_HTTP` / `SC_SMOKE_HTTPS`.
  - Detalles en `docs/despliegue.md` §15.
- Volver a una versión anterior: `scripts/restaurar.sh <copia> --version=sc-vX.Y.Z` restaura la copia y fija `SC_LMS_TAG` en `.env`, para arrancar la versión que corresponde a ese esquema. El procedimiento completo está en `docs/despliegue.md` §10.

## Finales de línea
`learnhouse/.gitattributes` obliga a usar LF en `*.sh`, `docker/nginx.conf`, `apps/web/server-wrapper.js` y `Dockerfile`. Esos archivos se ejecutan en Linux, y con CRLF `/bin/sh` falla (`start.sh: syntax error`). `deploy/.gitattributes` hace lo mismo con todo `deploy/`. Si tu copia de trabajo es anterior a esos archivos, el `Dockerfile` igual quita los CR al construir la imagen.

## Traducciones (español)
`learnhouse/apps/web/locales/es.json` es la fuente de verdad del español. Las claves propias van bajo `sc_commerce`, `sc_learning`, `sc_fixes`, `sc_errors`, `sc_brand` y `sc_ui`.
- `tools/i18n/apply.cjs` fusiona en `locales/{es,en,ar}.json` las traducciones que faltaban (`tr-*.json`) y los paquetes `sc_*`. Lee cada paquete de `learnhouse/apps/web/locales-sc/` si existe; si no, de `tools/i18n/sources/`. Es idempotente; `--dry` solo simula.
- `tools/i18n/verify.cjs` comprueba que es/en/ar tengan las mismas claves y los mismos marcadores (`{{…}}`, etiquetas, Markdown), y que toda clave usada en el código exista.
- Si agregas una clave `sc_*`, ponla también en su paquete de `locales-sc/` o de `tools/i18n/sources/`, o `apply.cjs` la borrará en la siguiente pasada. Después corre los dos scripts desde `learnhouse/`:
  ```bash
  node ../tools/i18n/apply.cjs && node ../tools/i18n/verify.cjs
  ```
