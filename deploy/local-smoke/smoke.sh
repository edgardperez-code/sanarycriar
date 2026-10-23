#!/usr/bin/env bash
# shellcheck disable=SC2016 # bash -c snippets receive their values as "$1" on purpose
# Prueba local del kit de producción, de punta a punta, sin tocar nada real.
#
# Levanta docker-compose.prod.yml + local-smoke/docker-compose.smoke.yml como el
# proyecto "sanarycriar-smoke" (volúmenes propios), con la imagen construida en
# esta máquina (sanarycriar/lms:local), Caddy con certificados locales
# (local_certs) en 127.0.0.1:80/443 y el sitio de web/dist. Luego:
#   1. primer despliegue con scripts/actualizar.sh (incluye el "stamp" de Alembic)
#   2. comprobaciones HTTP (salud, home de la plataforma, sitio, redirecciones, CORS, cabeceras)
#   3. scripts/backup.sh, actualizar.sh otra vez (camino de actualización) y restaurar.sh
#   4. down -v del proyecto de prueba (salvo --conservar)
#
# Uso:  deploy/local-smoke/smoke.sh [--conservar]
#   docker build -t sanarycriar/lms:local learnhouse   (antes, una vez)
# Variables: SC_SMOKE_HTTP / SC_SMOKE_HTTPS (por defecto 127.0.0.1:80 / 127.0.0.1:443),
# SC_SMOKE_DIR (carpeta temporal; por defecto una nueva en /tmp o %TEMP%).

set -Eeuo pipefail

conservar=false
[[ "${1:-}" == "--conservar" ]] && conservar=true

aqui="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deploy="$(cd "$aqui/.." && pwd)"
web="$(cd "$deploy/../web" && pwd)"
ruta() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
# Git Bash on Windows: pass container paths (/app/...) to docker untouched.
export MSYS_NO_PATHCONV=1

export COMPOSE_PROJECT_NAME=sanarycriar-smoke
export SC_DIR; SC_DIR="$(ruta "$deploy")"
export SC_COMPOSE_OVERRIDE; SC_COMPOSE_OVERRIDE="$(ruta "$aqui/docker-compose.smoke.yml")"
tmp="${SC_SMOKE_DIR:-$(mktemp -d)}"
mkdir -p "$tmp"
tmp="$(ruta "$tmp")"
export SC_ENV_FILE="$tmp/smoke.env"
export SC_SMOKE_HTTP="${SC_SMOKE_HTTP:-127.0.0.1:80}"
export SC_SMOKE_HTTPS="${SC_SMOKE_HTTPS:-127.0.0.1:443}"
puerto_https="${SC_SMOKE_HTTPS##*:}"
puerto_http="${SC_SMOKE_HTTP##*:}"

# shellcheck source=deploy/scripts/_comun.sh
source "$deploy/scripts/_comun.sh"

docker image inspect sanarycriar/lms:local >/dev/null 2>&1 ||
  fallar "Falta la imagen sanarycriar/lms:local (docker build -t sanarycriar/lms:local learnhouse)."
[[ -f "$web/dist/index.html" ]] || fallar "Falta web/dist (cd web && npm run build)."

desmontar() {
  if $conservar; then
    aviso "Se conserva el proyecto $COMPOSE_PROJECT_NAME (carpeta $tmp). Para borrarlo:"
    aviso "  COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME docker compose -f $SC_DIR/docker-compose.prod.yml -f $SC_COMPOSE_OVERRIDE --env-file $SC_ENV_FILE down -v"
  else
    info "Desmontando el proyecto de prueba (down -v)"
    dc down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$tmp"
  fi
}
trap desmontar EXIT

# --- Test configuration: .env.example with throw-away local values -------------------
info "Preparando $tmp"
secreto() { od -An -tx1 -N24 /dev/urandom | tr -d ' \n'; }
cp "$deploy/.env.example" "$SC_ENV_FILE"
fijar_env SC_LMS_IMAGE sanarycriar/lms
fijar_env SC_LMS_TAG local
fijar_env SC_ACME_EMAIL smoke@example.com
fijar_env SC_CADDY_GLOBAL local_certs
fijar_env SC_WWW_DIR "$tmp/www"
fijar_env SC_BACKUP_DIR "$tmp/backups"
fijar_env POSTGRES_PASSWORD "$(secreto)"
fijar_env LEARNHOUSE_AUTH_JWT_SECRET_KEY "$(secreto)$(secreto)"
fijar_env LEARNHOUSE_MFA_ENCRYPTION_KEY "$(secreto)"
fijar_env COLLAB_INTERNAL_KEY "$(secreto)"
fijar_env LEARNHOUSE_CONTACT_EMAIL smoke@example.com
fijar_env LEARNHOUSE_INITIAL_ADMIN_EMAIL admin.smoke@example.com
fijar_env LEARNHOUSE_INITIAL_ADMIN_PASSWORD "$(secreto)"
fijar_env LEARNHOUSE_RESEND_API_KEY re_smoke_no_envia
fijar_env NEXT_PUBLIC_SC_SOURCE_URL https://github.com/ejemplo/learnhouse/tree/sanarycriar
rm -f "$SC_ENV_FILE.bak"
mkdir -p "$tmp/www"
# A plain folder instead of the release symlink (Docker Desktop on Windows).
cp -R "$web/dist" "$tmp/www/current"

ok=0
mal=0
probar() {
  local desc="$1"; shift
  if "$@"; then printf '  OK     %s\n' "$desc"; ok=$((ok + 1))
  else printf '  FALLA  %s\n' "$desc"; mal=$((mal + 1)); fi
}
hosts=(www.sanarycriarve.com sanarycriarve.com cursos.sanarycriarve.com psicoinfantilve.com www.psicoinfantilve.com)
resolve=()
for h in "${hosts[@]}"; do
  resolve+=(--resolve "$h:$puerto_https:127.0.0.1" --resolve "$h:$puerto_http:127.0.0.1")
done
url() { # url https|http host path
  local puerto; puerto="$([[ $1 == https ]] && echo "$puerto_https" || echo "$puerto_http")"
  if [[ ($1 == https && $puerto == 443) || ($1 == http && $puerto == 80) ]]; then
    printf '%s://%s%s' "$1" "$2" "$3"
  else
    printf '%s://%s:%s%s' "$1" "$2" "$puerto" "$3"
  fi
}
c() { curl -sk --max-time 60 "${resolve[@]}" "$@"; }
codigo_es() { local u="$1" esperado="$2"; shift 2; [[ "$(c -o /dev/null -w '%{http_code}' "$@" "$u")" == "$esperado" ]]; }
destino_es() { [[ "$(c -o /dev/null -w '%{http_code} %{redirect_url}' "$1")" == "$2" ]]; }
# Output is captured first: "curl | grep -q" fails under pipefail when grep exits early.
cabecera() { local h; h="$(c -o /dev/null -D - "${@:3}" "$1" | tr -d '\r')"; grep -qiE "^$2" <<<"$h"; }
cuerpo() { local b; b="$(c -L "$1")"; grep -qF "$2" <<<"$b"; }

comprobar() {
  info "Comprobaciones HTTP"
  local www cursos
  www="$(url https www.sanarycriarve.com '')"
  cursos="$(url https cursos.sanarycriarve.com '')"
  # The container may report healthy a moment before Caddy reaches it again.

  for _ in $(seq 1 30); do
    codigo_es "$cursos/api/v1/health" 200 && break
    sleep 2
  done
  probar "API /api/v1/health = 200" codigo_es "$cursos/api/v1/health" 200
  probar "Plataforma: home responde 200 (tras redirecciones)" codigo_es "$cursos/" 200 -L
  probar "Plataforma: la home muestra 'Sanar y Criar'" cuerpo "$cursos/" "Sanar y Criar"
  probar "Plataforma: cabeceras propias de Next (X-Frame-Options DENY)" cabecera "$cursos/login" "x-frame-options: DENY"
  probar "Plataforma: HSTS" cabecera "$cursos/api/v1/health" "strict-transport-security: max-age="
  # Without a PayPal config the route answers {"detail":"Payments are not configured"}.
  probar "Webhook PayPal llega a la ruta de la API" \
    bash -c '[[ -n "$1" && "$1" != *"Not Found"* && "$1" != *"<html"* ]]' _ \
    "$(c -X POST -H 'Content-Type: application/json' -d '{}' "$cursos/api/v1/payments/webhooks/paypal/1")"
  probar "CORS del catálogo para www" cabecera "$cursos/api/v1/payments/1/offers/public-listing" \
    "access-control-allow-origin: https://www.sanarycriarve.com" -H "Origin: https://www.sanarycriarve.com"
  probar "Sitio: / = 200" codigo_es "$www/" 200
  probar "Sitio: contiene 'Hilda Hernández'" cuerpo "$www/" "Hilda Hern"
  probar "Sitio: /cursos (cursos.html) = 200" codigo_es "$www/cursos" 200
  probar "Sitio: /agenda/ -> 301 /agenda" destino_es "$www/agenda/" "301 $www/agenda"
  probar "Sitio: /agenda/?utm=1 -> 301 /agenda?utm=1" destino_es "$www/agenda/?utm=1" "301 $www/agenda?utm=1"
  # "/\evil.com" as a relative Location is read by browsers as //evil.com.
  probar "Sitio: /%5Cevil.com/ no redirige fuera" \
    bash -c '[[ "$1" == "https://www.sanarycriarve.com/"* ]]' _ \
    "$(c -o /dev/null -D - "$www/%5Cevil.com/" | tr -d '\r' | sed -n 's/^[Ll]ocation: //p')"
  probar "Sitio: /ebooks -> 301 /cursos" destino_es "$www/ebooks" "301 $www/cursos"
  probar "Sitio: página inexistente = 404" codigo_es "$www/no-existe" 404
  probar "Sitio: 404 en español" cuerpo "$www/no-existe" "Página no encontrada"
  probar "Sitio: 404 con cabeceras de seguridad" cabecera "$www/no-existe" "content-security-policy: default-src 'self'"
  probar "Sitio: CSP" cabecera "$www/" "content-security-policy: default-src 'self'"
  probar "Sitio: HSTS" cabecera "$www/" "strict-transport-security: max-age=31536000"
  probar "Sitio: HTML sin caché larga" cabecera "$www/" "cache-control: public, max-age=0, must-revalidate"
  local css
  css="$(c "$www/" | grep -o '/_astro/[^"]*\.css' | head -n 1 || true)"
  probar "Sitio: /_astro/* inmutable ($css)" cabecera "$www$css" "cache-control: public, max-age=31536000, immutable"
  probar "Sitio: compresión" cabecera "$www/" "content-encoding: (zstd|gzip)" -H "Accept-Encoding: gzip, zstd"
  probar "http:// -> https://" destino_es "$(url http www.sanarycriarve.com /cursos)" "308 https://www.sanarycriarve.com/cursos"
  probar "sanarycriarve.com -> 301 www (ruta y query)" \
    destino_es "$(url https sanarycriarve.com '/blog/x?utm=1')" "301 https://www.sanarycriarve.com/blog/x?utm=1"
  probar "psicoinfantilve.com -> 301 misma ruta" \
    destino_es "$(url https psicoinfantilve.com '/preguntas-frecuentes?a=1')" "301 https://www.sanarycriarve.com/preguntas-frecuentes?a=1"
  probar "www.psicoinfantilve.com/cursos/slug -> /cursos" \
    destino_es "$(url https www.psicoinfantilve.com /cursos/curso-viejo)" "301 https://www.sanarycriarve.com/cursos"
  probar "psicoinfantilve.com/login -> plataforma" \
    destino_es "$(url https psicoinfantilve.com /login)" "301 https://cursos.sanarycriarve.com/login"
  probar "URL del webhook que muestra el panel" bash -c '[[ "$1" == "https://cursos.sanarycriarve.com/api/v1/payments/webhooks/paypal/1" ]]' _ \
    "$(dc exec -T learnhouse-app sh -c 'cd /app/api && .venv/bin/python -c "from src.services.payments.configs import webhook_url; print(webhook_url(None, \"paypal\", 1))"' 2>/dev/null | tail -n 1 | tr -d '\r')"
  probar "ffmpeg en el contenedor" dc exec -T learnhouse-app sh -c 'command -v ffmpeg >/dev/null'
}

# --- 1. First deploy ------------------------------------------------------------------
info "1. Primer despliegue (actualizar.sh --sin-descargar)"
"$deploy/scripts/actualizar.sh" --sin-descargar
comprobar

info "Memoria en reposo"
# shellcheck disable=SC2046 # one argument per container id
docker stats --no-stream --format '  {{.Name}}: {{.MemUsage}}' $(dc ps -q)

# --- 2. Backup, update path, restore ----------------------------------------------------
info "2. Copia de seguridad completa"
"$deploy/scripts/backup.sh"
# shellcheck disable=SC2010 # our own timestamped folder names
respaldo="$(ls -1d "$tmp"/backups/20??-??-??_* | grep -v '_db$' | tail -n 1)"
probar "backup: db.dump, content.tar.gz, env.respaldo y SHA256SUMS" \
  test -s "$respaldo/db.dump" -a -s "$respaldo/content.tar.gz" -a -s "$respaldo/env.respaldo" -a -s "$respaldo/SHA256SUMS"

info "3. Actualización sobre una base existente (camino normal de actualizar.sh)"
"$deploy/scripts/actualizar.sh" --sin-descargar
probar "actualizar.sh dejó una copia _db" bash -c 'ls -1d "$1"/backups/*_db >/dev/null 2>&1' _ "$tmp"

info "4. Restauración"
"$deploy/scripts/restaurar.sh" "$respaldo" --si
comprobar

info "Resultado: $ok OK, $mal fallas"
(( mal == 0 ))
