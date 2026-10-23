# Especificación técnica: Sanar y Criar

Fecha: 2026-10-22 (actualizado 2026-10-23). Documento vivo: es el contrato compartido entre backend (API de LearnHouse), frontend de LearnHouse y el sitio de marketing.

- Repositorio del fork: `sanarycriar/learnhouse` (rama `sanarycriar`, base LearnHouse 1.4.2, AGPL-3.0).
- Sitio de marketing: `sanarycriar/web`.
- Entorno local: `sanarycriar/dev` (ver `docs/desarrollo-local.md`).
- Investigación previa (con verificación independiente): `docs/investigacion/*.md`. La lectura obligatoria por área está indicada en cada sección.

## 0. Arquitectura

| Pieza | Dominio prod | Tecnología | Rol |
|---|---|---|---|
| Sitio de marketing | `www.sanarycriarve.com` | Astro + React (islas), estático | Marca, Hilda, servicios, talleres, test de crianza, testimonios, FAQ, blog, agenda, links, legales. Muestra el catálogo leyendo la API pública de pagos. |
| Plataforma de cursos | `cursos.sanarycriarve.com` | Fork de LearnHouse (Next.js 16 + FastAPI + Postgres + Redis) | Cursos en video con capítulos, ebooks (PDF), cuentas de alumnas, tienda, checkout PayPal, entrega inmediata, progreso y reanudación. |

Reglas de oro del fork:
1. **Nunca** crear `apps/api/ee/` ni `ee/hooks.py`: activaría la verificación de licencia Enterprise.
2. **No copiar código EE.** Implementamos nuestro propio módulo con la forma de API que ya espera el frontend AGPL.
3. Código nuevo en archivos nuevos siempre que se pueda; tocar archivos upstream de forma mínima y comentada (`# Sanar y Criar:` / `// Sanar y Criar:`) para facilitar merges futuros.
4. Comentarios de código en inglés (como el resto de LearnHouse). Textos visibles al usuario: en español (vía i18n).
5. Moneda única: USD. SPIDI (Pago Móvil, VES a tasa BCV) se integrará después como otro proveedor.

## 1. Marca (tokens compartidos)

Extraídos del manual de marca (PDF) por análisis de colores vectoriales.

| Token | Hex | Uso |
|---|---|---|
| `violeta` (Russian Violet) | `#190933` | Texto principal, títulos, botón primario, fondos oscuros |
| `violeta-600` | `#41375B` | Texto de párrafos |
| `violeta-500` | `#584F72` | Texto secundario |
| `violeta-400` | `#6D6485` | Metadatos, notas, placeholders |
| `nube` (Cloud) | `#FDF5EE` | Fondo general; texto sobre violeta |
| `blanco-calido` | `#FFFCF9` | Tarjetas sobre fondo nube |
| `lavanda-100` | `#EEEDFF` | Fondos de sección alternos, cajas |
| `lavanda-300` (Lavender Dream) | `#BBBBFF` | Acuarelas, marcos, bordes destacados |
| `lavanda-500` | `#7D75E2` | **Palabra en cursiva del título** (Playfair italic) |
| `lavanda-600` | `#6559CA` | Íconos de línea, etiquetas secundarias |
| `lavanda-700` | `#4F43A4` | Hover de enlaces lavanda |
| `rosa-200` | `#F9DDF0` | Marcador/resaltado bajo UNA palabra |
| `rosa-300` (Blush Candy) | `#F0B4DF` | Cursiva sobre violeta; acuarelas |
| `rosa-500` | `#CD64B0` | Comillas grandes, números grandes |
| `rosa-600` | `#AC4691` | Etiquetas (eyebrow): Poppins 600, MAYÚSCULAS espaciadas |
| `borde` | `#EAE8F2` | Bordes suaves de tarjetas e inputs |

Tipografía: Poppins (400/500/600/700) para todo; Playfair Display (600 + italic 500/600) para títulos, frases y números grandes. Nada de una tercera fuente.

Tamaños web (manual p.1): título 44–56 px (móvil 32–36), subtítulo 32–40, etiqueta 13–14 px (Poppins 600, mayúsculas espaciadas ~0.18em, rosa-600), texto 17–18 px interlineado 1.6, botón 16 px Poppins 600, notas 14 px.

Formas: inputs radio 12 px; tarjetas 20 px; botones en píldora (`border-radius: 999px`). Íconos de línea 1.5–2 px, puntas redondeadas (lucide sirve), en violeta o lavanda-600. Sin sombras duras, sin emojis en diseños, sin clipart infantil, sin texto justificado, sin degradados en letras.

Elementos (máx. 2 por pieza): acuarelas (manchas radiales lavanda/rosa en esquinas de fondos claros, nunca detrás del texto ni en fondos oscuros), formas orgánicas (marco irregular lavanda→rosa para fotos de Hilda, sin cortar la cara), comillas grandes rosa-500, resaltado rosa-200 bajo una palabra.

Voz: cálida, profesional, en segunda persona, sin culpa. Marca: **Sanar y Criar** (el programa/curso insignia puede llamarse "Sanar para Criar", como en el manual). Profesional: Hilda Hernández, Psicóloga Clínica Infanto-Juvenil, FPV 8.914, Lechería (Anzoátegui, Venezuela), 100% online. WhatsApp +58 424 8824634. Instagram @sanarycriarve.

**Ética (obligatorio):** Hilda es psicóloga colegiada. No publicar testimonios, cifras, cursos ni precios inventados como si fueran reales. Los testimonios del sitio anterior eran semillas ficticias: no se migran. Las secciones sin contenido real se ocultan hasta que haya contenido (dejar datos de ejemplo solo en archivos marcados `EJEMPLO`/no publicados).

## 2. API de pagos (backend, prefijo `/api/v1/payments`)

Lectura obligatoria: `docs/investigacion/payments-contract.md` (incluida su sección VERIFICACIÓN), `docs/investigacion/paypal.md`.

### 2.1 Ubicación
- Modelos: `apps/api/src/db/payments/` (auto-importados; tablas creadas por `create_all`). Nombres de tabla con prefijo **`sc_pay_`** para no chocar con las tablas legacy/EE (`paymentsconfig`, etc.): `sc_pay_config`, `sc_pay_offer`, `sc_pay_offer_resource`, `sc_pay_group`, `sc_pay_group_resource`, `sc_pay_group_sync`, `sc_pay_enrollment`, `sc_pay_order`, `sc_pay_webhook_event`. Campos enum como `VARCHAR`. Fechas `DateTime(timezone=True)`. Montos `Numeric(12,2)` (exponer como número en JSON).
- Además, añadir una migración Alembic idempotente (`has_table`) con `down_revision` = head actual, para instalaciones que usen Alembic.
- Servicios: `apps/api/src/services/payments/` (`access.py`, `offers.py`, `groups.py`, `checkout.py`, `fulfillment.py`, `stats.py`, `reconcile.py`, `providers/base.py`, `providers/registry.py`, `providers/paypal.py`).
- Router: `apps/api/src/routers/payments.py`, montado en `src/router.py` con `prefix="/payments"`. Usar convertidores `{org_id:int}` / `{offer_id:int}` o registrar rutas literales antes que paramétricas (`public-listing`, `by-resource`, `webhooks`).
- Autorización: **A** = admin/maintainer de la org (reusar la lógica de `require_org_admin`, superadmin incluido) + feature `payments` habilitada. **U** = usuario autenticado, no API token (`get_authenticated_non_api_token_user`). **P** = público (anónimo permitido).
- Desbloqueo OSS: quitar `'payments'` de `EE_ONLY_FEATURES` (`src/core/deployment_mode.py`). No usar `require_plan(...)` en nuestras rutas.

### 2.2 Endpoints existentes que el frontend ya consume (mantener forma exacta)
Configuración, ofertas, grupos, recursos, clientes, inscripciones: tal como C1–C8, O1–O11, G1–G10, R1–R3 en `payments-contract.md`, con estas decisiones:
- `GET /{org_id}/config` (A) → `[{id, org_id, provider, enabled, active, provider_specific_id, mode, creation_date, update_date, settings:{environment, client_id, has_secret, webhook_id, webhook_url}}]`. **Jamás** devolver el secreto. `client_id` de PayPal es público (va al navegador).
  - `settings.webhook_url` es la URL que la administradora pega en el panel de PayPal: `<base>/api/v1/payments/webhooks/<proveedor>/<org_id>`. `<base>` sale de `LEARNHOUSE_MEDIA_URL` (o `LEARNHOUSE_BACKEND_URL`); sin ella se adivina `https://api.<LEARNHOUSE_DOMAIN>`, que en nuestro despliegue no existe. En producción: `LEARNHOUSE_MEDIA_URL=https://cursos.sanarycriarve.com` (ya está en `deploy/.env.example`). La misma base hace absoluta la `thumbnail_url` de `public-listing`.
- `POST /{org_id}/config?provider=paypal` (A) body `{provider:'paypal', enabled, client_id, client_secret, environment:'sandbox'|'live', webhook_id?}` → valida pidiendo token OAuth2 a PayPal; si funciona `active=true`, `provider_specific_id = app_id` del token. Secreto cifrado con `src/services/webhooks/crypto.py`. 409 si ya existe config de ese proveedor.
- `PUT /{org_id}/config/{config_id}` (A, nuevo) mismo body parcial; re-valida.
- `DELETE /{org_id}/config?id=` (A) → 200.
- Ofertas: `DELETE /{org_id}/offers/{offer_id}` archiva y responde **HTTP 200** `{"detail":"Offer archived"}`. `PUT` es parcial. Solo `offer_type='one_time'` (400 si `subscription`: el proveedor no soporta recurrentes). `amount >= 1`, `currency` en las soportadas por algún proveedor activo (PayPal: USD).
- `{offerid}` en rutas públicas y checkout acepta **id numérico o `offer_uuid`**.
- `GET /{org_id}/offers/public-listing` (P) y `GET /{org_id}/offers/{id_or_uuid}/public` (P) → PublicOffer; cada `included_resources[]` lleva además **`product_type`** (`'course'|'ebook'`, de `course.extra_metadata.product_type`, por defecto `'course'`), **`course_uuid`** y **`thumbnail_url`** absoluta. Solo cursos publicados. 404 si archivada/no listada.
- `GET /{org_id}/offers/by-resource?resource_uuid=` (P): acepta uuid con o sin prefijo `course_`.
- `GET /{org_id}/enrollments/mine` (U) → MyEnrollment + `offer_uuid` + `resources:[{resource_uuid, course_uuid, name, product_type, thumbnail_url}]`.
- `GET /{org_id}/customers` (A) → como C4 pero con `payment:{provider, provider_order_id, last_charge_date, last_charge_amount, currency}` y `stripe:null`.
- `GET /{org_id}/overview` y `GET /{org_id}/transactions?limit&starting_after` (A, nuevos, genéricos). Mantener alias en las rutas `/stripe/overview` y `/stripe/charges`. `/stripe/subscriptions` → `{data:[]}`. `recent_charges` siempre presente.
- `POST /{org_id}/billing/portal` → 404 `{detail:"No billing portal for this provider"}`.

### 2.3 Endpoints nuevos (checkout)
| Ruta | Auth | Contrato |
|---|---|---|
| `GET /{org_id}/checkout/providers` | P | `[{provider:'paypal', label:'PayPal', environment, client_id, methods:['paypal','card'], currencies:['USD']}]` solo de configs activas. |
| `POST /{org_id}/offers/{id_or_uuid}/checkout?redirect_uri=&provider=paypal&method=paypal\|card` | U | Valida `redirect_uri` (origen permitido: frontend_domain/allowed_origins/localhost en dev; anti open-redirect). 409 `{detail:{code:'ALREADY_OWNED'}}` si ya tiene acceso. Crea `sc_pay_enrollment(pending)` + `sc_pay_order(created)` y llama `provider.create_checkout`. Respuesta `{checkout_url, provider, order_uuid}`. PayPal: `return_url = redirect_uri + (?\|&)checkout=return&order=<order_uuid>`, `cancel_url = ...checkout=cancelled&order=<order_uuid>`; `method=card` → `experience_context.landing_page='GUEST_CHECKOUT'`; `checkout_url` = link `rel=payer-action`. |
| `POST /{org_id}/orders/{order_uuid}/capture` | P (el `order_uuid` es secreto no adivinable; si hay usuario autenticado distinto al dueño → 404) | Captura idempotente (PayPal-Request-Id determinista) y cumplimiento. Respuesta `{status:'paid'\|'pending'\|'failed'\|'cancelled'\|'retry', order_uuid, offer_uuid, resources:[{resource_uuid, course_uuid, name, product_type, first_activity_uuid}]}`. `retry` = `INSTRUMENT_DECLINED`. |
| `GET /{org_id}/orders/{order_uuid}` | U (dueño) o admin | `{status, ...igual que arriba}` para sondeo cuando queda `pending`. |
| `POST /{org_id}/orders/{order_uuid}/cancel` | U (dueño) | Marca `cancelled` si no estaba pagada. |
| `GET /{org_id}/access?resource_uuid=course_…` | P (usa usuario si hay sesión) | `{for_sale:bool, has_access:bool, reason:'free'\|'purchased'\|'admin'\|'author'\|'anonymous'\|'none', offers_count:int}`. Fuente de verdad de "ya es tuyo" para el frontend. |
| `POST /webhooks/paypal/{org_id}` | ninguna (firma PayPal) | Verificación por postback (`verify-webhook-signature`, cuerpo crudo empalmado) con `webhook_id` de la config. Deduplicar por `event.id` en `sc_pay_webhook_event`. Manejar `CHECKOUT.ORDER.APPROVED` (capturar), `PAYMENT.CAPTURE.COMPLETED` (cumplir), `PAYMENT.CAPTURE.PENDING`, `DECLINED`/`DENIED` (fallo), `REFUNDED`/`REVERSED` (revocar solo si la captura quedó `REFUNDED`, no si es parcial). Responder 2xx siempre que la firma sea válida. |

### 2.4 Proveedor PayPal
- REST crudo con `httpx` (ya dependencia). Bases: sandbox `https://api-m.sandbox.paypal.com`, live `https://api-m.paypal.com`. **Override solo en desarrollo**: `LEARNHOUSE_PAYPAL_API_BASE` (y `LEARNHOUSE_PAYPAL_WEB_BASE` para la URL de aprobación) se ignoran si `development_mode` es falso.
- Orden: `intent CAPTURE`, `purchase_units[0]={reference_id: order_uuid, custom_id: order_uuid, invoice_id: 'SYC-'+order_uuid, description, soft_descriptor:'SANARYCRIAR', amount con breakdown, items:[{category:'DIGITAL_GOODS', quantity:'1', ...}]}`, `payment_source.paypal.experience_context={brand_name:'Sanar y Criar', locale:'es-VE', shipping_preference:'NO_SHIPPING', user_action:'PAY_NOW', payment_method_preference:'IMMEDIATE_PAYMENT_REQUIRED', return_url, cancel_url, landing_page}`. `Prefer: return=representation`.
- Captura: verificar `status COMPLETED`, moneda, `Decimal(value) == precio`, `custom_id == order_uuid`, id de orden PayPal guardado. `ORDER_ALREADY_CAPTURED` → GET y reconciliar. `PENDING` → orden `pending`, no se entrega.
- Token OAuth en caché por config, renovación 5 min antes; ante 401 invalidar y reintentar una vez.
- Reconciliación (`services/payments/reconcile.py`): tarea periódica cada 5 min, con lock en Redis (la corrección no depende de él: la captura es idempotente y el cumplimiento bloquea la fila).
  - Pregunta a PayPal por las órdenes `created`/`approved` de las **últimas 24 h** y por las `pending` de los **últimos 7 días** (una captura en revisión puede tardar días; así un webhook `COMPLETED` perdido igual entrega el acceso). `APPROVED` → captura; `COMPLETED` → cumple.
  - Expira (`expired`, motivo `ABANDONED`) las `created`/`approved` de más de 12 h que PayPal no dio por pagadas, y sin consultar las de más de 24 h. Las `pending` nunca se expiran solas.

### 2.5 Interfaz de proveedor (para SPIDI después)
```python
class PaymentProvider(Protocol):
    id: str                       # 'paypal' | 'spidi'
    label: str
    supports_subscriptions: bool
    supported_currencies: set[str]
    async def validate_config(self, cfg) -> tuple[bool, str | None, str | None]  # ok, provider_specific_id, error
    async def create_checkout(self, cfg, order, offer, user, *, return_url, cancel_url, method) -> CheckoutResult  # checkout_url, provider_order_id, raw
    async def confirm(self, cfg, order, params: dict) -> PaymentResult  # status: paid|pending|failed|retry, provider_capture_id, charged_amount, charged_currency, raw
    async def fetch_status(self, cfg, order) -> PaymentResult           # para reconciliación
    async def handle_webhook(self, cfg, request) -> list[ProviderEvent]  # verificado y normalizado
```
Estados de orden: `created → approved → paid → (accredited)`; `failed`, `expired`, `cancelled`, `refunded`. (SPIDI tiene dos fases `paid`/`accredited`; la entrega ocurre en `paid` por defecto.)

### 2.6 Cumplimiento (idempotente)
`fulfill_order(order)`: `SELECT … FOR UPDATE`; si ya `paid` → nada. Marcar orden `paid`, inscripción **`active`**. Asegurar membresía del usuario en la org (rol usuario). Añadir a los usergroups sincronizados del grupo de la oferta. Para cada curso cubierto: asegurar `Trail` (`check_trail_presence`) y `TrailRun`, disparar webhook `course_enrolled`. Invalidar cachés de acceso. Correo de confirmación en español con enlace al curso (`send_email`). Revocación: inscripción `refunded`, quitar de usergroups sincronizados; conservar TrailRun y progreso (sin acceso por el muro). Seguridad (docs/progreso/seguridad.md): no se abre un segundo checkout mientras otra orden de la misma oferta está `pending` (o `approved` hace <30 min) → 409 `PAYMENT_PENDING`; la captura se serializa por (usuario, oferta); si la inscripción ya la concede otra orden pagada, la nueva queda `paid` con `raw.duplicate_of` ("Cobro duplicado: reembolsar") sin quitarle la concesión a la primera; reembolsar la orden que concede deja la inscripción activa si otra orden pagada la cubre. Una vez al día se revisan en PayPal las capturas pagadas de los últimos 180 días (REFUNDED/REVERSED → revocar). Con configuración sandbox fuera de modo desarrollo solo las administradoras pueden comprar (403 `STORE_TEST_MODE`) y las órdenes guardan `raw.environment`.

### 2.7 Muro de pago
- `src/core/ee_hooks.py::check_ee_activity_paid_access`: si no hay EE, delegar en `src.services.payments.access.check_activity_paid_access(request, activity_id, user, db)` (en lugar de `return True`).
- Regla: un curso está **a la venta** si alguna oferta no archivada lo cubre (directo o vía grupo). Sin ofertas → libre. Anónimo → no. Admin/maintainer de la org o autor/colaborador activo del curso → sí. Inscripción `active`/`completed` en cualquier oferta (incluso archivada) que cubra el curso → sí. Si no → no.
- Memoizar en `request.state` cuando hay `request`; caché corta (60 s) en Redis por `(user_id, course_id)` invalidada al cumplir/revocar. Debe ser una consulta indexada: se llama en cada Range/segmento de video.
- `services/courses/chapters.py::_apply_locks_to_chapters` revisa solo la primera actividad: dejar así (pago por curso), pero asegurar que autores pasan (el hook ya lo hace).
- `add_course_to_trail`: si el curso está a la venta y el usuario no tiene acceso → 402 `{code:'PAYMENT_REQUIRED'}`.
- Invalidar la caché anónima de `/meta` (`invalidate_course_meta_cache`) al crear/archivar ofertas o cambiar recursos.

### 2.8 CORS para el sitio de marketing
Nueva variable `LEARNHOUSE_EXTRA_CORS_ORIGINS` (lista separada por comas). Solo amplía CORS (sin credenciales) para lecturas públicas. Cambio mínimo en `src/core/middleware/cors.py`.
- Producción: `LEARNHOUSE_EXTRA_CORS_ORIGINS=https://www.sanarycriarve.com,https://sanarycriarve.com` (ya en `deploy/.env.example`). Sin ella, el catálogo de www no puede refrescarse en el navegador y muestra el de la compilación.
- Producción: ninguna variable `LEARNHOUSE_PAYPAL_*` (se ignoran fuera de `development_mode`, ver §2.4).

## 3. API de progreso (prefijo `/api/v1/progress`)

Lectura obligatoria: `docs/investigacion/access-progress.md` (secciones 3, 5 y VERIFICACIÓN).

- Tabla `activityprogress` (`src/db/activity_progress.py`): `org_id, user_id, course_id, activity_id, position_seconds, duration_seconds, max_position_seconds, page, completed, client_ts, creation_date, update_date`; único `(user_id, activity_id)`; índice `(user_id, course_id, update_date)`. Migración Alembic idempotente.
  - `client_ts BIGINT NULL` llegó después (migración `7b5dee2850d6`, tras `a9c8b7d6e5f4`). En una base creada con `create_all`, `services/progress/schema.py` añade la columna una vez por proceso si falta.
- `PUT /progress/activity/{activity_uuid}` (U): body `{position_seconds>=0, duration_seconds?, page?, completed?:bool, client_ts?}`; `verify_activity_reader_access` (402 si no pagó); upsert Postgres; `max_position` con `greatest`; si es video y `max_position/duration >= 0.9` o `completed=true` y aún no hay TrailStep → `add_activity_to_trail` (auto-completar). Límite de frecuencia suave (`check_rate_limit`, 60/min por usuario). Respuesta: fila (incluye `client_ts`).
  - `client_ts` (opcional): reloj del cliente en **epoch ms** (`Date.now()`) en el momento de leer la posición. Se descartan los decimales; negativo o mayor que 10¹³ → 422. El frontend lo envía desde `useProgressSaver` y lo conserva en los guardados en cola y `keepalive`.
  - Regla de orden: un guardado con `client_ts` **anterior** al guardado no mueve hacia atrás `position_seconds`, `page`, `update_date` ni `client_ts` (responde 200 con la fila actual), **solo mientras el guardado almacenado tenga menos de 10 minutos según el reloj del servidor**. Pasados 10 minutos vuelve a ganar el último que escribe; así un dispositivo con el reloj adelantado no congela la posición en los demás.
  - Aun descartado, el guardado tardío cuenta para `max_position_seconds`, la finalización y una duración que faltaba. La decisión se toma dentro del propio upsert, así que dos guardados simultáneos no pueden ganar los dos. Sin `client_ts` se comporta como antes (gana el último).
- `GET /progress/course/{course_uuid}` (U, lectura del curso) → `{last:{activity_uuid, activity_type, activity_name, chapter_name, position_seconds, duration_seconds, page, update_date, completed}|null, items:[{activity_uuid, position_seconds, duration_seconds, max_position_seconds, page, completed}]}`.
- `GET /progress/activity/{activity_uuid}` (U) → fila o `null`.
- Borrar filas del curso al salir del curso (`remove_course_from_trail`), en `reset_user_progress` y `remove_activity_from_trail` (una línea en cada uno).

## 4. Frontend de LearnHouse

### 4.1 Comercio (dueño: agente "comercio")
- Desbloqueo: `services/plans/plans.ts` (quitar `payments` de `OSS_BLOCKED_FEATURES`) y borrar la "Gate 1" de `app/orgs/[orgslug]/dash/payments/[subpage]/page.tsx`.
- Configuración: tarjeta PayPal con formulario (Client ID, Secret, Entorno sandbox/live, Webhook ID) en `PaymentsConfigurationPage`; sin ventana OAuth. Tarjeta "Pago Móvil (SPIDI) — próximamente" deshabilitada.
- Encabezado del panel: enlace al panel de PayPal según entorno en lugar de Stripe.
- Ofertas: ocultar `subscription`; USD por defecto. Clientes/Resumen/Transacciones: usar `/overview` y `/transactions`; ocultar pestaña Suscripciones y MRR/ARR/churn; chip de proveedor en vez de tarjeta.
- Página de oferta/checkout (`store/offers/[offerid]/offer-detail.tsx`): botones "Pagar con PayPal" y "Pagar con tarjeta (vía PayPal)" (redirección, sin SDK JS). Si no hay sesión: tarjeta con "Crea tu cuenta" / "Inicia sesión" que vuelven a la oferta (`redirect`). Al volver con `?checkout=return&order=…` → pantalla "Confirmando tu pago…" que llama `capture`; éxito → "¡Listo! Ya tienes acceso" con botón al curso/ebook e invalidación de queries; `pending` → sondeo cada 5 s hasta 2 min con mensaje "Tu pago está en revisión"; `cancelled` → aviso amable. Mostrar `detail` de errores (409 ALREADY_OWNED → "Ya tienes este producto").
- Propiedad del curso: `CoursesActions`/`CourseActionsMobile` usan `GET /payments/{org}/access` (no la existencia de TrailRun). Si `for_sale && has_access` → "Continuar"/"Empezar" (nunca "Abandonar curso" para cursos pagados). Si `for_sale && !has_access` → tarjetas de oferta. Si libre → comportamiento actual.
- `AccountPurchases`: enlace "Ir al curso"/"Leer ebook" por recurso; ocultar portal de facturación; enlaces por `offer_uuid`.
- Corregir enlaces `offer_id` → `offer_uuid` y los toasts de éxito falsos (`res.success`).
- Textos nuevos: **no editar `locales/*.json`**; escribir claves nuevas en `apps/web/locales-sc/commerce.es.json` y `commerce.en.json` (el agente de marca las fusiona). Usar `t('clave')` normalmente.

### 4.2 Experiencia de aprendizaje (dueño: agente "aprendizaje")
- Servicio `services/courses/progress.ts`, hook `hooks/queries/useCourseProgress.ts`, claves en `lib/query/keys.ts` (`progress.course`, `progress.activity`).
- Reanudar video: en `Video.tsx` combinar `?t=` > posición guardada > `details.startTime`; adjuntar listeners al `<video>` vía `onVideoElement` (sin tocar `LearnHousePlayer.tsx` si es posible); guardar cada ~10 s de reproducción y siempre en pause/seeked/ended/ocultar/desmontar (`fetch` con `keepalive`); espejo en `localStorage` (try/catch). Aviso "Reanudando en mm:ss · Empezar desde el inicio". YouTube: `start` y sondeo de `getCurrentTime`.
- Página del curso (`course.tsx`): tarjeta "Continuar donde lo dejaste" (actividad, capítulo, mm:ss, barra de progreso) con enlace profundo `?t=`; si la última está completa, la siguiente.
- Menú de capítulos (`ActivityChapterDropdown.tsx`): barra fina de progreso por actividad.
- `TrailCourseCard`: enlace "continuar" al punto exacto.
- Ebooks: si `course.extra_metadata.product_type === 'ebook'`: la página del curso muestra portada grande, descripción y botones "Leer ahora"/"Descargar PDF" (tras comprar) en lugar de la lista de lecciones/progreso/certificado. Interruptor "Tipo de producto: Curso / Ebook" en la edición del curso (dashboard → curso → general). PDF: recordar última página si es factible (`?page=`), si no, omitir.
- Textos nuevos en `apps/web/locales-sc/learning.es.json` / `.en.json` (no tocar `locales/*.json`).
- **No editar** `CoursesActions.tsx`, `CourseActionsMobile.tsx` ni archivos de pagos (son del agente de comercio).

### 4.3 Marca e idioma (agente "marca", se ejecuta después de 4.1 y 4.2)
Fuentes (Poppins + Playfair Display), tokens de color, botones píldora, tarjetas 20 px, español por defecto (sin detector de idioma del navegador; `lang="es"`), traducción de las claves faltantes visibles para alumnas, fusión de `locales-sc/*.json`, "LearnHouse" → "Sanar y Criar" en textos visibles, favicon/logo, pie con enlace "Código fuente" (cumplimiento AGPL §13, URL en `NEXT_PUBLIC_SC_SOURCE_URL`), correos en español con marca.

### 4.4 Configuración de la organización (`deploy/scripts/configurar-organizacion.py`)
La organización se configura con este script (API HTTP real como administradora, idempotente, `--simular` para ver los cambios sin aplicarlos). Se ejecuta en local y tras el primer despliegue (`docs/despliegue.md` §5, paso 6; uso local en `docs/desarrollo-local.md`).
- Marca: nombre, descripción, color `#190933`, fuente vacía, idioma `es`, sin marca de agua, remitente de correos, SEO e imágenes.
- Menú público: solo "Cursos" y "Tienda".
- Funciones apagadas para toda la organización (interruptores de administración, `PUT /orgs/{id}/config/<función>`): biblioteca (`folders`), pódcasts, comunidades (incluye sus discusiones), espacios interactivos (`playgrounds`), tableros (`boards`) e IA con su Copilot (`PUT /orgs/{id}/config/ai?ai_enabled=false&copilot_enabled=false`).
  - Efecto: `resolved_features.<función>.enabled = false`. Las páginas `/library`, `/podcasts`, `/communities`, `/playgrounds` y `/boards` muestran "… no disponible", el panel oculta esas secciones y desaparece "Preguntar a la IA" en las lecciones (`useGetAIFeatures` lee `resolved_features.ai`).
  - No hay proveedor de IA configurado. Con la IA apagada tampoco se pueden generar subtítulos ni capítulos automáticos de los videos; si algún día se configura un proveedor, vuelve a encenderla desde el panel (Organización → IA).
  - No se tocan cursos, pagos/tienda, certificados ni tareas.
- Al final, el script vuelve a leer la organización y falla (código 1) si la API sigue resolviendo alguna de esas funciones como encendida (por ejemplo, un plan de pago que la garantiza).

## 5. Sitio de marketing (`sanarycriar/web`)

Lectura obligatoria: `docs/investigacion/replit-map.md`.

- Astro (última estable) + `@astrojs/react` + Tailwind v4 (`@tailwindcss/vite`), `@astrojs/sitemap`. Salida estática. Node 24.
- Reutilizar el diseño aprobado (Home de Replit) aplicando el manual (hero p.3: wordmark "Hilda Hernández · Psicóloga Infanto-Juvenil", foto con marco orgánico lavanda→rosa, H1 "Antes de corregir a tu hijo, *descubre* qué se activa en ti.", CTA principal configurable "Reserva tu lugar en la clase gratuita" + "Agenda tu consulta").
- Un único `src/site.config.ts` con nombre, dominios, URL de la plataforma (`https://cursos.sanarycriarve.com`), id de org, WhatsApp, Instagram, FPV, enlace de clase gratuita, enlace de agenda (opcional; si vacío → WhatsApp).
- Páginas: `/`, `/cursos` (catálogo cursos + ebooks desde `GET {API}/payments/{org_id}/offers/public-listing`: en build si está disponible + refresco en el cliente con isla React; si falla, CTA a la plataforma), `/sobre-mi` (opcional), `/talleres`, `/test-de-crianza` (quiz sin login; muestra el resultado directamente + CTA clase gratuita), `/testimonios` (oculto si no hay reales), `/preguntas-frecuentes` (reescrito: PayPal ahora, Pago Móvil pronto; cuenta necesaria para ver el contenido; acceso inmediato), `/blog` + `/blog/[slug]` (Markdown en `src/content/blog`, sin posts inventados; el enlace del menú se oculta si no hay posts), `/agenda`, `/links` (bio de Instagram), `/terminos`, `/privacidad`, `/reembolsos` (plantillas marcadas "revisar con asesoría legal"), 404 en español.
- SEO: metas por página, OG 1200×630 nueva, JSON-LD ProfessionalService/Person con datos nuevos, `sitemap`, `robots.txt`, canonical `https://www.sanarycriarve.com`.
- Sin Supabase, sin backend propio. Accesible (sin `maximum-scale`), `prefers-reduced-motion`.
