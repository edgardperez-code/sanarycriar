## Defects found and fixed

1. **API tokens opened paid courses.** File: `learnhouse/apps/api/src/services/payments/access.py` (`get_course_access`).
   - Before: any org API token got paid access to every course in its org.
   - Why that is wrong: an org API token is not an admin, an author or a buyer, so spec §2.7 gives it no access. Tokens can be created with narrow rights by members who have token permission, and handed to integrations such as Zapier. That made them a way around the paywall.
   - Now: an org token gets `has_access: false` (`reason: "none"`) on a course for sale. Free courses are unchanged, and platform superadmin tokens still pass.

2. **A buyer could be charged twice for the same offer.** File: `learnhouse/apps/api/src/services/payments/checkout.py` (new `_owned_through_other_order`, used in `_capture_and_fulfill_locked`).
   - Before: the "already owned through another order" check only looked at the enrollment row of the order being captured.
   - How it happens: two simultaneous checkouts (a double-click) can each create an enrollment row for the same user and offer. If both PayPal orders are approved, both get captured.
   - Now: the check looks at any enrollment with access for the same user and offer. The second order is cancelled without calling PayPal's capture.

3. **A temporary failure while processing a webhook lost the event for good.** File: `checkout.py` (`handle_provider_webhook`, new `_is_transient`).
   - Before: any processing error after a valid signature still answered 2xx, so PayPal never resent it.
   - Why that matters: reconciliation never revisits refunds, nor pending captures older than 24 h. A `PAYMENT.CAPTURE.REFUNDED` or a late `PAYMENT.CAPTURE.COMPLETED` that hit a PayPal or database outage was simply lost.
   - Now: a temporary failure (retryable `ProviderError`, an HTTP 5xx from the capture, or a database `OperationalError`) answers 503, so PayPal resends. The event stays `failed` in `sc_pay_webhook_event`, and the resend runs it again instead of treating it as a duplicate. Permanent failures still answer 2xx.
   - This narrows the spec's literal "2xx whenever the signature is valid" for the transient case only.

4. **Token principals were compared with user ids.** File: `checkout.py` (`capture_order_endpoint`, `_require_user`).
   - Before: `SuperadminAPITokenUser` was not excluded, and its `id` is a token id, not a user id. A matching number could pass the owner check on capture.
   - Now: neither kind of token is ever treated as the owner of an order.

5. **Regression tests.** New file `learnhouse/apps/api/src/tests/payments/test_review_fixes.py` with 6 tests:
   - An org token cannot open a course for sale but can still read free courses.
   - Token principals cannot capture an order.
   - A second enrollment row is not charged again.
   - A PayPal outage during a webhook answers 503 and the resend fulfills the order.
   - A permanent failure still answers 2xx.

   Each test fails on the code before the fix.

## Defects found but not fixed

- **Archiving a course's only offer makes the course free for everyone.** That is exactly the rule in spec §2.7, so I left it. Suggested fix: the payments dashboard should warn before archiving an offer that is the only one covering a course (commerce frontend).
- **Pending orders are only reconciled for 24 h** (spec §2.4). Fix 3 now covers lost webhooks. If more safety is wanted, extend the reconciliation lookback for `pending` orders only, for example to 7 days, in `services/payments/reconcile.py`.
- **Unmarking a completed video clears its saved position** (`trail.py` together with `progress/cleanup.py`). The next save past 90% marks it complete again, so the clean-up does not stop re-completion when the learner is still near the end. This is minor UX; left as is.
- **Two capture locks for the same order can briefly coexist in one process.** `_LOCAL_CAPTURE_LOCKS` is popped as soon as the lock is released, while another waiter may still hold a reference to the old lock. Correctness still holds through the Redis lock, PayPal's idempotency key and the order row lock. Not changed.

## Verification

- **Payments tests:** `docker compose -f dev/docker-compose.yml run --rm --no-deps -T api pytest src/tests/payments -q -p no:cacheprovider` → **82 passed** (76 existing + 6 new).
- **Affected suites, before my changes:** `pytest src/tests/payments src/tests/core src/tests/test_root_router.py src/tests/routers/test_trail_router.py src/tests/routers/test_chapters_router.py` → 180 passed.
- **Whole suite, after my changes:** run with the code mounted at `/srv/api`, as the implementer did (`-v .../learnhouse/apps/api:/srv/api -w /srv/api ... pytest src/tests`) → **7146 passed, 1 failed, 23 skipped** in 16 min.
  - The failure is `test_email_unsubscribe_support::TestSendEmailHeaders::test_send_email_forwards_headers_to_the_provider`, the same one the implementer showed failing on HEAD. It is an email-header test unrelated to payments; I did not re-check it on HEAD myself.
- **Paywall leak probe** against the running stack, using the course with the text activity (`course_b117f919…`):
  - Callers: an anonymous visitor, and `alumna.api.prueba`, who bought the other course but not this one.
  - Endpoints: `/courses/{uuid}`, `/meta`, `/meta?slim=false`, `/chapters/course/{uuid}/meta`, `/chapters/4`, `/activities/{uuid}`, `/activities/chapter/4`, course search, global search, `/export` (403), `/state` (403).
  - Result: the paid text never appeared in any response. `/payments/1/access` answered `anonymous` and `none` respectively.
- **Live check after the fixes** (script run inside the api container):
  - Buyer access to the video course: still `purchased`.
  - Forged webhook: 400.
  - New checkout on the 5 USD offer: 200, and the mock page shows all three Spanish buttons.
  - Mock "Cancelar": 303 to the `cancel_url` with `checkout=cancelled&order=…`.
  - `POST …/cancel` → `cancelled`; a capture afterwards → `cancelled`, with no charge.
- **Other checks:**
  - The database has all 9 `sc_pay_*` tables plus `activityprogress`.
  - `apps/api/ee` does not exist, and there is no `ee/hooks.py`.
  - Reconciliation ticks show up in the API logs with no errors.
- **Not run:** the web typecheck, because no web files were touched.
- **Progress log:** I added a "Review" section to `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/api-backend.md`.

## Needed from others

- **Deploy/docs owner:** in production, set `LEARNHOUSE_MEDIA_URL` to the public API host. Without it, `settings.webhook_url` (the URL the admin pastes into PayPal) is built as `https://api.<LEARNHOUSE_DOMAIN>/api/v1/payments/webhooks/paypal/<org_id>`, which may not exist. The same production notes as the implementer's still apply:
  - `LEARNHOUSE_EXTRA_CORS_ORIGINS=https://www.sanarycriarve.com,https://sanarycriarve.com`
  - no `LEARNHOUSE_PAYPAL_*` variables
  - `alembic stamp heads` on a database that `create_all` built
- **Commerce frontend:**
  - Org API tokens no longer open paid courses. Nothing in `apps/web` uses API tokens, so no change is needed there.
  - A webhook may now answer 503. That is backend-only and affects no UI.
  - Optionally, warn in `PaymentsOffersPage` before archiving an offer that is a course's only offer, because the course then becomes free.
  - The capture response can also carry `already_owned: true` with `status: "paid"`. The current `applyOrderResult` already treats that correctly as success.