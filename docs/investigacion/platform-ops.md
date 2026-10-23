# Sanar y Criar on the LearnHouse fork (tag 1.4.2): how to run, configure, brand and deploy it

`LH` below means `C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse`. Line numbers are for the 1.4.2 checkout. I changed no files. The only files I wrote were two throw-away scripts that count translation keys, in `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/`. Anything I did not read in code is marked **(inferred)**.

---

## 0. Summary

- **On this PC, `npx learnhouse dev` will fail as it stands.** I checked three things:
  - **Ports are taken.** `menteveneka_postgres` holds 5432, `menteveneka_redis` holds 6379 and `open-webui` holds 3000. The CLI's dev compose hard-codes `127.0.0.1:5432` and `127.0.0.1:6379` (`LH/apps/cli/src/commands/dev.ts:22-23,37-38`).
  - **The Python pin is exact and not available here.** `LH/apps/api/pyproject.toml:5` requires `>=3.14.7,<3.14.8`. The host has Python 3.14.3. The only `uv` on PATH is 0.11.19 (from hermes), and it only knows CPython up to 3.14.5.
  - **bun is not installed.** The CLI calls `bun install` for web and collab (`dev.ts:345-354`) and `uv sync` for the API (`dev.ts:356-363`).
- **Recommended dev setup:**
  - Postgres, Redis, Mailpit and the API run in Docker on free ports (5433, 6380, 1025/8025, 1338).
  - Web runs natively with `next dev` on port 3100. Collab is only used by Boards (`getCollabUrl` appears only in `components/Dashboard/Boards/BoardCanvas.tsx`), so we can skip it.
  - Alternative: build the all-in-one root `Dockerfile` image and run it on port 80, which is free here.
- **Production:**
  - Single tenancy, with the LMS at `cursos.sanarycriarve.com` and the approved marketing site staying on the root domain.
  - Use our own image built from the fork. **Do not use `npx learnhouse update`**: it rewrites the compose file to `ghcr.io/learnhouse/app` (`LH/apps/cli/src/commands/update.ts:23,135`).
  - The CLI-generated `.env` leaves out several required values: `LEARNHOUSE_SSL`, `LEARNHOUSE_FRONTEND_DOMAIN`, `LEARNHOUSE_TENANCY`, and a lowercase `NEXT_PUBLIC_LEARNHOUSE_HTTPS=true`.
  - Add `ffmpeg` to the root `Dockerfile` so video works properly.
- **Guest checkout is already possible in the open-source code**, through the token-authenticated Admin API. It can create a user, enroll them or add them to a user group, and issue a one-time sign-in link: `POST /api/v1/admin/{org_slug}/users`, `/enrollments/...`, `/usergroups/.../members/...`, `/auth/magic-link`. Google OAuth and magic-link login are open-source too. Only SSO (WorkOS/OIDC) is Enterprise-only.
- **Email verification is off in open-source mode.** Accounts are verified automatically (`LH/apps/api/src/services/users/users.py:219`).
- **Spanish is about 86% done.** `es.json` is missing **754 of 5,224 keys**; 196 of those are on learner-facing screens. Setting the org's default language to `es` with no code change also switches emails to Spanish.

---

## 1. Local development on Windows 11

### 1.1 What `npx learnhouse dev` does (`LH/apps/cli/src/commands/dev.ts`)

1. **Finds the repo root** by looking for `apps/api` and `apps/web` (`:52-65`).
2. **Runs `checkDevEnv`** (`LH/apps/cli/src/services/env-check.ts:41-102,172-264`). If required variables are missing, it offers to write dev defaults:
   - `apps/api/.env`: `LEARNHOUSE_AUTH_JWT_SECRET_KEY` and `COLLAB_INTERNAL_KEY` (random).
   - `apps/web/.env.local`: `NEXT_PUBLIC_LEARNHOUSE_BACKEND_URL=http://localhost:1338/`.
   - `apps/collab/.env`: `COLLAB_PORT=4000`, `LEARNHOUSE_API_URL=http://localhost:1338`, and the same two secrets.
3. **Checks Docker** (`:244-252`). It writes `.learnhouse/docker-compose.dev.yml` (`:11-50,67-73`) with `pgvector/pgvector:pg16` and `redis:8.6.1-alpine`, then runs `docker compose -p learnhouse-dev up -d`.
4. **Prompts for an admin email and password** the first time (`:264-306`).
5. **Sets these variables for the child processes** (`:308-316`): `LEARNHOUSE_DEVELOPMENT_MODE=true`, `LEARNHOUSE_INITIAL_ADMIN_EMAIL/PASSWORD`, and `LEARNHOUSE_DISABLE_EE=1` (unless `--ee`).
6. **Installs dependencies**: `bun install` in web and collab if `node_modules` is missing, and `uv sync` in api if `.venv` is missing (`:339-363`).
7. **Starts three processes** (`:370-380`):
   - API: `uv run python app.py` on port 1338. The port comes from `LH/apps/api/config/config.yaml:24`, and `reload=development_mode` is set in `LH/apps/api/app.py:185-191`.
   - Web: `next dev --turbopack` on port 3000.
   - Collab: `tsx watch src/index.ts` on port 4000.

How the database gets set up:
- On every boot the API runs `CREATE EXTENSION IF NOT EXISTS vector` and `SQLModel.metadata.create_all` (`LH/apps/api/src/core/events/database.py:384-398`).
- If there are no organizations yet, `auto_install()` (`LH/apps/api/src/core/events/autoinstall.py:14-37`) calls `_install_async(short=True)` (`LH/apps/api/cli.py:58-134`). That creates the org from `LEARNHOUSE_INITIAL_ORG_NAME` and `LEARNHOUSE_INITIAL_ORG_SLUG` (`cli.py:89-90`) and an admin from `LEARNHOUSE_INITIAL_ADMIN_EMAIL` and `LEARNHOUSE_INITIAL_ADMIN_PASSWORD` (`cli.py:110-117`). **Set the org variables before the first boot**, so the org is "Sanar y Criar" with slug `sanarycriar`.

Requirements on the host: Docker, Node 18+, **bun** and **uv** (`LH/docs/content/cli/dev-mode.mdx` and `LH/docs/content/developers/contributing/dev-environment.mdx`, which also asks for at least 4 GB RAM for Docker). The repo pins bun 1.4.3 (`LH/.bun-version`). The CLI in the repo is version 1.5.1 (`LH/apps/cli/src/constants.ts:1`).

### 1.2 Blockers on this machine (checked)

| Problem | Evidence | Fix |
|---|---|---|
| Ports 5432 and 6379 are in use | `docker ps` shows `menteveneka_postgres` on 0.0.0.0:5432 and `menteveneka_redis` on 0.0.0.0:6379. If the CLI's compose started, the API's default `postgresql://learnhouse:learnhouse@localhost:5432/learnhouse` (`config.yaml:60`) would hit the wrong database. | Either `docker stop menteveneka_postgres menteveneka_redis`, or run our own infrastructure on 5433/6380 (path A). |
| Port 3000 is in use | `open-webui` is on 0.0.0.0:3000 | Run web on `-p 3100` |
| Python 3.14.7 is required | `pyproject.toml:5`. The host has 3.14.3, and `uv python list --all-versions` on uv 0.11.19 tops out at 3.14.5. | Install a current standalone uv and put it ahead of `...\hermes\bin` on PATH, then `uv python install 3.14.7`. Or run the API in Docker; its base image is `python:3.14.7-alpine3.24` (`LH/apps/api/Dockerfile:1`). |
| bun is missing | — | `npm i -g bun@1.4.3`, or `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| CLI quirk on Windows **(inferred)** | `isContainerRunning` runs `docker inspect --format '{{.State.Running}}'` through cmd.exe (`dev.ts:125-135`). cmd keeps the single quotes, so the result is `'true'`, never `true`. | Harmless: it asks for admin credentials again on every run and `compose up -d` is idempotent. |
| Possible Windows wheel gaps for cp314 **(inferred, not tested)** | Packages such as asyncpg 0.32 and psycopg2-binary 2.9.13 | Another reason to run the API in Docker |

Free on this PC (checked): 80, 443, 8080, 1338, 3100, 4000, 5433, 6380, 1025, 8025, 9000. Docker Desktop has 16 GB RAM and 16 CPUs.

### 1.3 Path A (recommended): infrastructure and API in Docker, web native with hot reload

1. Put a compose file outside the repo, for example `C:/Users/mente/Documents/Psicologa/sanarycriar/dev/docker-compose.yml`:

```yaml
name: sanarycriar-dev
services:
  db:
    image: pgvector/pgvector:pg16
    environment: [POSTGRES_USER=learnhouse, POSTGRES_PASSWORD=learnhouse, POSTGRES_DB=learnhouse]
    ports: ["127.0.0.1:5433:5432"]
    volumes: [sc_db:/var/lib/postgresql/data]
    healthcheck: {test: ["CMD-SHELL","pg_isready -U learnhouse"], interval: 5s, retries: 10}
  redis:
    image: redis:7.2.3-alpine
    command: redis-server --appendonly yes
    ports: ["127.0.0.1:6380:6379"]
    volumes: [sc_redis:/data]
  mailpit:                       # catches all outgoing mail, UI at http://localhost:8025
    image: axllent/mailpit
    ports: ["127.0.0.1:1025:1025", "127.0.0.1:8025:8025"]
  api:
    build: ../learnhouse/apps/api          # Dockerfile: python 3.14.7, ffmpeg, uv 0.10.7
    env_file: ./api.env
    entrypoint: ["/app/.venv/bin/uvicorn"]
    command: ["app:app","--host","0.0.0.0","--port","1338","--reload"]
    ports: ["127.0.0.1:1338:1338"]
    volumes:                      # do not mount over /app: that hides /app/.venv
      - ../learnhouse/apps/api/src:/app/src
      - ../learnhouse/apps/api/config:/app/config
      - ../learnhouse/apps/api/migrations:/app/migrations
      - ../learnhouse/apps/api/app.py:/app/app.py
      - ../learnhouse/apps/api/cli.py:/app/cli.py
      - sc_content:/app/content
    depends_on: {db: {condition: service_healthy}, redis: {condition: service_started}}
volumes: {sc_db: {}, sc_redis: {}, sc_content: {}}
```

Plain `uvicorn` without `watchfiles` uses polling (`StatReload`), so `--reload` should work over Windows bind mounts **(inferred)**.

2. Create `dev/api.env` (it uses service names because the API runs inside the compose network):

```
LEARNHOUSE_DEVELOPMENT_MODE=true          # turns on /docs Swagger (app.py:146-149), relaxes cookie guard (config.py:389-425)
LEARNHOUSE_DISABLE_EE=1
LEARNHOUSE_TENANCY=single
LEARNHOUSE_AUTH_JWT_SECRET_KEY=<at least 32 random chars>     # config.py:260-275 fails without it
COLLAB_INTERNAL_KEY=<random>
LEARNHOUSE_MFA_ENCRYPTION_KEY=<random>                     # otherwise derived from the JWT secret (services/auth/mfa.py:67)
LEARNHOUSE_SQL_CONNECTION_STRING=postgresql://learnhouse:learnhouse@db:5432/learnhouse
LEARNHOUSE_REDIS_CONNECTION_STRING=redis://redis:6379/0
LEARNHOUSE_PORT=1338
LEARNHOUSE_DOMAIN=localhost:3100
LEARNHOUSE_FRONTEND_DOMAIN=localhost:3100
LEARNHOUSE_SSL=false
LEARNHOUSE_INITIAL_ORG_NAME=Sanar y Criar
LEARNHOUSE_INITIAL_ORG_SLUG=sanarycriar
LEARNHOUSE_INITIAL_ADMIN_EMAIL=<admin email>
LEARNHOUSE_INITIAL_ADMIN_PASSWORD=<strong password>
LEARNHOUSE_SITE_NAME=Sanar y Criar
LEARNHOUSE_EMAIL_PROVIDER=smtp
LEARNHOUSE_SMTP_HOST=mailpit
LEARNHOUSE_SMTP_PORT=1025
LEARNHOUSE_SMTP_USE_TLS=false             # allowed when there is no username (services/email/utils.py:709-739)
LEARNHOUSE_SYSTEM_EMAIL_ADDRESS=no-responder@sanarycriarve.com
LEARNHOUSE_SYSTEM_EMAIL_SENDER_NAME=Sanar y Criar
LEARNHOUSE_CONTENT_DELIVERY_TYPE=filesystem
LEARNHOUSE_IS_AI_ENABLED=false
LEARNHOUSE_HLS_ENABLED=true               # ffmpeg is in the API image (apps/api/Dockerfile:7-8)
LEARNHOUSE_HLS_INPROCESS_WORKER=true
```

3. Start it: `docker compose -f C:/Users/mente/Documents/Psicologa/sanarycriar/dev/docker-compose.yml up -d --build`. The API is then at http://localhost:1338 and Swagger at http://localhost:1338/docs.

4. Run the web app:

```
cd C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse/apps/web
bun install --frozen-lockfile        # bun.lock is the only lockfile; npm or pnpm would re-resolve versions
npx next dev --turbopack -p 3100
```

With `apps/web/.env.local`:

```
NEXT_PUBLIC_LEARNHOUSE_BACKEND_URL=http://localhost:1338/
NEXT_PUBLIC_LEARNHOUSE_API_URL=http://localhost:1338/api/v1/
NEXT_PUBLIC_LEARNHOUSE_DOMAIN=localhost:3100
NEXT_PUBLIC_LEARNHOUSE_DEFAULT_ORG=sanarycriar
NEXT_PUBLIC_LEARNHOUSE_HTTPS=false
NEXT_PUBLIC_COLLAB_URL=ws://localhost:4000
LEARNHOUSE_DISABLE_EE=1
# optional: LEARNHOUSE_GOOGLE_CLIENT_ID / LEARNHOUSE_GOOGLE_CLIENT_SECRET
```

**To check on first run (inferred):** in the browser, settings are read through `getConfig()` (`LH/apps/web/services/config/config.ts:60-70`). It looks at `window.__RUNTIME_CONFIG__` first and then `process.env[key]`. Next.js does not inline dynamic `process.env[key]` lookups, and in dev mode nothing generates `public/runtime-config.js` (that only happens in production, `LH/apps/web/server-wrapper.js:29-46`). If the network tab shows calls going to `http://localhost/api/v1/...`, create `apps/web/public/runtime-config.js` (it is gitignored, `LH/.gitignore:51`) containing `window.__RUNTIME_CONFIG__={...the NEXT_PUBLIC values above...}`.

5. Collab (only for Boards): `cd apps/collab && bun install --frozen-lockfile && npx tsx watch src/index.ts`. Its `.env` holds `COLLAB_PORT=4000`, `LEARNHOUSE_API_URL=http://localhost:1338`, the same JWT secret and `COLLAB_INTERNAL_KEY`, and `LEARNHOUSE_REDIS_URL=redis://localhost:6380`. It reads `.env` via `import 'dotenv/config'` (`LH/apps/collab/src/index.ts:1`).

Variant A2, with everything native: install the official uv, then `uv python install 3.14.7`, then `cd apps/api && uv sync && uv run python app.py`. Use `apps/api/.env` with `localhost:5433`, `localhost:6380` and `localhost:1025`. `load_dotenv()` (`LH/apps/api/config/config.py:225`) finds `apps/api/.env`. For HLS on Windows, set `LEARNHOUSE_FFMPEG_PATH` (ffmpeg is installed through winget).

### 1.4 Path B: the production image, locally

1. Build the image: `docker build -t sanarycriar/learnhouse:dev C:/Users/mente/Documents/Psicologa/sanarycriar/learnhouse`.
   - The root `LH/Dockerfile` has five stages: bun install, Next build, standalone runner, collab build, and a final `python:3.14.7-alpine3.24` image with nginx, pm2, uv 0.10.7, node 24 and bun (`:75-131`). The host needs no bun or uv.
   - Inside, `LH/docker/start.sh:19-27` starts three processes with pm2 (web on 8000, API on 9000 via uvicorn, collab on 4000) plus nginx on port 80.
   - nginx routes `/api/v1` and `/content` to 9000, `/collab` to 4000, and everything else to 8000 (`LH/docker/nginx.conf:31-111`).
2. Generate the deployment files without starting:
   `npx learnhouse@1.5.1 setup --ci --name sanarycriar-local --domain localhost --port 80 --org-name "Sanar y Criar" --org-slug sanarycriar --admin-email <e> --admin-password <p> --no-start`
   This writes `C:/Users/mente/.learnhouse/sanarycriar-local/{docker-compose.yml,.env,extra/nginx.prod.conf,learnhouse.config.json}` (`LH/apps/cli/src/commands/setup.ts:170-280`).
3. Replace `image: ghcr.io/learnhouse/app:...` with `sanarycriar/learnhouse:dev`, then run `docker compose up -d` in that folder. Open http://localhost.
   - The generated db and redis publish no host ports, so there are no conflicts (`LH/apps/cli/src/templates/docker-compose.ts:87-128`).
   - Use port 80. On any other port the CLI adds a socat `ssr-fwd` sidecar so server-side rendering can reach the internal nginx (`docker-compose.ts:69-84`).

### 1.5 Path C: stock `npx learnhouse dev`

This works only after you stop the two menteveneka containers and open-webui (or move them), install bun 1.4.3 and a current standalone uv, and then run `npx learnhouse@1.5.1 dev --admin-email <e> --admin-password <p>` from `LH`. Set `LEARNHOUSE_INITIAL_ORG_NAME` and `LEARNHOUSE_INITIAL_ORG_SLUG` in `apps/api/.env` before the first run. To run the CLI from the repo source instead: `cd apps/cli && npm i && npx tsup`, then from `LH` run `node apps/cli/dist/bin/learnhouse.js dev`. `findProjectRoot` uses the current directory.

### 1.6 Config reference

- **How config loads:** `config.yaml` first, then environment variables override it (`LH/apps/api/config/config.py:222-765`). The full list is documented in `LH/docs/content/self-hosting/configuration/environment-variables.mdx`.
- **Variables the API reads that the docs do not list:**
  - `LEARNHOUSE_HLS_ENABLED`, `LEARNHOUSE_HLS_INPROCESS_WORKER`, `LEARNHOUSE_HLS_CONCURRENCY`, `LEARNHOUSE_HLS_ENCRYPT` (default true, AES-128), `LEARNHOUSE_HLS_FFMPEG_THREADS`, `LEARNHOUSE_HLS_MAX_RETRIES`
  - `LEARNHOUSE_FFMPEG_PATH`, `LEARNHOUSE_FFPROBE_PATH`
  - `LEARNHOUSE_MFA_ENCRYPTION_KEY`
  - `LEARNHOUSE_SECURITY__TRUST_PROXY_HEADERS` (default true)
  - `LEARNHOUSE_S3_API_REGION` (default `auto`)
  - `LEARNHOUSE_AUTH_REFRESH_TOKEN_DAYS`
  - `LEARNHOUSE_NUDGES_ENABLED`
  - `LEARNHOUSE_RESEND_WEBHOOK_SECRET`
  - `LEARNHOUSE_LOG_LEVEL`
  - `LEARNHOUSE_DB_STARTUP_ATTEMPTS`
  - `LEARNHOUSE_DEMO_*`
- **Collab:** `COLLAB_PORT`, `LEARNHOUSE_API_URL`, `LEARNHOUSE_AUTH_JWT_SECRET_KEY`, `COLLAB_INTERNAL_KEY`, `LEARNHOUSE_REDIS_URL`, `COLLAB_TRUST_PROXY`.
- **Web:** the `NEXT_PUBLIC_*` variables above, plus `NEXT_PUBLIC_LEARNHOUSE_MEDIA_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `LEARNHOUSE_GOOGLE_CLIENT_ID` / `_SECRET`, and `NEXT_PUBLIC_POSTHOG_KEY` (telemetry stays off unless it is set, `config.ts:108-110`).

---

## 2. Production self-hosting

### 2.1 What `npx learnhouse setup` generates

- **Wizard steps:** install directory, domain, database and Redis, organization, admin, features (`LH/apps/cli/README.md`; `prompts/domain.ts`, `database.ts`, `organization.ts`, `admin.ts`, `features.ts`).
- **Files** go into `~/.learnhouse/<name>/` (`setup.ts:53-55,553-569`): `docker-compose.yml`, `.env` (mode 0600), `learnhouse.config.json`, and `extra/Caddyfile` (automatic SSL) or `extra/nginx.prod.conf`.
- **Compose services** (`templates/docker-compose.ts:148-176`):
  - `learnhouse-app`, the all-in-one image `ghcr.io/learnhouse/app:<tag>` (`constants.ts:2`). Healthcheck is `/api/v1/health`. Content volume is `learnhouse_content_<id>:/app/api/content`, mounted only when S3 is off (`:130-133`).
  - `db` (`pgvector/pgvector:pg16`) and `redis` (`redis:7.2.3-alpine`), both without host ports.
  - **Caddy** (`caddy:2-alpine`, ports 80 and 443, Let's Encrypt, `templates/caddyfile.ts:3-13`, which does `reverse_proxy learnhouse-app:80`) or **nginx** (`templates/nginx.ts`, 6 GB body limit, WebSocket support, pins `X-Forwarded-Proto` when HTTPS is manual).
- **Generated `.env`** (`templates/env.ts:9-200`): domain and `NEXT_PUBLIC_*` values, `NEXTAUTH_*`, database and Redis strings, `LEARNHOUSE_COOKIE_DOMAIN=.<last two labels>` (`:17-23,82`), random secrets, `LEARNHOUSE_INITIAL_*`, `NEXT_PUBLIC_COLLAB_URL=wss://<domain>/collab`, and the AI, email and S3 blocks.
- **Lifecycle commands:** `start`, `stop`, `logs`, `backup`, `restore`, `doctor`, `env`, `scale` (memory limits). As noted above, `update` is tied to the upstream image.

### 2.2 Which domain

Recommended: **`cursos.sanarycriarve.com`** (A record to the VPS) runs LearnHouse. `sanarycriarve.com` and `www` keep the approved marketing site.
- In single tenancy the instance serves the default org on **any Host header** (`LH/apps/web/proxy.ts:86-89`; `LH/apps/api/src/services/email/utils.py:213-218`). No "custom domain" feature is needed; that feature is multi-tenant and Enterprise/SaaS only (`proxy.ts:91-98`).
- The alternative, LearnHouse at the root with its landing builder replacing the marketing site, is possible (section 5) but throws away the approved design.
- If the DNS is behind Cloudflare's proxy, the free plan caps request bodies at 100 MB **(external fact, not in the repo)**. LearnHouse accepts videos up to 5 GB (`LH/apps/api/src/security/file_validation.py:197-202`). Use DNS-only for `cursos`, or move uploads to S3/R2.

### 2.3 Tenancy, cookies, CORS

- **Tenancy is single** when not explicitly set and there is no EE folder or SaaS flag (`config.py:342-381`). Multi tenancy requires EE or SaaS (`config.py:612-635`). Set `LEARNHOUSE_TENANCY=single` explicitly anyway: the CLI's dotted cookie domain would tip the inference to multi if an `ee/` folder ever appeared (`config.py:351-376`).
- **Cookies are host-only in single mode:** `get_cookie_domain_for_request` returns `None` (`LH/apps/api/src/routers/auth.py:92-109`), and `LEARNHOUSE_COOKIE_DOMAIN` is ignored with a warning (`config.py:636-645`). Remove it from `.env`.
- **CORS in single mode** only allows the hosts in `LEARNHOUSE_FRONTEND_DOMAIN` and `LEARNHOUSE_DOMAIN`, with or without `www.`, plus localhost. `LEARNHOUSE_ALLOWED_ORIGINS` is not used for CORS in single mode (`LH/apps/api/src/core/middleware/cors.py:23-50,113-123`).
- **CSRF** additionally uses `LEARNHOUSE_ALLOWED_ORIGINS` (`LH/apps/api/src/security/csrf.py:92-145`). Requests without auth cookies, and `Bearer lh_*` requests, skip CSRF (`csrf.py:203-262`). That is good for PayPal webhooks and server-to-server calls.
- **Consequence:** if the marketing site at `www.` calls the API from the browser, it is blocked by CORS. Have its Express backend (`referencia/.../artifacts/api-server`) call LearnHouse server-to-server instead.

### 2.4 Required `.env` fixes after `setup`

```
LEARNHOUSE_TENANCY=single
LEARNHOUSE_DOMAIN=cursos.sanarycriarve.com
LEARNHOUSE_FRONTEND_DOMAIN=cursos.sanarycriarve.com   # not emitted; the yaml default is localhost:3000
LEARNHOUSE_SSL=true                                    # not emitted; picks http vs https in emailed links
NEXT_PUBLIC_LEARNHOUSE_HTTPS=true                      # CLI writes "True", but config.ts:85 compares to 'true'
LEARNHOUSE_ALLOWED_ORIGINS=https://cursos.sanarycriarve.com
# remove LEARNHOUSE_COOKIE_DOMAIN
LEARNHOUSE_SITE_NAME=Sanar y Criar
LEARNHOUSE_SYSTEM_EMAIL_SENDER_NAME=Sanar y Criar
LEARNHOUSE_MFA_ENCRYPTION_KEY=<random>
COLLAB_TRUST_PROXY=true
LEARNHOUSE_ENV=production
LEARNHOUSE_HLS_ENABLED=true
LEARNHOUSE_HLS_INPROCESS_WORKER=true
```

Why `FRONTEND_DOMAIN` and `SSL` matter: when there is no trusted Origin header, as with server-to-server calls (PayPal capture handler, Admin API), emailed links fall back to `{http|https}://{frontend_domain}` (`LH/apps/api/src/services/email/utils.py:166-189,491-518`). The Admin API magic link uses the same fallback (`LH/apps/api/src/services/admin/admin.py:1490-1537`). With the defaults, links would point to `http://localhost:3000`.

### 2.5 Shipping the fork

1. Build the root `Dockerfile` in CI (for example GitHub Actions) and push to `ghcr.io/<user>/sanarycriar-lms:<tag>`. The Next build needs more than 2 GB RAM; don't build on a small VPS **(inferred)**.
2. **Add `ffmpeg`** to `LH/Dockerfile:85-86`. The all-in-one image does not include it, while the API-only image does (`apps/api/Dockerfile:7-8`). Without ffmpeg, MP4 "faststart" and HLS are silently skipped (`LH/apps/api/src/services/utils/video_processing.py:1-40`, `hls_transcode.py:97-98`).
3. Point `image:` in the compose file at our image. Upgrade with `docker compose pull && docker compose up -d`, and run migrations with `docker compose exec learnhouse-app sh -c "cd /app/api && uv run alembic upgrade head"`. `/app/api` is the Alembic directory the CLI uses (`update.ts:20-21`). New SQLModel tables are also created at boot by `create_all`.
4. **Never create `apps/api/ee/hooks.py`.** `is_ee_available()` keys on that file (`LH/apps/api/src/core/ee_hooks.py:7-19`) and would start Enterprise license checks (`LH/apps/api/src/core/deployment_mode.py:44-71`). Keep our payments code under `apps/api/src/...`.

### 2.6 Media storage

- **`filesystem` (default)** uses the Docker volume. `npx learnhouse backup` includes it (`LH/docs/content/self-hosting/configuration/storage.mdx`).
- **`s3api`** needs `LEARNHOUSE_CONTENT_DELIVERY_TYPE=s3api`, `LEARNHOUSE_S3_API_BUCKET_NAME`, `LEARNHOUSE_S3_API_ENDPOINT_URL`, and `LEARNHOUSE_S3_API_REGION` (defaults to `auto`, which suits R2). Credentials come from the standard boto3 environment variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (`LH/apps/api/src/services/courses/transfer/storage_utils.py:67-97`).
- The S3 route **streams files through the API** (`StreamingResponse`, `LH/apps/api/src/routers/content_files.py:443,471`), so video bandwidth still goes through the VPS.
- Both storage paths enforce access control; course thumbnails are public (`content_files.py:1-11`, `local_content.py:1-12`).

### 2.7 Email

- `LEARNHOUSE_EMAIL_PROVIDER` is `resend` or `smtp` (`config.py:496-528`).
- SMTP behaviour (`utils.py:662-743`): port 465 uses implicit TLS, other ports use STARTTLS, and it refuses to log in without TLS.
- Used for invitations, password resets, magic links, welcome mail and "joined org" mail. Branding (name, logo, colour, language) is per org (`LH/apps/api/src/services/email/branding.py:1-23`).
- **The "Powered by LearnHouse" email footer is always on in open-source mode** (`branding.py:100-113`). Removing it is a code change.
- Use Resend (verify sanarycriarve.com with SPF/DKIM) or any SMTP provider. Example sender: `no-responder@sanarycriarve.com`.

### 2.8 Minimum VPS

- The docs say 2 GB RAM, 1 CPU and 10 GB disk minimum; 4 GB, 2+ CPUs and 20 GB+ recommended (`LH/docs/content/self-hosting/installation/requirements.mdx`).
- With HLS transcoding (CPU-heavy ffmpeg, one job at a time by default) and local video storage I'd suggest **4 GB RAM, 2–3 vCPU, 80 GB+ SSD**, Ubuntu 24.04, Docker and Node 18+ for the CLI **(inferred sizing)**.

---

## 3. Auth and accounts

| Capability | Where | Notes |
|---|---|---|
| Signup mode open / invite only | `admin_toggles.members.signup_mode` ∈ `open`, `inviteOnly` (`LH/apps/api/src/db/organization_config.py:18,123`), read by `get_org_join_mechanism` (`LH/apps/api/src/services/orgs/orgs.py:1984-2021`) | Set with `PUT /api/v1/orgs/{org_id}/signup_mechanism?signup_mechanism=open\|inviteOnly` (`routers/orgs/orgs.py:436-459`). Invite codes: `POST/GET /orgs/{org_id}/invites`; bulk email invites: `POST /orgs/{org_id}/invites/users/batch` (`orgs.py:1145-1292`). |
| Email + password signup | `POST /api/v1/users/{org_id}` (403 if invite-only), `POST /users/{org_id}/invite/{invite_code}`, `POST /users/` (no org) (`LH/apps/api/src/routers/users.py:194-312`) | Rate-limited per IP |
| Login | `POST /api/v1/auth/login` (form fields `username`=email, `password`), `GET /auth/refresh`, `DELETE /auth/logout`, `POST /auth/login/mfa` (`routers/auth.py:381,573,1247`; `routers/mfa.py:414`) | httpOnly cookies, SameSite=Lax, Secure from `X-Forwarded-Proto` (`auth.py:274-317`) |
| **Magic link (passwordless), open-source** | `POST /api/v1/auth/magic-link/request {email, org_slug}`, then email, then the web page `/auth/magic?token=`, then `POST /auth/magic-link/verify {token}` (`auth.py:1025-1245`) | At most 5 per email per 15 minutes. Always returns a generic 200. |
| Allowed sign-in methods | `allowed_auth_methods` ⊆ {`password`, `magic_login`, `google`, `sso`} (`LH/apps/api/src/security/session_context.py:63-75`), set with `PUT /api/v1/auth/mfa/org-policy/{org_id}` (`routers/mfa.py:618-731`) | Org-wide 2FA policy is in the same place |
| **Google OAuth, open-source (not EE)** | `POST /api/v1/auth/oauth` with `ThirdPartyLogin{provider:"google", access_token, email}` (`auth.py:732-1012`). Web routes `app/api/auth/google/authorize` and `token` read `LEARNHOUSE_GOOGLE_CLIENT_ID/SECRET` (`authorize/route.ts:19-26`); callback path must be `/auth/callback/google`. | The API refuses Google sign-in unless `LEARNHOUSE_GOOGLE_OAUTH_CLIENT_ID` or `LEARNHOUSE_GOOGLE_CLIENT_ID` is set (env docs) |
| SSO (WorkOS / custom OIDC) | Enterprise only (`deployment_mode.py:25-27`; `LH/docs/content/enterprise/sso/*`) | Not available |
| Email verification | **Off in open-source mode**: accounts are set `email_verified=True` (`services/users/users.py:217-225`); verification mail is only sent in SaaS mode (`:346-350`); login only enforces it in SaaS (`auth.py:653`). Endpoints `/auth/verify-email` and `/auth/resend-verification` exist (`auth.py:1315,1433`). | Risk: anyone can register a buyer's email before the buyer does. Mitigate in checkout (see below). |
| Password reset | `POST /api/v1/users/reset_password/send_reset_code {email, org_id}` sends an 8-character code and a link `{base}/reset?email=&resetCode=` (`services/users/password_reset.py:116-240`; `emails.py:511`), valid 1 hour (`password_reset.py:184`). Then `POST /users/reset_password/change_password {email, reset_code, new_password, org_id}`. | 5 tries per 5 minutes per email, 10 sends per 30 minutes per IP (`password_reset.py:67-82`). Members only. |

**Creating users from code (guest checkout).** The Admin API (`LH/apps/api/src/routers/admin.py`, services in `LH/apps/api/src/services/admin/admin.py`) only accepts an org API token (`Authorization: Bearer lh_...`), via `_require_api_token` (`admin.py:75`) and per-right checks (`_require_token_right`, `admin.py:88`).

| Step | Endpoint | Body / rights | Notes |
|---|---|---|---|
| Find buyer | `GET /api/v1/admin/{org_slug}/users/by-email/{email}` (`routers/admin.py:864`) | `users.action_read` | 404 if not a member; throttled |
| Create buyer | `POST /api/v1/admin/{org_slug}/users` (`routers/admin.py:784-834`) | `ProvisionUserRequest` (`:153-162`): `email: EmailStr`, `username: str (1-150)`, `first_name`, `last_name`, `password: Optional[str]`, `role_id: int = 4` (student), `extra_metadata: Optional[dict]`. Needs `users.action_create`. | Email auto-verified, `signup_method="admin_api"`, empty password if omitted. **409 if the email exists anywhere** (`services/admin/admin.py:1286-1293`). 30 per minute per token. Sends a "joined org" email and fires the `user_signed_up` webhook (`:1323-1350`). |
| Grant access | `POST /api/v1/admin/{org_slug}/usergroups/{usergroup_uuid}/members/{user_id}` (`:1146`), `POST /admin/{org_slug}/usergroups/{ug}/courses/{course_uuid}` (`:1374`), `POST /admin/{org_slug}/usergroups` (`:1267`) | `usergroups` rights | A course that is private and linked to a user group is readable **only** by that group's members (`LH/apps/api/src/security/rbac/resource_access.py:901-944`). A private course with no group is readable by **every org member** (`:916-929`). |
| Enroll | `POST /api/v1/admin/{org_slug}/enrollments/{user_id}/{course_uuid}` (`:474-499`); bulk `POST /enrollments/bulk` (`:986`) | `courses.action_update` | Creates the trail and fires `course_enrolled` |
| Instant delivery | `POST /api/v1/admin/{org_slug}/auth/magic-link` (`:905-955`), body `MagicLinkRequest` (`:168-183`): `user_id: int`, `redirect_to: Optional[str]` (same-origin path), `ttl_seconds: 60..900` (default 300), `host: Optional[str]` | `users.action_update` | Returns `{url, token, expires_at}`. Single use. Not allowed for Admin/Maintainer/superadmin targets. The URL is `{base}/auth/magic?token=..&next=..` (`services/admin/admin.py:1474-1486`). In single mode `{base}` = `FRONTEND_DOMAIN` + `SSL`. |
| Alternative | `POST /api/v1/admin/{org_slug}/auth/token {user_id}` (`:382`) issues a JWT | | |

Suggested guest-checkout sequence **(design, inferred)**:
1. Buyer gives email and name. PayPal (later SPIDI) is captured server-side.
2. Look up the buyer by email. If 404, provision them with no password. If 409, a global account exists but is not in the org; handle that case.
3. Add the buyer to the product's user group and enroll them.
4. Redirect the buyer straight to the magic-link `url` with `redirect_to=/course/<uuid>`.
5. Send a "set your password" email, either via `send_reset_password_code` (1-hour link) or by relying on magic-link login for future visits.

Because accounts are auto-verified, grant purchased access only to an account the buyer proved they own: they arrive through our magic link, or the account was created by checkout itself. Our code lives inside the API, so it can also call these service functions directly instead of going over HTTP.

---

## 4. API tokens, public catalog, webhooks

- **Tokens:**
  - Manage at `POST/GET/PUT/DELETE /api/v1/orgs/{org_id}/api-tokens[/{token_uuid}]` and `POST .../regenerate` (`LH/apps/api/src/routers/api_tokens.py:28-187`). The model (`LH/apps/api/src/db/api_tokens.py:41-88`) has `name`, `description`, `rights: Rights`, `expires_at`. The full `lh_...` token is shown only once.
  - The router is plan-gated `require_plan("pro","API Access")` (`LH/apps/api/src/router.py:112-117`), but in open-source mode `_check_mode_bypass` lets it through, since only `sso`, `audit_logs`, `payments`, `analytics_advanced` and `scorm` are blocked (`LH/apps/api/src/security/features_utils/plan_check.py:18-40`; web side `LH/apps/web/services/plans/plans.ts:26-55`).
  - Dashboard: `/dash/developers/api`.
- **Public endpoints for the marketing site (anonymous, no token):**
  - `GET /api/v1/courses/org_slug/{org_slug}/page/{page}/limit/{limit}` (limit capped at 100; `LH/apps/api/src/routers/courses/courses.py:472-501`). **Anonymous callers only see `public && published` courses** (`LH/apps/api/src/services/courses/courses.py:347-349`), served from a Redis cache (`:294-300`).
  - `GET .../org_slug/{org_slug}/count` (`:504`) and `GET .../org_slug/{org_slug}/search?query=&page=&limit<=50` (`:527-560`).
  - `GET /api/v1/courses/{course_uuid}` (`:372`) and `GET /api/v1/courses/{course_uuid}/meta` (`FullCourseRead` with chapters and activities; `:422`), both subject to access checks.
  - Response fields (`CourseRead`, `LH/apps/api/src/db/courses/courses.py:51-63,110-121`): `id`, `org_id`, `course_uuid`, `name`, `description`, `about`, `learnings`, `tags`, `thumbnail_type`, `thumbnail_image` (a file name), `thumbnail_video`, `public`, `published`, `open_to_contributors`, `authors`, `creation_date`, `update_date`, `seo`, `extra_metadata` (JSON).
  - **There is no price field** in open-source; offers are Enterprise. `extra_metadata` can be set through `PUT /api/v1/courses/{uuid}` (`CourseUpdate`, `:94-107`) and is returned to anonymous callers, so only store non-secret data there, such as a price.
  - Thumbnail URL: `{backend}/content/orgs/{org_uuid}/courses/{course_uuid}/thumbnails/{thumbnail_image}` (`LH/apps/web/services/media/media.ts:121-128`). It is public. `org_uuid` comes from `GET /api/v1/orgs/slug/{org_slug}` (`routers/orgs/orgs.py:1316`). The orgs router **rejects API tokens** (`router.py:94-99`), so call that one anonymously.
  - Course page link in single mode: `https://cursos.sanarycriarve.com/course/{uuid without "course_"}`.
- **With an org API token** (needs `courses.action_read`): the same list endpoint returns all **published** courses, including private ones, and unpublished ones with `include_unpublished=true` (`services/courses/courses.py:267-276,310-352`).
- **This affects the payments design:** "public" means anyone can read the content (`resource_access.py:299-317`). Paid courses must be private and user-group-gated, which hides them from the anonymous catalog. Either the marketing backend lists them with a server-side token, or the fork adds its own public storefront endpoint.
- **Iframes:** `X-Frame-Options: DENY` is set everywhere except `/embed/:orgslug/course/:courseuuid/activity/*`, which allows `frame-ancestors *` (`LH/apps/web/next.config.js:76-99`). That route can embed a free preview video on the marketing site.
- **Outgoing webhooks:**
  - Endpoints: `GET /api/v1/orgs/{org_id}/webhooks/events`, CRUD at `/orgs/{org_id}/webhooks`, plus `/regenerate-secret`, `/test` and `/deliveries` (`LH/apps/api/src/routers/webhooks.py:53-250`). These need a logged-in user session; API tokens are not accepted (`router.py:118-123`). Body `WebhookEndpointCreate{url, description?, events: List[str]}` (`LH/apps/api/src/db/webhooks.py:81-84`). Dashboard: `/dash/developers/automations`.
  - Token-based subscription is possible through the Zapier REST hooks: `POST/GET/DELETE /api/v1/integrations/zapier/subscriptions` (`LH/apps/api/src/routers/integrations/zapier.py:340-456`).
  - Payload `{event, delivery_id, timestamp, org_id, data}` with headers `X-Webhook-Event`, `X-Webhook-Delivery`, and `X-Webhook-Signature: sha256=<HMAC-SHA256(body, secret)>` (`LH/apps/api/src/services/webhooks/dispatch.py:276-299`; `crypto.py:38-46`).
  - URLs must be https and public: private IPs are blocked (`LH/apps/api/src/services/webhooks/webhooks.py:46-75`). Use a tunnel when testing locally.
  - The 42 events (`LH/apps/api/src/services/webhooks/events.py:28-424`):
    - System: `ping`
    - Learning progress: `course_completed`, `course_enrolled`, `activity_completed`, `assignment_submitted`, `assignment_graded`, `certificate_claimed`, `certificate_revoked`
    - Users and access: `user_signed_up`, `user_email_verified`, `user_role_changed`, `user_invited_to_org`, `user_removed_from_org`
    - Course lifecycle: `course_created`, `course_published`, `course_deleted`, `course_update_published`
    - Content: `activity_version_created`, `activity_version_restored`, `course_contributor_added`, `course_contributor_removed`, `folder_created`, `folder_updated`, `folder_deleted`, `podcast_episode_created`
    - Collaboration: `board_created`, `board_member_added`, `playground_created`
    - Community: `discussion_posted`, `comment_created`, `discussion_pinned`, `discussion_locked`, `discussion_vote_cast`
    - Groups: `usergroup_created`, `usergroup_deleted`, `usergroup_users_added`, `usergroup_resources_added`
    - Packs: `pack_activated`, `pack_deactivated`
    - Org: `org_signup_method_changed`, `org_ai_config_changed`, `org_payments_config_changed`
  - **There are no purchase events.** Our module would add them to this registry.

---

## 5. Branding and theming

### 5.1 Configurable without code (Dashboard, Organization)

- **General** (`components/Dashboard/Pages/Org/OrgEditGeneral/OrgEditGeneral.tsx`): name, description, about, footer text, email sender name, **default language**.
- **Branding**:
  - Logos tab: logo, square logo, favicon, thumbnail, preview (`PUT /orgs/{org_id}/logo|square_logo|favicon|thumbnail|preview`, `orgs.py:1338-1457`).
  - Theme tab: **one primary colour** and **one Google font** (`ThemeTab.tsx:31-128`; `PUT /orgs/{org_id}/config/color` and `/config/font`, `orgs.py:703-753`).
  - Auth tab: login page welcome text and background (`orgs.py:867,1058`).
  - Social and Previews tabs.
- **Menu** (`/config/menu`), **Course-end screen**, **SEO** (`/config/seo`, OG image), **watermark toggle** (`/config/watermark`; in open-source mode the toggle is respected, `LH/apps/web/components/Objects/Watermark.tsx:19-24` and `app/orgs/[orgslug]/(withmenu)/layout.tsx:33-35`).
- **Landing builder** (`/dash/org/settings/landing`, not plan-gated, `app/orgs/[orgslug]/dash/org/settings/[subpage]/page.tsx:51-61`):
  - 21 section types (`components/Dashboard/Pages/Org/OrgEditLanding/landing_types.ts:296-300`): hero, text-and-image, logos, people, featured-courses, video, rich-text, features, stats, testimonials, faq, cta, gallery, spacer, pricing, steps, columns, image, embed, banner, countdown.
  - Each section can set background (solid, gradient or image), text colour, spacing, anchor, animation, visibility, device and schedule (`:4-37`). Buttons can set colour and background (`:57-62`). The page can set background, width and gap (`:302-307`).
  - Templates and JSON import (`landingTemplates.ts`, `landingImport.ts`). Saved with `PUT /orgs/{org_id}/landing` (`orgs.py:1586`).
  - Rendered by `components/Landings/LandingCustom.tsx` when `landing.enabled` (`app/orgs/[orgslug]/(withmenu)/home-client.tsx:16-17,56-60`).
- **Where the org colour and font are applied:** the menu colour (`components/Objects/Menus/OrgMenu.tsx:87-90`), a 5% tinted page background, and the inline font on the org layout (`(withmenu)/layout.tsx:60-61,68-100,114-118`). Poppins is in the curated list (`LH/apps/web/lib/fonts.ts:27`). Playfair Display can be found in the full catalog search, but **only one font applies site-wide**.

### 5.2 What needs code (Tailwind v4 is configured in CSS; there is no `tailwind.config.*`; `LH/apps/web/postcss.config.js` uses `@tailwindcss/postcss`)

- **Fonts:** in `LH/apps/web/app/layout.tsx:4-10,42`, replace `Wix_Madefor_Text` (variable `--font-default`) with `Poppins` (weights 400–700) on the same variable, and add `Playfair_Display` as `--font-heading`. Change `lang="en"` on line 43 to `"es"`. The body already uses `var(--font-default)` (`LH/apps/web/styles/globals.css:254,471`). Add a rule `h1,h2,h3,.font-heading{font-family:var(--font-heading),Georgia,serif}` and, inside `@theme`, `--font-display: var(--font-heading), Georgia, serif`. Leave the org font setting empty, because its inline style would override this (`layout.tsx:117`).
- **Colours:** in `globals.css:384-410` (`:root`, shadcn-style "H S% L%" values), copy the Replit site's approved tokens (`referencia/.../artifacts/psico-infantil/src/index.css:312-331`):
  - `--background: 28 79% 96%` (#FDF5EE) and `--foreground`/`--primary: 264 70% 12%` (#190933)
  - `--primary-foreground: 28 79% 96%`
  - `--secondary: 240 100% 87%` (#BBBBFF)
  - `--accent: 322 67% 82%` (#F0B4DF)
  - `--border`/`--input: 260 42% 85%`, `--muted-foreground: 261 16% 33%`, `--ring: 264 70% 12%`
  - Also review `.dark` (`:438-462`). Optionally add raw brand colours in `@theme` (`:161-207`), for example `--color-violet-brand:#190933`. Many components hard-code `bg-white`, `bg-gray-*` and `text-gray-*`, so full coverage means editing component files one by one.
- **Card radius 20px:** the `@theme` block maps `rounded-lg` to `var(--radius)` (`:162`), which is used 1,366 times, so changing `--radius` would also round inputs and menus. Cards use `rounded-xl` (`components/Objects/Thumbnails/CourseThumbnail.tsx:158`, `CourseThumbnailLanding.tsx:142`, `Landings/LandingCustom.tsx:90,169,184,326,418`, `LandingBlocks.tsx:77`). Adding `--radius-xl: 1.25rem` to `@theme` sets all 620 `rounded-xl` uses to 20px, or edit only those card files.
- **Pill buttons:**
  - `components/ui/button.tsx:8,25-26`: change `rounded-md` to `rounded-full`.
  - Landing buttons: `LandingCustom.tsx:148` (and about line 186) and `LandingBlocks.tsx:171` (and about lines 225 and 291): change `rounded-lg` to `rounded-full`.
  - Many other buttons are written by hand; grep for `<button`/`<Link` together with `rounded-*`.
- **"LearnHouse" names to replace:**
  - `es.json` contains "LearnHouse" 19 times.
  - Email strings (`LH/apps/api/src/services/email/translations.py`, for example `"account_creation.subject": "¡Bienvenido a LearnHouse..."`).
  - Footer and watermark logos (`/lrn.svg`, `/lrn-text.svg`).
  - The email "Powered by" footer is forced in open-source mode (`branding.py:111-113`).
  - Default `public/favicon.ico`.

---

## 6. i18n

- **Library:** i18next with `i18next-browser-languagedetector` (`LH/apps/web/lib/i18n.ts:51-71`). English is bundled; the other 21 locales load lazily (`:9-31`). `fallbackLng: 'en'` (`:56`), so missing Spanish keys show in English.
- **How the language is chosen:**
  1. Detection order is `localStorage(i18nextLng)`, then cookie `i18next`, then `?lng=`, then the browser language, then path, then subdomain (`:62-67`). `public/dir-init.js` repeats this to set `<html lang/dir>` before the page paints.
  2. Then `OrgLanguageSync` (`LH/apps/web/components/Contexts/OrgLanguageSync.tsx:9-28`, mounted in `app/orgs/[orgslug]/layout.tsx`, `app/auth/layout.tsx` and `app/embed/[orgslug]/layout.tsx`) switches to the **org default** `customization.general.default_language`, unless the user picked a language with `LanguageSwitcher`. That sets `localStorage['i18nextLng_userPicked']` (`components/Utils/LanguageSwitcher.tsx:46`), which is shown in `components/Auth/AuthLayout.tsx` and `components/Security/HeaderProfileBox.tsx:171`.
  3. There is **no per-user language stored in the database** (`LH/apps/api/src/db/users.py` has no language field).
- **How complete Spanish is** (script counted the keys in `LH/apps/web/locales/en.json` and `es.json`):

| Metric | Count |
|---|---|
| Keys in en.json | 5,224 |
| Keys in es.json | 4,473 |
| **Missing in es** | **754 (14.4%)** |
| Extra in es (not in en) | 3 |
| Identical to English | 302 (partly legitimate, e.g. "Podcast") |

  - Missing keys by area: dashboard 515 (of which `dashboard.organization` is 371), user 59, editor 43, billing 26, auth 22, assignments 22, mfa 11, library 11, landing 8, common 8, activities 7, payments 5, boards 5, communities 4, courses 3, course 3, validation 2.
  - **196 missing keys are outside the dashboard and editor**, for example `auth.magic_*`, `auth.mfa_*`, `common.continue`, `common.sign_out`, `landing.pricing.*`, `user.settings.*`.
  - Emails (`LH/apps/api/src/services/email/translations.py`): Spanish has 44 of 61 keys. Missing: `account_deleted.*`, `email_changed.*`, `org_created.*`, `org_deleted.*`, which fall back to English.
- **Making Spanish the default:**
  - **No code:** Dashboard → Organization → General → Default language = Español (`OrgEditGeneral.tsx:104-107,129,286`), or `PUT /api/v1/orgs/{org_id}/config/default_language?default_language=es` (`routers/orgs/orgs.py:813-837`, validated against `SUPPORTED_UI_LANGUAGES` in `services/orgs/orgs.py:1637-1675`). This also makes org emails Spanish (`branding.py:12,162-168`).
  - **Code (to force Spanish for everyone and avoid an English flash on first visit):**
    - `lib/i18n.ts`: set `lng:'es'`, or drop `navigator` from the detection order and use `fallbackLng:['es','en']`.
    - Remove the `LanguageSwitcher` uses listed above.
    - `public/dir-init.js`: default to `es`. `app/layout.tsx:43`: `lang="es"`.
    - API defaults: `organization_config.py:227` (`default_language: str = "en"`) and `translations.py` `DEFAULT_LANGUAGE = "en"`, used for mail that is not tied to an org.
    - Then translate the 754 missing keys, learner-facing first.

---

## To check on first run
1. Whether the browser picks up `NEXT_PUBLIC_*` values in `next dev` without `public/runtime-config.js` (section 1.3).
2. Whether all API dependencies install on Windows Python 3.14.7 (only matters for the native-API variant).
3. That `npx learnhouse@1.5.1` exists on npm and matches `apps/cli` (`constants.ts:1`).
4. How the course page behaves for a logged-out visitor on a private, user-group-gated course. This decides what the storefront and "preview" UX should be.

---

# VERIFICACIÓN INDEPENDIENTE

## Confirmed

- **Dev CLI (`apps/cli/src/commands/dev.ts`).** The compose file hard-codes `127.0.0.1:5432` and `127.0.0.1:6379` (`:22-23,37-38`). It uses `pgvector/pgvector:pg16` and `redis:8.6.1-alpine`. `bun install` runs at `:345-354` and `uv sync` at `:356-363`. The processes start at `:370-380`, and `serviceEnv` is set at `:308-316`. `isContainerRunning` uses single quotes through cmd.exe (`:125-135`). `env-check.ts` writes only the variables the report lists. The CLI version is 1.5.1 (`constants.ts:1`), and `learnhouse@1.5.1` exists on npm (published 2026-06-22), so check #3 is settled.
- **This machine.** Python 3.14.3; uv 0.11.19 from hermes, which lists CPython only up to 3.14.5; no bun. `menteveneka_postgres` holds 5432, `menteveneka_redis` holds 6379, `open-webui` holds 3000. Ports 80, 443, 1338, 3100, 4000, 5433, 6380, 1025, 8025, 8080 and 9000 are free. `pyproject.toml:5` pins `>=3.14.7,<3.14.8`.
- **Dockerfiles.** The root `Dockerfile` has five stages, and its runner stage installs no ffmpeg (`:85-86`). The API `Dockerfile` installs ffmpeg (`:7-8`). `start.sh:19-27` and the nginx routing match the report. No `watchfiles` is in `uv.lock`, so `--reload` would use StatReload polling.
- **CLI `.env` template (`templates/env.ts`).** It emits `NEXT_PUBLIC_LEARNHOUSE_HTTPS=True` (`:50`), while web compares to `'true'` (`config.ts:85`). It never emits `LEARNHOUSE_SSL`, `LEARNHOUSE_FRONTEND_DOMAIN` or `LEARNHOUSE_TENANCY`. The cookie domain comes from `:17-23,82`. `update.ts` always rewrites the image to `ghcr.io/learnhouse/app` (`:23` plus `replaceComposeImageTag`).
- **Tenancy, cookies, CORS, CSRF.**
  - `get_cookie_domain_for_request` returns `None` in single mode.
  - The cookie-domain warning is at `config.py:636-645`.
  - The single-mode CORS regex is built from `frontend_domain` and `domain` plus localhost (`cors.py:26-56,99-100`).
  - CSRF exempts `Bearer lh_*` and requests with no auth cookie (`csrf.py:212-262`).
- **Admin API.**
  - Endpoints and line numbers match. `ProvisionUserRequest` is at `routers/admin.py:153-162`, and its defaults are right: `role_id=4`, password optional.
  - The 409 is at `services/admin/admin.py:1286-1293`. Provisioning is rate-limited to 30 per minute.
  - `MagicLinkRequest` has `ttl_seconds` 60–900, default 300. The link URL is `{base}/auth/magic?token=&next=`, and Admin, Maintainer and superadmin targets are refused.
  - With no trusted Origin, the base URL falls back to `{ssl?https:http}://{frontend_domain}` (`email/utils.py:491-518`).
- **Access rules.** Rules 1–5 in `resource_access.py:299-401`: a private course linked to a user group is readable only by that group's members (and authors and admins). A private course with no group is readable by every org member. Enrolling (creating a TrailRun) grants no read access.
- **Email verification** is automatic outside SaaS (`services/users/users.py:217-226`), and login enforces it only in SaaS (`auth.py:653`).
- **Magic link and Google sign-in.** The magic-link request body is `{email, org_slug?}`, with a limit of 5 per email per 15 minutes. Google sign-in is refused when there is no client ID (`services/auth/utils.py:59-72`).
- **Webhooks.** There are 42 events. The payload, headers and `sha256=` HMAC match the report. The webhooks router and the API-tokens router are session-only (`router.py:112-123`), and the orgs router rejects API tokens (`:94-99`).
- **Translations.** en has 5,224 keys and es has 4,473. 754 are missing: dashboard 515 (`dashboard.organization` 371), editor 43, so 196 are elsewhere. es has 3 extra keys. "LearnHouse" appears 19 times in `es.json`. Spanish email keys are 44 of 61, with the four missing groups the report names.
- **Branding.** The "Powered by" email footer is forced on in OSS (`branding.py:100-113`). In OSS the web watermark follows the org toggle, because `usePlan()` returns `'oss'`.
- **Other.** Collab is used only by `BoardCanvas.tsx`. The landing builder has 21 section types and no plan gate. The Replit tokens at `index.css:312-331` match. The S3 route streams through the API (`content_files.py:443,471`).

## Corrections

1. **`runtime-config.js` is generated in dev; the "check on first run #1" is unnecessary.**
   - `apps/web/next.config.js:203-221` writes `public/runtime-config.js` from every `NEXT_PUBLIC_*` value whenever `NODE_ENV === 'development'`.
   - `app/layout.tsx:54` loads it synchronously.
   - Next loads `.env.local` before `next.config.js`, so Path A's values do reach the browser. Writing that file by hand is not needed and would be overwritten.
2. **The manual migration step in §2.5 is incomplete and can fail.**
   - On first boot the database is built by `create_all` and never stamped with Alembic.
   - Running `alembic upgrade head` on it replays every migration and fails with "already exists".
   - The CLI first runs `stamp heads` on the old image (`ensureAlembicBaseline`, `apps/cli/src/commands/update-ee.ts:124-140`). It then upgrades before the new image boots (`migrateBeforeBoot`, `:219-241`), using `upgrade heads` (plural).
   - Our own upgrade script must copy this: back up, stamp, then `upgrade heads`. Also, `create_all` only creates new tables. New columns on existing tables need an Alembic revision.
3. **`LEARNHOUSE_FFMPEG_PATH` does not affect HLS or faststart.**
   - It is read only in `src/services/ai/captions.py:55,59`.
   - HLS and faststart find ffmpeg with `shutil.which("ffmpeg")` (`hls_transcode.py:97-102`, `video_processing.py:38`), so ffmpeg must be on PATH.
   - On this PC it already is: winget `Gyan.FFmpeg` 8.1.1.
4. **The Admin API enrol endpoint does not fire the `course_enrolled` webhook.** `enroll_user` (`services/admin/admin.py:452-524`) only calls the analytics `track(...)`; it never calls `dispatch_webhooks`. Membership changes do fire webhooks (`add_usergroup_member` at `:2137`).
5. **Webhook URLs are not https-only.** `_validate_webhook_url` accepts `http` as well (`services/webhooks/webhooks.py:49-53`); only private or reserved IPs are blocked.
6. **The tenancy reasoning in §2.3 is moot.** `config.yaml:20` already pins `tenancy: single`, so the inference branch never runs unless the YAML is edited. Setting the env var does no harm.
7. **"Paid courses must be private and user-group-gated" is one option, not a requirement.**
   - The open-source code has a per-activity paywall hook. `check_ee_activity_paid_access` (`src/core/ee_hooks.py:80-89`) returns `True` without EE.
   - The reader gate calls it (`services/courses/activities/access.py` around 141-154). It returns HTTP 402 or replaces the content with `{"paid_access": false}`, and it covers files under `/content` and `/stream`, including HLS segments (`local_content.py` around 175-187).
   - A fork can make this return a real purchase check without creating `ee/hooks.py`. Courses can then stay public, with a visible outline and free preview lessons, while paid lessons stay locked.
8. **Smaller fixes.**
   - `constants.ts:2` is `APP_IMAGE = 'ghcr.io/learnhouse/app:latest'`, not `:<tag>`.
   - The `ssr-fwd` sidecar is added only when `!autoSsl && !useHttps && httpPort !== 80` (`docker-compose.ts:69`).
   - In the image, the API runs as `pm2 start uv -- run app.py`, which calls `uvicorn.run`; it is not a direct uvicorn command.
   - Magic-link request can also return 429 from the IP limit (`auth.py` around 1050).
   - `LEARNHOUSE_ENV=production` has no effect: it is read only at `config.py:250`.
   - The Swagger description of `POST /admin/{org}/users` says an existing user is attached (idempotent). The code returns 409 (`services/admin/admin.py:1286-1293`), so trust the code.

## Additions

1. **Emailed logos will break in production without a backend media URL.**
   - `get_media_base_url` (`services/email/utils.py:337-371`) uses `LEARNHOUSE_MEDIA_URL` or `LEARNHOUSE_BACKEND_URL` if set. Otherwise, with a real `LEARNHOUSE_DOMAIN`, it builds `https://api.{domain}`, which would be `https://api.cursos.sanarycriarve.com`, a host that does not exist.
   - Neither variable is in the CLI `.env` or the docs. Add `LEARNHOUSE_MEDIA_URL=https://cursos.sanarycriarve.com`.
2. **Why the Admin API works in OSS.**
   - `_resolve_org_slug` checks `plan_meets_requirement(plan, "pro")` directly (`services/admin/admin.py:126-132`), and the org's stored plan is `"free"`.
   - It still passes because OSS mode returns `required != 'enterprise'` (`security/features_utils/plans.py:336-345`).
   - In OSS, feature limits such as members and courses are unlimited (`features_utils/resolve.py:149-153`).
3. **`payments` is blocked in OSS on both sides.**
   - Backend: `EE_ONLY_FEATURES` in `core/deployment_mode.py:25-27`. Web: `OSS_BLOCKED_FEATURES` in `services/plans/plans.ts:25`.
   - Our own routes must not use `require_plan(..., "Payments")`, which would return 403, and the existing web payments UI is hidden in OSS through `isFeatureAvailable('payments')`.
4. **The browser session is set only through the web app.** `set_auth_cookies` (`routers/auth.py:274-310`) says only `apps/web/app/api/auth/[...path]` creates a session the client recognises. The internal nginx routes `/api/auth` to the web app (`docker/nginx.conf:55`). So checkout must sign the buyer in by sending them to `/auth/magic?token=…&next=…`, as the report's design does, not by setting cookies from an API redirect.
5. **The headless `/api/v1/usergroups` router accepts API tokens** (`router.py:74-90`), with a plan gate that OSS bypasses. It is an alternative to the Admin API's user-group endpoints.
6. **There are three more language pickers to remove or force to Spanish:** `components/Dashboard/Menus/DashLeftMenu.tsx:1075`, `DashMobileMenu.tsx:251` and `app/home/home.tsx:158`. They call `changeLanguage` directly, which is cached in `i18nextLng`.
7. **Option for the CORS limit (inferred).** The single-mode CORS regex accepts both `frontend_domain` and `domain` (`cors.py:36-46`). Setting `LEARNHOUSE_DOMAIN=sanarycriarve.com` with `LEARNHOUSE_FRONTEND_DOMAIN=cursos.sanarycriarve.com` would let `(www.)sanarycriarve.com` read the anonymous course catalog from the browser. Check the side effects first: `get_media_base_url` and `_is_allowed_base_url` both read `domain`.
8. **Two body-size limits.** Non-multipart request bodies are capped at 25 MB (`LEARNHOUSE_MAX_REQUEST_BODY_MB`, `config.py:322`; `core/middleware/body_size.py`). Multipart uploads are exempt, so the 5 GB video limit still holds.