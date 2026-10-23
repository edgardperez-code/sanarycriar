# Sitio de marketing de Sanar y Criar

Sitio estático de **www.sanarycriarve.com** (Hilda Hernández, psicóloga infanto-juvenil). Hecho con Astro, React (solo para el catálogo y el test de crianza) y Tailwind CSS. No tiene backend propio: los cursos y ebooks se venden en la plataforma de cursos (LearnHouse, `cursos.sanarycriarve.com`).

## Requisitos

Node 22.12 o superior (recomendado Node 24) y npm.

## Comandos

```bash
npm install          # instala dependencias
npm run dev          # servidor local en http://localhost:4321
npm run build        # genera el sitio estático en dist/
npm run preview      # sirve dist/ para revisarlo antes de publicar
npm run check        # revisa tipos y errores de Astro
npm run brand-assets # regenera favicon, íconos y og-image.png (scripts/generate-brand-assets.mjs)
```

## Variables de entorno

Todas son públicas (quedan en el HTML/JS). Copia `.env.example` a `.env` o defínelas en tu hosting. Sin variables se usan los valores de producción.

| Variable | Por defecto | Para qué sirve |
|---|---|---|
| `PUBLIC_LH_PLATFORM` | `https://cursos.sanarycriarve.com` | Plataforma de cursos (enlaces "Ver curso", "Entrar"). |
| `PUBLIC_LH_API` | `{PUBLIC_LH_PLATFORM}/api/v1` | API de LearnHouse para leer el catálogo. |
| `PUBLIC_LH_ORG_ID` | `1` | Id de la organización en LearnHouse. |
| `PUBLIC_SITE_URL` | `https://www.sanarycriarve.com` | Dominio canónico (SEO, sitemap). |
| `PUBLIC_FREE_CLASS_URL` | vacío | Enlace de la clase gratuita. Vacío = abre WhatsApp con un mensaje. |
| `PUBLIC_BOOKING_URL` | vacío | Enlace para agendar consultas (Cal.com, Google Calendar...). Vacío = WhatsApp. |

`npm run dev` lee `.env.development`, que apunta a la API y la plataforma locales (`http://localhost:1338/api/v1` y `http://localhost:3200`). `npm run build` no usa ese archivo.

Los demás datos (WhatsApp, Instagram, FPV, textos de botones) están en un solo archivo: `src/site.config.ts`.

## Catálogo de cursos y ebooks

Se lee de `GET {PUBLIC_LH_API}/payments/{PUBLIC_LH_ORG_ID}/offers/public-listing`:

- Al compilar (`npm run build`), si la API responde, el HTML ya trae los productos.
- En el navegador se vuelve a consultar, así que los productos nuevos aparecen sin volver a publicar el sitio.
- Si la API no responde o no hay ofertas, se muestra "Muy pronto" con el botón de la clase gratuita.
- Cada tarjeta lleva a `{PUBLIC_LH_PLATFORM}/store/offers/{offer_uuid}`. Una oferta es "ebook" si todo lo que incluye es ebook; si no, va en "Cursos en video".

La API debe permitir CORS desde el dominio del sitio (`LEARNHOUSE_EXTRA_CORS_ORIGINS` en la plataforma).

## Publicar (hosting estático)

1. `npm run build`.
2. Sube la carpeta `dist/` a cualquier hosting estático (Cloudflare Pages, Netlify, Vercel, un bucket con CDN o nginx).
3. Las páginas se generan como `agenda.html`, `cursos.html`, etc., y las direcciones públicas no llevan `/` final (`/agenda`). Cloudflare Pages, Netlify y Vercel sirven `/agenda` desde `agenda.html` sin configurar nada. En nginx usa `try_files $uri $uri.html $uri/ =404;` y `error_page 404 /404.html;`.
4. Redirige `sanarycriarve.com` a `www.sanarycriarve.com`.

Para que el catálogo del HTML esté al día, vuelve a compilar de vez en cuando (por ejemplo, con un deploy programado); el navegador igual lo actualiza solo.

## Contenido

### Artículos del blog

1. Crea un archivo `.md` directamente en `src/content/blog/` (no en subcarpetas), por ejemplo `rabietas-que-hacer.md` (el nombre será la dirección `/blog/rabietas-que-hacer`).
2. Copia el encabezado de `src/content/blog/_EJEMPLO-articulo.md` (los archivos que empiezan con `_` no se publican) y completa `title`, `description` y `date`. Con `draft: true` el artículo no se publica.
3. Imágenes: ponlas en `public/images/blog/` y úsalas con `cover: /images/blog/archivo.jpg`.
4. Si `npm run dev` estaba abierto cuando agregaste el primer artículo, reinícialo.

Mientras no haya artículos, el enlace "Blog" no aparece en el menú y `/blog` queda fuera de Google.

### Testimonios

Solo testimonios **reales** y con **permiso escrito** de quien los da. Agrégalos en `src/data/testimonials.json` con el formato de `src/data/testimonials.EJEMPLO.json` y `"permiso": true`. Sin testimonios, la sección no se muestra y `/testimonios` queda fuera de Google.

### Páginas legales

`/terminos`, `/privacidad` y `/reembolsos` son plantillas. Completa los datos entre [corchetes], revísalas con asesoría legal y luego cambia `"draft": true` a `false` en `src/data/legal.json` (eso quita el aviso de borrador y las incluye en el sitemap).

### Fotos y marca

- Foto de Hilda: `src/assets/hilda-nobg.png` (recortada, fondo transparente). Si llega una versión en mejor resolución, reemplaza ese archivo y `public/images/hilda-nobg.png`, y corre `npm run brand-assets`.
- Colores, tipografías y botones: `src/styles/global.css` (tokens del manual de marca).
