## Defects found and fixed

1. **Favicon clipped and cramped**
   - File: `web/scripts/generate-brand-assets.mjs`
   - Why: satori added the padding to the 100% box, so the rounded violet square came out 520×546 inside a 512 viewBox. The bottom-right corner was cut off and the "C" touched the edge.
   - Fix: `boxSizing: 'border-box'` and slightly smaller letters. I regenerated `public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `og-image.png`. The OG image looks the same as before.

2. **Course images dropped when the API sends a relative path**
   - File: `web/src/lib/catalog.ts`
   - Why: the backend's `thumbnail_url()` (`services/payments/common.py`) returns `/content/...` when it has no media host configured. The site only accepted absolute URLs, so those images were thrown away.
   - Fix: relative paths now resolve against the API origin. Only http/https is still allowed, so `javascript:` is rejected. Checked with `scratchpad/check-catalog.mjs`.

3. **Skipped heading level on `/test-de-crianza`**
   - Files: `web/src/components/islands/ParentingQuiz.tsx` (new `headingLevel` prop) and `web/src/components/QuizSection.astro` (passes `h2` when the section title is `h1`).
   - Why: the question and result headings were `h3` directly under the page `h1`.

4. **404 page had `<link rel="canonical">` pointing to `/404`**
   - Files: `web/src/layouts/BaseLayout.astro` (new `canonical` prop) and `web/src/pages/404.astro` (`canonical={false}`).

5. **Blog could break the build or the sitemap**
   - Files: `web/src/content.config.ts`, `web/src/lib/content.ts`, `web/astro.config.mjs`, `web/README.md`.
   - Why:
     - A `.md` in a subfolder of `src/content/blog` failed the whole build ("Missing parameter: slug"). The glob was `**/`, but the `/blog/[slug]` route only takes one segment.
     - The sitemap listed `/blog` when the only post had a future date, while the page itself was empty and noindex.
   - Fix:
     - Only top-level files count as posts.
     - The sitemap now follows the same rules as `getPublishedPosts()`: no drafts, no future dates.
     - The README says not to use subfolders.
   - Tested with temporary future, subfolder and current posts, then deleted them.

6. **Home workshops button wrapped onto two lines at 390px**
   - File: `web/src/components/Workshops.astro`
   - Fix: the phone label is now "Modalidades y más"; the button measures 358×48, one line. It also uses `ArrowRight` instead of the outbound-link arrow, since it goes to `/talleres`.

## Defects found but not fixed

- **Test offer in the local database:** `public-listing` now returns "Oferta de prueba (borrar)" (offer id 1), apparently created by the commerce agent, and the site shows it correctly. It must be archived before any production build, or it will be baked into the static HTML. It is outside `web/`.
- **Catalog list is a live region:** after the browser refreshes the list, a screen reader may read the whole catalog again. Minor; I left it as it is.
- **`/ebooks` redirect:** it goes to `/cursos`, not `/cursos#ebooks`. Cosmetic; not changed.

## Verification

- **`npx astro check`** (in `web/`): 0 errors, 0 warnings, 0 hints, before and after the fixes.
- **`npm run build`:** 14 pages, no errors. The only message is the expected one that `cursos.sanarycriarve.com` can't be reached at build time.
- **Built output:**
  - `dist/404.html` has no canonical tag.
  - The quiz on `test-de-crianza.html` uses `h2` under the `h1`.
  - The sitemap has 8 URLs: no legal pages, no blog, no testimonials.
  - `ebooks.html` is a meta-refresh redirect to `/cursos`.
- **Dev server (`astro dev`, port 4321):** every page returned 200, `/ebooks` returned 301, a missing page returned 404, before and after the fixes. I stopped the server afterwards and checked the port is free.
- **Platform links:** `curl http://localhost:3200/store/offers/18df4829-…` and `/login` both returned 200.
- **API and CORS:** `curl -H "Origin: http://localhost:4321" http://localhost:1338/api/v1/payments/1/offers/public-listing` returned 200 with `access-control-allow-origin: http://localhost:4321`.
- **Quiz text and scoring:** `node scratchpad/check-quiz.mjs` reports ALL MATCH. I also re-read the client's scoring key in the original text file by hand.
- **Quiz in the browser (my own tab):** answers ADDCDDABDDCDDBA gave Consciente 9, Autoritaria 2, Permisiva 2, Reactiva 2. The draft was saved to localStorage and the result came back after reloading.
- **Screenshots (headless Chrome, CDP):**
  - Home at 1280 and 390, and the `/cursos`, `/agenda`, `/links`, `/test-de-crianza` and `/privacidad` pages at 390.
  - The hero matches manual p.3.
  - The catalog island shows the real local offer, linking to `{platform}/store/offers/{uuid}`.
  - The favicon was re-rendered and checked at 256, 192 and 32 px.
- **Searches in `src/`:** the only `set:html` is the JSON-LD block, which escapes `<`. No emojis, no `maximum-scale`, no `shadow-`, no `text-justify`.
- **Cleanup:** I closed my browser tab and reset its viewport. The progress log has a new "Review" section at `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/sitio-marketing.md`.

## Needed from others

- **Commerce or backend:** archive or delete the local test offer "Oferta de prueba (borrar)" and its test course before any production build of the site.
- **Backend/ops:**
  - In production, set `LEARNHOUSE_MEDIA_URL` (or `LEARNHOUSE_BACKEND_URL`) to the host that serves `/content`, so `thumbnail_url` comes back absolute. Without it, `get_media_base_url` may guess `api.{domain}`, which doesn't exist. The site now falls back to the API origin for relative paths.
  - Set `LEARNHOUSE_EXTRA_CORS_ORIGINS=https://www.sanarycriarve.com,https://sanarycriarve.com` in production.
  - Keep these `public-listing` fields stable: `offer_uuid`, `name`, `description`, `amount`, `currency`, and inside `included_resources[]`: `product_type`, `thumbnail_url`, `course_uuid`.