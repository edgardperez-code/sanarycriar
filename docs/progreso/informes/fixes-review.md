**Defects found and fixed**

The six fixes mostly do what the implementer reported. I found and fixed three defects in the workstream's own files. Tests, typecheck and the live checks are green afterwards.

1. **A device with a wrong clock could freeze someone's progress on every other device** (`apps/api/src/services/progress/progress.py`). `client_ts` comes from the device's clock. If one device's clock was set ahead (say, a phone set by hand a year ahead), its time was stored, and every later save from a device with the correct time was ignored until real time caught up. A device whose clock runs behind had the same problem when the learner switched devices.
   - **Fix:** a save with an older `client_ts` is ignored only while the stored save is less than 10 minutes old by the server's clock (`_CLIENT_TS_WINDOW`, compared against `update_date`). After that the last save wins again.
   - **Why this is still safe:** saves that arrive out of order in real use (a periodic save landing after the save sent on leaving) are seconds apart, and the saver has no offline queue. So the protection still covers the case it was built for.
   - **Test added:** `test_older_stamp_wins_once_the_stored_save_is_not_recent` in `apps/api/src/tests/payments/test_progress_client_ts.py`.
2. **Mobile showed the wrong buttons to signed-in non-members** (`CourseActionsMobile.tsx`). A signed-in user who is not a member of the org got "Continuar" / "Salir del curso" on mobile, while desktop shows them "Unirse". `hasFreeHistory` now also requires `isUserPartOfTheOrg`, so they get the original button that sends them to `/signup`.
3. **The archive warning could show "Contenido <uuid>" instead of a course name** (`SubComponents/ArchiveOfferDialog.tsx`). Other screens store the shared course list either as a plain array or wrapped as `{ data: [...] }`. The dialog now accepts both.

I appended a "Review" section to `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/fixes.md`.

**Defects found but not fixed**
- **Onboarding modal overlaps itself:** for a brand-new admin profile, the dashboard's welcome modal ("Te damos la bienvenida a Sanar y Criar") puts the "Comenzar" button over its illustration. This is upstream or branding code, not mine. Suggested fix: give the illustration its own space above the button. The owner is the branding/dashboard workstream.
- **Unpublished courses can still show as "Contenido <uuid>":** if the copilot screen filled the course list first, the list only has published courses. It's cosmetic. Suggested fix: give the archive dialog its own query key that includes unpublished courses.

**Verification**
- **API tests:** `pytest src/tests/payments -q -p no:cacheprovider` with `-e LEARNHOUSE_REDIS_CONNECTION_STRING=` gives 100 passed, including the new test. Turning Redis off this way avoids logging out real dev sessions.
- **Migration:** `alembic heads` shows `7b5dee2850d6 (head)`, a single head. The dev database has the `client_ts bigint` column.
- **Web:**
  - `tsc --noEmit -p tsconfig.json` exits 0.
  - ESLint on the touched files gives 0 errors and 11 warnings, all in older code.
  - `bun test tests/sc-fixes.test.mjs` gives 10 pass.
- **Live redirect check:** the script is `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-fixes/live-check.mjs`. It signs in the test buyer through the web's own login route.

  | Request | Result |
  |---|---|
  | `/login?redirect=/store/offers/…` | 307 to the offer, bounce cookie set |
  | `/login?next=/course/…` | 307 to the course |
  | Off-site redirect, `/%09/evil…`, or no redirect | `/home` |
  | Second bounce within 10 s | `/home` |
  | `/signup` while signed in | the page itself (200) |
  | Signed out | the login page |

- **Live progress check, same script:**

  | Save | Result |
  |---|---|
  | Save at 33 s | stored |
  | Older save at 30 s | ignored, stays at 33 |
  | Save without `client_ts` at 31 s | applied |
  | Newer save at 12 s | applied |
  | `client_ts=-5` | 422 |
- **10-minute window on Postgres:** the script is `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-fixes/window.mjs`. I moved the stored row's time back 11 minutes. A save with a 60 s older `client_ts` was then applied (position 25), and a save even older than that was ignored because the stored row was recent again. I deleted the test row afterwards.
- **Visual checks:** I reviewed the implementer's headless screenshots: the leave dialog on desktop, the 390 px course page, and the archive warning. The Spanish is correct, the contrast is readable, and focus starts on the safe button. I did not run a new visual pass, because my UI changes are a single condition and a data-shape guard.

**Needed from others**
1. **i18n agent:** merge `apps/web/locales-sc/fixes.{es,en}.json` under the `sc_fixes` key. Keep `sc_commerce.offers.archive`, `archive_title`, `archive_confirm` and `common.cancel`, which the archive dialog reuses. Separately, `tests/rtl-guard.test.mjs` fails because `ar.json` is missing the newly merged `sc_learning` keys.
2. **Learning agent:**
   - In `services/courses/progress.ts`, add `client_ts?: number` to the body type, and send it when it is a finite number (floored).
   - In `useProgressSaver.ts` and the YouTube and PDF savers, set `client_ts: Date.now()` when the position is read, and keep that value on queued and keepalive saves.
   - Optional: export a helper from `progressLocal.ts` that clears a course's locally stored progress, so `FreeCourseContinue.tsx` can drop its copy of the key format.
3. **Spec owner (`docs/spec-tecnica.md`):**
   - §2.4: pending orders are reconciled for 7 days; created/approved for 24 h.
   - §3: list `client_ts?` (epoch ms) in the PUT body and in responses. An older `client_ts` is ignored only while the stored save is less than 10 minutes old by the server clock.
4. **Everyone running API tests:** pass `-e LEARNHOUSE_REDIS_CONNECTION_STRING=`, otherwise the tests write session revocations into the dev Redis and log out real dev users.
5. **Deployment:** `actualizar.sh` already runs `alembic upgrade heads` before starting the new image, which adds `client_ts`. On a database built by `create_all`, the first progress request adds the column.
6. **Branding/dashboard owner:** the welcome modal overlap above. Also, already known: `/dash/payments/offers` scrolls sideways by 16 px at 390 px, and the course page shows the course actions twice at 390 px.