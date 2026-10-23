All five items are done and checked against the dev stack. Typecheck is clean, ESLint has 0 errors on the touched files (only 4 older unused-variable warnings), and the 390 px screenshots are saved.

1. **Payments tabs at 390 px:** the page no longer scrolls sideways on any of the four tabs (page width is 390, was 406).
   - **Cause:** the "Ver tienda" / "Panel de PayPal" buttons in the header could not shrink below one line. They now wrap (`[subpage]/page.tsx`).
   - **Configuración:** the red "Quitar" button was cut off inside the PayPal card. It now wraps on phones and sits beside the text again on desktop, where it had also been wrapping at 1280 px.
   - **Floating mobile menu:** it covered "Nueva oferta" at the bottom of Ofertas, so I added space below the content. That needed the Ofertas page root changed from `h-full` to `min-h-full`.
   - **Smaller tweaks:** 16 px side margins on phones, and the subtitle no longer gets cut off.
2. **Welcome modal:** the globe now has its own band and "Comenzar" sits below it. On the second step the feature grid replaces the globe, so the modal fits an 800 px screen.
   - I also made it list only the features the organization has turned on (5 of 9 now), and changed the logo's alt text from "LearnHouse" to "Sanar y Criar".
   - Upstream hides this modal below 640 px on purpose, so it can't appear at 390. I captured it at 640 and 1280 px instead.
3. **Page loader colour:** now `#7D75E2`.
4. **`configurar-organizacion.py`:** it now turns off library, podcasts, communities (including discussions), playgrounds, boards, and AI with Copilot.
   - It uses the real admin endpoints `PUT /orgs/{id}/config/<feature>` and `/config/ai`. Courses, payments, certificates and assignments are untouched. `--simular` works.
   - At the end it re-reads the organization and exits with code 1 if the API still reports any of these as on.
   - **Script runs:** first run changed the 6 settings; the second run reported nothing to change.
   - **API check:** `GET /api/v1/orgs/slug/sanarycriar` shows all 6 as off. Courses, payments, assignments, analytics and members stay on.
   - **Learner view (headless Chrome, test buyer):** before, the lesson showed "Preguntar a la IA" and `/library` and `/podcasts` opened normally. After, the button is gone, the video player still works, the five feature pages show "… no disponible", and `/courses` and `/store` work.
   - **Curl can't show this:** those routes still return 200 because the "no disponible" message is drawn in the browser. The frontend hides the AI button when `resolved_features.ai.enabled` is false.
   - **Side effect:** with AI off, automatic captions and chapters for videos are also blocked. They need an AI provider anyway; I noted this in the spec.
5. **Docs:**
   - `spec-tecnica.md`: reconciliation windows (24 h for created/approved, 7 days for pending, expiry after 12 h), `client_ts` and the 10-minute rule, `settings.webhook_url` / `LEARNHOUSE_MEDIA_URL`, production CORS values, and a new §4.4 on the organization settings.
   - `desarrollo-local.md`: rewritten with everything you listed (test command, PayPal mock, smoke test, `restaurar.sh --version`, the script, test users), plus test-data cleanup and line endings. I ran the documented test command: 18 passed.
   - `learnhouse/.gitattributes`: new. It forces LF line endings on `*.sh`, `docker/nginx.conf`, `apps/web/server-wrapper.js` and `Dockerfile`; confirmed with `git check-attr`.

I also deleted `deploy/scripts/__pycache__/`, which is generated junk that shouldn't go to git.

**Needed from others:**
- **Deploy owner:** `docs/despliegue.md` §5 step 6 and the §13 checklist describe the script as only setting language, colours, menu, SEO and logos. They should mention that it now also turns off library, podcasts, communities, playgrounds, boards and AI.
- **i18n:** the "not available" message uses the formal "usted" form ("Por favor, contacte a un administrador…"). The key is `common.features.disabled.public.description` in `locales/es.json`. The welcome modal's wording is also still generic LearnHouse text.
- **Repo owner:** `.gitattributes` only takes effect on commit or a fresh checkout. Current working copies still have CRLF, which the Dockerfile already handles.

Progress log: `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/panel-config.md`

Files changed:
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/dash/payments/[subpage]/page.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsConfigurationPage.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsOffersPage.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsGroupsPage.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsCustomersPage.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Onboarding/WelcomeModal.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/layout.tsx`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/.gitattributes`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/deploy/scripts/configurar-organizacion.py`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/spec-tecnica.md`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/desarrollo-local.md`

Screenshots in `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/capturas/learnhouse/`:
- `30-pagos-ofertas-390.png`
- `30-pagos-ofertas-final-390.png`
- `30-pagos-grupos-390.png`
- `30-pagos-configuracion-390.png`
- `30-pagos-resumen-390.png`
- `30-pagos-ofertas-escritorio.png`
- `30-bienvenida-640.png`
- `30-bienvenida-1280.png`
- `30-bienvenida-funciones-1280.png`
- `30-leccion-sin-ia-escritorio.png`
- `30-biblioteca-no-disponible-movil.png`