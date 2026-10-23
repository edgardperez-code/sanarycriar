All six items are done. Typecheck exits 0, ESLint shows no errors, and the course page and a lesson were checked as the test buyer in headless Chrome at desktop and 390 px. FreeCourseContinue (item 6) is in `components/ScFixes/`, which isn't my file, so I didn't change it.

1. **Spanish player** (`apps/web/components/Objects/Activities/Video/LearnHousePlayer.tsx`):
   - **Cause:** on `lang="es"` pages every control label was still English. The package's own on-demand loading of the Spanish pack never took effect under Next.
   - **Fix:** the player now bundles the Spanish pack with `import '@videojs/react/i18n/locales/es/register'`, and still follows the page language.
   - **Slider wording:** the pack names the time slider "Buscar" (which reads as "search"), so I renamed it "Posición del video".
   - **Checked:** the controls now read "Reproducir", "Silenciar", "Posición del video {2 segundos de 4 segundos}", "Pantalla completa", "Configuración", etc. The settings menu shows "Velocidad", "Calidad" and "Subtítulos".
2. **Plural:** chapter counts in `course.tsx` now use `t('activities.count', { count })`, which renders "1 actividad". There were no other "N Actividades/Lecciones" strings in my files.
3. **`client_ts`:**
   - **Request type:** `services/courses/progress.ts` sends it only when it is a finite number between 0 and 10^13, rounded down; otherwise it is left out.
   - **Saver:** `useProgressSaver.ts` records `Date.now()` whenever the position, page or completion is read. Periodic, queued, retried and keepalive saves all send the stamp of the position they carry.
   - **Other players:** the YouTube and PDF players use the same hook, so they needed no changes.
   - **Checked:** two real saves in the browser carried `client_ts`.
4. **Brand colours:**
   - **Course progress ring:** `#6559CA` on a `#EEEDFF` track.
   - **Trail card:** the bar and percentage are lavanda instead of green and teal.
   - **"Completed" label:** it now shows "COMPLETADO" in lavanda-700 via `t('sc_learning.trail.completed', 'Completado')`.
   - **Trail list bar:** `TrailCourseElement` also uses lavanda.
5. **Actions shown twice on mobile:**
   - **Cause:** `course.tsx` added `CourseActionsMobile` at the bottom on phones. The desktop right column (actions plus authors) already stacks under the description on narrow screens, so both showed. Upstream LearnHouse does the same.
   - **Fix:** I removed the bottom mobile box. `CourseActionsMobile.tsx` is now not rendered anywhere, but the file is still there.
   - **Checked at 390 px:** one "Continuar", one "Este curso es tuyo", no horizontal scroll.
6. **Helper:** `components/SanarYCriar/progressLocal.ts` now exports `clearLocalCourseProgress(userKey, course)`.

**Checks:**
- `bun test tests/sc-fixes.test.mjs tests/video-source.test.mjs`: 40 pass.
- A throwaway bun test of the `client_ts` cleanup passes: `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/ui-estudiante/t/client-ts.test.ts`.
- ESLint on the 8 touched files has 14 warnings, all in older code.

**Needed from others:**
1. **i18n:** add `sc_learning.trail.completed` (es "Completado", en "Completed"). Until then English users also see "Completado".
2. **fixes:**
   - In `apps/web/components/ScFixes/FreeCourseContinue.tsx`, replace `forgetLocalCourseProgress` with `clearLocalCourseProgress` from `@components/SanarYCriar/progressLocal` (same arguments).
   - Update its comment that says it is shared with `CourseActionsMobile`, since the course page no longer renders that component.
3. **Spec owner:** note in §3 of `docs/spec-tecnica.md` that the client now sends `client_ts`.

Files are in C:/Users/mente/Documents/Psicologa/sanarycriar/docs:
- progreso/ui-estudiante.md (progress log)
- capturas/learnhouse/20-curso-compradora-escritorio.png
- capturas/learnhouse/20-curso-compradora-movil.png
- capturas/learnhouse/20-leccion-video-controles.png