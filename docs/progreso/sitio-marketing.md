# Progreso: sitio de marketing (`sanarycriar/web`)

Dueño del área: todo lo que está bajo `sanarycriar/web/`. Especificación: `docs/spec-tecnica.md` §1 (marca) y §5 (sitio).

## Estado (2026-10-22, segundo ingeniero, continuación)

### Heredado del primer ingeniero (revisado y conservado)
- Astro 7.4.2 + @astrojs/react 7.1.1 + Tailwind 4.3.3 (`@tailwindcss/vite`) + @astrojs/sitemap 3.7.4, salida estática, TypeScript estricto. Son las últimas versiones estables en npm (comprobado con `npm view`). Fuentes autoalojadas con @fontsource (Poppins 400-700, Playfair 600 + itálica 500/600), con preload.
- `src/site.config.ts`: config única (plataforma, API, org id, WhatsApp, Instagram, FPV, clase gratuita, agenda), con `PUBLIC_*`. `.env.development` (API y plataforma locales) y `.env.example`.
- Páginas: `/`, `/cursos`, `/sobre-mi`, `/talleres`, `/test-de-crianza`, `/testimonios`, `/preguntas-frecuentes`, `/blog`, `/blog/[slug]`, `/agenda`, `/links`, `/terminos`, `/privacidad`, `/reembolsos`, `404`, `robots.txt`, redirección `/ebooks` → `/cursos`.
- Home: Hero (manual p.3, marco orgánico lavanda→rosa), Quién soy, Áreas, Talleres (9, cotización por WhatsApp), catálogo (isla React), test de crianza (isla React), FAQ, CTA final, pie.
- `scripts/generate-brand-assets.mjs` (satori + sharp): `favicon.svg` (monograma "SyC" rosa-300 sobre violeta), PNG de íconos y `og-image.png` 1200×630.
- Testimonios y blog: solo contenido real (archivos vacíos; plantillas `EJEMPLO` y `_EJEMPLO-articulo.md` que no se publican).
- Legales con aviso "Borrador: revisar con asesoría legal", `noindex` y fuera del sitemap mientras `src/data/legal.json` tenga `draft: true`.

### Hecho en esta sesión
- Detuve un `astro dev` huérfano del ingeniero anterior (puerto 4321) y levanté uno propio.
- Correcciones visuales tras capturas (1280 y 390) y comparación con el manual:
  - Cifras de Playfair en estilo "lining" (antes salían en estilo antiguo: "1oo%", "o9").
  - CTA principal con texto corto en móvil ("Reserva tu clase gratuita") para que quepa en una línea (Hero, CTA final, menú móvil, estado vacío, catálogo y resultado del test).
  - Acuarela (`.watercolor`) con desvanecido inferior: ya no corta en línea recta cuando la sección siguiente tiene el mismo fondo.
  - Separador fino entre el CTA final y el pie (ambos violeta).
  - Talleres: en móvil se oculta el número circular para dar ancho al título.
  - Test: menos relleno en móvil; "Volver a empezar" ya no se parte en dos líneas.
  - Catálogo: portada vacía con fondo lavanda→rosa suave (antes se confundía con el fondo lavanda de la sección del Home). Texto de pago más simple en el Home.
  - Espacios perdidos antes de enlaces/negritas al partir línea en el código (`o la política`, `escríbeme por WhatsApp`, `cursos cursos.sanarycriarve.com`, `Instagram @sanarycriarve`).
- URLs sin barra final en todo el sitio: `trailingSlash: 'never'` + `build.format: 'file'` (genera `agenda.html`). Canonical, sitemap y menú activo usan `routePath()` (`src/lib/nav.ts`). Antes el sitemap decía `/agenda/` y el canonical `/agenda`.
- `README.md` (español): comandos, variables, catálogo, publicación estática (incluye nginx), cómo agregar artículos, testimonios y cerrar los legales.
- Menú móvil: el enlace "WhatsApp +58…" apuntaba a `bookingHref` (habría llevado a la herramienta de agenda si se configura `PUBLIC_BOOKING_URL`); ahora siempre abre WhatsApp.
- Al terminar detuve todos los servidores que levanté (dev 4321, preview 4323, simuladores 4396-4399) y cerré mi pestaña del navegador.
- Decisión: con `build.format: 'file'`, `/agenda/` (con barra) da 404 en `astro preview` y quizá en algunos hostings; los enlaces del sitio nunca la usan. Si hace falta, agregar en el hosting una redirección `/:page/` → `/:page`.

### Verificado
- `npm run build`: 14 páginas, sin errores ni avisos (salvo el aviso esperado de catálogo inaccesible cuando se compila sin acceso a `cursos.sanarycriarve.com`).
- `npx astro check`: 0 errores, 0 avisos, 0 sugerencias.
- Dev en 4321: todas las páginas 200 (`/ebooks` 301, ruta inexistente 404 con página en español). `astro preview` sobre `dist/`: `/`, `/agenda`, `/cursos`, `/test-de-crianza`, `/blog`, `/ebooks` 200; inexistente 404.
- Menú móvil: abre, cambia la etiqueta a "Cerrar menú", se cierra con Escape y vuelve a abrir.
- Test de crianza: preguntas, opciones, intro, instrucciones y clave comparadas automáticamente con el texto original del cliente: todo coincide. Resultado probado en navegador (respuestas A,D,D,C,D,D,A,B,D,D,C,D,D,B,A → Consciente 9, Autoritaria 2, Permisiva 2, Reactiva 2), borrador en `localStorage` y restauración al recargar.
- Catálogo: API local real (`/payments/1/offers/public-listing` devuelve `[]` con CORS para `localhost:4321` y `127.0.0.1:4321`) → estado "Muy pronto". Con un simulador con la forma exacta de `offers.py::_public_offer`: en compilación salen 3 cursos y 2 ebooks con enlaces a `{plataforma}/store/offers/{offer_uuid}`; con la API caída al compilar, la isla los trae en el navegador (en `/cursos` y en el Home).
- Blog y testimonios probados con datos temporales (ya borrados): aparecen sección, menú, sitemap y JSON-LD `BlogPosting`; los testimonios sin `permiso: true` no salen.
- Contraste WCAG de pares de color de marca: todos AA (eyebrow rosa-600 sobre lavanda-100 = 4,50; cursiva lavanda-500 en títulos grandes ≥ 3,3).
- Metas OG/Twitter, canonical y JSON-LD (ProfessionalService + Person, WebSite, FAQPage, BreadcrumbList) válidos.

### Pendiente / decisiones para Hilda
- Enlace real de la clase gratuita (`PUBLIC_FREE_CLASS_URL`) y de agenda (`PUBLIC_BOOKING_URL`); hoy ambos abren WhatsApp con un mensaje.
- Completar los [corchetes] de los legales y revisarlos con asesoría legal; luego `draft: false`.
- Foto de Hilda en mejor resolución (la actual sale de un recorte circular de Instagram).
- Confirmar "Sanar y Criar" frente a "Sanar para Criar" para el curso insignia (el Hero no lo nombra todavía).

## Review (2026-10-22, revisor independiente)

Revisé el código de `web/`, corrí build/check, levanté `astro dev` (4321), probé el test en navegador, capturé Home (1280 y 390), `/cursos`, `/agenda`, `/links`, `/test-de-crianza` y `/privacidad` en móvil, y crucé el catálogo con `offers.py::_public_offer` y la API local (que ahora devuelve una oferta de prueba "Oferta de prueba (borrar)" creada por otro agente: la isla la muestra bien con enlace a `{plataforma}/store/offers/{uuid}`, que responde 200 en :3200).

Defectos corregidos:
- `favicon.svg` salía de 520×546 dentro de un viewBox de 512 (satori sin `box-sizing: border-box` + padding): la esquina inferior derecha quedaba cortada y la "C" pegada al borde. `scripts/generate-brand-assets.mjs`: `boxSizing: 'border-box'` y letras algo más pequeñas; regenerados favicon, íconos y OG.
- Miniaturas del catálogo: si la API devuelve `thumbnail_url` relativo (`/content/...`, pasa cuando el backend no tiene host de medios), se descartaba. Ahora se resuelve contra el origen de la API (`src/lib/catalog.ts`), manteniendo el filtro http/https.
- Test en `/test-de-crianza`: la pregunta y el resultado eran `h3` bajo un `h1` (salto de nivel). `ParentingQuiz` acepta `headingLevel`; `QuizSection` pasa `h2` cuando la sección es `h1`.
- 404 emitía `canonical` a `/404`. `BaseLayout` acepta `canonical={false}`; la 404 lo usa.
- Blog: un `.md` en una subcarpeta rompía el build ("Missing parameter: slug") porque el glob era `**/` y la ruta `[slug]` es de un segmento; y el sitemap incluía `/blog` con un artículo de fecha futura (la página salía vacía y `noindex`). Ahora solo archivos del nivel superior (glob, `content.ts`, `astro.config.mjs`) y el sitemap aplica las mismas reglas que `getPublishedPosts()` (sin borradores ni fechas futuras). README lo aclara. Probado con artículos temporales (futuro, subcarpeta, actual) y borrados.
- Home, talleres: el botón "Modalidades y talleres a la medida" se partía en dos líneas a 390 px; en móvil dice "Modalidades y más" y usa flecha de enlace interno (`ArrowRight`, no `ArrowUpRight`).

Verificado: `npx astro check` 0/0/0; `npm run build` 14 páginas sin errores; dev 200 en todas las rutas, `/ebooks` 301, inexistente 404; test A,D,D,C,D,D,A,B,D,D,C,D,D,B,A → Consciente 9, Autoritaria 2, Permisiva 2, Reactiva 2, borrador restaurado tras recargar; `check-quiz.mjs` ALL MATCH; sin `set:html` salvo JSON-LD escapado; sin emojis, `maximum-scale`, sombras ni texto justificado.

Pendiente fuera de `web/`: archivar la oferta de prueba antes de compilar para producción; `LEARNHOUSE_MEDIA_URL` (o equivalente) en producción para que `thumbnail_url` sea absoluto; CORS de producción (ver arriba).
