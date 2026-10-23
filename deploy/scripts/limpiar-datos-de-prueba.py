"""Borra los datos de prueba de Sanar y Criar (pensado para el entorno LOCAL).

Qué cuenta como dato de prueba:
  - cursos y ebooks cuyo nombre contiene "(borrar)", con sus capítulos, lecciones,
    progreso, inscripciones y archivos subidos;
  - ofertas cuyo nombre contiene "(borrar)" o que solo incluyen cursos de prueba,
    con sus órdenes e inscripciones;
  - grupos de pago cuyo nombre contiene "(borrar)";
  - cuentas con correo @example.com (nunca superadmin, Admin ni Maintainer de la
    organización), con sus órdenes, progreso y archivos.

Por defecto es una SIMULACIÓN: solo muestra lo que borraría. Con --aplicar borra todo
en una sola transacción, quita los archivos y limpia la caché de cursos en Redis.
Se niega a correr si LEARNHOUSE_DEVELOPMENT_MODE no es "true", salvo con
--permitir-produccion (haz antes scripts/backup.sh).

Se ejecuta DENTRO del contenedor de la API (usa sus variables de entorno):
  Local:
    docker compose -f dev/docker-compose.yml exec -T api python - < deploy/scripts/limpiar-datos-de-prueba.py
    docker compose -f dev/docker-compose.yml exec -T api python - --aplicar < deploy/scripts/limpiar-datos-de-prueba.py
  Producción (solo si de verdad hay datos de prueba ahí):
    docker compose -f docker-compose.prod.yml exec -T learnhouse-app /app/api/.venv/bin/python - \
      --permitir-produccion < scripts/limpiar-datos-de-prueba.py            # simulación
    ... --permitir-produccion --aplicar < scripts/limpiar-datos-de-prueba.py
Opciones: --db URL (por defecto LEARNHOUSE_SQL_CONNECTION_STRING), --contenido DIR,
--marca TEXTO (por defecto "(borrar)"), --dominio-correo DOM (por defecto example.com).
"""

import argparse
import os
import shutil
import sys

import psycopg2

PROTECTED_ROLE_IDS = (1, 2)  # Admin, Maintainer
CONTENT_CANDIDATES = ("/app/api/content", "/app/content", "./content")
# Tables that point at a course by its uuid string (no foreign key, so no cascade).
UUID_REFERENCE_TABLES = (
    "resourceauthor",
    "usergroupresource",
    "foldercontent",
    "sc_pay_offer_resource",
    "sc_pay_group_resource",
)


def parse_args(argv):
    p = argparse.ArgumentParser(description="Borra datos de prueba (simulación por defecto).")
    p.add_argument("--aplicar", action="store_true", help="borrar de verdad")
    p.add_argument("--permitir-produccion", action="store_true",
                   help="permitir correr con LEARNHOUSE_DEVELOPMENT_MODE distinto de true")
    p.add_argument("--db", default=os.environ.get("LEARNHOUSE_SQL_CONNECTION_STRING", ""))
    p.add_argument("--contenido", default="", help="carpeta de contenido (autodetectada)")
    p.add_argument("--marca", default="(borrar)")
    p.add_argument("--dominio-correo", default="example.com")
    return p.parse_args(argv)


def content_dir(explicit):
    if explicit:
        return explicit if os.path.isdir(explicit) else None
    existing = [c for c in CONTENT_CANDIDATES if os.path.isdir(c)]
    for candidate in existing:
        if os.path.isdir(os.path.join(candidate, "orgs")):
            return candidate
    return existing[0] if existing else None


def fetch(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()


def table_exists(cur, name):
    cur.execute("select to_regclass(%s) is not null", (f"public.{name}",))
    return cur.fetchone()[0]


def collect(cur, marca, dominio):
    like_marca = f"%{marca}%"
    data = {}
    data["courses"] = fetch(cur, """
        select c.id, c.course_uuid, c.name, o.org_uuid
        from course c join organization o on o.id = c.org_id
        where c.name ilike %s order by c.id""", (like_marca,))
    course_uuids = [row[1] for row in data["courses"]]

    data["offers"] = []
    if table_exists(cur, "sc_pay_offer"):
        data["offers"] = fetch(cur, """
            select f.id, f.offer_uuid, f.name from sc_pay_offer f
            where f.name ilike %s
               or (exists (select 1 from sc_pay_offer_resource r where r.offer_id = f.id)
                   and not exists (select 1 from sc_pay_offer_resource r
                                   where r.offer_id = f.id
                                     and not (r.resource_uuid = any(%s))))
            order by f.id""", (like_marca, course_uuids))
    data["groups"] = []
    if table_exists(cur, "sc_pay_group"):
        data["groups"] = fetch(cur, "select id, name from sc_pay_group where name ilike %s order by id",
                               (like_marca,))

    candidates = fetch(cur, """
        select u.id, u.user_uuid, u.email, u.is_superadmin,
               exists (select 1 from userorganization uo
                       where uo.user_id = u.id and uo.role_id = any(%s)) as protected
        from "user" u where lower(u.email) like %s order by u.id""",
        (list(PROTECTED_ROLE_IDS), f"%@{dominio.lower()}"))
    data["users"] = [(uid, uuid, email) for uid, uuid, email, superadmin, protected in candidates
                     if not superadmin and not protected]
    data["skipped_users"] = [email for _, _, email, superadmin, protected in candidates
                             if superadmin or protected]

    offer_ids = [row[0] for row in data["offers"]]
    user_ids = [row[0] for row in data["users"]]
    data["orders"] = 0
    if table_exists(cur, "sc_pay_order"):
        cur.execute("select count(*) from sc_pay_order where offer_id = any(%s) or user_id = any(%s)",
                    (offer_ids, user_ids))
        data["orders"] = cur.fetchone()[0]
    return data


def report(data):
    print(f"Cursos/ebooks de prueba: {len(data['courses'])}")
    for cid, uuid, name, _ in data["courses"]:
        print(f"  - [{cid}] {name} ({uuid})")
    print(f"Ofertas de prueba: {len(data['offers'])}")
    for oid, uuid, name in data["offers"]:
        print(f"  - [{oid}] {name} ({uuid})")
    print(f"Grupos de pago de prueba: {len(data['groups'])}")
    for gid, name in data["groups"]:
        print(f"  - [{gid}] {name}")
    print(f"Cuentas de prueba: {len(data['users'])}")
    for uid, _, email in data["users"]:
        print(f"  - [{uid}] {email}")
    for email in data["skipped_users"]:
        print(f"  (se conserva {email}: es admin, maintainer o superadmin)")
    print(f"Órdenes afectadas (se borran en cascada): {data['orders']}")


def delete(cur, data):
    course_ids = [row[0] for row in data["courses"]]
    course_uuids = [row[1] for row in data["courses"]]
    if course_uuids:
        for table in UUID_REFERENCE_TABLES:
            if table_exists(cur, table):
                cur.execute(f"delete from {table} where resource_uuid = any(%s)", (course_uuids,))
    if data["offers"]:
        cur.execute("delete from sc_pay_offer where id = any(%s)", ([row[0] for row in data["offers"]],))
    if data["groups"]:
        cur.execute("delete from sc_pay_group where id = any(%s)", ([row[0] for row in data["groups"]],))
    if course_ids:
        cur.execute("delete from course where id = any(%s)", (course_ids,))
    if data["users"]:
        cur.execute('delete from "user" where id = any(%s)', ([row[0] for row in data["users"]],))


def remove_files(base, data):
    if not base:
        print("Aviso: no encontré la carpeta de contenido; los archivos quedan en disco.")
        return
    paths = [os.path.join(base, "orgs", org_uuid, "courses", uuid) for _, uuid, _, org_uuid in data["courses"]]
    paths += [os.path.join(base, "users", uuid) for _, uuid, _ in data["users"]]
    for path in paths:
        if os.path.isdir(path):
            shutil.rmtree(path)
            print(f"  archivos borrados: {path}")


def clear_cache():
    url = os.environ.get("LEARNHOUSE_REDIS_CONNECTION_STRING")
    if not url:
        return
    try:
        import redis

        client = redis.Redis.from_url(url)
        removed = 0
        for key in client.scan_iter(match="courses_cache:*", count=500):
            removed += client.delete(key)
        client.incr("sc_pay:access_version")
        print(f"Caché: {removed} claves de cursos borradas; caché de acceso invalidada.")
    except Exception as exc:  # cache is best effort; data is already gone
        print(f"Aviso: no se pudo limpiar Redis ({exc}). Las cachés vencen solas en minutos.")


def main(argv):
    args = parse_args(argv)
    dev_mode = os.environ.get("LEARNHOUSE_DEVELOPMENT_MODE", "").strip().lower() in ("true", "1", "yes")
    if not dev_mode and not args.permitir_produccion:
        print("Esto no parece el entorno local (LEARNHOUSE_DEVELOPMENT_MODE no es true). "
              "No se hizo nada. Si de verdad quieres limpiar aquí, haz una copia de seguridad "
              "y usa --permitir-produccion.", file=sys.stderr)
        return 2
    if not args.db:
        print("Falta la conexión a la base (LEARNHOUSE_SQL_CONNECTION_STRING o --db).", file=sys.stderr)
        return 2

    conn = psycopg2.connect(args.db.replace("postgresql+asyncpg://", "postgresql://", 1))
    try:
        with conn:
            with conn.cursor() as cur:
                data = collect(cur, args.marca, args.dominio_correo)
                report(data)
                nothing = not (data["courses"] or data["offers"] or data["groups"] or data["users"])
                if nothing:
                    print("No hay datos de prueba. Nada que hacer.")
                    return 0
                if not args.aplicar:
                    print("\nSIMULACIÓN: no se borró nada. Repite con --aplicar para borrar.")
                    return 0
                delete(cur, data)
        print("Base de datos: borrado confirmado.")
    finally:
        conn.close()
    remove_files(content_dir(args.contenido), data)
    clear_cache()
    return 0


if __name__ == "__main__":
    # "python - --aplicar < script" leaves "-" in argv[0]; options follow it.
    sys.exit(main(sys.argv[1:]))
