# LearnHouse Payments: spec for reimplementing it in our own OSS backend (PayPal now, SPIDI later)

All paths below are relative to the repo root `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse`. An index of absolute paths is at the end. When something comes from reading code, the file and line are cited. When it is my inference, it says "(inferred)". No files were modified.

---

## 0. Key findings

1. **The frontend talks to the payments backend only under `/api/v1/payments/{org_id}/...`**, plus two Stripe-only routes. The base URL comes from `getAPIUrl()`, and the router prefix `/api/v1` is set in `apps/api/src/router.py:51`.
2. **There are two response conventions, and they decide your status codes:**
   - Calls wrapped in `errorHandling` (`apps/web/services/utils/ts/requests.ts:194-227`) throw on any non-2xx and return the raw JSON.
   - Calls wrapped in `getResponseMetadata` (`requests.ts:236-254`) never throw. They return `{success, data, status, HTTPmessage}` and the UI reads `.data`.
3. **The EE models can be reconstructed from OSS code without copying EE.** The sources are:
   - `apps/api/migrations/payments_to_offers_migration.py`
   - `apps/api/src/services/demo/sync.py:2155-2514`, `:3001-3087`
   - `apps/api/src/security/rbac/rbac.py:25-45`, `:512-519`
   - tests: `test_rbac_runtime.py:45-50`, `test_demo_drift.py:502-520`, `test_remediation_stripe_idempotency.py`
4. **In OSS, paid content is free today.** `check_ee_activity_paid_access` returns `True` when no EE hooks are present (`apps/api/src/core/ee_hooks.py:80-89`), and the `/payments` router does not exist.
5. **Paid enforcement already exists in the OSS core and only needs a backend.** It covers the activity read, the chapter tree, video streams, PDF/image/audio/video blocks, content files, trail progress, assignments and RAG. All of it goes through one hook. Replacing that hook (plus two `ee.*` imports in `rbac.py`) turns on paywalls everywhere.
6. **"You own this course" is computed from a TrailRun, not from the purchase.** See `CoursesActions.tsx:73-78, 414-444`. Fulfillment must create the Trail and TrailRun, or the buyer keeps seeing the offer cards.
7. **Schema is created at startup** by `SQLModel.metadata.create_all` (`apps/api/src/core/events/database.py:398`). Every model under `src/db/**` is auto-imported (`database.py:13-47`). New tables in `apps/api/src/db/payments/` are created automatically. Alembic is not run at startup (no call in `docker-entrypoint.sh` or `cli.py`).

---

## 1. Every frontend payments call

Service files:
- `apps/web/services/payments/payments.ts` (config, customers, Stripe analytics)
- `apps/web/services/payments/offers.ts` (offers, checkout, portal, enrollments)
- `apps/web/services/payments/groups.ts` (groups, group resources, group syncs, offer resources)
- `apps/web/services/payments/providers/stripe.ts` (Stripe Connect)

All of them are `'use server'` actions using `RequestBodyWithAuthHeader` (`requests.ts:41-67`): JSON body, `Authorization: Bearer <token>`, `cache: 'no-store'`. Public calls pass the token `''`, so no Authorization header is sent.

### 1.1 Payment configuration (`payments.ts`)

| # | Function (line) | Method + path | Request | Response the UI expects | Wrapper | Used by |
|---|---|---|---|---|---|---|
| C1 | `getPaymentConfigs` (7-14) | GET `/payments/{orgId}/config` | none | **Array** of configs. Fields read: `id`, `provider` (`'stripe'` today), `provider_specific_id`, `active`, `enabled`. `usePaymentsEnabled` calls `.some(c => c.active)` | errorHandling (throws) | `PaymentsConfigurationPage.tsx:67-72, 113, 126`; `usePaymentsEnabled.tsx:13-21` |
| C2 | `initializePaymentConfig` (16-28) | POST `/payments/{orgId}/config?provider={provider}` | `{provider, enabled: true}` (`PaymentsConfigurationPage.tsx:167`) | any JSON (ignored) | errorHandling | `PaymentsConfigurationPage.tsx:166-169` |
| C3 | `deletePaymentConfig` (30-37) | DELETE `/payments/{orgId}/config?id={id}` | none | 2xx. On 409 the UI expects `detail = {code: 'ACTIVE_SUBSCRIPTIONS_EXIST', count: number}` (object or JSON string; it tries `JSON.parse`) | errorHandling | `PaymentsConfigurationPage.tsx:180-197` |
| C4 | `getOrgCustomers` (39-46) | GET `/payments/{orgId}/customers` | none | **Array** of `{enrollment_id, status, creation_date, user:{user_uuid, avatar_image, first_name, last_name, username, email}, offer:{name, offer_type, amount, currency}, stripe?:{payment_method:{brand,last4}, last_charge_date, last_charge_amount, next_billing_date, cancel_at_period_end, stripe_customer_url}}` | errorHandling | `PaymentsCustomersPage.tsx:192-289` |
| C5 | `getUserEnrollments` (48-55) | GET `/payments/{orgId}/enrollments/mine` | | duplicate, **unused** (the one in `offers.ts` is used) | errorHandling | none |
| C6 | `getStripeOverview` (57-64) | GET `/payments/{orgId}/stripe/overview` | none | `{mrr, arr, total_revenue, active_subscribers, total_customers, churn_30d, recent_charges: Charge[]}`. `recent_charges` must always be present: `d.recent_charges.length` crashes otherwise (`PaymentsCustomersPage.tsx:158`) | errorHandling | `OverviewTab` (128-187) |
| C7 | `getStripeCharges` (66-75) | GET `/payments/{orgId}/stripe/charges?limit=25[&starting_after=cursor]` | none | `{data: Charge[], has_more: bool, next_cursor: string\|null}` | errorHandling | `TransactionsTab` (294-383) |
| C8 | `getStripeSubscriptions` (77-84) | GET `/payments/{orgId}/stripe/subscriptions?status={active\|trialing\|past_due\|canceled\|all}` | none | `{data: Sub[]}` | errorHandling | `SubscriptionsTab` (388-477) |

The `Charge` shape is read at `PaymentsCustomersPage.tsx:162-180, 339-366`:

```
{ id, created (date string; parsed with new Date()), amount (major units, inferred), currency, status, paid: bool,
  amount_refunded, description, receipt_url,
  customer: {id?, name?, email?} | null, card: {brand, last4} | null }
```

The `Sub` shape is read at lines 435-468:

```
{ id, status, created, current_period_start, current_period_end, cancel_at_period_end,
  customer:{name,email}, plan:{amount,currency,interval,nickname}, card:{brand,last4} }
```

`fmtDate(iso)` uses `new Date(iso)`, so return ISO strings, not epoch seconds.

### 1.2 Offers, checkout, portal, enrollments (`offers.ts`)

| # | Function (line) | Method + path | Request | Response | Wrapper | Used by |
|---|---|---|---|---|---|---|
| O1 | `getOffers` (5-11) | GET `/payments/{orgId}/offers` | none | **Array** of AdminOffer (below). The page does `offers.data.map` (`PaymentsOffersPage.tsx:119, 225`), so it must be an array | metadata | `PaymentsOffersPage.tsx:48-53` |
| O2 | `createOffer` (13-19) | POST `/payments/{orgId}/offers` | `{name, description, offer_type:'one_time'\|'subscription', price_type:'fixed_price'\|'customer_choice', billing_interval:'month'\|'year', benefits:string, amount:number(>=1), currency:ISO4217, payments_group_id?:number, resource_uuids:string[] ('course_<uuid>')}` (`CreateOfferForm.tsx:35-46, 94-100`) | anything 2xx. On error `res.data.detail` is toasted | metadata | `CreateOfferForm.tsx` |
| O3 | `updateOffer` (21-27) | PUT `/payments/{orgId}/offers/{offerId}` (numeric `offer.id`) | `{name, description, amount, benefits, currency, offer_type, price_type, billing_interval}` (`PaymentsOffersPage.tsx:268-277`). It does **not** send `payments_group_id` or `resource_uuids`, so the PUT must be a partial update | 2xx; `res.data.detail` on error | metadata | `EditOfferForm` |
| O4 | `archiveOffer` (29-35) | DELETE `/payments/{orgId}/offers/{offerId}` | none | **must be exactly HTTP 200**: the UI checks `res.status === 200` (`PaymentsOffersPage.tsx:58`). 204 is shown as a failure | metadata | `PaymentsOffersPage.tsx:55-63` |
| O5 | `getOfferDetails` (37-43) | GET `/payments/{orgId}/offers/{offerId}` | | **unused** | metadata | none |
| O6 | `getPublicOffer` (45-51) | GET `/payments/{orgId}/offers/{offerid}/public` (**public, no token**) | none | PublicOffer (below). The page requires `data.offer_uuid` (`store/offers/[offerid]/page.tsx:43`) | metadata | store offer page (SSR + metadata) |
| O7 | `getPublicOffers` (53-59) | GET `/payments/{orgId}/offers/public-listing` (**public**) | none | **Array** of PublicOffer | metadata | `store/page.tsx:64-70`; `LandingCustom.tsx:60-72`; `LandingBlockEditors.tsx:601-614` |
| O8 | `getOffersByResource` (61-67) | GET `/payments/{orgId}/offers/by-resource?resource_uuid=course_<uuid>` (**public**) | none | **Array** of ResourceOffer, which uses **different field names**: `offer_id`, `offer_name` (below) | metadata + `asArray` | `CoursesActions.tsx:80-87`; `CourseActionsMobile.tsx:154-160`; `PaidCourseActivityDisclaimer.tsx:19-26` |
| O9 | `getOfferCheckoutSession` (71-82) | POST `/payments/{orgId}/offers/{offerUuid}/checkout?redirect_uri={url}` | body `null` | `{checkout_url: string}`. The browser does `window.location.href = checkout_url` (`offer-detail.tsx:155-160`) | metadata | `offer-detail.tsx:141-171` |
| O10 | `getBillingPortalSession` (84-90) | POST `/payments/{orgId}/billing/portal?return_url={url}` | null | `{portal_url}` | metadata | `AccountPurchases.tsx:123-141` |
| O11 | `getUserEnrollments` (92-103) | GET `/payments/{orgId}/enrollments/mine` | none | **Array** of MyEnrollment. A **403 is turned into `[]`** (line 100); any other error throws | metadata | `AccountPurchases.tsx:114-121`; `AccountMyCourses.tsx:21-26` (dead code, see 2.10) |

Shapes:

```ts
// AdminOffer (PaymentsOffersPage.tsx:119-218 + EditOfferForm 268-277)
{ id:number, name, description, offer_type, billing_interval, price_type, amount:number, currency,
  benefits:string /* comma separated */, payments_group_id:number|null }

// PublicOffer (store.tsx:24-37, offer-detail.tsx; landingSections.ts:182-192)
{ id:number, offer_uuid:string, name, description, offer_type, billing_interval?, price_type,
  amount, currency, benefits, payments_group_id:number|null,
  included_resources: Array<{ resource_uuid:'course_…', resource_type:'course'|'podcast'|'playground',
                              name, description, thumbnail_image, org_uuid }> }
// thumbnail URL = content/orgs/{org_uuid}/courses/{resource_uuid}/thumbnails/{thumbnail_image}
// (media.ts:121-128; resource_uuid keeps its 'course_' prefix)

// ResourceOffer (OfferCard.tsx:11-23; CourseActionsMobile.tsx:267-318)
{ offer_id:number, offer_uuid:string, offer_name:string, description?, offer_type, price_type?,
  billing_interval?, amount:number, currency:string, benefits? }

// MyEnrollment (AccountPurchases.tsx:24-105)
{ enrollment_id, offer_id, offer_name, offer_type, billing_interval, amount, currency,
  status /* 'active' shows a green "Active" badge, anything else is shown raw */, creation_date }
```

**`{offerid}` can be a numeric id or a uuid.** The desktop `OfferCard` links `/store/offers/{offer_uuid}` (`OfferCard.tsx:97`). The mobile actions link `/store/offers/{offer_id}` (`CourseActionsMobile.tsx:272`), and so does AccountPurchases (`AccountPurchases.tsx:85`). The store page passes that same segment to O6 and, as `offerUuid`, to O9 (`page.tsx:39`, `offer-detail.tsx:156`). **O6 and O9 must therefore accept either form**: digits mean `id`, anything else means `offer_uuid`. Alternatively, fix the two frontend links.

### 1.3 Payment groups and resources (`groups.ts`)

All of these use the `getResponseMetadata` wrapper.

| # | Function (line) | Method + path | Request | Response |
|---|---|---|---|---|
| G1 | `getPaymentsGroups` (9-15) | GET `/payments/{orgId}/groups` | | Array `{id:number, name, description}` (`PaymentsGroupsPage.tsx:417`, `CreateOfferForm.tsx:71, 328-335`) |
| G2 | `createPaymentsGroup` (17-23) | POST `/payments/{orgId}/groups` | `{name, description}` | 2xx; `data.detail` on error |
| G3 | `updatePaymentsGroup` (25-31) | PUT `/payments/{orgId}/groups/{groupId}` | `{name, description}` | 2xx |
| G4 | `deletePaymentsGroup` (33-39) | DELETE `/payments/{orgId}/groups/{groupId}` | | 2xx. UI copy: "All resources and syncs will be removed. Active offers linked to this group will lose their group." (`PaymentsGroupsPage.tsx:282`), so set `payments_group_id = NULL` on those offers |
| G5 | `getGroupResources` (45-51) | GET `/payments/{orgId}/groups/{groupId}/resources` | | **Array of strings** `['course_…']` (`PaymentsGroupsPage.tsx:59`) |
| G6 | `addGroupResource` (53-59) | POST `.../groups/{groupId}/resources?resource_uuid=` | | 2xx |
| G7 | `removeGroupResource` (61-67) | DELETE `.../groups/{groupId}/resources?resource_uuid=` | | 2xx |
| G8 | `getGroupSyncs` (73-79) | GET `.../groups/{groupId}/sync` | | Array `{usergroup_id:number, usergroup_name?:string}` (`PaymentsGroupsPage.tsx:185-213`) |
| G9 | `addGroupSync` (81-87) | POST `.../groups/{groupId}/sync?usergroup_id=` | | 2xx |
| G10 | `removeGroupSync` (89-95) | DELETE `.../groups/{groupId}/sync?usergroup_id=` | | 2xx |
| R1 | `getOfferResources` (101-107) | GET `/payments/{orgId}/offers/{offerId}/resources` (numeric id) | | **Array of strings** (`OfferResourcesPanel.tsx:55`) |
| R2 | `addOfferResource` (109-115) | POST `.../offers/{offerId}/resources?resource_uuid=` | | 2xx |
| R3 | `removeOfferResource` (117-123) | DELETE `.../offers/{offerId}/resources?resource_uuid=` | | 2xx |

Group sync semantics, as stated in the UI: "When a user enrolls, they're automatically added to these groups. When cancelled, they're removed." (`PaymentsGroupsPage.tsx:203-205`).

### 1.4 Stripe-only calls (`providers/stripe.ts`)

| # | Function (line) | Method + path | Response | Used |
|---|---|---|---|---|
| S1 | `getStripeOnboardingLink` (12-23) | POST `/payments/{orgId}/stripe/connect/link?redirect_uri=` | `{connect_url}` | `PaymentsConfigurationPage.tsx:51-54` |
| S2 | `verifyStripeConnection` (33-45) | GET `/payments/stripe/oauth/callback?code&state&org_id` (no org in the path) | metadata; `data.detail` on error | `app/payments/stripe/connect/oauth/page.tsx:57` |
| S3-S5 | `getStripeExpressOnboardingLink` / `refresh…` / `getStripeExpressDashboardLink` (51-93) | POST `.../stripe/express/connect/link`, POST `.../refresh`, GET `.../stripe/express/dashboard` | | **unused** |

The Stripe OAuth callback page lives at `apps/web/app/payments/stripe/connect/oauth/page.tsx`. The proxy serves it on every host (`apps/web/proxy.ts:235, 453-455`). On success it posts `{type:'payment_provider_connected'}` to `window.opener` (`page.tsx:68-70`). `PaymentsConfigurationPage.tsx:74-90` listens for that message to invalidate the configs query.

### 1.5 Query keys

`apps/web/lib/query/keys.ts:109-114` defines `payments.configs/offers/customers/groups(orgId)`. There are also ad-hoc keys: `['offers','by-resource',orgId,uuid]`, `['payments',orgId,'enrollments','mine']`, `['stripe','overview'|'charges'|'subscriptions',…]`, `['offers',offerId,'resources',orgId]`, `['payments',orgId,'groups',id,'resources'|'sync']`.

---

## 2. UI flows end to end

### 2.1 Dashboard shell: `apps/web/app/orgs/[orgslug]/dash/payments/[subpage]/page.tsx`

- **Gate 1 (lines 63-78):** `if (isOSSMode()) return <FeatureGate feature="payments"><></></FeatureGate>`. In OSS this always renders the gate card, or nothing at all once the feature resolves as enabled. **This block must be deleted.**
- Tabs: overview, offers, groups, configuration (80-109). `overview` and `customers` both render `PaymentsCustomersPage` (167).
- The "Preview Shop" link appears if `resolved_features.payments.enabled ?? features.payments.enabled !== false` (61, 131-141).
- A hardcoded "Stripe Dashboard" link points to `https://dashboard.stripe.com` (142-151).
- Gate 2 is `<FeatureGate feature="payments">` (113), which resolves through `useResolvedFeature` (see section 3).

### 2.2 Configuration: `PaymentsConfigurationPage.tsx`

- The provider registry is `PAYMENT_PROVIDERS` (33-56). It holds only Stripe: `{id:'stripe', callbackPath:'/payments/stripe/connect/oauth', getConnectUrl → S1.connect_url}`.
- A card is "Connected" when `config.provider_specific_id && config.active` (157). The card shows `provider_specific_id` as monospace text (229-233). States are Not configured, Authorization required, and Connected.
- Connect (159-178): if no config exists, C2 is called with `{provider, enabled:true}`. Then `redirectUri = getMainDomainUri(callbackPath)` is computed, `getConnectUrl` is called, and `window.open(url,'_blank')` runs. The OAuth popup page finalizes through S2.
- Remove or "Start over" (180-197, 310-333) calls C3. A 409 `ACTIVE_SUBSCRIPTIONS_EXIST` shows the count.
- **What the screen expects:** an OAuth-style "connect in a popup" provider whose result is an account id. PayPal does not fit this (Connect-with-PayPal onboarding needs PayPal Partner status), so the screen needs a credentials form (see 6.4).

### 2.3 Offers CRUD: `PaymentsOffersPage.tsx` + `SubComponents/CreateOfferForm.tsx` + `OfferResourcesPanel.tsx`

- The page is gated by `usePaymentsEnabled()`; if no active config exists it shows `UnconfiguredPaymentsDisclaimer` (69-71).
- The list (O1) renders badges for one-time and subscription (with billing interval), name, description, benefits, "Payment Group #id", "Manage Resources", and a price formatted with `Intl.NumberFormat('en-US', {currency})`.
- **CreateOfferForm** fields and validation (24-46):

  | Field | Rule |
  |---|---|
  | `name` | required |
  | `description` | required |
  | `amount` | `>= 1` |
  | `currency` | full ISO list from `currency-codes`, default USD |
  | `offer_type` | `one_time` \| `subscription` |
  | `price_type` | `fixed_price` \| `customer_choice`; forced to fixed for subscriptions |
  | `billing_interval` | `month` \| `year` (`lib/payments/billingInterval.ts:5-11`) |
  | `benefits` | comma-separated string |
  | `payments_group_id` | optional |
  | `resource_uuids` | list of `course_<uuid>` |

  Courses come from `getOrgCourses(slug, null, token, true)`, normalized as `course_${c.course_uuid.replace('course_','')}`.
- **EditOfferForm** (246-428) edits the same scalar fields. It does not edit group or resources.
- **OfferResourcesPanel** (R1-R3) lists `string[]` uuids and lets you link a course. It catches exceptions, but `getResponseMetadata` never throws, so success toasts appear even when the call fails (frontend bug; check `res.success`). The same pattern is in `PaymentsGroupsPage` handleAdd/handleRemove (75-86, 189-199).

### 2.4 Payment groups: `PaymentsGroupsPage.tsx`

CRUD covers groups (G1-G4), courses in a group (G5-G7) and "Access Groups", meaning UserGroup sync (G8-G10, which uses `getUserGroups` from `@services/usergroups/usergroups`). An offer links to a group through `payments_group_id`. "All resources in the selected Payment Group will be accessible to enrolled users" (`CreateOfferForm.tsx:338-341`).

### 2.5 Customers and overview: `PaymentsCustomersPage.tsx`

Four tabs: Overview (C6), Customers (C4), Transactions (C7, cursor pagination via `next_cursor`/`has_more`), Subscriptions (C8, status filter). The error state is labelled "Could not reach Stripe" (486-493). Every one of these screens is Stripe-shaped: card brand, last4, `stripe_customer_url`.

### 2.6 Public store

- `apps/web/app/orgs/[orgslug]/(withmenu)/store/page.tsx`: server-side, `paymentsEnabled = resolved_features.payments.enabled ?? features.payments.enabled !== false` (48). If it is false the page shows "Store not available" (50-62). Otherwise it calls O7 and renders `store.tsx`.
- `store.tsx`: each card links to `/store/offers/{offer_uuid}` (108) and shows up to three resource thumbnails, the price via `formatCurrency`, "min." for customer_choice, and the interval label.
- `store/offers/[offerid]/page.tsx`: SSR calls O6 with `offerid`, and passes `access_token` from `getServerSession()` to the client.
- `offer-detail.tsx` checkout (141-171):
  1. With no token, it redirects to `/login?redirect=/store/offers/{offerUuid}` (142-146). Checkout requires login; there is no guest checkout.
  2. Otherwise `redirectUri = window.location.href`, the offer page itself (155). It calls O9 and sets `window.location.href = data.checkout_url` (156-160).
  3. **There is no success/cancel parameter and no dedicated return page.** Only one `redirect_uri` is sent, so the EE backend presumably used it for both success and cancel (inferred). The offer page does not read any query string on return. The only `?checkout=success&session_id` handling in the web app is SaaS plan billing (`app/(hub)/billing/page.tsx:166-235`), which is unrelated.
  4. `customer_choice`: no amount is ever sent, so the backend can only charge `offer.amount`.
  5. Hardcoded copy: "Secure checkout via Stripe" (303), "Instant access after payment" (305).

### 2.7 OfferCard and course actions

- `CoursesActions.tsx`: calls O8 for `course_<uuid>` (80-87). `isStarted` means a TrailRun exists in `trailData.runs` for this course (73-78).
  - Offers exist and the user has started: the "You own this course" panel and a Leave button (414-444).
  - Offers exist and the user has not started: **only OfferCards, no Start button** (446-459).
  - No offers: the normal Start/Leave button. Start calls `startCourse`, which posts to the trail; the backend is `add_course_to_trail` (`apps/api/src/services/trail/trail.py:471-560`), which does **no** payment check.
- `CourseActionsMobile.tsx:267-330`: same logic, using the first offer, but links to `/store/offers/{offer_id}` (272).
- `OfferCard.tsx`: uses `offer_name`, `offer_uuid` and the other ResourceOffer fields, and links to `/store/offers/{offer_uuid}` (97).
- **Consequence:** fulfillment must create the Trail and TrailRun, as the admin `enroll_user` does (`apps/api/src/services/admin/admin.py:452-523`). Otherwise a paying user still sees the offer cards. The alternative is to change CoursesActions to also check MyEnrollment.

### 2.8 Paywalled activity: `PaidCourseActivityDisclaimer.tsx`

`app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/activity/[activityid]/activity.tsx` renders the disclaimer when the activity read returns **`content.paid_access == false`** (lines 186, 309, 705-706, 1003-1004). The disclaimer fetches O8 and shows OfferCards plus the i18n keys `payments.paid_content` and `payments.paid_content_description`. Mark-complete and the content body are hidden when `paid_access === false`.

### 2.9 AccountPurchases: `components/Objects/Account/subpages/AccountPurchases.tsx`

Rendered from `AccountClient.tsx:60-61`. It is not feature-gated in `AccountSidebar.tsx:15-20`. It lists MyEnrollment (O11), links "View offer" to `/store/offers/{offer_id}` (85), and shows "Manage subscription" plus a global "Invoices & receipts → Open portal" (O10, `portal_url`). In OSS today O11 returns 404, which is not 403, so the page shows "Could not load purchases".

### 2.10 AccountMyCourses

`AccountMyCourses.tsx` is **not imported anywhere** (grep shows no usage). It expects enrollments/mine to return course objects (`course_uuid` passed to `CourseThumbnail`), which contradicts AccountPurchases. Ignore it, or delete it.

### 2.11 Other surfaces

- Org nav "store" item: `OrgMenuLinks.tsx:18, 29-30, 57`, gated on `resolved_features.payments.enabled === true`.
- Org menu editor: `OrgEditMenu.tsx:32`.
- Dashboard left menu: `DashLeftMenu.tsx:227-235, 605-613`.
- Mobile menu: `DashMobileMenu.tsx:71, 228`.
- Landing pricing blocks link `offer_uuid` to store offers (`LandingBlockEditors.tsx:601-623`, `landingSections.ts:182-239`).

---

## 3. How "payments enabled" is decided, and the minimal OSS unlock

### 3.1 Frontend (three independent signals)

1. **Deployment mode cookie.** `LH_mode` is set by `apps/web/proxy.ts:176` from `GET /api/v1/instance/info` → `mode` (`apps/api/src/routers/instance.py:25-30`).
   - `getDeploymentMode()` / `isOSSMode()` are in `apps/web/services/config/config.ts:409-424`.
   - `usePlan()` returns `'oss'` in OSS mode (`components/Hooks/usePlan.ts:13-21`).
   - `services/plans/plans.ts:26` has `OSS_BLOCKED_FEATURES = {'sso','audit_logs','payments','analytics_advanced','scorm'}`. `isFeatureAvailable()` (51-58) returns false for payments in OSS. It is only a fallback when `resolved_features` lacks the key (`OrgMenu.tsx:94-98`, `CommandPalette.tsx:60-66`).
   - The hard block is the dash page Gate 1 (`dash/payments/[subpage]/page.tsx:71-78`).
2. **`org.config.config.resolved_features.payments`** (`{enabled, available, limit, required_plan}`). It is injected by `_build_org_read_with_resolved` (`apps/api/src/services/orgs/orgs.py:65-85`).
   - It is consumed by `FeatureGate` → `useResolvedFeature` (`components/Hooks/useResolvedFeature.tsx:38-54`) → `resolveGateReason` (`lib/features/gateReason.ts:52-78`).
   - In that chain, the reason is `'plan'` if `!planMeetsRequirement(currentPlan, required_plan)`, and `'disabled'` if `enabled === false`.
   - With plan `'oss'`, `planMeetsRequirement` passes everything except `'enterprise'` (`plans.ts:36`). Payments requires `'standard'` (`featureMetadata.ts:122-127`, API `plans.py:26`), so it passes.
   - The same object drives the store page, menus and the dash "Preview Shop".
3. **Provider configured.** `usePaymentsEnabled()` (`components/Hooks/usePaymentsEnabled.tsx:8-28`) returns `isEnabled = configs.some(c => c.active)`. This gates the Offers, Groups and Customers tabs with `UnconfiguredPaymentsDisclaimer`.

### 3.2 API: every place payments is gated

| Location | What it does | Change for OSS |
|---|---|---|
| `src/core/deployment_mode.py:25-27` `EE_ONLY_FEATURES = {'sso','audit_logs','payments','analytics_advanced','scorm'}` | Source for resolve/plan_check | **Remove `'payments'`** |
| `src/security/features_utils/resolve.py:150-153` | OSS + EE_ONLY → `{"enabled": False, "available": False}`; otherwise `enabled = not admin_disabled` | Automatic once removed |
| `src/security/features_utils/plan_check.py:29-39` `_check_mode_bypass` | OSS + EE_ONLY → 403 "not available in OSS mode" | Automatic |
| `src/security/features_utils/plans.py:26` `FEATURE_PLAN_REQUIREMENTS["payments"]="standard"`; per-plan `payments.enabled` 63/91/119 False, 147/175/203 True; `plan_meets_requirement` OSS → `required != 'enterprise'` (338-347); `is_feature_enabled_for_plan` OSS allows payments (276-285) | Only matters in SaaS | None |
| `src/security/features_utils/dependencies.py:20-30` `FeatureName` includes `"payments"`; `_check_feature_enabled` (93-127) returns 403 when resolved disabled | Use it in our router (`await _check_feature_enabled("payments", org_id, db)`) | Reuse |
| `src/security/features_utils/usage.py:35, 44-45` | payments is a Redis-tracked feature; non-SaaS is unlimited | None |
| `src/db/organization_config.py:44-45` `PaymentOrgConfig.enabled=False` (v1); `:179` `AdminToggles.payments = FeatureAdminToggle(disabled=False)` (v2) | New orgs are v2 (`orgs.py:351`), so once unblocked they are enabled by default. v1 orgs read `features.payments.enabled` (False) as `disabled=True` (`resolve.py:40-55`) | For v1 orgs call `PUT /api/v1/orgs/{id}/config/payments?payments_enabled=true` (`routers/orgs/orgs.py:520-543` → `services/orgs/orgs.py:1278-1296` → `_update_feature_toggle` 1220-1262) |
| `src/services/orgs/orgconfigs_migrations.py:26-29` | v1→v2 migration includes a payments toggle | None |
| `src/security/rbac/rbac.py:25-45` `_get_offer_for_usergroup` imports `ee.db.payments.payments_offers.PaymentsOffer` and filters `usergroup_id`; `check_usergroup_access` raises **402** `{code:'PAYMENT_REQUIRED', offer_id, offer_name, amount, currency}` (98-118) | In OSS the ImportError is swallowed, so no 402 | Point the import at our model |
| `src/security/rbac/rbac.py:512-519` `from ee.services.payments.payments_access import check_enrollment_access(element_uuid, user_id, db)` | Buyers get read access regardless of usergroup | Point at our function |
| `src/security/rbac/rbac.py:557, 583`; `src/services/api_tokens/api_tokens.py:649, 677` | `payments` is an API-token rights bucket, capped by the `organizations` role bucket | Optional: allow API tokens on admin endpoints |
| `src/router.py:393` `register_ee_routers(v1_router)` | EE registers `/payments` here (inferred prefix from frontend URLs) | **Mount our router** here with prefix `/payments` |
| `src/security/csrf.py:206-243` | Exempts the `stripe-signature` header. Requests without auth cookies pass anyway (262-263) | PayPal and SPIDI webhooks (no cookies) pass. No change needed |

### 3.3 Minimal change list (OSS unlock)

**API**
1. `src/core/deployment_mode.py:25-27`: drop `'payments'` from `EE_ONLY_FEATURES`.
2. `src/core/ee_hooks.py:80-89`: when no EE hook is present, call our `src.services.payments.access.check_activity_paid_access` instead of `return True`.
3. `src/security/rbac/rbac.py:31` and `:516`: import our model and function instead (`src.db.payments.payments_offers.PaymentsOffer`, `src.services.payments.access.check_enrollment_access`).
4. `src/router.py` (next to line 393): `v1_router.include_router(payments_router, prefix="/payments", tags=["payments"])`, with no router-level auth because public endpoints exist.
5. Tests to update: `src/tests/services/test_demo_sync.py:329-345` iterates `EE_ONLY_FEATURES`. Any test asserting payments is unavailable in OSS also needs updating. The demo store stays skipped because `ee.db.payments` will not import (`sync.py:2155-2207`), which is fine.

**Web**
1. `apps/web/services/plans/plans.ts:26`: drop `'payments'` from `OSS_BLOCKED_FEATURES`.
2. `app/orgs/[orgslug]/dash/payments/[subpage]/page.tsx:63-78`: delete Gate 1 and the OSS `useTrackView`.

Do **not** try `LEARNHOUSE_FORCE_EE`. It requires an `ee/hooks.py` folder and development mode (`deployment_mode.py:44-71`, `ee_hooks.py:7-19`).

---

## 4. Paid-access enforcement

### 4.1 The single hook

`src/core/ee_hooks.py:80-89`:

```python
async def check_ee_activity_paid_access(request, activity_id, user, db_session) -> bool:
    hooks = get_ee_hooks()
    if hooks and hasattr(hooks, "check_activity_paid_access"):
        return await hooks.check_activity_paid_access(request, activity_id, user, db_session)
    return True   # OSS: free
```

### 4.2 Call sites

1. **`src/services/courses/activities/access.py`**
   - `_reader_state` (124-155) calls the hook at line 141. Unpublished activity: editors get "ok", others "draft". Then paid + not locked is "ok". Course editors (`can_edit_course`, 38-43) bypass and get their content restored (149-152). `not paid` gives **"unpaid"**.
   - `verify_activity_reader_access` (158-189) raises **402** "This activity requires a purchase" (186-187). It is used by:
     - `routers/stream.py:142` (video streaming)
     - `services/blocks/block_types/{audio,image,pdf,video}Block/*.py` (140-149)
     - `routers/content_files.py:276`, `routers/local_content.py:181` (via `_by_uuid`)
     - `routers/code_execution.py:243, 293`, `routers/code_submissions.py:70, 152`
     - `services/courses/activities/assignments.py:178, 1872, 2382, 4367`
     - `services/trail/trail.py:264` (`add_activity_to_trail`, i.e. mark complete)
   - `redact_activity_for_reader` (220-242) replaces the content with **`{"paid_access": False}`** and sets `details=None` (239-241). It is used by `services/courses/activities/activities.py:142` (`get_activity`), `:202` (`get_editor_bootstrap`), `:256` (`get_activityby_id`), and `:457` (`get_activities`).
2. **`src/services/courses/chapters.py:460-471`** (`_apply_locks_to_chapters`, called at 151 and 429): it checks only the **first activity** of the tree, because "paid access is per course; the EE check resolves any activity to its course and lets authors through". Every activity in the tree then gets `content = {"paid_access": False}`. Org admins bypass earlier (455-457). Note that **`request` may be `None` here** (signature at 433-439; the tests call it without `request` at `test_chapters_service.py:750, 808`).
3. **`src/services/ai/rag/access.py:242`**: the course chatbot does not leak paid content.
4. **RBAC** (not the hook): `rbac.py:98-118` (402 via usergroup→offer) and `:512-519` (enrollment grants read).

### 4.3 What a non-buyer sees on a "paid" course in OSS today

- The hook returns True, so the activity read, chapter tree, streams and files are all served in full.
- `/payments/*` returns 404, so O8 → `asArray` → `[]`. No OfferCards appear and the normal Start Course button works (`CoursesActions.tsx:462-499`). The store says "Store not available" because `resolved_features.payments.enabled` is false in OSS (`resolve.py:150-152`). AccountPurchases shows an error.
- `rbac.py` has no EE module, so no 402, and enrollment access is False.
- The **only** gating available in OSS without our code is manual: make the course private, attach a UserGroup, or set chapter/activity `lock_type='restricted'` (`access.py:46-121`, `services/courses/locks.py`), and add buyers to the group by hand.

### 4.4 Where our implementation plugs in (precise contract)

```python
# src/services/payments/access.py  (ours)
async def check_activity_paid_access(request: Request | None, activity_id: int, user, db_session) -> bool:
    # 1. activity -> course (Activity.course_id -> Course.course_uuid)
    # 2. offers covering course_uuid:
    #      PaymentsOfferResource.resource_uuid == course_uuid  -> offer_id
    #    ∪ PaymentsGroupResource.resource_uuid == course_uuid -> PaymentsOffer.payments_group_id
    #    (non-archived offers decide whether the course is "paid"; inferred policy)
    # 3. no offers -> True (free course)
    # 4. AnonymousUser -> False
    # 5. org admin/maintainer or ResourceAuthor of the course -> True ("lets authors through", chapters.py:462-463)
    # 6. PaymentsEnrollment(user_id, offer_id in covering offers [incl. archived], status in ('active','completed')) -> True
    # 7. else False
    # Cache on request.state[(course_id, user_id)] when request is not None (called once per activity/media).

async def check_enrollment_access(element_uuid: str, user_id: int, db_session) -> bool:  # used by rbac.py:516
    # same as steps 2+6, for element_uuid (course_…)
```

Access statuses `active` and `completed` come from the migration script, which adds ACTIVE and COMPLETED users to the access group (`payments_to_offers_migration.py:143-160`). The demo uses `active` and `completed` for one-time purchases, plus `cancelled`, `refunded` and `pending` (`demo/bundle/store.json`).

**eBooks** get the same protection when delivered as a course with a PDF/document activity, because `pdfBlock.py:140` and `content_files.py:276` already call `verify_activity_reader_access` and return 402.

---

## 5. What the tests and other code reveal about the EE contract

### 5.1 `src/tests/security/test_remediation_stripe_idempotency.py`

- Module `ee.services.payments.payments_stripe.StripePaymentProvider` (15-17).
- `handle_webhook(request, db_session=..., webhook_type="standard")` (52-54). It reads `request.body()` and the `stripe-signature` header. `_get_credentials()` returns `{stripe_secret_key, stripe_webhook_standard_secret, stripe_webhook_connect_secret}` (39-44).
- Idempotency is a **Redis SETNX** on `event.id` through `src.security.features_utils.usage._get_redis_client`. A replay returns `{"status":"success","message":"...already..."}`. A Redis outage gives **503 with "retry"** (fail closed) (57-95). The response shape is `{"status": "success"|"ignored", "message"}`.
- Provider classes have a common interface: `handle_webhook`, `_get_credentials` (inferred: a provider registry with one class per provider).

### 5.2 EE models

Reconstructed from OSS code; no EE code was copied.

| EE model (module) | Fields observed | Source |
|---|---|---|
| `PaymentProviderEnum` (`ee.db.payments.payments`) | `STRIPE='stripe'`, `CUSTOM='custom'` ("org drives its own enrolments, takes no money") | `test_demo_drift.py:507, 555, 571`; `sync.py:2186-2196` |
| `PaymentsConfig` (`ee.db.payments.payments`), table `paymentsconfig` | `id, org_id(FK organization CASCADE), enabled, active, provider, provider_specific_id, provider_config JSON, mode ENUM('standard','express') default 'standard', creation_date, update_date` (datetime) | `migrations/versions/0314ec7791e1_payments.py:24-36`; `r7s8t9u0v1w2_add_payments_mode.py`; `c1d2e3f4a5b6_rename_paymentsmode_enum.py`; `sync.py:2283-2304` |
| `PaymentsOffer` (`ee.db.payments.payments_offers`), table `paymentsoffer` | `id, offer_uuid (str(uuid4()), no prefix), org_id, payments_config_id, usergroup_id (legacy), payments_group_id, name, description, offer_type (OfferTypeEnum), price_type (OfferPriceTypeEnum), benefits, amount (float), currency, billing_interval (str, default 'month'), provider_product_id, is_publicly_listed, external_checkout_url (nullable), creation_date, update_date` | `payments_to_offers_migration.py:77-92`; `sync.py:2370-2400`; `e8f9a0b1c2d3_add_billing_interval_to_paymentsoffer.py`; `rbac.py:31-41`; `test_rbac_runtime.py:45-50` |
| `OfferTypeEnum` / `OfferPriceTypeEnum` | values `one_time`/`subscription`, `fixed_price`/`customer_choice` (`ONE_TIME`, `SUBSCRIPTION`, `FIXED_PRICE`, `CUSTOMER_CHOICE`) | migration 67-76; `bundle_loader.py:276-282` |
| `PaymentsOfferResource` (**in** `ee.db.payments.payments_groups`) | `id, offer_id, resource_uuid, org_id, creation_date, update_date` | `sync.py:2249-2254, 2414-2443` |
| `PaymentsGroup` | `id, org_id, name, description, creation_date, update_date`. **No uuid column** | `sync.py:2311-2332, 3008-3011` |
| `PaymentsGroupResource` | `id, payments_group_id, resource_uuid, org_id, dates` | `sync.py:2343-2370` |
| Group-to-UserGroup sync | `usergroup_id`, `usergroup_name` in the response; model name unknown (inferred `PaymentsGroupSync`) | `PaymentsGroupsPage.tsx:185-213` |
| `PaymentsEnrollment` (`ee.db.payments.payments_enrollments`) | `id, enrollment_uuid, offer_id, user_id, org_id, status (EnrollmentStatusEnum), provider_specific_data JSON, creation_date, update_date` | migration 132-140; `sync.py:2479-2505`; `test_demo_drift.py:508-513` |
| `EnrollmentStatusEnum` | `pending, completed, active, cancelled, failed, refunded` (mirrors legacy `PaymentStatusEnum`) | `0314ec7791e1_payments.py:68`; migration 42-43; `PaymentsCustomersPage.tsx:71-82` |
| `ee.services.payments.payments_access.check_enrollment_access(element_uuid, user_id, db)` | bool | `rbac.py:516` |
| Legacy (dropped) | `paymentsproduct`, `paymentscourse`, `paymentsuser` | `0314ec7791e1`; dropped in `q6r7s8t9u0v1_offer_uuid.py` (despite its file name) |

These models use real datetimes, not the string dates core tables use (`sync.py:2276-2281`). Tables are created by `create_all`, not by migrations (`sync.py:2215-2221`).

### 5.3 Other tests and code

- `test_rbac_runtime.py:162-183`: `_get_offer_for_usergroup` returns `{"offer_id","offer_name","amount","currency"}`, and `None` on exception.
- `test_api_token_access.py:338-340`: "/payments router allows API tokens (EE)".
- `test_api_token_bucket_caps.py:12, 30-37`: a `payments` rights bucket exists; a reader cannot mint payment writes.
- `test_orgs_service_wave3.py:874-918, 1062-1085`: `update_org_payments_config` writes `features.payments.enabled` (v1) or `admin_toggles.payments.disabled` (v2).
- `test_orgs_router.py:79, 366`: PUT `/api/v1/orgs/1/config/payments?payments_enabled=true`.
- `test_demo_sync.py:293-345`: `overrides.payments.force_enabled` follows `_store_unsupported_reason()`; EE_ONLY features are unavailable in OSS.
- `test_csrf.py:191-194`: Stripe webhook CSRF exemption.
- `src/db/demo_entities.py:37-39`: `PAYMENTS_GROUP`, `PAYMENTS_OFFER`, `PAYMENTS_ENROLLMENT` demo kinds.
- `src/services/demo/sync.py:2391-2395`: comment that `external_checkout_url` "is a phishing page" risk because "the storefront sends buyers there". **Validate redirect targets.**
- `src/services/webhooks/events.py`: **no purchase or enrollment events exist**. There is only `org_payments_config_changed` (417-423), plus `course_enrolled` (46-53, which `add_course_to_trail` dispatches). We can add `offer_purchased` / `enrollment_status_changed` to `WEBHOOK_EVENTS` (validated by `validate_event_data`, 437+).
- `apps/web/app/api/billing/webhook/route.ts`: **LearnHouse SaaS plan billing** (STRIPE_WEBHOOK_SECRET, packs, plans). It is unrelated to org offers. Its in-flight/done idempotency map (35-57) is a good pattern.

---

## 6. Proposed OSS implementation

### 6.1 Placement

- Models: `apps/api/src/db/payments/{payments.py, payments_offers.py, payments_groups.py, payments_enrollments.py, payments_orders.py}`. They are auto-imported (`database.py:13-47`) and the tables are auto-created (`database.py:398`).
- Services: `apps/api/src/services/payments/{access.py, offers.py, groups.py, checkout.py, fulfillment.py, stats.py, providers/base.py, providers/paypal.py, providers/spidi.py (later)}`.
- Router: `apps/api/src/routers/payments.py`, mounted at `/payments` (see 3.3).
- Secrets: reuse `src/services/webhooks/crypto.py` `encrypt_secret` / `decrypt_secret` (Fernet derived from the JWT secret).
- HTTP client: `httpx`, already used by `services/webhooks/dispatch.py`.

**Table names.** Keep the EE-compatible names: `paymentsconfig`, `paymentsoffer`, `paymentsofferresource`, `paymentsgroup`, `paymentsgroupresource`, `paymentsenrollment`. The in-repo migrations already treat these as optional (`e8f9a0b1c2d3` checks `has_table`; `d3e4f5a6b7c8` skips missing tables). Store `provider`, `status` and the type fields as **VARCHAR**, not PG enums: `create_all` never alters enum types, and the old `paymentproviderenum` only has `'STRIPE'`. If Alembic is ever used on this DB, `alembic stamp` it first: `0314ec7791e1` blindly creates `paymentsconfig`, and the versions directory currently has several heads by my parse (c1d2e3f4a5b6, d3e4f5a6b7c8, e8f9a0b1c2d3, n4o5p6q7r8s9).

### 6.2 Tables (SQLModel)

```python
# provider: 'paypal' | 'spidi' | 'manual'      status/type fields: plain str
class PaymentsConfig(SQLModel, table=True):            # __tablename__ = "paymentsconfig"
    id: int | None = Field(default=None, primary_key=True)
    org_id: int = Field(sa_column=Column(BigInteger, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    provider: str                                       # unique (org_id, provider)
    enabled: bool = True
    active: bool = False                                # True after credentials validated
    provider_specific_id: str | None = None             # PayPal merchant/payer id or masked client_id (shown in UI)
    provider_config: dict = Field(default_factory=dict, sa_column=Column(JSON))
        # paypal: {client_id, client_secret_enc, environment:'sandbox'|'live', webhook_id, brand_name}
        # spidi (later): {agreement_id, ... encrypted creds}
    mode: str = "standard"
    creation_date: datetime; update_date: datetime

class PaymentsGroup(SQLModel, table=True):             # "paymentsgroup"
    id, org_id, name: str, description: str = "", creation_date, update_date

class PaymentsGroupResource(SQLModel, table=True):     # "paymentsgroupresource"
    id, payments_group_id (FK paymentsgroup CASCADE), resource_uuid: str (index), org_id, dates
    # UniqueConstraint(payments_group_id, resource_uuid)

class PaymentsGroupSync(SQLModel, table=True):         # "paymentsgroupsync" (our name)
    id, payments_group_id (FK CASCADE), usergroup_id (FK usergroup.id CASCADE), org_id, dates
    # UniqueConstraint(payments_group_id, usergroup_id)

class PaymentsOffer(SQLModel, table=True):             # "paymentsoffer"
    id, offer_uuid: str (unique, str(uuid4())), org_id (index)
    payments_config_id: int | None (FK paymentsconfig SET NULL)
    payments_group_id: int | None (FK paymentsgroup SET NULL)
    usergroup_id: int | None = None                    # legacy, keeps rbac.py:25-45 meaningful
    name, description: str, offer_type: str = 'one_time', price_type: str = 'fixed_price'
    billing_interval: str = 'month', benefits: str = ""
    amount: float (or Numeric(12,2)), currency: str = 'USD'
    provider_product_id: str = "", is_publicly_listed: bool = True
    external_checkout_url: str | None = None           # keep None; never trust
    archived: bool = False                             # ours: DELETE /offers/{id} sets this
    creation_date, update_date

class PaymentsOfferResource(SQLModel, table=True):     # "paymentsofferresource"
    id, offer_id (FK paymentsoffer CASCADE), resource_uuid (index), org_id, dates
    # UniqueConstraint(offer_id, resource_uuid)

class PaymentsEnrollment(SQLModel, table=True):        # "paymentsenrollment"
    id, enrollment_uuid: str (unique), offer_id (FK), user_id (FK user CASCADE), org_id
    status: str  # pending|active|completed|cancelled|failed|refunded
    provider_specific_data: dict = JSON {}
    creation_date, update_date
    # Index(user_id, org_id), Index(offer_id, status)

class PaymentsOrder(SQLModel, table=True):             # "paymentsorder" (ours; provider-agnostic transaction)
    id, order_uuid (unique), org_id, offer_id, user_id, enrollment_id
    provider: str, provider_order_id: str | None, provider_capture_id: str | None
    status: str  # created|approved|paid|accredited|failed|expired|cancelled|refunded
    amount: float, currency: str                       # offer price
    charged_amount: float | None, charged_currency: str | None, fx_rate: float | None  # SPIDI: VES at BCV rate
    redirect_uri: str, raw: dict JSON, paid_at: datetime | None, creation_date, update_date
    # UniqueConstraint(provider, provider_order_id)

class PaymentsWebhookEvent(SQLModel, table=True):      # "paymentswebhookevent" (idempotency, DB instead of Redis)
    id, provider, event_id, org_id, event_type, status: 'in_flight'|'done'|'failed', received_at, processed_at
    # UniqueConstraint(provider, event_id)
```

### 6.3 Routes (prefix `/api/v1/payments`), matched to the frontend

Auth levels:
- **A** = org admin. Reuse the logic of `require_org_admin` (`features_utils/dependencies.py:37-90`, superadmin bypass), with our own 403 message, plus `_check_feature_enabled("payments", org_id)`.
- **U** = authenticated user who is a member of the org.
- **P** = public (anonymous allowed; still require payments enabled and the org to exist).

| Route | Auth | Contract (see section 1 for shapes) |
|---|---|---|
| GET `/{org_id}/config` | A | `[PaymentsConfigRead]` = `{id, org_id, provider, enabled, active, provider_specific_id, mode, creation_date, update_date, settings:{environment, client_id_masked}}`. **Never return the secret.** |
| POST `/{org_id}/config?provider=` | A | body `{provider, enabled, client_id?, client_secret?, environment?}`. Creates the config (409 if one exists). If credentials are present, validate (PayPal `POST /v1/oauth2/token`) and set `active=True` and `provider_specific_id`. |
| PUT `/{org_id}/config/{config_id}` (new) | A | update credentials or environment; re-validate. |
| DELETE `/{org_id}/config?id=` | A | 200. 409 `{detail:{code:'ACTIVE_SUBSCRIPTIONS_EXIST', count}}` only if recurring enrollments exist. |
| GET/POST `/{org_id}/offers` | A | O1 array of AdminOffer (`archived=False`) / O2 create. Also creates `PaymentsOfferResource` rows for `resource_uuids`. Validate that the resources belong to the org, `amount >= 1`, and that the currency is supported by an active provider. |
| GET/PUT/DELETE `/{org_id}/offers/{offer_id}` | A | PUT is a partial update. DELETE sets `archived=True` and `is_publicly_listed=False` and **returns 200** `{"detail":"Offer archived"}`. |
| GET/POST/DELETE `/{org_id}/offers/{offer_id}/resources[?resource_uuid=]` | A | GET returns `string[]`. |
| GET `/{org_id}/offers/public-listing` | P | `[PublicOffer]` where `is_publicly_listed AND NOT archived`. `included_resources` = direct resources ∪ group resources, resolved to course `name, description, thumbnail_image, org_uuid`, `resource_type` derived from the prefix. Only published courses (inferred). |
| GET `/{org_id}/offers/{id_or_uuid}/public` | P | `PublicOffer`, 404 if archived. Accepts a numeric id or a uuid. |
| GET `/{org_id}/offers/by-resource?resource_uuid=` | P | `[ResourceOffer]` with `offer_id, offer_uuid, offer_name, …`, for non-archived offers covering the resource directly or through a group. |
| POST `/{org_id}/offers/{id_or_uuid}/checkout?redirect_uri=[&provider=&amount=]` | U | Validate that `redirect_uri`'s origin is in `hosting_config.allowed_origins` / `frontend_domain` / a verified `CustomDomain` (open-redirect guard, cf. `sync.py:2391-2395`). Reject if an active or completed enrollment exists for the offer. Create a `PaymentsEnrollment(pending)` and a `PaymentsOrder(created)`, then call `provider.create_checkout`. Returns `{checkout_url, provider, order_uuid}`. `amount` applies only to `customer_choice` and must be `>= offer.amount`. Return 400 if `offer_type=='subscription'` and the provider lacks recurring support. |
| GET `/paypal/return?order=<order_uuid>&token=<paypal_order_id>&PayerID=` (new) | none (browser redirect) | Match `order_uuid` to `provider_order_id == token`, capture with `PayPal-Request-Id: order_uuid` (idempotent), fulfill, then 302 to `redirect_uri?checkout=success\|failed`. Cancel URL = `redirect_uri?checkout=cancelled`. |
| POST `/{org_id}/orders/{order_uuid}/capture` (new, optional) | U | For the PayPal JS Buttons `onApprove`. Returns `{status, enrollment_id}`. |
| GET `/{org_id}/checkout/providers` (new) | P | `[{provider, environment, client_id (PayPal public client id), currencies, supports_subscriptions}]` for active configs; lets the frontend render buttons. |
| POST `/webhooks/paypal/{org_id}` (new) | none | Verify via PayPal `POST /v1/notifications/verify-webhook-signature` (headers `paypal-transmission-id/-time/-sig`, `paypal-cert-url`, `paypal-auth-algo` + stored `webhook_id`). Dedupe on `PaymentsWebhookEvent`. Handle `CHECKOUT.ORDER.APPROVED` (capture if not yet captured, covering a closed tab), `PAYMENT.CAPTURE.COMPLETED` (fulfill), `PAYMENT.CAPTURE.DENIED/REVERSED/REFUNDED` (status → failed/refunded, revoke). CSRF passes (`csrf.py:262-263`). |
| POST `/webhooks/spidi/{org_id}` (later) | none | Same pattern, with SPIDI signature verification. |
| GET `/{org_id}/customers` | A | C4 array. Enrollment join user and offer. Put provider details in a generic key (`payment:{provider, provider_order_id, last_charge_date, last_charge_amount}`) and `stripe: null`. |
| GET `/{org_id}/enrollments/mine` | U | O11 array (add `offer_uuid` for the frontend link fix). |
| GET/POST/PUT/DELETE `/{org_id}/groups[/{id}]`, `/groups/{id}/resources`, `/groups/{id}/sync` | A | G1-G10 exactly as in 1.3. DELETE group sets `payments_group_id = NULL` on offers. Sync GET returns `[{usergroup_id, usergroup_name}]`. |
| GET `/{org_id}/stripe/overview` → better `/{org_id}/overview` | A | Computed from `PaymentsOrder` and `PaymentsEnrollment`: `{mrr:0, arr:0, total_revenue, active_subscribers:0, total_customers, churn_30d:0, recent_charges:[Charge…]}`, Charge built from orders (`card: null`, `paid: status in (paid, accredited)`). Always return `recent_charges`. |
| GET `/{org_id}/stripe/charges` → `/{org_id}/transactions?limit&starting_after` | A | `{data, has_more, next_cursor}` cursor on `order.id`. |
| GET `/{org_id}/stripe/subscriptions` | A | `{data: []}` until recurring is supported, or hide the tab. |
| POST `/{org_id}/billing/portal` | U | PayPal and SPIDI have no customer portal. Return 404 `{detail:"No billing portal for this provider"}` and hide the buttons in the frontend. |

**Fulfillment** (`services/payments/fulfillment.py`, idempotent; called by return, capture and webhook):
1. Lock the order row (`SELECT … FOR UPDATE`). If it is already paid, return.
2. Set order to `paid` and the enrollment to `completed` (one-time) or `active` (subscription).
3. Add the user to every `PaymentsGroupSync.usergroup_id` of the offer's group (and to `offer.usergroup_id` if set) via `UserGroupUser`.
4. For every course resource, ensure the Trail and TrailRun exist. Copy the logic of `services/admin/admin.py:452-523`; do not raise if they already exist. This makes `CoursesActions` show "You own this course". Then dispatch `course_enrolled` the way `trail.py:532-555` does.
5. Optionally: receipt email via `src/services/email/utils.py:520 send_email`, and a new webhook event `offer_purchased`.

Refund and revocation do the reverse: enrollment `refunded`/`cancelled`, remove the group syncs, and keep or delete the TrailRun (policy decision).

**Provider interface** (`services/payments/providers/base.py`):

```python
class PaymentProvider(Protocol):
    id: str                          # 'paypal' | 'spidi'
    supports_subscriptions: bool
    supported_currencies: set[str]   # paypal: USD,...; spidi: charges VES (convert offer USD at BCV rate)
    async def validate_config(cfg: PaymentsConfig) -> tuple[bool, str | None]   # -> provider_specific_id
    async def create_checkout(cfg, order, offer, user, return_url, cancel_url) -> CheckoutResult  # {checkout_url, provider_order_id, client_payload}
    async def confirm(cfg, order, params: dict) -> PaymentResult  # capture / poll status -> {status, capture_id, raw}
    async def handle_webhook(cfg, request) -> list[ProviderEvent]  # verified, normalized
```

PayPal details below are external knowledge, not read from the repo:
- Orders v2: `POST {base}/v2/checkout/orders` with `intent: CAPTURE`, `purchase_units[0] = {reference_id: order_uuid, custom_id: enrollment_uuid, description, amount:{currency_code, value}}`, `payment_source.paypal.experience_context = {return_url, cancel_url, user_action:'PAY_NOW', shipping_preference:'NO_SHIPPING', brand_name:'Sanar y Criar'}`.
- The redirect URL is the link with `rel == 'payer-action'`.
- Capture: `POST /v2/checkout/orders/{id}/capture`.
- Base URLs: `https://api-m.sandbox.paypal.com` and `https://api-m.paypal.com`.
- VES is not a PayPal currency, so price offers in USD.

The status model leaves room for SPIDI's two phases (`paid` vs `accredited`), so delivery can be chosen at either phase.

### 6.4 Frontend changes

1. **Unlock:** `services/plans/plans.ts:26` and `dash/payments/[subpage]/page.tsx:63-78` (section 3.3).
2. **Configuration screen** (`PaymentsConfigurationPage.tsx:33-56`): replace the Stripe entry with a PayPal entry (icon `SiPaypal` from `@icons-pack/react-simple-icons`). `kind: 'credentials'` opens a modal with Client ID, Secret and Environment (sandbox/live), then calls C2 or the new PUT, instead of `window.open(connect_url)`. "Connected" stays `provider_specific_id && active`. Add a SPIDI card later.
   - New service: `services/payments/providers/paypal.ts` (`savePaypalCredentials`).
   - `providers/stripe.ts` and `app/payments/stripe/connect/oauth/page.tsx` can stay unused.
3. **Dash header:** replace the "Stripe Dashboard" link (`page.tsx:142-151`) with a provider-aware link (PayPal: `https://www.paypal.com/activity` or sandbox) or remove it.
4. **Customers/Overview** (`PaymentsCustomersPage.tsx`): point the C6 and C7 services at `/overview` and `/transactions`, or keep the Stripe paths as backend aliases for zero UI change.
   - Hide the Subscriptions tab and the MRR/ARR/churn cards while only one-time sales exist.
   - Replace `CardChip` and `item.stripe` with a provider chip (PayPal / Pago Móvil).
   - Change the "Could not reach Stripe" copy.
5. **Offer forms:** hide `subscription` in `CreateOfferForm.tsx:150-153` and `PaymentsOffersPage.tsx:329-331` while providers lack recurring support. Keep USD as the default.
6. **Checkout** (`offer-detail.tsx:141-171, 249-306`):
   - Fetch `/{org}/checkout/providers` and render one button per active provider: "Pagar con PayPal" (redirect via O9 with `&provider=paypal`, or PayPal JS Smart Buttons; `next.config.js` only sets `frame-ancestors`, no `script-src`, so loading `https://www.paypal.com/sdk/js` is allowed) and later "Pago Móvil (SPIDI)".
   - On return, read `?checkout=success|cancelled|failed`: toast, invalidate `['offers','by-resource',…]`, `['payments',orgId,'enrollments','mine']` and `queryKeys.trail.org`, and link to the first course activity.
   - Replace "Secure checkout via Stripe" (303).
   - For `customer_choice`, add an amount input and send `&amount=`.
7. **Link fixes:** `CourseActionsMobile.tsx:272` and `AccountPurchases.tsx:85` should use `offer_uuid` (or the backend accepts ids, see 1.2). Check `res.success` in `OfferResourcesPanel.tsx:62-85` and `PaymentsGroupsPage.tsx:75-86, 189-199`.
8. **AccountPurchases:** hide "Manage subscription" and the "Invoices & receipts → Open portal" block when there is no portal (provider-aware, or skip O10 entirely).
9. **CoursesActions** (optional hardening): treat an active or completed enrollment covering the course as "owned" even without a TrailRun.
10. **Copy and i18n:** the store, offer page, dash payments pages and `UnconfiguredPaymentsDisclaimer.tsx:5-21` ("Link Stripe…") have hardcoded English. `locales/es.json` exists and already holds the `payments.*` keys, so move these strings there.
11. Remove or ignore the dead code: `AccountMyCourses.tsx`, `getOfferDetails`, `payments.ts:getUserEnrollments`, the Stripe Express functions.

---

## Key files (absolute)

Frontend
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/payments/payments.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/payments/offers.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/payments/groups.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/payments/providers/stripe.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/utils/ts/requests.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/plans/plans.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/services/config/config.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Hooks/usePaymentsEnabled.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Hooks/useResolvedFeature.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/lib/features/gateReason.ts
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/dash/payments/[subpage]/page.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsConfigurationPage.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsOffersPage.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsGroupsPage.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/PaymentsCustomersPage.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/SubComponents/CreateOfferForm.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Dashboard/Pages/Payments/SubComponents/OfferResourcesPanel.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/(withmenu)/store/page.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/(withmenu)/store/store.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/(withmenu)/store/offers/[offerid]/page.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/(withmenu)/store/offers/[offerid]/offer-detail.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Objects/Courses/CourseActions/OfferCard.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Objects/Courses/CourseActions/CoursesActions.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Objects/Courses/CourseActions/CourseActionsMobile.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Objects/Courses/CourseActions/PaidCourseActivityDisclaimer.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/components/Objects/Account/subpages/AccountPurchases.tsx
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/activity/[activityid]/activity.tsx

Backend
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/core/deployment_mode.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/core/ee_hooks.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/core/events/database.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/router.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/security/rbac/rbac.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/security/features_utils/resolve.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/security/features_utils/plan_check.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/security/features_utils/plans.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/security/features_utils/dependencies.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/security/csrf.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/db/organization_config.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/orgs/orgs.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/courses/activities/access.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/courses/chapters.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/ai/rag/access.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/trail/trail.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/admin/admin.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/demo/sync.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/demo/bundle_loader.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/webhooks/events.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/services/webhooks/crypto.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/migrations/payments_to_offers_migration.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/migrations/versions/0314ec7791e1_payments.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/migrations/versions/e8f9a0b1c2d3_add_billing_interval_to_paymentsoffer.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/migrations/versions/r7s8t9u0v1w2_add_payments_mode.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/tests/security/test_remediation_stripe_idempotency.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/tests/security/test_rbac_runtime.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/tests/services/test_demo_drift.py
- C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/api/src/tests/services/test_demo_sync.py

---

# VERIFICACIÓN INDEPENDIENTE

## Confirmed

- **Service layer (1.1–1.4).** All function names, line ranges, HTTP methods, paths and query params in `apps/web/services/payments/{payments,offers,groups,providers/stripe}.ts` match the source. The `errorHandling` vs `getResponseMetadata` split is correct (`requests.ts:194-227`, `236-254`). `getUserEnrollments` turns a 403 into `[]` at `offers.ts:100`. `asArray` is at `requests.ts:265-269`.
- **`/api/v1` prefix and EE router hook.** `router.py:51` sets the prefix and `router.py:393` calls `register_ee_routers`. The hook at `ee_hooks.py:80-89` returns `True` when no EE is present. `EE_ONLY_FEATURES` is at `deployment_mode.py:25-27`. The `LEARNHOUSE_FORCE_EE` caveat is correct (`deployment_mode.py:44-71`, `ee_hooks.py:15-19`).
- **Schema creation.** `create_all` runs at `database.py:398`. Models under `src/db/**` and `ee/db/**` are auto-imported (`database.py:13-47`). Nothing runs Alembic: there is no call in `apps/api/docker-entrypoint.sh`, `cli.py`, `docker/start.sh` or the Dockerfiles. The heads are exactly `c1d2e3f4a5b6`, `d3e4f5a6b7c8`, `e8f9a0b1c2d3` and `n4o5p6q7r8s9` (72 revisions parsed).
- **Paywall plumbing.**
  - `_reader_state` is at `access.py:124-155`, `verify_activity_reader_access` raises 402 at `:186-187`, and `redact_activity_for_reader` writes `{"paid_access": False}` at `:239-241`.
  - Every call site listed in section 4.2 is real: `stream.py:142`; block files at lines 140, 147, 140 and 149; `content_files.py:276`; `local_content.py:181`; `code_execution.py:243,293`; `code_submissions.py:70,152`; `assignments.py:178,1872,2382,4367`; `trail.py:264`; `activities.py:142/202/256/457`; `chapters.py:465-471`, which checks only the first activity, with `request=None` allowed; `rag/access.py:242`.
- **Frontend gating.** Gate 1 is at `dash/payments/[subpage]/page.tsx:63-78` and the Stripe link at `:142-151`. `OSS_BLOCKED_FEATURES` is at `plans.ts:26` and `planMeetsRequirement('oss', …)` at `plans.ts:36`. `resolve.py:150-153` and `plan_check.py:29-39` behave as described. The `usePaymentsEnabled` logic and `queryKeys.payments` (`keys.ts:109-114`) are correct.
- **Ownership comes from TrailRun.** `isStarted` comes from `trailData.runs` (`CoursesActions.tsx:73-78`). Owned shows at `:414-444`, OfferCards at `:446-459`, Start/Leave at `:462-499`. `add_course_to_trail` (`trail.py:471-560`) has no payment check and returns 404 "Trail not found" when no Trail exists. Admin `enroll_user` is at `admin.py:452-523`.
- **`{offerid}` can be an id or a uuid.** Numeric links are at `CourseActionsMobile.tsx:272` and `AccountPurchases.tsx:85`. Uuid links are at `OfferCard.tsx:97` and `store.tsx:108`. The same segment reaches O6 (`page.tsx:39`) and O9 (`offer-detail.tsx:156`).
- **Archive, checkout and dead code.**
  - Archive requires exactly 200 (`PaymentsOffersPage.tsx:58`).
  - Checkout requires login, sends a single `redirect_uri` and nothing reads a return parameter (`offer-detail.tsx:141-171`). "Secure checkout via Stripe" is at line 303.
  - `AccountMyCourses.tsx` is imported nowhere.
  - The silent-success toasts are real: `OfferResourcesPanel.tsx:62-85` and `PaymentsGroupsPage.tsx:75-86` and `189-199`.
- **EE model reconstruction (section 5.2).**
  - `sync.py:2155-2514` and `:3001-3087` show `PaymentsOfferResource` living in `payments_groups`, `PaymentsGroup` having no uuid, datetime columns, `CUSTOM` provider and `enrollment_uuid`, plus the `external_checkout_url` phishing comment at `:2391-2395`.
  - `payments_to_offers_migration.py:42-160` maps statuses and adds ACTIVE/COMPLETED buyers to the UserGroup.
  - `0314ec7791e1_payments.py` defines the uppercase PG enums.
  - The Stripe idempotency test matches its description (`test_remediation_stripe_idempotency.py:15-95`).
- **Other details.**
  - CSRF: requests without auth cookies pass (`csrf.py:258-259`), and the `stripe-signature` exemption is at `csrf.py:228-229`.
  - Webhook events: `course_enrolled` is at `events.py:46` and `org_payments_config_changed` at `:417`; `validate_event_data` is at `:437`.
  - Secrets: `crypto.py` derives its Fernet key from the JWT secret.
  - i18n: `locales/es.json` has 20 `payments.*` keys.
  - CSP: `next.config.js` sets only `frame-ancestors`.
  - Media: `content/` is served only through API routers that check access (`app.py:170-176`), and nginx `/content` proxies to the API.

## Corrections

1. **`rbac.py:516` (`check_enrollment_access`) and `rbac.py:98-118` (402 via usergroup) are not on the course or activity read path.**
   - Course and activity access goes through `check_resource_access` → `ResourceAccessChecker` (`src/security/rbac/resource_access.py:1080+`). Its read rules (`:300-405`) never call `check_usergroup_access` or `check_enrollment_access`.
   - `authorization_verify_based_on_roles_and_authorship` is only called from `routers/code_execution.py:224`, `services/roles/roles.py:513`, `services/users/usergroups.py:835` and `services/users/users.py:1257,1268`.
   - Consequences:
     - Re-pointing those two `ee.*` imports (report 3.3 step 3) does almost nothing for buyers.
     - The claim "buyers get read access regardless of usergroup" is false for courses.
     - No 402 `PAYMENT_REQUIRED` is ever produced on course pages.
   - What actually works:
     - Paid courses must be **public, or "Users Only"**. For Users Only, `_check_usergroup_membership` grants any org member when no group is linked (`resource_access.py:928-931`). The paywall then comes only from the hook.
     - If a course is restricted to a UserGroup, fulfillment must add the buyer to that group via `UserGroupUser`. The buyer must also be an org member (`resource_access.py:941`).
     - Otherwise `ResourceAccessChecker` itself must be patched.
2. **Fulfillment status: set `active` for one-time purchases, not `completed`.**
   - `AccountPurchases.tsx:32,54` shows the green "Active" badge only when `status === 'active'`.
   - The demo bundle uses `active` for 13 of the one-time enrollments and `completed` for only one (`src/services/demo/bundle/store.json`, mapped against offer types).
   - The access check should still accept both.
3. **The 409 `ACTIVE_SUBSCRIPTIONS_EXIST` contract (C3) cannot reach the UI in production.**
   - `deletePaymentConfig` is a `'use server'` action that throws through `errorHandling`.
   - Next.js strips thrown-error properties in production, as the repo itself notes at `providers/stripe.ts:29-31`. So `err.status` and `err.detail` in `PaymentsConfigurationPage.tsx:186-193` are undefined there.
   - The same applies to every C1-C8 / S1 call: the client only ever sees a generic failure. Switch these to `getResponseMetadata` if the detail matters.
4. **C1: the UI does not read `enabled`.** Only `id`, `provider`, `provider_specific_id` and `active` are read (`PaymentsConfigurationPage.tsx:126,157,183,231`; `usePaymentsEnabled.tsx:21`). `enabled` is only sent on create.
5. **The `test_demo_sync.py:329-345` test needs no change.** It loops over `EE_ONLY_FEATURES` and asserts `available is False`. Once `payments` is removed from the set, the loop skips it and still passes. `test_plan_check.py:83,95` patches `EE_ONLY_FEATURES` and is also unaffected.
6. **The `/public` behaviour for unlisted offers is understated.** `store/offers/[offerid]/page.tsx:40-42` says a failed lookup covers "archived, unlisted, unknown id". This implies the EE `/public` endpoint 404s unlisted offers too, not only archived ones. No UI sets `is_publicly_listed`, so in practice every offer has to stay listed. Otherwise OfferCard and PaymentWall links from course pages break.
7. **Minor line references.**
   - `DashMobileMenu.tsx` gates payments at lines 70-71 and 128-129, and at 228. The line-71 citation is the `isEnabled` helper, not a payments check.
   - `UnconfiguredPaymentsDisclaimer.tsx` is at `apps/web/components/Pages/Payments/UnconfiguredPaymentsDisclaimer.tsx`, not under `Dashboard/Pages/Payments`.

## Additions

1. **The "Leave course" button on an owned paid course is a trap.**
   - In the owned panel, Leave calls `removeCourse` (`CoursesActions.tsx:111-112`). `remove_course_from_trail` deletes the TrailRun **and all TrailSteps** (`trail.py:593-610`).
   - The buyer then loses their progress and sees only OfferCards with no Start button. The report's own "reject if an enrollment exists" checkout rule then blocks them from buying again.
   - Optional item 9 in 6.4 (treat an enrollment as ownership) should be mandatory, or Leave should be hidden for paid courses.
   - Mitigation: `add_activity_to_trail` re-creates the Trail and TrailRun on mark-complete (`trail.py:266-290`).
2. **Reuse `check_trail_presence(org_id, user_id, request, user, db_session)` in fulfillment.** It is at `trail.py:173-195` and auto-creates the Trail, so the TrailRun logic in `admin.py` does not need copying.
3. **A missed frontend consumer: `components/Payments/PaymentWall.tsx`.** It expects `{offer_id, offer_name, amount, currency}` (the rbac 402 shape) and links `/store/offers/{offer_id}` (line 52). It is not imported anywhere. `lib/errors/catalog.ts:84` maps every 402 to "plan upgrade" copy, so any 402 that reaches a generic error toast is mislabelled.
4. **Register literal routes before parameterised ones.**
   - `GET /{org_id}/offers/public-listing` and `/{org_id}/offers/by-resource` collide with `GET /{org_id}/offers/{offer_id}`.
   - If the `{offer_id}` route is registered first, the literal paths are captured by it (404 or 422).
   - Fix: declare the literal routes first, or use a `{offer_id:int}` path convertor.
5. **The checkout error is invisible to the buyer.** `offer-detail.tsx:157-164` ignores `result.data.detail` and always shows "Could not start checkout". "Already purchased", provider and currency errors therefore need frontend handling. There is also no "you already own this" state on the offer page.
6. **Normalise `resource_uuid` in by-resource lookups.** `PaidCourseActivityDisclaimer.tsx:20-21` sends the raw `course.course_uuid`, while `CoursesActions.tsx:70-71` sends a normalised `course_<uuid>`. The backend should accept the uuid with or without the `course_` prefix. Post-purchase invalidation should use the `['offers','by-resource']` prefix.
7. **`create_all` limits.** It never adds columns to existing tables, so later schema changes to our payments tables need manual DDL or Alembic. It is also skipped under `TESTING` (`database.py:397`), where tests use in-memory SQLite.
8. **Secret-key coupling.** Credentials encrypted with `crypto.py` become undecryptable if `auth_jwt_secret_key` is rotated (`crypto.py:20-22`). This is a single-org install, so PayPal credentials from environment variables are a simpler alternative (a suggestion, not read from code).
9. **Redirect validation helpers already exist.** `csrf.py:128-143` has `_is_origin_allowed` (allowed_origins, regexp, dev localhost), plus the verified custom-domain check at `csrf.py:~180-205`. `admin.py:1436` has `_validate_magic_link_redirect`, but it accepts only paths, and the frontend sends a full URL (`offer-detail.tsx:155`), so the origin check is the one that fits.
10. **PayPal points (external knowledge, not from the repo).**
    - A capture can come back `PENDING`; there is a `PAYMENT.CAPTURE.PENDING` webhook. Deliver only on `COMPLETED`.
    - Set `experience_context.payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED"` so delivery stays immediate.
    - Use a different `PayPal-Request-Id` for create and capture, for example `capture-<order_uuid>`.
11. **Paywall bypass via the media URL.** `NEXT_PUBLIC_LEARNHOUSE_MEDIA_URL` (`media.ts:3-8`) must keep pointing at the API. A public bucket or CDN there would bypass `verify_activity_reader_access` for paid video and PDF files.
12. **API tokens.** Most routers mount `get_non_api_token_user`. The EE `/payments` router admitted tokens (`test_api_token_access.py:338-340`). Our router should explicitly reject tokens on the buyer endpoints (checkout, enrollments/mine).
13. **AccountPurchases has no "go to course" link.** It only has "View offer" (`AccountPurchases.tsx:84-89`). Adding `included_resources` or `course_uuid` to MyEnrollment would let buyers reach their content from there.