# Progreso: cabos sueltos de inglés e i18n

Dueño: `apps/web/locales/*.json`, `apps/web/locales-sc/**`, `components/Payments/useScT.ts`, `lib/i18n.ts`, `lib/direction.ts`, `app/not-found.tsx`, `app/global-error.tsx`, `lib/errors/**`, `components/Objects/StyledElements/Error/**`, `components/Footers/LegalFooters.tsx`, los títulos (metadata) de `app/auth/**/page.tsx`, de las páginas de `(withmenu)` y de `app/home/page.tsx`, `OrgUsers/**`, `OrgEditGeneral/**`, `OrgEditSEO/**`, `UserAuditExport.tsx`, `AIImageButton.tsx`, la cadena "Generate with AI" de `CaptionsSettings.tsx`, `services/users/emails.py` y `services/email/**` de la API.

Scripts de trabajo (fuera del repo): `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/i18n-loose/` y `.../scratchpad/idioma-es/` (`apply.cjs`, `verify.cjs`).

## Estado (2026-10-23): TERMINADO (ver "Necesito de otros")

### Hecho
- Copia de seguridad de `es/en/ar.json` en `scratchpad/i18n-loose/`.
- `apply.cjs` acepta `--out=<dir>`. Corrido en seco: la salida es idéntica a los archivos actuales (idempotente).
- **Paso 1, fusión** (`apply.cjs`, lista `SC_BUNDLES`; idempotente, la segunda corrida da archivos idénticos):
  - `sc_fixes`: desde `locales-sc/fixes.*.json` (se conservan porque `useFixesT.ts` los importa).
  - `sc_errors`: nuevo `locales-sc/errors.{es,en}.json`. Se conserva en el repo porque `lib/errors` y `global-error.tsx` lo importan directamente (funcionan fuera de los providers).
  - `sc_brand`: todas las claves que usan `LegalFooters`, `ScOrgFooter`, `LandingClassic`, `OrgMenu` y `CourseThumbnail`. El español es igual al valor por defecto del código. Se agregó `sc_brand.copyright`. Fuente: `scratchpad/idioma-es/sources/brand.*.json`.
  - `sc_ui`: textos nuevos del panel (usuarios, organización, SEO, exportación de auditoría, "Generar con IA"). Fuente: `sources/ui.*.json`.
  - `sc_learning.trail.completed` (pedido por ui-estudiante): es "Completado", en "Completed".
  - `ar.json` recibe todos los `sc_*` en inglés (lo exige `rtl-guard`).
  - Ningún valor existente cambió; solo se agregaron claves (de 5.600 a 5.902 en es/en).
- `verify.cjs` ampliado:
  - Revisa también `t('sc_fixes|sc_errors|sc_brand|sc_ui.…')` y `fx('…')`.
  - Exige que `ar.json` tenga todas las claves de `en.json`.
  - Exige que `locales-sc/{commerce,fixes,errors}.*.json` coincidan con la copia fusionada.
  - `sc_brand.powered_by` queda en la lista permitida de "LearnHouse" (aviso AGPL).

- **Paso 2, textos fijos en inglés traducidos:**
  - Errores: `lib/errors/messages.ts` (nuevo, sin i18next). Lo usan `global-error.tsx` (fuera de los providers), `meaningfulMessage()` y el diálogo de reporte de Sentry (`report.ts`). `ErrorUI`, `ErrorActions` y `OrgNotFound` usan `t('sc_errors.…')`, con el paquete como `defaultValue`. Se tradujeron:
    - título, descripción y etiqueta de cada categoría;
    - botones y "Mostrar/Ocultar detalles técnicos";
    - causa, estado, código y ref.
  - "Escríbenos" (`contact_support`) lleva a `getScSiteUrl()`. Antes iba a `mailto:support@learnhouse.io`.
  - 404 global: `NotFoundContent.tsx` (nuevo) con la marca, `ScWordmark` y el botón "Volver al inicio". Título `Página no encontrada | Sanar y Criar`. Se conserva `dynamic = 'force-dynamic'`.
  - `OrgUsers.tsx`: contador, Exportar, Filtros, Todos los roles/estados/grupos, Verificado/Sin verificar, Ingreso, Estado, Último acceso, Activo/Inactivo, selección y borrado en lote, toasts. Fechas con `formatDate(…, idioma)`; antes eran `en-US`.
  - `OrgEditGeneral.tsx`: "quedan N caracteres" (con plural), etiquetas de la organización (sin cambiar el emoji), mensajes de validación de Yup. El idioma por defecto del selector pasa de `en` a `es`.
  - `OrgEditSEO.tsx`: toasts, "Mapa del sitio", placeholders, Subir/Cambiar imagen, Guardar, `aria-label` de copiar/abrir.
  - `UserAuditExport.tsx`: el PDF completo (títulos, resumen, estados, tipos de tarea, fechas en el idioma de la UI) y un toast si la exportación falla.
  - "Generar con IA": `AIImageButton.tsx` (etiqueta por defecto) y `CaptionsSettings.tsx` (solo esa cadena, con `<Trans>`).
- **Paso 3, títulos de página en español con respaldo "Sanar y Criar":**
  - Auth: Iniciar sesión, Crear cuenta, Recuperar contraseña, Restablecer contraseña, Verificar correo.
  - Hub `/home`: "Inicio | Sanar y Criar".
  - `(withmenu)`: Cursos, Biblioteca (y carpeta), Comunidades, Comunidad, Debate, Tableros, Pódcasts, Pódcast, Espacios interactivos, Curso, Actividad (sin "Course" al final; "¡Felicitaciones!" al terminar), Perfil, Cuenta (Configuración general/Perfil/Seguridad/Mis compras), Mi progreso, Copiloto.
  - Las migas JSON-LD dicen Inicio, Tableros, Comunidades, Pódcasts.
- **Paso 4:** `lib/direction.ts` `detectClientLanguage()` sigue el orden de `dir-init.js`: elección marcada, `?lng` y luego `es`. Ya no mira la cookie ni `navigator.language`. En el servidor devuelve `es`. `global-error.tsx` usa `useSyncExternalStore`, así la hidratación es consistente, y pone `lang` con el idioma del texto.
- **Paso 5:** `CopyrightFooter` muestra "© {año} Sanar y Criar · Hilda Hernández" (`sc_brand.copyright`) y enlaza a Términos y Privacidad con `getScSiteUrl('/terminos' | '/privacidad')`. Se quitaron `getPlatformUrl` y learnhouse.io.
- **Paso 6, correos sin org** (`services/users/emails.py`, `services/email/translations.py`):
  - El SVG de LearnHouse se cambia por `PLATFORM_LOGO_HTML`: el texto "Sanar *y* Criar" en Georgia, violeta #190933 con la "y" lavanda, enlazado a https://www.sanarycriarve.com.
  - `LOGO_SVG` queda como alias para `magic_login.py`.
  - `ACADEMY_URL` es https://www.sanarycriarve.com.
  - `academy_link_text` dice "sanarycriarve.com" en todos los idiomas.
  - Pie de bienvenida: es "¿Tienes alguna duda? En {academy_link} encuentras cómo escribirnos.", en "Any questions? You'll find how to reach us at {academy_link}.".
  - Tests actualizados: `test_emails_service.py` (bienvenida sin org, correos de plataforma con la marca nueva y sin "LearnHouse"), `test_magic_login.py` y `test_email_translations.py` (test nuevo del pie).
- **Test nuevo de la web:** `tests/sc-i18n-loose.test.mjs` (14 tests). Revisa:
  - cada categoría del catálogo con es/en;
  - las claves `sc_errors`, `sc_brand` y `sc_ui` usadas en el código, incluidas las dinámicas;
  - el respaldo a español;
  - `detectClientLanguage`;
  - que no queden textos en inglés en las pantallas de error;
  - el 404, el pie y los títulos.

- **Extra:**
  - Si un valor guardado ya pasa el límite, el contador dice "sobran N caracteres" en vez de un número negativo (`sc_ui.common.characters_over`).
  - Claves listas para `OrgContext.tsx`: `sc_errors.org_inactive.title` y `.description`.

### Verificado
- `verify.cjs`: OK.
  - 5.902 claves iguales en es y en; 551 referencias del código revisadas.
  - `ar.json` cubre todo `en.json`.
  - `locales-sc` coincide con la copia fusionada.
- `apply.cjs` es idempotente: una segunda corrida a `--out` da archivos idénticos.
- `tsc --noEmit`: limpio.
- ESLint de todos los archivos tocados: 0 errores. Los avisos son anteriores: `no-console`, `set-state-in-effect` de `global-error`/`BoundaryError` y `window.location` de `ErrorActions`.
- `bun test`:
  - Pasan `sc-i18n-loose` (14), `rtl-guard`, `format-locale`, `admin-authorization-denial`, `sc-fixes` y `not-found-and-enrollments`.
  - Suite completa: 435 pasan y 14 fallan. Son los mismos 14 de antes (`billing-internal-key` y `url-security`, por interferencia entre archivos).
- pytest de correo, magic link, invitaciones y nudges: 501 pasan y 1 falla. La falla es la de siempre, `test_email_unsubscribe_support::…forwards_headers_to_the_provider`: el contenedor usa SMTP y el test espera Resend.
- SSR por curl, `<title>`:
  - /login "Iniciar sesión | Sanar y Criar"
  - /signup "Crear cuenta | …"
  - /forgot "Recuperar contraseña | …"
  - /reset "Restablecer contraseña | …"
  - /verify-email "Verificar correo | …"
  - /trail "Mi progreso | …"
  - /account/general "Configuración general | …"
  - 404 "Página no encontrada | Sanar y Criar"
  - El texto visible de /login, /signup y /forgot está todo en español; "LearnHouse" solo aparece en el aviso AGPL.
- Chrome headless, con perfil propio en `scratchpad/i18n-loose/` y el navegador en inglés:
  - 404 en español con la marca (`404-es.png`).
  - `/dash` como estudiante: "No tienes acceso a esto / PERMISOS / …", Inicio, Cerrar sesión. "Mostrar detalles técnicos" abre "causa admin_only / estado 403" (`error-permission-details-es.png`).
  - Con la elección marcada en inglés, la misma pantalla sale en inglés y el 404 también. Al quitar la marca vuelve a español.
  - Como admin, Usuarios muestra "11 usuarios", Exportar, FILTROS, Todos los roles…, USUARIO/GRUPOS/INGRESO/ESTADO/ROL, "23 oct 2026", "Último acceso…" e "Inactivo · 0 d".
  - Organización > General muestra las etiquetas en español y "quedan N caracteres".
  - SEO muestra "Mapa del sitio:" y "Cambiar imagen".
  - Ninguna corrida tuvo errores ni avisos de consola.

### Necesito de otros
- **Despliegue** (`deploy/scripts/configurar-organizacion.py`): `ORG_DESCRIPTION` tiene 131 caracteres y el formulario de Organización > General acepta hasta 100. Ahí se ve "(sobran 31 caracteres)" y Yup no deja guardar ningún ajuste general hasta acortarla. Propuesta de 98 caracteres: "Cursos en video y ebooks de Hilda Hernández, psicóloga infanto-juvenil, para criar desde la calma.". Corregir también la org de desarrollo.
- **Dueño de `components/Contexts/OrgContext.tsx`:** `inactiveMessage` ("This organization is no longer active") y el submensaje de org desactivada siguen en inglés. Usar `t('sc_errors.org_inactive.title')` y `t('sc_errors.org_inactive.description')`, que ya existen en es/en/ar.
- **Dueño de `components/Dashboard/Pages/Users/UserAnalytics/format.ts`:** `fmtDate` y `fmtDateTime` usan `en-US` fijo (los usa el expediente del estudiante en pantalla), y `fullName` cae en 'Unknown'. Cambiarlos por `formatDate`/`formatDateTime` de `lib/format`, pasando `i18n.language`. El PDF de auditoría ya no los usa.
- **ui-estudiante (carpeta Video):** el resto de `CaptionsSettings.tsx` sigue en inglés ("AI Closed Captions", "Spoken language", la descripción, el toast de código inválido). Yo solo cambié "Generate with AI", con `<Trans i18nKey="sc_ui.ai.generate_with_ai">`.
- **Decisión de datos:** los nombres de rol vienen de la base ("User", "Admin"…) y se ven en inglés en la tabla de usuarios. Se podrían renombrar los roles de la org.
- **Pendientes del informe de idioma-es que siguen abiertos (no son míos):**
  - Reproductor de video en inglés.
  - "1 Actividades" en `course.tsx`: las claves `activities.count_*` ya existen.
