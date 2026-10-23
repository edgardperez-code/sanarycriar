All seven steps are done. Every check passes except one email test and 14 web unit tests, all of which were failing the same way before.

**Verification**
- **`verify.cjs`:** OK. es and en have the same 5,902 keys, `ar.json` has every en key, and 551 key references in the code resolve. Running `apply.cjs` a second time produces identical files.
- **Typecheck and ESLint:** no errors. The warnings in the files I touched are old upstream ones.
- **Web unit tests:** `rtl-guard`, `format-locale`, `admin-authorization-denial`, `sc-fixes`, `not-found-and-enrollments` and a new `tests/sc-i18n-loose.test.mjs` (14 tests) all pass.
  - The full suite gives 435 pass and 14 fail. Those 14 are the ones in `billing-internal-key` and `url-security`, caused by test files interfering with each other.
- **API email tests:** 501 pass, 1 fails. The failure is `test_email_unsubscribe_support::test_send_email_forwards_headers_to_the_provider`: the container sends through SMTP and the test expects Resend.
- **Page titles over curl:**

  | Page | `<title>` |
  |---|---|
  | `/login` | Iniciar sesión \| Sanar y Criar |
  | `/signup` | Crear cuenta \| Sanar y Criar |
  | `/forgot` | Recuperar contraseña \| Sanar y Criar |
  | `/reset` | Restablecer contraseña \| Sanar y Criar |
  | `/verify-email` | Verificar correo \| Sanar y Criar |
  | unknown URL (404) | Página no encontrada \| Sanar y Criar |

  The visible text on those pages is all Spanish; "LearnHouse" only appears in the AGPL notice.
- **Headless Chrome** (own profile, browser set to English, no console errors):
  - The 404 page is Spanish and in the brand style.
  - `/dash` as the test buyer shows "No tienes acceso a esto", Inicio, Cerrar sesión and "Mostrar detalles técnicos", which opens causa / estado.
  - With English picked, the error screen and the 404 switch to English; removing the pick brings Spanish back.
  - As admin, the Usuarios, Organización > General and SEO pages render translated.

**What changed**
- **Locales:** `sc_fixes` is merged. Three new key groups were added: `sc_errors` (new `locales-sc/errors.{es,en}.json`), `sc_brand` (every key the brand components use) and `sc_ui` (new dashboard strings). `sc_learning.trail.completed` was added because the learner-UI agent asked for it. `ar.json` mirrors all of these in English, and no existing value changed.
- **Error screens:** the shared error screen, its buttons, the "enter your organization" screen and the Sentry report dialog are translated.
  - The new `lib/errors/messages.ts` holds the copy without depending on i18next, so `global-error.tsx` can use it outside the providers.
  - "Contact support" now goes to the Sanar y Criar website instead of `support@learnhouse.io`.
- **404 page:** new branded Spanish body (`NotFoundContent.tsx`) with a Spanish title. `force-dynamic` is kept.
- **Dashboard:**
  - **Users list:** all labels, filters and messages are translated, and dates now follow the UI language instead of US English.
  - **Organization > General:** "quedan N caracteres", the label options and the validation messages are translated, and the default-language fallback is now `es`.
  - **SEO settings** are translated.
  - **Student audit PDF:** every line is translated, and a failed export now shows a message instead of failing silently.
  - **"Generar con IA":** translated in `AIImageButton.tsx`, and in `CaptionsSettings.tsx` only that one string.
- **Page titles:** Spanish with a "Sanar y Criar" fallback on the auth pages, the hub home page and every metadata block under `(withmenu)`, including the breadcrumb names used for search engines.
- **`lib/direction.ts`:** `detectClientLanguage` now uses the user's explicit pick, then `?lng`, then `es`. It no longer reads the cookie or the browser language.
- **Hub footer:** "© {año} Sanar y Criar · Hilda Hernández", with Términos and Privacidad linking to sanarycriarve.com.
- **Emails sent without an organization:** a "Sanar y Criar" text wordmark replaces the LearnHouse SVG, and the welcome footer links to sanarycriarve.com instead of LearnHouse Academy. The email tests that checked the old logo and link are updated, plus one new test.

**Needed from others**
1. **Deploy:** the organization description in `configurar-organizacion.py` is 131 characters, but the General settings form allows 100. An admin can't save any General setting until it's shortened. A 98-character version: "Cursos en video y ebooks de Hilda Hernández, psicóloga infanto-juvenil, para criar desde la calma." The dev organization needs the same fix.
2. **Owner of `OrgContext.tsx`:** the "organization inactive" message is still English. The keys `sc_errors.org_inactive.title` and `.description` are ready.
3. **Owner of `UserAnalytics/format.ts`:** the on-screen student record still shows US-English dates.
4. **Learner-UI agent:** the rest of `CaptionsSettings.tsx` is still English.
5. **Data decision:** role names ("User", "Admin") come from the database and show in English in the users table.

Files are in `C:/Users/mente/Documents/Psicologa/sanarycriar/`:
- `docs/progreso/i18n-loose.md` (progress log)
- `learnhouse/apps/web/lib/errors/messages.ts`
- `learnhouse/apps/web/components/Objects/StyledElements/Error/NotFoundContent.tsx`
- `learnhouse/apps/web/locales-sc/errors.es.json`
- `learnhouse/apps/web/locales-sc/errors.en.json`
- `learnhouse/apps/web/tests/sc-i18n-loose.test.mjs`

The scripts and screenshots are in `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/`:
- `idioma-es/apply.cjs`
- `idioma-es/verify.cjs`
- `idioma-es/sources/brand.{es,en}.json`
- `idioma-es/sources/ui.{es,en}.json`
- `i18n-loose/404-es.png`
- `i18n-loose/error-permission-details-es.png`