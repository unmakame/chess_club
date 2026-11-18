import argparse
import csv
import sys
from uuid import uuid4

import psycopg
from psycopg import sql

from db import connect

CATALOG = {"visitor": ("name", "email"), "tariff": ("name", "hourly_kopecks")}
REPORTS = {"schedule": "starts,id", "refund_queue": "requested_at,payment_id", "monthly_cash": "month",
           "attendance_rank": "month,position,code", "regulars": "visits DESC,id", "unused_tables": "code",
           "tariff_sales": "name", "no_shows": "missed DESC,email"}
COMMANDS = {
    "hold": ("hold", ["visitor_id", "table_id", "tariff_id", "starts", "ends", "request_key"]),
    "pay": ("receive_payment", ["booking_id", "event_id", "kopecks"]),
    "cancel": ("cancel", ["booking_id", "reason", "staff_id?"]),
    "enter": ("attendance", ["booking_id", "staff_id"]),
    "leave": ("attendance", ["booking_id", "staff_id"]),
    "maintenance": ("maintain_table", ["table_id", "staff_id", "reason"]),
    "refund": ("settle_refund", ["event_id"]),
    "reopen": ("reopen_table", ["table_id"]), "refresh": ("refresh_cash", []), "expire": ("expire_bookings", []),
}


def parser():
    root = argparse.ArgumentParser(description="Рабочее место администратора шахматного клуба")
    subs = root.add_subparsers(dest="command", required=True)
    for name, (_, fields) in COMMANDS.items():
        cmd = subs.add_parser(name)
        for field in fields:
            cmd.add_argument(field.rstrip("?"), nargs="?" if field.endswith("?") else None)
    for name in ("list", "add", "edit", "delete"):
        cmd = subs.add_parser(name)
        cmd.add_argument("entity", choices=CATALOG)
        if name in ("edit", "delete"):
            cmd.add_argument("id", type=int)
        if name in ("add", "edit"):
            cmd.add_argument("name")
            cmd.add_argument("value", help="Email посетителя или часовая ставка в копейках")
        if name == "list":
            cmd.add_argument("--search", default="")
            cmd.add_argument("--sort", choices=["name", "id"], default="id")
            paging(cmd)
    report = subs.add_parser("report")
    report.add_argument("view", choices=REPORTS)
    paging(report)
    subs.add_parser("import").add_argument("csv_file")
    available = subs.add_parser("available")
    available.add_argument("starts")
    available.add_argument("ends")
    subs.add_parser("key")
    return root


def paging(cmd):
    cmd.add_argument("--page", type=int, default=1)
    cmd.add_argument("--limit", type=int, default=25)


def visitors_csv(conn, path):
    with open(path, encoding="utf-8-sig", newline="") as source:
        accepted, rejected = import_visitors(conn, source, sys.stderr)
    print(f"Добавлено {accepted}, отклонено {rejected}")


def import_visitors(conn, source, errors):
    rows = csv.DictReader(source)
    if rows.fieldnames != ["name", "email"]:
        raise ValueError("Нужен заголовок name,email")
    accepted = rejected = 0
    for row in rows:
        try:
            with conn.transaction():
                if None in row or None in row.values():
                    raise ValueError("Неверное число полей")
                conn.execute("INSERT INTO visitor(name,email) VALUES(%s,%s)", (row["name"].strip(), row["email"].strip().lower()))
            accepted += 1
        except (ValueError, psycopg.Error) as error:
            print(f"Строка {rows.line_num}: {error}", file=errors)
            rejected += 1
    return accepted, rejected


def execute(conn, a):
    cmd = a.command
    if cmd in COMMANDS:
        function, fields = COMMANDS[cmd]
        values = [getattr(a, f.rstrip("?")) for f in fields]
        if cmd in ("enter", "leave"):
            values.append(cmd == "leave")
        return conn.execute(sql.SQL("SELECT {}({})").format(sql.Identifier(function), sql.SQL(",").join(sql.Placeholder() for _ in values)), values)
    if cmd == "import":
        visitors_csv(conn, a.csv_file)
        return
    if cmd == "available":
        return conn.execute("""WITH slot AS (SELECT %s::timestamptz s,%s::timestamptz e)
            SELECT t.id,t.code FROM chess_table t,slot WHERE t.active AND s>now() AND s<=now()+interval '90 days'
            AND e-s>=interval '1 hour' AND mod(extract(epoch FROM s),1800)=0 AND mod(extract(epoch FROM e),1800)=0
            AND s::date=e::date AND s::time>=time '10:00' AND e::time<=time '22:00'
            AND NOT EXISTS(SELECT FROM closed_day WHERE day=s::date)
            AND NOT EXISTS(SELECT FROM booking b WHERE b.table_id=t.id AND b.status IN ('HOLD','CONFIRMED','IN_USE')
            AND b.starts<e AND b.ends>s) ORDER BY t.code""", (a.starts,a.ends))
    if cmd in ("report", "list"):
        if a.page<1 or not 1<=a.limit<=200:
            raise ValueError("Номер страницы от 1, размер от 1 до 200")
        page = [a.limit,(a.page-1)*a.limit]
        if cmd == "report":
            return conn.execute(sql.SQL("SELECT * FROM {} ORDER BY {} LIMIT %s OFFSET %s").format(
                sql.Identifier(a.view),sql.SQL(REPORTS[a.view])),page)
        return conn.execute(sql.SQL("SELECT * FROM {} WHERE name ILIKE %s ORDER BY {},id LIMIT %s OFFSET %s").format(
            sql.Identifier(a.entity),sql.Identifier(a.sort)), ["%"+a.search+"%",*page])
    table = sql.Identifier(a.entity)
    if cmd == "delete":
        cursor = conn.execute(sql.SQL("DELETE FROM {} WHERE id=%s RETURNING id").format(table),(a.id,))
    else:
        value = a.value.strip().lower() if a.entity=="visitor" else int(a.value)
        field = sql.Identifier(CATALOG[a.entity][1])
        if cmd == "add":
            cursor = conn.execute(sql.SQL("INSERT INTO {}(name,{}) VALUES(%s,%s) RETURNING id").format(table,field),(a.name.strip(),value))
        else:
            cursor = conn.execute(sql.SQL("UPDATE {} SET name=%s,{}=%s WHERE id=%s RETURNING id").format(table,field),(a.name.strip(),value,a.id))
    if not cursor.rowcount:
        raise ValueError("Запись не найдена")
    return cursor


def main():
    args = parser().parse_args()
    if args.command == "key":
        print(uuid4())
        return 0
    try:
        with connect() as conn:
            rows = execute(conn, args)
            if rows is not None:
                writer = csv.writer(sys.stdout)
                writer.writerow(col.name for col in rows.description)
                writer.writerows(rows)
    except (psycopg.Error, ValueError, OSError) as error:
        print(getattr(getattr(error, "diag", None), "message_primary", None) or str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
