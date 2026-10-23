# Progreso: API de LearnHouse (pagos, progreso, CORS, mock de PayPal)

Dueño: todo `learnhouse/apps/api/`, `learnhouse/Dockerfile` (ffmpeg), `dev/` (compose, api.env, paypal-mock). Spec: `docs/spec-tecnica.md` §2, §3, §2.8.

## Estado (2026-10-22, segundo ingeniero, continuación)

### Heredado del primer ingeniero (inspeccionado, sin verificar)
- Modelos `src/db/payments/payments.py` (9 tablas `sc_pay_*`) y `src/db/activity_progress.py`.
- Servicios en `src/services/payments/`: common, settings, access, configs, offers, groups, checkout, fulfillment, stats, reconcile, providers/{base,registry,paypal}.
- `src/services/progress/` vacío. Sin router, sin migraciones, sin tests, sin mock, sin cambios upstream.

### Hecho en esta sesión
- Revisión del trabajo heredado: modelos y servicios coherentes con la spec. Mejoras: `ensure_entitlements` ahora corre en una sola transacción bajo el bloqueo de la fila de la orden (crea Trail/TrailRun sin `check_trail_presence`, que hacía commit propio y podía duplicar Trail en carreras); `capture_and_fulfill` serializado por orden (Redis SET NX + asyncio.Lock) para que retorno y webhook no compitan.
- Router `src/routers/payments.py` (todas las rutas de §2.2/§2.3; literales antes que paramétricas), montado en `src/router.py` con prefijo `/payments`.
- Progreso: `src/services/progress/{progress,cleanup}.py`, `src/routers/progress.py` (montado en `/progress`, sesión obligatoria + feature cursos). Upsert portable (Postgres/SQLite), `max_position` con CASE (GREATEST portable), auto-completar ≥90 % en video o `completed=true`.
- Cambios upstream (marcados "Sanar y Criar:"): `core/deployment_mode.py` (sin `payments` en EE_ONLY), `core/ee_hooks.py` (fallback a nuestro acceso), `services/trail/trail.py` (402 en `add_course_to_trail`; borra progreso en remove_course/remove_activity), `services/admin/admin.py` (reset_user_progress borra progreso), `core/middleware/cors.py` (+ `extra_cors.py` nuevo), `core/events/events.py` (arranca/detiene la conciliación), `router.py`.
- Migración `migrations/versions/a9c8b7d6e5f4_sanarycriar_payments_and_progress.py` (down_revision `e8f9a0b1c2d3`, única cabeza verificada con AST: 72 revisiones).
- Mock PayPal `dev/paypal-mock/` (Starlette, puerto 8099) + servicio en compose; `api.env` con `LEARNHOUSE_PAYPAL_API_BASE/WEB_BASE` y `LEARNHOUSE_EXTRA_CORS_ORIGINS=http://localhost:4321`. API recreada, caché `instance_info` borrada.
- `Dockerfile` raíz: `ffmpeg` en la etapa runner.

- Tests nuevos `src/tests/payments/` (76, todos pasan): acceso (gratis, anónimo, sin compra, comprado, admin, autor, oferta archivada, grupo, estados que no dan acceso), muro 402 + contenido redactado, 402 en "empezar curso", checkout (precio desde BD, payload PayPal, return/cancel URL), redirect_uri (7 casos rechazados), captura idempotente, captura+webhook → un solo cumplimiento, discrepancias de monto/moneda/custom_id → sin acceso, PENDING → sin acceso hasta COMPLETED, INSTRUMENT_DECLINED → retry, firma inválida → 400 sin cambios, cuerpo crudo empalmado, dedupe, reembolso total revoca / parcial no, config sin secreto (cifrado en BD), token en caché + reintento en 401, orden de rutas, archivar → 200, progreso (upsert, máx., clamp, auto-completar, 402, limpiezas), conciliación, CORS extra.
- Migración verificada en BD aparte (`sc_migtest`, borrada): stamp e8f9a0b1c2d3 → upgrade crea 10 tablas idénticas a los modelos (columnas, nulos, índices); downgrade/upgrade; upgrade sobre tablas ya creadas por `create_all` no falla.
- Prueba en vivo OK (ver informe final): config PayPal (PUT re-valida, sin secreto en respuesta), curso "Curso de prueba (borrar)" `course_62fb10ed-6ac9-463d-8800-2adbbb016c6f` con capítulo y video mp4 generado con ffmpeg, oferta `4af57a6a-42c6-440b-accd-bd7e9f7cb37c` (12.50 USD), alumna nueva → acceso false / contenido redactado / stream 402 / empezar 402 / progreso 402 → checkout → aprobación en el mock (303 a return_url) → captura `paid` → acceso true, stream 206, TrailRun, correo en español en Mailpit → recaptura idempotente, 409 ALREADY_OWNED → segunda alumna "aprobar y cerrar" → webhook APPROVED → pagado; reenvío del webhook → duplicate; webhook falsificado → 400.
- Usuarios de prueba: `alumna.api.prueba@example.com`, `alumna.api.webhook@example.com`; contraseñas en `dev/usuarios-prueba.local.env` (ignorado por git).
- Alta abierta: `admin_toggles.members.signup_mode = "open"` (config v2) ya estaba; `POST /api/v1/users/1` funciona.

- Suite completa (1.ª pasada, `docker compose run ... api pytest src/tests`): 7131 passed, 10 failed, 23 skipped. 2 fallos eran míos y esperados (tests de `check_ee_activity_paid_access` que exigían `True` sin EE) → actualizados para comprobar la delegación. Los otros 8 fallan igual en HEAD exportado con `git archive` (pre-existentes, de entorno: `/app/__init__.py` hace que `import app` cargue el paquete; y un test de cabeceras de correo con SMTP). Montando el código en `/srv/api` pasan 7 de esos 8 (incluido el de orden CSRF/CORS y el lifespan); el de correo falla también en HEAD.
- `src/tests/test_root_router.py` fallaba en HEAD de forma aislada (stubs desactualizados: audit, demo, mfa, nudges, ai.audio, deployment_mode); añadidos los stubs + aserciones del montaje de `/payments` (sin auth de router) y `/progress` (sesión obligatoria).
- Decisión: si se desactiva la feature `payments` de la org, el muro sigue aplicando (no se regala contenido); solo se bloquean listado público, oferta pública, proveedores y checkout.

- Suite completa (2.ª pasada, final, código montado en `/srv/api`): **7140 passed, 1 failed, 23 skipped** (16 min). El único fallo (`test_email_unsubscribe_support::...forwards_headers_to_the_provider`, KeyError 'headers') falla igual en HEAD.

### Pendiente
- Ninguno del alcance. Ver "Known gaps" en el informe final.

## Review (2026-10-22, revisor independiente)

Leído todo el código nuevo (router, servicios de pagos y progreso, modelos, migración, CORS extra, mock) y los cambios upstream; tests y verificación en vivo re-ejecutados. Sondeo de fugas del muro en vivo (anónima y compradora de otro curso contra `/courses/{uuid}`, `/meta`, `/meta?slim=false`, `/chapters/course/.../meta`, `/chapters/{id}`, `/activities/{uuid}`, `/activities/chapter/{id}`, búsquedas, `/export`, `/state`): sin fugas del contenido pagado.

### Defectos corregidos
- `services/payments/access.py`: los API tokens de la org desbloqueaban cursos pagos (los puede crear cualquier miembro con permiso de tokens, con derechos reducidos, p. ej. para integraciones). Ahora un token nunca abre un curso a la venta (`reason: none`); los cursos gratis siguen igual. El token de superadmin de plataforma sigue pasando.
- `services/payments/checkout.py` (`_owned_through_other_order`): la protección contra un segundo cobro solo miraba la inscripción de la propia orden; con dos filas de inscripción (doble clic simultáneo en "Pagar") se podían capturar dos pagos. Ahora mira cualquier inscripción con acceso del mismo usuario y oferta.
- `services/payments/checkout.py` (webhook): un fallo transitorio (PayPal o BD caídos) respondía 2xx y el evento se perdía; la conciliación no revisa reembolsos ni capturas pendientes de más de 24 h. Ahora responde 503 en fallos transitorios para que PayPal reenvíe (el evento queda `failed` y se re-ejecuta); los fallos definitivos siguen en 2xx.
- `services/payments/checkout.py`: los tokens (`APITokenUser` y `SuperadminAPITokenUser`, cuyo `id` es id de token, no de usuario) nunca cuentan como dueños de una orden.
- Tests nuevos: `src/tests/payments/test_review_fixes.py` (6).

### Verificado
- `pytest src/tests/payments` → 82 passed. Suites afectadas (payments, core, test_root_router, trail/chapters routers) → 180 passed (antes de los cambios). Suite completa con el código en `/srv/api` → 7146 passed, 1 failed (`test_email_unsubscribe_support::...forwards_headers_to_the_provider`, el mismo fallo previo que ya falla en HEAD), 23 skipped.
- En vivo tras los cambios: acceso de compradora = purchased; webhook falsificado → 400; checkout → página del mock con los 3 botones → cancelar (303 a cancel_url) → `cancel` → `cancelled` → captura posterior → `cancelled` sin cobro.

### Pendiente / para otros
- Producción: `LEARNHOUSE_MEDIA_URL` debe apuntar al host público de la API; si no, `settings.webhook_url` sale como `https://api.<dominio>/...`.
- Si se archiva la única oferta de un curso, el curso pasa a ser gratis para todos (así lo dice la spec §2.7); conviene avisarlo en el panel.
