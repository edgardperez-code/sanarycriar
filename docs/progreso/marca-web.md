# Progreso: marca visual de la web de LearnHouse (`marca-web`)

Dueño: agente "marca". Archivos bajo `learnhouse/apps/web` (lista en "Archivos tocados") y `deploy/scripts/configurar-organizacion.py`.

## Estado (2026-10-22): HECHO y verificado en navegador (headless, perfiles aislados)

### Hecho
- **Tipografía** (`app/layout.tsx`): Poppins 400–700 (`--font-default`, la variable de upstream) y Playfair Display 500/600 + itálica (`--font-heading`) con `next/font`; Tajawal sin precarga; `lang="es"`; iconos de marca (`/sc-favicon.svg`, `/favicon.ico`, `/sc-apple-touch-icon.png`) y `theme-color` nube. Los `h1–h3` (salvo los que son etiquetas en mayúsculas) usan Playfair con cifras "lining".
- **Tokens** (`styles/globals.css`):
  - Variables shadcn → paleta de marca: fondo nube, texto/primario violeta, tarjetas/popover blanco cálido, secundario/muted/accent lavanda-100, texto secundario violeta-500 (7,0:1 sobre nube), borde `#EAE8F2`, input `#DAD5EA`, anillo de foco lavanda-600, destructivo `#B42318` (texto blanco 6,5:1), gráficos con colores de marca, `--radius` 12 px.
  - `@theme`: colores de marca como utilidades (`bg-nube`, `text-violeta`, `text-rosa-600`…), `font-display`, `rounded-xl` = 20 px (tarjetas; 2xl 24, 3xl 28).
  - Escalas gray/neutral/slate/zinc con el tono violeta de la marca (296°) y la **misma luminosidad** que Tailwind: los contrastes de upstream no cambian (comprobado: ±0,1); `text-gray-900/700/600/500` caen en violeta/600/500/400. gray-400 algo más oscuro (67 %) para metadatos sobre nube. `black` → violeta, `white` → blanco cálido. `teal` (color de progreso/completado de upstream) → escala lavanda.
  - `nice-shadow`/`light-shadow`: borde suave + sombra violeta muy tenue (sin sombras duras). Sin fondo `#fbfbfb` en modo oscuro del sistema.
  - Clases de marca: `.sc-eyebrow`, `.sc-title-accent`, `.sc-card`, `.sc-btn(-primary|-outline|-sm)`, `.sc-link`, `.sc-watercolor`; `.sc-auth` (formularios de acceso: botones píldora, campos 12 px, textos tenues subidos a violeta-400 5,1:1); foco visible lavanda-600; selección rosa-300; `--font-sc-display` apunta la clase `.sc-display` del agente de aprendizaje a Playfair.
- **`components/ui`**: botones en píldora y semibold, inputs/textarea/select de 12 px sobre blanco cálido, badges en píldora.
- **Encabezado** (`components/Objects/Menus/*`): barra clara (nube, borde) con el wordmark de texto "Sanar *y* Criar" + "Hilda Hernández · Psicóloga Infanto-Juvenil" (`ScWordmark.tsx`), enlaces de texto (subrayado rosa-300 en hover y sección actual), "Volver al sitio" (`NEXT_PUBLIC_SC_SITE_URL`, por defecto `https://www.sanarycriarve.com`), sin buscador ni logo de LearnHouse; íconos de línea; Tableros y Copilot solo para personal con acceso al panel; menú móvil propio (Playfair, accesible: `aria-expanded`, `aria-controls`, se cierra al navegar). El color de la organización ya no pinta la barra (solo tiñe correos).
- **Perfil** (`components/Security/HeaderProfileBox.tsx`): sin selector de idioma (ni en el desplegable), "Iniciar sesión" + "Registrarse" en píldora, variante móvil apilada, "Cerrar sesión" traducido, sin la etiqueta "Usuario" para alumnas (comparaba el texto traducido con `'USER'`).
- **Pie** (`components/Footers/ScOrgFooter.tsx`, nuevo; reemplaza logo y marca de agua de LearnHouse en `(withmenu)/layout.tsx`): "© {año} Sanar y Criar · Hilda Hernández, FPV 8.914", Términos / Privacidad / Reembolsos al sitio de marketing y "Plataforma basada en LearnHouse (AGPL-3.0) · Código fuente" (`NEXT_PUBLIC_SC_SOURCE_URL`). Opaco y por encima de la banda oscura de las lecciones. `AuthFooter` (`LegalFooters.tsx`) apunta a nuestros legales y repite el aviso AGPL.
- **Acceso** (`components/Auth/*`): página nube con acuarelas, sin rejilla ni selector de idioma; panel derecho lavanda-100 con acuarelas, wordmark, foto de Hilda en el marco orgánico lavanda→rosa (como el Hero del sitio), etiqueta "Psicóloga Infanto-Juvenil · FPV 8.914" y la frase del manual "Sanar tu historia para criar *distinto*."; cabecera móvil clara con wordmark. La lógica de `?redirect` del agente de comercio no se tocó (cero cambios en `app/auth/**`).
- **Inicio** (`components/Landings/LandingClassic.tsx`, `(withmenu)/page.tsx`): etiqueta, título "Aprende a criar *desde la calma*.", texto con datos reales (FPV, acceso inmediato), botones "Ver la tienda" y "Ya compré: iniciar sesión"/"Mis compras", catálogo separado en "Cursos en video" y "Ebooks", estado vacío "Muy pronto". Título de página "Cursos y ebooks · Sanar y Criar".
- **Tarjeta de curso** (`components/Objects/Thumbnails/CourseThumbnail.tsx`): como la del catálogo del sitio: etiqueta "Curso en video"/"Ebook · PDF", título Playfair, descripción, "Ver curso →"/"Ver ebook →"; en el panel conserva autores y fecha. Alturas iguales.
- **Curso** (`course.tsx`): título Playfair grande, tarjetas `.sc-card` (20 px), portada sin sombra dura, capítulos sobre lavanda-100, checks y "actual" en lavanda.
- **Lección**: banda de video violeta (`theater.css`), anillo de progreso lavanda-600.
- **Recursos** (`public/`, generados con satori + sharp desde las fuentes del sitio): `sc-favicon.svg`, `sc-icon-192/512.png`, `sc-apple-touch-icon.png`, `sc-og-image.png` (copias del sitio), `sc-logo-wordmark.{png,svg}`, `sc-hilda.webp` (720 px, 34 KB), `favicon.ico` (16/32/48), `empty_thumbnail.png` (portada vacía lavanda→rosa con wordmark), y con el mismo nombre/tamaño que upstream: `lrn.svg` (marca "SyC" que el reproductor pinta en blanco), `lrn-dash.svg` (marca clara del panel), `black_logo.png` (404 global), `learnhouse_bigicon(_1).png`. Los archivos van en la raíz de `public/` con prefijo `sc-` porque `proxy.ts` solo deja pasar archivos de la raíz. Generador: `C:/Users/mente/AppData/Local/Temp/claude/C--Users-mente-Documents-Psicologa/4134e7bc-8a88-4bb3-b93c-ff5575ba8ccc/scratchpad/marca-web/gen-assets.mjs` (`node gen-assets.mjs <ruta web> <ruta public>`).
- **Script `deploy/scripts/configurar-organizacion.py`** (solo biblioteca estándar, idempotente, `--simular`, no imprime la contraseña): nombre y descripción, color `#190933`, fuente vacía, idioma `es`, remitente "Sanar y Criar", marca de agua desactivada, menú (Cursos y Tienda visibles; Biblioteca, Pódcasts, Comunidades y Espacios interactivos ocultos), SEO (sufijo " · Sanar y Criar", descripción, imagen OG), logo, logo cuadrado, favicon y miniatura (solo si faltan o con `--reemplazar-imagenes`), y renueva la caché de la web (`/api/revalidate?tag=organizations`) si se pasa `--web`.

### Verificado
- `tsc --noEmit`: limpio (exit 0).
- ESLint de los archivos tocados: 0 errores; avisos solo preexistentes de upstream (`set-state-in-effect`, `refs`, `exhaustive-deps` en `activity.tsx`, `course.tsx` y `OrgMenu.tsx:104`).
- `curl` 200: `/`, `/courses`, curso, lección, `/store`, oferta, `/login`, `/signup`, `/forgot`, `/account/purchases`, `/dash` y los recursos nuevos. HTML con `lang="es"`, `theme-color #FDF5EE`, título "Cursos y ebooks · Sanar y Criar" y el favicon de la org.
- Script: `python deploy/scripts/configurar-organizacion.py --env-file dev/api.env --web http://localhost:3200` → 12 cambios "actualizado" y caché renovada; segunda corrida → todo "sin cambios". Confirmado leyendo `GET /orgs/slug/sanarycriar`.
- Chrome headless con perfiles propios (visitante, compradora `alumna.api.prueba@example.com`, admin), 1280 y 390 px: inicio, cursos, curso (visitante y compradora), lección con video, tienda, oferta, login, registro, recuperar contraseña, mis compras, cuenta, progreso, menú móvil, 404 y panel (inicio, ofertas, contenido del curso). Sin scroll horizontal a 390 px en ninguna (`scrollWidth == 390`). Tablet 820 px: el encabezado cabe.
- Panel: legible y usable con los tokens heredados (mismos contrastes que upstream).
- Capturas finales para Hilda: `docs/capturas/learnhouse/*.png` (16 archivos).

### Pendiente / conocido
- `NEXT_PUBLIC_SC_SOURCE_URL` apunta por defecto al repositorio de upstream. Antes de abrir al público hay que publicar el fork y poner su URL (AGPL §13).
- La foto de Hilda viene del sitio (recorte de Instagram); si llega una de mejor calidad, regenerar `sc-hilda.webp`.
- El encabezado siempre usa el wordmark de texto: un logo subido desde el panel no se muestra ahí (sí en correos y en el panel).
- `public/lrn-text.svg` y `components/Objects/Watermark.tsx` siguen con LearnHouse pero ya no se usan.

## Decisiones
- Remapear escalas neutras por tema (no archivo por archivo): cubre las ~7.800 clases gray/neutral/slate/zinc de upstream sin tocar componentes y sin cambiar contrastes.
- Etiquetas en mayúsculas dentro de `h1–h3` siguen en Poppins (`:not(.uppercase)`), como pide el manual.
- Textos nuevos con `t('sc_brand.…', { defaultValue: 'español' })`: funcionan hoy y el agente de idioma puede llevarlos a `locales`.

## Review (revisor independiente, 2026-10-22)

Revisé el diff de los archivos del área, el script y las capturas; repetí la verificación con perfiles headless propios (`scratchpad/review-marca-web`).

### Defectos encontrados y corregidos
- **Menú móvil quedaba abierto al navegar** desde el desplegable de perfil ("Mis compras", "Mi cuenta") o desde enlaces de la página: solo los enlaces del menú lo cerraban. `OrgMenu.tsx` ahora recuerda la ruta en la que se abrió y se cierra con cualquier cambio de ruta (sin efecto ni `setState` en efecto). Verificado: abrir → navegar a /store → cerrado; se vuelve a abrir bien.
- **Corte duro de la acuarela del inicio**: la mancha rosa terminaba en una línea horizontal al final del bloque de introducción. Nueva clase `.sc-watercolor-fade` (máscara que la desvanece) usada en `LandingClassic.tsx`. Captura `01-inicio-*` regenerada.
- **Foco de teclado casi invisible en los formularios de acceso** (`focus:ring-black/5` sobre nube): `.sc-auth` añade un anillo lavanda-600 al 35 % en `:focus-visible` sin tocar el color del borde (el rojo de error se mantiene).
- **Script**: rechaza `--api`/`--web` con `http://` salvo localhost, porque envía la contraseña y el token de administradora.

### Verificado
- `tsc --noEmit` exit 0; ESLint 0 errores (solo el aviso previo de upstream en `OrgMenu.tsx`); `py_compile` ok.
- curl 200: `/`, `/courses`, curso, lección, `/store`, `/login`, `/signup`, `/forgot`, `/account/purchases`, `/dash` y los recursos `sc-*`/`favicon.ico`/`empty_thumbnail.png`.
- `configurar-organizacion.py --env-file dev/api.env --simular` → todo "sin cambios" (idempotente); `--api http://example.com/...` → exit 2.
- Headless: inicio, tienda, oferta, 404, recuperar contraseña, menú móvil (visitante), login móvil, panel (inicio, cursos, ofertas) como admin. Sin scroll horizontal a 390 px; sin errores de consola; `lang="es"`, título "Cursos y ebooks · Sanar y Criar". Inicio de sesión de admin en perfil aislado funciona y redirige.

### Pendiente (no corregido, fuera del área o decisión)
- 404 global (`app/not-found.tsx`) sigue en inglés (agente de idioma).
- El menú oculta Biblioteca/Pódcasts/Comunidades/Espacios, pero sus rutas siguen accesibles por URL directa; si se quieren cerradas, desactivar esas funciones de la organización (decisión del orquestador).
- El panel de bienvenida del panel ("Crea cursos, invita estudiantes…") es texto de upstream; aceptable para el personal.
