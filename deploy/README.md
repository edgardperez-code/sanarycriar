# Kit de despliegue

Todo lo necesario para correr Sanar y Criar en un VPS. La guía paso a paso está en [`../docs/despliegue.md`](../docs/despliegue.md).

| Archivo | Para qué |
|---|---|
| `docker-compose.prod.yml` | Servicios: `learnhouse-app` (plataforma), `db` (Postgres 16 + pgvector), `redis`, `caddy` (HTTPS) |
| `caddy/Caddyfile` | Dominios, HTTPS, cabeceras de seguridad, redirección de `sanarycriarve.com` a www |
| `.env.example` | Todas las variables de producción, comentadas. Se copia a `.env` en el servidor |
| `sitio.env.example` | Variables públicas del sitio Astro para `scripts/deploy-sitio.sh` |
| `scripts/actualizar.sh` | Primer despliegue y actualizaciones (copia, imagen nueva, migraciones Alembic, arranque) |
| `scripts/deploy-sitio.sh` | Compila `web/` y publica el sitio estático en `www/` del VPS |
| `scripts/backup.sh` / `scripts/restaurar.sh` | Copias de seguridad (base de datos + archivos + `.env`) y restauración |
| `scripts/limpiar-datos-de-prueba.py` | Borra cursos/ofertas "(borrar)" y cuentas `@example.com`; simulación por defecto |
| `local-smoke/` | Prueba local de todo el kit con la imagen construida en tu computadora |
| `www/` | Sitio estático publicado (`releases/` + enlace `current`); no va a git |

En el servidor esta carpeta vive en `/opt/sanarycriar`.
