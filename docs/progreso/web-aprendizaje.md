# Progreso: web de LearnHouse, experiencia de aprendizaje (spec 4.2)

Dueño: `apps/web`: `services/courses/progress.ts`, `hooks/queries/useCourseProgress.ts`, `lib/query/keys.ts` (solo las claves `progress`), `components/Objects/Activities/Video/**`, `components/Objects/Activities/DocumentPdf/**`, `app/orgs/[orgslug]/(withmenu)/course/[courseuuid]/course.tsx` (y `activity/[activityid]/activity.tsx`, pero solo para progreso o ebook y de forma mínima; no se tocó), `components/Pages/Activity/ActivityChapterDropdown.tsx`, `components/Pages/Trail/TrailCourseCard.tsx`, `components/Dashboard/Pages/Course/EditCourseGeneral/EditCourseGeneral.tsx` (interruptor), `components/SanarYCriar/**` y `locales-sc/learning.{es,en}.json`.

## Estado (2026-10-22, segundo ingeniero, continuación): TERMINADO salvo los huecos de abajo

### Heredado del primer ingeniero (revisado, conservado)
- Servicio `services/courses/progress.ts`: GET de curso y de actividad, y PUT con `keepalive`. El PUT no lanza errores ni pasa por `errorHandling`.
- Hooks en `hooks/queries/useCourseProgress.ts`: `useCourseProgress` y `useActivityProgress`, con espejo local.
- `components/SanarYCriar/`:
  - `progressLocal.ts`: localStorage con try/catch, formato mm:ss y aplanado de actividades.
  - `useProgressSaver.ts`: guarda cada ~10 s de reproducción y siempre en pause, seeked, ended, hidden, pagehide y unmount.
  - `ResumeToast.tsx`, `ContinueLearningCard.tsx`, `EbookHero.tsx`, `ProductTypeToggle.tsx`.
  - `sc-learning.css`: clase `.sc-display` (Playfair).
- Video:
  - `useVideoProgress.ts`: video alojado. Usa `onVideoElement` y no toca `LearnHousePlayer.tsx`.
  - `YouTubeProgressPlayer.tsx`: parámetro `start` y sondeo de `getCurrentTime`.

### Hecho en esta sesión
- **Ebook.**
  - Acceso:
    - `EbookHero.tsx` decide el acceso con `useCourseAccess` (`GET /payments/{org}/access`, el hook del agente de comercio).
    - El árbol del curso (`content.paid_access === false`) queda solo como respaldo si esa llamada falla.
  - `EbookActionsGate` (en `course.tsx`) decide si se muestran `CoursesActions` y `CourseActionsMobile`:
    - Se muestran a quien no tiene acceso (zona de compra) y mientras carga.
    - Se ocultan a quien ya puede leer; sus botones están en el hero.
  - Aviso de "falta el PDF":
    - Admin o autor: cómo agregarlo.
    - Alumnas: "Este ebook estará disponible muy pronto."
- **Reanudar.**
  - Si el `?t=` coincide (±2 s) con la posición guardada (enlace "Continuar"), también aparece "Reanudando en mm:ss · Empezar desde el inicio", tanto en video alojado como en YouTube.
  - El aviso ya no desaparece antes de que la alumna pulse play: se oculta 6 s después de que empieza la reproducción, al cerrarlo, o al mover la barra.
  - YouTube: "Empezar desde el inicio" también guarda la posición 0.
- **Fin del video.** El margen de "casi al final" es `min(15 s, 10 % de la duración)`, con el helper `isNearEnd`. Antes, un clip de 60 s se daba por terminado al segundo 45.
- **Espejo local frente al servidor.** El espejo solo gana si es reciente y más nuevo que el `update_date` del servidor (`isLocalNewer`). Antes un espejo de menos de 2 min pisaba un avance más nuevo hecho en otro dispositivo.
- **i18n.**
  - Claves nuevas: `sc_learning.ebook.no_pdf_staff`.
  - Script de verificación: todas las claves `sc_learning.*` usadas existen en es y en en, y los valores por defecto coinciden con es.

### Verificado
- `tsc --noEmit`: limpio.
- eslint de los archivos tocados: 0 errores. Los 10 avisos están en código upstream preexistente.
- `curl` devuelve 200 en `/`, `/courses`, la página del curso, la actividad de video, la actividad PDF, `/trail` y `/dash/courses/course/<uuid>/general`.
- API de progreso del backend: está montada y su forma coincide con el servicio web.
- Navegador, pestaña propia, como admin local, con el curso de prueba "Curso de prueba aprendizaje (borrar)" (`course_8cbd618e-…`: 3 videos alojados y 1 de YouTube, creados para esta prueba):
  - Tarjeta "Continuar donde lo dejaste": muestra la lección, "Capítulo 1 · …", la barra y "Vas en 0:12 de 1:00". Enlaza a `?t=12`.
  - Al abrir el enlace, el video arranca en 0:12 con el aviso.
  - Guardado:
    - Al reproducir hubo un PUT cada ~10 s.
    - Al pausar se guardó 41.7.
    - Al salir con navegación completa (pagehide + keepalive) se guardó 45.7.
    - Al salir con navegación interna (desmontaje) se guardó 33.9, y la tarjeta mostró 0:33 al instante.
  - Al abrir la lección sin `?t=`, arranca en 0:45 con el aviso. "Empezar desde el inicio" lleva el video a 0.
  - Al terminar el video, la API lo marca como completado y crea el TrailStep. La tarjeta pasa a "Sigue con la próxima lección".
  - El menú de capítulos muestra barras de "25 % visto" y "100 % visto".
  - `/trail`: "Continue Learning" enlaza a `/activity/…?t=30`.
  - YouTube: se guardaron 52.6 s y 634.6 s de duración. Al recargar, el iframe usa `start=52` y muestra el aviso.
  - Interruptor Curso/Ebook:
    - Guarda `product_type` y conserva las demás claves de `extra_metadata`; lo comprobé con `sc_test_key` vía API.
    - En modo ebook, la página oculta las lecciones y la tarjeta de continuar y muestra el hero.
  - Ebook de prueba como anónimo (gratis): hero con "Leer ahora" y "Descargar PDF", sin zona de compra.
  - Móvil (375 px): la tarjeta se apila bien.

### Huecos / pendiente
- **PDF, última página: no se implementó.**
  - El visor nativo del navegador (iframe) no informa la página que se está leyendo.
  - Solo se guarda "abierto" y la página de un enlace `?page=`.
  - Hacerlo de forma fiable exige un lector propio con pdf.js.
- **Ebook a la venta visto por quien no lo compró: no probado en vivo.**
  - Haría falta crear una oferta para el ebook y cerrar la sesión del navegador compartido.
  - La lógica (`for_sale && !has_access` → se muestra `CoursesActions`) está verificada leyendo el código y con `curl` a `/access`.
- **Bug de backend (no es mío): los PDF y las descargas fallan en el navegador.** Detalle en el informe final, sección "Needed from others".
  - `apps/api/app.py` (`_SelectiveGZipResponder`) con Starlette 1.9.0 devuelve 500 a toda respuesta no comprimible cuando el navegador envía `Accept-Encoding: gzip`.
  - Por eso el iframe del PDF y "Descargar PDF" fallan en el navegador; con `curl` sin gzip funcionan.
- Datos de prueba creados, que conviene borrar después:
  - el curso `course_8cbd618e-60c0-46d2-bfcb-a1fa80f0de8c` "Curso de prueba aprendizaje (borrar)";
  - su TrailRun para el admin;
  - sus filas de `activityprogress`.

## Review (revisor independiente, 2026-10-22)

Revisé el código cambiado (servicio, hooks, `components/SanarYCriar/**`, Video, YouTube, PDF, `course.tsx`, menú de capítulos, `TrailCourseCard`, interruptor) contra la spec 4.2 y el router `/api/v1/progress` (`routers/progress.py`, `services/progress/progress.py`): el contrato coincide (comprobado con `curl` GET/PUT).

### Defectos corregidos
- `components/SanarYCriar/useProgressSaver.ts`:
  - Un 401 desactivaba los guardados para toda la visita (token vencido a mitad de un video). Ahora solo se pausa para ese token; cuando la sesión trae uno nuevo, los guardados siguen.
  - Una pausa o un salto que llegaban mientras otro guardado seguía en vuelo se descartaban hasta salir de la página (visto en vivo: con la API recargándose, se guardó 33.2 y la pausa en 36 nunca salió). Ahora quedan en cola y se envían en cuanto vuelve el anterior.
- `components/Objects/Activities/DocumentPdf/DocumentPdf.tsx`: en Android Chrome y en los navegadores integrados (Instagram, Facebook) no hay visor de PDF, así que el iframe quedaba en blanco; era un callejón sin salida para el ebook en el teléfono. Si `navigator.pdfViewerEnabled === false`, ahora se muestra una tarjeta con "Descargar PDF" y "Abrir el PDF". Es seguro con hidratación (`useSyncExternalStore`, en el servidor asume que hay visor). Claves nuevas: `sc_learning.pdf.no_viewer` y `sc_learning.pdf.open` (es/en).

### Verificado
- `tsc --noEmit`: limpio.
- eslint de `components/SanarYCriar` y `DocumentPdf.tsx`: 0 problemas.
- `curl` 200 en las páginas del curso, el video, el PDF, `/trail` y el panel general.
- Navegador (pestaña propia, ya cerrada):
  - El video reanudó en 0:33 con el aviso.
  - Con `pdfViewerEnabled` forzado a `false`, el PDF muestra la tarjeta en lugar del iframe.

### Sin verificar en vivo
- La cola de la pausa: la sesión del navegador compartido quedó inválida (401) durante la revisión, por algo ajeno a este flujo (otro agente o una recarga de la API).

### Confirmado (de otros)
- `curl` con `Accept-Encoding: gzip` al PDF de `/content` → 500; sin gzip → 200. El arreglo en `apps/api/app.py` sigue pendiente.
