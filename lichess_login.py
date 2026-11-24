import base64
import hashlib
import json
import secrets
import time
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import abort, flash, redirect, request, session, url_for
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from db import connect

CLIENT_ID = "bbchess-local-club"
MODES = ("bullet", "blitz", "rapid", "classical")


def api(path, *, body=None, token=None):
    headers = {"Accept": "application/json", "User-Agent": "bbchess/1.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = urlencode(body).encode() if body else None
    with urlopen(Request("https://lichess.org" + path, data=data, headers=headers), timeout=10) as response:
        return json.load(response)


def install(app, screen):
    @app.get("/profile")
    def player_profile():
        account = None
        if session.get("member"):
            with connect() as db:
                db.row_factory = dict_row
                account = db.execute("SELECT username, ratings, synced_at FROM lichess_account WHERE visitor_id=%s",
                                     (session["member"],)).fetchone()
                if not account:
                    account = db.execute("""SELECT v.name AS username,c.provider FROM club_account c
                                            JOIN visitor v ON v.id=c.visitor_id WHERE v.id=%s""",
                                         (session["member"],)).fetchone()
        return screen("profile", "Профиль игрока", account=account,
                      public_demo=app.config.get("PUBLIC_DEMO",False))

    @app.post("/login/lichess")
    def start_lichess():
        verifier = secrets.token_urlsafe(48)
        state = secrets.token_urlsafe(32)
        callback = url_for("finish_lichess", _external=True)
        session["lichess_flow"] = [state, verifier, callback, time.time()]
        digest = hashlib.sha256(verifier.encode()).digest()
        params = dict(response_type="code", client_id=CLIENT_ID, redirect_uri=callback, state=state,
                      scope="", code_challenge_method="S256",
                      code_challenge=base64.urlsafe_b64encode(digest).decode().rstrip("="))
        return redirect("https://lichess.org/oauth?" + urlencode(params), 303)

    @app.get("/login/lichess/callback")
    def finish_lichess():
        flow = session.pop("lichess_flow", None)
        if not flow or time.time()-flow[3]>600 or not secrets.compare_digest(flow[0], request.args.get("state","")):
            abort(400)
        if request.args.get("error") or not request.args.get("code"):
            flash("Вход отменён. Можно попробовать ещё раз.", "error")
            return redirect(url_for("player_profile"))
        try:
            grant = api("/api/token", body=dict(grant_type="authorization_code", code=request.args["code"],
                        client_id=CLIENT_ID, redirect_uri=flow[2], code_verifier=flow[1]))
            user = api("/api/account", token=grant["access_token"])
            scores = {mode: {"rating": perf["rating"], "provisional": bool(perf.get("prov"))}
                      for mode,perf in user.get("perfs",{}).items()
                      if mode in MODES and perf.get("games",0)>0 and isinstance(perf.get("rating"),int)}
            subject, name = user["id"], user["username"]
        except (URLError, TimeoutError, ValueError, KeyError):
            flash("Lichess не подтвердил профиль. Повторите вход позже.", "error")
            return redirect(url_for("player_profile"))
        with connect() as db:
            member = db.execute("SELECT sign_in_lichess(%s,%s,%s)", (subject,name,Jsonb(scores))).fetchone()[0]
        session.clear()
        session["member"] = member
        return redirect(url_for("player_profile"))

    @app.post("/profile/logout")
    def logout():
        session.clear()
        return redirect(url_for("player_profile"), 303)
