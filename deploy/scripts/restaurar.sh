#!/usr/bin/env bash
# Restaura una copia hecha con scripts/backup.sh. REEMPLAZA los datos actuales.
#
# Uso (en el servidor, desde /opt/sanarycriar):
#   ./scripts/restaurar.sh backups/2026-10-22_031500                 # base de datos + archivos
#   ./scripts/restaurar.sh backups/2026-10-22_031500 --solo-db
#   ./scripts/restaurar.sh backups/2026-10-22_031500 --solo-contenido
#   Añade --si para no pedir confirmación (p. ej. en pruebas automáticas).
#   Añade --version=sc-vX.Y.Z para arrancar después esa versión de la plataforma
#   (volver atrás tras una actualización que ya migró la base: docs/despliegue.md).
#
# Qué hace: detiene la plataforma, hace una copia de seguridad de lo que hay
# ahora (por si acaso, salvo en una base vacía), borra y recrea la base de datos
# desde db.dump, reemplaza el volumen de archivos con content.tar.gz, vacía la
# caché de Redis y vuelve a arrancar. No toca .env salvo SC_LMS_TAG con --version
# (la copia trae env.respaldo por si lo necesitas: los secretos deben ser los
# mismos que cuando se hizo).

# shellcheck source=deploy/scripts/_comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"

origen=""
restaurar_db=true
restaurar_contenido=true
confirmar=true
version=""
for arg in "$@"; do
  case "$arg" in
    --solo-db) restaurar_contenido=false ;;
    --solo-contenido) restaurar_db=false ;;
    --si) confirmar=false ;;
    --version=*) version="${arg#--version=}" ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    -*) fallar "Opción desconocida: $arg" ;;
    *) origen="$arg" ;;
  esac
done
$restaurar_db || $restaurar_contenido || fallar "--solo-db y --solo-contenido no se pueden usar juntos."
[[ -n "$origen" ]] || fallar "Indica la carpeta de la copia, p. ej. backups/2026-10-22_031500"
[[ -d "$origen" ]] || fallar "No existe la carpeta $origen"
[[ -z "$version" || "$version" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fallar "Versión no válida: '$version'"
origen="$(cd "$origen" && pwd)"

requerir_env

if $restaurar_db; then [[ -s "$origen/db.dump" ]] || fallar "Falta $origen/db.dump"; fi
if $restaurar_contenido; then [[ -s "$origen/content.tar.gz" ]] || fallar "Falta $origen/content.tar.gz"; fi
if [[ -f "$origen/SHA256SUMS" ]]; then
  info "Verificando sumas de comprobación"
  (cd "$origen" && sha256sum --quiet -c SHA256SUMS) || fallar "La copia está dañada (SHA256SUMS no coincide)."
fi

if $confirmar; then
  printf 'Esto REEMPLAZA %s%s con la copia %s.\n' \
    "$($restaurar_db && echo 'la base de datos ')" \
    "$($restaurar_contenido && echo 'los archivos subidos')" "$origen"
  read -r -p 'Escribe RESTAURAR para continuar: ' respuesta
  [[ "$respuesta" == "RESTAURAR" ]] || fallar "Cancelado."
fi

info "Arrancando db y redis"
dc up -d db redis
esperar_sano db 120 || fallar "La base de datos no arrancó."

# Safety copy of the current state, unless the database is still empty.
# Sanar y Criar: a failed query stops here; it used to count as "empty" and skip
# the safety copy right before DROP DATABASE.
tablas="$(dc exec -T db psql -U learnhouse -d learnhouse -Atc \
  "select count(*) from information_schema.tables where table_schema='public'")" ||
  fallar "No se pudo consultar la base de datos actual; no se restauró nada."
tablas="${tablas//[^0-9]/}"
[[ -n "$tablas" ]] || fallar "Respuesta inesperada al contar las tablas; no se restauró nada."
if (( tablas > 0 )); then
  info "Copia de seguridad previa del estado actual"
  "$(dirname "${BASH_SOURCE[0]}")/backup.sh" || fallar "No se pudo hacer la copia previa; no se restauró nada."
fi

info "Deteniendo la plataforma"
dc stop learnhouse-app

if $restaurar_db; then
  info "Recreando la base de datos desde db.dump"
  dc exec -T db psql -U learnhouse -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS learnhouse WITH (FORCE)" \
    -c "CREATE DATABASE learnhouse OWNER learnhouse"
  dc exec -T db pg_restore -U learnhouse -d learnhouse --no-owner --exit-on-error <"$origen/db.dump"
fi

if $restaurar_contenido; then
  info "Reemplazando los archivos subidos"
  dc run --rm --no-deps -T learnhouse-app sh -c \
    'find /app/api/content -mindepth 1 -delete && tar -xzf - -C /app/api/content' <"$origen/content.tar.gz"
fi

info "Vaciando la caché (Redis)"
dc exec -T redis redis-cli FLUSHALL >/dev/null

# Sanar y Criar: a rollback must boot the version that matches the restored schema;
# the newer image would add its tables with create_all and break later migrations.
if [[ -n "$version" && "$version" != "$(valor_env SC_LMS_TAG)" ]]; then
  info "Versión de la plataforma: $(valor_env SC_LMS_TAG) -> $version (guardada en .env)"
  fijar_env SC_LMS_TAG "$version"
fi

info "Arrancando la plataforma"
dc up -d
if esperar_sano learnhouse-app 300; then
  info "Restauración completa."
else
  fallar "La plataforma no quedó sana; revisa: docker compose -f docker-compose.prod.yml logs learnhouse-app"
fi
