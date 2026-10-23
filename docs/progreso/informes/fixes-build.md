**Done**

All six fixes are in. Typecheck, lint, the API and web tests and the live checks pass. I stopped the full API suite at 13% (no failures up to that point) because API tests running in the `api` container write session revocations into the dev Redis, which logs out real dev sessions. Details are under Needed from others, item 4.

1. **Signed-in visitors on /login** (`apps/web/proxy.ts`): a signed-in visitor on `/login` now goes to the `?redirect=` or `?next=` path (cleaned by `safeInternalPath`) instead of always `/home`. The same applies on `/signup`, but only where upstream already redirected (no org host, no invite code). Off-site or empty targets, and targets that are `/login` or `/signup`, still go to `/home`.
   - I added a 10-second `sc_auth_bounce` cookie so that a second redirect in a row goes to `/home`. Without it, a stale session marker plus pages like `/boards`, which send people to `/login?redirect=/boards`, would loop forever.
2. **Free courses with history** (`CoursesActions.tsx`, `CourseActionsMobile.tsx`): when the learner has started the course or has saved progress, they see "Continuar".
   - "Continuar" opens the exact saved point, using the same rule and the same cached query as the "Continuar donde lo dejaste" card. Without saved progress it opens the first unfinished lesson. With progress but no started course, it also starts the course.
   - "Salir del curso" is now a small link that opens a confirmation explaining the progress will be deleted. Focus starts on "Quedarme en el curso". Leaving also clears the cached and locally stored progress.
   - Paid courses are unchanged.
   - Shared code is in two new files: `components/ScFixes/FreeCourseContinue.tsx` and `components/ScFixes/useFixesT.ts`.
3. **Boards** (`ActivityBlockComponent.tsx`): `trackProgress={false}` is now passed to `<VideoActivity>` and `<DocumentPdfActivity>`. Both components already had the prop.
4. **Archiving an offer** (`PaymentsOffersPage.tsx` plus a new `SubComponents/ArchiveOfferDialog.tsx`):
   - Each time the dialog opens it reloads the offers and lists any course or ebook that no other active offer covers, including through payment groups.
   - If something would become free, it says so in Spanish with the names. "Cancelar" becomes the main, focused button, and the archive button reads "Archivar y dejarlo gratis".
   - If the check fails, it shows a general warning.
5. **Reconciliation** (`services/payments/reconcile.py`): `pending` orders are now checked for 7 days; `created`/`approved` stay at 24 h. The Redis lock is unchanged.
6. **Out-of-order progress saves:**
   - `PUT /progress/activity/{uuid}` accepts an optional `client_ts` in epoch ms. Fractions are dropped; negative or very large values return 422.
   - A save whose `client_ts` is older than the stored one returns 200 with the current row. It never moves the position, page, `update_date` or `client_ts` back.
   - One deliberate refinement beyond "ignore": a late save still counts towards the furthest point reached, completion, and a missing duration. Those facts are true whenever they happened.
   - The check runs inside the database upsert itself, so two saves arriving at once can't both win.
   - Saves without `client_ts` behave as before, and responses now include `client_ts`.
   - Storage: a new nullable `client_ts BIGINT` column, a reversible Alembic migration `7b5dee2850d6` (after `a9c8b7d6e5f4`, single head) and a guard in `services/progress/schema.py`. The guard adds the column once per process if it's missing, because the dev DB was built without Alembic. The column is applied to the dev DB.
   - **Outside my file list:** the column had to go in the model, `src/db/activity_progress.py`, and the migration is a new file.

Other new files: `apps/web/tests/sc-fixes.test.mjs`, `src/tests/payments/test_reconcile_pending.py`, `src/tests/payments/test_progress_client_ts.py`, and `locales-sc/fixes.{es,en}.json` (23 keys under `sc_fixes`, same keys in both). The progress log is `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/fixes.md`.

**Verification**
- **Payments and progress tests:** `pytest src/tests/payments` → 99 passed, including the 17 new ones. It also passes with Redis turned off (`-e LEARNHOUSE_REDIS_CONNECTION_STRING=`).
- **Related suites:** payments, core, `test_root_router`, the trail, chapters and admin routers, and the admin and trail services → 255 passed.
- **Migration**, on a temporary database `sc_migtest_fixes` (since dropped): upgrade, downgrade, upgrade again, and upgrade with the column already present all ran without error.
- **Web:** `tsc --noEmit` exits 0. ESLint on the touched files: 0 errors, and the remaining warnings are older code. `bun test tests/sc-fixes.test.mjs`: 10 pass. The full `bun test ./tests`: 485 pass, 1 fail. The failure is in `rtl-guard`: `ar.json` is missing `sc_learning` keys that someone else merged into `en.json`.
- **Live redirect check:** I signed in a test buyer through the web's own login route to get real cookies, then requested `/login`:
  - `?redirect=/store/offers/…` → 307 to the offer, and `?next=/course/…` → 307 to the course.
  - An off-site URL, the tab trick `/%09/evil`, or no redirect → `/home`.
  - With the `sc_auth_bounce` cookie already set → `/home`. Signed out → the login page.
- **Live progress check:**
  - A save at 33 s and then an older one at 30 s → stays at 33.
  - No `client_ts` → 31 is applied. A newer save at 12 s → 12.
  - `client_ts=-5` → 422.
- **Visual checks** in headless Chrome with isolated profiles, in Spanish. I never logged out, because logout revokes every session that user has.
  - **Test buyer, free test course:**
    - Progress but not started: only "Continuar", which opens the lesson at `?t=12` and starts the course.
    - Once started: progress ring, "Continuar" and "Salir del curso".
    - The dialog opens focused on "Quedarme", and "Quedarme" closes it with no change.
    - Confirming, on desktop and at 390 px: "Saliste del curso", then "Empezar curso"; the continue card disappears; the database has no started course and no progress left.
  - **Admin, offers page:**
    - Archiving the only offer for "Curso de prueba (borrar)" shows the warning with the course name, focused on "Cancelar", which closes it.
    - With a second, unlisted temporary offer covering the same course, no warning appears. Archiving that temporary offer through the dialog shows "Oferta archivada".
    - Reopening the dialog shows "Revisando…" again.

**Known gaps / TODO**
- "Last activity" on the course page is still ordered by server time. A late save for the previous lesson that isn't older than that lesson's stored save can still make it the "last" one.
- If a learner un-marks a completed video, a save already in flight can recreate the row and mark it complete again. `client_ts` can't catch this because the row was deleted.
- `FreeCourseContinue.tsx` copies the local-storage key format from the learning agent's `progressLocal.ts`.
- Signing in twice within 10 seconds from links that carry a redirect sends the second one to `/home`. This is harmless.
- Test data left behind:
  - Offer 3 "Oferta temporal (borrar) fixes", unlisted and already archived.
  - `alumna.api.prueba` started and then left the free test course, so nothing is left there for her.
  - Screenshots and scripts are in `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/fixes/`.

**Needed from others**
1. **i18n agent:** merge `apps/web/locales-sc/fixes.{es,en}.json` under the `sc_fixes` key. The archive dialog reuses the existing `sc_commerce.offers.archive`, `archive_title`, `archive_confirm` and `common.cancel` keys, so keep those. Separately, `tests/rtl-guard.test.mjs` fails because `ar.json` is missing the newly merged `sc_learning.*` keys.
2. **Learning agent (`client_ts` is optional, so nothing breaks in the meantime):**
   - `services/courses/progress.ts`: add `client_ts?: number` to `ActivityProgressBody`, and in `saveActivityProgress` add `if (Number.isFinite(body.client_ts)) payload.client_ts = Math.floor(body.client_ts!)`. The payload is built field by field today, so it is currently dropped.
   - `components/SanarYCriar/useProgressSaver.ts` (and the YouTube and PDF savers): set `client_ts: Date.now()` when the position is read, and keep that value on queued and keepalive saves.
   - Optional: export a `clearLocalCourseProgress(userKey, course)` helper from `progressLocal.ts` so I can drop my copy of the key format.
   - Pre-existing: at 390 px the course page shows both `CoursesActions` and `CourseActionsMobile`, so the actions appear twice.
3. **Spec owner (`docs/spec-tecnica.md`):** §2.4 should say pending orders are reconciled for 7 days and created/approved for 24 h. §3 should list `client_ts?` in the PUT body and in responses.
4. **Everyone running API tests:** `pytest` inside the `api` container uses the dev Redis, and tests write `jwt_revoked_before:<user_id>` keys there. That logs out real dev users.
   - Current keys: user 1 (admin) at 01:54:59 UTC, before any of my runs; user 905; and user 2 (`compradora1.prueba`) at 02:37:21 UTC.
   - The user 2 key was written while my full suite and another agent's full suite were both running, so I can't tell which one did it. compradora1 has to sign in again.
   - Run tests with `-e LEARNHOUSE_REDIS_CONNECTION_STRING=`; the payments tests pass that way.
5. **Deployment:** on Alembic-managed databases run `alembic upgrade head`, which adds `client_ts`. Databases built by `create_all` get the column from the guard on the first progress request.
6. **Dashboard owner (pre-existing):** `/dash/payments/offers` scrolls sideways by 16 px at 390 px width.