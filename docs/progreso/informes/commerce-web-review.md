## Defects found and fixed
Paths are under `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web`.

1. **Open redirect in the `?redirect` handling (security).** File: `components/Payments/commerce.ts` (`safeRedirectPath`).
   - The old check was `/^\/(?!\/)/` plus a backslash test. It accepted `/<TAB>/evil.com` (`?redirect=%2F%09%2Fevil.com`).
   - Browsers strip tabs and newlines when parsing a URL, so that value becomes `//evil.com`. I confirmed this with `new URL(...)` in node.
   - The value reaches `router.replace(currentAuthRedirect() ?? '/home')` in `app/auth/login/login.tsx` and `getUriWithOrg` in `app/auth/signup/signup.tsx`.
   - Fix: it now uses upstream `safeInternalPath` from `@services/security/url`, which rejects control characters and anything that is not same-origin.
2. **A paid order could go uncaptured when its offer is no longer public.** File: `app/orgs/[orgslug]/(withmenu)/store/offers/[offerid]/offer-detail.tsx`.
   - The return effect only ran when `offer` existed. If an admin archived or unlisted the offer during a checkout, the buyer came back from PayPal to "not found" and the capture was never called.
   - Fix: the return handling no longer depends on `offer`. The "not found" view now also renders the status panel (confirming, success with links, pending, error). Values that read `offer` are now null-safe.
3. **Unchecked provider URL on the navigation sink.** File: `offer-detail.tsx`. `checkout_url` was only checked with `/^https?:\/\//` before `location.assign`. It now goes through `safeExternalUrl`.
4. **Unchecked `receipt_url` link.** File: `components/Dashboard/Pages/Payments/PaymentsCustomersPage.tsx`. The link now goes through `safeExternalUrl` and has an `aria-label`.
5. **Unchecked thumbnails in CSS `url()` and `<img>`.**
   - `resourceThumbnail` in `commerce.ts` now returns only `safeImageSrc` values.
   - A new `cssUrl()` helper quotes the URL inside CSS `url(...)`. It is used in `offer-detail.tsx` and `app/orgs/[orgslug]/(withmenu)/store/store.tsx`.
   - `components/Objects/Account/subpages/AccountPurchases.tsx` now runs the `<img>` source through `safeImageSrc`.
6. **Wrong purchase date in "Mis compras".** File: `AccountPurchases.tsx`. It showed `creation_date`, which is when the checkout started. It now shows `paid_at` and falls back to `creation_date`.
7. **Accessibility in `components/Dashboard/Pages/Payments/PaymentsConfigurationPage.tsx`.** The icon-only "PayPal developer" and "Copiar" controls now have `aria-label`. The "Entorno" label is now tied to its Select trigger with `htmlFor`/`id`.

## Defects found but not fixed
- **`proxy.ts` drops `?redirect` for signed-in users (not owned).** It sends any signed-in visitor on `/login` to `/home`. Impact is low: the offer, course and paywall pages only show login links to signed-out visitors. Suggested fix: forward the sanitized `redirect` (via `safeInternalPath`) instead of a bare `/home`.
- **Mobile layout of the offer page (UX only).** The price card with the pay buttons sits below the description and the included items, so a buyer has to scroll to find "Pagar con PayPal". Suggested fix: on small screens, show a compact pay block right after the title. I left it alone because this is a layout choice, not a defect.
- **Language is still English unless the org default changes.** `OrgLanguageSync` forces the org's default language, which is `en`. Fixing this belongs to the branding agent.

## Verification
- **Typecheck:** `cd apps/web && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → exit 0, before and after my fixes.
- **Lint:** `node node_modules/eslint/bin/eslint.js` on the 6 files I edited → 0 errors. The only warning is the existing `set-state-in-effect` in `offer-detail.tsx`.
- **Backend contract checks:**
  - `curl http://localhost:1338/api/v1/payments/1/checkout/providers` → 200, PayPal with methods `paypal` and `card`.
  - `access` with no session → `{for_sale:true, has_access:false, reason:"anonymous"}`. With the buyer's token → `has_access:true, reason:"purchased"`.
  - `enrollments/mine` → includes `offer_uuid`, `paid_at` and `resources`.
  - Checkout for an owned offer → 409 `{"detail":{"code":"ALREADY_OWNED"}}`.
  - Checkout with `redirect_uri=https://evil.com/` → rejected (`redirect_uri no permitido`).
- **HTTP renders:** `curl` on these pages on :3200 all returned 200, and the dev-server log showed no new errors:
  - `/store`, the offer page, the offer page with `?checkout=return&order=nope`, `/store/offers/nope`
  - `/course/<uuid>`, `/login`, `/login?redirect=%2F%09%2Fevil.com`, `/signup`
  - `/account/purchases`, `/dash/payments/configuration`, `/dash/payments/overview`
- **Walkthrough in Spanish, end to end.** I used headless Chrome with an isolated profile, driven by `scratchpad/review-commerce/cdp.mjs`. This never touched the shared localhost:3200 browser session. I created a new local test buyer through the API (`compradora3.revision@example.com`; password in `scratchpad/commerce/test-buyers.json`).
  - **Signed-out course page:** offer card "Obtener por 5,00 US$" and "¿Ya lo compraste? Inicia sesión". The login link is `/login?redirect=%2Fcourse%2F…`.
  - **Signed-out paywall on the lesson:** the same offer card, with `redirect` pointing to the activity.
  - **Signed-out offer page:** the "Crea tu cuenta" / "Inicia sesión" card, both carrying `?redirect` back to the offer.
  - **Login and purchase:** login with `?redirect` landed back on the offer, which showed "Pagar con PayPal" and "Pagar con tarjeta (vía PayPal)". In the PayPal mock, Approve brought the buyer back to "¡Listo! Ya tienes acceso" with "Ir al curso", and the URL was cleaned.
  - **After purchase:**
    - The course page showed "Este curso es tuyo", the progress block and "Continuar", with no Leave button.
    - At 390 px mobile width it showed the same, with no horizontal scroll.
    - "Mis compras" showed "Activo", "Comprado el 22 oct 2026" and "Ir al curso".
    - The offer page showed "Ya tienes este producto".
  - **Return-parameter states:**
    - `?checkout=cancelled&order=<zero uuid>` → "Cancelaste el pago".
    - `?checkout=return&order=<zero uuid>` → "No encontramos este pago…".
    - `/store/offers/nope?checkout=return&order=…` → the status panel now shows.
- **Progress log:** I appended a "Review" section to `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/comercio-web.md`.

## Needed from others
- **Platform/proxy owner, `apps/web/proxy.ts` around line 368:** when bouncing a signed-in user away from `/login`, use `safeInternalPath(req.nextUrl.searchParams.get('redirect') ?? req.nextUrl.searchParams.get('next'), '/home')` (from `@services/security/url`) instead of `'/home'`.
- **Branding agent:**
  - Set the org default language to `es` (`config.customization.general.default_language`). `OrgLanguageSync` currently forces `en`.
  - Merge `apps/web/locales-sc/commerce.{es,en}.json` under the `sc_commerce` key.
  - Translate the header items that are still in English in `es.json` ("Library", "Podcasts", "Playgrounds", "Store").
- **Test data I added to the local DB:** buyer `compradora3.revision@example.com`, with one paid PayPal-mock order for offer `18df4829-e639-45eb-807f-655e2c4e9025`. Delete it along with the implementer's test data before production.