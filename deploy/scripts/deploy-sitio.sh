#!/usr/bin/env bash
# Compila el sitio de marketing (Astro, carpeta web/) y lo publica en el VPS.
#
# Uso (desde tu computadora, en la carpeta del proyecto):
#   deploy/scripts/deploy-sitio.sh usuario@IP-del-VPS
#   deploy/scripts/deploy-sitio.sh                  # usa SC_SSH_DESTINO de deploy/sitio.env;
#                                                   # si está vacío, publica en esta máquina
# Opciones:
#   --sin-build   publica web/dist tal como está (sin volver a compilar)
#   --instalar    fuerza "npm ci" antes de compilar
#   --forzar      publica aunque el catálogo tenga ofertas de prueba "(borrar)"
#
# Variables PUBLIC_* (URL del sitio, de la plataforma, enlaces de clase gratuita y
# agenda): deploy/sitio.env si existe; si no, los valores de producción de
# deploy/sitio.env.example. Una variable ya definida en el entorno tiene prioridad.
#
# Publicación sin cortes: cada versión va a www/releases/<fecha>/ y el enlace
# www/current cambia al final. Se conservan las 5 últimas. Volver a la anterior
# (en el servidor):  cd /opt/sanarycriar/www && ls releases && ln -sfn releases/<fecha> current
# Requisitos: Node 22.12+ y npm, ssh y tar (Git Bash en Windows los trae).

# shellcheck source=deploy/scripts/_comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"

sin_build=false
instalar=false
forzar=false
destino_arg=""
for arg in "$@"; do
  case "$arg" in
    --sin-build) sin_build=true ;;
    --instalar) instalar=true ;;
    --forzar) forzar=true ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    -*) fallar "Opción desconocida: $arg" ;;
    *) destino_arg="$arg" ;;
  esac
done

web_dir="${SC_WEB_DIR:-$SC_DIR/../web}"
[[ -f "$web_dir/package.json" ]] || fallar "No encuentro el sitio en $web_dir (define SC_WEB_DIR)."
web_dir="$(cd "$web_dir" && pwd)"

# Loads KEY=VALUE pairs from a file without executing it; the environment wins.
cargar_variables() {
  local archivo="$1" linea clave valor
  while IFS= read -r linea || [[ -n "$linea" ]]; do
    linea="${linea%$'\r'}"
    [[ "$linea" =~ ^[[:space:]]*(#|$) ]] && continue
    clave="${linea%%=*}"
    valor="${linea#*=}"
    valor="${valor%\"}"; valor="${valor#\"}"
    valor="${valor%\'}"; valor="${valor#\'}"
    [[ "$clave" =~ ^(PUBLIC_[A-Z0-9_]+|SC_SSH_DESTINO|SC_DIR_REMOTO)$ ]] || continue
    [[ -n "${!clave+x}" ]] && continue
    export "$clave=$valor"
  done <"$archivo"
}
if [[ -f "$SC_DIR/sitio.env" ]]; then
  cargar_variables "$SC_DIR/sitio.env"
fi
cargar_variables "$SC_DIR/sitio.env.example"

destino="${destino_arg:-${SC_SSH_DESTINO:-}}"
dir_remoto="${SC_DIR_REMOTO:-/opt/sanarycriar}"
[[ "$dir_remoto" =~ ^/[A-Za-z0-9_./-]+$ ]] || fallar "SC_DIR_REMOTO no válido: '$dir_remoto'"

info "Sitio: $PUBLIC_SITE_URL · plataforma: $PUBLIC_LH_PLATFORM · API: $PUBLIC_LH_API (org $PUBLIC_LH_ORG_ID)"

# --- Test offers must not reach the public catalog --------------------------------
catalogo="$PUBLIC_LH_API/payments/$PUBLIC_LH_ORG_ID/offers/public-listing"
if respuesta="$(curl -fsS --max-time 20 "$catalogo" 2>/dev/null)"; then
  if grep -qiF '(borrar)' <<<"$respuesta"; then
    if $forzar; then
      aviso "El catálogo tiene ofertas de prueba \"(borrar)\"; se publica igual (--forzar)."
    else
      fallar "El catálogo público tiene ofertas de prueba \"(borrar)\". Archívalas en el panel (o usa --forzar)."
    fi
  fi
else
  aviso "No se pudo leer $catalogo: el HTML saldrá sin productos y el navegador los cargará después."
fi

# --- Build ------------------------------------------------------------------------
if ! $sin_build; then
  command -v npm >/dev/null || fallar "Falta npm (instala Node 22.12 o superior)."
  if $instalar || [[ ! -d "$web_dir/node_modules" ]]; then
    info "Instalando dependencias (npm ci)"
    (cd "$web_dir" && npm ci)
  fi
  info "Compilando (astro build)"
  (cd "$web_dir" && NODE_ENV=production npm run build)
fi

dist="$web_dir/dist"
[[ -f "$dist/index.html" && -f "$dist/404.html" ]] || fallar "No hay compilación válida en $dist."
fugas="$(find "$dist" -type f \( -name '*.html' -o -name '*.js' \) \
  -exec grep -lE 'localhost:(1338|3200|4321)' {} + 2>/dev/null || true)"
if [[ -n "$fugas" ]]; then
  printf '%s\n' "$fugas" | head -n 5 >&2
  fallar "La compilación apunta a localhost (¿PUBLIC_* de desarrollo?). Revisa deploy/sitio.env."
fi

# --- Publish ----------------------------------------------------------------------
release="$(date +%Y%m%d-%H%M%S)"

# Runs on the target: validates the release, swaps the "current" symlink atomically
# and keeps the five newest releases.
activar() {
  cat <<'EOF'
set -euo pipefail
www="$1"; release="$2"
cd "$www"
test -f "releases/$release/index.html"
tmp="current.nuevo.$$"
ln -s "releases/$release" "$tmp"
if ! mv -T "$tmp" current 2>/dev/null; then
  rm -f "$tmp"
  ln -sfn "releases/$release" current
fi
ls -1 releases | sort -r | tail -n +6 | while IFS= read -r viejo; do
  [ -n "$viejo" ] && rm -rf "releases/$viejo"
done
echo "Publicado: $www/current -> releases/$release"
EOF
}

if [[ -n "$destino" ]]; then
  command -v ssh >/dev/null || fallar "Falta ssh."
  info "Subiendo a $destino:$dir_remoto/www/releases/$release"
  # shellcheck disable=SC2029 # the remote path is meant to expand here (validated above)
  tar -C "$dist" -czf - . |
    ssh "$destino" "mkdir -p '$dir_remoto/www/releases/$release' && tar -xzf - -C '$dir_remoto/www/releases/$release'"
  activar | ssh "$destino" bash -s -- "$dir_remoto/www" "$release"
else
  www_local="$SC_DIR/www"
  info "Publicando en esta máquina: $www_local/releases/$release"
  mkdir -p "$www_local/releases/$release"
  cp -R "$dist/." "$www_local/releases/$release/"
  activar | bash -s -- "$www_local" "$release"
fi

info "Listo. Revisa $PUBLIC_SITE_URL (Caddy sirve la versión nueva al instante)."
