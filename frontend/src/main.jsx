import Tournaments from './Tournaments';
import Training from './Training';
import StockfishGame from './StockfishGame';
import ClubBoard from './ClubBoard';
import ChessWave from './ChessWave';
import SectionNav from './SectionNav';
import React, {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";

const data = JSON.parse(document.getElementById("page-data").textContent);
const {csrf, statuses, reports, labels} = data;
const money = value => new Intl.NumberFormat("ru-RU", {style:"currency", currency:"RUB", maximumFractionDigits:2}).format(Number(value)/100);
const date = value => new Date(value).toLocaleString("ru-RU", {timeZone:"Europe/Moscow", dateStyle:"short", timeStyle:"short"});
const bookingLink = id => "/booking/" + id;
const query = new URLSearchParams(location.search);

function Form({command, action, fields={}, children, className="row", upload=false}) {
  return <form method="post" className={className} action={action || (upload ? "/visitors/import" : "/action/"+command)} encType={upload ? "multipart/form-data" : undefined}>
    {Object.entries({csrf,...fields}).map(([name,value]) => <input key={name} type="hidden" name={name} value={value}/>)}
    {children}
  </form>;
}
function Staff({optional=false}) {
  return <label>{optional ? "Инициатор" : "Сотрудник"}<select name="staff_id">
    {optional && <option value="">Посетитель</option>}
    {data.staff.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
  </select></label>;
}
function Pager({next}) {
  const link = n => {const p = new URLSearchParams(query); p.set("page",n); return "?"+p;};
  return <div className="pager">{data.page>1 && <a href={link(data.page-1)}>← Назад</a>}Страница {data.page}{next && <a href={link(data.page+1)}>Дальше →</a>}</div>;
}
function valueOf(field,value) {
  if(value==null) return "—";
  if(["price","amount","net","gross","cumulative","change_from_previous_reported_month"].includes(field)) return money(value);
  if(["starts","ends","last_missed","requested_at"].includes(field)) return date(value);
  if(field==="month") return new Date(value).toLocaleDateString("ru-RU",{timeZone:"UTC",year:"numeric",month:"long"});
  if(field==="status") return statuses[value];
  return value;
}
function Grid({rows,fields,bookingIds=false}) {
  if(!rows.length) return <p>Записей нет.</p>;
  return <div className="scroll"><table><thead><tr>{fields.map(f=><th key={f}>{f==="name" && data.screen==="ratings" ? "Шахматист" : labels[f]||f}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={row.id??i}>{fields.map(f=><td key={f}>{f==="booking_id" || (bookingIds && f==="id") ? <a href={bookingLink(row[f])}>№ {row[f]}</a> : valueOf(f,row[f])}</td>)}</tr>)}</tbody></table></div>;
}
const scheduleFields=["id","visitor","code","starts","status"];
const reserveLink=<a className="btn" href="/reserve">＋ Новая бронь</a>;

function Hall() {
  const {tables,upcoming}=data;
  const [filter,setFilter]=useState("all");
  const state=t=>!t.active?"off":t.busy?"busy":"free";
  const names={free:"Свободен",busy:"Занят",off:"Обслуживание"};
  return <><div className="headline hall-hero"><ChessWave/><ClubBoard scholars/><div className="hall-copy"><p className="over">{new Date(data.now).toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"})}　/　10:00 — 22:00</p><h1 className="hall-title" aria-label="Хотите играть как Магнус?">
      {"Хотите играть как Магнус?".split(" ").map((word,index) => <React.Fragment key={word}>
        {index>0 && " "}<span className="hall-word" aria-hidden="true">{Array.from(word,(letter,i) =>
          <span className="hall-letter" key={i} style={{"--letter":index*5+i}}>{letter}</span>)}</span>
      </React.Fragment>)}
    </h1><div className="hall-actions"><a className="btn" href="/reserve">Забронировать стол</a>
      <div className="training-prompt">Не умеете?<br/><a className="training-link" href="/coaches#lesson">Мы научим — тренировки →</a></div></div></div><ClubBoard/></div>
    <div className="metrics">{Object.entries({free:"Свободно сейчас",busy:"Занято сейчас",off:"На обслуживании"}).map(([k,title])=><div key={k}><span><i className={k}/>{title}</span><strong>{tables.filter(t=>state(t)===k).length}</strong></div>)}</div>
    <section><div className="sectionhead"><h2>Карта столов</h2><select aria-label="Состояние стола" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Все столы · {tables.length}</option>{Object.entries(names).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    <div className="floor plan-floor">{tables.filter(t=>filter==="all"||state(t)===filter).map((t,index)=><div className="slot" key={t.id} data-theme={["forest","walnut","ocean","slate","plum","sand"][(t.id-1)%6]} style={{"--order":index}}>
        <a className={"tile "+(!t.active?"disabled":t.busy?"occupied":"")} href={"/tables/"+t.id}>
          <span className="table-model" aria-hidden="true"><i/></span><b>{t.code}</b><small>{names[state(t)]}</small>
        </a>
        {!t.active && <Form className="slot-action" command="reopen" fields={{table_id:t.id}}><button aria-label={"Снять с обслуживания "+t.code}>Снять с обслуживания</button></Form>}
      </div>)}</div>{filter!=="all" && !tables.some(t=>state(t)===filter) && <p>Столов в этом состоянии нет.</p>}</section>
    <section><div className="sectionhead"><h2>Ближайшие брони</h2><a href="/bookings">Все брони →</a></div>{upcoming.length ? <><p className="booking-mood">Вперёд в бой!</p><Grid rows={upcoming} fields={scheduleFields} bookingIds/></> : <p className="booking-mood"><img src="/static/queen-cursor.svg" alt=""/>Скучаю без партии…</p>}</section></>;
}
function Reserve() {
  const {available,visitors,tariffs}=data;
  const [search,setSearch]=useState("");
  const candidates=visitors.filter(v=>(v.name+" "+v.email).toLowerCase().includes(search.toLowerCase()));
  return <><h1>Новая бронь</h1><section><h2>Интервал игры</h2><form className="row"><label>Дата<input required type="date" name="day" defaultValue={data.day}/></label>
    {["start","end"].map((k,i)=><label key={k}>{i?"Окончание":"Начало"}<input required type="time" name={k} step="1800" defaultValue={data[k]}/></label>)}
    {query.has("t") && <input type="hidden" name="t" value={query.get("t")}/>}<button>Найти столы</button></form><small>По Москве. Минимум один час, шаг 30 минут.</small></section>
    <section><h2>Свободные столы · {data.start} — {data.end}</h2>{!available.length ? <p>На этот интервал свободных столов нет.</p> : !visitors.length || !tariffs.length ? <p>Добавьте посетителя и тариф в справочники.</p> :
    <Form className="stack" command="hold" fields={{starts:data.s,ends:data.e,request_key:data.key}}>
      <label>Стол<select name="table_id" defaultValue={query.get("t")||available[0].id}>{available.map(t=><option key={t.id} value={t.id}>{t.code}</option>)}</select></label>
      <label>Поиск посетителя<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Имя или почта"/></label><label>Посетитель<select required name="visitor_id">{candidates.map(v=><option key={v.id} value={v.id}>{v.name} {v.email ? " · "+v.email : ""}</option>)}</select></label>
      <label>Тариф<select name="tariff_id">{tariffs.map(t=><option key={t.id} value={t.id}>{t.name} · {money(t.hourly_kopecks)}/час</option>)}</select></label>
      {data.discount>0 && <p>Скидка за серию задач: <strong>{data.discount}%</strong></p>}
      <button disabled={!candidates.length}>Удержать стол на 10 минут</button></Form>}</section></>;
}
function Bookings() {
  return <><div className="headline"><h1>Брони</h1>{reserveLink}</div><section><form className="row"><label>Состояние<select name="status" defaultValue={data.status}><option value="">Все состояния</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button>Показать</button></form><Grid rows={data.rows.slice(0,20)} fields={scheduleFields} bookingIds/><Pager next={data.rows.length>20}/></section></>;
}
function Booking() {
  const r=data.row, fields={booking_id:r.id};
  return <><a href="/bookings">← Брони</a><div className="headline"><h1>Бронь № {r.id}</h1><span className="pill">{statuses[r.status]}</span></div><section><h2>{r.visitor} · {r.code}</h2><p>{date(r.starts)} — {date(r.ends)} · {money(r.price)}</p>
    {r.status==="HOLD" && <Form command="pay" fields={{...fields,event_id:data.key,kopecks:r.price}}><button>Подтвердить учебную оплату</button></Form>}
    {["CONFIRMED","IN_USE"].includes(r.status) && <Form command={r.status==="CONFIRMED"?"enter":"leave"} fields={fields}><Staff/><button>{r.status==="CONFIRMED"?"Открыть визит":"Завершить визит"}</button></Form>}</section>
    {["HOLD","CONFIRMED"].includes(r.status) && <section><details><summary>Отменить бронь</summary><Form command="cancel" fields={fields}><Staff optional/><label>Причина<input required name="reason"/></label><button>Оформить отмену</button></Form></details></section>}
    <section><h2>Платежи и возвраты</h2>{!data.payments.length && <p>Оплат пока нет.</p>}{data.payments.map(p=><div key={p.id}><p>Оплата {money(p.amount)}{p.refundable!=null && " · Возврат "+money(p.refundable)+" · "+(p.settled_at?"Исполнен":"Ожидает")}</p>{p.refundable!=null && !p.settled_at && <Form command="refund" fields={{...fields,event_id:p.id}}><button>Подтвердить возврат</button></Form>}</div>)}</section></>;
}
function Table() {
  const r=data.row;
  return <><a href="/">← Игровой зал</a><div className="headline"><h1>Стол {r.code}</h1>{r.active && <a className="btn" href={"/reserve?t="+r.id}>Выбрать интервал</a>}</div><section><h2>Обслуживание стола</h2>{r.active ? <><p>Открытые удержания и подтверждённые брони будут отменены. По оплаченным броням будет оформлен возврат.</p><Form command="maintenance" fields={{table_id:r.id}}><Staff/><label>Причина<input name="reason" required/></label><button>Закрыть на обслуживание</button></Form></> : <Form command="reopen" fields={{table_id:r.id}}><button>Снять с обслуживания</button></Form>}</section></>;
}
function CatalogFields({row={}}) {
  const visitor=data.entity==="visitor";
  return <><label>{visitor?"Имя":"Название"}<input name="name" required defaultValue={row.name}/></label><label>{visitor?"Почта":"Ставка, коп./час"}<input type={visitor?"email":"number"} min="1" required name="value" defaultValue={visitor?row.email:row.hourly_kopecks}/></label></>;
}
function Catalog() {
  const {entity,rows}=data, visitor=entity==="visitor";
  return <><h1>{data.title}</h1><section><details><summary>{visitor?"Добавить посетителя":"Добавить тариф"}</summary><Form command="add" fields={{entity}}><CatalogFields/><button>Добавить</button></Form></details>{visitor && <details className="record"><summary>Импорт CSV</summary><Form upload><label>UTF-8, заголовок name,email · до 60 КБ<input required type="file" name="file" accept=".csv,text/csv"/></label><button>Загрузить</button></Form></details>}</section>
    <section><form className="row"><label>Поиск<input name="search" defaultValue={data.search}/></label><button>Найти</button></form>
    {rows.map(r=><details key={r.id} className="record"><summary>{r.name} <small>{visitor?r.email:money(r.hourly_kopecks)}</small></summary><Form command="edit" fields={{entity,id:r.id}}><CatalogFields row={r}/><button>Сохранить</button></Form><details><summary>Удаление</summary><Form command="delete" fields={{entity,id:r.id}}><button>Подтвердить удаление</button></Form></details></details>)}{!rows.length && <p>Записей нет.</p>}<Pager next={rows.length===20}/></section></>;
}
function Reports() {
  return <><h1>Аналитика</h1><section><form className="row"><label>Отчёт<select name="view" defaultValue={data.view}>{Object.entries(reports).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><button>Открыть</button></form><div className="sectionhead"><h2>{reports[data.view]}</h2>{data.view==="monthly_cash" && <Form command="refresh"><button>Обновить данные</button></Form>}</div><Grid rows={data.rows} fields={data.fields} bookingIds={data.view==="schedule"}/><Pager next={data.rows.length===25}/></section></>;
}
function ErrorPage() {
  return <><h1>Ошибка запроса</h1><section><p>{data.message}</p><a href="/">Вернуться в зал</a></section></>;
}
function Ratings() {
  const {leaders,rows} = data;
  return <><h1>Рейтинг клуба</h1>
    <section><h2>{leaders.length>1 ? "Лидеры недели" : "Лидер недели"}</h2>
      {leaders.length ? <p><strong>{leaders.map(x=>x.name).join(", ")}</strong> · Побед: {leaders[0].wins}</p> : <p>На этой неделе побед пока нет.</p>}
      <small>Победы с понедельника по московскому времени.</small>
    </section>
    <section><h2>Клубный зачёт</h2><p>Рейтинги и результаты учебные. Игроки с равным рейтингом делят место.</p>
      <Grid rows={rows.slice(0,25)} fields={["position","name","rating","wins"]}/><Pager next={rows.length>25}/>
    </section></>;
}
function Profile() {
  const account=data.account;
  return <><h1>Профиль игрока</h1><section><h2>{account ? account.username : "Вход и регистрация"}</h2>
    {account ? <>
      {account.ratings && <><p>Рейтинги Lichess · обновлено {date(account.synced_at)}</p>
      <dl className="online-ratings">{Object.entries({bullet:"Пуля",blitz:"Блиц",rapid:"Рапид",classical:"Классика"}).map(([id,label])=>
        <div key={id}><dt>{label}</dt><dd>{account.ratings[id] ? account.ratings[id].rating+(account.ratings[id].provisional?"?":"") : "Нет партий"}</dd></div>)}</dl>
      <small>Знак вопроса обозначает предварительный рейтинг.</small>
      <Form action="/login/lichess"><button>Обновить через Lichess</button></Form></>}
      <Form action="/profile/logout"><button>Выйти из профиля</button></Form>
    </> : <>
      <Form action="/account/login">
        <label>Почта<input type="email" name="email" autoComplete="username" required/></label>
        <label>Пароль<input type="password" name="password" autoComplete="current-password" required/></label>
        <button>Войти</button>
      </Form>
      <details><summary>Создать аккаунт</summary>
        <Form action="/account/register">
          <label>Имя в клубе<input name="name" autoComplete="nickname" minLength={2} maxLength={80} required/></label>
          <label>Почта<input type="email" name="email" autoComplete="email" maxLength={254} required/></label>
          <label>Пароль<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
          <button>Зарегистрироваться</button>
        </Form>
      </details>
      {!data.public_demo && <Form action="/login/lichess"><button>Продолжить с Lichess</button></Form>}
    </>}</section></>;
}
const coachPhotos = {
  dubov: ["Daniil_Dubov_Satka_2018.jpg","Etery Kublashvili","3.0"],
  nakamura: ["HikaruNakamura23b.jpg","Stefan64","3.0"],
  nepomniachtchi: ["Ian_Nepomniachtchi_in_2024.jpg","Frans Peeters","2.0"],
  carlsen: ["Magnus_Carlsen_in_2023.jpg","Frans Peeters","2.0"],
};

function Coaches() {
  useEffect(() => {
    if (location.hash === "#lesson") document.getElementById("lesson")?.scrollIntoView();
  }, []);
  const [selected,setSelected]=useState(data.roster[0]?.slug);
  return <><h1>Тренеры</h1><p>Учебный каталог. Записи сохраняются в bbchess и не отправляются шахматистам.</p>
    <div className="coach-grid">{data.roster.map(coach=>{
      const photoCredit=coachPhotos[coach.slug];
      return <article className="coach-card" key={coach.slug}>
        <img src={"/static/coaches/"+coach.slug+(coach.slug==="baldynov"?".png":".webp")} alt={coach.name}/>
        <div><h2>{coach.name}{coach.slug==="baldynov" && " (играет хуже чем влад)"}</h2><p>{money(coach.hourly_kopecks)} / 60 мин</p>
        <a className="btn" href="#lesson" onClick={()=>setSelected(coach.slug)}>Выбрать тренера</a>
        {photoCredit && <small><a href={"https://commons.wikimedia.org/wiki/File:"+photoCredit[0]}>Фото: {photoCredit[1]}</a> · <a href={"https://creativecommons.org/licenses/by-sa/"+photoCredit[2]+"/"}>CC BY-SA {photoCredit[2]}</a> · уменьшено и кадрировано</small>}</div>
      </article>;
    })}</div>
    <section id="lesson"><h2>Запись на занятие</h2>
      <Form action="/coaches/book">
        <label>Тренер<select value={selected} onChange={event=>setSelected(event.target.value)} name="coach" required>{data.roster.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
        <label>Посетитель<select name="visitor" defaultValue={data.member??""} required><option value="" disabled>Выберите посетителя</option>{data.visitors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label>Дата<input type="date" name="day" required defaultValue={data.tomorrow}/></label>
        <label>Время по Москве<select name="hour">{Array.from({length:12},(_,i)=>i+10+":00").map(t=><option key={t}>{t}</option>)}</select></label>
        <button>Записать на занятие</button>
      </Form></section>
    <section><h2>Предстоящие занятия</h2><Grid rows={data.lessons} fields={["coach","visitor","starts","price"]}/></section></>;
}
function SiteFooter({items}) {
  return <footer className="site-footer">
    <div className="footer-columns">
      <div>
        <a className="brand" href="/">bbchess</a>
        <p>Шахматный клуб · Москва</p>
        <p>10:00–22:00 по Москве</p>
      </div>
      <div>
        <h2>Разделы</h2>
        <ul>{items.map(([url,title])=><li key={url}><a href={url}>{title}</a></li>)}</ul>
      </div>
      <div>
        <h2>Created by</h2>
        <p>Баянов Владислав<br/>Балдынов Тамир</p>
        <p>React · Flask · PostgreSQL</p>
      </div>
    </div>
    <div className="footer-bottom"><a href="#top">Наверх ↑</a></div>
  </footer>;
}

const themeKey = "bbchess-theme";

function currentTheme() {
  try {
    return localStorage.getItem(themeKey) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

document.documentElement.dataset.theme = currentTheme();

function ThemeToggle() {
  const [theme,setTheme] = useState(currentTheme);
  useEffect(() => {
    function sync(event) {
      if (event.key !== themeKey && event.key !== null) return;
      const next = currentTheme();
      document.documentElement.dataset.theme = next;
      setTheme(next);
    }
    window.addEventListener("storage",sync);
    return () => window.removeEventListener("storage",sync);
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(themeKey,next); } catch {}
  }

  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="Светлая тема" aria-pressed={theme==="light"}>
    <span aria-hidden="true">{theme==="light" ? "☾" : "☀"}</span> {theme==="light" ? "Тёмная" : "Светлая"}
  </button>;
}

function App() {
  const play = data.screen==="hall" && query.get("play")==="1";
  const Page=play ? StockfishGame : {tournaments:Tournaments,tournament:Tournaments,training:Training,coaches:Coaches,profile:Profile,ratings:Ratings,hall:Hall,reserve:Reserve,booking:Booking,bookings:Bookings,table:Table,catalog:Catalog,analytics:Reports,error:ErrorPage}[data.screen];
  const nav=[["/","Зал"],["/bookings","Брони"],["/catalog/visitor","Посетители"],["/catalog/tariff","Тарифы"],["/ratings","Рейтинг"],["/reports","Аналитика"],["/coaches","Тренеры"],["/profile","Профиль"],["/?play=1","Играть"],["/training","Тренировки"],["/tournaments","Турниры"]];
  const active=play ? "/?play=1" : {tournament:"/tournaments",hall:"/",table:"/",reserve:"/bookings",booking:"/bookings"}[data.screen]||location.pathname;
  return <><header id="top"><a className="brand" href="/"><img className="brandmark" src="/static/monogram.svg" alt="B, король, B"/><span>bbchess</span></a><SectionNav items={nav} active={active}/><ThemeToggle/></header><main>{data.messages.map(([kind,msg],i)=><aside key={i} role="status" className={kind}>{msg}</aside>)}<Page csrf={data.csrf} member={data.member} data={data}/></main><SiteFooter items={nav}/></>;
}
createRoot(document.getElementById("root")).render(<App/>);
