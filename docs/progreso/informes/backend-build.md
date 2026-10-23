## Done

I finished the backend workstream from the earlier engineer's partial work. Their models and services matched the spec and I kept them, with two fixes:
- **Entitlements:** `ensure_entitlements` now runs in one transaction while holding the order row lock. It creates the Trail and TrailRun itself, because `check_trail_presence` commits on its own and could create duplicate Trails when the return page and the webhook race.
- **Capture:** `capture_and_fulfill` is serialized per order with a Redis SET NX lock plus an asyncio.Lock.

New files (all under `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/`):
- **Payments router:** `src/routers/payments.py` has every route from spec 2.2 and 2.3, with literal routes declared before parametric ones. Its auth is set per route: admin + `payments` feature, signed-in user (no API tokens), or public.
- **Progress:** `src/routers/progress.py`, `src/services/progress/progress.py` (portable upsert, `max_position` via CASE, clamp, auto-complete at 90% or `completed=true`, soft rate limit of 60/min) and `src/services/progress/cleanup.py`.
- **CORS:** `src/core/middleware/extra_cors.py` handles `LEARNHOUSE_EXTRA_CORS_ORIGINS`: GET/HEAD only, no credentials, and it only acts on origins the main policy doesn't already allow.
- **Migration:** `migrations/versions/a9c8b7d6e5f4_sanarycriar_payments_and_progress.py`. Its `down_revision` is `e8f9a0b1c2d3`, which I confirmed is the only head (72 revisions). Every table is created only if missing.
- **Tests:** `src/tests/payments/` (fake_paypal on httpx.MockTransport, conftest, test_access, test_checkout_flow, test_progress, test_reconcile_cors).

Upstream edits are small and marked `Sanar y Criar:`:
- `src/core/deployment_mode.py`: `payments` removed from EE_ONLY.
- `src/core/ee_hooks.py`: without EE, the paywall check goes to our access module instead of returning True.
- `src/services/trail/trail.py`: `add_course_to_trail` returns 402 `PAYMENT_REQUIRED` for an unpaid course; removing a course or an activity also deletes its saved progress.
- `src/services/admin/admin.py`: `reset_user_progress` also deletes saved progress.
- `src/core/middleware/cors.py`, `src/core/events/events.py` (starts and stops the 5-minute reconciliation), `src/router.py`.
- Three tests: `src/tests/core/test_core_events.py` and `test_core_events_runtime.py` now check the delegation instead of `True`; `src/tests/test_root_router.py` got the missing stubs plus checks for the `/payments` and `/progress` mounts.
- `learnhouse/Dockerfile`: `ffmpeg` added to the runner stage.

Dev environment (`C:/Users/mente/Documents/Psicologa/sanarycriar/dev/`):
- **Mock:** `paypal-mock/` contains `app.py`, `Dockerfile` and a Spanish `README.md`. It runs as service `paypal-mock` on host port 8099.
- **Mock webhooks:** it sends `PAYMENT.CAPTURE.COMPLETED`/`PENDING` after each capture, like PayPal does.
- **Mock test helpers:** `/mock/webhooks`, resend an event, complete a pending capture, refund.
- **`api.env`:** now has `LEARNHOUSE_PAYPAL_API_BASE=http://paypal-mock:8099`, `LEARNHOUSE_PAYPAL_WEB_BASE=http://localhost:8099` and `LEARNHOUSE_EXTRA_CORS_ORIGINS=http://localhost:4321`. I recreated the api container and deleted `org_cache:instance_info:v2`.
- **Test logins:** `usuarios-prueba.local.env` holds the two test buyers' passwords (`dev/*.env` is git-ignored).

**Signup:** it was already open (`admin_toggles.members.signup_mode = "open"`, config v2), so I changed nothing. `POST /api/v1/users/1` created both test buyers.

The progress log is at `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/api-backend.md`.

## Verification

- **New tests:** `docker compose -f dev/docker-compose.yml run --rm --no-deps -T api pytest src/tests/payments -q -p no:cacheprovider` → **76 passed**. They cover everything on the required list plus partial vs. full refunds, token caching with one retry on 401, and the raw webhook body being sent back exactly as received.
- **Affected suites:** `src/tests/core`, `test_app_lifespan`, `security/test_feature_resolve`, `security/test_plan_check`, `services/test_demo_sync`, `routers/test_chapters_router` and `routers/test_trail_router` → 208 passed, 4 failed. Two were the expected ee_hooks tests that required `True` without EE; I updated them and `src/tests/core` now passes (33). The other two are `test_app_lifespan`, which fails the same way in HEAD (the `/app/__init__.py` problem below).
- **Whole suite, first pass** (same command, `pytest src/tests`): 7131 passed, 10 failed, 23 skipped.
  - 2 were the ee_hooks tests above, now fixed.
  - The other 8 fail identically on HEAD, which I exported with `git archive HEAD apps/api` and ran with `docker run`. The cause is the environment: `/app/__init__.py` makes `import app` load the package instead of `app.py`.
- **Whole suite, final pass** (code mounted at `/srv/api` instead of `/app`): **7140 passed, 1 failed, 23 skipped**. The one failure, `test_email_unsubscribe_support::TestSendEmailHeaders::test_send_email_forwards_headers_to_the_provider` (KeyError 'headers'), also fails on HEAD.
- **Migration**, on a scratch Postgres database (`sc_migtest`, now dropped):
  - stamp `e8f9a0b1c2d3`, then upgrade: the 10 tables match the models (columns, nullability, indexes).
  - downgrade, then upgrade again: works.
  - upgrade over tables already made by `create_all`: no error.
- **Live check** (script run inside the api container against the real HTTP API, with the mock):
  1. Admin login. A PayPal config had already been created by another agent, so I re-validated it with PUT: active, `APP-MOCK76FB637FAD`, no secret anywhere in the response. `checkout/providers` shows the public client id.
  2. Created course **"Curso de prueba (borrar)"** `course_62fb10ed-6ac9-463d-8800-2adbbb016c6f`, with chapter 5 and video activity `activity_c2bd39b4-dce7-462e-bbbe-50289865e877` (a 4 s mp4 made with ffmpeg in the container). Before any offer it streamed with 206.
  3. Created offer `4af57a6a-42c6-440b-accd-bd7e9f7cb37c` at 12.50 USD.
  4. Signed up `alumna.api.prueba@example.com`. Before paying:
     - access: for_sale true, has_access false, reason none
     - activity content: `{"paid_access": false}`
     - stream: **402**; start course: 402 `PAYMENT_REQUIRED`; progress save: 402
     - checkout with a foreign `redirect_uri`: 400
  5. Checkout returned `http://localhost:8099/checkoutnow?token=…`. The mock page has the three Spanish buttons. "Aprobar" answered 303 to `http://localhost:3200/store/offers/…?checkout=return&order=…&token=…&PayerID=…`.
  6. Capture returned `paid` with resources and `first_activity_uuid`. After that:
     - access: true, reason purchased; stream: 206; TrailRun exists
     - Mailpit has "Ya tienes acceso a …" in Spanish with a link to the course
  7. Second capture: `paid` again, still one enrollment. Buying again: 409 `ALREADY_OWNED`. Progress at 95% auto-completed the video.
  8. Webhook path with `alumna.api.webhook@example.com` (card method), using "Aprobar y cerrar sin volver": the APPROVED webhook made the server capture, and the order became `paid` with access granted. Mock delivery log: every delivery got 200.
  9. Resending that webhook with a new signature: `duplicate`. A forged webhook: 400.
  10. Admin overview and customers list the purchases.
- **CORS:** a request with `Origin: http://localhost:4321` to `public-listing` gets `access-control-allow-origin: http://localhost:4321`.

## Known gaps / TODO

- **Duplicate course name:** another agent had already created a course with the same name (`course_b117f919-…`, with a text activity and a 5 USD offer). Mine is the video one, `course_62fb10ed-…`.
- **Order statuses:** capture and order responses can also return `refunded`, on top of the five statuses in the spec.
- **Feature toggle:** if an admin turns off the org's `payments` feature, paid courses stay locked. Only the public listing, public offer, checkout providers and checkout are blocked.
- **Disputes:** `CUSTOMER.DISPUTE.*` webhooks are ignored. A failed webhook still answers 2xx (as the spec says); a manual resend or the reconciliation task picks it up.
- **Not done:** `rbac.py`'s `ee.*` imports were not repointed; the spec doesn't ask for it, and the research says they aren't on the course read path.
- **Test side effects:** `docker compose run` for tests joins the dev network, so some pre-existing tests send real emails to Mailpit and use the real Redis. My code skips its Redis cache, locks and rate limits under `TESTING`.
- **Test location:** running the suite with the code at `/app` makes 7 pre-existing tests fail for environment reasons only. Mounting the code at `/srv/api` avoids it.

## Needed from others

- **Commerce frontend:**
  - Show `settings.webhook_url` from `GET /payments/{org}/config` in the PayPal card, so the admin can paste it into the PayPal dashboard.
  - With the mock, the Webhook ID must be `WH-MOCK-SANARYCRIAR`.
  - Extra mock cases are under "Más casos de prueba" on the approval page: pending capture and declined card (`retry`).
- **Deploy / docs owner:**
  - Production needs `LEARNHOUSE_EXTRA_CORS_ORIGINS=https://www.sanarycriarve.com,https://sanarycriarve.com`, and no `LEARNHOUSE_PAYPAL_*` variables (they are ignored anyway when not in development mode).
  - On a database built by `create_all`, run `alembic stamp heads` before `alembic upgrade heads`.
  - Possible addition to `docs/desarrollo-local.md`: run the tests with the code mounted at `/srv/api`.