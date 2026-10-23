All 18 confirmed findings are dealt with: 16 fixed and 2 partly fixed (findings 4 and 17). The API tests, web typecheck, web tests, a new test for the deploy scripts, and live checks against the dev stack all pass. Two limits: the new screens were not looked at in a browser, and the nginx change only reaches production with a new image tag.

The full table (finding, severity, fix, test, status) is in `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/seguridad.md`.

**Payments and paywall (`apps/api/src/services/payments/`, `routers/payments.py`)**
1. **Double charge (medium): fixed.**
   - A second checkout while an order is `pending` (or `approved` less than 30 min ago) now gets 409 `PAYMENT_PENDING` with that order's uuid.
   - `/access` returns `payment_pending`, and the course page shows "Tu pago está en revisión" instead of the buy button. The offer page polls the existing order instead of opening a new one.
   - The capture lock is now per (user, offer) instead of per order.
   - A duplicate charge that still completes is marked paid with `raw.duplicate_of`, keeps the first order as the one granting access, sends no second email, and shows as "Cobro duplicado: reembolsar" in the dashboard.
2. **Refunding one of two paid orders removes access (medium): fixed.** `revoke_order` keeps the enrollment active and points it at the other paid order. Access is only revoked when no paid order is left.
3. **Sandbox config accepted in production (low): fixed.**
   - Outside dev mode, a sandbox config only lets admins buy. Everyone else gets 403 `STORE_TEST_MODE`, and the offer page shows a test-mode banner (`test_mode` in `checkout/providers`).
   - Orders record their environment. Sandbox sales are tagged "Prueba" and left out of revenue.
   - Admins normally own every course, so in test mode only a previous purchase blocks them. Otherwise nobody could run the test purchase at all.
4. **Refunds depend only on the webhook (low): partly fixed.**
   - A live config without a Webhook ID is now refused.
   - A new daily pass checks paid orders from the last 180 days at PayPal and revokes the ones REFUNDED or REVERSED.
   - Re-processing failed webhook events was not done. The event table doesn't store the event body, so there is nothing to replay. The daily pass and the 5-minute reconciliation cover the same cases by checking order state.
5. **Unauthenticated webhook calls PayPal per request (low): fixed.**
   - Rate limit of 120/min per IP and 600/min per org.
   - Before calling PayPal, the endpoint rejects a wrong auth algorithm, a cert URL that isn't a PayPal host, and a transmission time more than 30 min off.
6. **PayPal buyer data stored on every order (low): fixed.** The `payer`, `payee` and `shipping` data are no longer stored. I also stripped `payer` from 11 existing rows in the dev database; the SQL is in `seguridad.md`.

**Web open redirects (`apps/web/`)**
- **`/login?redirect=/..//evil.com` (medium): fixed.** `safeInternalPath` now returns the normalized path and rejects anything starting with `//`. This also covers `proxy.ts` and `commerce.ts`.
- **`/redirect_from_auth?next=/..//evil` (medium): fixed.** The same check is in `proxy.ts`. `login.tsx`, `OpenSignup.tsx` and `InviteOnlySignUp.tsx` now use `safeInternalPath`.

**Deploy kit (`deploy/`, `docker/nginx.conf`, CI)**
- **`actualizar.sh` skipped backup and migrations (medium): fixed.** It starts the database and waits for it before counting tables, stops if the query fails, and at the end fails unless the schema is exactly at the image's latest migration. `restaurar.sh` had the same flaw before its `DROP DATABASE`; fixed too.
- **Off-site backups (medium): fixed.** `.env` never leaves the server. Uploads only happen encrypted, with age (`SC_BACKUP_AGE_RECIPIENT`) or an rclone crypt remote; otherwise nothing is uploaded and the local copy is kept. Old remote copies are now pruned.
- **Cron line never ran (medium): fixed.** `backup.sh` creates `backups/` and logs there by itself. The new cron line is `15 3 * * * /opt/sanarycriar/scripts/backup.sh`.
- **6 GB request bodies (low): fixed.** Caddy allows 6 GB only on the API routes that take uploads and 25 MB elsewhere. Inside the image, nginx allows 25m by default and 6G only on `/api/v1`.
- **Development mode in production (low): fixed.** Compose forces it off, and the scripts refuse a `.env` with dev mode on or the PayPal mock URLs.
- **JWT secret also protects the PayPal secret (low): fixed in the docs only.** `.env.example` and `despliegue.md` say to re-enter the PayPal Secret after rotating the JWT secret, and to rotate it at PayPal if it leaked. The optional separate key (`MultiFernet`) was not done.
- **nginx access log (low): fixed.** It goes to stdout, which Docker rotates, and drops query strings.
- **Supply chain (low): fixed.** The GitHub actions are pinned to commit SHAs, and the Caddy, pgvector and Redis images are pinned by digest.
- **Root container and Postgres superuser (low): partly fixed.** `no-new-privileges` is on; I smoke-tested the local image with it. A non-superuser database role and running pm2 without root were not done. They need ownership changes and Dockerfile rework that I couldn't test end to end; the steps for the database role are in `seguridad.md`.

**Verification**
- **API tests** (dev compose runner): `pytest src/tests/payments src/tests/security src/tests/test_root_router.py` → 2415 passed, 4 skipped. `src/tests/payments` alone → 120 passed, also with `LEARNHOUSE_DEVELOPMENT_MODE=false` and the mock variables cleared.
  - New file: `apps/api/src/tests/payments/test_security_fixes.py` (20 tests).
  - The shared test config is now `live`, so a few existing assertions changed.
- **Web checks:**
  - `tsc --noEmit` is clean. ESLint on the changed files: 0 errors.
  - `bun test`: sc-fixes 14/14, url-security 22/22, auth-proxy-hardening 8/8, sc-i18n-loose 14/14, plus the other auth tests, all passing.
  - Each test file has to run on its own; run together they clash, and that was already the case before.
- **Deploy kit:** `bash deploy/tests/scripts.test.sh deploy` → 9/9 (new; uses fake docker, rclone and age). `caddy validate` and `nginx -t` pass with the local images. With nginx, a 40 MB POST gets 413 on `/` and `/api/auth` and is let through on `/api/v1`.
- **Live on the dev stack:**
  - Second checkout during a pending payment → 409 with the same order uuid, and `payment_pending` is true. Completing the capture at the mock granted access.
  - Forged webhook with an old time or wrong algorithm → 400. A burst of 130 got 429 from request 111.
  - The daily refund pass ran: 9 paid orders checked, 0 revoked.
  - Both redirect payloads on `:3200` stayed on the site.

**Still needed from someone else**
- Publish a new image tag so the nginx change reaches production.
- Set the new cron line on the server, and install `age` and set `SC_BACKUP_AGE_RECIPIENT` for off-site copies.
- Look at the new screens in a browser: "Tu pago está en revisión", the test-mode banner, and the "Cobro duplicado" / "Prueba" tags in the dashboard.
- The duplicate orders the auditor created in the dev database predate the fix and aren't flagged. Enrollment 10 (dave) is still `refunded` even though order 23 is paid; it is test data, so I left it.