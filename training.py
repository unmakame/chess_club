import json
import re
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from flask import jsonify, request, session
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from db import connect

DAILY_URL = "https://lichess.org/api/puzzle/daily"
MOVE = re.compile(r"[a-h][1-8][a-h][1-8][qrbn]?")


def today():
    return datetime.now(timezone.utc).date()


def fetch_puzzle():
    with urlopen(Request(DAILY_URL, headers={"User-Agent": "bbchess/1.0"}), timeout=5) as response:
        payload = json.load(response)
    puzzle = payload["puzzle"]
    solution = puzzle["solution"]
    if not solution or len(solution)>30 or not all(MOVE.fullmatch(move) for move in solution):
        raise ValueError("Invalid daily solution")
    position = {"fen": puzzle["fen"]} if puzzle.get("fen") else {
        "pgn": payload["game"]["pgn"], "ply": puzzle["initialPly"]+1,
    }
    return puzzle["id"], position, solution


def daily(db, day):
    row = db.execute("SELECT * FROM daily_puzzle WHERE day=%s",(day,)).fetchone()
    if row:
        return row
    source, position, solution = fetch_puzzle()
    db.execute("""INSERT INTO daily_puzzle VALUES (%s,%s,%s,%s)
                  ON CONFLICT (day) DO NOTHING""",(day,source,Jsonb(position),solution))
    return db.execute("SELECT * FROM daily_puzzle WHERE day=%s",(day,)).fetchone()


def progress(db, member, day):
    streak = db.execute("SELECT training_streak(%s) AS streak",(member,)).fetchone()["streak"]
    solved = bool(db.execute("SELECT 1 FROM daily_puzzle_solve WHERE visitor_id=%s AND day=%s",
                             (member,day)).fetchone())
    return dict(streak=streak, discount=min(15,2*streak), solved=solved)


def install(app, screen):
    @app.get("/training")
    def training():
        return screen("training","Шахматный тренажёр",member=bool(session.get("member")))

    @app.get("/training/daily")
    def training_daily():
        day = today()
        try:
            with connect() as db:
                db.row_factory = dict_row
                row = daily(db,day)
                stats = progress(db,session.get("member"),day)
        except (URLError, TimeoutError, ValueError, KeyError):
            return jsonify(error="Задача дня сейчас недоступна. Уроки работают."),503
        return jsonify(day=day.isoformat(), source=row["source_id"], **row["position"], **stats)

    @app.post("/training/solve")
    def training_solve():
        day = today()
        moves = request.form.get("moves","").split()
        if request.form.get("day") != day.isoformat():
            return jsonify(error="Задача обновилась. Перезагрузите страницу."),409
        if not moves or len(moves)>15 or not all(MOVE.fullmatch(move) for move in moves):
            return jsonify(error="Проверьте введённый ход."),400
        with connect() as db:
            db.row_factory = dict_row
            row = db.execute("SELECT * FROM daily_puzzle WHERE day=%s",(day,)).fetchone()
            if not row:
                return jsonify(error="Перезагрузите задачу дня."),409
            solution = row["solution"]
            expected = solution[::2]
            if len(moves)>len(expected) or moves!=expected[:len(moves)]:
                return jsonify(correct=False)
            done = len(moves)==len(expected)
            member = session.get("member")
            credited = False
            if done and member:
                db.execute("""INSERT INTO daily_puzzle_solve VALUES (%s,%s,%s)
                              ON CONFLICT DO NOTHING""",(member,day,row["source_id"]))
                stats = progress(db,member,day)
                credited = stats["solved"]
            else:
                stats = {}
            reply = solution[2*len(moves)-1] if 2*len(moves)-1<len(solution) else None
            return jsonify(correct=True,done=done,reply=reply,credited=credited,**stats)
