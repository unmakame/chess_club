import os
import subprocess
from pathlib import Path

from flask import abort, flash, redirect, request, session, url_for
from psycopg.rows import dict_row

from db import connect

MAX_PLAYERS = 32
RESULTS = ("1-0", "0-1", "1/2-1/2")
binary_name = "round_robin.exe" if os.name == "nt" else "round_robin"
default_binary = Path(__file__).resolve().parent / "bin" / binary_name


def make_schedule(players):
    data = " ".join(map(str, [len(players), *players]))
    process = subprocess.run(
        [os.getenv("TOURNAMENT_ENGINE", str(default_binary))],
        input=data, capture_output=True, text=True, timeout=5, check=True,
    )
    games = [tuple(map(int, line.split())) for line in process.stdout.splitlines()]
    if len(games) != len(players) * (len(players) - 1) // 2:
        raise ValueError("Неполное расписание")
    return games


def install(app, screen):
    @app.get("/tournaments")
    def tournaments():
        with connect() as db:
            db.row_factory = dict_row
            rows = db.execute("""
                SELECT t.id,t.title,t.started_at,count(p.visitor_id) AS players
                FROM tournament t LEFT JOIN tournament_player p ON p.tournament_id=t.id
                GROUP BY t.id ORDER BY t.id DESC
            """).fetchall()
        return screen("tournaments", "Турниры", tournaments=rows, signed_in=bool(session.get("member")))

    @app.post("/tournaments")
    def create_tournament():
        member = session.get("member")
        if not member:
            abort(403)
        title = request.form.get("title", "").strip()
        if not 3 <= len(title) <= 100:
            flash("Введите название от 3 до 100 символов.", "error")
            return redirect(url_for("tournaments"), 303)
        with connect() as db:
            tournament_id = db.execute(
                "INSERT INTO tournament(title,organizer_id) VALUES (%s,%s) RETURNING id", (title, member),
            ).fetchone()[0]
        return redirect(url_for("tournament", tournament_id=tournament_id), 303)

    @app.get("/tournaments/<int:tournament_id>")
    def tournament(tournament_id):
        member = session.get("member")
        with connect() as db:
            db.row_factory = dict_row
            event = db.execute("SELECT * FROM tournament WHERE id=%s", (tournament_id,)).fetchone()
            if not event:
                abort(404)
            players = db.execute("""
                SELECT s.*,v.name FROM tournament_standings s JOIN visitor v ON v.id=s.visitor_id
                WHERE s.tournament_id=%s ORDER BY s.place,v.name,v.id
            """, (tournament_id,)).fetchall()
            games = db.execute("""
                SELECT g.*,w.name AS white,b.name AS black FROM tournament_game g
                JOIN visitor w ON w.id=g.white_id JOIN visitor b ON b.id=g.black_id
                WHERE g.tournament_id=%s ORDER BY g.round,g.white_id,g.black_id
            """, (tournament_id,)).fetchall()
        return screen("tournament", event["title"], event=event, players=players, games=games,
                      organizer=member == event["organizer_id"], signed_in=bool(member),
                      joined=any(player["visitor_id"] == member for player in players))

    @app.post("/tournaments/<int:tournament_id>/<action>")
    def tournament_action(tournament_id, action):
        if action not in ("join", "start", "result"):
            abort(404)
        member = session.get("member")
        if not member:
            abort(403)
        with connect() as db:
            event = db.execute(
                "SELECT organizer_id,started_at FROM tournament WHERE id=%s FOR UPDATE", (tournament_id,),
            ).fetchone()
            if not event:
                abort(404)
            organizer, started = event
            if action != "join" and organizer != member:
                abort(403)
            if action in ("join", "start"):
                if started:
                    abort(409)
                players = [row[0] for row in db.execute(
                    "SELECT visitor_id FROM tournament_player WHERE tournament_id=%s ORDER BY visitor_id",
                    (tournament_id,),
                )]
                if action == "join":
                    if member not in players:
                        if len(players) >= MAX_PLAYERS:
                            flash("Регистрация заполнена.", "error")
                        else:
                            db.execute("INSERT INTO tournament_player VALUES (%s,%s)", (tournament_id, member))
                elif len(players) < 2:
                    flash("Нужно хотя бы два участника.", "error")
                else:
                    try:
                        games = make_schedule(players)
                    except (OSError, subprocess.SubprocessError, ValueError):
                        app.logger.exception("Tournament scheduling failed")
                        flash("Не удалось составить расписание. Проверьте сборку модуля C++.", "error")
                    else:
                        with db.cursor() as cursor:
                            cursor.executemany("""
                                INSERT INTO tournament_game(tournament_id,round,white_id,black_id)
                                VALUES (%s,%s,%s,%s)
                            """, [(tournament_id, *game) for game in games])
                        db.execute("UPDATE tournament SET started_at=now() WHERE id=%s", (tournament_id,))
            else:
                result = request.form.get("result")
                if not started or result not in RESULTS:
                    abort(400)
                try:
                    ids = tuple(int(request.form[key]) for key in ("round", "white_id", "black_id"))
                except (KeyError, ValueError):
                    abort(400)
                if db.execute("""
                    UPDATE tournament_game SET result=%s
                    WHERE tournament_id=%s AND round=%s AND white_id=%s AND black_id=%s
                """, (result, tournament_id, *ids)).rowcount != 1:
                    abort(404)
        return redirect(url_for("tournament", tournament_id=tournament_id), 303)
