# Sanar y Criar

Plataforma de Hilda Hernández, psicóloga clínica infanto-juvenil (FPV 8.914, Lechería, Venezuela): cursos en video y ebooks con entrega inmediata, más el sitio de la marca.

| Pieza | Dominio | Carpeta | Tecnología |
|---|---|---|---|
| Sitio de marketing | `www.sanarycriarve.com` | `web/` | Astro estático |
| Plataforma de cursos | `cursos.sanarycriarve.com` | `learnhouse/`: submódulo, [edgardperez-code/sanarycriar-learnhouse](https://github.com/edgardperez-code/sanarycriar-learnhouse/tree/sanarycriar), rama `sanarycriar` | Fork de LearnHouse 1.4.2 (Next.js + FastAPI + Postgres + Redis), AGPL-3.0 |
| Despliegue | un VPS con Caddy | `deploy/` | Docker Compose |
| Entorno local | `localhost` | `dev/` | Docker Compose + Next en modo desarrollo |

Pagos: PayPal (cuenta Business) desde la propia plataforma; Pago Móvil (SPIDI) vendrá después como otro proveedor.

## Clonar

```bash
git clone --recurse-submodules https://github.com/edgardperez-code/sanarycriar.git
```

Si ya lo clonaste sin submódulos: `git submodule update --init`. El submódulo `learnhouse/` queda en un commit fijo; para trabajar en él, entra en la carpeta y cámbiate a la rama `sanarycriar`.

## Documentación

- [`docs/spec-tecnica.md`](docs/spec-tecnica.md): contrato técnico compartido y tokens de marca.
- [`docs/desarrollo-local.md`](docs/desarrollo-local.md): cómo levantar todo en tu computadora.
- [`docs/despliegue.md`](docs/despliegue.md): VPS, DNS, primer despliegue, PayPal Live, correo, copias de seguridad, actualizaciones y lista para salir en vivo.
- [`web/README.md`](web/README.md): el sitio de marketing (contenido, blog, testimonios, legales).
- `docs/investigacion/`: investigación con referencias al código de LearnHouse. El mapa del sitio anterior (Replit) no se publica: describe fallos de seguridad de un sitio que aún está en línea.
- `docs/progreso/`: bitácoras de cada área de trabajo.

## Licencia y código fuente

La plataforma es un fork de [LearnHouse](https://github.com/learnhouse/learnhouse) bajo **AGPL-3.0**. Como se ofrece a usuarias por la red, su código fuente (incluidos nuestros cambios) debe estar disponible: el repositorio del fork es público ([edgardperez-code/sanarycriar-learnhouse](https://github.com/edgardperez-code/sanarycriar-learnhouse/tree/sanarycriar)) y la plataforma enlaza a él desde el pie ("Código fuente"). Detalles en `docs/despliegue.md`, sección "Obligaciones AGPL".
