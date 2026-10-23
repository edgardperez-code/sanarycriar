# Progreso: cabos sueltos del panel, configuración de la organización y documentación (panel-config)

Dueño: agente "panel-config". Archivos:
- `apps/web/app/orgs/[orgslug]/dash/payments/**`
- `apps/web/components/Dashboard/Pages/Payments/**` (solo maquetación móvil)
- `apps/web/components/Dashboard/Onboarding/WelcomeModal.tsx`
- `apps/web/app/orgs/[orgslug]/layout.tsx` (solo el color de NextTopLoader)
- `learnhouse/.gitattributes` (nuevo)
- `deploy/scripts/configurar-organizacion.py`
- `docs/spec-tecnica.md`, `docs/desarrollo-local.md`

## Estado (2026-10-23): TERMINADO y verificado

### Hecho
1. **Pagos en el panel a 390 px:**
   - `/dash/payments/*` ya no se desplaza de lado; antes sobraban 16 px. La causa eran los botones "Ver tienda" y "Panel de PayPal": su contenedor tenía `shrink-0` y no podía ser más estrecho que una sola línea. Ahora lleva `max-w-full` y los botones bajan de línea (`[subpage]/page.tsx`).
   - El subtítulo ya no se corta en móvil (`sm:truncate`).
   - Se añadió un espaciador `h-24 lg:hidden` al final del área con scroll, porque el menú flotante del móvil tapaba "Nueva oferta" y los últimos elementos.
     - No sirve un `padding`, porque la página de ofertas era `h-full` y su contenido se desbordaba. Esa raíz ahora es `min-h-full`.
   - Configuración: los botones de la tarjeta PayPal bajan de línea en móvil; antes "Quitar" quedaba cortado por la tarjeta. En escritorio el texto se encoge (`flex-1 basis-64`) y los botones quedan a su lado; antes también bajaban de línea a 1280 px.
   - Márgenes laterales de 16 px en móvil (`ms-4/ps-4`, `sm:` 40 px) en las cuatro pestañas, como la cabecera.
   - Medido en Chrome sin interfaz a 390 px, en las 4 pestañas:
     - `scrollWidth` 390.
     - Ningún texto ni botón queda cortado dentro de su tarjeta.
     - "Nueva oferta" termina en y=692 y el menú flotante empieza en y=770.
2. **Modal de bienvenida** (`WelcomeModal.tsx`):
   - El globo tiene su propia franja de 190 px, que se desvanece hacia una línea de horizonte, y "Comenzar" queda debajo. Upstream subía el botón 140 px encima del globo.
   - En el segundo paso, la cuadrícula de funciones reemplaza al globo. Así el modal cabe en una pantalla de 800 px de alto, y en pantallas más bajas se desplaza por dentro (`max-h-[calc(100dvh-2rem)]`).
   - Solo muestra las funciones que la organización tiene encendidas (`resolved_features`). Ahora son 5: enseñar, evaluar, certificar, impacto y equipo; la última fila va centrada.
   - El `alt` del logo ahora dice "Sanar y Criar".
   - Upstream lo oculta a propósito por debajo de 640 px. Por eso la captura de móvil no lo muestra y las capturas son de 640 y 1280 px.
3. **NextTopLoader**: `#2e2e2e` → `#7D75E2` (`app/orgs/[orgslug]/layout.tsx`).
4. **`configurar-organizacion.py`**:
   - Apaga biblioteca (`folders`), pódcasts, comunidades (y sus discusiones), espacios interactivos y tableros con `PUT /orgs/{id}/config/<función>?<función>_enabled=false`.
   - Apaga la IA y el Copilot con `PUT /orgs/{id}/config/ai?ai_enabled=false&copilot_enabled=false`.
   - Lee los interruptores en formato v2 (`admin_toggles`) y v1 (`features`), igual que el resolvedor de la API.
   - Al final vuelve a leer la organización y comprueba `resolved_features`. Si algo sigue encendido (por ejemplo, por un plan de pago), sale con código 1.
   - Admite `--simular`. Los archivos `deploy/` siguen con LF (`deploy/.gitattributes`).
   - Borré `deploy/scripts/__pycache__/`, una caché de Python generada que no debe ir a git.
5. **Documentación**:
   - `spec-tecnica.md`:
     - §2.2: `settings.webhook_url` y `LEARNHOUSE_MEDIA_URL`.
     - §2.4: conciliación de 24 h / 7 días / 12 h.
     - §2.8: valores de producción de `LEARNHOUSE_EXTRA_CORS_ORIGINS` y sin `LEARNHOUSE_PAYPAL_*`.
     - §3: `client_ts` y la regla de los 10 minutos.
     - §4.4 (nuevo): configuración de la organización.
   - `desarrollo-local.md`:
     - El comando de tests con `/srv/api` y `-e LEARNHOUSE_REDIS_CONNECTION_STRING=`, y por qué hace falta cada cosa.
     - Usuarios de prueba y limpieza.
     - `configurar-organizacion.py`.
     - PayPal simulado: `WH-MOCK-SANARYCRIAR`, "Más casos de prueba" y las ayudas `/mock/*`.
     - `smoke.sh` y `restaurar.sh --version`.
     - Finales de línea.
   - `learnhouse/.gitattributes`: LF para `*.sh`, `docker/nginx.conf`, `apps/web/server-wrapper.js` y `Dockerfile` (comprobado con `git check-attr`).

### Verificación
- `tsc --noEmit` → exit 0.
- ESLint en los 7 archivos tocados → 0 errores. Hay 4 avisos `no-unused-vars` que ya existían, en firmas de tipos de `PaymentsGroupsPage`/`PaymentsOffersPage`.
- Script contra la pila de desarrollo:
  - `--simular`: 6 "cambiaría".
  - Aplicado: 6 "actualizado", comprobación correcta y caché web renovada (HTTP 200).
  - Segunda pasada: todo "sin cambios", exit 0.
- `GET /api/v1/orgs/slug/sanarycriar`:
  - `admin_toggles`: `ai.disabled=true`, `copilot_enabled=false`, y `folders`, `podcasts`, `communities`, `playgrounds` y `boards` con `disabled=true`.
  - `resolved_features`: esas 6 en `enabled=false`; `courses`, `payments`, `assignments`, `analytics` y `members` siguen en `true`.
- Alumna de prueba en Chrome sin interfaz:
  - Antes del cambio, "Preguntar a la IA" aparecía en la lección y `/library` y `/podcasts` eran accesibles.
  - Después, la lección no tiene el botón y el reproductor sigue. `/library`, `/podcasts`, `/communities`, `/playgrounds` y `/boards` muestran "… no disponible". `/courses` y `/store` funcionan.
  - Con `curl`, todas esas rutas dan 200. El aviso lo pone `FeatureGate` en el cliente, así que el HTML del servidor no sirve para comprobarlo.
- El comando de tests documentado funciona (`test_reconcile_pending.py` + `test_progress_client_ts.py`: 18 passed).
- Capturas en `docs/capturas/learnhouse/`:
  - `30-pagos-{ofertas,grupos,configuracion,resumen}-390.png`
  - `30-pagos-ofertas-final-390.png` (desplazada hasta "Nueva oferta")
  - `30-pagos-ofertas-escritorio.png`
  - `30-bienvenida-{640,1280}.png` y `30-bienvenida-funciones-1280.png`
  - `30-leccion-sin-ia-escritorio.png` y `30-biblioteca-no-disponible-movil.png`

### Necesito de otros
- **Despliegue (`docs/despliegue.md` §5 paso 6 y la lista del §13):** el script ahora también apaga biblioteca, pódcasts, comunidades, espacios interactivos, tableros e IA. El texto "Pone el español por defecto, colores, menú, SEO y logos" se queda corto.
- **i18n:** el aviso de función apagada dice "Por favor, contacte a un administrador si necesita acceso" (usted). Debería ir en "tú", por ejemplo "Si necesitas acceso, escríbele a la administradora". Clave `common.features.disabled.public.description` de `locales/es.json`.
- **Opcional, i18n/marca:** los textos del modal de bienvenida siguen siendo genéricos de LearnHouse ("comparte conocimiento con el mundo", "Haz crecer tu equipo"…).
- **Dueño de `learnhouse/` (git):** `.gitattributes` se aplica al hacer commit y en checkouts nuevos. Las copias de trabajo actuales siguen con CRLF hasta volver a sacarlas (`git checkout -- <archivo>` sin cambios locales), y el `Dockerfile` ya cubre ese caso.
