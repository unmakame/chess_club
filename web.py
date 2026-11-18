import io
import os
import secrets
from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from flask import Flask, abort, flash, redirect, render_template, request, session, url_for
from psycopg.rows import dict_row
from waitress import serve

from club import CATALOG, COMMANDS, REPORTS, execute, import_visitors
from db import connect

app = Flask(__name__)
app.config.update(SECRET_KEY=secrets.token_hex(32), SESSION_COOKIE_SAMESITE="Strict",
                  TRUSTED_HOSTS=["localhost", "127.0.0.1", "[::1]"], MAX_CONTENT_LENGTH=65536)
MSK = ZoneInfo("Europe/Moscow")
STATUS = dict(HOLD="Удержание", CONFIRMED="Оплачена", IN_USE="В игре", EXPIRED="Истекла",
              CANCELLED="Отменена", NO_SHOW="Неявка", COMPLETED="Завершена")
REPORT_NAMES = dict(schedule="Расписание", refund_queue="Возвраты", monthly_cash="Движение средств",
                    attendance_rank="Загрузка столов", regulars="Постоянные посетители",
                    unused_tables="Столы без активных броней", tariff_sales="Продажи по тарифам", no_shows="Неявки")
LABELS = dict(id="№", code="Стол", visitor="Посетитель", starts="Начало", ends="Окончание", price="Стоимость",
              status="Статус", name="Название", booking_id="Бронь", payment_id="Платёж", amount="Сумма",
              requested_at="Дата заявки", month="Месяц", net="Итого", change_from_previous_reported_month="Изменение",
              cumulative="Накоплено", occupied_minutes="Минуты", position="Место", visits="Визиты", sales="Продажи",
              gross="Сумма продаж", missed="Пропуски", last_missed="Последняя неявка", email="Почта")


@app.context_processor
def context():
    return dict(csrf=session.setdefault("token",secrets.token_urlsafe(24)), statuses=STATUS,
                reports=REPORT_NAMES, labels=LABELS, key=lambda:str(uuid4()))


@app.before_request
def protect():
    if request.method=="POST" and not secrets.compare_digest(session.get("token","!"),request.form.get("csrf","")):
        abort(403)


@app.template_filter("display")
def display(value, field=""):
    if value is None:
        return "—"
    if field in {"price","amount","net","gross","cumulative","change_from_previous_reported_month","hourly_kopecks"}:
        return f"{value/100:,.2f} ₽".replace(","," ").replace(".00","")
    if field=="status":
        return STATUS.get(value,value)
    if isinstance(value,datetime):
        return value.astimezone(MSK).strftime("%d.%m.%Y · %H:%M")
    return value


def call(conn, command, **values):
    return execute(conn,SimpleNamespace(command=command,**values))


@app.get("/")
def hall():
    with connect() as db:
        db.row_factory=dict_row
        tables=db.execute("""SELECT t.id,t.code,t.active,
            EXISTS(SELECT FROM booking b WHERE b.table_id=t.id AND b.status IN ('CONFIRMED','IN_USE','HOLD')
            AND now()>=b.starts AND now()<b.ends) AS busy FROM chess_table t ORDER BY code""").fetchall()
        upcoming=db.execute("""SELECT * FROM schedule WHERE ends>now() AND status IN ('CONFIRMED','IN_USE','HOLD')
            ORDER BY starts,id LIMIT 6""").fetchall()
    return render_template("hall.html", tables=tables, upcoming=upcoming, now=datetime.now(MSK))


@app.get("/reserve")
def reserve():
    today=datetime.now(MSK).date()
    day=request.args.get("day",str(today+timedelta(days=1)))
    start=request.args.get("start","12:00")
    end=request.args.get("end","13:00")
    s,e=(day+"T"+t+":00+03:00" for t in (start,end))
    with connect() as db:
        db.row_factory=dict_row
        available=call(db,"available",starts=s,ends=e).fetchall()
        visitors=db.execute("SELECT id,name,email FROM visitor ORDER BY name,id").fetchall()
        tariffs=db.execute("SELECT * FROM tariff ORDER BY name").fetchall()
    return render_template("reserve.html", day=day, start=start, end=end, s=s, e=e, available=available, visitors=visitors, tariffs=tariffs)


@app.get("/bookings")
def bookings():
    page=max(1,request.args.get("page",1,type=int))
    status=request.args.get("status","")
    with connect() as db:
        db.row_factory=dict_row
        rows=db.execute("""SELECT * FROM schedule WHERE (%s::text='' OR status=%s)
            ORDER BY starts DESC,id DESC LIMIT 21 OFFSET %s""",(status,status,(page-1)*20)).fetchall()
    return render_template("bookings.html",rows=rows,page=page,status=status)


@app.get("/booking/<int:b>")
def booking(b):
    with connect() as db:
        db.row_factory=dict_row
        row=db.execute("SELECT * FROM schedule WHERE id=%s",(b,)).fetchone()
        if not row:
            abort(404)
        payments=db.execute("""SELECT p.id,p.amount,r.amount AS refundable,r.settled_at FROM payment p
            LEFT JOIN refund r ON r.payment_id=p.id WHERE p.booking_id=%s ORDER BY received_at""",(b,)).fetchall()
        staff=db.execute("SELECT id,name FROM employee ORDER BY name").fetchall()
    return render_template("booking.html",row=row,payments=payments,staff=staff)


@app.get("/catalog/<entity>")
def catalog(entity):
    if entity not in CATALOG:
        abort(404)
    page=max(1,request.args.get("page",1,type=int))
    search=request.args.get("search","")
    with connect() as db:
        db.row_factory=dict_row
        rows=call(db,"list",entity=entity,sort="name",search=search,page=page,limit=20).fetchall()
    return render_template("catalog.html",entity=entity,rows=rows,search=search,page=page)


@app.post("/visitors/import")
def upload():
    file=request.files.get("file")
    try:
        if not file:
            raise ValueError("Выберите CSV-файл.")
        source=io.StringIO(file.read().decode("utf-8-sig"))
        errors=io.StringIO()
        with connect() as db:
            accepted,rejected=import_visitors(db,source,errors)
        flash(f"Добавлено {accepted}, отклонено {rejected}.")
        if rejected:
            lines=[s.split(": ",1)[0] for s in errors.getvalue().splitlines() if s.startswith("Строка ")]
            flash("Проверьте строки CSV: "+", ".join(s.split()[-1] for s in lines[:20]),"error")
    except (UnicodeError,ValueError) as exc:
        flash("Требуется UTF-8 и заголовок name,email. "+str(exc),"error")
    return redirect(url_for("catalog",entity="visitor"),303)


@app.errorhandler(psycopg.DataError)
def bad_data(error):
    return render_template("error.html",message="Проверьте формат интервала и введённые значения."),400


@app.errorhandler(psycopg.OperationalError)
def offline(error):
    return render_template("error.html",message="Нет соединения с базой клуба. Проверьте, что PostgreSQL запущен."),503


@app.get("/reports")
def analytics():
    view=request.args.get("view","monthly_cash")
    if view not in REPORTS:
        abort(404)
    page=max(1,request.args.get("page",1,type=int))
    with connect() as db:
        db.row_factory=dict_row
        cur=call(db,"report",view=view,page=page,limit=25)
        fields=[col.name for col in cur.description]
        rows=cur.fetchall()
    return render_template("reports.html",view=view,page=page,fields=fields,rows=rows)


@app.get("/tables/<int:t>")
def table(t):
    with connect() as db:
        db.row_factory=dict_row
        row=db.execute("SELECT * FROM chess_table WHERE id=%s",(t,)).fetchone()
        if not row:
            abort(404)
        staff=db.execute("SELECT id,name FROM employee ORDER BY name").fetchall()
    return render_template("table.html",row=row,staff=staff)


@app.post("/action/<cmd>")
def action(cmd):
    f=request.form
    target=url_for("hall")
    try:
        with connect() as db:
            if cmd in ("add","edit","delete"):
                entity=f.get("entity")
                if entity not in CATALOG:
                    abort(400)
                target=url_for("catalog",entity=entity)
                call(db,cmd,entity=entity,name=f.get("name",""),value=f.get("value",""),id=f.get("id"))
            elif cmd in COMMANDS and cmd!="expire":
                values={field.rstrip("?"):f.get(field.rstrip("?")) or None for field in COMMANDS[cmd][1]}
                if cmd=="hold":
                    target=url_for("reserve")
                elif f.get("booking_id"):
                    target=url_for("booking",b=int(f["booking_id"]))
                elif cmd in ("refresh","refund"):
                    target=url_for("analytics",view="monthly_cash" if cmd=="refresh" else "refund_queue")
                result=call(db,cmd,**values).fetchone()[0]
                if cmd=="hold":
                    target=url_for("booking",b=result)
            else:
                abort(404)
        flash("Изменения сохранены.")
    except (ValueError,psycopg.Error) as exc:
        msg=getattr(getattr(exc,"diag",None),"message_primary",None)
        flash(msg if isinstance(exc,psycopg.errors.RaiseException) else "Проверьте данные и доступность записи. Возможно, она уже изменилась.","error")
    return redirect(target,303)


if __name__=="__main__":
    serve(app,host=os.getenv("WEB_HOST","127.0.0.1"),port=int(os.getenv("WEB_PORT","8080")))
