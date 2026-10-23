# Despliegue en producción

Guía paso a paso para poner en línea Sanar y Criar en un solo VPS. Todo lo que se menciona está en `deploy/` (resumen en `deploy/README.md`).

```
Internet ──► Caddy :80/:443 (HTTPS automático)
              ├─ www.sanarycriarve.com ........ sitio Astro estático (/opt/sanarycriar/www/current)
              ├─ sanarycriarve.com ............ 301 → www
              └─ cursos.sanarycriarve.com ..... learnhouse-app (Next.js + API + collab, imagen del fork)
                                                 ├─ db (Postgres 16 + pgvector)
                                                 └─ redis
```

Rutas: "en tu PC" = la carpeta del proyecto `sanarycriar/`; "en el servidor" = `/opt/sanarycriar`, donde vive una copia de `deploy/`.

---

## 1. Antes de empezar

- **VPS**: Ubuntu 24.04, 4 GB de RAM, 2–3 vCPU, 80 GB de SSD o más (los videos ocupan espacio: cuenta ~1,5× el tamaño de los originales por la versión HLS). Con IPv4 fija.
- **Dominio**: `sanarycriarve.com` (en Namecheap), con acceso a su DNS. El dominio anterior, `psicoinfantilve.com`, se da de baja y no forma parte del despliegue.
- **Cuentas**: GitHub (para el repositorio público del fork y la imagen), PayPal **Business** verificada, Resend (o cualquier SMTP) para el correo.
- **En tu PC**: Git, Docker (solo si quieres probar en local), Node 22.12+ y npm (para compilar el sitio), `ssh`.

## 2. Publicar el código del fork y su imagen

1. Crea en GitHub el repositorio **público** del fork (por ejemplo `TU_USUARIO/learnhouse`) y sube la rama `sanarycriar` con todos los cambios. Debe ser público: lo exige la licencia AGPL (sección 13).
2. El flujo `.github/workflows/sanarycriar-image.yml` construye la imagen en cada push a `sanarycriar` y en cada etiqueta `sc-v*`, y la publica en `ghcr.io/TU_USUARIO/sanarycriar-lms`.
3. Para cada versión que vayas a desplegar, crea una etiqueta:
   ```bash
   cd learnhouse
   git tag sc-v1.0.0 && git push origin sc-v1.0.0
   ```
   Usa siempre el prefijo `sc-v`: una etiqueta que empieza por número dispara el flujo `release.yaml` de LearnHouse, que en el fork falla.
4. Espera a que la acción termine en verde (pestaña Actions, ~10–15 min la primera vez).
5. En GitHub → tu perfil → Packages → `sanarycriar-lms` → Package settings: pon la visibilidad en **Public** (así el servidor la descarga sin contraseña). Si prefieres dejarla privada, en el servidor haz `docker login ghcr.io` con un token de GitHub con permiso `read:packages`.
6. En Settings → Actions del fork puedes desactivar los flujos de LearnHouse que no aplican (Release, Notify Infrastructure, Build Community Images). No es obligatorio.

No construyas la imagen en el VPS: la compilación de Next.js necesita más memoria de la que conviene quitarle a producción.

## 3. DNS

Crea estos registros (TTL 300 mientras pruebas):

| Tipo | Nombre | Valor |
|---|---|---|
| A | `sanarycriarve.com` (`@`) | IP del VPS |
| A | `www` | IP del VPS |
| A | `cursos` | IP del VPS |

- Si el VPS tiene IPv6, añade también registros AAAA; si no, no los crees.
- **Cloudflare**: deja los registros en **"DNS only" (nube gris)**, como mínimo `cursos`. El proxy gratuito de Cloudflare corta las subidas de más de 100 MB, y los videos pesan más. Caddy ya pone HTTPS.
- Los registros de correo (SPF/DKIM) van en la sección 6.
- Comprueba: `nslookup cursos.sanarycriarve.com` debe devolver la IP del VPS antes del primer arranque; si no, Caddy no puede obtener los certificados.

## 4. Preparar el VPS

Conectado como root la primera vez:

```bash
# Usuario de trabajo con tu llave SSH
adduser sanarycriar && usermod -aG sudo sanarycriar
rsync --archive --chown=sanarycriar:sanarycriar ~/.ssh /home/sanarycriar   # o copia tu llave pública

# Actualizaciones, hora local y actualizaciones automáticas de seguridad
apt update && apt -y upgrade
timedatectl set-timezone America/Caracas
apt -y install unattended-upgrades ufw curl ca-certificates
dpkg-reconfigure -plow unattended-upgrades

# Cortafuegos: SSH, HTTP, HTTPS (y HTTP/3)
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable

# 2 GB de swap (colchón para la conversión de videos)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Docker (repositorio oficial)
curl -fsSL https://get.docker.com | sh
usermod -aG docker sanarycriar

# Carpeta de la aplicación
mkdir -p /opt/sanarycriar && chown sanarycriar:sanarycriar /opt/sanarycriar
```

Opcional pero recomendado: en `/etc/ssh/sshd_config` pon `PasswordAuthentication no` y `PermitRootLogin no`, y reinicia con `systemctl restart ssh` (antes comprueba que entras con tu llave como `sanarycriar`).

Desde tu PC, copia el kit de despliegue (sin `www/` ni secretos):

```bash
scp -r deploy/docker-compose.prod.yml deploy/caddy deploy/scripts deploy/.env.example deploy/README.md \
    sanarycriar@IP-DEL-VPS:/opt/sanarycriar/
ssh sanarycriar@IP-DEL-VPS 'chmod +x /opt/sanarycriar/scripts/*.sh && mkdir -p /opt/sanarycriar/www /opt/sanarycriar/backups'
```

## 5. Primer despliegue

En el servidor (`ssh sanarycriar@IP-DEL-VPS`, luego `cd /opt/sanarycriar`):

1. **Variables**:
   ```bash
   cp .env.example .env && chmod 600 .env
   nano .env
   ```
   Cambia todo lo que dice `CAMBIAR`: imagen (`SC_LMS_IMAGE`, `SC_LMS_TAG=sc-v1.0.0`), correo para Let's Encrypt, contraseña de Postgres, los tres secretos (`openssl rand -hex 32` para cada uno), correo y contraseña de la administradora inicial, API key de Resend y la URL del código fuente (`NEXT_PUBLIC_SC_SOURCE_URL`). El archivo explica cada variable. Guarda una copia de `.env` en tu gestor de contraseñas: sin estos secretos una copia de seguridad no sirve.
2. **Sitio de marketing** (desde tu PC; ver sección 9):
   ```bash
   deploy/scripts/deploy-sitio.sh sanarycriar@IP-DEL-VPS
   ```
3. **Plataforma** (en el servidor):
   ```bash
   ./scripts/actualizar.sh
   ```
   Descarga las imágenes, arranca todo, espera a que la plataforma esté sana y marca la base de datos para las migraciones futuras (`alembic stamp heads`). La primera vez Caddy tarda unos segundos en obtener los certificados.
4. **Comprueba**: `https://www.sanarycriarve.com`, `https://sanarycriarve.com` (redirige a www), `https://cursos.sanarycriarve.com` y `https://cursos.sanarycriarve.com/api/v1/health` (debe decir que está bien).
5. **Entra** en `https://cursos.sanarycriarve.com/login` con la administradora inicial, cambia la contraseña desde tu perfil y luego borra `LEARNHOUSE_INITIAL_ADMIN_PASSWORD` de `.env` (solo se usa en el primer arranque).
6. **Marca e idioma de la organización** (desde tu PC, con Python 3.9+):
   ```bash
   python deploy/scripts/configurar-organizacion.py --api https://cursos.sanarycriarve.com/api/v1 \
       --web https://cursos.sanarycriarve.com --email TU_CORREO_ADMIN --simular   # ver qué cambia
   python deploy/scripts/configurar-organizacion.py --api https://cursos.sanarycriarve.com/api/v1 \
       --web https://cursos.sanarycriarve.com --email TU_CORREO_ADMIN            # aplicar
   ```
   Pone el español por defecto, colores, menú, SEO y logos, y apaga las funciones que no usamos (biblioteca, pódcasts, comunidades, espacios interactivos, tableros e IA). Pide la contraseña sin mostrarla.
7. **Copias automáticas** (sección 10) y **correo** (sección 6).

## 6. Correo con el dominio sanarycriarve.com

La plataforma envía bienvenida, enlaces de acceso, recuperación de contraseña y confirmaciones de compra desde `no-responder@sanarycriarve.com`. Sin SPF/DKIM esos correos acaban en spam.

Con **Resend** (recomendado):
1. resend.com → Domains → Add domain → `sanarycriarve.com`.
2. Resend muestra los registros exactos que debes crear en tu DNS. Normalmente son: un `MX` y un `TXT` de SPF en el subdominio `send` (`v=spf1 include:amazonses.com ~all`) y un `TXT` de DKIM en `resend._domainkey`. Cópialos tal cual (en Cloudflare, "DNS only").
3. Añade también DMARC: `TXT` en `_dmarc` con `v=DMARC1; p=none; rua=mailto:TU_CORREO`. Cuando todo funcione unas semanas, puedes subirlo a `p=quarantine`.
4. Espera a que Resend marque el dominio como verificado. Crea una API key con permiso "Sending access" y ponla en `.env` (`LEARNHOUSE_RESEND_API_KEY`).
5. Aplica: `docker compose -f docker-compose.prod.yml up -d` (recrea la plataforma con el valor nuevo).
6. Prueba: en `https://cursos.sanarycriarve.com/login` usa "¿Olvidaste tu contraseña?" con tu correo y revisa que llegue (y que no esté en spam).

Con otro proveedor SMTP (Brevo, Zoho, Google Workspace...): usa la opción B de `.env` y crea los registros SPF/DKIM que te indique. Si el dominio ya tiene un SPF en la raíz (por ejemplo, del buzón de Hilda), no crees un segundo: añade el `include:` del proveedor al existente.

## 7. PayPal Live

### 7.1 En PayPal
1. Cuenta **Business** verificada (identidad y correo). En Configuración → Pagos → Preferencias de recepción, acepta pagos en **USD** automáticamente (si no, quedan "pendientes" hasta que los aceptes a mano).
2. [developer.paypal.com](https://developer.paypal.com) → inicia sesión con la cuenta Business → **Apps & Credentials** → pestaña **Live** → **Create App** (tipo Merchant). Copia el **Client ID** y el **Secret**. En las funciones de la app deja activado aceptar pagos y, si aparece, el pago como invitado con tarjeta.
3. En la misma app → **Webhooks** → **Add Webhook**:
   - URL: `https://cursos.sanarycriarve.com/api/v1/payments/webhooks/paypal/1` (el `1` es el id de la organización; el panel de la plataforma te muestra la URL exacta en la tarjeta de PayPal).
   - Eventos: `Checkout order approved`, `Payment capture completed`, `Payment capture pending`, `Payment capture declined`, `Payment capture denied`, `Payment capture refunded`, `Payment capture reversed`.
   - Guarda y copia el **Webhook ID**.

### 7.2 En la plataforma
Panel → **Pagos** → **Configuración** → **Conectar PayPal**: pega Client ID, Secret y Webhook ID, elige **Entorno: Producción (live)** y guarda. La plataforma valida las credenciales con PayPal; la tarjeta debe quedar "Conectado".

En producción (live) el **Webhook ID es obligatorio**: sin él la plataforma no guarda la configuración, porque los reembolsos y contracargos solo retiran el acceso a través del webhook. Además, una vez al día la plataforma revisa en PayPal los pagos de los últimos 180 días y retira el acceso de los que se reembolsaron por completo o se revirtieron (respaldo por si un webhook se pierde).

### 7.3 Probar antes de vender
1. **Primero en sandbox, fuera de producción**: la prueba completa como compradora (registro, paywall, PayPal, tarjeta, cancelar a mitad de camino, correo) se hace en tu PC con el entorno local (`docs/desarrollo-local.md`) o con el kit de la sección 15, con la app y el webhook de la pestaña **Sandbox** de PayPal (las cuentas de prueba están en Sandbox → Accounts).
   - En producción, mientras la tarjeta de PayPal está en **Entorno: Pruebas (sandbox)**, la tienda queda en **modo de pruebas**: solo las administradoras pueden comprar (para comprobar credenciales, URL de retorno, webhook y correo), el resto ve "La tienda está en modo de pruebas" y la página de la oferta lo avisa. Esas ventas quedan marcadas como "Prueba" en Pagos y no cuentan en los ingresos.
   - Si haces esa prueba en producción, usa una oferta "(borrar)" no listada sobre un curso "(borrar)", y al terminar ejecuta `scripts/limpiar-datos-de-prueba.py` (sección 13).
2. **Luego en live**: Editar credenciales → pon las de Live y **Entorno: Producción**. Crea una oferta de 1 USD (el mínimo), cómprala con una tarjeta real, comprueba el acceso, reembólsala desde PayPal (el acceso se revoca solo) y archiva la oferta.
3. No pongas `LEARNHOUSE_PAYPAL_*` en `.env`: son solo para el simulador local.

## 8. Cursos, ebooks y ofertas (resumen)

1. **Curso o ebook**: Panel → Cursos → Nuevo. En la pestaña General elige **Tipo de producto: Curso** o **Ebook** (un ebook es un curso con una lección PDF). Sube portada, capítulos y lecciones (videos o PDF). Los videos se convierten a HLS en segundo plano: mientras tanto se ve el MP4 original.
2. **Publícalo** y déjalo **público** si quieres que su ficha y sus lecciones gratis se vean sin cuenta.
3. **Oferta**: Pagos → Ofertas → Nueva: nombre, precio en USD (mínimo 1), pago único, y en recursos añade el curso o ebook. Desde ese momento el curso está **a la venta**: solo entra quien lo compró (y las administradoras). Un curso sin ninguna oferta activa es **gratis** para cualquier cuenta: no archives la única oferta de un curso de pago sin darte cuenta.
4. El catálogo de `www.sanarycriarve.com/cursos` muestra las ofertas listadas automáticamente (el navegador lo actualiza; vuelve a publicar el sitio de vez en cuando para que el HTML también lo traiga).

## 9. Sitio de marketing

Desde tu PC:

```bash
cp deploy/sitio.env.example deploy/sitio.env    # solo si quieres cambiar algo (enlace de clase gratuita, agenda...)
deploy/scripts/deploy-sitio.sh sanarycriar@IP-DEL-VPS
```

- Compila `web/` con las variables `PUBLIC_*` de producción y sube el resultado a `/opt/sanarycriar/www/releases/<fecha>/`; al final cambia el enlace `www/current`. Se ven los cambios al instante, sin reiniciar nada. Guarda las 5 últimas versiones.
- Se niega a publicar si el catálogo de la plataforma todavía tiene ofertas de prueba "(borrar)" (`--forzar` para saltarlo).
- Volver a la versión anterior (en el servidor): `cd /opt/sanarycriar/www && ls releases && ln -sfn releases/FECHA current`.
- Publica de nuevo cada vez que cambies textos, artículos del blog, testimonios o legales (`web/README.md`).

## 10. Actualizaciones y copias de seguridad

### Actualizar la plataforma
1. En tu PC: cambios en `learnhouse/` (rama `sanarycriar`), push, etiqueta nueva `sc-v1.1.0` y espera a que la acción termine.
2. En el servidor: `./scripts/actualizar.sh sc-v1.1.0`
   - copia de la base de datos → descarga la imagen → migraciones (`alembic upgrade heads`) **antes** de arrancar la versión nueva → arranque y espera a que esté sana;
   - si la base nunca se marcó (instalaciones antiguas), primero la marca con la versión que está corriendo.
3. Volver atrás: `./scripts/actualizar.sh sc-v1.0.0`.
   - Si la versión nueva ya migró la base de datos, el script se detiene en las migraciones (la versión anterior no conoce el esquema nuevo) y deja todo como estaba. Entonces restaura la copia `_db` que se hizo **al actualizar a la versión nueva** (no la más reciente, que ya tiene el esquema nuevo) indicando la versión a la que vuelves: `./scripts/restaurar.sh backups/FECHA_db --solo-db --version=sc-v1.0.0`.
   - Lo ocurrido después de esa copia (compras, cuentas nuevas, progreso) se pierde; anótalo antes desde el panel y PayPal.
4. **Nunca** uses `npx learnhouse update`: reemplaza la imagen por la de LearnHouse (sin pagos, sin marca).
5. Para traer una versión nueva de LearnHouse: en `learnhouse/`, `git fetch` de upstream y fusiona su etiqueta en `sanarycriar`, resuelve conflictos (los cambios propios están marcados con "Sanar y Criar:"), prueba en local y sigue los pasos 1–2.

### Copias de seguridad
- Manual: `./scripts/backup.sh` → `backups/FECHA/` con la base de datos (`db.dump`), los archivos subidos (`content.tar.gz`), una copia de `.env` y `SHA256SUMS`. Borra las de más de `SC_BACKUP_KEEP_DAYS` días (14).
- Diaria (en el servidor, `crontab -e`):
  ```
  15 3 * * * /opt/sanarycriar/scripts/backup.sh
  ```
  Cuando corre sin terminal (cron) escribe su salida en `backups/backup.log` y crea la carpeta si no existe. Revisa ese archivo la primera mañana: `tail backups/backup.log` debe terminar en "Copia lista".
- **Fuera del servidor**: una copia que vive solo en el VPS no protege de perder el VPS. Instala rclone (`apt install rclone`, `rclone config` con Backblaze B2, Google Drive, etc.) y pon `SC_BACKUP_RCLONE_REMOTE=remoto:carpeta` en `.env` (una carpeta solo para esto: allí también se borran las copias de más de `SC_BACKUP_KEEP_DAYS` días). La copia que sale del servidor **nunca incluye `.env`** (guárdalo en tu gestor de contraseñas) y **siempre va cifrada**; si no, `backup.sh` no sube nada:
  - con **age** (recomendado): `sudo apt install age` en el servidor; en tu PC `age-keygen -o respaldo.key` y guarda `respaldo.key` en tu gestor de contraseñas (no en el servidor); pon la clave pública (`age1…`) en `SC_BACKUP_AGE_RECIPIENT`. Se suben `db.dump.age` y `content.tar.gz.age`.
  - o con un remoto de rclone de tipo **crypt** (rclone cifra por su cuenta).
- Restaurar: `./scripts/restaurar.sh backups/FECHA` (pide escribir RESTAURAR; antes hace una copia del estado actual). Opciones `--solo-db` y `--solo-contenido`. Desde una copia cifrada con age: bájala con `rclone copy remoto:carpeta/FECHA backups/FECHA`, descífrala con `age -d -i respaldo.key -o backups/FECHA/db.dump backups/FECHA/db.dump.age` (igual con `content.tar.gz.age`) y restaura. Prueba una restauración de vez en cuando (por ejemplo en un VPS de prueba).
- Si cambias `LEARNHOUSE_AUTH_JWT_SECRET_KEY` (por ejemplo porque se filtró), además de cerrarse todas las sesiones hay que volver a pegar el Secret de PayPal en **Pagos → Configuración** (se guarda cifrado con una clave derivada de ese secreto); si el secreto se filtró, rota también el Secret de la app en PayPal.
- Los certificados (volumen `caddy_data`) no hace falta respaldarlos: Caddy los vuelve a pedir.

### Comandos útiles (en `/opt/sanarycriar`)
```bash
docker compose -f docker-compose.prod.yml ps                       # estado
docker compose -f docker-compose.prod.yml logs -f --tail 100 learnhouse-app
docker compose -f docker-compose.prod.yml logs --tail 100 caddy    # certificados, errores de proxy
docker compose -f docker-compose.prod.yml restart learnhouse-app
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
docker stats --no-stream                                            # memoria por servicio
df -h /var/lib/docker                                               # espacio en disco (videos)
```

## 11. Obligaciones AGPL-3.0

La plataforma es software libre (LearnHouse, AGPL-3.0) y se ofrece a usuarias por la red, así que:
- El repositorio del fork debe seguir **público** y contener **exactamente** el código que corre en producción: sube la rama y la etiqueta antes de desplegarla (el flujo de CI ya construye desde el repositorio público).
- El pie de la plataforma enlaza a "Código fuente" (`NEXT_PUBLIC_SC_SOURCE_URL`). Mantén esa URL apuntando al repositorio (rama `sanarycriar` o la etiqueta desplegada).
- Conserva `LICENSE` y los avisos de copyright de LearnHouse en el código. Nuestros cambios se publican bajo la misma licencia.
- No hace falta publicar los datos, el `.env` ni el contenido de los cursos: la licencia cubre el código.
- El sitio de marketing (`web/`) es un programa aparte que solo enlaza a la plataforma; no le aplica esta obligación.

## 12. Dominio anterior (psicoinfantilve.com)

`psicoinfantilve.com` se da de baja: el despliegue no lo sirve ni lo redirige, y Caddy no pide certificados para él. Los enlaces viejos (biografía de Instagram, publicaciones, Google) dejarán de funcionar cuando el dominio desaparezca, así que actualízalos a `www.sanarycriarve.com` antes. Antes de borrarlo, apaga también el backend anterior (Replit/Supabase).

## 13. Lista para salir en vivo

- [ ] Repositorio del fork público, rama y etiqueta `sc-v…` subidas; imagen publicada y `SC_LMS_TAG` apuntando a esa etiqueta.
- [ ] DNS de los tres nombres (`@`, `www`, `cursos`) apuntando al VPS.
- [ ] `https://` funciona en los tres nombres; `sanarycriarve.com` redirige a www.
- [ ] `.env` sin `CAMBIAR`, con `chmod 600`, copia guardada en un gestor de contraseñas; contraseña inicial de la administradora cambiada y borrada de `.env`.
- [ ] Organización configurada con `configurar-organizacion.py` (español, marca, menú, funciones no usadas apagadas).
- [ ] Correo verificado (SPF/DKIM/DMARC) y probado con "¿Olvidaste tu contraseña?".
- [ ] **Sin datos de prueba**: ningún curso u oferta "(borrar)" ni cuentas `@example.com` (si probaste en producción: `scripts/backup.sh` y luego `scripts/limpiar-datos-de-prueba.py --permitir-produccion`, primero en simulación). Ofertas de prueba **archivadas**.
- [ ] Cursos y ebooks reales publicados, cada uno con su oferta y precio confirmados por Hilda.
- [ ] Páginas legales (`/terminos`, `/privacidad`, `/reembolsos`) completadas, revisadas con asesoría legal y con `draft: false` (`web/src/data/legal.json`); sitio publicado de nuevo.
- [ ] Foto real de Hilda en buena resolución en el sitio (`web/README.md` → Fotos y marca).
- [ ] Enlaces reales de la clase gratuita y de agenda en `deploy/sitio.env` (o confirmado que van a WhatsApp).
- [ ] PayPal: compra completa en **sandbox** en tu PC (PayPal y tarjeta, cancelación) y luego en **live** con 1 USD + reembolso; webhook live creado y Webhook ID en el panel; preferencias de recepción en USD; la tarjeta de PayPal en **Producción (live)** (la tienda no muestra "modo de pruebas").
- [ ] Copias de seguridad diarias en cron (`backups/backup.log` termina en "Copia lista"), copia fuera del servidor cifrada (age o rclone crypt) y una restauración probada.
- [ ] Enlace "Código fuente" del pie abre el repositorio público.
- [ ] Search Console con el sitemap `https://www.sanarycriarve.com/sitemap-index.xml` y el cambio de dirección del dominio viejo.
- [ ] Más adelante: Pago Móvil con SPIDI (se añadirá como otro proveedor de pago).

## 14. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El navegador dice que el certificado no es válido / Caddy registra errores ACME | El DNS no apunta al VPS o el puerto 80/443 está cerrado | `nslookup`, `ufw status`; luego `docker compose ... restart caddy` |
| 502 en `cursos` | La plataforma está arrancando o se cayó | `docker compose ... ps` y `logs learnhouse-app` |
| Subir un video grande falla | Proxy de Cloudflare (límite 100 MB) o disco lleno | `cursos` en "DNS only"; `df -h` |
| El catálogo de www sale "Muy pronto" | No hay ofertas listadas, o el curso no está publicado | Revisa la oferta y el curso; `LEARNHOUSE_EXTRA_CORS_ORIGINS` incluye www |
| No llegan correos | Dominio sin verificar o API key equivocada | Panel de Resend → Logs; `logs learnhouse-app` |
| Los pagos quedan "en revisión" | Preferencias de recepción de PayPal o revisión de PayPal | Acepta USD automáticamente; la conciliación cada 5 min y el webhook entregan el acceso cuando PayPal confirma. Mientras tanto la compradora ve "Tu pago está en revisión" y no puede pagar dos veces |
| En Pagos aparece "Cobro duplicado: reembolsar" | La misma persona pagó dos veces la misma oferta (por ejemplo, un pago antiguo en revisión que se confirmó tarde) | Reembolsa ese cobro desde PayPal; el acceso se mantiene con el otro pago |
| La tienda dice "modo de pruebas" | La tarjeta de PayPal está en Entorno: Pruebas (sandbox) | Pagos → Configuración → Editar credenciales → credenciales Live y Entorno: Producción |
| `actualizar.sh` dice que la base "espera" otra versión de Alembic | Las migraciones no se aplicaron | Mira los logs del paso 3 y ejecuta el `alembic upgrade heads` que muestra el mensaje |
| Enlaces de correo apuntan a `localhost` | Falta `LEARNHOUSE_FRONTEND_DOMAIN` / `LEARNHOUSE_SSL` | Revisa `.env` y `up -d` |

## 15. Probar el kit en tu PC

`deploy/local-smoke/smoke.sh` levanta todo el kit en tu computadora con la imagen construida localmente (`docker build -t sanarycriar/lms:local learnhouse`), Caddy con certificados locales en `127.0.0.1:80/443` y el sitio de `web/dist`; comprueba salud, páginas, redirecciones, cabeceras, CORS, copia de seguridad, actualización y restauración, y lo borra todo al final (`--conservar` para dejarlo arriba). Usa su propio proyecto (`sanarycriar-smoke`) y no toca el entorno de desarrollo.
