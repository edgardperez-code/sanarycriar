## Done

The marketing site in `C:/Users/mente/Documents/Psicologa/sanarycriar/web` is finished, and it builds and type-checks cleanly. Most of it was already built by the previous engineer. I reviewed that work, kept it, and fixed the problems I found.

**What was already there (checked and kept):**
- **Stack:** Astro 7.4.2, @astrojs/react 7.1.1, Tailwind 4.3.3 via `@tailwindcss/vite`, @astrojs/sitemap 3.7.4. These are the current npm versions. Fonts are self-hosted with @fontsource.
- **Config:** `src/site.config.ts` with `PUBLIC_*` overrides, plus `.env.development` and `.env.example`.
- **Pages (all from spec §5):**
  - home
  - `/cursos`
  - `/sobre-mi`
  - `/talleres`
  - `/test-de-crianza`
  - `/testimonios`
  - `/preguntas-frecuentes`
  - `/blog` and `/blog/[slug]`
  - `/agenda`
  - `/links`
  - `/terminos`, `/privacidad`, `/reembolsos`
  - a Spanish 404 page and `robots.txt`
- **Islands:** `src/components/islands/CatalogIsland.tsx` (catalog) and `src/components/islands/ParentingQuiz.tsx` (quiz).
- **Brand assets:** `scripts/generate-brand-assets.mjs` generates `public/favicon.svg`, the icon PNGs and `public/og-image.png` (1200×630).

**Fixed in this session:**
- **Numbers:** Playfair showed old-style numerals ("1oo%", "o9"). It now uses lining numerals (`src/styles/global.css`).
- **Phone buttons:** the main button wrapped onto two lines on phones. Phones now show a shorter label, "Reserva tu clase gratuita" (`site.freeClass.mobileLabel`). Changed in:
  - Hero, final CTA, header menu
  - `EmptyState`, catalog island, quiz result
- **Watercolor:** the watercolor background ended in a hard line when the next section had the same background. It now fades out at the bottom.
- **Small fixes:**
  - a thin line now separates the final CTA from the footer (both are violet)
  - on phones the workshop number circle is hidden, so the titles have more room
  - the quiz has less padding on phones
  - "Volver a empezar" no longer wraps
  - courses without a cover image now get a soft lavender-to-pink placeholder
- **Missing spaces:** several spaces before links and bold text were missing in the rendered pages ("o lapolítica", "escríbeme" stuck to its link, two in `terminos`). Fixed with explicit `{' '}`.
- **URLs:** the sitemap listed `/agenda/` but the canonical tag said `/agenda`. The site now uses `trailingSlash: 'never'` and `build.format: 'file'`. A new `routePath()` in `src/lib/nav.ts` keeps the canonical, the active menu item and the sitemap consistent.
- **Phone menu link:** the "WhatsApp +58…" link pointed to the booking URL, so it would have opened the booking tool once one is set. It now always opens WhatsApp (`Header.astro`).
- **New files:** `web/README.md` (Spanish) and the progress log at `docs/progreso/sitio-marketing.md`.

## Verification

- **`npm run build`:** 14 pages, no errors or warnings. The only message is the expected one: the catalog can't be read when building without access to `cursos.sanarycriarve.com`.
- **`npx astro check`:** 0 errors, 0 warnings, 0 hints.
- **Dev server (`astro dev`, port 4321):** every page returned 200, `/ebooks` returned 301, and a missing page returned 404. **`astro preview`:** the clean URLs return 200 and a missing page returns 404.
- **Quiz:** `scratchpad/check-quiz.mjs` compared all 15 questions, the options, the intro, the instructions and the scoring key with the client's original text file. Everything matches.
  - In the browser, the answers ADDCDDABDDCDDBA gave Consciente 9, Autoritaria 2, Permisiva 2, Reactiva 2.
  - The draft saved to `localStorage` and came back after reloading.
- **Catalog against the local API:** `http://localhost:1338/api/v1/payments/1/offers/public-listing` now returns `[]`, with CORS allowed for both `localhost:4321` and `127.0.0.1:4321`. The site shows the "Muy pronto" state.
- **Catalog with test data:** I ran a mock in the scratchpad that returns the exact shape from `offers.py::_public_offer`.
  - When the build can reach it, the HTML contains 3 courses and 2 ebooks, each linking to `{platform}/store/offers/{offer_uuid}`.
  - When the build can't reach it, the island loads the products in the browser, on both `/cursos` and the home page.
- **Blog and testimonials:** tested with temporary data, then removed and the files restored. With content, the section, menu link, sitemap entry and JSON-LD all appear. Testimonials without `permiso: true` stay hidden.
- **Screenshots:** headless Chrome via a CDP script in the scratchpad.
  - Home at 1280 and 390 wide.
  - Quiz page, including the result.
  - `/cursos` with and without products.
  - Mobile menu: opens, closes with Escape, reopens.
  - The other secondary pages.
  - Compared against the brand manual pages and the hero on p.3.
- **Contrast:** every brand color pair passes WCAG AA. The lowest is the pink label on lavender at 4.50. The italic title word is 3.3 or higher on large text.
- **SEO tags:** OG and Twitter tags and canonical are correct. The JSON-LD parses on every page (ProfessionalService+Person, WebSite, FAQPage, BreadcrumbList).
- **Cleanup:** I stopped every server I started and closed my browser tab. That includes an `astro dev` the previous engineer left running on port 4321.

## Known gaps / TODO

- The free class and booking links (`PUBLIC_FREE_CLASS_URL`, `PUBLIC_BOOKING_URL`) are empty, so both open WhatsApp with a pre-filled message.
- The legal pages are drafts. They show the warning banner, are `noindex` and are left out of the sitemap. Someone needs to fill in the [brackets], have them reviewed, then set `src/data/legal.json` to `draft: false`.
- Hilda's photo is low resolution (it comes from an Instagram circle crop). A better original is needed.
- "Sanar y Criar" vs "Sanar para Criar" for the flagship course is still undecided. The hero stats don't name the course for now.
- With `build.format: 'file'`, a URL ending in a slash (like `/agenda/`) may return 404 on some hosts. The site never links that way; a host redirect rule would cover old links.

## Needed from others

- **Backend:** in production, `LEARNHOUSE_EXTRA_CORS_ORIGINS` must include `https://www.sanarycriarve.com,https://sanarycriarve.com`. Otherwise the browser can't refresh the catalog.
- **Backend:** please keep the `public-listing` fields stable: `offer_uuid`, `name`, `description`, `amount`, `currency`, and inside `included_resources[]`: `product_type`, `thumbnail_url`, `course_uuid`. The site reads exactly these.