# Progreso: comercio (frontend web de LearnHouse, spec 4.1)

Dueño: agente "comercio". Archivos bajo `learnhouse/apps/web`.

## Estado (2026-10-22, segundo ingeniero): COMPLETO y verificado en navegador

### Hecho (heredado del primer ingeniero, revisado y corregido)
- Desbloqueo OSS: `services/plans/plans.ts` sin `payments`; Gate 1 eliminada en `dash/payments/[subpage]/page.tsx`.
- Encabezado del panel: enlace al panel de PayPal según entorno (`providerDashboardUrl`), sin Stripe.
- `PaymentsConfigurationPage`: tarjeta PayPal con formulario (Client ID, Secret write-only, entorno, Webhook ID, URL del webhook copiable; usa `settings.webhook_url` del backend si viene), estado Conectado/Sin validar, quitar config; tarjeta "Pago Móvil (SPIDI) · Próximamente" deshabilitada.
- Ofertas: solo pago único, monedas de los proveedores activos (USD por defecto), errores reales (`res.success`), invalidación de `['offers','by-resource']` y `['payments',org,'access']`.
- Clientes/Resumen/Transacciones: `/overview` y `/transactions`, sin suscripciones ni MRR/ARR/churn, chip de proveedor.
- Grupos y panel de recursos: toasts según `res.success`.
- `CoursesActions` / `CourseActionsMobile`: propiedad vía `GET /payments/{org}/access` (`components/Hooks/useCourseAccess.tsx`); nunca "Abandonar curso" en cursos pagados.
- `OfferCard`, `PaidCourseActivityDisclaimer`, `AccountPurchases` (enlaces por recurso, sin portal), tienda.
- Servicios: `services/payments/checkout.ts`, `providers/paypal.ts`, `payments.ts` (overview, transactions, removePaymentConfig).

### Hecho en esta sesión
- **`locales-sc/commerce.es.json` y `commerce.en.json` creados** (faltaban: rompían la compilación de toda página que importaba `useScT`, incluida la del curso). 342 claves, mismas en es/en, todas usadas.
- Página de oferta (`store/offers/[offerid]/offer-detail.tsx`) reescrita: botones por proveedor/método, tarjeta para visitantes sin sesión con signup/login que vuelven a la oferta, estado "ya lo tienes", retorno `?checkout=return|cancelled&order=` con captura, rechazo (`retry`), sondeo de pendientes (5 s, 2 min), errores con `detail`, invalidación de queries + `revalidateTags(['courses'])` + `router.refresh()`. Limpieza de la URL con `history.replaceState(null, …)` (con el estado interno de Next, la siguiente server action volvía a poner los parámetros).
- Metadatos en español en `store/offers/[offerid]/page.tsx`.
- Login/signup: `?redirect` se conserva entre login↔signup, al volver autenticado y al unirse a la org (`components/Payments/useAuthRedirect.ts`; ediciones mínimas en `app/auth/login/login.tsx`, `app/auth/signup/{signup,OpenSignup,InviteOnlySignUp}.tsx`).
- `PaymentWall.tsx` traducido y con enlace por `offer_uuid`; `usePaymentsEnabled` robusto (array, espera a la sesión).

### Verificado
- `tsc --noEmit`: limpio (exit 0).
- ESLint de los 35 archivos tocados: 0 errores (16 avisos, casi todos de patrones upstream: `no-console`, `set-state-in-effect`).
- HTTP 200 sin errores en el log del dev server: `/store`, `/store/offers/<uuid>`, `/store/offers/1`, `/store/offers/nope`, `/course/<uuid>`, `/login`, `/signup`, `/account/purchases`, `/dash/payments/{overview,offers,groups,configuration}`.
- Recorrido en navegador (pestaña propia, PayPal simulado):
  1. Admin: PayPal con `bad-client` → error del backend visible; con credenciales del simulador → "Connected", app id, enlace "PayPal dashboard (Sandbox)".
  2. Admin crea "Oferta de prueba (borrar)" (5 USD) para el curso "Curso de prueba (borrar)" (creado por API: curso 3, capítulo 4, una actividad publicada).
  3. Visitante: tarjeta "Crea tu cuenta" → signup con `?redirect` → cuenta creada → "Login" con `?redirect` → vuelve a la oferta con sesión.
  4. "Pagar con tarjeta" → simulador (landing tarjeta) → Cancelar → "Cancelaste el pago", orden `cancelled` en el backend.
  5. "Pagar con PayPal" → Aprobar → "¡Listo! Ya tienes acceso" + "Ir al curso"; URL limpia. Curso: "Este curso es tuyo", progreso, "Continuar" (sin "Abandonar"); la lección muestra el contenido pagado. Mis compras: tarjeta Activa con "Ir al curso".
  6. Otra compradora: tarjeta rechazada → "Tu método de pago fue rechazado" y botones disponibles; captura pendiente → "Tu pago está en revisión" (URL conserva `order`), al completar la captura en el simulador el sondeo pasa solo a "¡Listo!".
  7. Admin: Resumen/Clientes/Transacciones con datos reales y chip PayPal.

### Datos de prueba creados (BD local)
- Curso "Curso de prueba (borrar)" `course_b117f919-830b-4186-bd2d-3989a92138fa`; oferta `18df4829-e639-45eb-807f-655e2c4e9025`; config PayPal del simulador.
- Compradoras `compradora1.prueba@example.com` y `compradora2.prueba@example.com` (ambas con compra). Contraseñas generadas en `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/commerce/test-buyers.json`.

### Pendiente / conocido
- Textos en español verificados por archivo, no en pantalla: el navegador del entorno detecta inglés y cambiar `i18nextLng` afectaría pestañas de otros agentes. El agente de marca debe fusionar `locales-sc/commerce.*.json` y fijar `es`.
- En el panel oculto del navegador las animaciones no corren: los Select de Radix quedan "cerrando" y bloquean clics (artefacto del entorno, no del código).

## Decisiones
- Traducciones vía `useScT()` (envuelve `useTranslation`, prefijo `sc_commerce.`) con el JSON de `locales-sc` como `defaultValue`, para que funcione antes y después de la fusión del agente de marca.
- Propiedad de una oferta en la página de oferta: `enrollments/mine` (status active/completed y `offer_uuid`), más 409 `ALREADY_OWNED` del checkout.
- Los parámetros de retorno se quitan de la URL solo al llegar a un estado final; en `pending` se conservan para que recargar siga sondeando.

## Review (revisor independiente, 2026-10-22)

Revisé el código contra la spec 4.1 y el backend (`routers/payments.py`), y lo ejecuté de punta a punta. Usé Chrome headless con un perfil propio (sin tocar la sesión compartida de `localhost:3200`), con `i18nextLng=es` e `i18nextLng_userPicked`, así que esta vez **sí vi la interfaz en español**.

### Defectos corregidos
- **Redirección abierta** (`components/Payments/commerce.ts`, `safeRedirectPath`): la regex `^\/(?!\/)` aceptaba `/<TAB>/evil.com`, que el navegador convierte en `//evil.com`. Llegaba a `router.replace(...)` en `login.tsx` y a `getUriWithOrg` en `signup.tsx`. Ahora se valida con `safeInternalPath` de `@services/security/url`.
- **Orden de una oferta archivada a mitad de compra** (`offer-detail.tsx`): si la oferta ya no estaba disponible, la página mostraba "no encontrada" sin capturar el pago aprobado. Ahora el retorno se procesa igual y el panel de estado aparece también en la vista "no encontrada".
- **`checkout_url`** (`offer-detail.tsx`): se valida con `safeExternalUrl`, igual que `receipt_url` en `PaymentsCustomersPage.tsx`.
- **Miniaturas**: pasan por `safeImageSrc` y van entre comillas en CSS `url()` (`cssUrl`, en `offer-detail.tsx` y `store.tsx`). En `AccountPurchases`, la `<img>` también pasa por `safeImageSrc`.
- **Fecha en Mis compras** (`AccountPurchases`): ahora usa `paid_at`. Antes usaba `creation_date`, que es cuando empezó el checkout.
- **Accesibilidad** (`PaymentsConfigurationPage`): `aria-label` en los botones de solo ícono y el `Label` del entorno asociado a su `Select`.

### Verificado
- `tsc --noEmit` → 0. ESLint en los archivos tocados → 0 errores.
- HTTP 200 sin errores nuevos en el log en `/store`, la oferta, `?checkout=return&order=…`, `/store/offers/nope`, el curso, `/login`, `/signup`, `/account/purchases` y `/dash/payments/{configuration,overview}`.
- Recorrido en español con una compradora nueva, `compradora3.revision@example.com` (credenciales en `scratchpad/commerce/test-buyers.json`):
  - El curso sin sesión muestra la tarjeta de oferta y "¿Ya lo compraste? Inicia sesión", con `?redirect` al curso. El paywall de la actividad muestra lo mismo, con `?redirect` a la actividad.
  - Login con `?redirect` → vuelve a la oferta, con los botones "Pagar con PayPal" y "Pagar con tarjeta (vía PayPal)".
  - Aprobar en el simulador → "¡Listo! Ya tienes acceso", "Ir al curso".
  - El curso muestra "Este curso es tuyo" y "Continuar", sin "Abandonar", también en móvil (390 px, sin scroll horizontal).
  - Mis compras muestra "Activo", "Comprado el 22 oct 2026" e "Ir al curso".
  - `?checkout=cancelled` → "Cancelaste el pago". Una orden inexistente → "No encontramos este pago".

### Pendiente (no corregido)
- `proxy.ts` (no es nuestro) redirige a `/home` a quien ya tiene sesión y entra a `/login`, y pierde el `?redirect`. No afecta las páginas de oferta: los enlaces de login solo aparecen sin sesión.
- En móvil, la tarjeta de precio queda debajo de la descripción y los recursos, así que hay que bajar para ver los botones de pago. Es solo UX.
