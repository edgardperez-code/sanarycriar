#!/usr/bin/env bash
# Behaviour tests for deploy/scripts (backup.sh, actualizar.sh, _comun.sh) with
# fake docker/rclone/age binaries. Usage: test-deploy-scripts.sh <deploy dir>
set -uo pipefail

KIT="$1"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass + 1)); }
ko() { echo "FAIL $1"; fail=$((fail + 1)); }

mkdir -p "$WORK/bin"
cat >"$WORK/bin/docker" <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >>"$CALLS"
if [[ "$1" == "inspect" ]]; then echo healthy; exit 0; fi
if [[ "$1" == "image" ]]; then exit 0; fi
[[ "$1" == "compose" ]] || exit 0
shift
while [[ $# -gt 0 ]]; do
  case "$1" in --project-directory|-f|--env-file) shift 2 ;; *) break ;; esac
done
sub="$1"; shift
all="$*"
case "$sub" in
  config|pull|up|stop|ps)
    if [[ "$sub" == "ps" ]]; then echo "cid-$*" | tr ' ' '_'; fi
    exit 0 ;;
  exec|run)
    if [[ "$all" == *pg_dump* ]]; then head -c 4096 /dev/zero; exit 0; fi
    if [[ "$all" == *pg_restore* ]]; then cat >/dev/null; exit 0; fi
    if [[ "$all" == *tar* ]]; then printf 'x' | gzip; exit 0; fi
    if [[ "$all" == *psql* ]]; then
      [[ -n "${FAKE_PSQL_FAIL:-}" ]] && { echo "FATAL: the database system is starting up" >&2; exit 2; }
      echo "${FAKE_TABLES:-5}"; exit 0
    fi
    if [[ "$all" == *"alembic current"* ]]; then echo "${FAKE_CURRENT:-aaaaaaaaaaaa} (head)"; exit 0; fi
    if [[ "$all" == *"alembic heads"* ]]; then echo "${FAKE_HEADS:-aaaaaaaaaaaa} (head)"; exit 0; fi
    exit 0 ;;
esac
exit 0
EOF
cat >"$WORK/bin/rclone" <<'EOF'
#!/usr/bin/env bash
echo "rclone $*" >>"$CALLS"
if [[ "$1" == "listremotes" ]]; then printf 'plano: b2\ncifrado: crypt\n'; exit 0; fi
if [[ "$1" == "copy" ]]; then src="${@: -2:1}"; ls "$src" >>"$CALLS.copied"; fi
exit 0
EOF
cat >"$WORK/bin/age" <<'EOF'
#!/usr/bin/env bash
echo "age $*" >>"$CALLS"
out=""; while [[ $# -gt 1 ]]; do [[ "$1" == "-o" ]] && out="$2"; shift; done
printf 'age-encrypted' >"$out"
EOF
chmod +x "$WORK/bin/"*
export PATH="$WORK/bin:$PATH"

new_kit() {
  rm -rf "$WORK/kit"; mkdir -p "$WORK/kit"
  cp -r "$KIT/scripts" "$KIT/docker-compose.prod.yml" "$WORK/kit/"
  sed -e 's/CAMBIAR/x/g' "$KIT/.env.example" >"$WORK/kit/.env"
  export CALLS="$WORK/calls.log"; : >"$CALLS"; rm -f "$CALLS.copied"
}
setenv() { printf '%s=%s\n' "$1" "$2" >>"$WORK/kit/.env"; }

# 1. Under cron (stdout not a terminal) with no backups/ folder yet.
new_kit
"$WORK/kit/scripts/backup.sh" >"$WORK/cron.out" 2>&1 </dev/null
code=$?
if [[ $code -eq 0 && -s "$WORK/kit/backups/backup.log" ]] && ls -d "$WORK/kit/backups/20"* >/dev/null 2>&1 &&
   grep -q "Copia lista" "$WORK/kit/backups/backup.log"; then ok "cron run creates backups/ and logs there"; else ko "cron run (code $code)"; cat "$WORK/cron.out"; fi

# 2. Remote that does not encrypt, no age recipient: nothing uploaded.
new_kit; setenv SC_BACKUP_RCLONE_REMOTE "plano:respaldos"
"$WORK/kit/scripts/backup.sh" >/dev/null 2>&1; code=$?
if [[ $code -ne 0 ]] && ! grep -q "^rclone copy" "$CALLS" && grep -q "no cifra" "$WORK/kit/backups/backup.log" &&
   ls "$WORK/kit/backups/20"*/db.dump >/dev/null 2>&1; then ok "plain remote refused, local copy kept"; else ko "plain remote (code $code)"; fi

# 3. rclone crypt remote: uploaded without the .env, remote pruned.
new_kit; setenv SC_BACKUP_RCLONE_REMOTE "cifrado:respaldos"
"$WORK/kit/scripts/backup.sh" >/dev/null 2>&1; code=$?
if [[ $code -eq 0 ]] && grep -q "^rclone copy --exclude env.respaldo" "$CALLS" && grep -q "^rclone delete --min-age 14d cifrado:respaldos" "$CALLS" &&
   grep -q "^rclone rmdirs --leave-root cifrado:respaldos" "$CALLS"; then ok "crypt remote: no .env, retention applied"; else ko "crypt remote (code $code)"; cat "$CALLS"; fi

# 4. age recipient: only encrypted files leave the server.
new_kit; setenv SC_BACKUP_RCLONE_REMOTE "plano:respaldos"; setenv SC_BACKUP_AGE_RECIPIENT "age1test"
"$WORK/kit/scripts/backup.sh" >/dev/null 2>&1; code=$?
copied="$(tr '\n' ' ' <"$CALLS.copied" 2>/dev/null)"
if [[ $code -eq 0 && "$copied" == *"db.dump.age"* && "$copied" == *"content.tar.gz.age"* && "$copied" != *"env.respaldo"* && "$copied" != *"db.dump "* ]]; then
  ok "age: uploads only *.age ($copied)"; else ko "age (code $code): $copied"; fi

# 5. Development mode in .env is refused.
new_kit; sed -i 's/^LEARNHOUSE_DEVELOPMENT_MODE=.*/LEARNHOUSE_DEVELOPMENT_MODE=true/' "$WORK/kit/.env"
out="$("$WORK/kit/scripts/backup.sh" 2>&1 </dev/null | cat)"; log="$(cat "$WORK/kit/backups/backup.log" 2>/dev/null)"
if [[ "$out$log" == *"LEARNHOUSE_DEVELOPMENT_MODE"* ]] && ! grep -q pg_dump "$CALLS"; then ok "development mode refused"; else ko "development mode"; fi
new_kit; setenv LEARNHOUSE_PAYPAL_API_BASE "http://x"
"$WORK/kit/scripts/backup.sh" >/dev/null 2>&1
if grep -q "LEARNHOUSE_PAYPAL_API_BASE" "$WORK/kit/backups/backup.log"; then ok "PayPal override refused"; else ko "PayPal override"; fi

# 6. actualizar.sh: a database that does not answer stops the update.
new_kit
FAKE_PSQL_FAIL=1 "$WORK/kit/scripts/actualizar.sh" --sin-descargar >"$WORK/upd.out" 2>&1; code=$?
if [[ $code -ne 0 ]] && grep -q "No se pudo consultar la base de datos" "$WORK/upd.out" && ! grep -q "remove-orphans" "$CALLS" &&
   grep -q "up -d --no-recreate db redis" "$CALLS"; then ok "update stops when the db does not answer"; else ko "update with failing db (code $code)"; cat "$WORK/upd.out"; fi

# 7. actualizar.sh: existing db -> backup + migrations; schema behind heads -> failure.
new_kit
FAKE_CURRENT=aaaaaaaaaaaa FAKE_HEADS=bbbbbbbbbbbb "$WORK/kit/scripts/actualizar.sh" --sin-descargar >"$WORK/upd2.out" 2>&1; code=$?
if [[ $code -ne 0 ]] && grep -q "pg_dump" "$CALLS" && grep -q "alembic upgrade heads" "$CALLS" && grep -q "esta versión espera" "$WORK/upd2.out"; then
  ok "update backs up, migrates, and refuses a schema behind heads"; else ko "update heads check (code $code)"; tail -5 "$WORK/upd2.out"; fi
new_kit
"$WORK/kit/scripts/actualizar.sh" --sin-descargar >"$WORK/upd3.out" 2>&1; code=$?
if [[ $code -eq 0 ]] && grep -q "Listo" "$WORK/upd3.out"; then ok "update succeeds when schema == heads"; else ko "update happy path (code $code)"; tail -5 "$WORK/upd3.out"; fi

echo "passed=$pass failed=$fail"
[[ $fail -eq 0 ]]
