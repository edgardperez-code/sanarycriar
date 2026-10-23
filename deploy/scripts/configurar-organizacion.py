#!/usr/bin/env python3
"""Aplica la configuración de marca de Sanar y Criar a la organización de LearnHouse.

Usa la API HTTP real como administradora (igual que el panel), así que sirve en
local y en producción. Es idempotente: lee el estado actual, solo cambia lo que
difiere y muestra un resumen ("sin cambios" / "actualizado").

Qué configura:
  - nombre y descripción de la organización (español);
  - color principal #190933 (los correos lo usan en el botón), fuente vacía
    (para que ganen Poppins + Playfair Display de la web), idioma por defecto
    "es", marca de agua desactivada, nombre del remitente de correos;
  - menú público: solo "Cursos" y "Tienda" (Biblioteca, Pódcasts, Comunidades y
    Espacios interactivos ocultos);
  - funciones que Sanar y Criar no usa, apagadas para todo el mundo:
    biblioteca (carpetas), pódcasts, comunidades (y sus discusiones), espacios
    interactivos, tableros e IA (no hay proveedor configurado; así desaparece
    "Preguntar a la IA" en las lecciones). Cursos, pagos/tienda, certificados y
    tareas no se tocan;
  - SEO: sufijo de título y descripción por defecto (conserva lo demás);
  - imágenes: logo, logo cuadrado, favicon, miniatura e imagen OG, tomadas de
    learnhouse/apps/web/public/sc-*.{png} (solo si la organización aún no tiene
    una, salvo con --reemplazar-imagenes).

Credenciales (nunca se imprimen): --email o LEARNHOUSE_INITIAL_ADMIN_EMAIL, y la
contraseña desde LEARNHOUSE_INITIAL_ADMIN_PASSWORD, desde --env-file (se lee
KEY=VALOR sin ejecutar nada) o, si hay terminal, se pide sin eco.

Ejemplos:
  Local (pila de dev/docker-compose.yml):
    python deploy/scripts/configurar-organizacion.py --env-file dev/api.env \\
        --web http://localhost:3200
  Producción (desde el servidor o tu PC):
    python configurar-organizacion.py --api https://cursos.sanarycriarve.com/api/v1 \\
        --web https://cursos.sanarycriarve.com --email admin@sanarycriarve.com
  Solo ver qué cambiaría: añade --simular.

Solo usa la biblioteca estándar de Python (3.9+).
"""

from __future__ import annotations

import argparse
import getpass
import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from urllib import error, parse, request

HERE = Path(__file__).resolve().parent
DEFAULT_ASSETS = (HERE / ".." / ".." / "learnhouse" / "apps" / "web" / "public").resolve()

ORG_NAME = "Sanar y Criar"
# The General settings form caps the description at 100 characters; a longer
# value blocks the admin from saving any other General setting.
ORG_DESCRIPTION = (
    "Cursos en video y ebooks de Hilda Hernández, psicóloga infanto-juvenil, para criar desde la calma."
)
BRAND_COLOR = "#190933"
EMAIL_SENDER_NAME = "Sanar y Criar"
SEO_TITLE_SUFFIX = " · Sanar y Criar"
SEO_DESCRIPTION = (
    "Plataforma de cursos y ebooks de Sanar y Criar: Hilda Hernández, psicóloga clínica "
    "infanto-juvenil (FPV 8.914). Acceso inmediato después de tu compra."
)

# Public menu: only courses and the store are shown. Built-in labels are set
# explicitly so they stay Spanish even where a translation is missing.
MENU_ITEMS = [
    {"type": "courses", "enabled": True, "order": 0, "label": "Cursos", "url": "", "icon": ""},
    {"type": "store", "enabled": True, "order": 1, "label": "Tienda", "url": "", "icon": ""},
    {"type": "library", "enabled": False, "order": 2, "label": "", "url": "", "icon": ""},
    {"type": "podcasts", "enabled": False, "order": 3, "label": "", "url": "", "icon": ""},
    {"type": "communities", "enabled": False, "order": 4, "label": "", "url": "", "icon": ""},
    {"type": "playgrounds", "enabled": False, "order": 5, "label": "", "url": "", "icon": ""},
]

# Org features Sanar y Criar does not offer: (label, feature key in
# admin_toggles / resolved_features, PUT /orgs/{id}/config/<endpoint>, query
# parameter). Courses, payments, certificates and assignments are left alone.
FEATURES_OFF = [
    ("biblioteca (carpetas)", "folders", "folders", "folders_enabled"),
    ("pódcasts", "podcasts", "podcasts", "podcasts_enabled"),
    ("comunidades y discusiones", "communities", "communities", "communities_enabled"),
    ("espacios interactivos", "playgrounds", "playgrounds", "playgrounds_enabled"),
    ("tableros", "boards", "boards", "boards_enabled"),
]

# (endpoint, multipart field, local file, where the current value lives)
IMAGES = [
    ("logo", "logo_file", "sc-logo-wordmark.png", ("org", "logo_image")),
    ("square_logo", "square_logo_file", "sc-icon-512.png", ("general", "square_logo_image")),
    ("favicon", "favicon_file", "sc-icon-192.png", ("general", "favicon_image")),
    ("thumbnail", "thumbnail_file", "sc-og-image.png", ("org", "thumbnail_image")),
]
OG_IMAGE_FILE = "sc-og-image.png"


class ApiError(RuntimeError):
    pass


def read_env_file(path: Path) -> dict[str, str]:
    """KEY=VALUE pairs of an env file, without executing it (quotes stripped)."""
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("'\"")
    return values


class Client:
    def __init__(self, api: str, simulate: bool):
        self.api = api.rstrip("/")
        self.simulate = simulate
        self.token = ""

    def _call(self, method: str, path: str, *, query=None, json_body=None, form=None, files=None):
        url = f"{self.api}{path}"
        if query:
            url += "?" + parse.urlencode(query)
        headers = {"Accept": "application/json"}
        data = None
        if self.token:
            # Bearer only, no cookie jar: the API's CSRF check only applies to
            # cookie-authenticated requests.
            headers["Authorization"] = f"Bearer {self.token}"
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif form is not None:
            data = parse.urlencode(form).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif files is not None:
            boundary = uuid.uuid4().hex
            parts = []
            for field, (filename, content, ctype) in files.items():
                parts.append(
                    f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; "
                    f"filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n".encode("utf-8")
                    + content + b"\r\n"
                )
            data = b"".join(parts) + f"--{boundary}--\r\n".encode("utf-8")
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        req = request.Request(url, data=data, method=method, headers=headers)
        try:
            with request.urlopen(req, timeout=60) as res:
                body = res.read()
                return json.loads(body) if body else None
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise ApiError(f"{method} {path} -> HTTP {exc.code}: {detail}") from None
        except error.URLError as exc:
            raise ApiError(f"{method} {path} -> {exc.reason}") from None

    def get(self, path, **kw):
        return self._call("GET", path, **kw)

    def put(self, path, **kw):
        if self.simulate:
            return {"detail": "(simulación)"}
        return self._call("PUT", path, **kw)

    def login(self, email: str, password: str, org_slug: str) -> None:
        res = self._call("POST", "/auth/login", form={"username": email, "password": password, "org_slug": org_slug})
        if res and res.get("mfa_required"):
            raise ApiError("La cuenta tiene verificación en dos pasos: usa una cuenta admin sin 2FA para este script.")
        token = ((res or {}).get("tokens") or {}).get("access_token")
        if not token:
            raise ApiError("El login no devolvió un token de acceso.")
        self.token = token


def customization(org: dict) -> dict:
    config = (org.get("config") or {}).get("config") or {}
    if "customization" in config:  # v2 config
        return config.get("customization") or {}
    return {"general": config.get("general") or {}, "seo": config.get("seo") or {},
            "menu": (config.get("general") or {}).get("menu") or {}}


def admin_toggle(org: dict, feature: str) -> dict:
    """The org's admin toggle for a feature, as {"disabled": bool, ...}.

    Mirrors the API's resolver: v2 configs keep it under admin_toggles, v1
    configs as features.<name>.enabled. A missing toggle means "not disabled".
    """
    config = (org.get("config") or {}).get("config") or {}
    if str(config.get("config_version") or "1").startswith("2"):
        return (config.get("admin_toggles") or {}).get(feature) or {}
    v1 = (config.get("features") or {}).get(feature) or {}
    toggle = {}
    if "enabled" in v1:
        toggle["disabled"] = not v1["enabled"]
    if "copilot_enabled" in v1:
        toggle["copilot_enabled"] = v1["copilot_enabled"]
    return toggle


def resolved_enabled(org: dict, feature: str):
    """resolved_features.<feature>.enabled as the API computed it (None if absent)."""
    config = (org.get("config") or {}).get("config") or {}
    return ((config.get("resolved_features") or {}).get(feature) or {}).get("enabled")


def report(label: str, changed: bool, simulate: bool) -> None:
    state = "sin cambios" if not changed else ("cambiaría" if simulate else "actualizado")
    print(f"  {label:<34} {state}")


def normalized_menu(items) -> list[tuple]:
    """Menu items as comparable tuples, with the API model's defaults filled in."""
    return sorted(
        (
            str(i.get("type") or ""),
            bool(i.get("enabled", True)),
            int(i.get("order") or 0),
            str(i.get("label") or ""),
            str(i.get("url") or ""),
            str(i.get("icon") or ""),
        )
        for i in (items or [])
    )


def configure(client: Client, slug: str, assets: Path, replace_images: bool) -> dict:
    org = client.get(f"/orgs/slug/{parse.quote(slug)}")
    org_id = org["id"]
    cust = customization(org)
    general = cust.get("general") or {}
    seo = cust.get("seo") or {}
    sim = client.simulate
    print(f"Organización '{org.get('name')}' (id {org_id}, slug {slug})")

    # Name and description (partial update).
    wanted = {"name": ORG_NAME, "description": ORG_DESCRIPTION}
    diff = {k: v for k, v in wanted.items() if (org.get(k) or "") != v}
    if diff:
        client.put(f"/orgs/{org_id}", json_body=diff)
    report("nombre y descripción", bool(diff), sim)

    # Scalar config values, each with its own endpoint and query parameter.
    scalars = [
        ("color principal", "color", "color", BRAND_COLOR, general.get("color") or ""),
        ("fuente (vacía: fuentes de marca)", "font", "font", "", general.get("font") or ""),
        ("idioma por defecto", "default_language", "default_language", "es", general.get("default_language") or ""),
        ("remitente de correos", "email_sender_name", "email_sender_name", EMAIL_SENDER_NAME,
         general.get("email_sender_name") or ""),
    ]
    for label, endpoint, param, value, current in scalars:
        changed = current != value
        if changed:
            client.put(f"/orgs/{org_id}/config/{endpoint}", query={param: value})
        report(label, changed, sim)

    watermark_on = general.get("watermark", True) is not False
    if watermark_on:
        client.put(f"/orgs/{org_id}/config/watermark", query={"watermark_enabled": "false"})
    report("marca de agua desactivada", watermark_on, sim)

    current_menu = normalized_menu((cust.get("menu") or {}).get("items"))
    changed = current_menu != normalized_menu(MENU_ITEMS)
    if changed:
        client.put(f"/orgs/{org_id}/config/menu", json_body={"items": MENU_ITEMS})
    report("menú (Cursos y Tienda)", changed, sim)

    # Features nobody uses here: switched off (admin toggles, admin-only API).
    for label, feature, endpoint, param in FEATURES_OFF:
        changed = admin_toggle(org, feature).get("disabled") is not True
        if changed:
            client.put(f"/orgs/{org_id}/config/{endpoint}", query={param: "false"})
        report(f"apagar {label}", changed, sim)

    # AI and its Copilot: no provider is configured, so learners would only
    # get a broken "Preguntar a la IA" button.
    ai = admin_toggle(org, "ai")
    changed = ai.get("disabled") is not True or ai.get("copilot_enabled") is not False
    if changed:
        client.put(f"/orgs/{org_id}/config/ai", query={"ai_enabled": "false", "copilot_enabled": "false"})
    report("apagar IA (y Copilot)", changed, sim)

    # Images: only filled in when empty (or with --reemplazar-imagenes).
    for endpoint, field, filename, (scope, key) in IMAGES:
        current = (org.get(key) if scope == "org" else general.get(key)) or ""
        path = assets / filename
        if current and not replace_images:
            report(f"imagen: {endpoint}", False, sim)
            continue
        if not path.is_file():
            print(f"  {'imagen: ' + endpoint:<34} omitida (no existe {path})")
            continue
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        client.put(f"/orgs/{org_id}/{endpoint}", files={field: (path.name, path.read_bytes(), ctype)})
        report(f"imagen: {endpoint}", True, sim)

    # SEO: merge our suffix/description (and an OG image when missing) into the
    # current values, so verification codes or handles set in the panel stay.
    new_seo = {
        "default_meta_title_suffix": SEO_TITLE_SUFFIX,
        "default_meta_description": SEO_DESCRIPTION,
        "default_og_image": seo.get("default_og_image") or "",
        "google_site_verification": seo.get("google_site_verification") or "",
        "twitter_handle": seo.get("twitter_handle") or "",
        "noindex_communities": bool(seo.get("noindex_communities", False)),
    }
    og_path = assets / OG_IMAGE_FILE
    if (not new_seo["default_og_image"] or replace_images) and og_path.is_file():
        if sim:
            new_seo["default_og_image"] = "(nueva imagen OG)"
        else:
            res = client._call("PUT", f"/orgs/{org_id}/og_image",
                               files={"og_image_file": (og_path.name, og_path.read_bytes(), "image/png")})
            new_seo["default_og_image"] = (res or {}).get("filename") or ""
    changed = any((seo.get(k) if k != "noindex_communities" else bool(seo.get(k, False))) != v
                  for k, v in new_seo.items())
    if changed:
        client.put(f"/orgs/{org_id}/config/seo", json_body=new_seo)
    report("SEO (título, descripción, OG)", changed, sim)
    return org


def check_features(client: Client, slug: str) -> bool:
    """Re-reads the org and confirms the API now resolves those features as off.

    A paid plan can keep a feature on regardless of the toggle; that is reported
    instead of being hidden.
    """
    org = client.get(f"/orgs/slug/{parse.quote(slug)}")
    still_on = [feature for _, feature, _, _ in FEATURES_OFF if resolved_enabled(org, feature)]
    if resolved_enabled(org, "ai"):
        still_on.append("ai")
    if still_on:
        print(f"  {'comprobación de funciones':<34} AÚN ACTIVAS según la API: {', '.join(still_on)}")
        return False
    print(f"  {'comprobación de funciones':<34} ok (la API las resuelve como apagadas)")
    return True


def revalidate_web(web: str, token: str) -> None:
    """Asks the Next.js app to drop its cached org data (same call as the panel)."""
    url = web.rstrip("/") + "/api/revalidate?tag=organizations"
    req = request.Request(url, headers={"Cookie": f"LH_access={token}"})
    try:
        with request.urlopen(req, timeout=30) as res:
            print(f"  {'caché de la web':<34} renovada (HTTP {res.status})")
    except (error.HTTPError, error.URLError) as exc:
        print(f"  {'caché de la web':<34} no se pudo renovar ({exc}); se renueva sola en minutos")


def main(argv=None) -> int:
    # Spanish output on Windows consoles and pipes (cp1252 by default).
    for stream in (sys.stdout, sys.stderr):
        if (getattr(stream, "encoding", "") or "").lower() not in ("utf-8", "utf8"):
            try:
                stream.reconfigure(encoding="utf-8")
            except (AttributeError, ValueError):
                pass
    p = argparse.ArgumentParser(description="Configura la organización de LearnHouse con la marca Sanar y Criar.")
    p.add_argument("--api", default=os.environ.get("SC_API_URL", "http://localhost:1338/api/v1"),
                   help="URL base de la API (por defecto http://localhost:1338/api/v1)")
    p.add_argument("--web", default=os.environ.get("SC_WEB_URL", ""),
                   help="URL de la web (p. ej. http://localhost:3200) para renovar su caché")
    p.add_argument("--org", default=os.environ.get("SC_ORG_SLUG", "sanarycriar"), help="slug de la organización")
    p.add_argument("--email", default="", help="correo de la administradora")
    p.add_argument("--env-file", default="", help="archivo KEY=VALOR con LEARNHOUSE_INITIAL_ADMIN_*")
    p.add_argument("--assets", default=str(DEFAULT_ASSETS), help="carpeta con las imágenes sc-*.png")
    p.add_argument("--reemplazar-imagenes", action="store_true", help="vuelve a subir las imágenes aunque ya existan")
    p.add_argument("--simular", action="store_true", help="muestra lo que cambiaría sin escribir nada")
    args = p.parse_args(argv)

    # The admin password and token travel to --api (and the token to --web):
    # plain HTTP is only allowed against this machine.
    for flag, url in (("--api", args.api), ("--web", args.web)):
        if not url:
            continue
        parts = parse.urlsplit(url)
        local = (parts.hostname or "") in ("localhost", "127.0.0.1", "::1")
        if parts.scheme not in ("http", "https") or (parts.scheme == "http" and not local):
            print(f"{flag} debe usar https:// (http:// solo para localhost): {url}", file=sys.stderr)
            return 2

    env = dict(os.environ)
    if args.env_file:
        env.update(read_env_file(Path(args.env_file)))
    email = args.email or env.get("LEARNHOUSE_INITIAL_ADMIN_EMAIL", "")
    password = env.get("LEARNHOUSE_INITIAL_ADMIN_PASSWORD", "")
    if not email:
        print("Falta el correo de la administradora (--email o LEARNHOUSE_INITIAL_ADMIN_EMAIL).", file=sys.stderr)
        return 2
    if not password:
        if not sys.stdin.isatty():
            print("Falta la contraseña (LEARNHOUSE_INITIAL_ADMIN_PASSWORD o --env-file).", file=sys.stderr)
            return 2
        password = getpass.getpass(f"Contraseña de {email}: ")

    client = Client(args.api, args.simular)
    try:
        client.login(email, password, args.org)
        print(f"Sesión iniciada como {email} en {args.api}" + (" (simulación)" if args.simular else ""))
        configure(client, args.org, Path(args.assets), args.reemplazar_imagenes)
        features_ok = args.simular or check_features(client, args.org)
        if args.web and not args.simular:
            revalidate_web(args.web, client.token)
    except ApiError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    if not features_ok:
        print("Revisa el plan de la organización: un plan de pago mantiene sus funciones encendidas.",
              file=sys.stderr)
        return 1
    print("Listo. La API guarda la configuración en caché hasta 2 minutos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
