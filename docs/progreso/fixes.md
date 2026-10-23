# Progreso: arreglos transversales de las revisiones de la fase 1 (fixes)

Dueño: agente "fixes". Archivos: `apps/web/proxy.ts`, `CoursesActions.tsx`, `CourseActionsMobile.tsx`, `Boards/Extensions/ActivityBlockComponent.tsx`, `PaymentsOffersPage.tsx` (+ `SubComponents/ArchiveOfferDialog.tsx`, nuevo), `locales-sc/fixes.{es,en}.json` (nuevos, prefijo `sc_fixes`); en la API: `services/payments/reconcile.py`, `services/progress/**`, `routers/progress.py`, `tests/payments/**`.

## Estado (2026-10-22): TERMINADO y verificado

### Hecho
1. **proxy.ts**: quien ya tiene sesión y entra a `/login` (o a `/signup` en un host sin organización; en tenencia única `/signup` sigue siendo la pantalla de unirse) va al `?redirect=` / `?next=` saneado con `safeInternalPath` en lugar de siempre a `/home`. Sin destino válido, o si el destino es `/login`/`/signup`, va a `/home` como antes.
   - Protección contra bucles: la marca `LH_session` puede sobrevivir a una sesión inservible, y páginas como `/boards` redirigen a `/login?redirect=/boards`. Una cookie de 10 s (`sc_auth_bounce`, httpOnly) hace que el segundo rebote seguido vaya a `/home`.
2. **Cursos gratis con historial** (`CoursesActions` y `CourseActionsMobile`), si hay TrailRun o progreso guardado:
   - Botón "Continuar" al punto exacto, con la misma regla que la tarjeta "Continuar donde lo dejaste" (`resolveContinueTarget` + `useCourseProgress`, misma consulta en caché). Sin progreso guardado, va a la primera lección sin completar. Si hay progreso pero no TrailRun, también inicia el curso.
   - "Salir del curso" pasa a ser un enlace discreto. Abre un diálogo que explica que se borra el progreso; el foco empieza en "Quedarme en el curso". Al salir se invalida el progreso en caché y se borra su espejo en `localStorage`.
   - Cursos pagos: sin cambios.
   - Código compartido nuevo: `components/ScFixes/FreeCourseContinue.tsx` y `components/ScFixes/useFixesT.ts`.
3. **Boards**: `trackProgress={false}` en `<VideoActivity>` y `<DocumentPdfActivity>` (la prop existe en ambos componentes del agente de aprendizaje).
4. **Archivar oferta** (`SubComponents/ArchiveOfferDialog.tsx`, nuevo, en lugar del `ConfirmationModal`):
   - Cada vez que se abre, vuelve a leer las ofertas (la lista en caché puede estar vieja tras editar recursos).
   - Calcula qué cursos o ebooks cubre solo esa oferta, directo o vía grupo (`resource_uuids` del listado admin).
   - Si alguno quedaría gratis, lo avisa con los nombres. El botón principal pasa a ser "Cancelar", que además recibe el foco, y el de archivar dice "Archivar y dejarlo gratis".
   - Si la comprobación falla, muestra un aviso genérico.
   - Reutiliza los textos `sc_commerce.offers.archive*` existentes.
5. **Conciliación**: las órdenes `pending` se revisan durante 7 días (`PENDING_LOOKBACK`); `created`/`approved` siguen en 24 h. El lock de Redis no cambia.
6. **Progreso fuera de orden**: `PUT /progress/activity/{uuid}` acepta un `client_ts` opcional (epoch ms; los decimales se truncan; fuera de 0..10^13 → 422).
   - Un guardado con `client_ts` menor que el ya guardado no cambia la posición, la página, `update_date` ni `client_ts`, y responde 200 con la fila actual.
   - Ese guardado sí cuenta para lo que no depende del orden: posición máxima, completado y una duración que faltaba.
   - La decisión se toma dentro del propio `INSERT … ON CONFLICT DO UPDATE`, así que dos guardados simultáneos no pueden ganar los dos.
   - Sin `client_ts` se mantiene "gana el último" y se conserva la marca guardada. Las respuestas incluyen `client_ts`.
   - Columna `client_ts BIGINT NULL` en `db/activity_progress.py`.
   - Migración Alembic idempotente `7b5dee2850d6`, después de `a9c8b7d6e5f4`: es la única cabeza (74 revisiones).
   - Guardia `services/progress/schema.py`: añade la columna si falta, una vez por proceso, con `lock_timeout`. La BD de desarrollo no tiene `alembic_version`, porque la creó `create_all`.
   - Columna aplicada a la BD de desarrollo.

### Verificado
- **API, tests:**
  - `pytest src/tests/payments` → 99 passed. Incluye los nuevos `test_reconcile_pending.py` (5) y `test_progress_client_ts.py` (12).
  - Con core, root router, trail, chapters y admin → 255 passed.
  - Suite completa: la detuve al 13 %, sin fallos hasta ahí. Motivo: los tests corren en el contenedor `api` con el Redis de desarrollo y escriben claves `jwt_revoked_before:<id>`, que invalidan sesiones reales de desarrollo (ver "Pendiente (de otros)").
- **Migración, en la BD aparte `sc_migtest_fixes`** (ya borrada): stamp `a9c8b7d6e5f4` → upgrade añade la columna → downgrade la quita → upgrade → stamp atrás + upgrade con la columna ya creada → sin error.
- **En vivo, proxy**, con cookies reales de sesión de la compradora de prueba (login por `/api/auth/login` del web):
  - `/login?redirect=/store/offers/…` → 307 a la oferta.
  - `?next=/course/…` → 307 al curso.
  - `https://evil…`, `/%09/evil…` y sin redirect → `/home`.
  - Segundo rebote con `sc_auth_bounce` → `/home`.
  - Sin sesión → página de login.
- **En vivo, progreso:**
  - `client_ts=T` en 33 s y luego `T-10s` en 30 s → queda 33 (200).
  - Sin `client_ts`, 31 s → 31.
  - `T+5s` en 12 s → 12.
  - `client_ts=-5` → 422.
- **Web:**
  - `tsc` limpio. ESLint en los archivos tocados: 0 errores; los avisos que quedan son de código previo.
  - `bun test tests/sc-fixes.test.mjs` → 10 pass (proxy y cálculo de cursos liberados).
- **Chrome headless, perfiles aislados**, en español. Nunca se cerró sesión, porque el logout revoca todas las sesiones del usuario.
  - **Compradora en el curso gratis "Curso de prueba aprendizaje (borrar)":**
    - Con progreso y sin TrailRun: solo "Continuar", que lleva a la lección con `?t=12` e inicia el curso.
    - Con TrailRun: anillo de progreso, "Continuar" y "Salir del curso".
    - El diálogo abre con el foco en "Quedarme"; "Quedarme" lo cierra sin cambios.
    - Confirmar, en móvil (390 px) y en escritorio: "Saliste del curso", aparece "Empezar curso" y desaparece la tarjeta de continuar. En la BD quedan 0 TrailRun y 0 filas de progreso.
  - **Admin en Pagos → Ofertas:**
    - Archivar la única oferta del curso muestra el aviso con "Curso de prueba (borrar) · Curso", el foco en "Cancelar", y "Cancelar" lo cierra. En móvil cabe en 358 px.
    - Con una oferta temporal no listada que cubre el mismo curso no hay aviso.
    - Archivar la temporal desde el diálogo muestra "Oferta archivada" y la tarjeta desaparece.
    - Al reabrir, vuelve a "Revisando…".

### Datos de prueba
- Oferta `3` "Oferta temporal (borrar) fixes": no listada y ya archivada. Borrar con el resto de datos de prueba.
- La compradora `alumna.api.prueba@example.com` empezó y luego salió del curso gratis de prueba: queda sin TrailRun ni progreso allí.

### Pendiente (de otros)
- Fusionar `locales-sc/fixes.*.json` (`sc_fixes`).
- El cliente de progreso debe enviar `client_ts`.
- **Riesgo con los tests:** al correr `pytest` dentro del contenedor `api`, los tests usan el Redis de desarrollo.
  - En Redis hay `jwt_revoked_before:1` (admin, 01:54:59 UTC, antes de mis ejecuciones), `:2` (compradora1, 02:37:21 UTC) y `:905`.
  - La de las 02:37 coincide con mi suite completa y con la de otro agente, que corrían a la vez; no puedo saber cuál la escribió. Las sesiones de compradora1 anteriores a esa hora ya no valen y hay que volver a iniciar sesión.
  - Para evitarlo, correr los tests con `-e LEARNHOUSE_REDIS_CONNECTION_STRING=` o con otro índice de Redis.
- Ver el informe final, sección "Needed from others".

## Review (revisor independiente, 2026-10-22)

Revisé el diff real de los seis arreglos, repetí las pruebas y las comprobaciones en vivo.

### Defectos encontrados y corregidos
1. **Progreso: el desfase de reloj entre dispositivos podía congelar la posición.** `client_ts` es el reloj del dispositivo. Si un teléfono tiene la hora adelantada (p. ej. puesta a mano un año adelante), su marca quedaba guardada y todo guardado posterior desde otro dispositivo con la hora correcta se ignoraba hasta que el tiempo real la alcanzara. Con un reloj atrasado pasaba lo mismo al cambiar de laptop a teléfono.
   - Arreglo (`services/progress/progress.py`): una marca más vieja solo se ignora mientras el guardado almacenado es reciente según el reloj del servidor (`_CLIENT_TS_WINDOW` = 10 min, `update_date`). Pasada esa ventana vuelve "gana el último". Los saltos fuera de orden reales (guardado periódico contra el keepalive al salir) llegan con segundos de diferencia, y el saver no tiene cola offline, así que la protección se mantiene donde importa.
   - Test nuevo `test_older_stamp_wins_once_the_stored_save_is_not_recent`. Comprobado también en Postgres: con la fila envejecida 11 min, una marca 60 s más vieja se aplica (pos 25) y la siguiente, aún más vieja, se ignora.
2. **Móvil: miembros ajenos a la organización.** `CourseActionsMobile` mostraba "Continuar"/"Salir" a un usuario con sesión que no es miembro, mientras que escritorio le muestra "Unirse". Ahora `hasFreeHistory` exige `isUserPartOfTheOrg` y el botón original lo manda a `/signup`.
3. **Diálogo de archivar: nombres de cursos.** La clave de caché `courses.list(slug)` la guardan otras pantallas a veces como `{ data: [...] }`. Ahora se aceptan ambas formas, para no caer en "Contenido <uuid>".

### Verificado
- `pytest src/tests/payments` con `-e LEARNHOUSE_REDIS_CONNECTION_STRING=` → 100 passed.
- `alembic heads` → `7b5dee2850d6 (head)`, una sola cabeza. La columna `client_ts bigint` está en la BD de desarrollo.
- `tsc --noEmit` → 0. ESLint en los archivos tocados → 0 errores; los 11 avisos son de código previo. `bun test tests/sc-fixes.test.mjs` → 10 pass.
- En vivo, proxy, con sesión real de la compradora de prueba:
  - `?redirect=` y `?next=` internos → 307 al destino, con la cookie de guardia.
  - Externo, `/%09/…` y sin destino → `/home`.
  - Segundo rebote → `/home`. `/signup` en tenencia única → página. Sin sesión → login.
- En vivo, progreso: 33 → tardío 30 ignorado → sin marca 31 → más nuevo 12 → `-5` da 422. Además, la prueba de ventana de arriba. La fila de prueba se borró al terminar.
- Capturas del implementador revisadas (diálogo de salir en escritorio y móvil, aviso de archivar): textos en español correctos, contraste legible y foco en la opción segura.

### Sin corregir (fuera de mis archivos o menor)
- El modal de bienvenida del panel ("Te damos la bienvenida…", upstream/branding) superpone el botón "Comenzar" a la ilustración en un perfil de admin nuevo. Es de la workstream de branding/dashboard.
- La caché `courses.list(slug)` puede tener solo los cursos publicados (la deja así copilot). En ese caso un curso no publicado aparece como "Contenido <uuid>" en el aviso. Es cosmético.
