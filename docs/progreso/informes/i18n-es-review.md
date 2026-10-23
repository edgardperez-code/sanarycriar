## Defects found and fixed
Ran `fix.cjs` (idempotent; keeps CRLF and the trailing newline) on `apps/web/locales/{es,en,ar}.json` and `apps/web/locales-sc/commerce.es.json`. All edits are in files this workstream owns.
- **Wrong term:** "alumnas"/"alumna" was still used instead of "estudiante(s)" in `sc_commerce.unconfigured.step3_description` and `sc_commerce.offer_form.description_placeholder`. Fixed in both es.json and commerce.es.json, so the `useScT` fallback copy matches.
- **Leftover English:** 5 strings still said "Playgrounds"/"playgrounds". They now say "espacios interactivos", matching the nav label.
- **Spain spelling:** "Vídeo"/"vídeo" became "Video"/"video" in 18 strings. The learner course page showed "Vídeo" next to "Video en alta calidad".
- **Account page wording:**
  - "Añadir General/Académico/Profesional" became "Agregar datos generales/académicos/profesionales".
  - "Añadir detalle" became "Agregar detalle".
  - "Serás desconectado…" (masculine) became "Tu sesión se cerrará después de cambiar…" (2 keys).
- **New plural keys:** added `activities.count_one` / `activities.count_other` to es, en and ar (ar uses English text, because rtl-guard requires every en key). The course page shows "1 Actividades"; the component still has to use these keys (see below).
- **Re-run safety:** I re-ran the implementer's `apply.cjs` after these edits. It does not undo them (`fix.cjs` then reported 0 changes).
- I added a "Review" section to `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/idioma-es.md`.

## Defects found but not fixed
These are outside my file ownership; a suggested fix follows each.
- **Video player in English:** labels and aria-labels say "Play", "Mute", "Seek", "Settings", "Enter fullscreen", and the mixed "Show duration, 4 segundos remaining". The @videojs `es` locale file is downloaded and `<html lang="es">` is set, but the player ignores it. Suggested fix in `components/Objects/Activities/Video/LearnHousePlayer.tsx`: add `import '@videojs/react/i18n/locales/es/register'`, and/or pass `locale={i18n.language}` to `<I18nProvider>`.
- **"1 Actividades":** `app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/course.tsx:605` renders `{chapter.activities.length} {t('activities.activities')}`. It should be `t('activities.count', { count: chapter.activities.length })`.
- **"Generate with AI" hard-coded:** in `components/Objects/AI/AIImageButton.tsx` (default label, visible on Cuenta > General) and in `components/Objects/Activities/Video/CaptionsSettings.tsx`.
- **"LearnHouse Academy" in one email:** the account-creation email sent without an org still says "Visita LearnHouse Academy" and shows the LearnHouse SVG logo. This is `ACADEMY_URL` / `LOGO_SVG` in `services/users/emails.py`; the implementer already reported it.

## Verification
Everything the implementer claimed held up, except the defects above.
- **Locale check:** `node .../scratchpad/idioma-es/verify.cjs` → OK. es and en have the same key set (5600 keys), with the same placeholders, tags and markdown per key. All 411 code references to `sc_commerce.` / `sc_learning.` keys exist. The 80 values identical to English are legitimate ("Video", "URL"…).
- **i18n logic:** checked against the real library code (i18next 26.5.4, browser-languagedetector 8.2.1):
  - With no detection, the language falls to `fallbackLng[0]` ('es').
  - `addResourceBundle(..., { silent })` exists in this version.
  - The language pickers use `changeLanguage`, which sets the pick flag. `OrgLanguageSync` uses `applyOrgLanguage`, which does not.
- **Web tests and lint:**
  - `bun test` for rtl-guard, billing-interval and format-locale: 20/20 pass.
  - `tsc --noEmit`: exit 0.
  - ESLint on `lib/i18n.ts`, `OrgLanguageSync.tsx` and `public/dir-init.js`: 0 errors, 1 existing `no-console` warning.
- **API tests:** pytest on the email, translation, branding and language tests: 970 passed, 1 failed. The failure is `test_email_unsubscribe_support::test_send_email_forwards_headers_to_the_provider`. It depends on the environment: the dev api.env sets `LEARNHOUSE_EMAIL_PROVIDER=smtp`, and the test expects Resend.
- **SSR by curl:** `/login`, `/signup`, `/forgot` and `/` all return `<html lang="es">`. `/login` contains "Hola de nuevo", "Iniciar sesión" and "Registrarse"; `/` contains "Cursos". The only English left is the `<title>` on signup and forgot ("Sign up", "Forgot Password"), already reported by the implementer.
- **Headless Chrome:** isolated profile with English browser language (`--lang=en-US`), port 9361, scratchpad `review-idioma-es/`. I logged in as the test buyer through the login form; the password was read from the env file and never printed.
  - Spanish pages: `/`, the course page, `/signup`, `/forgot`, `/store`, `/courses?lng=en` (the org default keeps it Spanish), `/account/purchases`, `/account/general`, `/account/security`, the activity player and the ebook course page.
  - A stale `i18nextLng=en` without the pick flag is ignored. With the flag set, `lang` is `en` and the page is in English; removing the flag brings Spanish back.
  - No console errors; the player screenshot shows no layout breakage.
- **Org language:** `GET /api/v1/orgs/slug/sanarycriar` returns `customization.general.default_language = "es"`.
- **Mailpit:** POSTed to `/api/v1/users/reset_password/send_reset_code` for `alumna.api.prueba@example.com`. The email arrived with subject "Restablece tu contraseña" from "Sanar y Criar <no-responder@sanarycriarve.com>". The body is Spanish, the footer reads "Sanar y Criar · Hilda Hernández, psicóloga infanto-juvenil" linking to https://www.sanarycriarve.com, and there is no "LearnHouse".
- **Org-less emails rendered directly:** account creation, account deleted, email changed, verification and magic link are all Spanish and name "Sanar y Criar".
- **Security:** no secrets in the files, no open redirect introduced, the footer URL is hard-coded https, and nothing else in this scope stood out.

## Needed from others
- **Learner UI owner:**
  - Fix the video player's language (`LearnHousePlayer.tsx`, fix above).
  - Change the activity count in `course.tsx:605` to `t('activities.count', { count })`.
  - Translate "Generate with AI" in `AIImageButton.tsx` and `CaptionsSettings.tsx`.
- **Still open from the implementer's report:**
  - English page titles under `app/auth/*` and `(withmenu)` pages.
  - Hard-coded English in error pages and `OrgUsers.tsx`.
  - `lib/direction.ts` `detectClientLanguage` still falls back to `navigator.language`.
  - The `CopyrightFooter` in `LegalFooters.tsx` still says "© LearnHouse, Inc.".
  - Org-less emails still show the LearnHouse SVG logo and the "LearnHouse Academy" link (`services/users/emails.py`).
  - The brand decision on the language pickers.
- **When the sc-fixes agent finishes:** merge `locales-sc/fixes.{es,en}.json` (`sc_fixes`) by adding `['sc_fixes','fixes']` to `apply.cjs` and re-running it.

Files:
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-idioma-es/fix.cjs`
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-idioma-es/cdp.mjs`
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-idioma-es/render_emails.py`
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-idioma-es/activity.png`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/idioma-es.md`