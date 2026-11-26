import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
from uuid import UUID

from flask import abort, jsonify, request, session
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from db import connect
from recommendations import rank_lessons

DAILY_URL = "https://lichess.org/api/puzzle/daily"
MOVE = re.compile(r"[a-h][1-8][a-h][1-8][qrbn]?")
LESSONS = json.loads(Path(__file__).with_name("training_lessons.json").read_text(encoding="utf-8"))
BY_ID = {lesson["id"]: lesson for lesson in LESSONS}

def identifier(field):
    try:
        return UUID(request.form.get(field, ""))
    except ValueError:
        abort(400)


def engine_signal(db, member):
    row = db.execute("""
        SELECT round(avg(loss))::int AS strength
        FROM (SELECT losses FROM training_game_analysis WHERE visitor_id=%s
              ORDER BY created_at DESC LIMIT 5) AS games
        CROSS JOIN LATERAL unnest(games.losses) AS moves(loss)
    """, (member,)).fetchone()
    return row["strength"]


def recommendations(db, member):
    if not member:
        return {**rank_lessons(LESSONS, [], None), "history": []}
    attempts = db.execute("""
        SELECT lesson_id,theme,difficulty,solved,errors,engine_loss
        FROM training_attempt WHERE visitor_id=%s
        ORDER BY created_at DESC,attempt_id DESC LIMIT 160
    """, (member,)).fetchall()
    result = rank_lessons(LESSONS, reversed(attempts), engine_signal(db, member))
    result["history"] = attempts[:12]
    return result


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
        member = session.get("member")
        with connect() as db:
            db.row_factory = dict_row
            plan = recommendations(db, member)
        return screen("training","Шахматный тренажёр",member=bool(member), lessons=LESSONS, plan=plan)

    @app.post("/training/attempt")
    def training_attempt():
        member = session.get("member")
        if not member:
            abort(403)
        attempt_id = identifier("attempt_id")
        lesson = BY_ID.get(request.form.get("lesson_id"))
        moves = request.form.get("moves", "").split()
        if not lesson or not 1<=len(moves)<=104 or not all(MOVE.fullmatch(move) for move in moves):
            abort(400)
        expected = lesson["line"][::2]
        index = errors = 0
        for move in moves:
            if index == len(expected):
                abort(400)
            if move == expected[index]:
                index += 1
            else:
                errors += 1
        if errors>100:
            abort(400)
        with connect() as db:
            db.row_factory = dict_row
            db.execute("""
                INSERT INTO training_attempt(visitor_id,attempt_id,lesson_id,theme,difficulty,solved,errors,engine_loss)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (visitor_id,attempt_id) DO NOTHING
            """, (member,attempt_id,lesson["id"],lesson["theme"],lesson["difficulty"],
                  index==len(expected),errors,engine_signal(db, member)))
            return jsonify(recommendations(db, member))

    @app.post("/training/game-analysis")
    def training_game_analysis():
        member = session.get("member")
        if not member:
            abort(403)
        game_id = identifier("game_id")
        losses = request.form.get("losses", "").split()
        if not 1<=len(losses)<=200 or not all(re.fullmatch(r"[0-9]{1,3}", loss) and int(loss)<=500 for loss in losses):
            abort(400)
        with connect() as db:
            db.row_factory = dict_row
            db.execute("""
                INSERT INTO training_game_analysis(visitor_id,game_id,losses)
                VALUES (%s,%s,%s) ON CONFLICT (visitor_id,game_id) DO NOTHING
            """, (member,game_id,[int(loss) for loss in losses]))
            return jsonify(recommendations(db, member))

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
