## Defects found and fixed

1. **Open redirect on www (security). Confirmed against Caddy 2.11.7.**
   - The trailing-slash rule sent back a relative `Location` built from the request path. So `https://www.sanarycriarve.com/%5Cevil.com/` answered `301 Location: /\evil.com`, which browsers treat as `//evil.com`.
   - The same rule also dropped the query string (`/agenda/?utm=1` went to `/agenda`).
   - Fix in `C:/Users/mente/Documents/Psicologa/sanarycriar/deploy/caddy/Caddyfile`: absolute targets that keep the query.
     ```
     redir @barra_final https://www.sanarycriarve.com{re.barra.1}{?query} permanent
     redir /ebooks https://www.sanarycriarve.com/cursos{?query} permanent
     ```
   - Rechecked: `/%5Cevil.com/` now goes to `https://www.sanarycriarve.com/\evil.com` (same site), and `/agenda/?utm=1&b=2` goes to `https://www.sanarycriarve.com/agenda?utm=1&b=2`.
2. **The documented rollback after a migration did not work.**
   - Running `actualizar.sh <old tag>` fails at `alembic upgrade heads` ("Can't locate revision"), as it should. But it left the old tag in `.env` (`SC_LMS_TAG`), so a later `docker compose up -d` would boot an unmigrated image. A failed `pull` left `.env` the same way.
   - The guide's next step, `restaurar.sh`, then started the new image on the old schema. That image's `create_all` builds the new tables, which breaks the next real migration with "already exists".
   - Fixes:
     - `deploy/scripts/actualizar.sh`: a new `fallar_y_revertir` puts the previous tag back if the pull or the migrations fail.
     - `deploy/scripts/restaurar.sh`: new `--version=TAG` option, validated and written to `SC_LMS_TAG` before the platform starts.
     - `docs/despliegue.md` §10 and the script header comments now give the right sequence. They say to restore the `_db` copy taken when you upgraded, not the newest one, and that anything recorded after that copy is lost.
3. **Wrong licence section.** `docs/despliegue.md` §2 cited "AGPL sección 11"; the network clause is section 13. Corrected.
4. **Smoke test.** `deploy/local-smoke/smoke.sh` has two new checks: the query string is kept, and `/%5Cevil.com/` stays on the domain.
5. **Progress log.** The "Review" section is appended to `C:/Users/mente/Documents/Psicologa/sanarycriar/docs/progreso/despliegue.md`.

## Defects found but not fixed
- **`/registro/` on psicoinfantilve.com (with trailing slash) ends in a 404 on www.** It falls through to the generic redirect. Suggested fix: `redir /registro* https://cursos.sanarycriarve.com/signup permanent`. Left as is because it is a low-value cosmetic case.
- **The cron `backups/backup.log` is never rotated.** It grows by a few lines per day. Suggested fix: a logrotate entry or `tail -n 1000` in cron. Minor.

## Verification
- **Smoke test.** `bash deploy/local-smoke/smoke.sh` (run with `--conservar` so the rollback test could reuse the stack) gave "Resultado: 60 OK, 0 fallas", SMOKE_EXIT=0.
- **Rollback test.** Script at `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/review-despliegue/rollback-test.sh`. It uses a throwaway image, `sanarycriar/lms:smoke-nueva` (= `lms:local` plus one migration that creates a table).

  | Step | Command | Result |
  |---|---|---|
  | A | `actualizar.sh smoke-nueva` | EXIT 0, revision `sc0000000001` |
  | B | `actualizar.sh local` | EXIT 1 with "Can't locate revision"; `.env` tag went back to `smoke-nueva`; health still 200 |
  | C | `restaurar.sh <pre-upgrade _db> --solo-db --si --version=local` | EXIT 0; image `lms:local`, revision `7b5dee2850d6`, the new table is gone, health 200 |
  | D | `actualizar.sh smoke-nueva` again | EXIT 0 |

  After teardown, 0 `sanarycriar-smoke_*` volumes or containers remain, the `sanarycriar-dev_*` volumes are untouched, and the throwaway image is removed.
- **Caddy:** `caddy validate` gives "Valid configuration".
- **Compose:** `docker compose -f docker-compose.prod.yml --env-file .env.example config --quiet` OK.
- **Scripts:** `koalaman/shellcheck:stable -x` is clean on all 6 scripts, `bash -n` OK, and there are no CRLF line endings anywhere in `deploy/`.
- **Checked by reading, no changes needed:**
  - Every `LEARNHOUSE_*` and `NEXT_PUBLIC_*` variable in `.env.example` is read by the code.
  - The 7 PayPal webhook events in the guide match `providers/paypal.py`.
  - `X-Forwarded-For` cannot be spoofed: Caddy replaces it, and the API takes the right-most non-private hop.
  - `apps/api/content/__init__.py` is tracked in git, so the Dockerfile's `find` will not fail in CI.
  - Tag pushes run the CI workflow regardless of its `paths-ignore`.
  - The site CSP fits `web/dist`: it has no third-party scripts, forms or iframes.
  - `NEXT_PUBLIC_LEARNHOUSE_TOP_DOMAIN=cursos.sanarycriarve.com` narrows the allowed redirect targets and the cookie scope to cursos only.

## Needed from others
- Unchanged from the implementer's list:
  - The owner creates the public fork repo, pushes branch `sanarycriar`, tags `sc-v1.0.0`, and makes the GHCR package public.
  - The brand agent's `configurar-organizacion.py` is run after the first deploy.
  - Optionally, a `learnhouse/.gitattributes` with `*.sh text eol=lf`.
- **Whoever owns `docs/desarrollo-local.md`:** optionally mention the new `restaurar.sh --version=TAG` option next to the smoke-test note.