import re
import secrets

import psycopg
from flask import flash, redirect, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import connect



DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(24))


def start_session(member):
    session.clear()
    session["member"] = member


def install(app, screen):
    @app.post("/account/register")
    def register():
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        if not 2 <= len(name) <= 80 or not 12 <= len(password) <= 128 or len(email) > 254 \
                or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            flash("Укажите имя, корректную почту и пароль длиной от 12 до 128 символов.", "error")
            return redirect("/profile", 303)
        try:
            password_hash = generate_password_hash(password)
            with connect() as db:
                member = db.execute("INSERT INTO visitor(name) VALUES (%s) RETURNING id",
                                    (name,)).fetchone()[0]
                db.execute("INSERT INTO club_account VALUES ('local',%s,%s,%s)", (email,member,password_hash))
        except psycopg.errors.UniqueViolation:
            flash("Аккаунт с таким адресом уже существует.", "error")
        else:
            start_session(member)
        return redirect("/profile", 303)

    @app.post("/account/login")
    def local_login():
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        with connect() as db:
            row = db.execute("SELECT visitor_id,password_hash FROM club_account WHERE provider='local' AND subject=%s",
                             (email,)).fetchone()
        valid = len(password)<=128 and check_password_hash(row[1] if row else DUMMY_HASH,password)
        if row and valid:
            start_session(row[0])
        else:
            flash("Неверная почта или пароль.", "error")
        return redirect("/profile", 303)
