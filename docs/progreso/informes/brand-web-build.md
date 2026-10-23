The platform at cursos.sanarycriarve.com now looks like Sanar y Criar on every learner page, and the organization settings script runs cleanly and safely more than once. I checked it with headless Chrome at 1280 and 390 px, and with typecheck, ESLint and curl. The Source code link still points to upstream LearnHouse until the fork is published.

## Done

- **Fonts and colours**
  - `app/layout.tsx`: Poppins and Playfair Display, `lang="es"`, our icons, nube `theme-color`.
  - `styles/globals.css`:
    - Base colours mapped to the brand palette; 12px fields, 20px cards (`rounded-xl`).
    - Brand colour utilities: `bg-nube`, `text-violeta`, `text-rosa-600`…
    - Grey scales take the brand violet hue at the same lightness, so upstream contrast is unchanged; teal becomes lavender.
    - h1–h3 in Playfair with lining numerals; uppercase labels stay in Poppins.
- **Components** (`components/ui`): pill buttons, 12px inputs.
- **Header** (`OrgMenu.tsx`, `OrgMenuLinks.tsx`, new `ScWordmark.tsx` and `scBrand.ts`):
  - Light nube bar with the text wordmark, text links and "Volver al sitio" (`NEXT_PUBLIC_SC_SITE_URL`); new mobile menu.
  - No search box; Boards and Copilot icons only for staff.
- **Footer** (new `components/Footers/ScOrgFooter.tsx`, replaces the LearnHouse logo and watermark): the line you specified, Términos / Privacidad / Reembolsos to the marketing site, and the AGPL notice linking to `NEXT_PUBLIC_SC_SOURCE_URL`.
- **Language switcher**: removed from `HeaderProfileBox.tsx` and `AuthLayout.tsx`; kept in the dashboard.
- **Login, signup, reset** (`components/Auth/*`, `LegalFooters.tsx`): branded through a `.sc-auth` CSS scope, so no file under `app/auth/**` was edited and the `?redirect` logic is untouched.
  - Right panel: Hilda's photo in the organic frame and the manual's "Sanar tu historia para criar *distinto*."
  - Terms links point to our legal pages.
- **Home** (`LandingClassic.tsx`, `(withmenu)/page.tsx`): intro block, catalogue split into "Cursos en video" and "Ebooks", page title "Cursos y ebooks · Sanar y Criar".
- **Course card** (`CourseThumbnail.tsx`): styled like the marketing catalogue card, with equal heights.
- **Course and lesson pages** (`course.tsx`, `theater.css`, `activity.tsx`): brand cards, a violet video band, lavender progress.
- **Assets** (`public/`):
  - New: `sc-favicon.svg`, `sc-icon-192/512.png`, `sc-apple-touch-icon.png`, `sc-og-image.png`, `sc-logo-wordmark.png/svg`, `sc-hilda.webp`.
  - Replaced under the same names: `favicon.ico`, `empty_thumbnail.png` (brand placeholder cover), `lrn.svg` and `lrn-dash.svg` (now a "SyC" mark, which the player shows in white), `black_logo.png`, `learnhouse_bigicon*.png`.
  - The new files sit at the root of `public/` with an `sc-` prefix because `proxy.ts` only lets root-level files through.
  - The generator script is in my scratchpad: `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/marca-web/gen-assets.mjs`.
- **Script** `C:/Users/mente/Documents/Psicologa/sanarycriar/deploy/scripts/configurar-organizacion.py` (standard library only, `--simular`, never prints the password):
  - Name, description, colour `#190933`, empty font, language `es`, email sender name, watermark off.
  - Menu: only Cursos and Tienda.
  - SEO title suffix, description and OG image.
  - Logo, square logo, favicon and thumbnail uploads, only when missing unless `--reemplazar-imagenes`.
  - Refreshes the web app's cache when given `--web`.
- **Progress log**: `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/marca-web.md`.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → exit 0.
- ESLint on the touched files → 0 errors. The only warnings were there before (upstream `set-state-in-effect`, `refs` and `exhaustive-deps` in `activity.tsx`, `course.tsx` and `OrgMenu.tsx:104`).
- curl → 200 for `/`, `/courses`, the course page, the lesson page, `/store`, the offer page, `/login`, `/signup`, `/forgot`, `/account/purchases`, `/dash` and the new assets. The HTML has `lang="es"`, the new title and the org favicon.
- `python deploy/scripts/configurar-organizacion.py --env-file dev/api.env --web http://localhost:3200`:
  - First run: 12 settings updated, cache refreshed (HTTP 200).
  - Second run: everything "sin cambios".
  - Confirmed with `GET /orgs/slug/sanarycriar`.
- Headless Chrome, each session in its own isolated profile (visitor, buyer `alumna.api.prueba`, admin):
  - Pages: home, catalogue, course page (visitor and buyer), video lesson, store, offer, login, signup, forgot password, purchases, account, progress, mobile menu, 404, and three dashboard pages.
  - No horizontal scroll at 390 px on any page; the header fits at 820 px; the dashboard stays legible.
- 16 final screenshots in `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/capturas/learnhouse/`.

## Known gaps / TODO

- **Source code link**: `NEXT_PUBLIC_SC_SOURCE_URL` defaults to `https://github.com/learnhouse/learnhouse`. Set it to the published fork before launch, or the AGPL §13 source offer is not met.
- **Header logo**: the header always uses the text wordmark. A logo uploaded from the dashboard appears only in emails and the dashboard.
- **Hilda's photo**: it comes from an Instagram crop; regenerate `sc-hilda.webp` if a better one arrives.
- **Unused LearnHouse files**: `public/lrn-text.svg` and `components/Objects/Watermark.tsx` are no longer used but still exist.

## Needed from others

- **Fixes agent**: `components/Objects/Courses/CourseActions/CoursesActions.tsx:434` has the progress ring as `stroke="#10b981"`; change it to `#6559CA` (lavanda-600).
- **i18n agent**:
  - Add the `sc_brand.*` keys to es/en. They are used with Spanish defaults, so nothing breaks meanwhile.
  - Translate the global 404 page (`app/not-found.tsx`), the generic error screen ("We couldn't find that…"), "Generate with AI" and the "Store" label.
  - Fix the hydration mismatches: the server renders English and the client Spanish (for example the login `h1`).
- **Learning agent (optional)**: `TrailCourseCard` still shows green progress and "FINALIZADO".
- **Owner of `app/orgs/[orgslug]/layout.tsx:46`**: change the NextTopLoader colour from `#2e2e2e` to `#7D75E2`.
- **Deploy agent**:
  - Add `NEXT_PUBLIC_SC_SITE_URL` and `NEXT_PUBLIC_SC_SOURCE_URL` to the production `.env` and `.env.example`.
  - After the first deploy, run `configurar-organizacion.py --api https://cursos.sanarycriarve.com/api/v1 --web https://cursos.sanarycriarve.com --email …`.
- **Orchestrator decision**: AI is enabled for the org but no provider is configured, so learners see a "Preguntar a la IA" button on lessons. Either turn it off with `PUT /orgs/1/config/ai` or hide it.