# Sitio de marketing de Sanar y Criar

Sitio de **www.sanarycriarve.com** (Hilda Hernández, psicóloga infanto-juvenil). Hecho con Astro, React (solo para el catálogo, el test de crianza y el boletín) y Tailwind CSS. Casi todo son páginas estáticas; solo el blog lo genera un servidor Node (Astro con `@astrojs/node`) en cada visita. No tiene base de datos propia: los cursos y ebooks se venden en la plataforma de cursos (LearnHouse, `cursos.sanarycriarve.com`), y los artículos del blog se escriben y se guardan allí.

## Requisitos

Node 22.12 o superior (recomendado Node 24) y npm.

## Comandos

```bash
npm install          # instala dependencias
npm run dev          # servidor local en http://localhost:4321
npm run build        # genera dist/client (páginas estáticas) y dist/server (Node, para el blog)
npm run preview      # sirve el build con Node, como en producción
npm run check        # revisa tipos y errores de Astro
npm run test:newsletter # pruebas de la lógica del boletín (src/lib/newsletter.ts)
npm run test:blog    # pruebas del cliente del blog, el RSS y el sitemap (src/lib/blog.ts)
npm run brand-assets # regenera favicon, íconos y og-image.png (scripts/generate-brand-assets.mjs)
```

## Variables de entorno

Las `PUBLIC_*` son públicas (quedan en el HTML/JS) y se fijan al compilar. Copia `.env.example` a `.env` o defínelas en tu hosting. Sin variables se usan los valores de producción.

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `PUBLIC_LH_PLATFORM` | `https://cursos.sanarycriarve.com` | Plataforma de cursos (enlaces "Ver curso", "Entrar"). |
| `PUBLIC_LH_API` | `{PUBLIC_LH_PLATFORM}/api/v1` | API de LearnHouse para leer el catálogo. |
| `PUBLIC_LH_ORG_ID` | `1` | Id de la organización en LearnHouse. |
| `PUBLIC_SITE_URL` | `https://www.sanarycriarve.com` | Dominio canónico (SEO, sitemap). |
| `PUBLIC_FREE_CLASS_URL` | vacío | Enlace de la clase gratuita. Vacío = abre WhatsApp con un mensaje. |
| `PUBLIC_BOOKING_URL` | vacío | Enlace para agendar consultas (Cal.com, Google Calendar...). Vacío = WhatsApp. |

Y una solo de servidor, que se lee al arrancar Node (no se compila en el HTML):

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `LH_API_INTERNAL` | vacío (= `PUBLIC_LH_API`) | URL de la API que usa el servidor del sitio para leer el blog, por ejemplo una dirección de red privada. Opcional. |

`npm run dev` lee `.env.development`, que apunta a la API y la plataforma locales (`http://localhost:1338/api/v1` y `http://localhost:3200`). `npm run build` no usa ese archivo.

Los demás datos (WhatsApp, Instagram, FPV, textos de botones) están en un solo archivo: `src/site.config.ts`.

## Catálogo de cursos y ebooks

Se lee de `GET {PUBLIC_LH_API}/payments/{PUBLIC_LH_ORG_ID}/offers/public-listing`:

- Al compilar (`npm run build`), si la API responde, el HTML ya trae los productos.
- En el navegador se vuelve a consultar, así que los productos nuevos aparecen sin volver a publicar el sitio.
- Si la API no responde o no hay ofertas, se muestra "Muy pronto" con el botón de la clase gratuita.
- Cada tarjeta lleva a `{PUBLIC_LH_PLATFORM}/store/offers/{offer_uuid}`. Una oferta es "ebook" si todo lo que incluye es ebook; si no, va en "Cursos en video".

La API debe permitir CORS desde el dominio del sitio (`LEARNHOUSE_EXTRA_CORS_ORIGINS` en la plataforma).

## Boletín

Quien visita el sitio puede dejar su correo para recibir el boletín. Los correos se guardan en la plataforma de cursos y, si allí está configurado Resend, se copian a los contactos de Resend para enviar boletines desde Resend → Broadcasts (Resend agrega el enlace para darse de baja).

- **Ventana emergente** (`src/components/islands/NewsletterPopup.tsx`, montada en `BaseLayout.astro`): pide solo el correo. Se cierra con la X, con "Ahora no", con Esc o con un clic fuera. En el celular aparece como una hoja desde abajo.
- **Formulario del pie** (`src/components/islands/NewsletterFooterForm.tsx`, en `Footer.astro`): está en todas las páginas, para quien cerró la ventana. Funciona aunque la ventana esté desactivada.
- **Dónde no aparece la ventana:** en `/privacidad`, `/terminos`, `/reembolsos` y la página 404. Se apaga con `newsletter={false}` en `BaseLayout` (ya lo hacen `LegalLayout.astro` y `404.astro`).
- **Panel "Boletín" de la plataforma:** activa o desactiva la ventana y edita sus textos, el retraso en segundos (0 = de inmediato) y los días sin volver a mostrarla. Ahí también está la lista de suscriptores, con búsqueda, exportación a CSV y eliminar. Los cambios se ven en el sitio sin volver a publicarlo.
- **Qué recuerda el navegador** (almacenamiento local, nunca se envía):
  - `sanarycriar:boletin:suscrito:v1` (`{"at": <ms>}`): ya se suscribió; la ventana no vuelve a salir en ese navegador.
  - `sanarycriar:boletin:cerrado:v1` (`{"until": <ms>}`): cerró la ventana; no vuelve a salir hasta esa fecha.
  - Si el navegador no permite guardar (por ejemplo, algunos modos privados), la ventana no se muestra. Para volver a verla después de cerrarla, abre el sitio en una ventana privada o borra esas claves.
- **API:** `GET {PUBLIC_LH_API}/newsletter/{PUBLIC_LH_ORG_ID}/public-config` (textos y si está activa) y `POST {PUBLIC_LH_API}/newsletter/{PUBLIC_LH_ORG_ID}/subscribe` (el correo va en el cuerpo, nunca en la dirección). Si la API no responde o la ventana está desactivada, no se muestra nada. Igual que el catálogo, la API debe admitir el dominio del sitio en `LEARNHOUSE_EXTRA_CORS_ORIGINS`; para esa única ruta de suscripción acepta también `POST` sin credenciales.
- La lógica (validación del correo, cuándo mostrar la ventana, llamadas a la API) está en `src/lib/newsletter.ts` y se prueba con `npm run test:newsletter`.

## Publicar

El sitio ya no es solo estático: `/blog`, `/blog/*` y el bloque «Del blog» del inicio los genera Node en cada visita. Por eso se publica con el contenedor de `Dockerfile`:

- Compila Astro con las variables `PUBLIC_*` (argumentos de compilación).
- Dentro del contenedor, Caddy (`deploy/Caddyfile`) sirve las páginas estáticas de `dist/client` en `$PORT` (8080) con las cabeceras de seguridad, y pasa `/blog`, `/blog/*` y `/_server-islands/*` a Node (`dist/server/entry.mjs`) en `127.0.0.1:4321`. Los dos procesos los arranca `deploy/start.sh` (con tini); si uno se cae, el contenedor se reinicia.
- Las direcciones públicas no llevan `/` final (`/agenda`): Caddy redirige `/agenda/` → `/agenda`, `/ebooks` → `/cursos` y el dominio raíz (`APEX_HOST`) → `SITE_ORIGIN`.

Hoy se publica en Railway (`docs/despliegue-railway.md`). Un hosting solo estático (Cloudflare Pages, Netlify, un bucket) ya no sirve: no tendría el blog.

Para probar la imagen en tu PC (con la API local en el puerto 1338):

```bash
docker build -t sanarycriar/sitio --build-arg PUBLIC_LH_API=http://localhost:1338/api/v1 --build-arg PUBLIC_LH_PLATFORM=http://localhost:3200 --build-arg PUBLIC_SITE_URL=http://localhost:8081 .
docker run --rm -p 127.0.0.1:8081:8080 -e SITE_ORIGIN=http://localhost:8081 -e PLATFORM_ORIGIN=http://localhost:1338 -e LH_API_INTERNAL=http://host.docker.internal:1338/api/v1 sanarycriar/sitio
```

Para que el catálogo del HTML esté al día, vuelve a compilar de vez en cuando (por ejemplo, con un deploy programado); el navegador igual lo actualiza solo. El blog no necesita volver a publicarse.

## Contenido

### Artículos del blog

Los artículos se escriben en el panel de la plataforma de cursos: **Blog → Escribir artículo** o **Crear con IA** (la IA solo deja borradores; Hilda los revisa y decide si los publica). Lo que se publica allí se ve en el sitio **al instante**, sin volver a publicar el sitio. Ya no hay archivos Markdown en `src/content/blog`.

- `/blog` (12 artículos por página, `?pagina=2`…) y `/blog/{slug}` los genera Node en cada visita pidiéndolos a la API pública del blog (`GET {API}/blog/{org}/public/posts`, `…/posts/{slug}` y `…/public/sitemap`), con 5 s de espera como máximo. La lógica está en `src/lib/blog.ts` y se prueba con `npm run test:blog`.
- Si la API falla, se muestra la última copia buena que el servidor guarda en memoria (cabecera `X-Blog-Stale: 1`). Sin copia, `/blog` y los artículos responden 503 con «El blog no está disponible en este momento» y `Retry-After: 60`. Un artículo borrado o despublicado da 404.
- El inicio (estático) pide el bloque «Del blog» a Node al cargar (isla de servidor `src/components/BlogLatest.astro`); sin artículos o sin API, no muestra nada. «Blog» está siempre en el menú y en el pie; mientras no haya artículos, `/blog` dice «Estamos escribiendo los primeros artículos» y queda fuera de Google (`noindex`).
- Cada artículo lleva resumen, ideas clave, preguntas frecuentes (con su JSON-LD), el aviso «Este artículo es informativo y no sustituye una consulta profesional», y JSON-LD `BlogPosting`. El HTML del artículo llega ya saneado desde la API.
- `/blog/rss.xml` (últimos 30) y `/blog/sitemap.xml` (incluido en `sitemap-index.xml`) también se generan en cada visita.
- Las portadas son imágenes de la plataforma (la CSP del sitio ya permite `PLATFORM_ORIGIN`).

En `npm run dev` el blog lee `PUBLIC_LH_API` de `.env.development` (la API local). Para probarlo como en producción, con el servidor Node:

```bash
npm run build
LH_API_INTERNAL=http://localhost:1338/api/v1 npm run preview -- --port 4322    # http://localhost:4322/blog
```

(En PowerShell: `$env:LH_API_INTERNAL='http://localhost:1338/api/v1'; npm run preview -- --port 4322`.)

### Testimonios

Solo testimonios **reales** y con **permiso escrito** de quien los da. Agrégalos en `src/data/testimonials.json` con el formato de `src/data/testimonials.EJEMPLO.json` y `"permiso": true`. Sin testimonios, la sección no se muestra y `/testimonios` queda fuera de Google.

### Páginas legales

`/terminos`, `/privacidad` y `/reembolsos` son plantillas. Completa los datos entre [corchetes], revísalas con asesoría legal y luego cambia `"draft": true` a `false` en `src/data/legal.json` (eso quita el aviso de borrador y las incluye en el sitemap).

### Fotos y marca

- Foto de Hilda: `src/assets/hilda-nobg.png` (recortada, fondo transparente). Si llega una versión en mejor resolución, reemplaza ese archivo y `public/images/hilda-nobg.png`, y corre `npm run brand-assets`.
- Colores, tipografías y botones: `src/styles/global.css` (tokens del manual de marca).
