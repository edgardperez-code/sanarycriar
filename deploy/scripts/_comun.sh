# shellcheck shell=bash
# Shared helpers for the production scripts. Sourced, never executed directly.
#
# SC_DIR is the deploy folder (the one with docker-compose.prod.yml and .env):
# /opt/sanarycriar on the server, sanarycriar/deploy in the repo.

set -Eeuo pipefail

SC_DIR="${SC_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SC_COMPOSE_FILE="${SC_COMPOSE_FILE:-$SC_DIR/docker-compose.prod.yml}"
SC_ENV_FILE="${SC_ENV_FILE:-$SC_DIR/.env}"
export SC_ENV_FILE

info() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
aviso() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
fallar() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# docker compose with the production file, project dir and env file.
# SC_COMPOSE_OVERRIDE adds a second file (used by local-smoke/); the project name
# can be changed with COMPOSE_PROJECT_NAME.
dc() {
  local files=(-f "$SC_COMPOSE_FILE")
  if [[ -n "${SC_COMPOSE_OVERRIDE:-}" ]]; then files+=(-f "$SC_COMPOSE_OVERRIDE"); fi
  docker compose --project-directory "$SC_DIR" "${files[@]}" --env-file "$SC_ENV_FILE" "$@"
}

requerir_env() {
  [[ -f "$SC_ENV_FILE" ]] || fallar "No existe $SC_ENV_FILE. Copia .env.example a .env y complétalo."
  if grep -Eq '^[A-Z0-9_]+=.*CAMBIAR' "$SC_ENV_FILE"; then
    grep -En '^[A-Z0-9_]+=.*CAMBIAR' "$SC_ENV_FILE" | cut -d= -f1 >&2
    fallar "Quedan valores CAMBIAR en $SC_ENV_FILE (arriba)."
  fi
  command -v docker >/dev/null || fallar "Docker no está instalado."
  # Sanar y Criar: development mode re-enables the PayPal mock override (live
  # credentials sent to another host), /docs and relaxed checks. Never in
  # production; the local smoke test (SC_COMPOSE_OVERRIDE) is exempt.
  if [[ -z "${SC_COMPOSE_OVERRIDE:-}" ]]; then
    if grep -Eiq "^LEARNHOUSE_DEVELOPMENT_MODE=[\"']?(true|1|yes)" "$SC_ENV_FILE"; then
      fallar "LEARNHOUSE_DEVELOPMENT_MODE está activado en $SC_ENV_FILE: en producción debe ser false."
    fi
    if grep -Eq '^LEARNHOUSE_PAYPAL_(API|WEB)_BASE=' "$SC_ENV_FILE"; then
      fallar "Quita LEARNHOUSE_PAYPAL_API_BASE y LEARNHOUSE_PAYPAL_WEB_BASE de $SC_ENV_FILE: son solo para el simulador local."
    fi
  fi
}

# Reads KEY from the env file without executing it (last occurrence wins,
# surrounding single/double quotes removed).
valor_env() {
  local key="$1" line
  line="$(grep -E "^${key}=" "$SC_ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

# Replaces (or appends) KEY=value in the env file, keeping a .bak copy.
fijar_env() {
  local key="$1" value="$2" tmp
  cp -p "$SC_ENV_FILE" "$SC_ENV_FILE.bak"
  tmp="$(mktemp "$SC_ENV_FILE.XXXXXX")"
  if grep -Eq "^${key}=" "$SC_ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN { FS = OFS = "=" }
      $1 == k { print k "=" v; next } { print }' "$SC_ENV_FILE" >"$tmp"
  else
    cat "$SC_ENV_FILE" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$SC_ENV_FILE"
}

# Absolute path of SC_BACKUP_DIR (relative values are relative to SC_DIR).
dir_respaldos() {
  local dir
  dir="$(valor_env SC_BACKUP_DIR)"
  dir="${dir:-./backups}"
  # Absolute: /x on Linux, C:/x when testing from Git Bash on Windows.
  [[ "$dir" = /* || "$dir" =~ ^[A-Za-z]:[/\\] ]] || dir="$SC_DIR/${dir#./}"
  printf '%s' "$dir"
}

servicio_corriendo() {
  [[ -n "$(dc ps --status running -q "$1" 2>/dev/null)" ]]
}

# Waits until the service's healthcheck reports healthy (default 300 s).
esperar_sano() {
  local service="$1" limit="${2:-300}" id status waited=0
  while (( waited < limit )); do
    id="$(dc ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$id" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      [[ "$status" == "healthy" ]] && return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

# Runs alembic inside the platform image. $1 = "exec" (running container) or
# "run" (one-off container of the configured image); the rest are alembic args.
alembic_app() {
  local mode="$1"; shift
  local cmd="cd /app/api && .venv/bin/alembic $*"
  if [[ "$mode" == "exec" ]]; then
    dc exec -T learnhouse-app sh -c "$cmd"
  else
    dc run --rm --no-deps -T learnhouse-app sh -c "$cmd"
  fi
}

# Revision ids printed by "alembic current"/"heads": lines like "a9c8b7d6e5f4 (head)".
# INFO logs go to stderr; the strict pattern ignores any other stdout noise.
revisiones() {
  grep -E '^[0-9a-z]{12}( \([a-z ]+\))*$' | cut -d' ' -f1 || true
}
