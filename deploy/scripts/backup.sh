#!/usr/bin/env bash
# Copia de seguridad de Sanar y Criar: base de datos + archivos subidos + .env.
#
# Uso (en el servidor, desde /opt/sanarycriar):
#   ./scripts/backup.sh            # todo: base de datos, volumen de contenido y .env
#   ./scripts/backup.sh --solo-db  # solo la base de datos (rápido; lo usa actualizar.sh)
#
# Resultado: backups/AAAA-MM-DD_HHMMSS[_db]/ con
#   db.dump         pg_dump formato custom (se restaura con scripts/restaurar.sh)
#   content.tar.gz  videos, PDFs, imágenes (volumen "content")
#   env.respaldo    copia de .env (¡contiene secretos! nunca sale del servidor)
#   SHA256SUMS
# Borra las copias más viejas que SC_BACKUP_KEEP_DAYS (14 por defecto) y, si
# SC_BACKUP_RCLONE_REMOTE está definido, sube la copia con rclone: solo la base
# de datos y los archivos, cifrados (con age si SC_BACKUP_AGE_RECIPIENT está
# definido, o porque el remoto de rclone es de tipo "crypt"). Sin cifrado no se
# sube nada. En el remoto también se borran las copias más viejas que
# SC_BACKUP_KEEP_DAYS (usa una carpeta del remoto solo para esto).
#
# Cuando no corre en una terminal (cron), escribe su salida en backups/backup.log.
# Programar a diario (crontab -e del usuario que maneja Docker):
#   15 3 * * * /opt/sanarycriar/scripts/backup.sh

# shellcheck source=deploy/scripts/_comun.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"

solo_db=false
case "${1:-}" in
  "") ;;
  --solo-db) solo_db=true ;;
  -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
  *) fallar "Opción desconocida: $1 (usa --solo-db o nada)" ;;
esac

umask 077
# Sanar y Criar: create the folder and, under cron (no terminal), log into it
# before anything can fail; the old cron line failed silently while backups/
# did not exist yet.
raiz="$(dir_respaldos)"
mkdir -p "$raiz"
chmod 700 "$raiz"
if [[ ! -t 1 ]]; then
  exec >>"$raiz/backup.log" 2>&1
  printf '\n--- %s backup.sh %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
fi

requerir_env
servicio_corriendo db || fallar "El servicio db no está corriendo (docker compose ... up -d db)."

sello="$(date +%Y-%m-%d_%H%M%S)"
$solo_db && sello="${sello}_db"
destino="$raiz/$sello"
mkdir "$destino"

# On any failure, leave no half-written backup behind.
completo=false
al_salir() {
  if ! $completo; then
    rm -rf "$destino"
    printf '\033[1;31m[error]\033[0m La copia falló; no se guardó nada.\n' >&2
  fi
}
trap al_salir EXIT

info "Base de datos -> $destino/db.dump"
dc exec -T db pg_dump -U learnhouse -d learnhouse -Fc --no-owner >"$destino/db.dump"
# A readable table of contents proves the archive is complete.
dc exec -T db pg_restore --list <"$destino/db.dump" >/dev/null
tam="$(wc -c <"$destino/db.dump")"
(( tam > 1024 )) || fallar "El volcado pesa solo $tam bytes."

if ! $solo_db; then
  info "Archivos subidos -> $destino/content.tar.gz"
  # One-off container of the platform image with the content volume mounted,
  # so this works even while learnhouse-app is stopped.
  dc run --rm --no-deps -T learnhouse-app tar -czf - -C /app/api/content . >"$destino/content.tar.gz"
  gzip -t "$destino/content.tar.gz"

  cp -p "$SC_ENV_FILE" "$destino/env.respaldo"
fi

(cd "$destino" && sha256sum -- * >SHA256SUMS)
completo=true
info "Copia lista: $destino ($(du -sh "$destino" | cut -f1))"

# Retention: delete backup folders older than SC_BACKUP_KEEP_DAYS.
dias="$(valor_env SC_BACKUP_KEEP_DAYS)"
dias="${dias:-14}"
if [[ "$dias" =~ ^[0-9]+$ ]] && (( dias > 0 )); then
  find "$raiz" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??_*' -mtime +"$dias" -print -exec rm -rf {} +
else
  aviso "SC_BACKUP_KEEP_DAYS='$dias' no es un número; no se borra nada."
fi

# Off-site copy. Sanar y Criar: the .env never leaves the server (it holds the
# JWT secret, which also decrypts the stored PayPal secret), the rest is only
# uploaded encrypted, and old remote copies are pruned like the local ones.
remoto="$(valor_env SC_BACKUP_RCLONE_REMOTE)"
if [[ -n "$remoto" ]]; then
  command -v rclone >/dev/null || fallar "SC_BACKUP_RCLONE_REMOTE está definido pero rclone no está instalado. La copia local está en $destino."
  destinatario="$(valor_env SC_BACKUP_AGE_RECIPIENT)"
  nombre_remoto="${remoto%%:*}"
  tipo_remoto="$(rclone listremotes --long 2>/dev/null | awk -v n="${nombre_remoto}:" '$1 == n { print $2 }')"
  subir="$destino"
  if [[ -n "$destinatario" ]]; then
    command -v age >/dev/null || fallar "SC_BACKUP_AGE_RECIPIENT está definido pero age no está instalado (sudo apt install age)."
    subir="$(mktemp -d)"
    trap 'rm -rf "$subir"' EXIT
    for f in db.dump content.tar.gz; do
      [[ -f "$destino/$f" ]] && age -r "$destinatario" -o "$subir/$f.age" "$destino/$f"
    done
    (cd "$subir" && sha256sum -- * >SHA256SUMS)
    info "Subiendo a $remoto/$sello (cifrado con age)"
  elif [[ "$tipo_remoto" == "crypt" ]]; then
    info "Subiendo a $remoto/$sello (remoto rclone cifrado)"
  else
    fallar "El remoto '$nombre_remoto' no cifra (tipo: ${tipo_remoto:-desconocido}). Define SC_BACKUP_AGE_RECIPIENT o usa un remoto rclone de tipo crypt. No se subió nada; la copia local está en $destino."
  fi
  rclone copy --exclude env.respaldo "$subir" "$remoto/$sello"
  if [[ "$dias" =~ ^[0-9]+$ ]] && (( dias > 0 )); then
    rclone delete --min-age "${dias}d" "$remoto"
    rclone rmdirs --leave-root "$remoto"
  fi
fi
