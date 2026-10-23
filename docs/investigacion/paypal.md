# PayPal Checkout for Sanar y Criar (FastAPI + Next.js/React): research report

Research date: 2026-10-22. No project files were modified. I made one read-only check of the LearnHouse fork:
- `apps/web/package.json` declares `"next": "^16.4.2"` (line 114), `"react": "19.3.1"` (line 121), `"react-dom": "19.3.1"` (line 123) and `"stripe": "^23.0.0"` (line 140).
- `apps/api/pyproject.toml` pins `requires-python = ">=3.14.7,<3.14.8"` (line 5), `fastapi==0.159.1` (line 13), `httpx==0.28.1` (line 14) and `stripe==16.0.0` (line 37).
- A grep found no `Cross-Origin-Opener-Policy` header in `apps/web/next.config.js`.

Most facts below come from PayPal's own OpenAPI files, saved to the scratchpad and read directly:
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/paypal/orders.yaml` (Orders v2.36)
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/paypal/payments.yaml`
- `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/paypal/webhooks.yaml` (Webhooks v1.11)

Line numbers cited as `orders.yaml:N` refer to those files. Where something is inferred rather than read, it is marked **(inferred)**.

---

## 1. Recommended integration (2026)

### 1.1 Server flow: Orders v2, intent CAPTURE
1. **Create the order on the server.** Call `POST /v2/checkout/orders` with `"intent": "CAPTURE"`. The schema (`orders.yaml:3702`) describes it as "The merchant intends to capture payment immediately after the customer makes a payment". Compute the amount on the server from your database. PayPal's Next.js guide also says the amount must never come from the browser.
2. **The buyer approves** in the PayPal popup, modal or redirect, or through the guest card flow.
3. **Capture on the server.** The frontend's `onApprove({ orderId })` calls your backend, which calls `POST /v2/checkout/orders/{id}/capture`. The order id is a path param: `^[A-Z0-9]+$`, max 36 (`orders.yaml:1889-1935`).
4. **Grant access** only after the server has checked the capture result (section 2).

Orders v2 endpoints (from the schema paths, `orders.yaml:27-3361`):

| Purpose | Method and path |
|---|---|
| Create order | `POST /v2/checkout/orders` |
| Get order | `GET /v2/checkout/orders/{id}` |
| Patch order (CREATED or APPROVED only) | `PATCH /v2/checkout/orders/{id}` |
| Capture | `POST /v2/checkout/orders/{id}/capture` |
| Refund a capture | `POST /v2/payments/captures/{capture_id}/refund` (Payments v2) |
| Get a capture | `GET /v2/payments/captures/{capture_id}` |
| OAuth token | `POST /v1/oauth2/token` |
| Verify webhook | `POST /v1/notifications/verify-webhook-signature` |

**Base URLs:**
- Sandbox: `https://api-m.sandbox.paypal.com` (the `servers:` entry in `orders.yaml:7-9`).
- Live: `https://api-m.paypal.com` (the HATEOAS links in the schema examples, e.g. `https://api-m.paypal.com/v2/payments/captures/.../refund`).
- PayPal's webhook guide uses the older host `api.sandbox.paypal.com`. Use `api-m.` everywhere.

**Order lifetime** (`orders.yaml:12469-12476`): "The API caller has 6 hours (default setting ... can be changed by your account manager to 24/48/72 hours) from the time the order is created, to redirect your payer. Once redirected, the API caller has 6 hours for the payer to approve the order and either authorize or capture." Expire your own pending orders after about 12 hours.

**Order status enum** (`orders.yaml:12359`): `CREATED, SAVED, APPROVED, VOIDED, COMPLETED, PAYER_ACTION_REQUIRED`.

### 1.2 Which JS SDK: v6 Web SDK, not v5 `paypal.Buttons`
- **v5 is deprecated.** The official "Upgrade from v5 to v6" guide (last updated 2026-08-24, https://developer.paypal.com/v5-v6) labels v5 "deprecated" and says upgrading "provides better performance, security, and access to PayPal's latest payment features". I found no sunset date.

**Differences from v5:**

| Aspect | v6 |
|---|---|
| Script and config | The script URL has no query parameters. Config goes into `window.paypal.createInstance({...})`. |
| Components | Loaded explicitly: `paypal-payments`, `paypal-guest-payments`, `card-fields`, `venmo-payments`, `googlepay-payments`, `applepay-payments`, `paypal-messages`, `fastlane`, `paypal-subscriptions`. |
| Eligibility | You must call `sdkInstance.findEligibleMethods({...})` explicitly. |
| Buttons | Web components (`<paypal-button>`, `<paypal-basic-card-button>`) that start `hidden`. |
| Callbacks | Live on a payment session: `sdkInstance.createPayPalOneTimePaymentSession({ onApprove, onCancel, onError, ... })`, then `session.start({ presentationMode }, orderPromise)`. |
| Test client ID | v6 "no longer accepts the default test client ID". |

**Script URLs** (https://developer.paypal.com/sdk/js/set-up):
- Production: `https://www.paypal.com/web-sdk/v6/core`
- Sandbox: `https://www.sandbox.paypal.com/web-sdk/v6/core`

**`presentationMode` values** (v6 JS reference): `auto` (default, "Recommended"), `popup`, `modal`, `redirect`, `payment-handler`. Errors expose `isRecoverable`, so you can fall back to another mode (https://developer.paypal.com/sdk/js/advanced).

**Authentication:**
- A client ID is "safe to include in your front-end code" and is the recommended default.
- A client token is mandatory only for Fastlane. The set-up page's parameter table lists `clientToken` (it "expires after 15 minutes"), which is inconsistent with its own Option A example.
- The standalone card-button page (2026-08-07) initializes with a server-generated `clientToken`.
- **(inferred)** If the guest card button does not render with `clientId`, switch to a client token. The official sample generates one at `GET /paypal-api/auth/browser-safe-client-token` by calling `/v1/oauth2/token` with `response_type=client_token` (see `server/node/src/routes/authRouteHandler.ts` in `paypal-examples/v6-web-sdk-sample-integration`).

**Popup requirement:** the official sample adds `Cross-Origin-Opener-Policy: same-origin-allow-popups` to checkout pages (`server/node/src/middleware/crossOriginOpenerPolicyMiddleware.ts`). LearnHouse's `apps/web/next.config.js` sets no such header. Add it in `headers()` for the checkout route, or make sure no stricter COOP is set **(inferred: needed for the popup flow)**.

### 1.3 React/Next.js package: `@paypal/react-paypal-js`
- **Version:** npm `latest` is **10.6.0** (`registry.npmjs.org/@paypal/react-paypal-js/latest`). Peer deps are `react` and `react-dom` `^16.8.0 || ^17 || ^18 || ^19`, so React 19.3.1 works.
- **Entry points:** `.`, `./sdk-v6` and `./sdk-v6/server`.
- **v6 support:** the README migration section says "The v9.0.0 release introduces the V6 SDK with a new API".

**v8 to v9+ mapping:**

| v8 (old SDK) | v9+ (`sdk-v6`) |
|---|---|
| `PayPalScriptProvider` | `PayPalProvider` |
| `PayPalButtons` | `PayPalOneTimePaymentButton` or hooks |
| `createOrder` returns a bare id | `createOrder` must return `{ orderId }` |
| import from `@paypal/react-paypal-js` | import from `@paypal/react-paypal-js/sdk-v6` |

- **`PayPalProvider` props** (https://developer.paypal.com/sdk/react/reference):
  - `clientId` or `clientToken` (one, not both; a `string` or `Promise<string>`).
  - `environment`: `"sandbox" | "production"`, required. If omitted it defaults to sandbox and rejects production credentials.
  - `components` (default `["paypal-payments"]`), `pageType`, `locale`, `merchantId`, `eligibleMethodsResponse`, `debug`.
  - Use one provider per page, placed high in the tree.
- **`PayPalOneTimePaymentButton` props:**
  - `orderId` or `createOrder: () => Promise<{ orderId: string }>`
  - `presentationMode: "auto"|"popup"|"modal"|"redirect"`
  - `onApprove(data)` (must return a Promise), `onCancel`, `onError`, `onComplete`
  - `type: "pay"|"checkout"|"buynow"|"donate"|"subscribe"`, `disabled`
- **`PayPalGuestPaymentButton`** "Renders a guest checkout button for card payments without a PayPal account (Branded Card/Debit Card checkout)". It needs `"paypal-guest-payments"` in `components`.
- **Hooks:** `usePayPal()` returns `{ sdkInstance, eligiblePaymentMethods, loadingStatus: PENDING|RESOLVED|REJECTED, isHydrated, error }`. Also `useEligibleMethods({ payload: { currencyCode: "USD", paymentFlow: "ONE_TIME_PAYMENT" } })` and `usePayPalOneTimePaymentSession(...)`, which returns `{ isPending, error, handleClick, ... }`.
- **Card fields:** `PayPalCardFieldsProvider`, `PayPalCardNumberField`, `PayPalCardExpiryField`, `PayPalCardCvvField`, and `usePayPalCardFieldsOneTimePaymentSession()`, which returns `{ submit, submitResponse, error }`. These require advanced card eligibility, which Venezuela lacks (section 3).
- **SSR:** `fetchEligibleMethods` from `/sdk-v6/server` can pre-fetch eligibility. `eligibleMethodsResponse` "must be a resolved value, not a Promise".
- **Next.js:** PayPal's Next.js 16 App Router guide (2026-08-24, https://developer.paypal.com/guides/nextjs-checkout) uses v6 through `@paypal/react-paypal-js/sdk-v6`, puts `"use client"` on the checkout component, and uses Server Actions for create and capture. For LearnHouse, call the FastAPI backend from the client component instead.
- **The official React sample** uses `"@paypal/react-paypal-js": "^10.5.2"` with `react 19.2.8` (`client/prebuiltPages/react/package.json`).

### 1.4 Server-side OAuth2 client-credentials token and caching
- **Request:** `POST {base}/v1/oauth2/token` with HTTP Basic `client_id:secret`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=client_credentials`.
- **Response:** `scope, access_token, token_type (Bearer), app_id, expires_in, nonce`. The doc's sample shows `expires_in: 31668`, roughly 9 hours (https://developer.paypal.com/api/rest/authentication/).
- **Caching:** the doc only says to request a new token "When your access token expires". Cache it in-process (or in Redis if you run several API workers), refresh about 5 minutes before `expires_in`, and on any `401` drop the cache and retry once. Code is in section 5.

---

## 2. Robustness

### 2.1 Idempotency with `PayPal-Request-Id`
- **Supported on** create, authorize and capture (`#/components/parameters/paypal_request_id`, `orders.yaml:3537-3552`): a string, `minLength 1`, `maxLength 10000`.
- **Status codes on capture** (`orders.yaml` around line 1964 and following):
  - `201 Created` for a new capture.
  - "If a duplicate response is retried, returns the HTTP `200 OK`".
  - `200` is described as "A successful response to an idempotent request".
- **Rules from the general idempotency page** (https://developer.paypal.com/api/rest/reference/idempotency/):
  - Reusing a key returns "the latest status of the previous request".
  - Without the header, a retry "duplicates the request".
  - If two requests arrive at the same time, PayPal "processes the first request and might fail the second".
  - Use a unique key per request and per call type.
  - It recommends UUIDs, citing a "38 single-byte character limit" that conflicts with the schema's 10000.
  - The retention window is not stated. Don't count on a long one.
- **Recommendation:** use deterministic UUIDv5 keys, such as `uuid5(NS, f"create:{our_order_id}")` and `uuid5(NS, f"capture:{paypal_order_id}")`. These are 36 characters, so every retry of the same logical operation is idempotent. Also add database-level idempotency: a unique constraint on `paypal_order_id` and `capture_id`, and an idempotent `fulfill_order()`.
- **`Prefer` header:**
  - `return=minimal` returns only `id`, `status` and HATEOAS links. It is the default on capture (`default: return=minimal`, `orders.yaml:1925`).
  - Use `Prefer: return=representation` on create and capture so the response includes `purchase_units[].custom_id` and the full capture object.

### 2.2 Verifying the capture result before granting access
Fields read from the schema:

- **Order level:** `status == "COMPLETED"`.
- **Capture object:** `purchase_units[0].payments.captures[0]`, schema `capture` (`orders.yaml:11825`).
  - `status` (`orders.yaml:11694`): `COMPLETED | DECLINED | PARTIALLY_REFUNDED | PENDING | REFUNDED | FAILED`. `COMPLETED` means "funds ... were credited to the payee's PayPal account".
  - `status_details.reason` (`orders.yaml:11611`), for PENDING or DENIED: `BUYER_COMPLAINT, CHARGEBACK, ECHECK, INTERNATIONAL_WITHDRAWAL, OTHER, PENDING_REVIEW, RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION, REFUNDED, TRANSACTION_APPROVED_AWAITING_FUNDING, UNILATERAL, VERIFICATION_REQUIRED, DECLINED_BY_RISK_FRAUD_FILTERS`.
  - `amount.currency_code`, and `amount.value` as a string matching `^((-?[0-9]+)|(-?([0-9]+)?[.][0-9]+))$`, max 32. Compare it with `Decimal`, never float.
  - `custom_id` (max 255), `invoice_id`, `id` (the capture id), `final_capture`, `seller_protection`.
  - `seller_receivable_breakdown.{gross_amount, paypal_fee, net_amount, receivable_amount, exchange_rate}`, which is "not available for transactions that are in pending state".
- **Request-side tie-in fields** (`purchase_unit_request`, `orders.yaml:5145`):

| Field | Limit | Notes |
|---|---|---|
| `reference_id` | 1..256 | |
| `custom_id` | 1..255 | "not visible to the payer". Put our internal order id here. |
| `invoice_id` | 1..127 | "required to be unique within each merchant account by default". Otherwise you get `DUPLICATE_INVOICE_ID`. |
| `description` | 127 effective | |
| `soft_descriptor` | 22 effective | |
| `items[]` | | required `name`, `quantity` (max 10), `unit_amount`; `sku` max 127; `category` in `DIGITAL_GOODS / PHYSICAL_GOODS / DONATION` |

- **Grant only if all of these hold:** `capture.status == "COMPLETED"`, currency is `USD`, `Decimal(value)` equals the server-side expected price, `custom_id` equals our order id, and the PayPal order id matches the one stored on our pending order.

### 2.3 PENDING captures
- **Prevent eCheck pendings** with `payment_source.paypal.experience_context.payment_method_preference = "IMMEDIATE_PAYMENT_REQUIRED"`. The schema (`orders.yaml:6695` and following) says it "Accepts only immediate payment ... Ensures that at the time of capture, the payment does not have the `pending` status."
- **Avoid currency-preference pendings:** `RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION` fires when the capture currency differs from a currency the payee holds. The currency-codes page also says such a payment "remains pending until you manually approve". Charge only in USD and make sure the business account holds USD or auto-accepts it.
- **If a capture is still PENDING:** mark the local order `pending_payment`, don't grant access, show "Pago en revisión", and wait for `PAYMENT.CAPTURE.COMPLETED` (grant) or `PAYMENT.CAPTURE.DECLINED` / `DENIED` (fail). Add a periodic job that calls `GET /v2/payments/captures/{id}` as a backstop.

### 2.4 Capture errors to handle
From the Orders v2 errors page (https://developer.paypal.com/api/rest/reference/orders/v2/errors/):

| Error | Meaning | Action |
|---|---|---|
| `INSTRUMENT_DECLINED` (422) | instrument declined | Tell the frontend to restart the session so the buyer can pick another funding source. |
| `ORDER_ALREADY_CAPTURED` | "If 'intent=CAPTURE' only one capture per order is allowed" | `GET` the order and reconcile; do not fail the user. |
| `ORDER_NOT_APPROVED` | buyer hasn't approved yet | |
| `DUPLICATE_INVOICE_ID` | invoice id reused | |
| `TRANSACTION_BLOCKED_BY_PAYEE` / `PAYEE_BLOCKED_TRANSACTION` | blocked by risk settings | |
| `MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED` | too many attempts | |

- **Sandbox negative testing:** send the header `PayPal-Mock-Response: {"mock_application_codes":"INSTRUMENT_DECLINED"}`, as in the official sample's commented code.
- **Network errors and 5xx:** retry with the same `PayPal-Request-Id`.

### 2.5 Webhooks
Event names (https://developer.paypal.com/api/rest/webhooks/event-names/):

| Event | Description | Use |
|---|---|---|
| `CHECKOUT.ORDER.APPROVED` | "A buyer approved a checkout order" | Recovery when the browser closed between approval and capture: the server captures with the same deterministic idempotency key, then fulfills. |
| `CHECKOUT.ORDER.COMPLETED` | marketplaces and platforms only | Ignore. |
| `PAYMENT.CAPTURE.COMPLETED` | "A payment capture completes." | Source of truth for granting, including PENDING that turns COMPLETED. |
| `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED` | | Update state. `PAYMENT.CAPTURE.DENIED` is listed under Payments v1 and Marketplaces. Subscribe to all three. |
| `PAYMENT.CAPTURE.REFUNDED` | "A merchant refunds a payment capture." | Revoke access. |
| `PAYMENT.CAPTURE.REVERSED` | "PayPal reverses a payment capture." | Revoke access. |
| `CUSTOMER.DISPUTE.CREATED / UPDATED / RESOLVED` | disputes | Optionally suspend on CREATED; revoke if resolved for the buyer. |

- **Correlating events to orders:**
  - Capture resources carry `custom_id` and `supplementary_data.related_ids.order_id` (`payments.yaml:3107`; `order_id`, `capture_id` and `authorization_id`, max 20 each).
  - Refund resources (the `refund` schema, `payments.yaml:3906`) carry `id`, `amount`, `invoice_id`, `custom_id` and `note_to_payer`, plus a `links[]` entry with `rel: up` pointing to the capture.
  - **(inferred)** A refund made from the PayPal dashboard may not carry your `custom_id`. Resolve the capture id through `rel: up`, or `GET /v2/payments/captures/{id}`, and look up the order by `capture_id`.
  - **(inferred)** Dispute payloads identify the transaction through `disputed_transactions[].seller_transaction_id`. Check this against a sandbox payload.
- **Delivery rules** (https://developer.paypal.com/api/rest/webhooks/):
  - Respond `2xx`. Anything else is retried "up to 25 attempts over 3 days", then marked Failed and resendable from the dashboard.
  - Deduplicate on `event.id`.
  - Process idempotently. Events can arrive out of order or after the synchronous capture already fulfilled the order.

### 2.6 Webhook signature verification
**Option A: postback** (`webhooks.yaml:279`, schema `verify_webhook_signature` at `webhooks.yaml:1357`). Send `POST /v1/notifications/verify-webhook-signature` with a Bearer token and these fields, all required:

| Field | Max length | Source |
|---|---|---|
| `auth_algo` | 100 | header `PAYPAL-AUTH-ALGO` |
| `cert_url` | 500 | header `PAYPAL-CERT-URL` |
| `transmission_id` | 50 | header `PAYPAL-TRANSMISSION-ID` |
| `transmission_sig` | 500 | header `PAYPAL-TRANSMISSION-SIG` |
| `transmission_time` | 100 | header `PAYPAL-TRANSMISSION-TIME` |
| `webhook_id` | 50 | your dashboard's webhook id |
| `webhook_event` | | the event |

- The response is `{"verification_status": "SUCCESS" | "FAILURE"}`.
- The guide warns "It is essential that the webhook_event data be posted back exactly as it was received". In Python, splice the raw body bytes into the JSON instead of `json.loads` then `json.dumps` (code below).
- "Postback verification is not supported for mock webhook events". Test with real sandbox transactions.

**Option B: self-verification** (https://developer.paypal.com/api/rest/webhooks/rest/, 2026-06-18):
- The message is `f"{transmission_id}|{transmission_time}|{webhook_id}|{crc32_decimal_of_raw_body}"`.
- Verify `base64decode(PAYPAL-TRANSMISSION-SIG)` with RSA PKCS1v15 and SHA-256, using the public key of the certificate at `PAYPAL-CERT-URL`. Download it once and cache it.
- "You must use the original raw body ... do not parse ... and then re-stringify it".
- **(inferred, hardening)** Accept the cert URL only if it is `https` and its host ends in `.paypal.com`.
- This avoids one API call per event but needs the `cryptography` package.

### 2.7 Refunds, disputes, revoking access
- **Refund:** `POST /v2/payments/captures/{capture_id}/refund` (`refund_request`, `payments.yaml:3805`).
  - "For a full refund, include an empty request body". For a partial refund, send `amount`.
  - Optional fields: `custom_id` (127), `invoice_id` (127), `note_to_payer` (255).
  - Send a `PayPal-Request-Id` **(inferred: supported like the other write calls)**.
  - Refund `status`: `CANCELLED | FAILED | PENDING | COMPLETED`. `status_details.reason` can be `ECHECK`.
- **Revocation policy** (our design):
  - Revoke on `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.CAPTURE.REVERSED`.
  - On `CUSTOMER.DISPUTE.CREATED`, either keep access and gather evidence, or suspend.
  - On `RESOLVED` in the buyer's favour, revoke.
  - In LearnHouse terms: remove the course enrollment or ebook entitlement, keep the purchase row with status `refunded` / `reversed`, and keep an audit log.
- **Evidence for digital goods:** PayPal's Seller Protection terms (regional legal-hub pages dated 2026-01-26, e.g. https://www.paypal.com/ph/legalhub/paypal/seller-protection) require "compelling evidence" of delivery or access for intangible goods. Log purchase time, delivery email, first access, progress events, IP and user agent. LearnHouse progress tracking helps here.
- **Mark the items as digital** with `items[].category = "DIGITAL_GOODS"`. The schema notes it is not supported for PayPal Commerce Platform partner callers, which doesn't apply to a direct merchant.

---

## 3. Card payments without a PayPal account

**Guest ("Branded Card / Debit Card") checkout:**
- In v6 this is the `paypal-guest-payments` component: `sdkInstance.createPayPalGuestOneTimePaymentSession({ onApprove, onCancel, onComplete, onError, onWarn, ... })`, the element `<paypal-basic-card-container><paypal-basic-card-button id="paypal-basic-card-button">`, and `start({ presentationMode: "auto" }, createOrder())`. Modes are `auto`, `modal`, `popup` and `redirect` (https://developer.paypal.com/cards/standalone-payment-button, 2026-08-07).
- In React: `PayPalGuestPaymentButton`, with `components={["paypal-payments","paypal-guest-payments"]}`.
- The server order is a plain Orders v2 order with `intent: "CAPTURE"`, the same create and capture as the PayPal button.
- **Requirement:** the page says to check that "standalone payments are enabled in PayPal app settings" (Developer Dashboard, app settings).
- **Where it works:**
  - **Merchant side:** PayPal's guest-payments country list (archived page, updated 2026-09-14, https://developer.paypal.com/docs/archive/payments/guest-payments/supported-countries/) says "Guest payments are available in these countries to merchants who use ..." and lists **Venezuela** with 72 other countries.
  - **Buyer side:** eligibility is decided at runtime by PayPal risk, buyer country and history. I found no official buyer-country list; third-party help pages (Kajabi, LitExtension) describe this. Show the button only if `findEligibleMethods` or `useEligibleMethods` marks it eligible, and keep the PayPal button as fallback. **(inferred)** Venezuelan buyers paying with Venezuelan cards will often be declined: those cards are frequently not enabled for international use, per community reports, not official. That is why SPIDI / Pago Móvil is the main local rail.

**Advanced Card Fields (`card-fields`, own-form card processing):**
- These need "Expanded/Advanced checkout" eligibility, which covers 37 countries and 22 currencies (https://developer.paypal.com/docs/checkout/advanced/eligibility, 2026-08-17).
- Venezuela is not mentioned there.
- The VE merchant-fees page lists advanced card rates only for SG.
- **Conclusion (inferred): not available to a VE-registered account.** Use the guest button.

**Venmo** is US merchants and US consumers only, in USD. It doesn't apply.

---

## 4. Venezuela: can a VE-registered PayPal account receive payments?

**Evidence it can receive commercial payments (official, 2026):**
1. **REST API country list:** "The REST APIs support many countries for PayPal account payments if you have a business account ... The PayPal REST APIs support these countries:" and the list includes **VENEZUELA VE** (https://developer.paypal.com/api/rest/reference/country-codes/, last updated 2026-08-17, read directly). Live REST credentials require a PayPal Business account, created in the Developer Dashboard's Live tab after linking that account.
2. **Payouts country table:** Venezuela is in feature set **"Send, receive, and withdraw"**, not a send-only tier. The page lists no "send only" tier at all. Latin America is in the payout currency-conversion exclusions, with a recommendation to pay in USD (https://developer.paypal.com/payouts/supported-features, 2026-09-10).
3. **PayPal VE merchant fees page** (https://www.paypal.com/ve/webapps/mpp/merchant-fees, "Última actualización: 28 de septiembre de 2026", read directly):
   - Domestic receiving: **5.40% + fixed fee** (VE in the group "AG, BB, ... UY y VE").
   - Business rate on application: 5.40% (USD 0–3,000/month), 4.90% (3,000–10,000), 4.70% (10,000–100,000), 4.40% (over 100,000).
   - International receiving, buyers in all markets: **5.40% + fixed fee**.
   - **Fixed fee in USD: USD 0.30.** Micropayments: 6.50% + USD 0.05.
   - Currency conversion: 3.50% when receiving or converting to another currency; 4.50% when sending or receiving refunds.
   - Dispute fees: VE is in the standard-dispute table; per the fetch summary, **USD 8.00 standard / USD 16.00 high-volume**.
   - Chargeback fee: "all other markets" table, **USD 10.00** **(inferred to apply to VE)**.
4. **PayPal VE business page** (https://www.paypal.com/ve/business) offers "Pagar en línea" (checkout), payment links and "Facturación" (invoicing) to Venezuelan businesses.
5. **Case study:** a PayPal case study (2023-04-22) shows Seguros Caracas, a Venezuelan insurer, accepting payments "using U.S. dollars" (https://www.paypal.com/us/brc/case-study/seguros-caracas-case-study).
6. **Currencies:** the REST currency list has 25 codes (AUD, BRL, CAD, CNY, CZK, DKK, EUR, HKD, HUF, ILS, JPY, MYR, MXN, TWD, NZD, NOK, PHP, PLN, GBP, RUB, SGD, SEK, CHF, THB, USD). There is **no VES/bolívar** (https://developer.paypal.com/api/rest/reference/currency-codes/, 2026-08-17). **Charge in USD.**
7. **Checkout locale:** the locale table lists Venezuela with `es-VE` (priority 0, `es_XC`), so `experience_context.locale = "es-VE"` is valid (https://developer.paypal.com/api/rest/reference/locale-codes/, 2026-07-01).

**Withdrawing money is the real problem:**
- **No local-bank withdrawal.** The VE merchant-fees withdrawal table has no Venezuelan local-bank row. Under "Cuenta bancaria en EE. UU." it names specific markets at 3.00% / 3.50%. VE is not among them, so it falls in "Todos los demás mercados: Sin comisión (si no se requiere una conversión de divisas)". **(inferred)** A VE business account can withdraw USD to a **US bank account** at no PayPal fee.
- **Search snippet:** a search-engine snippet of `paypal.com/ve/webapps/mpp/withdrawal-options` read "Si tienes una cuenta bancaria en Estados Unidos, puedes retirar fondos directamente ... selecciona la opción Transferir". That URL now redirects to a generic wallet page, so I could not confirm it live.
- **Local withdrawal not found:** I found no official source saying VE accounts can withdraw to a Venezuelan bank.
- **What Venezuelan sellers typically do** (community and vendor sources, not official, not verified):
  - Keep the USD balance in PayPal.
  - Withdraw to a US bank account they own, or via a US LLC.
  - Sell the balance P2P (El Dorado, Airtm, Binance P2P), with fees and terms-of-service and account-limitation risk. For example https://eldorado.io/en/blog/ganar-dinero-paypal-p2p/ (vendor marketing).
- **Account verification:** linking a card is needed, and Venezuelan cards often fail unless enabled for international use (forum reports, e.g. justanswer.es).
- **Limitations:** older community reports describe account limitations and "admin locked" rejections for Venezuelan users (DigitalOcean community, 2020; outdated). Plan for PayPal limiting or holding funds on a new account and keep documentation ready (ID, business evidence, delivery logs).

**The US LLC option, compared** (US merchant fees, https://www.paypal.com/us/business/paypal-business-fees, 2026-10-01):

| | US account | VE account |
|---|---|---|
| PayPal Checkout | 3.49% + USD 0.49 | 5.40% + USD 0.30 |
| Standard card | 2.99% + USD 0.49 | 5.40% + USD 0.30 |
| International buyer surcharge | +1.50% | none (same 5.40%) |
| Currency conversion | 3–4% | 3.50% / 4.50% |
| Disputes | USD 15 standard / USD 30 high volume | USD 8 / USD 16 |

- A US account also gets advanced cards at 2.89% + USD 0.29.
- Worked examples:
  - USD 20 ebook to a non-US buyer: VE account 1.08 + 0.30 = **USD 1.38**; US account 0.70 + 0.30 + 0.49 = **USD 1.49**.
  - USD 20 ebook to a US buyer: the US account costs about **USD 1.19**.
- The fee difference is small. A US entity mainly brings bank-withdrawal access, advanced card fields and lower limitation risk, at the cost of LLC upkeep and tax filings. That is a legal and accounting decision for the client, not a code decision.

**Practical recommendation:**
- Ship PayPal as one provider, priced in USD, with the PayPal button and the guest card button.
- Make SPIDI (Pago Móvil, in VES at the BCV rate) the primary local rail later.
- Before going live, the client must:
  1. Open or upgrade a PayPal **Business** account.
  2. Verify it.
  3. Create a Live REST app with standalone/guest payments enabled.
  4. Set Payment Receiving Preferences to accept USD automatically.
  5. Confirm in her own account which withdrawal options appear (US bank vs. none).

---

## 5. Implementation recipe (Python httpx + React sdk-v6)

### 5.1 Raw REST with httpx vs `paypal-server-sdk`
- **`paypal-server-sdk`** (PyPI, version 2.4.0, released 2026-08-21) depends on `apimatic-core`, `apimatic-core-interfaces`, `apimatic-requests-client-adapter` and `python-dotenv`. PyPI's description says it "currently includes only 5 of PayPal's API endpoints".
- **httpx** is already pinned in LearnHouse (`httpx==0.28.1`, `apps/api/pyproject.toml:14`). We need only 5–6 calls (token, create, get, capture, refund, verify-webhook).
- **Recommendation: raw httpx, no new dependency.** Optionally add `cryptography` only if you choose self-verification of webhooks.

### 5.2 `paypal_client.py` (async, provider-agnostic friendly)
```python
# apps/api/src/services/payments/providers/paypal_client.py   (proposed path)
import asyncio, json, time, uuid
from decimal import Decimal
from typing import Any, Literal
import httpx

BASES = {"sandbox": "https://api-m.sandbox.paypal.com", "live": "https://api-m.paypal.com"}
IDEMP_NS = uuid.UUID("8c1f6f0e-2b7a-4c3e-9a51-5a7e0c2d9b11")  # any fixed UUID for this app

def idem(kind: str, ref: str) -> str:
    """Deterministic PayPal-Request-Id: same logical op -> same key (36 chars)."""
    return str(uuid.uuid5(IDEMP_NS, f"{kind}:{ref}"))

def usd(v: Decimal) -> str:
    return str(v.quantize(Decimal("0.01")))

class PayPalError(Exception):
    def __init__(self, status: int, body: Any):
        self.status, self.body = status, body
        issue = None
        if isinstance(body, dict) and body.get("details"):
            issue = body["details"][0].get("issue")
        self.issue = issue  # e.g. INSTRUMENT_DECLINED, ORDER_ALREADY_CAPTURED
        super().__init__(f"PayPal {status} {issue or body}")

class PayPalClient:
    def __init__(self, client_id: str, secret: str, env: Literal["sandbox", "live"] = "sandbox"):
        self._auth = (client_id, secret)
        self._http = httpx.AsyncClient(base_url=BASES[env], timeout=httpx.Timeout(20.0, connect=5.0))
        self._token: str | None = None
        self._exp = 0.0
        self._lock = asyncio.Lock()

    async def aclose(self): await self._http.aclose()

    # ---- OAuth2 client-credentials with caching ----
    async def access_token(self) -> str:
        if self._token and time.monotonic() < self._exp - 300:
            return self._token
        async with self._lock:
            if self._token and time.monotonic() < self._exp - 300:
                return self._token
            r = await self._http.post(
                "/v1/oauth2/token",
                data={"grant_type": "client_credentials"},
                auth=self._auth,
                headers={"Accept": "application/json"},
            )
            if r.status_code != 200:
                raise PayPalError(r.status_code, _safe_json(r))
            j = r.json()
            self._token, self._exp = j["access_token"], time.monotonic() + int(j["expires_in"])
            return self._token

    async def _call(self, method: str, path: str, *, body: Any = None, raw: bytes | None = None,
                    request_id: str | None = None, prefer: str | None = "return=representation",
                    retries: int = 2) -> dict:
        for attempt in range(retries + 1):
            headers = {"Authorization": f"Bearer {await self.access_token()}",
                       "Content-Type": "application/json", "Accept": "application/json"}
            if request_id: headers["PayPal-Request-Id"] = request_id
            if prefer: headers["Prefer"] = prefer
            try:
                r = await self._http.request(method, path, headers=headers,
                                             content=raw if raw is not None else
                                             (json.dumps(body) if body is not None else None))
            except httpx.TransportError:
                if attempt < retries:
                    await asyncio.sleep(0.5 * 2 ** attempt); continue   # same request_id => safe
                raise
            if r.status_code == 401 and attempt < retries:
                self._token = None; continue
            if r.status_code >= 500 and attempt < retries:
                await asyncio.sleep(0.5 * 2 ** attempt); continue
            if r.status_code >= 400:
                raise PayPalError(r.status_code, _safe_json(r))
            return r.json() if r.content else {}
        raise RuntimeError("unreachable")

    # ---- Create order ----
    async def create_order(self, *, our_order_id: str, amount: Decimal, sku: str, name: str,
                           description: str, return_url: str, cancel_url: str,
                           method: Literal["paypal", "card"] = "paypal") -> dict:
        value = usd(amount)
        ctx = {
            "brand_name": "Sanar y Criar",          # max 127
            "locale": "es-VE",                       # listed in PayPal locale table for VE
            "shipping_preference": "NO_SHIPPING",    # digital goods
            "user_action": "PAY_NOW",                # amount is final
            "return_url": return_url,
            "cancel_url": cancel_url,
        }
        body: dict = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "reference_id": our_order_id,
                "custom_id": our_order_id,               # <=255, our join key
                "invoice_id": f"SYC-{our_order_id}",     # <=127, must be unique per merchant
                "description": description[:127],
                "soft_descriptor": "SANARYCRIAR",        # 22 chars effective
                "amount": {"currency_code": "USD", "value": value,
                           "breakdown": {"item_total": {"currency_code": "USD", "value": value}}},
                "items": [{"name": name[:127], "sku": sku[:127], "quantity": "1",
                           "unit_amount": {"currency_code": "USD", "value": value},
                           "category": "DIGITAL_GOODS"}],
            }],
        }
        if method == "paypal":
            ctx["payment_method_preference"] = "IMMEDIATE_PAYMENT_REQUIRED"  # avoid eCheck PENDING
            ctx["landing_page"] = "NO_PREFERENCE"
            body["payment_source"] = {"paypal": {"experience_context": ctx}}
        else:
            # Guest card button: official v6 sample sends a plain order (no payment_source).
            # application_context is DEPRECATED (orders.yaml:8198) but still in the schema;
            # (inferred) still honoured -- verify in sandbox, or drop it.
            body["application_context"] = {k: ctx[k] for k in
                ("brand_name", "locale", "shipping_preference", "user_action", "return_url", "cancel_url")}
        return await self._call("POST", "/v2/checkout/orders", body=body,
                                request_id=idem("create", our_order_id))

    async def get_order(self, paypal_order_id: str) -> dict:
        return await self._call("GET", f"/v2/checkout/orders/{paypal_order_id}", prefer=None)

    # ---- Capture ----
    async def capture_order(self, paypal_order_id: str) -> dict:
        try:
            return await self._call("POST", f"/v2/checkout/orders/{paypal_order_id}/capture",
                                    raw=b"{}", request_id=idem("capture", paypal_order_id))
        except PayPalError as e:
            if e.issue == "ORDER_ALREADY_CAPTURED":
                return await self.get_order(paypal_order_id)   # reconcile instead of failing
            raise

    async def refund_capture(self, capture_id: str, *, amount: Decimal | None = None,
                             note: str | None = None, ref: str) -> dict:
        body: dict = {}
        if amount is not None: body["amount"] = {"currency_code": "USD", "value": usd(amount)}
        if note: body["note_to_payer"] = note[:255]
        return await self._call("POST", f"/v2/payments/captures/{capture_id}/refund",
                                body=body, request_id=idem("refund", ref))

    # ---- Webhook verification (postback); raw body spliced in verbatim ----
    async def verify_webhook(self, headers: dict[str, str], raw_body: bytes, webhook_id: str) -> bool:
        h = {k.lower(): v for k, v in headers.items()}
        try:
            meta = {
                "auth_algo": h["paypal-auth-algo"],
                "cert_url": h["paypal-cert-url"],
                "transmission_id": h["paypal-transmission-id"],
                "transmission_sig": h["paypal-transmission-sig"],
                "transmission_time": h["paypal-transmission-time"],
                "webhook_id": webhook_id,
            }
        except KeyError:
            return False
        # Build JSON without re-serialising the event (PayPal: post it back "exactly as it was received")
        raw = json.dumps(meta)[:-1].encode() + b',"webhook_event":' + raw_body + b"}"
        res = await self._call("POST", "/v1/notifications/verify-webhook-signature", raw=raw, prefer=None)
        return res.get("verification_status") == "SUCCESS"

def _safe_json(r: httpx.Response):
    try: return r.json()
    except Exception: return r.text[:500]

# ---- Result checking: decide grant / pending / fail ----
def evaluate_capture(order: dict, *, our_order_id: str, expected: Decimal) -> tuple[str, dict | None]:
    pu = (order.get("purchase_units") or [{}])[0]
    caps = (pu.get("payments") or {}).get("captures") or []
    if not caps:
        return "failed", None
    cap = caps[0]
    amt = cap.get("amount") or {}
    custom = cap.get("custom_id") or pu.get("custom_id")
    if amt.get("currency_code") != "USD" or Decimal(amt.get("value", "0")) != expected \
            or custom != our_order_id:
        return "mismatch", cap                       # alert + do NOT grant (investigate/refund)
    st = cap.get("status")
    if st == "COMPLETED" and order.get("status") == "COMPLETED":
        return "paid", cap
    if st == "PENDING":
        return "pending", cap                        # wait for PAYMENT.CAPTURE.COMPLETED
    return "failed", cap                             # DECLINED / FAILED / REFUNDED...
```

**Optional self-verification instead of the postback** (requires `cryptography`):
```python
import base64, zlib
from urllib.parse import urlparse
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

_cert_cache: dict[str, bytes] = {}
async def verify_webhook_local(http: httpx.AsyncClient, h: dict[str, str], raw: bytes, webhook_id: str) -> bool:
    h = {k.lower(): v for k, v in h.items()}
    url = h.get("paypal-cert-url", "")
    u = urlparse(url)
    if u.scheme != "https" or not (u.hostname or "").endswith(".paypal.com"):   # (inferred) hardening
        return False
    if url not in _cert_cache:
        _cert_cache[url] = (await http.get(url)).content
    pub = x509.load_pem_x509_certificate(_cert_cache[url]).public_key()
    msg = f'{h["paypal-transmission-id"]}|{h["paypal-transmission-time"]}|{webhook_id}|{zlib.crc32(raw) & 0xffffffff}'
    try:
        pub.verify(base64.b64decode(h["paypal-transmission-sig"]), msg.encode(), padding.PKCS1v15(), hashes.SHA256())
        return True
    except Exception:
        return False
```

### 5.3 FastAPI routes (sketch; the provider-agnostic order and fulfillment layer is ours)
```python
from fastapi import APIRouter, Request, HTTPException, Depends
router = APIRouter(prefix="/api/v1/payments/paypal")

@router.post("/orders")
async def create(body: dict, user=Depends(get_current_user)):
    product = await products.get(body["product_id"])            # course or ebook offer
    order = await orders.create_pending(user.id, product, provider="paypal")  # price from DB
    pp = await paypal.create_order(our_order_id=order.uuid, amount=product.price_usd,
                                   sku=product.sku, name=product.title, description=product.title,
                                   return_url=f"{SITE}/checkout/ok", cancel_url=f"{SITE}/checkout/cancel",
                                   method="card" if body.get("method") == "card" else "paypal")
    await orders.attach_provider_ref(order.id, paypal_order_id=pp["id"])
    return {"paypal_order_id": pp["id"]}

@router.post("/orders/{paypal_order_id}/capture")
async def capture(paypal_order_id: str, user=Depends(get_current_user)):
    order = await orders.by_paypal_id(paypal_order_id)
    if not order or order.user_id != user.id: raise HTTPException(404)
    if order.status == "paid": return {"status": "paid"}          # idempotent
    try:
        res = await paypal.capture_order(paypal_order_id)
    except PayPalError as e:
        if e.issue == "INSTRUMENT_DECLINED": return {"status": "retry"}   # frontend restarts session
        raise HTTPException(502, "payment_error")
    verdict, cap = evaluate_capture(res, our_order_id=order.uuid, expected=order.amount_usd)
    if verdict == "paid":
        await fulfill_order(order.id, provider="paypal", provider_ref=cap["id"])   # enroll / unlock ebook
    elif verdict == "pending":
        await orders.mark(order.id, "pending_payment", capture_id=cap["id"])
    else:
        await orders.mark(order.id, "failed" if verdict == "failed" else "review")
    return {"status": verdict}

@router.post("/webhook")
async def webhook(request: Request):
    raw = await request.body()                                   # raw bytes, never re-serialise
    if not await paypal.verify_webhook(dict(request.headers), raw, PAYPAL_WEBHOOK_ID):
        raise HTTPException(400)
    ev = json.loads(raw)
    if await webhook_events.seen(ev["id"]): return {"ok": True}  # dedupe
    t, r = ev["event_type"], ev["resource"]
    if t == "CHECKOUT.ORDER.APPROVED":                            # buyer closed tab before capture
        order = await orders.by_paypal_id(r["id"])
        if order and order.status == "pending":
            res = await paypal.capture_order(r["id"])             # same idempotency key as client path
            v, cap = evaluate_capture(res, our_order_id=order.uuid, expected=order.amount_usd)
            if v == "paid": await fulfill_order(order.id, provider="paypal", provider_ref=cap["id"])
    elif t == "PAYMENT.CAPTURE.COMPLETED":
        order = await orders.by_uuid(r.get("custom_id")) or \
                await orders.by_paypal_id(r.get("supplementary_data", {}).get("related_ids", {}).get("order_id"))
        if order and Decimal(r["amount"]["value"]) == order.amount_usd and r["amount"]["currency_code"] == "USD":
            await fulfill_order(order.id, provider="paypal", provider_ref=r["id"])
    elif t in ("PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.DENIED"):
        await orders.fail_by_capture(r["id"])
    elif t in ("PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"):
        cap_id = next((l["href"].rsplit("/", 1)[-1] for l in r.get("links", []) if l.get("rel") == "up"), None)
        await revoke_by_capture(cap_id, reason=t)                 # remove enrollment / ebook entitlement
    elif t.startswith("CUSTOMER.DISPUTE."):
        await disputes.record(ev)                                  # policy: suspend on CREATED, revoke if lost
    await webhook_events.mark(ev["id"])
    return {"ok": True}
```
**Environment variables:**
- `PAYPAL_ENV=sandbox|live`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` (server only).
- `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `NEXT_PUBLIC_PAYPAL_ENVIRONMENT` (frontend). Never prefix the secret with `NEXT_PUBLIC_`.

### 5.4 React (Next.js client component) with `@paypal/react-paypal-js@^10` and `sdk-v6`
```tsx
"use client";
import { useState } from "react";
import {
  PayPalProvider, PayPalOneTimePaymentButton, PayPalGuestPaymentButton,
  usePayPal, useEligibleMethods, INSTANCE_LOADING_STATE,
  type OnApproveDataOneTimePayments,
} from "@paypal/react-paypal-js/sdk-v6";

type Props = { productId: string; apiBase: string; accessToken: string; onPaid: () => void };

export default function PayPalCheckout(props: Props) {
  return (
    <PayPalProvider
      clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!}
      environment={process.env.NEXT_PUBLIC_PAYPAL_ENVIRONMENT === "production" ? "production" : "sandbox"}
      components={["paypal-payments", "paypal-guest-payments"]}
      pageType="checkout"
      locale="es-VE"
    >
      <Buttons {...props} />
    </PayPalProvider>
  );
}

function Buttons({ productId, apiBase, accessToken, onPaid }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const { loadingStatus } = usePayPal();
  const { eligiblePaymentMethods, isLoading, error } = useEligibleMethods({
    payload: { currencyCode: "USD", paymentFlow: "ONE_TIME_PAYMENT" },
  });
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

  const createOrder = (method: "paypal" | "card") => async () => {
    const r = await fetch(`${apiBase}/api/v1/payments/paypal/orders`, {
      method: "POST", headers: auth, body: JSON.stringify({ product_id: productId, method }),
    });
    if (!r.ok) throw new Error(`create ${r.status}`);
    const { paypal_order_id } = await r.json();
    return { orderId: paypal_order_id };
  };

  const onApprove = async ({ orderId }: OnApproveDataOneTimePayments) => {
    const r = await fetch(`${apiBase}/api/v1/payments/paypal/orders/${orderId}/capture`, {
      method: "POST", headers: auth,
    });
    const { status } = await r.json();
    if (status === "paid") onPaid();                                 // access is granted server-side
    else if (status === "pending") setMsg("Tu pago está en revisión. Te avisaremos por correo.");
    else if (status === "retry") setMsg("Tu método de pago fue rechazado. Intenta con otro.");
    else setMsg("No pudimos completar el pago.");
  };
  const common = {
    presentationMode: "auto" as const,
    onApprove,
    onCancel: () => setMsg("Pago cancelado."),
    onError: () => setMsg("Ocurrió un error con PayPal. Intenta de nuevo."),
  };

  if (loadingStatus === INSTANCE_LOADING_STATE.PENDING || isLoading) return <p>Cargando PayPal…</p>;
  if (error) return <p>No se pudieron cargar los métodos de pago.</p>;
  return (
    <div>
      <PayPalOneTimePaymentButton createOrder={createOrder("paypal")} type="pay" {...common} />
      {/* Guest card button; render only if eligible. The official sample renders it unconditionally,
          so (inferred) the component hides itself when ineligible. */}
      <PayPalGuestPaymentButton createOrder={createOrder("card")} {...common} />
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
```
This follows the official sample `client/prebuiltPages/react/src/paymentFlowCheckoutPages/OneTimePaymentCheckout.tsx`, which uses `useEligibleMethods` with `paymentFlow: "ONE_TIME_PAYMENT"`, `PayPalOneTimePaymentButton createOrder={...} presentationMode="auto"` and `PayPalGuestPaymentButton`.

**Legacy v5 alternative** (deprecated; only if v6 misbehaves):
```tsx
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
<PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture", enableFunding: "card" }}>
  <PayPalButtons createOrder={async () => (await createOrder("paypal")()).orderId}
                 onApprove={async (d) => onApprove({ orderId: d.orderID } as any)} />
</PayPalScriptProvider>
```

### 5.5 Go-live checklist
- **Sandbox first:**
  - Use buyer and business sandbox accounts.
  - Test `INSTRUMENT_DECLINED` through the `PayPal-Mock-Response` header.
  - Close the popup after approving and confirm the `CHECKOUT.ORDER.APPROVED` webhook recovers the order.
  - Refund from the dashboard and confirm access is revoked.
- **Webhook setup:**
  - Subscribe to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED` and `CUSTOMER.DISPUTE.*`.
  - Store `PAYPAL_WEBHOOK_ID` separately for sandbox and live.
- **Popup header:** add `Cross-Origin-Opener-Policy: same-origin-allow-popups` on the checkout pages.
- **Price display:** show prices in USD. SPIDI will later show VES at the BCV rate through the same provider-agnostic `Order` and `fulfill_order()` / `revoke_by_capture()` layer.

---

## Sources
- v5 to v6 upgrade guide: https://developer.paypal.com/v5-v6
- v6 set-up: https://developer.paypal.com/sdk/js/set-up
- v6 JS reference: https://developer.paypal.com/sdk/js/reference.md
- v6 advanced configurations: https://developer.paypal.com/sdk/js/advanced
- v6 standalone card (guest) button: https://developer.paypal.com/cards/standalone-payment-button
- React SDK v6 reference: https://developer.paypal.com/sdk/react/reference
- Next.js checkout guide: https://developer.paypal.com/guides/nextjs-checkout
- react-paypal-js README: https://unpkg.com/@paypal/react-paypal-js@10.6.0/README.md
- npm registry entry: https://registry.npmjs.org/@paypal/react-paypal-js/latest
- Official v6 sample repo: https://github.com/paypal-examples/v6-web-sdk-sample-integration (`server/node/src/routes/*.ts`, `client/prebuiltPages/react/src/*`)
- Orders v2 API: https://developer.paypal.com/docs/api/orders/v2/
- Orders v2 schema: https://developer.paypal.com/api/orders/v2/schema.yaml
- Orders v2 errors: https://developer.paypal.com/api/rest/reference/orders/v2/errors/
- Payments v2 API: https://developer.paypal.com/docs/api/payments/v2/
- Payments v2 schema: https://developer.paypal.com/api/payments/v2/schema.yaml
- Idempotency: https://developer.paypal.com/api/rest/reference/idempotency/
- Authentication: https://developer.paypal.com/api/rest/authentication/
- Webhooks overview: https://developer.paypal.com/api/rest/webhooks/
- Webhooks integration guide: https://developer.paypal.com/api/rest/webhooks/rest/
- Webhook event names: https://developer.paypal.com/api/rest/webhooks/event-names/
- Webhooks v1 schema: https://developer.paypal.com/api/webhooks/v1/schema.yaml
- REST country codes: https://developer.paypal.com/api/rest/reference/country-codes/
- Currency codes: https://developer.paypal.com/api/rest/reference/currency-codes/
- Locale codes: https://developer.paypal.com/api/rest/reference/locale-codes/
- Payouts supported features: https://developer.paypal.com/payouts/supported-features
- Guest payments supported countries (archived): https://developer.paypal.com/docs/archive/payments/guest-payments/supported-countries/
- Advanced checkout eligibility: https://developer.paypal.com/docs/checkout/advanced/eligibility
- PayPal VE merchant fees: https://www.paypal.com/ve/webapps/mpp/merchant-fees
- PayPal VE consumer fees: https://www.paypal.com/ve/webapps/mpp/paypal-fees
- PayPal VE business: https://www.paypal.com/ve/business
- PayPal VE withdrawal options (now redirects): https://www.paypal.com/ve/webapps/mpp/withdrawal-options
- Seguros Caracas case study: https://www.paypal.com/us/brc/case-study/seguros-caracas-case-study
- PayPal US business fees: https://www.paypal.com/us/business/paypal-business-fees
- Seller Protection (regional legal hub): https://www.paypal.com/ph/legalhub/paypal/seller-protection
- paypal-server-sdk on PyPI: https://pypi.org/pypi/paypal-server-sdk/json
- Non-official context:
  - https://eldiario.com/2022/05/05/como-verificar-cuenta-paypal-2022/
  - https://eldorado.io/en/blog/ganar-dinero-paypal-p2p/
  - https://www.digitalocean.com/community/questions/why-are-paypal-payments-from-venezuela-rejected-are-we-blocked-by-the-company
  - https://help.kajabi.com/en/articles/17175698-check-out-as-a-guest-through-paypal
  - https://litextension.com/faq/docs/payments-and-discounts/payment/dont-see-pay-with-debit-or-credit-card-option-on-paypal-login-page/
  - https://www.justanswer.es/informatica-es/t6gjs-si-necesito-saber-porque-mi-cuenta-paypal-no-deja.html

---

# VERIFICACIÓN INDEPENDIENTE

## Confirmed

**LearnHouse fork, read directly**
- `apps/web/package.json` has `next ^16.4.2` at line 114, `react 19.3.1` at 121, `react-dom 19.3.1` at 123 and `stripe ^23.0.0` at 140.
- `apps/api/pyproject.toml` has `requires-python` at line 5, `fastapi==0.159.1` at 13, `httpx==0.28.1` at 14 and `stripe==16.0.0` at 37.
- `apps/web/next.config.js:70-136` sets no `Cross-Origin-Opener-Policy`.

**orders.yaml (Orders v2.36)**
- The sandbox server is at line 8.
- `checkout_payment_intent` is at line 3702.
- Capture path is at 1889. Its order `id` param is `^[A-Z0-9]+$`, max 36.
- `Prefer` defaults to `return=minimal` on capture (line 1926, not 1925).
- `paypal_request_id` is at 3537-3552, maxLength 10000. It is referenced only on create (48), authorize (1440) and capture (1909).
- Capture responses: `200` for an idempotent replay (line 2002), `201` otherwise (line 2080).
- These enums match the report:
  - `order_status` (12359)
  - `capture_status` (11694): COMPLETED, DECLINED, PARTIALLY_REFUNDED, PENDING, REFUNDED, FAILED
  - `capture_status_details.reason` (11611): all 12 values
- Other fields that match:
  - The 6h/24/48/72h order-lifetime text (12469-12476).
  - `purchase_unit_request` (5145): `reference_id` 256, `custom_id` 255, `invoice_id` 127 (unique by default), 127/22 effective limits for `description`/`soft_descriptor`.
  - `IMMEDIATE_PAYMENT_REQUIRED` in `paypal_wallet_experience_context` (6695).
  - `DIGITAL_GOODS` carries a Commerce Platform caveat.
  - `order_application_context` (8198) has DEPRECATED fields.

**payments.yaml and webhooks.yaml**
- `refund_request` (3805): empty body means a full refund; `custom_id` 127, `invoice_id` 127, `note_to_payer` 255.
- `refund_status_details.reason` = `ECHECK`.
- `related_ids` has order, authorization and capture ids, max 20 each.
- Refund examples contain a `rel: up` link.
- `webhooks.yaml`: v1.11. The verify endpoint is at line 279. The 7 required fields and their max lengths match. `verification_status` is `SUCCESS | FAILURE`.

**npm / unpkg**
- `@paypal/react-paypal-js` latest is 10.6.0.
- Peer deps are `^16.8.0 || ^17 || ^18 || ^19`.
- Exports are `.`, `./sdk-v6` and `./sdk-v6/server`.
- All of these exist with the types the report gives:
  - `PayPalProvider`: `clientId` XOR `clientToken`, each `string | Promise<string>`. `environment: "production" | "sandbox"` is required at the type level.
  - `PayPalOneTimePaymentButton`: `createOrder: () => Promise<{orderId}>`, default `type="pay"`.
  - `PayPalGuestPaymentButton`.
  - `INSTANCE_LOADING_STATE` (a runtime export).
  - `OnApproveDataOneTimePayments`: `{fundingSource, orderId, payerId?, billingToken?}`.
  - `useEligibleMethods`, returning `{eligiblePaymentMethods, isLoading, error}`.
  - `paymentFlow: "ONE_TIME_PAYMENT"`.
- Core script URLs: `paypal-js@11.3.0` builds `new URL("/web-sdk/v6/core", "https://www.sandbox.paypal.com" | "https://www.paypal.com")`.

**Official sample** (`paypal-examples/v6-web-sdk-sample-integration`)
- The COOP middleware and the `GET /paypal-api/auth/browser-safe-client-token` route (which uses `response_type: "client_token"`) exist.
- The React package uses `react-paypal-js ^10.5.2` with `react 19.2.8`.
- The `paypalMockResponse ... INSTRUMENT_DECLINED` comment is in `ordersRouteHandler.ts:567`.
- `OneTimePaymentCheckout.tsx` uses `useEligibleMethods` with `ONE_TIME_PAYMENT`, and renders `PayPalGuestPaymentButton` without any eligibility check.

**PayPal docs**
- Idempotency page (updated 2026-08-11): the "38 single-byte character limit" quote, "latest status of the previous request", and "might fail the second request". No retention window is given.
- Webhooks guide (2026-06-18):
  - The CRC32 message format, the SHA256withRSA algorithm and the raw-body warning.
  - "up to 25 times over 3 days".
  - Mock events are not supported for postback verification.
  - The example uses the `api.sandbox.paypal.com` host.
- Event-names page: DECLINED is listed under Payments v2. DENIED is listed only under Payments v1 and Marketplaces. `CHECKOUT.ORDER.COMPLETED` is for marketplaces and platforms only.

**PayPal VE pages**
- The VE merchant-fees page (saved HTML) shows:
  - "Última actualización: 28 de septiembre de 2026".
  - 5.40% plus a fixed fee for "... UY y VE".
  - Rate tiers of 5.40, 4.90, 4.70 and 4.40%.
  - A fixed fee of USD 0.30.
  - A standard dispute fee of USD 8.00.
- The REST country-codes page lists VENEZUELA `VE` in the table under "The PayPal REST APIs support these countries:".
- The locale table has VE priority 0 = `es_XC` / `es-VE`.
- The currency list has no VES.

**paypal-server-sdk on PyPI**
- Version 2.4.0, uploaded 2026-08-21.
- Depends on apimatic-* and python-dotenv.
- Says it "currently contains only 5 of PayPal's API endpoints".

## Corrections

1. **`cryptography` is already a dependency.** It is pinned as `cryptography==50.0.2` at `apps/api/pyproject.toml:38`, and `pyjwt[crypto]` is at line 39. The report says webhook self-verification "needs the `cryptography` package" and offers to "add `cryptography`". In fact, self-verification adds no new dependency.

2. **The FastAPI sketch lets anonymous users through.**
   - `get_current_user` returns `AnonymousUser()` instead of raising (`src/security/auth.py:694`). `AnonymousUser.id = 0` (`src/db/users.py:194-197`).
   - So in the sketch's `create` and `capture` routes, an unauthenticated caller can create orders with `user_id 0`, and the check `order.user_id != user.id` passes for them.
   - The repo itself warns about this: `src/router.py:56-65` and `src/security/api_token_utils.py:115-130`.
   - Fix: use `get_authenticated_non_api_token_user` (aliased in `src/router.py:66` as `require_authenticated_user`) for create and capture.
   - The PayPal webhook route must sit on a separate router with no auth dependencies.

3. **The router prefix doubles.** `v1_router = APIRouter(prefix="/api/v1")` is defined at `src/router.py:51`. Sub-routers declare no prefix and get one at include time (e.g. `prefix="/auth"` at line 91). If `APIRouter(prefix="/api/v1/payments/paypal")` is included through `v1_router`, the routes end up at `/api/v1/api/v1/payments/paypal/...`.

4. **The frontend base URL doubles too.** `getAPIUrl()` already returns a base ending in `/api/v1/` (`apps/web/services/config/config.ts:156-163`), and services build `${getAPIUrl()}payments/...` with `secureFetch` and `RequestBodyWithAuthHeader` (`services/utils/ts/requests.ts:20`). The report's `${apiBase}/api/v1/payments/paypal/...` duplicates the prefix if `apiBase` comes from `getAPIUrl()`.

5. **The COOP header is optional, not required.** LearnHouse sets no COOP, so the browser default (`unsafe-none`) applies and popups work. `same-origin-allow-popups` is stricter than the default; it hardens the page without breaking popups. The official sample sets it only for `GET *.html` (`crossOriginOpenerPolicyMiddleware.ts`). The go-live checklist item "add COOP" should say "optional; never set `same-origin`".

6. **Guest-button presentation modes.**
   - In the typed SDK, `PayPalGuestPresentationModeOptions = PresentationModeOptionsForAuto & {targetElement?, buyerCountry?, ...}` (`@paypal/paypal-js@11.3.0` `types/v6/components/paypal-guest-payments.d.ts:20-31`).
   - The React hook hard-codes `presentationMode: "auto"` in `usePayPalGuestPaymentSession.handleClick` (react-paypal-js 10.6.0, `dist/v6/esm`).
   - The standalone-button web page lists auto, modal, popup and redirect, but in React only `auto` applies. The report's `{...common}` spread into `PayPalGuestPaymentButton` passes a `presentationMode` that is ignored.

7. **The guest button does not hide itself when ineligible.**
   - The React `PayPalGuestPaymentButton` renders `<paypal-basic-card-container><paypal-basic-card-button>` whenever `isHydrated`, with no eligibility check. Any hiding would have to come from the SDK web component, which is unverified.
   - The report's code calls `useEligibleMethods` but never uses the result, despite its own comment "render only if eligible".
   - Gate the button with `eligiblePaymentMethods?.isEligible(...)`. `EligiblePaymentMethodsOutput.isEligible(fundingSource)` is defined in `find-eligible-methods.d.ts:169-176`. Which funding-source name maps to the guest button (`"card"` or `"basic_cards"`) is not documented there; verify in sandbox.

8. **The refund `PayPal-Request-Id` was read, not inferred.** `$ref: "#/components/parameters/paypal_request_id"` is at `payments.yaml:1201`, inside `/v2/payments/captures/{capture_id}/refund` (line 1160).

9. **The guest-payments country list is weaker evidence than stated.**
   - The archived page (updated 2026-09-14, 73 countries including Venezuela) says "available in these countries to merchants who use:" and then lists Buy Now buttons, donations and shopping carts. All of its links go to `/archive/paypal-payments-standard/`.
   - So it covers legacy Payments Standard, not the v6 or Orders v2 guest (BCDC) button. It does not show that the v6 guest card button is available to VE merchants.

10. **"v5 is deprecated" is softer than presented.** The v5-v6 page (updated 2026-08-24) labels v5 deprecated only in a code comment (`<!-- v5 (deprecated) -->`); the prose never uses the word. No sunset date is given.

11. **Item `quantity` is a string, not "max 10".** It is a string with maxLength 10 and pattern `^[1-9][0-9]{0,9}$`, under `item_request` (around `orders.yaml:4607`). It is not a limit of 10 units.

12. **`presentationMode` has one more value.** One-time PayPal sessions also accept `direct-app-switch`, via `PresentationModeOptionsForDirectAppSwitch` in `paypal-payments.d.ts`.

## Additions

1. **The OSS frontend already has a provider-agnostic checkout contract that the report ignores.**
   - `getOfferCheckoutSession` sends `POST payments/{orgId}/offers/{offerUuid}/checkout?redirect_uri=...` (`apps/web/services/payments/offers.ts:69-82`).
   - Its comment says "Provider-agnostic: the backend selects the correct payment provider based on the org's active PaymentsConfig".
   - `store/offers/[offerid]/offer-detail.tsx:141-170` reads `result.data.checkout_url` and sets `window.location.href` to it.
   - Other endpoints the UI expects:
     - `payments/{orgId}/config`, used by `usePaymentsEnabled` (`components/Hooks/usePaymentsEnabled.tsx`), which returns true if any config is `active`.
     - `.../offers/public-listing`
     - `.../offers/by-resource`
     - `.../enrollments/mine`
   - PayPal can satisfy this contract with no JS SDK: create the order with `payment_source.paypal.experience_context.{return_url, cancel_url}`, return the `rel: "payer-action"` link as `checkout_url`, and capture on return. The schema example at `orders.yaml:330-342` shows status `PAYER_ACTION_REQUIRED` and `https://www.paypal.com/checkoutnow?token=<id>` as `payer-action`.
   - **Inferred, not read in the schema:** PayPal appends `token=<orderId>&PayerID=` to the return URL.
   - `landing_page: GUEST_CHECKOUT` (around `orders.yaml:6794-6818`) sends the redirect straight to the card form, which is a guest-card option that needs no JS.

2. **Including `payment_source.paypal` changes the create response.** The order comes back as `PAYER_ACTION_REQUIRED` with a `payer-action` link, not `CREATED` with `approve`. The official sample's popup/auto order omits `payment_source` (`ordersRouteHandler.ts:93-125`) and uses it only for the redirect variant. The sample also reads `totalAmount` from the request body; do not copy that.

3. **OSS has no paywall.**
   - `check_ee_activity_paid_access` returns `True` when EE is absent (`src/core/ee_hooks.py:80-89`).
   - It is called at:
     - `src/services/courses/activities/access.py:141`
     - `src/services/courses/chapters.py:465`
     - `src/services/ai/rag/access.py:242`
   - Granting or revoking after a PayPal capture means nothing until this hook, or its call sites, are implemented against our own purchases table.

4. **DB state in OSS.**
   - Migration `0314ec7791e1_payments.py:27` creates `paymentsconfig.provider` as the Postgres enum `paymentproviderenum` with only `'STRIPE'`.
   - `q6r7s8t9u0v1_offer_uuid.py:16-19` drops the legacy `paymentscourse`, `paymentsuser` and `paymentsproduct`.
   - `paymentsoffer` and `paymentsenrollment` are not created by any OSS migration; `e8f9a0b1c2d3` guards on `has_table('paymentsoffer')`.
   - `migrations/payments_to_offers_migration.py:1-16` shows EE's design: Offer → UserGroup, with access through UserGroup membership and UserGroupResource.
   - To reuse `paymentsconfig` you need `ALTER TYPE paymentproviderenum ADD VALUE IF NOT EXISTS 'PAYPAL'` (and later `'SPIDI'`), outside a transaction. The repo already uses this pattern in `b2c3d4e5f8a9_add_custom_assignment_type.py:28-31`.

5. **The CSP is fine as it stands.** Global headers set only `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS and similar (`next.config.js:76-85`). There is no `script-src`, `connect-src` or `frame-src`, so the PayPal SDK and its modal iframe load without changes. If a fuller CSP is added later, it must allow `*.paypal.com`.

6. **Name collision with LearnHouse webhooks.** LearnHouse's own `webhooks` router is for outgoing org webhooks: `/api/v1/orgs/{org_id}/webhooks`, behind auth and the "pro" plan (`src/router.py:118-123`). Do not put the PayPal receiver there.

7. **Sandbox country testing.** `testBuyerCountry` exists in `createInstance` options and in `usePayPalOneTimePaymentSession` (`paypal-js` `types/v6/index.d.ts`, `BaseCreateInstanceOptions`). The guest `start` options take `buyerCountry`. Both are useful for testing VE buyers in sandbox.

8. **Partial refunds.** `capture_status` includes `PARTIALLY_REFUNDED`. **Inferred:** `PAYMENT.CAPTURE.REFUNDED` also fires on partial refunds. Revoking on every REFUNDED event is too aggressive; check the capture status with `GET /v2/payments/captures/{id}` first.

9. **Smaller points.**
   - The sample also exposes `GET /paypal-api/auth/browser-safe-client-id`.
   - The `./sdk-v6` export is ESM-only (it has only an `import` condition).
   - `paypal-server-sdk` sits on the sync `apimatic-requests-client-adapter`, which is another reason to use async httpx.
   - VE fees page, withdrawals: the local-bank row reads "Todos los demás mercados (si está disponible)". That "if available" qualifier means it does not show that local withdrawal exists.

Files I wrote in the scratchpad: `C:\Users\mente\AppData\Local\Temp\claude\C--Users-mente-Documents-Psicologa\4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc\scratchpad\rpjs_v6.js.txt` (the react-paypal-js 10.6.0 v6 ESM bundle, saved for inspection). No project files were modified.