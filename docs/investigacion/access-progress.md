# LearnHouse 1.4.2: course content, access control and progress, for paid courses, video resume and ebooks

All paths are relative to `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/`. I read everything below from the code unless it is marked **(inferred)**. No files were modified.

---

## 0. Key findings

1. **Paid access already has one hook.** Every content path (activity read, chapter tree, `/content` files, `/stream/*` media, trail completion, AI/RAG) goes through `check_ee_activity_paid_access()` in `apps/api/src/core/ee_hooks.py:80-89`. With no `ee/` folder it always returns `True`, so everything is free. To add payments we replace that fallback with our own entitlement check. No EE code is needed.
2. **Media files are not served as public static files.** They pass RBAC, the published check, locks and the paywall hook. But the hook returns `True`, so today any video or PDF of a public and published course can be fetched by anyone, including anonymous visitors.
3. **Progress only records completion.** It is one `TrailStep` row per completed activity, created by a manual "mark as complete". There is no "last activity" and no playback position anywhere: no API and no localStorage. Course-level "continue" does not exist.
4. **Ebook.** The best fit is a course with one `TYPE_DOCUMENT / SUBTYPE_DOCUMENT_PDF` activity, flagged as an ebook in `course.extra_metadata`. Paywall, gating and the download button come for free.
5. **Create a new table for video resume.** Do not reuse `TrailStep`: its existence means "completed" in several places. Add a new `activityprogress` table with its own endpoints.

---

## 1. Data model

### 1.1 Course: `apps/api/src/db/courses/courses.py`
- `CourseBase` (51-62): `name`, `description`, `about`, `learnings`, `tags`, `thumbnail_type` (enum `image|video|both`, 34-37), `thumbnail_image`, `thumbnail_video`, **`public: bool`** (60, required), **`published: bool = False`** (61), `open_to_contributors: bool`.
- `Course` table (65-82):
  - `id`, `org_id` (FK organization, CASCADE), `course_uuid` (`"course_<uuid4>"`), `creation_date`/`update_date` stored as **str**.
  - `seo` (JSONB) and **`extra_metadata` (JSONB, 82)**. `extra_metadata` is free JSON, usable for `product_type: "ebook"` or price flags without a migration.
  - Composite index `(org_id, public, published, creation_date)` (67).
- Read models:
  - `FullCourseRead` (124-139) includes `chapters: List[ChapterRead]` and `authors`. It is returned by `GET /api/v1/courses/{course_uuid}/meta`.
  - `FullCourseReadWithTrail` (142-155) adds `trail`.

### 1.2 Chapter: `apps/api/src/db/courses/chapters.py`
- `LockType` (10-13): `public | authenticated | restricted`.
- `ChapterBase` (16-27): `name`, `description`, `thumbnail_image`, `lock_type`, `org_id`, `course_id`.
- `Chapter` table (29-34): `chapter_uuid`, `extra_metadata` JSONB.
- `ChapterRead` (52-63): `activities: List[ActivityRead]`, plus a computed **`is_locked`** (62).
- Ordering payloads (66-76):
  - `ActivityOrder {activity_id}`
  - `ChapterOrder {chapter_id, activities_order_by_ids}`
  - `ChapterUpdateOrder {chapter_order_by_ids}`, used by `PUT /api/v1/chapters/course/{course_uuid}/order` (`routers/courses/chapters.py:104`).
- Chapters have no `published` flag. Only activities do.

### 1.3 Ordering join tables
- `apps/api/src/db/courses/course_chapters.py:6-19`: `CourseChapter(order:int, course_id, chapter_id, org_id)`.
- `apps/api/src/db/courses/chapter_activities.py:5-18`: `ChapterActivity(order:int, chapter_id, activity_id, course_id, org_id)`, unique `(chapter_id, activity_id)`.
- Reads order by `CourseChapter.order` (`services/courses/chapters.py:308-315`) and `ChapterActivity.order` (`chapters.py:351-352`, `412`).

### 1.4 Activity: `apps/api/src/db/courses/activities.py`
- `ActivityTypeEnum` (8-14): `TYPE_VIDEO`, `TYPE_DOCUMENT`, `TYPE_DYNAMIC`, `TYPE_ASSIGNMENT`, `TYPE_CUSTOM`, `TYPE_SCORM`.
- `ActivitySubTypeEnum` (17-35):

  | Type | Subtypes |
  |---|---|
  | Dynamic | `SUBTYPE_DYNAMIC_PAGE`, `_MARKDOWN`, `_EMBED`, `_RESOURCE` |
  | Video | **`SUBTYPE_VIDEO_HOSTED`**, **`SUBTYPE_VIDEO_YOUTUBE`** |
  | Document | **`SUBTYPE_DOCUMENT_PDF`**, `SUBTYPE_DOCUMENT_DOC` (enum only; creation accepts PDF only, `services/courses/activities/pdf.py:84`) |
  | Assignment | `SUBTYPE_ASSIGNMENT_ANY` |
  | Custom | `SUBTYPE_CUSTOM` |
  | SCORM | `SUBTYPE_SCORM_12`, `_2004` (SCORM viewer is EE: `@ee/components/Activities/ScormActivity`, `activity.tsx:65`) |

- `ActivityLockType` (38-41): `public | authenticated | restricted`.
- `ActivityBase` (44-51): `name`, `activity_type`, `activity_sub_type`, `content: dict (JSON)`, `details: dict|None (JSON)`, **`published: bool = False`**, `lock_type`.
- `Activity` table (54-72): `id`, `org_id`, `course_id`, `activity_uuid` (`"activity_<uuid4>"`), dates as str, `extra_metadata` JSONB, `current_version`, `last_modified_by_id`.
- `ActivityRead` (95-109): computed `is_locked: bool` (109).

What lives in `content`, `details` and `extra_metadata` per subtype:

| Subtype | Created by | `content` | Other |
|---|---|---|---|
| `SUBTYPE_VIDEO_HOSTED` | `services/courses/activities/video.py:32-185` | `{"filename": "<uuid4>_video.mp4", "activity_uuid": ...}` (121-124) | `details` = `{startTime, endTime, autoplay, muted}` (`Video.tsx:21-26`). `extra_metadata.hls` = `{status, thumbnails{...}}`; `.captions`; `.chapters = {status, items:[{start,title}], ...}` (`video.py:503-515`) |
| `SUBTYPE_VIDEO_YOUTUBE` | `video.py:188-284`, model `ExternalVideo` (175-181) with `type: Literal["youtube","vimeo"]` | `{"uri","type","activity_uuid"}` (241-245) | |
| `SUBTYPE_DOCUMENT_PDF` | `services/courses/activities/pdf.py:25` | `{"filename": "<uuid4>_documentpdf.pdf", ...}` (109-111) | |
| Dynamic page | | TipTap JSON in `content` | |

Server-owned metadata keys (hls, captions…) cannot be forged by clients: `keep_server_owned_metadata()` in `services/courses/activities/activities.py:264-275`.

### 1.5 Activity endpoints (`apps/api/src/routers/courses/activities/activities.py`, prefix `/api/v1/activities`, `src/router.py:221`)
- `POST /` (93): generic create (`ActivityCreate`, needs `chapter_id`).
- `POST /video` (393): multipart `name`, `chapter_id`, `video_file`, `details`.
- `PUT /video/{activity_uuid}` (506).
- `POST /video/{uuid}/captions` (538).
- `POST|PUT /video/{uuid}/chapters` (558 / 581): in-video chapters, AI-generated or manual. Rules in `services/ai/chapters.py:23-27`: min 2, max 20, at least 15 s apart.
- `POST /external_video` (435), `PUT /external_video/{uuid}` (596).
- `POST /documentpdf` (466): multipart `name`, `chapter_id`, `pdf_file`. `PUT /documentpdf/{uuid}` (629).
- `GET /{activity_uuid}` (261) → `get_activity()` (`services/courses/activities/activities.py:111-142`). It checks course READ, then `redact_activity_for_reader`.
- `GET /chapter/{chapter_id}` (313), `/{uuid}/state`, `/versions`, `/editor-bootstrap`.
- `GET|POST|DELETE /{uuid}/usergroups[/{usergroup_uuid}]` (647-694): attach groups to restricted locks.

Course endpoints (`routers/courses/courses.py`, prefix `/api/v1/courses`):
- `GET /{course_uuid}/meta?slim=&with_unpublished_activities=` (422-470) → `get_course_meta()` (`services/courses/courses.py:164-266`).
- `slim=true` drops activity content and details at SQL level (`services/courses/chapters.py:327-405`).

---

## 2. Access control

### 2.1 Course-level RBAC (`apps/api/src/security/rbac/resource_access.py`)
Rules are in the docstring (1-17) and implemented in `_check_public_view_read_access` (287-404):
1. `public and published` → everyone, anonymous included (298-308).
2. Author (`ResourceAuthor`) → allowed (319-330).
3. Org admin or maintainer → allowed (333-343).
4. Public course: role permission. A public but unpublished course needs the `update` right (347-366).
5. UserGroup: if `UserGroupResource(resource_uuid=course_uuid)` rows exist, the user must be in one of those groups, the course must be published, and the user must be an org member (368-394, 901-945). If no groups are linked and `public=False`, the course means "signed-in members of the org" (921-940, `_is_member_of_resource_org` 947-978).

Consequences:
- A **private** course (`public=False`) gives 401/403 on `/meta` for anonymous visitors. The web shows `CourseAccessError` (`course.tsx:171-173`). **A course for sale must be `public=True` and `published=True`** so the landing page with its chapter list is visible. The paywall then works per activity.
- `get_course_meta` uses `AccessContext.DASHBOARD` (`courses.py:198-205`) so authors, admins and usergroup members also see unpublished courses.
- The anonymous view of `/meta` is cached in Redis, keyed by course_uuid (`courses.py:218-222`, `258-262`). This is safe because anonymous users never have paid access.

### 2.2 Chapter and activity locks (`apps/api/src/services/courses/locks.py`)
- `is_locked_for_user(lock_type, resource_uuid, org_id, user, ...)` (69-112):
  - `public` → never locked.
  - `authenticated` → locked for anonymous users.
  - `restricted` → only for org admins, or members of a usergroup attached through `UserGroupResource(resource_uuid=chapter_uuid|activity_uuid)`.
- `batch_accessible_restricted_uuids` (38-66).
- Admins bypass everything (`is_org_admin`, 27-35).
- Group attach/detach: `services/courses/lock_usergroups.py`. It reuses the `usergroupresource` table, `apps/api/src/db/usergroup_resources.py:6-16` (`usergroup_id`, `resource_uuid: str`, `org_id`). Group members live in `UserGroupUser` (`db/usergroup_user.py:6-18`).
- **A usergroup attached to the course_uuid unlocks every restricted chapter and activity below it** (`access.py:92-94`, `chapters.py:497-498`).

### 2.3 The single reader gate (`apps/api/src/services/courses/activities/access.py`)
- `_reader_state()` (124-155) returns `"ok" | "draft" | "unpaid" | "locked"`:
  - Unpublished → `ok` only for editors, otherwise `draft` (139-140).
  - **`paid = await check_ee_activity_paid_access(request, activity.id, current_user, db_session)` (141).**
  - `apply_activity_lock` (46-121) scrubs `content` and `details` and sets `is_locked=True`.
  - Course editors always pass (149-152).
- `verify_activity_reader_access()` (158-189). Used by media and trail. Raises:
  - 401 anonymous / 403 when course READ is denied
  - 404 draft
  - **402 "This activity requires a purchase"** (186-187)
  - 403 locked
- `verify_activity_reader_access_by_uuid()` (192-217) also checks that the activity belongs to `course_uuid`.
- `redact_activity_for_reader()` (220-242). Used by `GET /activities/{uuid}`. Unpaid activities return **`content = {"paid_access": False}`, `details = None`** (239-241).
- Chapter tree, `_apply_locks_to_chapters` (`services/courses/chapters.py:434-530`):
  - Admins bypass (458-460).
  - **Paywall per course:** the hook is called **once, with the first activity's id**. If it denies, every activity gets `content={"paid_access": False}` (461-470). The comment says "the EE check resolves any activity to its course and lets authors through", so our implementation must let authors through too.

### 2.4 What an anonymous visitor sees on a public and published course
- Course landing (`apps/web/app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/course.tsx`):
  - name, about, learnings, thumbnail or thumbnail video
  - authors
  - chapter list with activity names and types (`course.tsx:545-660`)
- Locked activities render as non-clickable rows with a "Locked" badge (`course.tsx:592-640`). Paid activities are **not** flagged `is_locked`. They stay clickable and the activity page shows `PaidCourseActivityDisclaimer` (`activity.tsx:705-706`, `1003-1004`; component in `components/Objects/Courses/CourseActions/PaidCourseActivityDisclaimer.tsx`).
- Public by design (`apps/api/src/routers/local_content.py:216-233`): course thumbnails, `thumbnail_video` (stored under `courses/{uuid}/thumbnails`, `services/courses/thumbnails.py:9`), org files, avatars. **`thumbnail_video` can serve as a free public trailer.**

### 2.5 Enroll / "start course" (trails)
Models:
- `Trail` (`db/trails.py:17-30`): one per `(user, org)`.
- `TrailRun` (`db/trail_runs.py:21-52`): one per `(trail, course, user)`, unique `uq_trailrun_trail_course_user` (29-31). Fields: `status: StatusEnum` (`IN_PROGRESS|COMPLETED|PAUSED|CANCELLED`, 14-18), `data: JSON`.
- `TrailStep` (`db/trail_steps.py:13-52`): unique `(trailrun_id, activity_id, user_id)` (21-24). Fields: `complete: bool`, `teacher_verified: bool`, `grade: str`, `data: JSON`, FKs, str dates.

Endpoints (`apps/api/src/routers/trail.py`, prefix `/api/v1/trail`, `src/router.py:266-270`, router dependency `require_courses_feature`):

| Endpoint | Line | Service | Behavior |
|---|---|---|---|
| `POST /start` | 21 | `create_user_trail` (`services/trail/trail.py:106-145`) | **requires org membership** (129) |
| `GET /` | 45 | `get_user_trails` | |
| `GET /org/{org_id}/trail` | 67 | `get_user_trail_with_orgid` | auto-creates the trail (`check_trail_presence` 173-195). Used by the web hook `hooks/queries/useTrail.ts:9-23` |
| `POST /add_course/{course_uuid}` | 93 | `add_course_to_trail` (471-560) | **only checks course READ** (491-493); creates the `TrailRun` |
| `DELETE /remove_course/{course_uuid}` | 117 | (563-616) | deletes the run and all steps (605-610) |
| `POST /add_activity/{activity_uuid}` | 141 | `add_activity_to_trail` (222-406) | runs `verify_activity_reader_access` (264), so it is paywalled. Refuses assignments (251-255). Creates `TrailStep(complete=True)` (299-311). Fires analytics, webhooks, certificate and COURSE_COMPLETED (349-401) |
| `DELETE /remove_activity/{activity_uuid}` | 167 | | |

Frontend:
- `services/courses/activity.ts:9-52`: `startCourse`, `removeCourse`, `markActivityAsComplete`, `unmarkActivityAsComplete`.
- `CoursesActions.tsx:89-147`:
  - not logged in → `/signup`
  - not an org member → `/signup` (99-102)
  - otherwise `startCourse` and a redirect to the **first activity of the first chapter** (127-136)
- Bug-prone for payments: when offers exist, `CoursesActions.tsx:414-440` treats "has a TrailRun" (`isStarted`, 73-78) as **"you own this course"**. Any user can create a TrailRun on a public paid course, because `add_course` only checks READ. Content stays protected server-side, but the UI would lie. Ownership must come from our entitlement API.
- Buyers must be **org members**. The trail and the UI both require it. The purchase flow must create the account and the org membership.

---

## 3. Progress, video player and video storage

### 3.1 What is recorded
- Only completion: one `TrailStep` row per completed activity, from a manual "Mark as complete" (`activity.tsx:1109` `MarkStatus`, `1222` `markActivityAsCompleteFront`). **There is no auto-complete on video end.** I found no `ended` handler wired to the trail.
- The step's existence means "done":
  - `course.tsx:260-271` (`isActivityDone`) checks only existence.
  - `TrailCourseCard.tsx:41` counts `steps.length`.
  - `CoursesActions.tsx` progress filters `step.complete`.
  - `is_course_fully_completed` (`services/courses/certifications.py:582-620`) counts `complete == True` on published activities.
- `TrailStep.data` is **overwritten in responses** with course info (`trail.py:98`, after `expunge`).
- **Conclusion:** writing in-progress `TrailStep`s would break the counters, so they are not usable for resume.

### 3.2 "Continue where you left off"
- **Course level:** none.
  - `TrailCourseCard.tsx:109,228` "continue_learning" links to the course landing, not an activity.
  - The course page "Start course" goes to the first activity.
  - The Tinybird/ClickHouse analytics compute `last_activity_uuid` (`services/analytics/queries.py:203-222`), but only for admin analytics, not learners.
- **Video level:** none persisted. A localStorage grep found only focus mode and tooltip counters (`activity.tsx:400-411`, `1132-1153`).
  - `LearnHousePlayer.tsx:245` `resumeAtRef` only carries the time across an in-session HLS→MP4 fallback (260-265, 377-379).
- **A usable hook already exists:** `?t=<seconds>` is read by `Video.tsx:85-86` (`positiveIntParam`, `lib/copilot/sources.ts:68-73`) and applied as `details.startTime` in `handleLoadedMetadata` (`LearnHousePlayer.tsx:374-385`). It works for hosted video only. The YouTube branch ignores it: it uses `activity.details` directly at `Video.tsx:228,237-239`.
- PDFs support `?page=<n>` (`DocumentPdf.tsx:42-45`, `#page=` on the iframe, 115).

### 3.3 Player components (web)
- `apps/web/components/Objects/Activities/Video/Video.tsx`:
  - `SUBTYPE_VIDEO_HOSTED` → `LearnHousePlayer` (181-195), source from `videoSource.ts` (HLS when `extra_metadata.hls.status==='ready'`, else MP4).
  - In-video chapters list `VideoChapters` (199-214).
  - `SUBTYPE_VIDEO_YOUTUBE` → `react-youtube` (217-243). **(inferred)** Vimeo URIs would not play: it uses `get-youtube-id`.
- `apps/web/components/Objects/Activities/Video/LearnHousePlayer.tsx`:
  - Video.js 10: `@videojs/react ^10.2.0` and `@videojs/hlsjs-video ^10.2.0` (`package.json:87-88`).
  - HLS through hls.js with credentials only for `/api/v1/stream/hls|block-hls` (85-91, `videoSource.ts` `shouldSendHlsCredentials`).
  - 15 s watchdog fallback to MP4 (79-81, 267-274).
  - Captions fetched with credentials into blob URLs (276-307).
  - In-video chapters as a `chapters` track on the slider (424-442).
  - `controlsList=nodownload` (368-372).
  - A paused overlay with prev/next activity cards (140-160).
  - Media props: `onLoadedMetadata`, plus `onTimeUpdate` only when `endTime` is set (374-403).
- Activity page: `apps/web/app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/activity/[activityid]/activity.tsx`:
  - switch by type (308-393)
  - flattened order `useActivityPosition` (150-174)
  - `NextActivityButton` / `PreviousActivityButton` (1453, 1521)
  - locked screen (516-540)

### 3.4 How chapters show in the player
- There is **no persistent sidebar**. Navigation goes through `components/Pages/Activity/ActivityChapterDropdown.tsx`: a dropdown listing numbered chapters (128-137) and their activities with a check from `trailData`, a "current" pill and links (139-205).
- Also the prev/next buttons, the player's paused overlay, and in-video chapters (`VideoChapters.tsx` plus slider segments).
- The course landing lists chapters, expandable, the first one expanded by default (`course.tsx:77-90`, `545+`).

### 3.5 Video storage and serving (API)
**Upload**
- `upload_video` (`services/courses/activities/uploads/videos.py:5-14`) → `upload_file` (`services/utils/upload_content.py:50-95`).
- Filename `"{uuid4()}_video.<ext>"` (81-83). Path `content/orgs/{org_uuid}/courses/{course_uuid}/activities/{activity_uuid}/video/`.
- Only `video/mp4` and `video/webm` (`video.py:90-93`; `security/file_validation.py:197-202`). **Max 5 GB.** PDF: max 500 MB (203-208).
- Multipart bypasses the 25 MB JSON body cap (`core/middleware/body_size.py:31-34`; `config/config.py:106`). nginx `client_max_body_size 6G` (`docker/nginx.conf:20`).

**Storage backend**
- `hosting_config.content_delivery.type` = `filesystem` (default) or `s3api` (`config/config.py:431-435`; `upload_content.py:137-170`).

**Routes**
- `/content/{path}`: `app.py:169-175` mounts `content_files.py` (S3) or `local_content.py` (filesystem). Neither uses `StaticFiles`. nginx proxies `/content` to the API (`docker/nginx.conf:77-82`).
- `GET|HEAD /api/v1/stream/video/{org}/{course}/{activity}/{filename}` (`routers/stream.py:161-266`).
  - Filesystem mode: `StreamingResponse` with Range/206/416 (`services/utils/video_streaming.py:75`, `117`).
  - S3 mode: **302 to a presigned URL** (`_redirect_to_storage` 87-108). TTL **24 h** (`storage_utils.py:119`). The 302 is cacheable for 6 h (`stream.py:84`).
- **HLS:**
  - Optional ffmpeg ladder (`services/utils/hls_jobs.py:1-16`). `LEARNHOUSE_HLS_ENABLED` defaults to off (168). In-process worker: `LEARNHOUSE_HLS_INPROCESS_WORKER`.
  - Status lives in `activity.extra_metadata["hls"]`.
  - Served at `GET /api/v1/stream/hls/{org}/{course}/{activity}/{hls_path}` (269-362):
    - playlists rewritten with presigned segment URLs in S3 mode
    - segments served by the API in filesystem mode
    - **AES-128 key served only by this authed endpoint, `no-store`** (335-345)
  - Encryption defaults on: `LEARNHOUSE_HLS_ENCRYPT` (`services/utils/hls_transcode.py:58-67`).
  - **(inferred)** The all-in-one root `Dockerfile:86` does **not** install ffmpeg (only `apps/api/Dockerfile:8` does), so HLS needs ffmpeg added to our image.
- Captions: `/api/v1/stream/captions/.../{lang}.vtt` (451-494).
- Block media (video, audio, HLS inside dynamic pages): 495-897.
- **All 9 activity stream handlers call `_verify_course_activity_access`** (193, 301, 391, 475, 522, 624, 693, 800, 862). It ends in `verify_activity_reader_access` (142).
- Frontend URL builders: `apps/web/services/media/media.ts`:
  - `getActivityVideoStreamUrl` 21-28
  - `getActivityHlsMasterUrl` 35-41
  - `getActivityCaptionUrl` 60-67
  - `getActivityMediaDirectory` 249-263 (`/content/...`)

---

## 4. Document/PDF activity and how to model an ebook

### 4.1 Current behavior
- **Upload:**
  - `POST /api/v1/activities/documentpdf` → `create_documentpdf_activity` (`services/courses/activities/pdf.py:25`). Requires `content_type == application/pdf` (84) and magic bytes `%PDF-` (`file_validation.py:207`).
  - Stored by `upload_pdf` (`uploads/pdfs.py:5-14`) at `content/orgs/{org}/courses/{course}/activities/{activity}/documentpdf/{uuid4}_documentpdf.pdf`.
  - `content = {"filename": ...}`.
- **Viewer:** `apps/web/components/Objects/Activities/DocumentPdf/DocumentPdf.tsx`:
  - a plain `<iframe src=".../content/...pdf">` using the browser's native PDF viewer (113-117)
  - fullscreen button (88-103)
  - **download button for learners** (70-84, 133-141), which fetches the blob with cookies
- **Headers:** S3 mode serves PDFs `inline` (`content_files.py:89, 122-131`). Local mode uses `FileResponse`, inline by default.
- Learners **can always download**: through the button, and through the native viewer anyway. The instructor has no option to disable it.
- `pdfjs-dist ^6.4.299` is already a dependency (`package.json:116`), used only for library thumbnails (`components/Dashboard/Library/PdfThumbnail.tsx:17-25`). It can power a custom reader that remembers the last page.

### 4.2 Recommended ebook representation
**Recommended: an ebook is a course with one chapter and one `SUBTYPE_DOCUMENT_PDF` activity**, marked `course.extra_metadata = {"product_type": "ebook"}` (JSONB, `courses.py:82`, no migration).

**What we get for free:**
- the same paywall hook
- `/content` gating
- 402 handling
- the purchase UI slot (`PaidCourseActivityDisclaimer`)
- appearance in "Mis cursos" (trail)
- instant delivery: once the entitlement exists, the PDF opens and the download button works

**UX changes to make:**
1. Landing (`course.tsx`) when `product_type==='ebook'`:
   - hide "Lecciones" and "Empezar curso", the progress ring and the certificate
   - show the cover (`thumbnail_image`) and "Leer ahora" / "Descargar PDF" after purchase
   - `CoursesActions.tsx` has the slot (renderProgressSection 258+, button 465-481)
2. Catalog: filter or label courses vs ebooks by `extra_metadata.product_type`.
3. Reader (optional):
   - Replace the iframe with a pdf.js viewer for a good mobile experience. **(inferred)** iOS Safari renders iframed PDFs poorly.
   - Store the last page in the same progress table (`page` column), giving "Continuar en la página 37".
4. Anti-piracy (optional, server-side): stamp the buyer's email on download (e.g. pypdf). There is no DRM. Native viewers allow saving regardless.
5. A bundle (video course plus ebook) is a course whose last chapter holds a PDF activity.

**Not recommended:**
- The Library media/folders feature: it has its own RBAC (`local_content.py:202-214`), is not tied to the paywall hook, and does not appear in learner trails.
- Dynamic pages with a `pdfBlock`: these work, since they are gated by `services/blocks/block_types/pdfBlock/pdfBlock.py:140`, but add complexity.

---

## 5. Implementation plan: video resume and "Continuar donde lo dejaste"

To make upstream merges easier, keep our code in new files and touch upstream files minimally.

### 5.1 API model: new file `apps/api/src/db/activity_progress.py`
`migrations/env.py:41-62` auto-imports every module under `src/db`, and startup `SQLModel.metadata.create_all` (`core/events/database.py:384-398`) creates new tables. Still ship an Alembic migration.

```python
class ActivityProgress(SQLModel, table=True):
    __tablename__ = "activityprogress"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id", name="uq_activityprogress_user_activity"),
        Index("ix_activityprogress_user_course_updated", "user_id", "course_id", "update_date"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int      = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), index=True))
    user_id: int     = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    course_id: int   = Field(sa_column=Column(Integer, ForeignKey("course.id", ondelete="CASCADE"), nullable=False))
    activity_id: int = Field(sa_column=Column(Integer, ForeignKey("activity.id", ondelete="CASCADE"), nullable=False))
    position_seconds: float = 0.0           # last playback position (video) / 0 for docs
    duration_seconds: Optional[float] = None
    max_position_seconds: float = 0.0       # furthest point reached (for "% visto")
    page: Optional[int] = None              # last page for PDF/ebook
    completed: bool = False                 # mirror; TrailStep stays the source of truth
    creation_date: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    update_date: datetime   = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
```

Use real timestamps, not str dates, so "last updated" sorts correctly. `UserActivityDay` (`db/user_activity.py`) is the precedent.

### 5.2 Migration
- New file: `apps/api/migrations/versions/<rev>_add_activity_progress.py`.
- `down_revision = 'e8f9a0b1c2d3'`. This is the current single head, which I computed with an AST scan of all revisions: `e8f9a0b1c2d3_add_billing_interval_to_paymentsoffer.py`, which revises `d7e8f9a0b1c2`.
- Use `op.create_table(...)`, `op.create_unique_constraint`/`create_index`. Make it idempotent with `sa.inspect(bind).has_table(...)`, as `e8f9a0b1c2d3` does (21-31), because `create_all` may already have created the table.

### 5.3 Service and endpoints
New files `apps/api/src/services/progress/progress.py` and `apps/api/src/routers/progress.py`, registered in `apps/api/src/router.py` next to the trail router (266-270):
`v1_router.include_router(progress.router, prefix="/progress", tags=["progress"])`. Reuse `Depends(require_courses_feature)` like `routers/trail.py:18`.

- **`PUT /api/v1/progress/activity/{activity_uuid}`**
  - Body: `{position_seconds: float>=0, duration_seconds: float|None, page: int|None, completed: bool=False}`.
  - Steps:
    1. Anonymous → 401.
    2. Load the activity and course in one join, like `trail.py:236-247`.
    3. **`await verify_activity_reader_access(request, activity, course, user, db)`**, so non-buyers cannot write (402).
    4. Clamp `position <= duration + 2`.
    5. Postgres upsert:
       `pg_insert(ActivityProgress).values(...).on_conflict_do_update(constraint="uq_activityprogress_user_activity", set_={position, duration, page, max_position=func.greatest(ActivityProgress.max_position_seconds, excluded.position_seconds), update_date=now})`.
  - Optional auto-complete: if `position/duration >= 0.9` and not yet complete, call `add_activity_to_trail(request, user, activity_uuid, db)` (`services/trail/trail.py:222`). That reuses certificates and webhooks.
  - Optional rate limit: `check_rate_limit(f"progress:{user.id}", 30, 60)` (`services/security/rate_limiting.py:97`).
- **`GET /api/v1/progress/course/{course_uuid}`**
  - Requires course READ (`check_resource_access(..., AccessAction.READ)`).
  - Returns:
    ```
    {
      last: {activity_uuid, activity_type, position_seconds, duration_seconds, page, update_date} | null,
      items: [{activity_uuid, position_seconds, duration_seconds, max_position_seconds, page, completed}]
    }
    ```
  - `last` = the row with max `update_date` for `(user, course)`.
- **`GET /api/v1/progress/activity/{activity_uuid}`**: a single row, for an instant seek when the player mounts.
- **Reset:** when a learner leaves a course, delete their `ActivityProgress` rows for that course next to the TrailStep delete in `remove_course_from_trail` (`services/trail/trail.py:605-610`). This is a one-line upstream touch.

### 5.4 Frontend
1. **Service** `apps/web/services/courses/progress.ts`:
   - `saveActivityProgress(activityUuid, body, token, {keepalive})` uses `fetch(..., {method:'PUT', keepalive: true, headers: Authorization})`. Use `keepalive`, not `sendBeacon`, because `sendBeacon` cannot set the bearer header the app uses (`RequestBodyWithAuthHeader`). CSRF is Origin-based (`security/csrf.py:1-12`), so same-origin calls pass.
   - `getCourseProgress(courseUuid, token)`.
2. **Query key and hook:**
   - In `apps/web/lib/query/keys.ts` (near `trail`, 27-28) add `progress: { course: (uuid) => ['progress','course',uuid], activity: (uuid) => ['progress','activity',uuid] }`.
   - New hook `apps/web/hooks/queries/useCourseProgress.ts`, modeled on `useTrail.ts`.
3. **`LearnHousePlayer.tsx`:**
   - New props `resumeAt?: number` and `onProgress?: (pos:number, dur:number, reason:'tick'|'pause'|'seeked'|'ended'|'hide') => void`.
   - In `handleLoadedMetadata` (374-385): if there is no `?t` and `resumeAt > 5 && resumeAt < duration - 15`, set `el.currentTime = resumeAt`. Show a small toast "Reanudando en mm:ss · Empezar desde el inicio".
   - Merge `handleTimeUpdate` (388-392, currently only for `endTime`) into one handler that keeps the endTime pause and adds throttled progress.
   - Add `onPause`, `onSeeked` (1 s debounce), `onEnded` to `mediaProps` (394-403).
   - Add a `visibilitychange`→hidden, `pagehide` and unmount effect that sends with `keepalive`.
4. **Throttling:**
   - Send at most once every 15 s of *playback* (track `lastSentPos`, send when `|pos-lastSentPos| >= 10`).
   - Always send on pause, seeked, ended, hide and unmount.
   - Mirror to `localStorage['sc:progress:'+activity_uuid]` (wrapped in try/catch) for instant resume and offline. The server is the source of truth across devices.
   - About 4 writes per minute per viewer, each a single-row upsert.
5. **`Video.tsx`:**
   - Fetch the activity progress (or read it from the course-progress cache).
   - Priority: `?t=` (85) > saved position > `activity.details.startTime`.
   - Pass `resumeAt` and `onProgress` to `LearnHousePlayer` (181-195).
   - YouTube branch (217-243): use the merged `details.startTime` in `playerVars.start` and `seekTo` (228, 237-239). Poll `event.target.getCurrentTime()` every 15 s while `onStateChange===PLAYING`, and send on PAUSED/ENDED.
6. **Course page banner** (`course.tsx`):
   - With `useCourseProgress(course.course_uuid)` (only when logged in), render "Continuar donde lo dejaste" above "Lecciones" (`course.tsx:545`) or inside `CoursesActions.renderProgressSection` when `isStarted` (`CoursesActions.tsx:258+`). Content: activity name, chapter name, `mm:ss`, a progress bar `position/duration`.
   - Link: `getUriWithOrg(orgslug,'') + /course/${courseuuid}/activity/${last.activity_uuid.replace('activity_','')}?t=${Math.floor(last.position_seconds)}`. For PDFs use `?page=${last.page}`.
   - If `last` is completed or under 15 s from the end, link to the **next** activity using the same flattening as `useActivityPosition` (`activity.tsx:150-174`).
   - Replace "Empezar curso" with "Continuar" when started.
   - Point `TrailCourseCard.tsx:109` `courseLink` at the same deep link.
7. **Player navigation:** in `ActivityChapterDropdown.tsx:139-205`, add a thin progress bar per activity from `items` (`max_position/duration`) next to the completion check.

---

## 6. Where to enforce paid access server-side

### 6.1 Current protection status of media URLs
- **Gated, not public.** Activity files are served only through `/content/...` (`local_content.py:130-241` / `content_files.py:225-330`) or `/api/v1/stream/...`. Both run `verify_activity_reader_access(_by_uuid)`:
  - `local_content.py:170-187`
  - `content_files.py:265-282`
  - `stream.py:111-142`, used by all 9 handlers
- **But not paywalled today.** `check_ee_activity_paid_access` returns `True` without EE (`ee_hooks.py:85-89`). On a public and published course:
  - `GET /api/v1/activities/{uuid}` returns `content.filename` to anyone, anonymous included.
  - `/content/.../documentpdf/<file>.pdf`, `/api/v1/stream/video/...` and `/stream/hls/.../master.m3u8` are fetchable by anyone.
  - **Today everything is effectively free.**
- **Public by design** (`local_content.py:216-233`): course root files, `courses/{uuid}/thumbnails/*` (image and trailer), org assets, user avatars.
- **Leak paths to keep in mind:**
  1. `NEXT_PUBLIC_LEARNHOUSE_MEDIA_URL` (`services/media/media.ts:3-8`). If pointed at a public bucket or CDN, `/content/...` bypasses the API gate. Leave it unset or pointed at the API.
  2. S3 mode MP4: the 302 presigned URL is valid 24 h (`storage_utils.py:119`). A buyer can share it for that long. Lower the TTL or prefer HLS.
  3. HLS segments are presigned in S3 mode, but **AES-128 encrypted with the key behind the authed endpoint** (`stream.py:335-345`). This is the strongest option.
  4. YouTube activities cannot be protected. Paid video must be hosted.
  5. Do not add an nginx `alias` or static `location` for `/content`. Keep the proxy (`docker/nginx.conf:77-82`).

### 6.2 Enforcement point
- **Implement our own fallback in `apps/api/src/core/ee_hooks.py:80-89`.** Keep the EE branch and replace `return True` with `return await has_paid_access(request, activity_id, user, db_session)` from a new module, e.g. `apps/api/src/services/commerce/entitlements.py`.
- **Do not create an `ee/hooks.py`.** `is_ee_available()` (`ee_hooks.py:7-19`) would switch the deployment into EE license verification (`core/deployment_mode.py:44-70`) and fall back to OSS.
- Through this single change the paywall reaches:
  - activity read → `{"paid_access": False}` (`access.py:239-241`)
  - chapter tree scrub (`chapters.py:461-470`)
  - every `/content` and `/stream` file → **402**
  - `trail/add_activity` → 402 (`trail.py:264`)
  - blocks (`videoBlock.py:149`, `pdfBlock.py:140`, `imageBlock.py:147`, `audioBlock.py:140`)
  - code execution and submissions, assignments
  - AI/RAG (`services/ai/rag/access.py:242`)

`has_paid_access(request, activity_id, user, db)` logic:
1. Resolve `activity_id` → `(course_id, org_id, activity.extra_metadata)` in one query. Memoize on `request.state` (the RBAC checker already does this, `chapters.py:317-319` comment).
2. Is the course for sale? Look up our product↔course link table (designed by the payments workstream), or a `course.extra_metadata.commerce.paid` flag. If not for sale → `True`.
3. Free preview, optional: `activity.extra_metadata.get("free_preview") is True` → `True`. This needs `chapters.py:461-470` changed to evaluate per activity instead of "first activity decides the whole tree", and `_slim_extra_metadata` (`chapters.py:272-279`) to keep that flag.
4. Anonymous → `False`.
5. Org admin or maintainer (`locks.is_org_admin`), or active course author or contributor (`ResourceAuthor`) → `True`. Required: the tree path in `chapters.py` does not apply the editor bypass that `_reader_state` has.
6. Entitlement row `(user_id, course_id, status='active', revoked_at IS NULL, expires_at IS NULL OR > now())` → `True`. The PayPal or SPIDI webhook creates it, which gives instant delivery.
7. Otherwise `False`.

**Performance:** the gate runs on **every Range request** of a filesystem-mode MP4 (`stream.py:193`) and every HLS segment (`stream.py:301`). Keep it to one indexed query. Add a short TTL cache (30-60 s, keyed `(user_id, course_id)`, in Redis via `core/redis.py` or in process) and invalidate it when a purchase is recorded.

### 6.3 Companion changes
- **Enrollment:**
  - Gate `add_course_to_trail` (`services/trail/trail.py:471-560`): for paid courses, require `has_paid_access`, or return 402.
  - Better still, auto-create the `TrailRun` when payment is confirmed, so the purchase appears in "Mis cursos".
  - Remove the `isStarted == owned` assumption in `CoursesActions.tsx:414-440`.
- **Offers UI:** `CoursesActions.tsx:81-87` and `PaidCourseActivityDisclaimer.tsx:19-24` call `GET /api/v1/payments/{org_id}/offers/by-resource?resource_uuid=` (`services/payments/offers.ts:61-67`). That is an EE endpoint missing in our build, so offers come back empty and the UI shows a normal "Empezar curso". Either implement that endpoint in our own router with a compatible response shape (`offer_id`…, see `OfferCard.tsx`) or swap in our own buy card.
- **Alternative design (data only, no new access code):** offer → UserGroup, purchase → `UserGroupUser`, group attached to the course_uuid. This is how the EE migration script describes it (`apps/api/migrations/payments_to_offers_migration.py:1-17`).
  - It only works with every chapter set to `lock_type=restricted`, because a course-level group unlocks restricted children (`access.py:92-94`).
  - It shows a "Locked / ask an admin" message (`activity.tsx:516-540`) instead of a purchase prompt.
  - Admins must not forget a lock.
  - **I recommend the hook plus entitlement design.** The group approach can still be added as a mirror for org admin visibility.
- **Hardening:**
  - Enable HLS (`LEARNHOUSE_HLS_ENABLED=true`, `LEARNHOUSE_HLS_INPROCESS_WORKER=true` on a single host, keep `LEARNHOUSE_HLS_ENCRYPT=true`) and add `ffmpeg` to the image.
  - Prefer filesystem mode (no presigned URLs), or lower `PRESIGNED_URL_TTL_SECONDS` in S3 mode.
  - Keep `NEXT_PUBLIC_LEARNHOUSE_MEDIA_URL` on the API origin.
  - Use the course `thumbnail_video` as the public trailer.

---

# VERIFICACIÓN INDEPENDIENTE

## Confirmed

- **Paywall hook.** `check_ee_activity_paid_access` is at `apps/api/src/core/ee_hooks.py:80-89` and returns `True` when there are no EE hooks. There is no `apps/api/ee`; the only `ee` directory is `apps/web/services/ee`. Every caller listed in the report exists:
  - `access.py:141`, `chapters.py:465`, `rag/access.py:242`
  - `stream.py:142`, `local_content.py:181`, `content_files.py:276`, `trail.py:264`
  - the four block services (`videoBlock.py:149`, `pdfBlock.py:140`, `imageBlock.py:147`, `audioBlock.py:140`)
  - code_execution/code_submissions and assignments
  
  The callers import the function by name, so editing its body in `ee_hooks.py` reaches all of them.
- **Reader gate** (`access.py`):
  - `_reader_state` is at 124-155.
  - Course editors bypass it at 149-152.
  - `verify_activity_reader_access` raises 401/403/404/402/403 (158-189).
  - The unpaid marker `{"paid_access": False}` is set at 239-241.
- **Chapter tree** (`chapters.py:461-471`):
  - The paywall is checked once, using the first activity.
  - Admins bypass it at 457-459.
  - Authors get no bypass there. The editor bypass exists only in `_reader_state`.
- **All 9 stream handlers** call `_verify_course_activity_access`, at lines 193, 301, 391, 475, 522, 624, 693, 800 and 862.
  - The 302 redirect is cached for 6 h (`stream.py:84`).
  - The AES key is served with `no-store` (`stream.py:335-345`).
- **Trail.** `add_course_to_trail` checks only course READ (`trail.py:491-493`). The `remove_course` delete is at 598-610, and `TrailStep.data` is overwritten at `trail.py:98`. Completion is manual only: `markActivityAsComplete` has a single caller, `activity.tsx:1245`, and no `ended` handler is wired to the trail.
- **Front end:**
  - `CoursesActions.tsx:414-444` treats a started course as owned (`isStarted` means "you own this course").
  - A missing offers endpoint yields `[]` through `asArray` (`requests.ts:266-270`).
  - `?t=` is applied through `details.startTime` (`Video.tsx:85-86`, `LearnHousePlayer.tsx:374-385`). The YouTube branch ignores it (`Video.tsx:228,237-239`).
  - `?page=` works for PDFs (`DocumentPdf.tsx:42-45,115`).
  - No saved playback position exists anywhere.
- **Migrations.** The single Alembic head is `e8f9a0b1c2d3`, which revises `d7e8f9a0b1c2`. The other loose heads are merged in `e6f7a8b9c0d1_merge_heads.py`. Both `env.py` and `core/events/database.py:16-44` auto-import `src/db`, and `create_all` runs at line 398.
- **Limits:**
  - Video max 5 GB and PDF max 500 MB with a `%PDF-` check (`file_validation.py:197-208`).
  - Multipart is exempt from the 25 MB body cap.
  - nginx `client_max_body_size 6G` and the `/content` proxy at `docker/nginx.conf:77-78`.
  - `pdfjs-dist ^6.4.299` (`package.json:116`).
  - Video.js `^10.2.0` (`package.json:87-88`).

## Corrections

1. **DASHBOARD context does not admit usergroup members to unpublished courses.** `_check_dashboard_read_access` (`resource_access.py:247-285`) admits only admins, maintainers and authors, then falls back to the public-view rules. Those rules require `published=True` for usergroup access (374-384, comment at 282-284). The comment at `courses.py:196-197` is misleading; the report repeated it.
2. **`StatusEnum` values carry a prefix.** They are `STATUS_IN_PROGRESS`, `STATUS_COMPLETED`, `STATUS_PAUSED` and `STATUS_CANCELLED` (`db/trail_runs.py:14-18`), not `IN_PROGRESS` etc.
3. **Presigned URL TTL:**
   - The file is `apps/api/src/services/courses/transfer/storage_utils.py:119`.
   - `PRESIGNED_URL_TTL_SECONDS` is a hard-coded constant, not configuration, so lowering it means a code change.
   - It is coupled to the 6 h cached 302 (`stream.py:76-84`): a TTL below 6 h would let cached redirects point at expired URLs. `_PRESIGNED_REDIRECT_HEADERS` must be lowered with it. The 300 s playlist cache is at `stream.py:330`.
4. **ffmpeg missing from the root image is a fact, not an inference.** The root `Dockerfile:85-86` installs `nginx curl netcat-openbsd ca-certificates bash libstdc++` and no ffmpeg.
5. **HLS is not "the strongest option" against buyers.**
   - The original MP4 stays next to the HLS output (`hls_jobs.py:1-6`, "upload the output next to the original").
   - The web always builds an MP4 `fallbackSrc` (`Video.tsx:165-173`).
   - Any entitled user can therefore fetch the plain MP4 through `/api/v1/stream/video/...` or `/content/.../video/<file>`.
   - AES-128 only protects against sharing presigned segment URLs.
6. **"Any user can create a TrailRun" is slightly overstated.** `add_course_to_trail` returns 404 "Trail not found" when the user has no Trail (`trail.py:511-514`). A Trail is only created through `create_user_trail`, which calls `require_org_membership` (129), reached directly or via `check_trail_presence`. So it is any org member. The conclusion still holds.
7. **Line drift (minor):**

   | Report says | Actual |
   |---|---|
   | course-level grant `chapters.py:497-498` | 489-490 |
   | `_slim_extra_metadata` 272-279 | 273-279 |
   | memoization comment 317-319 | 320-321 |
   | `renderProgressSection` 258 | 259 |
   | button 465-481 | 468-484 |
   | `get_activity` 111-142 | 112-142 |
   | `keys.ts` trail 27-28 | 27-29 |

8. **OfferCard fields.** It does not use `offer_id`. It reads `offer_uuid`, `offer_name`, `description`, `amount`, `currency`, `price_type`, `offer_type`, `billing_interval` and `benefits`, and links to `/store/offers/{offer_uuid}` (`OfferCard.tsx:96-97`). `offer_id` is only a React key (`CoursesActions.tsx:455`, `PaidCourseActivityDisclaimer.tsx:54`).
9. **A started course shows no "Continuar" or "Empezar" button.** When `isStarted`, the only main button is a red **"Leave course"** (`CoursesActions.tsx:416-439` and `469-483`). That button calls `remove_course`, which deletes every TrailStep. For purchased products it must be hidden, not relabelled.
10. **Free preview is a security requirement, not optional polish.** If `has_paid_access` returns `True` for a `free_preview` activity that happens to be first in the tree, `chapters.py:464-471` leaves the whole tree unscrubbed for everyone. That leaks the TipTap content and filenames of paid activities via `/courses/{uuid}/meta?slim=false` and `/chapters/meta/{course_uuid}` (`routers/courses/chapters.py:99`).
11. **`course.extra_metadata` must not hold the "for sale" or price flag.** `update_course` copies every non-None field (`services/courses/courses.py:957-959`). Any user with course UPDATE rights can therefore replace `extra_metadata` wholesale and make a paid course free. Only `public` and `open_to_contributors` get the extra owner check. The field is also returned to anonymous visitors in `/meta`. Keep sale status and price in our own table; `extra_metadata.product_type` is fine as a display label.

## Additions

- **HLS needs Redis as well as ffmpeg.** `hls_jobs.enqueue` (323-337) logs a warning and does nothing without Redis; jobs go through `client.rpush`. The recommended production path is a separate `transcode-worker` CLI (`hls_jobs.py:8-12`, `cli.py:288`).
- **Existing Admin API services fit instant delivery** (API-token only, `/api/v1/admin`, `router.py:197-201`):

  | Purpose | Service | Route |
  |---|---|---|
  | Create account and org membership | `provision_user` (`services/admin/admin.py:1218`) | `POST /{org_slug}/users` (`routers/admin.py:785`) |
  | Create Trail and TrailRun | `enroll_user` (452) | `POST /{org_slug}/enrollments/{user_id}/{course_uuid}` (475) |
  | One-time sign-in link | `issue_magic_link` (1540) | `routers/admin.py:906` |
  | Add usergroup member | `add_usergroup_member` (2105) | |

  These services take an `APITokenUser`, so in-process reuse needs adapting.
- **Admin `check_course_access` is another TrailRun-equals-access signal.** It returns `has_access = course.public or enrollment` (`services/admin/admin.py:441-446`) and ignores the paywall.
- **Other progress-reset paths to cover with the new table.** The admin `reset_user_progress` (`services/admin/admin.py:1933`, route `admin.py:1054`) and `remove_activity_from_trail` (`trail.py:409-468`) should also clear `ActivityProgress`.
- **Client caches delay "immediate delivery".**
  - React Query `queryKeys.activity.detail(uuid)` and `queryKeys.courses.meta(uuid)` are not keyed by user and have `staleTime` 60 s (`hooks/queries/useActivity.ts:12-14`, `useCourses.ts:24-28`). The offers queries also use 60 s.
  - The Redis anonymous course-meta cache has a 60 s TTL (`services/courses/cache.py:67`). Call `invalidate_course_meta_cache` (`cache.py:100`) when a course's paid status changes, because a view cached before the change still contains full content.
  - After payment confirmation, invalidate the activity, meta, offers and trail queries.
- **Fewer upstream edits for video resume.** `Video.tsx` already holds the `<video>` element through `onVideoElement={setVideoEl}` (`Video.tsx:78,194`; `LearnHousePlayer.tsx:444-447`). Progress listeners can be attached there, and resume can be done by merging the saved position into `details.startTime` at `Video.tsx:86`. The player already honours `startTime` (`LearnHousePlayer.tsx:380-382`), so `LearnHousePlayer.tsx` needs no edits.
- **Cookie auth for media.** The API accepts the `LH_access` cookie (`security/auth.py:89-106`). The PDF `<iframe>` and the MP4 `<video>` depend on that cookie, because they cannot send a bearer header. If the web and API run on different hosts, `cookie_config.domain` must cover both, or buyers get 401 on media.
- **Unpaid redaction keeps `extra_metadata`.** Only `content` and `details` are replaced (`access.py:239-241`). In-video chapter titles, the caption languages and the HLS thumbnail metadata stay visible to non-buyers; the media itself stays gated.
- **`_apply_locks_to_chapters` has a second caller.** The single-chapter read also uses it (`chapters.py:151`), so it is paywalled too.
- **Legacy payments tables already exist in the OSS schema.** Migration `0314ec7791e1_payments.py` creates `paymentsconfig`, `paymentsproduct`, `paymentscourse` and `paymentsuser`, plus the enum `paymentstatusenum`. Avoid these names for our commerce tables.
- **Smaller facts:**
  - The trail router also has `require_authenticated_user` (`router.py:266-271`).
  - `Trail` has no unique `(user_id, org_id)` constraint, only an index (`db/trails.py:18-20`).
  - `check_rate_limit` returns a tuple `(is_allowed, count, reset)` and does not raise (`rate_limiting.py:97-102`).
  - pdf.js loads its worker from unpkg (`PdfThumbnail.tsx:24`), which matters for any CSP.