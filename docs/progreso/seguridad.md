# Progreso: corrección de los hallazgos de la revisión de seguridad (seguridad)

Dueño: agente "seguridad" (corrector). Trabajó cuando el resto de los agentes ya había terminado. Tocó archivos de `learnhouse/` (API, web, `docker/nginx.conf`, CI), `deploy/` y `docs/`. No hizo commits ni creó `apps/api/ee/`.

## Estado (2026-10-23): TERMINADO y verificado

Quedan 18 hallazgos confirmados. 16 están corregidos. 2 están corregidos en parte, con el motivo explicado más abajo.

| # | Hallazgo | Sev. | Corrección | Prueba | Estado |
|---|---|---|---|---|---|
| 1 | Doble cobro: segundo checkout con un pago `pending`, o dos órdenes aprobadas capturadas a la vez | media | `start_checkout` responde 409 `{code: PAYMENT_PENDING, order_uuid}` si hay una orden `pending`, o una `approved` de hace menos de 30 min. `GET /access` devuelve `payment_pending`, y el muro muestra "Tu pago está en revisión" (escritorio y móvil). La página de la oferta pasa a consultar esa orden. El lock de captura se toma por (usuario, oferta), tanto en Redis como en local, y cubre la re-comprobación de propiedad y `provider.confirm`. `fulfill_order` marca el segundo cobro como `paid` con `raw.duplicate_of` y no le quita la concesión a la primera orden. Sin correo de compra para ese cobro. Transacciones y resumen muestran "Cobro duplicado: reembolsar" (`needs_refund`, `duplicate_charges`). | `test_security_fixes.py::TestNoDoubleCharge` (4 pruebas). En vivo: el segundo checkout da 409 con la misma orden, `payment_pending` es true y al completarse la captura se da el acceso. | corregido |
| 2 | Reembolsar el cobro que concede quita el acceso aunque otra orden pagada cubra la inscripción | media | `revoke_order` busca otra orden `paid` de la misma inscripción. Si existe, la inscripción sigue `active` y apunta a esa orden, a la que además se le quita `duplicate_of`. La inscripción solo se revoca si no queda ninguna orden pagada. Los usergroups siguen la misma decisión. | `TestRefundOfADuplicateCharge` (2) | corregido |
| 3 | Configuración sandbox aceptada en producción: acceso real con dinero falso | baja | Fuera de modo desarrollo, con entorno distinto de `live`, solo admins/mantenedoras pueden comprar. Para ellas solo cuenta una compra previa, no el acceso de admin. Las demás reciben 403 `STORE_TEST_MODE`. `checkout/providers` expone `test_mode` y la oferta muestra un aviso. `raw.environment` se guarda en la orden y en la inscripción. Las ventas sandbox salen como "Prueba" y no cuentan en los ingresos fuera del modo desarrollo. Se actualizó la guía 7.3. | `TestSandboxOnProduction` (3) | corregido |
| 4 | La revocación por reembolso o contracargo depende solo del webhook | baja | Una configuración `live` sin Webhook ID se rechaza con 400. Nuevo `reconcile_refunds_once`: una vez al día (lock de Redis de 24 h) revisa las capturas pagadas de los últimos 180 días, a unas 3 por segundo como máximo, y revoca las REFUNDED o REVERSED. Los textos del panel dicen "obligatorio en producción". | `TestLiveNeedsWebhook`, `TestDailyRefundCheck`. En vivo, el log de la API muestra `Payments refund check: {'checked': 9, 'revoked': 0, 'errors': 0}`. | corregido (*) |
| 5 | El webhook sin autenticar llama a PayPal por cada petición falsificada | baja | El router aplica `_check_rate` con 120/min por IP (`get_client_ip`) y 600/min por organización. Antes de verificar contra PayPal se exige `auth_algo == SHA256withRSA`, un cert-url https de un host de PayPal acorde al entorno (no se exige con el simulador local) y un `transmission_time` a ±30 min. | `TestWebhookPrechecks` (7). En vivo: hora vieja → 400, algoritmo distinto → 400, y una ráfaga de 130 da 429 a partir de la petición 111. | corregido |
| 6 | Open redirect `/login?redirect=/..//evil.com` con sesión | media | `safeInternalPath` devuelve la forma normalizada y rechaza un pathname que empiece por `//`. El cambio cubre también `proxy.ts`, `commerce.ts` y el resto de los usos. | `tests/sc-fixes.test.mjs` "dot-segment open redirects". En vivo (curl): las tres variantes van a `/home`. | corregido |
| 7 | Open redirect `/redirect_from_auth?next=/..//evil` sin sesión, y `buildCallbackUrl` | media | `proxy.ts` rechaza un pathname normalizado que empiece por `//`. `login.tsx`, `OpenSignup.tsx` e `InviteOnlySignUp.tsx` usan `safeInternalPath(raw \|\| null, '/home')`. | Mismo bloque de pruebas. En vivo: las dos variantes van a `/`, y un deep link normal sigue funcionando. | corregido |
| 8 | `actualizar.sh` se salta la copia y las migraciones si la BD está parada o arrancando | media | Hace `up -d --no-recreate db redis` y `esperar_sano` antes de contar tablas. Si la consulta falla, el script se detiene (sin `\|\| echo 0`). En el paso 5 compara `alembic current` con `alembic heads` y falla si no coinciden. El mismo patrón se corrigió en `restaurar.sh`, donde la copia de seguridad previa al DROP se podía saltar. | `deploy/tests/scripts.test.sh` (pruebas 6 y 7, 3 casos) | corregido |
| 9 | Sandbox en producción (lado infra/guía) | baja | Igual que el 3. Además, la guía 7.3 pide hacer la prueba sandbox completa en local, o en producción solo con una oferta "(borrar)" y después `limpiar-datos-de-prueba.py`. La lista de salida en vivo exige la tarjeta en live. | Como el 3 | corregido |
| 10 | Cuerpos de 6 GB en cualquier ruta (nginx los escribe a disco) | baja | En Caddy, 6 GB solo para las rutas de API que reciben archivos (activities, blocks, courses, assignments, orgs, users, folders, media, communities, podcasts, boards, playgrounds, ai, code, monitoring) y 25 MB para el resto. En nginx, 25m a nivel de servidor y 6G solo en `location /api/v1`. | `caddy validate` y `caddy adapt` (6000000000 y 25000000). nginx probado con la imagen local: 40 MB a `/` → 413, a `/api/auth` → 413, a `/api/v1` → pasa (502, sin backend). | corregido (**) |
| 11 | La copia fuera del servidor sube `.env` sin cifrar y sin poda | media | Nunca se sube `env.respaldo` (`--exclude`). Solo se sube cifrado: con age (`SC_BACKUP_AGE_RECIPIENT`, se suben `*.age` y SHA256SUMS) o a un remoto rclone de tipo `crypt`. Si no hay cifrado, falla, no sube nada y conserva la copia local. El remoto se poda con `rclone delete --min-age` y `rmdirs`. Se actualizaron `.env.example` y la guía, incluida la restauración con `age -d`. | `scripts.test.sh` (pruebas 2, 3 y 4) | corregido |
| 12 | La línea de cron documentada falla en silencio si no existe `backups/` | media | `backup.sh` crea la carpeta antes de cualquier otra cosa. Sin terminal (cron) escribe su salida en `backups/backup.log`. Cron nuevo: `15 3 * * * /opt/sanarycriar/scripts/backup.sh`. El `mkdir` de la guía crea `backups/`. | `scripts.test.sh` (prueba 1) | corregido |
| 13 | Nada impide `LEARNHOUSE_DEVELOPMENT_MODE=true` en producción | baja | Compose fija `LEARNHOUSE_DEVELOPMENT_MODE: "false"` en `environment`, que tiene prioridad sobre `.env`. `requerir_env` falla si `.env` activa el modo desarrollo o define `LEARNHOUSE_PAYPAL_(API\|WEB)_BASE`, salvo en local-smoke. | `scripts.test.sh` (prueba 5, 2 casos). `docker compose config` muestra el valor. | corregido |
| 14 | La clave Fernet del Secret de PayPal se deriva del secreto JWT | baja | Documentado en `.env.example` y en la guía (sección 10): al rotar el secreto JWT hay que volver a pegar el Secret de PayPal, y si se filtró, también rotarlo en PayPal. | revisión de la documentación | corregido (documentación; MultiFernet no se hizo) |
| 15 | El access log de nginx guarda códigos, correos y tokens en un archivo sin rotación | baja | `log_format sc_noargs` (método + `$uri`, sin query) y `access_log /dev/stdout sc_noargs` en `docker/nginx.conf`. Docker lo rota. | `nginx -t`. Un GET `/auth/reset?code=SECRET…` queda en los logs como `"GET /auth/reset"` y `access.log` queda vacío. | corregido (**) |
| 16 | Supply chain: actions e imágenes con etiquetas mutables | baja | Las 4 `uses:` de `sanarycriar-image.yml` van fijadas por SHA de commit, con la versión en comentario (SHAs verificados con `git ls-remote`). Caddy (2.11.7), pgvector (PG 16.15, vector 0.8.7) y redis van fijados por digest en compose, con instrucciones para actualizarlos. | `docker compose config` | corregido |
| 17 | El contenedor corre como root y la app usa el superusuario de Postgres | baja | `security_opt: no-new-privileges:true` en learnhouse-app (imagen probada: nginx baja a su usuario y ffmpeg funciona). | prueba de humo con la imagen local | **en parte** (ver abajo) |
| 18 | El objeto `payer` de PayPal se guarda en cada orden y en cada copia | baja | Se quitó `payer` de `_MAX_RAW_KEYS`. `purchase_units` se recorta a reference_id, custom_id, amount y payments.captures[*] (id, status, status_details, amount, seller_receivable_breakdown, custom_id, fechas): sin payee ni shipping. En la BD de desarrollo se limpiaron 11 filas con el SQL de abajo. | `TestPayerDataNotStored` (2). En dev, las órdenes nuevas no tienen `payer`. | corregido |

(*) Punto 3 del hallazgo 4, "reprocesar eventos `failed`": no se hizo. La tabla de eventos no guarda el cuerpo del evento, así que no hay nada que reprocesar. En su lugar la conciliación trabaja por estado: la pasada diaria cubre los reembolsos y contracargos, y la de 5 min (24 h / 7 días) cubre las capturas pendientes o perdidas. El resultado es más robusto que reproducir eventos.

(**) Tanto `docker/nginx.conf` como el Caddyfile solo surten efecto en producción después de publicar una imagen nueva (`sc-v…`) y desplegarla con `actualizar.sh`. El Caddyfile también se aplica con `caddy reload`.

### Hallazgo 17: lo que no se hizo y por qué
- **Rol de Postgres sin superusuario** (`lh_app`): implica `REASSIGN OWNED`, crear la extensión `vector` antes como superusuario y cambiar `LEARNHOUSE_SQL_CONNECTION_STRING`. Además, las migraciones de LearnHouse que tocan extensiones fallarían con ese rol. No se puede probar de punta a punta sin una restauración real. Queda como mejora con este procedimiento:
  1. `CREATE EXTENSION IF NOT EXISTS vector;` como `learnhouse`.
  2. `CREATE ROLE lh_app LOGIN PASSWORD '…' NOSUPERUSER;`, `ALTER DATABASE learnhouse OWNER TO lh_app;` y `REASSIGN OWNED BY learnhouse TO lh_app;`.
  3. Cambiar la cadena de conexión.
  4. Probar `alembic upgrade heads` en una copia.
- **pm2, la API y Next sin root**: hace falta cambiar el Dockerfile de upstream (usuario, permisos de `/app/api/content`, nginx en el puerto 80). Es un cambio grande para un hallazgo de defensa en profundidad.

### SQL de limpieza de `payer` (órdenes anteriores a este cambio)
```sql
UPDATE sc_pay_order
SET raw = (raw::jsonb #- '{capture,payer}' #- '{create,payer}' #- '{last_status,payer}')::json
WHERE raw::text LIKE '%"payer"%';
```
Ya se ejecutó en la BD de desarrollo (11 filas). En producción todavía no hay órdenes anteriores a este cambio.

### Datos heredados en la BD de desarrollo
Las órdenes duplicadas que creó la auditoría (usuarios 9, 10 y 11) son anteriores a la corrección, así que no tienen `duplicate_of`. Además, la inscripción 10 (dave) sigue `refunded` aunque la orden 23 está pagada. Es el estado roto que causaba el hallazgo 2, y el código nuevo ya no lo produce. Por ser datos de prueba, no se reparó a mano.

## Archivos tocados
- API: `services/payments/{checkout,configs,fulfillment,stats,reconcile}.py`, `services/payments/providers/paypal.py`, `routers/payments.py`. Pruebas: `tests/payments/{conftest,fake_paypal,test_checkout_flow}.py` y `tests/payments/test_security_fixes.py` (nuevo, 20 pruebas). La configuración de las pruebas pasa a ser `live`, las cabeceras del webhook se generan "ahora" con `webhook_headers()` y el modo desarrollo de la tienda se fija en apagado.
- Web: `services/security/url.ts`, `proxy.ts`, `app/auth/login/login.tsx`, `app/auth/signup/{OpenSignup,InviteOnlySignUp}.tsx`, `components/Payments/{commerce.ts,useCheckoutProviders.ts}`, `components/Hooks/useCourseAccess.tsx`, `store/offers/[offerid]/offer-detail.tsx`, `CourseActions/{CoursesActions,CourseActionsMobile}.tsx`, `Dashboard/Pages/Payments/PaymentsCustomersPage.tsx`, `locales-sc/commerce.{es,en}.json` (claves nuevas en errors, offer_page, course_actions y customers; config.webhook_missing y optional_recommended cambiados) y `tests/sc-fixes.test.mjs`.
- Imagen y CI: `docker/nginx.conf`, `.github/workflows/sanarycriar-image.yml`.
- Kit: `scripts/{actualizar,_comun,backup,restaurar}.sh`, `docker-compose.prod.yml`, `caddy/Caddyfile`, `.env.example` y `tests/scripts.test.sh` (nuevo; usa docker, rclone y age falsos: `bash deploy/tests/scripts.test.sh deploy`).
- Docs: `despliegue.md` (5, 7.2, 7.3, 10, 13 y 14) y `spec-tecnica.md` (fulfillment).

## Verificación
- `pytest src/tests/payments src/tests/security src/tests/test_root_router.py`: 2415 pasan y 4 se omiten. `src/tests/payments` sola: 120 pasan, también con `LEARNHOUSE_DEVELOPMENT_MODE=false` y sin las variables del simulador (como en CI).
- `tsc --noEmit`: limpio. ESLint de los archivos web tocados: 0 errores (solo avisos que ya existían).
- `bun test`: sc-fixes 14, url-security 22, auth-proxy-hardening 8, sc-i18n-loose 14, google-oauth-bounce, sso-continue-url, signup-gateway y custom-domain-org, todo en verde. Cada archivo se ejecuta por separado, porque juntos chocan sus mocks de módulos, algo que ya pasaba antes.
- `bash deploy/tests/scripts.test.sh deploy`: 9/9. `bash -n` y shellcheck sin hallazgos nuevos.
- Contra el stack de desarrollo: script `scratchpad/seguridad/live_check.py` y curl contra :1338 y :3200.

## Lo que necesita alguien más
- Publicar una etiqueta de imagen nueva (`sc-v…`) para que `nginx.conf` llegue a producción.
- Con el kit nuevo, el cron del servidor queda como `15 3 * * * /opt/sanarycriar/scripts/backup.sh`. Para copias fuera del servidor hay que instalar `age` y poner `SC_BACKUP_AGE_RECIPIENT`.
- Revisar el aspecto de los avisos nuevos ("Tu pago está en revisión", el aviso de modo de pruebas y las etiquetas "Cobro duplicado" y "Prueba"). Pasan typecheck y lint, pero no se revisaron en un navegador.
