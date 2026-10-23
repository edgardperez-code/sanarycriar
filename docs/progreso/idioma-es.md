# Progreso: LearnHouse en español primero (web + correos de la API)

Dueño: `apps/web/locales/*.json`, `apps/web/locales-sc/*.json`, `apps/web/lib/i18n.ts`, `apps/web/public/dir-init.js`, `apps/web/components/Contexts/OrgLanguageSync.tsx`, `apps/api/src/services/email/**` y las constantes de idioma por defecto de la API.

Scripts de trabajo, fuera del repo, en `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/idioma-es/`:
- `apply.cjs` fusiona y es idempotente; se puede volver a correr.
- `verify.cjs` verifica.
- `tr-missing-*.json` y `tr-fix.json` tienen las traducciones.
- `sources/` guarda copias de los `locales-sc` originales.
- `cdp.mjs` maneja Chrome headless con el navegador en inglés.

## Estado (2026-10-22): TERMINADO salvo lo de "Pendiente"

### Hecho
- **Español por defecto en la web** (`lib/i18n.ts`):
  - `es.json` va en el bundle, así que el render del servidor y el primer render del cliente salen en español.
  - `en.json` se carga bajo demanda: al elegir inglés, o en segundo plano y en silencio (sin volver a pintar) como último respaldo.
  - `fallbackLng: ['es', 'en']`, sin detección del idioma del navegador. El orden es:
    1. `scUserPick`: el idioma guardado cuenta solo si la persona lo eligió (marca `i18nextLng_userPicked`).
    2. `?lng=`.
    3. Si no hay ninguno, `es`.
  - `changeLanguage()` es la función que usan todos los selectores de idioma y marca la elección como propia. `applyOrgLanguage()` es para `OrgLanguageSync` y no la marca.
  - `react.bindI18nStore: 'added'`: cuando llega el bundle del idioma elegido, se vuelve a pintar.
- `public/dir-init.js`: sigue el mismo orden y, por defecto, `es`.
- `OrgLanguageSync.tsx`: si la org no tiene idioma explícito, usa `es`. Espera a que cargue la org y usa `applyOrgLanguage`.
- **Fusión de `locales-sc`**:
  - `sc_commerce` y `sc_learning` están en `locales/es.json` y `locales/en.json`.
  - También están en `ar.json`, con el texto en inglés, porque `tests/rtl-guard.test.mjs` exige que `ar.json` tenga todas las claves de `en.json`.
  - `learning.{es,en}.json` se borraron: nadie los importaba. Los componentes usan `t('sc_learning.…', 'texto por defecto')`.
  - `commerce.{es,en}.json` se conservan: `components/Payments/useScT.ts` los importa como respaldo (`defaultValue`), así que no hizo falta tocar `useScT.ts`.
  - `fixes.{es,en}.json` (`sc_fixes`) no se fusionó. Es de otro agente que sigue activo, y `useFixesT.ts` funciona igual.
- **Traducción de `es.json`**:
  - Las 754 claves que faltaban, más unas 250 que seguían en inglés: Biblioteca, Archivos, Acceso, Tokens de API, Menú, Tienda, Pódcasts, Espacios interactivos, avisos de plan, Copiloto de IA…
  - Tildes que faltaban en SEO y Dominios.
  - Términos unificados: "alumno" → "estudiante", "Pizarras" → "Tableros".
  - Trato neutro y cálido: "Bienvenido de nuevo" → "Hola de nuevo", "¿Estás seguro de que…?" → "¿Seguro que…?" (34 frases), "¿Listo para empezar?" → "¿Todo listo para empezar?", "Habilite" → "Activa".
  - "LearnHouse" → "Sanar y Criar" donde nombra la plataforma: login, registro, bienvenida del panel, archivo de códigos 2FA, aviso de Stripe.
  - Se deja "LearnHouse" donde nombra el software: importar cursos de LearnHouse, marca de agua "Hecho con LearnHouse", LearnHouse University, learnhouse.io, página Explorar de LearnHouse, variables de Tinybird, copyright del hub.
  - Se quitaron 3 claves de `es.json` que no están en `en.json` ni se usan (`editor.blocks.flipcard_block.*`).
- **Correos de la API**:
  - `translations.py`:
    - `DEFAULT_LANGUAGE = "es"`.
    - El paquete `es` está completo: `account_deleted`, `email_changed`, `org_created` y `org_deleted` son nuevos, y el resto se reescribió cálido, con "tú".
    - `t()` busca primero en el idioma pedido, luego en `es`, luego en `en` y, si no lo encuentra, devuelve la clave.
    - Las claves que nombran la plataforma dicen "Sanar y Criar" en todos los idiomas, con un parche al final del archivo para no reescribir las cadenas upstream.
  - Pie de los correos con marca de la org: "Sanar y Criar · Hilda Hernández, psicóloga infanto-juvenil" (en inglés en los demás idiomas), con enlace a `https://www.sanarycriarve.com` (`POWERED_BY_URL` en `branding.py`). Reemplaza "Powered by LearnHouse".
  - Idioma por defecto "es" en:
    - `OrgEmailBranding.lang`
    - `get_org_default_language` (`services/orgs/orgs.py`)
    - `GeneralCustomization.default_language` (`db/organization_config.py`)
    - los parámetros `lang` de `services/users/emails.py` (13) y de `services/auth/magic_login.py`
  - Remitente por defecto "Sanar y Criar" (`sender.py`). Sin org, `{brand}` es "Sanar y Criar" (`magic_login.py` y la verificación de `users/emails.py`).
  - Tests actualizados y ampliados:
    - `test_email_translations.py`: clase nueva `TestSanarYCriarSpanish` (paquete es completo, mismos marcadores, sin "LearnHouse", cadena de respaldo es → en).
    - `test_emails_service.py`: nuevo `test_spanish_footer_line_by_default`.
    - `test_magic_login.py`, `test_email_utils_service.py`, `test_org_default_language_service.py` y `test_org_invites_service.py`.
- **Org de desarrollo**: `PUT /api/v1/orgs/1/config/default_language?default_language=es` → 200. `GET /orgs/slug/sanarycriar` → `customization.general.default_language = "es"`.

### Verificado
- `verify.cjs`:
  - JSON válido y 5598 claves iguales en es y en, sin valores vacíos.
  - Por clave, los mismos `{{…}}`, etiquetas HTML, `**`, `\n` y enlaces Markdown.
  - Ningún "LearnHouse" fuera de la lista permitida.
  - Las 411 referencias del código a `sc(…)` y `t('sc_…')` existen.
  - Los 73 valores iguales al inglés son legítimos (General, Video, Logos, URL…).
- `tsc --noEmit`: limpio.
- ESLint de `lib/i18n.ts`, `OrgLanguageSync.tsx` y `useScT.ts`: 0 errores. El único aviso es `no-console` en el `console.warn` upstream.
- `bun test`:
  - `rtl-guard`, `format-locale` y `billing-interval`: 20/20.
  - Suite completa: 421 pasan y 14 fallan. Los fallos están en `billing-internal-key` y `url-security`, y esos archivos pasan solos (29/29), así que es interferencia entre archivos, sin relación con i18n.
- SSR por curl de `/login`: todo en español ("Hola de nuevo", "Iniciar sesión", "Enviarme un enlace de acceso", "Registrarse"). `<html lang="es">`.
- Chrome headless con perfil propio y el navegador en inglés (`--lang=en-US`, `navigator.language = en-US`):
  - `/`, `/courses`, `/store` y `/signup` salen en español, con `lang="es"` y `i18nextLng=es`.
  - Un `i18nextLng=en` viejo sin la marca de elección se ignora.
  - Con la marca (elección propia), el panel cambia a inglés tras la carga diferida; al quitar la marca vuelve a español.
  - Cero errores o avisos de consola, sin problemas de hidratación.
  - El panel (`/dash`, cursos, usuarios, organización, pagos, tareas) sale en español, salvo los textos fijos del código listados en el informe.
- Tests de la API de correo e idioma: 617 pasan en 22 archivos.
- Suite completa de la API: 7170 pasan y 2 fallan.
  - `test_nudges_eligibility::test_bare_org_yields_zeroed_counts` esperaba `lang == "en"`; se actualizó a `"es"` y ahora pasa.
  - `test_email_unsubscribe_support::test_send_email_forwards_headers_to_the_provider` ya fallaba antes, en una corrida de otro agente: el contenedor usa SMTP (Mailpit) en lugar de Resend. No tiene relación con este cambio.
  - Nota: la suite, corrida dentro del contenedor `api`, envía correos de prueba reales a Mailpit (por ejemplo "Te damos la bienvenida a Test Org").
- Mailpit, restablecimiento de contraseña de `alumna.api.prueba@example.com`:
  - Asunto "Restablece tu contraseña" y remitente "Sanar y Criar".
  - Texto en español y pie nuevo enlazado a sanarycriarve.com.
  - Ninguna mención de LearnHouse.

### Pendiente
- Ver "Needed from others" en el informe: textos fijos en inglés dentro de componentes, títulos de página, logo de LearnHouse en los correos sin org, fusión de `sc_fixes`.

## Review (revisor independiente, 2026-10-22)

Revisé el diff real (`lib/i18n.ts`, `dir-init.js`, `OrgLanguageSync.tsx`, locales, `services/email/**`, defaults de idioma de la API), corrí las verificaciones y probé en Chrome headless con perfil propio (`--lang=en-US`), incluido el login de la estudiante de prueba en ese perfil aislado.

### Lo que se confirmó
- `i18n.ts`: con i18next 26.5.4 y el detector 8.2.1, si no se detecta nada, el idioma cae en `fallbackLng[0]` (`es`). `addResourceBundle(..., { silent })` existe en esta versión.
- Un `i18nextLng=en` viejo sin la marca se ignora. Con la marca, la página sale en inglés (`lang=en`) y, al quitarla, vuelve a español. Sin errores de consola.
- SSR: `/login` y `/` traen `<html lang="es">` y textos en español.
- `GET /orgs/slug/sanarycriar` devuelve `default_language: "es"`. `deploy/scripts/configurar-organizacion.py` también lo fija en producción.
- Mailpit: el restablecimiento de contraseña llega como "Restablece tu contraseña", de "Sanar y Criar", con el pie nuevo enlazado a https://www.sanarycriarve.com y sin "LearnHouse".
- Correos sin org, renderizados uno por uno (creación de cuenta, cuenta eliminada, correo cambiado, verificación, enlace mágico): todos en español.
  - Queda el SVG de LearnHouse en la cabecera.
  - La creación de cuenta sin org todavía dice "Visita LearnHouse Academy". Es la clave `academy_link_text` con `ACADEMY_URL` en `users/emails.py`, que no es de este workstream.
- Paquete `es` de correos: tiene todas las claves de `en` y los mismos marcadores `{…}`.

### Defectos corregidos (`fix.cjs` en `scratchpad/review-idioma-es/`; es idempotente y respeta CRLF)
- "alumnas"/"alumna" → "estudiantes"/"estudiante" en `sc_commerce.unconfigured.step3_description` y `sc_commerce.offer_form.description_placeholder`, tanto en `locales/es.json` como en `locales-sc/commerce.es.json`.
- Quedaban 5 cadenas con "Playgrounds"/"playgrounds": ahora dicen "espacios interactivos", igual que el menú.
- "Vídeo" → "Video" en 18 cadenas. Se veía en la página del curso, al lado de "Video en alta calidad".
- Página Cuenta:
  - "Añadir General/Académico/Profesional" → "Agregar datos generales/académicos/profesionales".
  - "Añadir detalle" → "Agregar detalle".
  - "Serás desconectado…" (en masculino) → "Tu sesión se cerrará después de cambiar…", en las 2 cadenas.
- Claves nuevas `activities.count_one` y `activities.count_other` en es, en y ar (en ar, con el texto en inglés, como pide `rtl-guard`). La página del curso muestra "1 Actividades"; el componente tiene que usarlas (ver "Needed from others").
- `apply.cjs` se volvió a correr después de estos cambios y no los deshace.

### Verificación del revisor
- `verify.cjs`: OK.
  - 5600 claves iguales en es y en.
  - 80 valores idénticos al inglés, todos legítimos ("Video", "URL"…).
- `bun test` de `rtl-guard`, `billing-interval` y `format-locale`: 20/20.
- `tsc --noEmit`: exit 0.
- ESLint de `i18n.ts`, `OrgLanguageSync.tsx` y `dir-init.js`: 0 errores.
- pytest de correo, idioma y branding: 970 pasan y 1 falla, `test_email_unsubscribe_support::test_send_email_forwards_headers_to_the_provider`.
  - Esa falla depende del entorno: el contenedor usa `LEARNHOUSE_EMAIL_PROVIDER=smtp` y el test espera Resend.

### Pendiente para otros (encontrado en la revisión)
- El reproductor de video (`LearnHousePlayer.tsx`) tiene las etiquetas y aria-labels en inglés: "Play", "Mute", "Seek", "Settings", "Enter fullscreen" y "Show duration, 4 segundos remaining".
  - El chunk `@videojs/core/.../locales/es` sí se descarga y `html lang="es"`, pero el skin no lo aplica.
  - Arreglo sugerido: `import '@videojs/react/i18n/locales/es/register'` y/o `<I18nProvider locale={i18n.language}>`.
- La página del curso (`course.tsx:605`) muestra `{n} {t('activities.activities')}`, que da "1 Actividades". Debe ser `t('activities.count', { count: n })`.
- "Generate with AI", fijo en el código: `AIImageButton.tsx` (label por defecto, visible en Cuenta > General) y `CaptionsSettings.tsx`.
