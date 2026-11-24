import React, {useEffect, useState} from "react";
import {Chess} from "chess.js";
import TrainingPiece from "./TrainingPiece";

const lessons = [
  {id:"italian", group:"Дебюты", title:"Итальянская партия",
    idea:"Займите центр пешкой e, выведите коня на f3 и слона на c4. Слон давит на f7.",
    line:["e2e4","e7e5","g1f3","b8c6","f1c4"]},
  {id:"sicilian", group:"Дебюты", title:"Открытая сицилианская",
    idea:"После ответа чёрных c5 выведите коня на f3 и сыграйте d4. После размена верните пешку конём.",
    line:["e2e4","c7c5","g1f3","d7d6","d2d4","c5d4","f3d4"]},
  {id:"fork", group:"Тактика", title:"Вилка конём",
    idea:"Найдите шах конём, который одновременно нападает на ладью.",
    fen:"3r3k/8/8/4N3/8/8/8/4K3 w - - 0 1",line:["e5f7"]},
  {id:"pin", group:"Тактика", title:"Абсолютная связка",
    idea:"Поставьте слона так, чтобы чёрный конь прикрывал короля и не мог уйти.",
    fen:"4k3/8/2n5/8/8/8/4B3/4K3 w - - 0 1",line:["e2b5"]},
  {id:"mate", group:"Тактика", title:"Мат по последней горизонтали",
    idea:"Три пешки закрыли выход чёрному королю. Поставьте мат ладьёй.",
    fen:"6k1/5ppp/8/8/8/8/8/K3R3 w - - 0 1",line:["e1e8"]},
];

function addMove(game, uci) {
  return game.move({from:uci.slice(0,2), to:uci.slice(2,4), promotion:uci[4]});
}

function initialFen(puzzle) {
  if (puzzle.fen) return new Chess(puzzle.fen).fen();
  if (!puzzle.pgn) return new Chess().fen();
  const complete = new Chess();
  complete.loadPgn(puzzle.pgn);
  const partial = new Chess();
  for (const move of complete.history().slice(0,puzzle.ply)) partial.move(move);
  return partial.fen();
}

function Exercise({puzzle, csrf, member, onProgress}) {
  const [fen,setFen] = useState(()=>initialFen(puzzle));
  const [moves,setMoves] = useState([]);
  const [from,setFrom] = useState(null);
  const [pending,setPending] = useState(false);
  const [done,setDone] = useState(false);
  const [feedback,setFeedback] = useState("");
  const [promotions,setPromotions] = useState([]);
  const game = new Chess(fen);
  const black = initialFen(puzzle).split(" ")[1] === "b";
  const legal = from ? game.moves({square:from,verbose:true}) : [];
  const board = game.board();
  const name = {k:"Король",q:"Ферзь",r:"Ладья",b:"Слон",n:"Конь",p:"Пешка"};

  async function submit(option) {
    setPromotions([]);
    const uci = option.from+option.to+(option.promotion||"");
    const next = [...moves,uci];
    const offset = moves.length*2;
    setPending(true);
    try {
      let result;
      if (puzzle.day) {
        const body = new URLSearchParams({csrf, day:puzzle.day, moves:next.join(" ")});
        const response = await fetch("/training/solve",{method:"POST",body});
        result = await response.json();
        if (!response.ok) throw new Error(result.error);
      } else {
        result = {correct:uci===puzzle.line[offset],done:offset+2>=puzzle.line.length,reply:puzzle.line[offset+1]};
      }
      if (!result.correct) {
        setFeedback("Попробуйте другой ход.");
        return;
      }
      addMove(game,uci);
      if (result.reply) addMove(game,result.reply);
      setFen(game.fen());
      setFrom(null);
      setMoves(next);
      setDone(result.done);
      if (result.done && result.credited) onProgress(result);
      if (!result.done) setFeedback("Верно! Найдите следующий ход.");
      else if (puzzle.day && !member) setFeedback("Задача решена. Войдите в профиль и повторите решение, чтобы засчитать день.");
      else if (puzzle.day && !result.credited) setFeedback("Задача решена. Это решение уже учитывалось в другой день.");
      else setFeedback(puzzle.day ? "Задача решена. День засчитан!" : "Урок пройден!");
    } catch (error) {
      setFeedback(error.message || "Не удалось проверить ход.");
    } finally {
      setPending(false);
    }
  }

  function select(square,piece) {
    if (pending || done || promotions.length) return;
    const options = legal.filter(move=>move.to===square);
    if (options.some(move=>move.promotion)) setPromotions(options);
    else if (options.length) void submit(options[0]);
    else setFrom(piece?.color===game.turn() && from!==square ? square : null);
  }

  return <div className="stockfish-layout">
    <div className="stockfish-board" aria-label="Доска упражнения">
      {Array.from({length:64},(_,i)=>{
        const row=black ? 7-Math.floor(i/8) : Math.floor(i/8);
        const col=black ? 7-i%8 : i%8;
        const square="abcdefgh"[col]+(8-row);
        const piece=board[row][col];
        return <button key={square} type="button" onClick={()=>select(square,piece)}
          aria-label={piece ? square+", "+name[piece.type] : square} aria-pressed={from===square}
          className={((row+col)%2 ? "dark-square" : "light-square")+(legal.some(move=>move.to===square) ? " legal-square" : "")}>
          {piece && <TrainingPiece type={piece.type} color={piece.color}/>}
          {i%8===0 && <span className="board-rank" aria-hidden="true">{8-row}</span>}
          {i>=56 && <span className="board-file" aria-hidden="true">{"abcdefgh"[col]}</span>}
        </button>;
      })}
    </div>
    <div>
      {puzzle.idea && <p>{puzzle.idea}</p>}
      <p role="status">{feedback || (black ? "Ход чёрных" : "Ход белых")}</p>
      {promotions.length>0 && <div className="promotion">
        {promotions.map(option=><button key={option.promotion} onClick={()=>void submit(option)}>{name[option.promotion]}</button>)}
        <button onClick={()=>setPromotions([])}>Отмена</button>
      </div>}
      <button type="button" disabled={pending} onClick={()=>{
        setFen(initialFen(puzzle));setMoves([]);setFrom(null);setPromotions([]);setDone(false);setFeedback("");
      }}>Начать заново</button>
    </div>
  </div>;
}

export default function Training({csrf,member}) {
  const [selected,setSelected] = useState("daily");
  const [daily,setDaily] = useState(null);
  const [error,setError] = useState("");
  useEffect(()=>{
    const controller = new AbortController();
    fetch("/training/daily",{signal:controller.signal}).then(async response=>{
      const puzzle = await response.json();
      if (!response.ok) throw new Error(puzzle.error);
      initialFen(puzzle);
      setDaily(puzzle);
    }).catch(err=>{if (!controller.signal.aborted) setError(err.message);});
    return ()=>controller.abort();
  },[]);
  const puzzle = selected==="daily" ? daily : lessons.find(lesson=>lesson.id===selected);
  return <><h1>Шахматный тренажёр</h1>
    <section className="training-catalog">
      <h2>Задача дня и уроки</h2>
      <label>Выберите тренировку<select value={selected} onChange={event=>setSelected(event.target.value)}>
        <option value="daily">Задача дня</option>
        {["Дебюты","Тактика"].map(group=><optgroup key={group} label={group}>
          {lessons.filter(lesson=>lesson.group===group).map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </optgroup>)}
      </select></label>
      <p>Серия: <strong>{daily?.streak??0}</strong> дн. · скидка на стол: <strong>{daily?.discount??0}%</strong></p>
      <small>За каждый день подряд +2 процентных пункта, максимум 15%. Новая задача появляется в 00:00 UTC (03:00 МСК).</small>
      {!member && <p><a href="/profile">Войдите в профиль</a>, чтобы сохранять серию и получать скидку.</p>}
    </section>
    <section>
      <h2>{selected==="daily" ? "Задача дня" : puzzle.title}</h2>
      {selected==="daily" && daily && <p>{daily.solved ? "Сегодня уже решена · " : ""}<a href={"https://lichess.org/training/"+daily.source}>Источник: Lichess</a></p>}
      {puzzle ? <Exercise key={selected} puzzle={puzzle} csrf={csrf} member={member}
        onProgress={stats=>setDaily(current=>({...current,streak:stats.streak,discount:stats.discount,solved:stats.solved}))}/> :
        <p role="status">{error || "Загружаем задачу дня…"}</p>}
    </section>
  </>;
}
