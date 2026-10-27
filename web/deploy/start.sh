#!/bin/sh
# Sanar y Criar: arranca Node (Astro, páginas bajo demanda del blog) y Caddy en el
# mismo contenedor. Si cualquiera de los dos muere, se para el otro y el contenedor
# sale con error para que la plataforma lo reinicie. Railway inyecta PORT para Caddy;
# Node escucha en SSR_PORT solo en 127.0.0.1 (Astro también leería PORT).
set -u
SSR_PORT="${SSR_PORT:-4321}"
STOPPING=0

HOST=127.0.0.1 PORT="$SSR_PORT" node /app/dist/server/entry.mjs &
NODE_PID=$!
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
CADDY_PID=$!

trap 'STOPPING=1; kill -TERM "$NODE_PID" "$CADDY_PID" 2>/dev/null' TERM INT

while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$CADDY_PID" 2>/dev/null; do
  sleep 2
done

kill -TERM "$NODE_PID" "$CADDY_PID" 2>/dev/null
wait
[ "$STOPPING" = 1 ] && exit 0
exit 1
