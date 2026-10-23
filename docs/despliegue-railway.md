# Despliegue en Railway

Así está montado Sanar y Criar en Railway (proyecto `sanarycriar`, entorno `production`, cuenta Pro). Es la alternativa al VPS de `docs/despliegue.md`: Railway pone el HTTPS, los volúmenes y la red privada, así que aquí no hay Caddy delante ni scripts de respaldo propios.

```
Internet ──► Railway (HTTPS)
              ├─ www.sanarycriarve.com ....... servicio "sitio"       (Astro estático + Caddy, :8080)
              ├─ sanarycriarve.com ........... servicio "sitio"       (301 → www)
              └─ cursos.sanarycriarve.com .... servicio "plataforma"  (imagen del fork, nginx interno :80)
                                                 ├─ postgres  (pgvector, red privada)
                                                 └─ redis     (red privada)
```

## Servicios

| Servicio | Origen | Volumen | Notas |
|---|---|---|---|
| `plataforma` | imagen `ghcr.io/edgardperez-code/sanarycriar-lms:<etiqueta>` | `/app/api/content` (videos, PDF, imágenes) | Dominio con puerto de destino **80** (nginx interno). `PORT=8000` fijo: es el puerto del web interno; si Railway inyectara otro, nginx no lo encontraría. |
| `postgres` | imagen `pgvector/pgvector:pg16` (fijada por digest) | `/var/lib/postgresql/data` | `PGDATA=/var/lib/postgresql/data/pgdata`: el volumen trae `lost+found` y `initdb` no acepta una carpeta no vacía. |
| `redis` | imagen `redis:8.6.1-alpine` (fijada por digest) | `/data` | **`RAILWAY_RUN_UID=0` obligatorio.** Sin él Redis no puede escribir en el volumen ("Permission denied"), bloquea todas las escrituras (MISCONF) y el inicio de sesión da error 500. |
| `sitio` | `web/` subido con la CLI (`web/Dockerfile`) | — | Compila Astro y lo sirve con Caddy (`web/deploy/Caddyfile`) en el puerto 8080. |

Postgres y Redis no tienen dominio público: la plataforma los alcanza por la red privada (`postgres.railway.internal`, `redis.railway.internal`).

## Variables

Se gestionan con `railway variable set -s <servicio> ...` o desde el panel. Los secretos se generaron al azar y se cargaron por `--stdin`, sin que aparezcan en pantalla ni en archivos.

**plataforma** (mismas que `deploy/.env.example`, adaptadas):
- Dominio: `LEARNHOUSE_DOMAIN`, `LEARNHOUSE_FRONTEND_DOMAIN` = `cursos.sanarycriarve.com`; `LEARNHOUSE_MEDIA_URL`, `LEARNHOUSE_ALLOWED_ORIGINS` = `https://cursos.sanarycriarve.com`; `LEARNHOUSE_ALLOWED_REGEXP`; `LEARNHOUSE_SSL=true`; `LEARNHOUSE_TENANCY=single`; `LEARNHOUSE_DEVELOPMENT_MODE=false`; `LEARNHOUSE_DISABLE_EE=1`.
- Sitio: `LEARNHOUSE_EXTRA_CORS_ORIGINS=https://www.sanarycriarve.com,https://sanarycriarve.com`; `NEXT_PUBLIC_SC_SITE_URL=https://www.sanarycriarve.com`; `NEXT_PUBLIC_SC_SOURCE_URL` (fork público).
- Web: `NEXT_PUBLIC_LEARNHOUSE_API_URL`, `_BACKEND_URL`, `_MEDIA_URL`, `_DOMAIN`, `_TOP_DOMAIN`, `_DEFAULT_ORG=sanarycriar`, `_MULTI_ORG=false`, `_HTTPS=true`, `NEXT_PUBLIC_COLLAB_URL=wss://cursos.sanarycriarve.com/collab`.
- Cableado interno: `PORT=8000`, `HOSTNAME=0.0.0.0`, `LEARNHOUSE_PORT=9000`, `LEARNHOUSE_API_URL=http://localhost:9000`, `LEARNHOUSE_REDIS_CONNECTION_STRING=redis://redis.railway.internal:6379/0`, `LEARNHOUSE_REDIS_URL=redis://redis.railway.internal:6379`, y `LEARNHOUSE_SQL_CONNECTION_STRING=postgresql://learnhouse:${{postgres.POSTGRES_PASSWORD}}@postgres.railway.internal:5432/learnhouse` (referencia de Railway: la contraseña no se copia).
- Secretos: `LEARNHOUSE_AUTH_JWT_SECRET_KEY`, `LEARNHOUSE_MFA_ENCRYPTION_KEY`, `COLLAB_INTERNAL_KEY`.
- Organización y administradora iniciales (solo el primer arranque): `LEARNHOUSE_INITIAL_ORG_NAME`, `LEARNHOUSE_INITIAL_ORG_SLUG`, `LEARNHOUSE_INITIAL_ADMIN_EMAIL`, `LEARNHOUSE_INITIAL_ADMIN_PASSWORD`. Las dos últimas las escribe la administradora con `deploy/railway/fijar-admin.ps1`.
- Video y otras: las de HLS, `LEARNHOUSE_CONTENT_DELIVERY_TYPE=filesystem`, `LEARNHOUSE_IS_AI_ENABLED=false`, `LEARNHOUSE_PAYMENTS_RECONCILE=1`, remitente de correo. **Pendiente:** `LEARNHOUSE_EMAIL_PROVIDER` + `LEARNHOUSE_RESEND_API_KEY` (sin esto no salen correos).

**sitio**:
- Compilación (`ARG` del Dockerfile): `PUBLIC_LH_PLATFORM=https://cursos.sanarycriarve.com`, `PUBLIC_LH_API=https://cursos.sanarycriarve.com/api/v1`, `PUBLIC_LH_ORG_ID=1`, `PUBLIC_SITE_URL=https://www.sanarycriarve.com`, y opcionales `PUBLIC_FREE_CLASS_URL`, `PUBLIC_BOOKING_URL`.
- Ejecución (Caddy): `PORT=8080`, `SITE_ORIGIN=https://www.sanarycriarve.com`, `PLATFORM_ORIGIN=https://cursos.sanarycriarve.com`, `APEX_HOST=sanarycriarve.com`.

## Dominios y DNS (Namecheap)

Cada dominio propio se agrega en Railway (`railway domain <dominio> -s <servicio> -p <puerto>`), que devuelve el destino y un TXT de verificación:

| Tipo | Host | Valor |
|---|---|---|
| CNAME | `www` | destino que da Railway para el servicio `sitio` |
| ALIAS | `@` | destino que da Railway (Namecheap no permite CNAME en la raíz) |
| CNAME | `cursos` | destino que da Railway para `plataforma` |
| TXT | `_railway-verify.www`, `_railway-verify`, `_railway-verify.cursos` | `railway-verify=…` de cada dominio |

- Si borras y vuelves a agregar un dominio en Railway, **cambia el destino del CNAME/ALIAS** (el TXT se mantiene): actualiza el registro en Namecheap.
- Crea los registros DNS **en cuanto agregues el dominio**. Si Railway intenta validar antes de que existan, Let's Encrypt cuenta los intentos fallidos y puede bloquear el certificado de ese nombre unas horas ("Let's Encrypt rate limit reached"). Se resuelve solo; `railway domain certificate retry <dominio> -s <servicio>` reintenta cuando el bloqueo ya pasó.
- Comprobar: `railway domain status <dominio> -s <servicio>`.

## Operación

- **Actualizar la plataforma:** publica una etiqueta nueva del fork (`sc-vX.Y.Z`, la imagen la construye GitHub Actions) y cambia la imagen: `railway service source connect --image ghcr.io/edgardperez-code/sanarycriar-lms:sc-vX.Y.Z -s plataforma`. Las tablas nuevas las crea el arranque; si una versión trae migraciones de Alembic sobre tablas existentes, ejecútalas antes (ver `docs/despliegue.md` §10).
- **Actualizar el sitio:** desde la carpeta `sanarycriar`: `railway up web --path-as-root -s sitio -d`. Cambiar variables `PUBLIC_*` también exige volver a subirlo (se usan al compilar).
- **Configurar la organización** (idempotente; usa las credenciales guardadas en Railway sin mostrarlas):
  ```bash
  railway run -s plataforma python deploy/scripts/configurar-organizacion.py --api https://cursos.sanarycriarve.com/api/v1 --web https://cursos.sanarycriarve.com
  ```
  Después de entrar por primera vez y cambiar la contraseña desde el panel, borra `LEARNHOUSE_INITIAL_ADMIN_PASSWORD` en Railway; para este script usa entonces `--email` y escribe la contraseña cuando la pida.
- **Tras cambiar de dominio:** la API guarda `instance/info` (dominio del frontend) en Redis 10 minutos; espera ese tiempo antes de comprobar.
- **Respaldos:** activa los respaldos de volumen de Railway en `postgres` y `plataforma` (Settings → Backups) y descarga de vez en cuando un `pg_dump` (`railway connect postgres`).
- **Git Bash en Windows:** antepón `MSYS_NO_PATHCONV=1` a los comandos de `railway` que lleven rutas que empiezan con `/` (por ejemplo `-m /data`), o Git Bash las convierte en rutas de Windows.

## Pendiente

- Certificado de `sanarycriarve.com` (raíz): bloqueado temporalmente por Let's Encrypt; los DNS ya están bien.
- Correo saliente (Resend con el dominio verificado: SPF/DKIM) y buzón para el correo de la administradora.
- Credenciales de PayPal (primero sandbox) en el panel: Pagos → Configuración. La URL del webhook la muestra esa misma pantalla.
