#!/usr/bin/env bash
# Primer despliegue y actualizaciones de la plataforma de cursos.
#
# Uso (en el servidor, desde /opt/sanarycriar):
#   ./scripts/actualizar.sh               # despliega SC_LMS_TAG de .env
#   ./scripts/actualizar.sh sc-v1.2.0     # cambia SC_LMS_TAG en .env y despliega esa versión
#   --sin-descargar                       # usa imágenes ya presentes (no hace docker compose pull)
# Para cambiar de versión pasa la etiqueta como argumento; no edites SC_LMS_TAG a mano.
#
# Pasos:
#   1. Copia de seguridad de la base de datos (si ya existe).
#   2. Descarga las imágenes (plataforma, Postgres, Redis, Caddy).
#   3. Migraciones Alembic ANTES de arrancar la versión nueva. Una base creada por
#      el primer arranque (create_all) no tiene marca de Alembic: primero se marca
#      ("stamp heads") con la versión que la creó y luego "upgrade heads" con la nueva.
#   4. docker compose up -d y espera a que la plataforma esté sana.
#   5. Primer despliegue: marca la base recién creada con la versión actual.
#
# Volver atrás: ./scripts/actualizar.sh <etiqueta-anterior>. Si la versión nueva
# ya migró la base, este script se detiene en el paso 3; entonces restaura la copia
# _db hecha al actualizar a la versión nueva (no la más reciente) con:
#   ./scripts/restaurar.sh backups/<fecha>_db --solo-db --version=<etiqueta-anterior>

# shellcheck source=deploy/scripts/_comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"

descargar=true
tag_arg=""
for arg in "$@"; do
  case "$arg" in
    # Use images already present (e.g. built on this machine); skips "docker compose pull".
    --sin-descargar) descargar=false ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    -*) fallar "Opción desconocida: $arg" ;;
    *) tag_arg="$arg" ;;
  esac
done

requerir_env
cd "$SC_DIR"

tag_anterior="$(valor_env SC_LMS_TAG)"
tag_nuevo="${tag_arg:-$tag_anterior}"
[[ "$tag_nuevo" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fallar "Etiqueta de imagen no válida: '$tag_nuevo'"

dc config --quiet || fallar "docker-compose.prod.yml o .env tienen errores (docker compose config)."
www_dir="$(valor_env SC_WWW_DIR)"
[[ -e "${www_dir:-./www}/current" ]] ||
  aviso "Todavía no hay sitio estático publicado (www/current). Ejecuta scripts/deploy-sitio.sh."

# Prints the current Alembic revision(s); empty when the database is unstamped.
# $1 = exec (running container) | run (one-off container of the configured image).
alembic_actual() {
  local out
  if ! out="$(alembic_app "$1" current 2>&1)"; then
    printf '%s\n' "$out" >&2
    fallar "No se pudo consultar Alembic (alembic current)."
  fi
  printf '%s\n' "$out" | revisiones
}

# --- 1. Backup -------------------------------------------------------------------
# Sanar y Criar: the database is started (and waited for) before deciding whether
# it is empty. A stopped or still-starting database used to count as "empty",
# which skipped both the backup and the migrations and booted the new image on
# the old schema. A failed query now stops the update instead.
info "Arrancando la base de datos para revisar su estado"
dc up -d --no-recreate db redis
esperar_sano db 120 || fallar "La base de datos no arrancó. Revisa: docker compose -f docker-compose.prod.yml logs --tail 100 db"
tablas="$(dc exec -T db psql -U learnhouse -d learnhouse -Atc \
  "select count(*) from information_schema.tables where table_schema='public'")" ||
  fallar "No se pudo consultar la base de datos (psql). No se actualizó nada."
tablas="${tablas//[^0-9]/}"
[[ -n "$tablas" ]] || fallar "Respuesta inesperada al contar las tablas de la base de datos."
db_existente=false
if (( tablas > 0 )); then db_existente=true; fi
if $db_existente; then
  info "1/5 Copia de seguridad de la base de datos"
  "$(dirname "${BASH_SOURCE[0]}")/backup.sh" --solo-db
else
  info "1/5 Base de datos vacía o detenida: no hace falta copia"
fi

# Alembic baseline with the version that is running NOW. Stamping with the new
# image's heads instead would skip every migration between the two versions.
if $db_existente; then
  if servicio_corriendo learnhouse-app; then modo="exec"; else modo="run"; fi
  # Plain assignment so that a failing "alembic current" aborts (set -e) instead of stamping.
  actual="$(alembic_actual "$modo")"
  if [[ -z "$actual" ]]; then
    info "La base no tiene marca de Alembic (la creó el primer arranque): marcándola con la versión actual ($tag_anterior)"
    alembic_app "$modo" stamp heads
  fi
fi

# --- 2. Pull ---------------------------------------------------------------------
if [[ "$tag_nuevo" != "$tag_anterior" ]]; then
  info "Versión: $tag_anterior -> $tag_nuevo (guardada en .env; la anterior queda en .env.bak)"
  fijar_env SC_LMS_TAG "$tag_nuevo"
fi
# Sanar y Criar: until the new version is up, a failure puts the previous tag back in
# .env, so a later plain "docker compose up -d" cannot boot an unmigrated image.
fallar_y_revertir() {
  if [[ "$tag_nuevo" != "$tag_anterior" ]]; then
    fijar_env SC_LMS_TAG "$tag_anterior"
    aviso "SC_LMS_TAG vuelve a $tag_anterior en .env."
  fi
  fallar "$1"
}
if $descargar; then
  info "2/5 Descargando imágenes"
  dc pull || fallar_y_revertir "No se pudieron descargar las imágenes (¿existe la etiqueta $tag_nuevo?)."
else
  info "2/5 Sin descarga (--sin-descargar): se usan las imágenes locales"
fi

# --- 3. Migrations with the new image, before it boots ---------------------------
if $db_existente; then
  info "3/5 Migraciones (alembic upgrade heads)"
  dc up -d --no-recreate db redis
  esperar_sano db 120 || fallar "La base de datos no arrancó."
  # Also fails when the database is NEWER than this image (a rollback after the
  # new version migrated it): see "Volver atrás" in docs/despliegue.md.
  alembic_app run upgrade heads ||
    fallar_y_revertir "Las migraciones fallaron. La versión anterior sigue corriendo; la copia está en $(dir_respaldos). Si estás volviendo a una versión anterior: scripts/restaurar.sh <copia>_db --solo-db --version=$tag_nuevo"
else
  info "3/5 Primer despliegue: el primer arranque crea las tablas"
fi

# --- 4. Start --------------------------------------------------------------------
info "4/5 Arrancando servicios"
dc up -d --remove-orphans
info "Esperando a que la plataforma responda (hasta 5 min)..."
esperar_sano learnhouse-app 300 ||
  fallar "learnhouse-app no quedó sana. Revisa: docker compose -f docker-compose.prod.yml logs --tail 200 learnhouse-app"

# --- 5. First deploy: stamp the schema that create_all just built -----------------
revision="$(alembic_actual exec)"
if [[ -z "$revision" ]]; then
  info "5/5 Marcando la base nueva con la versión de Alembic actual"
  alembic_app exec stamp heads
  revision="$(alembic_actual exec)"
fi
info "5/5 Alembic en: $(printf '%s' "$revision" | tr '\n' ' ')"
# Sanar y Criar: the schema must be exactly at this image's heads. Any revision
# at all (e.g. the old one, when the migrations were skipped) is not enough.
if ! heads_out="$(alembic_app exec heads 2>&1)"; then
  printf '%s\n' "$heads_out" >&2
  fallar "No se pudo consultar Alembic (alembic heads)."
fi
heads="$(printf '%s\n' "$heads_out" | revisiones | sort)"
if [[ -z "$heads" || "$(printf '%s\n' "$revision" | sort)" != "$heads" ]]; then
  fallar "La base está en: $(printf '%s' "$revision" | tr '\n' ' ')pero esta versión espera: $(printf '%s' "$heads" | tr '\n' ' '). Ejecuta las migraciones (docker compose -f docker-compose.prod.yml exec -T learnhouse-app sh -c 'cd /app/api && .venv/bin/alembic upgrade heads') y revisa los logs."
fi

# Only dangling layers; tagged previous versions stay available for a rollback.
docker image prune -f >/dev/null || true
info "Listo: $(valor_env SC_LMS_IMAGE):$(valor_env SC_LMS_TAG) en marcha."
dc ps
