## Done

The production deployment kit is built and verified on this PC. A full local smoke run of the real production compose file passed 56 checks with 0 failures, and it was torn down afterwards. The dev volumes (`sanarycriar-dev_*`) were not touched.

- **`deploy/docker-compose.prod.yml`**
  - Four services: learnhouse-app (`${SC_LMS_IMAGE}:${SC_LMS_TAG}`), db (`pgvector/pgvector:pg16`, tuned), redis 8.6.1 and `caddy:2-alpine` on 80/443/443-udp.
  - Volumes for content, db, redis and caddy data/config. The static site is mounted from `./www` (`releases/` plus a `current` symlink).
  - Every service has a healthcheck. Memory limits: app 2304M, db 768M, redis 256M, caddy 256M. Logs are rotated.
  - Caddy waits only for the app to start, not to be healthy, so the marketing site stays up if the platform is down.
  - Caddy has a network alias `cursos.sanarycriarve.com`, so the platform's server-side rendering reaches its own API inside Docker instead of going out through the public IP.
- **`deploy/caddy/Caddyfile`**
  - **www:** static site with `.html` resolution, 301 from `/x/` to `/x` and from `/ebooks` to `/cursos`, its own 404, immutable caching on `/_astro/*`, compression. Security headers (CSP, HSTS and others) are also sent on the 404.
  - **Redirects:** apex → www (301, path and query kept). `psicoinfantilve.com` and its www → 301 to the same path on www, with extra mappings for old `/cursos/*`, `/ebooks*`, `/login`, `/registro` and `/mi-cuenta`.
  - **cursos:** proxied to the app with a 6GB upload limit. HSTS is added only when the response has none, so LearnHouse's own headers are untouched.
- **`deploy/.env.example`**
  - Every variable, with Spanish comments and a command to generate each secret.
  - Includes the research corrections: `MEDIA_URL`, `FRONTEND_DOMAIN`/`SSL`, `TENANCY=single`, lowercase `NEXT_PUBLIC_LEARNHOUSE_HTTPS=true`, a scoped `ALLOWED_REGEXP`, `EXTRA_CORS_ORIGINS` and the HLS settings.
  - Also covers Resend or SMTP, `NEXT_PUBLIC_SC_SITE_URL`/`SC_SOURCE_URL`, the initial org/admin and backup settings.
  - `TOP_DOMAIN` is set to `cursos.sanarycriarve.com` so login cookies are not shared with www.
  - No `COOKIE_DOMAIN`. No `PAYPAL_*`.
- **`deploy/sitio.env.example`**: public build variables for the Astro site.
- **`deploy/scripts/`**
  - `_comun.sh`: shared helpers for the other scripts.
  - `actualizar.sh`: backs up the DB, then stamps an unstamped database with the version that is running now (the old image), pulls, runs `upgrade heads` with the new image before it starts, starts everything, and stamps on the very first deploy.
  - `backup.sh`: DB dump checked with `pg_restore --list`, content tarball, `.env`, checksums, retention by days, optional rclone upload.
  - `restaurar.sh`: verifies checksums, makes a safety copy, drops and recreates the DB, replaces the content volume, flushes Redis.
  - `deploy-sitio.sh`: refuses to publish if the catalog has "(borrar)" offers or the build points at localhost; uploads with `tar | ssh` and switches `current` atomically; keeps 5 releases.
  - `limpiar-datos-de-prueba.py`: dry-run by default; refuses to run outside dev mode unless given `--permitir-produccion`.
- **`deploy/local-smoke/`**: an override file and `smoke.sh` (project `sanarycriar-smoke`, Caddy with local certificates on 127.0.0.1).
- **Other files**: `deploy/README.md`, `deploy/.gitattributes` (forces LF line endings), `deploy/www/.gitkeep`.
- **`learnhouse/.github/workflows/sanarycriar-image.yml`**
  - Triggers on pushes to branch `sanarycriar` and on tags `sc-v*`. Publishes `ghcr.io/<owner>/sanarycriar-lms` with tags `:sc-vX.Y.Z` or `:sanarycriar`, plus `:sha-xxxxxxx`.
  - Adds OCI labels (source, revision, licence). Fails if any `apps/*/ee` folder exists. Checks the pushed image (ffmpeg present, `alembic heads`).
- **`learnhouse/Dockerfile`**: two production fixes, each marked "Sanar y Criar:".
  - Test uploads in `apps/api/content` are removed from the image; otherwise they would also be copied into a fresh content volume.
  - Windows line endings in `start.sh`, `docker-entrypoint.sh`, `server-wrapper.js` and `nginx.conf` are converted to LF. Without this, an image built on this PC fails on start with `start.sh: syntax error`.
- **`docs/despliegue.md`** (Spanish), covering:
  - DNS, with `cursos` set to DNS-only on Cloudflare.
  - VPS preparation.
  - First deploy.
  - SPF/DKIM/DMARC.
  - PayPal Live: webhook URL `https://cursos.sanarycriarve.com/api/v1/payments/webhooks/paypal/1` and the 7 events to subscribe.
  - Courses and offers, the marketing site, updates and backups.
  - AGPL obligations and the psicoinfantilve redirect.
  - Go-live checklist and troubleshooting.
- **Root `README.md`**: short Spanish overview pointing to the docs.
- **Root `.gitignore`**: now ignores `deploy/sitio.env`, `deploy/backups/` and `deploy/www/*`. It also stops ignoring `web/.env.development`, which the old `.env.*` rule was hiding.
- **Progress log**: `docs/progreso/despliegue.md`.

## Verification
- **Image build:** `docker build -t sanarycriar/lms:local C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse` exits 0 (1.32 GB). Inside the image: ffmpeg 8.1.2, content cleaned, no Windows line endings, a single alembic head `7b5dee2850d6`.
- **Caddy:** `docker run --rm -v .../deploy/caddy:/etc/caddy caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile` → "Valid configuration" on Caddy 2.11.7, also with `local_certs`. No formatting warnings.
- **Compose:** `docker compose -f docker-compose.prod.yml config --quiet` OK, both alone and with the smoke override.
- **Scripts:** `shellcheck` (official `koalaman/shellcheck` image) is clean on all 6 scripts. `bash -n` OK.
- **Smoke test:** `bash deploy/local-smoke/smoke.sh` → "Resultado: 56 OK, 0 fallas", EXIT 0, and 0 smoke volumes remain afterwards. It covered:
  - First deploy through `actualizar.sh`.
  - `/api/v1/health` 200; the platform home and `/login` with Next's own headers.
  - The PayPal webhook route reaches the API; CORS for www; the computed webhook URL is correct.
  - All site, header, cache and compression checks.
  - http→https; apex and psicoinfantilve redirects with path and query kept.
  - A full backup, an update on an existing database, a restore, and every check again after the restore.
- **Memory at idle:** app 448 MiB, db 50 MiB, caddy 18 MiB, redis 5 MiB.
- **Headless Chrome** (isolated profile, through Caddy over HTTPS): www `/` and `/cursos`, and the platform's `/` and `/login`, show no console errors, CSP violations or failed requests.
- **Cleanup script:**
  - Dry run against the dev DB lists 4 courses, 2 offers, 5 accounts and 10 orders; nothing was changed.
  - `--aplicar` was run on a **copy** of the dev DB restored into the smoke stack: only `admin@sanarycriarve.com` remained. Without the production flag it refuses (exit 2).
- **`deploy-sitio.sh`** (local mode, in a Linux container):
  - Blocks a catalog with "(borrar)" and a build that points at localhost.
  - Keeps 5 releases with a correct `current`.

## Known gaps / TODO
- Not tested against a real VPS: Let's Encrypt, real DNS, the remote `tar | ssh` upload, rclone, real email and PayPal Live.
- The CI workflow has not run yet (there is no GitHub repo). It uses the same action versions as the upstream workflows.
- Memory peak during an HLS conversion was not measured. Check `docker stats` when the first long video is uploaded.
- `deploy-sitio.sh` was tested with `--sin-build` only, to avoid rewriting `web/dist` while the marketing agent works.

## Needed from others
- **Owner/user:**
  - Create the public GitHub repo for the fork and push branch `sanarycriar` with all changes. Nothing is committed yet.
  - Tag `sc-v1.0.0`, then make the GHCR package public, or run `docker login` on the VPS.
  - `C:/Users/mente/Documents/Psicologa/sanarycriar` itself is not a git repo; the root `.gitignore` assumes it will become one.
- **Brand agent:** `docs/despliegue.md` §5.6 documents running `deploy/scripts/configurar-organizacion.py` from the PC after the first deploy. The smoke run confirmed the platform menu still shows Biblioteca/Pódcasts until that script runs.
- **Optional, upstream repo:** a `.gitattributes` with `*.sh text eol=lf` in `learnhouse/` would fix the line-ending problem at the source. The Dockerfile already works around it.
- **Optional, dev docs owner:** add a line to `docs/desarrollo-local.md` about `deploy/local-smoke/smoke.sh`.
- **Before go-live (any agent or the user):** archive or delete the "(borrar)" test offers and courses in dev before building the site for production. `deploy-sitio.sh` refuses to publish until they are gone.

Key files:
- `C:/Users/mente/Documents/Psicologa/sanarycriar/deploy/` (all files)
- `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/despliegue.md`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/despliegue.md`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/README.md`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/.gitignore`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/.github/workflows/sanarycriar-image.yml`
- `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/Dockerfile`

The local image `sanarycriar/lms:local` is kept for reuse. Test files are in `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/despliegue/`.