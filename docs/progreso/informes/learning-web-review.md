## Defects found and fixed

All paths are under `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web/`.

1. **A pause right after another save was dropped** (`components/SanarYCriar/useProgressSaver.ts`).
   - Problem: if a pause or seek happened while the previous save was still being sent, its save was thrown away. The position only reached the server when the learner left the page.
   - Seen live: while the API was reloading, the server stored 33.2 s, and the pause at 36 s was never sent.
   - Fix: that save now waits in a queue and is sent as soon as the previous one returns.
   - It stays tied to the activity being watched, and a failed save cannot cause a resend loop. This matters on slow Venezuelan connections.
2. **One expired login stopped saving for the rest of the visit** (same file).
   - Problem: a single 401 turned saving off until the page was left, for example when the 8-hour token expired mid-video.
   - Fix: saving is now paused only for the rejected token. It resumes when the session gets a new one. 402, 403 and 404 still stop saving.
3. **Blank PDF on phones without a PDF viewer** (`components/Objects/Activities/DocumentPdf/DocumentPdf.tsx`).
   - Problem: Android Chrome and in-app browsers (Instagram, Facebook) can't show a PDF inside the page. "Leer ahora" led to an empty dark box, so the ebook could not be read on those phones.
   - Fix: when the browser reports it has no PDF viewer (`navigator.pdfViewerEnabled === false`), the page shows a branded card with "Descargar PDF" and "Abrir el PDF" instead. It is safe for server rendering.
   - New keys `sc_learning.pdf.no_viewer` and `sc_learning.pdf.open` are in both `locales-sc/learning.es.json` and `learning.en.json`.

The rest checks out against spec 4.2 and the backend progress API:
- What `services/courses/progress.ts` sends and expects matches the progress API exactly (checked with curl GET and PUT).
- Ebook purchase area: buyers who haven't paid still see `CoursesActions`.
- The Curso/Ebook switch keeps the other `extra_metadata` keys (confirmed in the database).
- Nothing in these files uses raw HTML injection, and the browser copy of progress holds no tokens.

## Defects found but not fixed

- **Last PDF page is not remembered.** It needs a custom pdf.js reader. This is accepted as a gap under the spec ("si no, omitir").
- **Saves can arrive out of order.** A periodic save that lands after the final on-leave save can roll the server back a few seconds. The fix would be a client sequence number, or the server ignoring older `update_date` values. The impact is low.
- **Download without a click can be blocked.** "Descargar PDF" on the ebook page starts the download automatically after the page opens. If fetching the file fails, the fallback that opens it in a new tab is blocked as a popup. Once the backend gzip fix lands this mostly goes away. The no-viewer card's buttons are real clicks, so they are not affected.
- **Not tested live: a for-sale ebook seen by someone who hasn't bought it.** The shared browser can't be logged out safely; I checked the logic by reading the code.
- **The pause-queue fix (item 1) was not checked live.** During the review the shared browser session became invalid (401, my curl token too), apparently from outside this work. I did not log in again through the browser.

## Verification

- `cd apps/web && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: exit 0 (also after each fix).
- eslint on all files this work touched: 0 errors. 10 warnings, all in upstream code that was already there. After my fixes, `components/SanarYCriar` and `DocumentPdf.tsx` are fully clean.
- **curl, page status:** 200 for `/`, `/courses`, both test courses, the hosted video activity, the YouTube activity, the PDF activity, `/trail` and `/dash/courses/course/<uuid>/general`.
- **curl, progress API** (`/api/v1/progress/...`):
  - Without a session it returns 401.
  - `/openapi.json` lists the progress activity and course paths.
  - With a valid token, GET course and GET activity return exactly the shape the web service expects.
- **curl, PDF download bug:** the ebook PDF under `/content/...` returns 200 without gzip and 500 with `Accept-Encoding: gzip`, which every browser sends.
- **Browser, in my own tab (now closed):**
  - The ebook page showed the hero with "Leer ahora" and "Descargar PDF".
  - With the PDF viewer forced off, "Leer ahora" showed the fallback card (no iframe, both buttons present).
  - The hosted video resumed at 0:33 with "Reanudando en 0:33 · Empezar desde el inicio".
- The progress log now has a Review section: `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/web-aprendizaje.md`.

## Needed from others

1. **Backend, urgent: `apps/api/app.py`, `_SelectiveGZipResponder.send_with_compression`.**
   - Any response that can't be compressed returns 500 when the browser sends `Accept-Encoding: gzip`. This breaks the PDF iframe and "Descargar PDF", and probably every `/content` image too, including ebook covers.
   - Fix: replace the `http.response.start` branch with:
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
2. **Dev environment, whoever runs tests against the dev stack.** Login sessions were invalidated during the review (401 on tokens that had just been issued). Tests should not clear the dev Redis or database sessions, or should use their own.
3. **Boards, optional: `components/Dashboard/Boards/Extensions/ActivityBlockComponent.tsx`.** Pass `trackProgress={false}` to `<VideoActivity>` and `<DocumentPdfActivity>`, so watching inside a dashboard board doesn't record learner progress.
4. **Commerce, optional: `CoursesActions.tsx`, free-course branch.** When the learner has saved progress, show "Continuar" instead of "Start Course" / "Leave course".
5. **Backend, optional: CORS.** Add `Access-Control-Max-Age` to preflight responses, so each progress save doesn't trigger an extra `OPTIONS` request.