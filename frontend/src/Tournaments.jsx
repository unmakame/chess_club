import React from "react";

function TournamentForm({csrf, action, children}) {
  return <form method="post" action={action} className="row tournament-form">
    <input type="hidden" name="csrf" value={csrf}/>
    {children}
  </form>;
}

function TournamentList({data}) {
  return <>
    <h1>Турниры</h1>
    <p>Круговой формат. Каждый участник играет одну партию с каждым соперником.</p>
    {data.signed_in ? <section>
      <h2>Создать турнир</h2>
      <TournamentForm csrf={data.csrf} action="/tournaments">
        <label>Название<input name="title" required minLength={3} maxLength={100}/></label>
        <button>Создать</button>
      </TournamentForm>
    </section> : <p><a href="/profile">Войдите в профиль</a>, чтобы создать турнир или записаться.</p>}
    <section>
      <h2>Турниры клуба</h2>
      {data.tournaments.length ? <ul className="tournament-list">{data.tournaments.map(event=><li key={event.id}>
        <a href={"/tournaments/"+event.id}>{event.title}</a>
        <small>{event.players} / 32 · {event.started_at ? "Турнир начался" : "Открыта запись"}</small>
      </li>)}</ul> : <p>Турниров пока нет.</p>}
    </section>
  </>;
}

const scores = {"1-0":"1–0", "0-1":"0–1", "1/2-1/2":"½–½"};

function TournamentRound({games, csrf, base, organizer}) {
  return <div className="scroll"><table>
    <thead><tr><th>Белые</th><th>Чёрные</th><th>Результат</th></tr></thead>
    <tbody>{games.map(game=><tr key={game.white_id+"-"+game.black_id}>
      <td>{game.white}</td><td>{game.black}</td>
      <td>{organizer ? <TournamentForm csrf={csrf} action={base+"/result"}>
        {["round","white_id","black_id"].map(key=><input key={key} type="hidden" name={key} value={game[key]}/>)}
        <select name="result" required defaultValue={game.result || ""} aria-label={"Результат: "+game.white+" — "+game.black}>
          <option value="" disabled>Выберите результат</option>
          {Object.entries(scores).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
        <button>Сохранить</button>
      </TournamentForm> : scores[game.result] || "Ожидается"}</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function Tournaments({data}) {
  if (data.screen === "tournaments") return <TournamentList data={data}/>;

  const {event, players, games, organizer, signed_in, joined, csrf} = data;
  const base = "/tournaments/"+event.id;
  const rounds = new Map();
  for (const game of games) {
    if (!rounds.has(game.round)) rounds.set(game.round, []);
    rounds.get(game.round).push(game);
  }
  const finished = games.length > 0 && games.every(game => game.result);
  return <>
    <a href="/tournaments">← Все турниры</a>
    <h1>{event.title}</h1>
    <p>{finished ? "Турнир завершён" : event.started_at ? "Турнир идёт" : "Регистрация открыта"} · {players.length} / 32 участников</p>
    {event.started_at ? null : <>
      {joined ? <p>Вы записаны.</p> : signed_in ?
        <TournamentForm csrf={csrf} action={base+"/join"}><button>Записаться</button></TournamentForm> :
        <p><a href="/profile">Войдите в профиль</a>, чтобы записаться.</p>}
      {organizer && <TournamentForm csrf={csrf} action={base+"/start"}>
        <button disabled={players.length<2}>Начать турнир</button>
        <small>{players.length<2 ? "Нужно хотя бы два участника." : "После старта запись закроется."}</small>
      </TournamentForm>}
    </>}
    <section><h2>{event.started_at ? "Таблица результатов" : "Участники"}</h2>
      {players.length ? <div className="scroll"><table>
        <thead><tr>{event.started_at && <th>Место</th>}<th>Игрок</th>
          {event.started_at && <><th>Партий</th><th>Побед</th><th>Очки</th></>}</tr></thead>
        <tbody>{players.map(player=><tr key={player.visitor_id}>
          {event.started_at && <td>{player.place}</td>}<td>{player.name}</td>
          {event.started_at && <><td>{player.played}</td><td>{player.wins}</td><td>{Number(player.points).toLocaleString("ru-RU")}</td></>}
        </tr>)}</tbody>
      </table></div> : <p>Пока никто не записался.</p>}
    </section>
    {[...rounds].map(([round, matches])=><section key={round}>
      <h2>Тур {round}</h2>
      <TournamentRound games={matches} csrf={csrf} base={base} organizer={organizer}/>
    </section>)}
  </>;
}
