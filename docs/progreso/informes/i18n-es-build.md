## Done

Workstream key: `idioma-es`. Progress log: `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/idioma-es.md`

**1. Spanish is the default in the web app** (`apps/web/lib/i18n.ts`)
- `es.json` is now the bundled locale, so the server render and the first client render are both Spanish. `en.json` loads on demand, and also silently in the background as a last fallback.
- `fallbackLng` is `['es','en']`. There is no browser-language, cookie, path or subdomain detection.
- Detection order is `scUserPick`, then `?lng=`, then `es`. `scUserPick` returns the stored `i18nextLng` only when the `i18nextLng_userPicked` flag is set.
- `changeLanguage()` (used by every language picker) now sets that flag. A new `applyOrgLanguage()` switches language without setting it.
- `bindI18nStore: 'added'` re-renders the page when a picked language's bundle arrives.
- `apps/web/public/dir-init.js` follows the same order and falls back to `es`.
- `OrgLanguageSync.tsx` uses `es` when the org has no explicit language, waits for the org to load, and uses `applyOrgLanguage`.

**2. Merge of `locales-sc`**
- `sc_commerce` and `sc_learning` are now in `locales/es.json` and `locales/en.json`.
- They are also in `ar.json` with the English text, because `tests/rtl-guard.test.mjs` requires `ar.json` to have every `en.json` key.
- `locales-sc/learning.*.json` is deleted; nothing imported it.
- `locales-sc/commerce.*.json` is kept because `useScT.ts` still imports it as a fallback. That file did not need changes.

**3. Translation of `es.json`**
- All 754 missing keys are translated, plus about 250 strings that were still in English (Biblioteca, Tienda, Pódcasts, Espacios interactivos, Acceso a la API, Menú, plan notices and others).
- Fixed missing accents in the SEO and domains pages.
- Unified terms: "alumno" → "estudiante", "Pizarras" → "Tableros". Made the tone gender-neutral and "tú": "Hola de nuevo", "¿Seguro que quieres…?" (34 strings), "Activa…".
- "LearnHouse" → "Sanar y Criar" where it names the platform. It stays where it names the software (import from LearnHouse, watermark, LearnHouse University, learnhouse.io).
- Removed 3 unused `es`-only keys (`editor.blocks.flipcard_block.*`).

**4. API emails**
- `translations.py`:
  - `DEFAULT_LANGUAGE = "es"`.
  - The Spanish bundle is complete, including the new `account_deleted`, `email_changed`, `org_created` and `org_deleted` groups, rewritten in a warm "tú".
  - `t()` falls back to es, then en, then the key.
  - Keys that name the platform say "Sanar y Criar" in every language.
  - `PLATFORM_NAME` and `FOOTER_LINE` are new constants.
- The "Powered by LearnHouse" footer is replaced by "Sanar y Criar · Hilda Hernández, psicóloga infanto-juvenil", linking to https://www.sanarycriarve.com (`POWERED_BY_URL` in `branding.py`).
- The default sender name is now "Sanar y Criar" (`sender.py`).
- Spanish is the default language in:
  - `OrgEmailBranding.lang`
  - `get_org_default_language` (`services/orgs/orgs.py`)
  - `GeneralCustomization.default_language` (`db/organization_config.py`)
  - the `lang` defaults in `services/users/emails.py` and `services/auth/magic_login.py`
- Emails sent without an org now use "Sanar y Criar" for `{brand}` instead of "LearnHouse".
- Updated and extended tests:
  - `test_email_translations.py` has a new class `TestSanarYCriarSpanish`.
  - `test_emails_service.py` has a new test `test_spanish_footer_line_by_default`.
  - Assertions updated in `test_magic_login.py`, `test_email_utils_service.py`, `test_org_default_language_service.py`, `test_org_invites_service.py` and `test_nudges_eligibility.py`.

**5. Dev org language**
- `PUT /api/v1/orgs/1/config/default_language?default_language=es` returned 200.
- `GET /orgs/slug/sanarycriar` returns `customization.general.default_language: "es"`.

## Verification
- **Locale check** (`node verify.cjs` in the scratchpad folder, list below): OK.
  - Valid JSON, 5,598 keys identical in es and en, no empty values.
  - Per key, the same `{{…}}` placeholders, HTML tags, `**`, `\n` and Markdown links.
  - No "LearnHouse" outside the allowlist.
  - All 411 `sc(…)` and `t('sc_…')` references in the code exist.
- **Typecheck:** `tsc --noEmit` exits 0.
- **ESLint** on my web files: 0 errors. The one warning is the existing `console.warn`.
- **bun tests:**
  - `rtl-guard`, `format-locale` and `billing-interval`: 20/20.
  - Full web suite: 421 pass, 14 fail. The failures are in `billing-internal-key` and `url-security`, which pass when run alone (29/29); it is interference between test files, not i18n.
- **API tests:**
  - Email and language tests: 617 pass across 22 files.
  - Full API suite: 7170 pass, 2 fail.
    - The nudges test now passes after the update.
    - `test_email_unsubscribe_support::test_send_email_forwards_headers_to_the_provider` also failed in an earlier agent's run; it is environment-dependent (the container uses SMTP, the test expects Resend).
- **SSR by curl:** `/login` is fully Spanish ("Hola de nuevo", "Iniciar sesión", "Enviarme un enlace de acceso", "Registrarse") with `<html lang="es">`.
  - The org pages (`/`, `/courses`, `/store`) render their body only on the client, so the browser check covers them.
- **Headless Chrome**, own profile, browser language set to English (`--lang=en-US`):
  - `/`, `/courses`, `/store` and `/signup` show Spanish nav and content ("Cursos", "Tienda", "Iniciar sesión", "Registrarse"), with `lang=es`.
  - A stale `i18nextLng=en` without the pick flag is ignored.
  - With the flag set, the dashboard switches to English; removing the flag brings back Spanish.
  - No console errors and no hydration warnings.
  - The dashboard is in Spanish apart from the hard-coded strings listed below.
- **Mailpit:** a password reset for alumna.api.prueba@example.com arrived with subject "Restablece tu contraseña" from "Sanar y Criar". The body is Spanish, it has the new footer linking to sanarycriarve.com, and it contains no "LearnHouse".

## Known gaps / TODO
- `locales-sc/fixes.{es,en}.json` (`sc_fixes`) is not merged; another agent was still writing it. Once they finish, add `['sc_fixes','fixes']` to the list in `apply.cjs` and run it again.
- The `useScT.ts` fallback import and `locales-sc/commerce.*` can be removed once nobody writes to those files.
- For a count in the millions, Spanish uses the CLDR "many" plural form and no `_many` keys exist, so i18next falls back to English or the base key. This is very unlikely to show up.
- Nudges are off by default, but `nudge.reactivation.whats_changed.subject` still says "LearnHouse" (it is about LearnHouse product updates).
- I edited a few files outside my strict list, keeping each change minimal and marked "Sanar y Criar:": `services/users/emails.py`, `services/auth/magic_login.py` (language defaults and the `{brand}` fallback), `services/orgs/orgs.py` (`get_org_default_language`), and the API tests listed above.

## Needed from others
- **Hard-coded English in components:**
  - Error pages: `lib/errors/catalog.ts` ("We couldn't find that", …), `components/Objects/StyledElements/Error/Error.tsx` and `app/global-error.tsx` ("Show/Hide technical details"; the keys already exist under `auth.sso_callback.show_details`).
  - `components/Dashboard/Pages/Users/OrgUsers/OrgUsers.tsx`: "N users", Export, FILTERS, All roles/statuses/groups, JOINED, STATUS, Verified, "Last login", "Inactive", and dates formatted in English.
  - `OrgEditGeneral.tsx`: "characters left" (key `characters_left` exists), and the org label options ("🌐 Languages" and the rest).
  - `OrgEditSEO.tsx` and `UserAuditExport.tsx`.
- **English page titles:** `app/auth/{login,signup,forgot,reset,verify-email}/page.tsx` (with a 'LearnHouse' fallback); `courses`, `library`, `communities`, `boards`, `podcasts`, `playgrounds`, `course/[courseuuid]`, `activity` and `user/[username]` pages under `app/orgs/[orgslug]/(withmenu)`; and `app/home/page.tsx`.
- **`lib/direction.ts` `detectClientLanguage`** still falls back to `navigator.language` (used only by `global-error.tsx` for text direction). It should follow `dir-init.js`: the flagged pick, then `?lng`, then `es`.
- **LearnHouse branding in the hub footer:** `components/Footers/LegalFooters.tsx` `CopyrightFooter` shows "© LearnHouse, Inc." and LearnHouse terms/privacy links (used on `app/home/home.tsx`).
- **Emails sent without an org** (account deleted, email changed, verification or magic link without an org) still show the LearnHouse SVG logo (`LOGO_SVG`) and the "LearnHouse Academy" link (`ACADEMY_URL`) in `services/users/emails.py`. They should use a Sanar y Criar wordmark.
- **Language pickers** (DashLeftMenu, DashMobileMenu, `home.tsx`, HeaderProfileBox, AuthLayout's LanguageSwitcher): any pick is now saved as the user's explicit choice. Remove them, or keep them, as the brand decision requires.

Scratchpad folder: `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/idioma-es/`
- `apply.cjs`: merge script, safe to re-run.
- `verify.cjs`: locale check.
- `tr-missing-1.json`, `tr-missing-2.json`, `tr-missing-3.json`, `tr-fix.json`: the translations.
- `sources/`: copies of the original `locales-sc` files.
- `cdp.mjs`: headless Chrome driver with an English browser locale.