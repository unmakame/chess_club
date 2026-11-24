import os
from pathlib import Path

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parent


def connect(admin=False):
    prefix = "ADMIN_" if admin else ""
    return psycopg.connect(
        host=os.getenv("PGHOST", "db"), port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("PGDATABASE", "chess"), user="postgres" if admin else "club_app",
        password=os.environ[prefix + "DB_PASSWORD"], options="-c search_path=club,public -c timezone=Europe/Moscow",
    )


def migrate():
    with connect(True) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(408516)")
        conn.execute("CREATE TABLE IF NOT EXISTS public.schema_version (name text PRIMARY KEY)")
        for path in sorted((ROOT / "sql").glob("*.sql")):
            if conn.execute("SELECT 1 FROM public.schema_version WHERE name=%s", (path.name,)).fetchone():
                continue
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO public.schema_version VALUES (%s)", (path.name,))
        if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='club_app'").fetchone():
            conn.execute("CREATE ROLE club_app LOGIN")
        conn.execute(sql.SQL("ALTER ROLE club_app PASSWORD {}").format(sql.Literal(os.environ["DB_PASSWORD"])))
        conn.execute("REVOKE ALL ON SCHEMA club FROM PUBLIC")
        conn.execute("REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA club FROM PUBLIC")
        conn.execute("GRANT USAGE ON SCHEMA club TO club_app")
        conn.execute("REVOKE SELECT ON ALL TABLES IN SCHEMA club FROM club_app")
        conn.execute("GRANT SELECT ON visitor,tariff,booking,chess_table,closed_day,payment,refund,visit,employee,"
                     "schedule,refund_queue,monthly_cash,attendance_rank,regulars,unused_tables,tariff_sales,no_shows,leaderboard,lichess_account,coach,coaching_lesson,club_account TO club_app")
        conn.execute("GRANT INSERT, UPDATE, DELETE ON visitor,tariff TO club_app")
        conn.execute("GRANT INSERT ON club_account TO club_app")
        conn.execute("GRANT USAGE ON SEQUENCE visitor_id_seq,tariff_id_seq TO club_app")
        for signature in ("hold(bigint,bigint,bigint,timestamptz,timestamptz,uuid)", "receive_payment(bigint,uuid,bigint)",
                          "cancel(bigint,text,bigint)", "attendance(bigint,bigint,boolean)", "expire_bookings()",
                          "book_lesson(text,bigint,timestamptz)", "sign_in_lichess(text,text,jsonb)", "reopen_table(bigint)", "refresh_cash()", "maintain_table(bigint,bigint,text)", "settle_refund(uuid)"):
            conn.execute("GRANT EXECUTE ON FUNCTION club." + signature + " TO club_app")


if __name__ == "__main__":
    migrate()
