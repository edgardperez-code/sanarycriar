I reviewed the brand-web work and found no blocking defects. I fixed four smaller problems in the brand-web files; typecheck and ESLint are clean and every route checked returns 200.

## Defects found and fixed

1. **Mobile menu stayed open after navigating.** It only closed for its own links, so going to "Mis compras" or "Mi cuenta" from the profile dropdown, or following a link on the page, left the panel covering the new page.
   - `learnhouse/apps/web/components/Objects/Menus/OrgMenu.tsx` now remembers the path the menu was opened on, so any route change closes it. No effect or `setState`-in-effect was added.
   - Checked headless: open the menu, navigate to `/store`, the menu is closed, and it opens again normally.
2. **Hard edge on the home page watercolour.** The pink stain stopped in a straight line at the bottom of the intro block.
   - New `.sc-watercolor-fade` class in `styles/globals.css` fades it out with a mask; it is used in `components/Landings/LandingClassic.tsx`.
   - Pixel check shows the edge is gone. I regenerated `docs/capturas/learnhouse/01-inicio-escritorio.png` and `01-inicio-movil.png`.
3. **Keyboard focus was barely visible on login, signup and reset.** The forms' own `focus:ring-black/5` is almost invisible on nube.
   - `.sc-auth` in `globals.css` now adds a 35% lavanda-600 ring on `:focus-visible` and leaves the border colour alone, so the red error border still shows.
   - I confirmed the rule is in the stylesheet and unlayered. Headless Chrome has no window focus, so I could not see the ring itself.
4. **The org script could send the admin password over plain HTTP.** `deploy/scripts/configurar-organizacion.py` sends the password to `--api` and the token to `--web`. It now refuses `http://` unless the host is localhost, 127.0.0.1 or ::1 (exit 2).

## Defects found but not fixed

- **404 page in English:** `app/not-found.tsx` still shows "We are very sorry…" and "Go back to homepage". It is outside brand-web; the i18n agent should translate it.
- **Hidden sections still reachable:** Library, Podcasts, Communities and Playgrounds are out of the menu, but their routes still open by direct URL (the features are still enabled). Suggested fix: turn those features off for the org; this is the orchestrator's decision.
- **Weak field borders on auth forms:** `border-neutral-200` on nube is low contrast for a field outline. Upstream is the same, so it is not a regression. Suggested fix: a slightly darker border inside `.sc-auth` if the brand owner agrees.

## Verification

- **Typecheck:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → exit 0, before and after my fixes.
- **ESLint** on all 20 brand-web files → 0 errors. The only warning is the old upstream `set-state-in-effect` in `OrgMenu.tsx`, now at line 108.
- **curl** → 200 for `/`, `/courses`, the course page, the lesson page, `/store`, `/login`, `/signup`, `/forgot`, `/account/purchases`, `/dash`, `/sc-favicon.svg`, `/sc-hilda.webp`, `/favicon.ico` and `/empty_thumbnail.png`. I re-checked `/`, `/store`, `/login` and the course page after my edits. The offer page returned the expected content in headless Chrome.
- **Script:**
  - `--env-file dev/api.env --simular` → all 12 items "sin cambios", so it is idempotent.
  - `--api http://example.com/api/v1` → exit 2.
  - `py_compile` → ok.
- **Headless Chrome** (my own isolated profiles in `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-marca-web/`):
  - Pages: home, store, offer, 404, forgot password, visitor mobile menu, mobile login and mobile store, plus dashboard home, courses and offers as admin.
  - No horizontal scroll at 390 px and no console errors. The page has `lang="es"` and the title "Cursos y ebooks · Sanar y Criar".
  - Admin login works and redirects. The dashboard stays legible with the inherited tokens.
- **Code review:** the commerce agent's `?redirect` logic in `app/auth/**` is untouched, and the files contain no secrets. Brand tokens match `spec-tecnica.md` §1, and the legal links point to existing pages on the marketing site (`/terminos`, `/privacidad`, `/reembolsos`). The deploy files already define `NEXT_PUBLIC_SC_SITE_URL`, and `NEXT_PUBLIC_SC_SOURCE_URL` carries a `CAMBIAR` placeholder that the deploy check blocks.

I added a Review section to `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/marca-web.md`.

## Needed from others

- **i18n agent:**
  - Translate `app/not-found.tsx`.
  - Add the `sc_brand.*` keys to the locale files; Spanish defaults cover them for now.
  - Fix the server/client language hydration mismatch.
- **Fixes agent:** `CoursesActions.tsx:434` progress ring `#10b981` → `#6559CA`.
- **Owner of `app/orgs/[orgslug]/layout.tsx`:** NextTopLoader colour `#2e2e2e` → `#7D75E2`.
- **Learning agent (optional):** `TrailCourseCard` still shows green progress.
- **Orchestrator:**
  - Decide whether to turn off the hidden features (Library, Podcasts, Communities, Playgrounds) for the org.
  - Decide whether to turn AI off with `PUT /orgs/1/config/ai` or hide "Preguntar a la IA" on lessons, since no provider is configured.
  - Before launch, set `NEXT_PUBLIC_SC_SOURCE_URL` to the published fork; the code default points to upstream LearnHouse, which does not meet the AGPL §13 source offer.