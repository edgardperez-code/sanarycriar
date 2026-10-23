**Done**

The learner experience in spec 4.2 is complete, and I checked it in a real browser. The one exception is remembering the last PDF page, which isn't reliable with the browser's built-in PDF viewer (see gaps).

The previous engineer had built most of the code. I reviewed it, kept it, and fixed or finished these parts:

- **Ebook access, in `EbookHero.tsx`**:
  - The ebook page now decides "can this visitor read it?" from the access API (`useCourseAccess`, the commerce agent's hook). It only falls back to the course tree if that call fails.
  - The new `EbookActionsGate` wraps `CoursesActions` and `CourseActionsMobile` in `course.tsx`. Visitors who haven't bought the ebook still see the purchase area, and it shows while access is loading. People who can already read it see the reading buttons in the hero instead.
  - If the PDF is missing, admins see how to add it. Learners see "Este ebook estará disponible muy pronto."
- **Resume notice**:
  - "Reanudando en mm:ss · Empezar desde el inicio" now also appears when the learner arrives through a "Continuar" link, i.e. a `?t=` within ±2 s of the saved position. This works for hosted and YouTube video.
  - The notice stays visible until playback starts, then hides 6 s later. Before, it vanished after 7 s even if the video was still paused.
  - On YouTube, "Empezar desde el inicio" now also saves position 0.
- **"Near the end" rule**: now the last 15 s or 10% of the video, whichever is shorter (`isNearEnd`). Before, a 60 s clip counted as finished at 0:45.
- **Local copy vs. server**: the browser's saved copy only wins over the server if it is under 2 min old and newer than the server's `update_date`. Before, it could override newer progress made on another device.
- **i18n**: added `sc_learning.ebook.no_pdf_staff`. Every `sc_learning.*` key in use exists in both es and en, and each Spanish default matches `learning.es.json`.

Key files (all under `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/`):
- `services/courses/progress.ts`, `hooks/queries/useCourseProgress.ts`, `lib/query/keys.ts`
- `components/SanarYCriar/` (`progressLocal.ts`, `useProgressSaver.ts`, `ResumeToast.tsx`, `ContinueLearningCard.tsx`, `EbookHero.tsx`, `ProductTypeToggle.tsx`, `sc-learning.css`)
- `components/Objects/Activities/Video/` (`Video.tsx`, `useVideoProgress.ts`, `YouTubeProgressPlayer.tsx`)
- `components/Objects/Activities/DocumentPdf/DocumentPdf.tsx`
- `app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/course.tsx`
- `components/Pages/Activity/ActivityChapterDropdown.tsx`, `components/Pages/Trail/TrailCourseCard.tsx`
- `components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral.tsx`
- `locales-sc/learning.{es,en}.json`

Progress log: `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/web-aprendizaje.md`

**Verification**

- **Typecheck**: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` exits 0 with no output.
- **eslint** on every touched file: 0 errors. All 10 warnings are in upstream code that was already there.
- **curl**: all of these return 200:
  - `/`, `/courses`
  - both test course pages, the video activity and the PDF activity
  - `/trail`, `/dash/courses/course/<uuid>/general`
- **Progress API**: `/api/v1/progress/...` is mounted (401 without a session). `curl` PUT and GET return exactly the shape the web service expects.
- **Browser** (my own tab, now closed), as local admin. The backend's "Curso de prueba (borrar)" has no video, so I created "Curso de prueba aprendizaje (borrar)" (`course_8cbd618e-60c0-46d2-bfcb-a1fa80f0de8c`) with 3 hosted videos and 1 YouTube video.
  - **Continue card**: showed "Lección 2 · Capítulo 1 · Vas en 0:12 de 1:00" with a progress bar, linking to `?t=12`. The video opened at 0:12 with the notice.
  - **Saving**:
    - During playback the browser sent a save about every 10 s.
    - Pausing saved 41.7.
    - Leaving with a full page load saved 45.7 (keepalive on pagehide).
    - Leaving with in-app navigation saved 33.9, and the card showed 0:33 right away.
  - **Resume without `?t=`**: the lesson opened at 0:45 with the notice. "Empezar desde el inicio" moved the video to 0.
  - **Finishing a video**: the API marked it completed and added it to the trail. The card then switched to "Sigue con la próxima lección · Lección 3".
  - **Chapter menu**: showed "25% visto" and "100% visto" bars.
  - **`/trail`**: "Continue Learning" linked to `…/activity/b696…?t=30`.
  - **YouTube**: position 52.6 s saved. On reload the player used `start=52` and showed the notice.
  - **Curso/Ebook switch**: saved `product_type` and kept the other `extra_metadata` keys (checked with a test key via the API). In ebook mode the lessons and continue card were hidden and the hero showed. Switching back to Curso also worked.
  - **Free test ebook, as anonymous**: hero with "Leer ahora" / "Descargar PDF" and no purchase area. "Leer ahora" opened the PDF activity.
  - **Mobile (375 px)**: the continue card stacks correctly.

**Known gaps / TODO**

- **Last PDF page is not remembered.** The browser's own PDF viewer in the iframe doesn't tell the page what page is open. We only record that the PDF was opened, plus the page from a `?page=` link. Doing it properly needs a custom pdf.js reader.
- **Not tested live: an ebook that is for sale, viewed by someone who hasn't bought it.** It would need an ebook offer and a logout in the shared browser, which would affect other agents' tabs. I checked the logic by reading the code and with `curl` to `/access`.
- **Test data to delete later**: the course `course_8cbd618e-60c0-46d2-bfcb-a1fa80f0de8c` "Curso de prueba aprendizaje (borrar)", the admin's trail run in it, and its `activityprogress` rows.

**Needed from others**

1. **Backend — `apps/api/app.py`, class `_SelectiveGZipResponder.send_with_compression` (urgent).** With Starlette 1.9.0, any response that isn't compressible returns 500 ("Expected ASGI message 'http.response.start', but got 'http.response.body'") when the request sends `Accept-Encoding: gzip`, which every browser does.
   - What breaks in the browser now: the PDF iframe and "Descargar PDF". The same 500 should hit any non-compressible `/content` file (probably images too). The same URL works with `curl` without gzip.
   - Proposed fix: replace the `http.response.start` branch with:
     ```python
     if message["type"] == "http.response.start":
         await super().send_with_compression(message)
         already_sent = self.content_encoding_set or self.partial_response or self.content_type_is_excluded
         if not already_sent:
             content_type = Headers(raw=message["headers"]).get("content-type", "")
             if not _is_compressible(content_type):
                 # Sanar y Criar: Starlette >= 1.x buffers the start message until the first
                 # body chunk unless the response is excluded; send it before passing through.
                 self.content_type_is_excluded = True
                 await self.send(self.initial_message)
         return
     ```
2. **Backend, optional — CORS.** Every progress save from the browser triggers an `OPTIONS` preflight first, which suggests no `Access-Control-Max-Age` on preflight responses. Setting one in the CORS middleware would cut those extra requests in dev. In production they disappear if the API is served from the same origin.
3. **Commerce, optional — `CoursesActions.tsx` free-course branch.** It still shows "Start Course", or the red "Leave course" once started, even when the learner has saved progress. Research note 5.4 suggests "Continuar" there instead.
4. **Boards, optional — `components/Dashboard/Boards/Extensions/ActivityBlockComponent.tsx`.** Pass `trackProgress={false}` to `<VideoActivity>` and `<DocumentPdfActivity>` so watching inside a dashboard board doesn't record learner progress. The embed route can stay as is.