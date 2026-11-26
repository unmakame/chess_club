import React, {useEffect, useRef, useState} from "react";
import {Chess} from "chess.js";
import TrainingPiece from "./TrainingPiece";

import {attemptId, levels, saveTraining, SuggestedLessons, themeNames} from "./TrainingPlan";

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

function Exercise({puzzle, csrf, member, onProgress, onAttempt}) {
  const [fen,setFen] = useState(()=>initialFen(puzzle));
  const [moves,setMoves] = useState([]);
  const [from,setFrom] = useState(null);
  const [pending,setPending] = useState(false);
  const [done,setDone] = useState(false);
  const [feedback,setFeedback] = useState("");
  const [promotions,setPromotions] = useState([]);
  const [unsaved,setUnsaved] = useState(null);
  const attempt = useRef(null);
  const game = new Chess(fen);
  const black = initialFen(puzzle).split(" ")[1] === "b";
  const legal = from ? game.moves({square:from,verbose:true}) : [];
  const board = game.board();
  const name = {k:"Король",q:"Ферзь",r:"Ладья",b:"Слон",n:"Конь",p:"Пешка"};

  async function record(fields) {
    try {
      onAttempt(await saveTraining("attempt", fields));
      setUnsaved(null);
    } catch {
      setUnsaved(fields);
    }
  }

  function fieldsForAttempt() {
    return {csrf, attempt_id:attempt.current.id, lesson_id:puzzle.id, moves:attempt.current.moves.join(" ")};
  }

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
        if (member) {
          attempt.current ??= {id:attemptId(), moves:[]};
          attempt.current.moves.push(uci);
          if (!result.correct && attempt.current.moves.length-moves.length >= 100) {
            setDone(true);
            setFeedback("Лимит ошибок исчерпан. Начните заново.");
            await record(fieldsForAttempt());
            return;
          }
          if (result.correct && result.done) await record(fieldsForAttempt());
        }
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
      {unsaved && <p role="alert">Попытка ещё не сохранена. <button type="button" disabled={pending} onClick={async()=>{
        setPending(true); await record(unsaved); setPending(false);
      }}>Повторить сохранение</button></p>}
      <button type="button" disabled={pending || Boolean(unsaved)} onClick={async()=>{
        if (member && !puzzle.day && !done && attempt.current?.moves.length) {
          setPending(true);
          await record(fieldsForAttempt());
          setPending(false);
        }
        attempt.current = null;
        setFen(initialFen(puzzle));setMoves([]);setFrom(null);setPromotions([]);setDone(false);setFeedback("");
      }}>Начать заново</button>
    </div>
  </div>;
}

export default function Training({csrf,member,data}) {
  const {lessons} = data;
  const requested = new URLSearchParams(location.search).get("lesson");
  const [selected,setSelected] = useState(lessons.some(lesson=>lesson.id===requested) ? requested : "daily");
  const [level,setLevel] = useState("");
  const [plan,setPlan] = useState(data.plan);
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
      <h2>Что потренировать дальше</h2>
      <p>{plan.mode==="learned" ? "Подбор по вашим попыткам и доступному анализу партий." :
        "Начальный подбор. Модель обучится по мере накопления успешных и неуспешных попыток."}</p>
      <SuggestedLessons plan={plan} select={id=>{setLevel("");setSelected(id);}}/>
    </section>
    <section className="training-catalog">
      <h2>Задача дня и уроки</h2>
      <label>Уровень<select aria-label="Уровень" value={level} onChange={event=>{
        const nextLevel = event.target.value;
        setLevel(nextLevel);
        if (nextLevel && selected!=="daily" && Number(nextLevel)!==puzzle.difficulty) setSelected("daily");
      }}>
        <option value="">Все уровни</option>
        {levels.map((label,index)=><option key={label} value={index+1}>{label}</option>)}
      </select></label>
      <label>Выберите тренировку<select aria-label="Выберите тренировку" value={selected} onChange={event=>setSelected(event.target.value)}>
        <option value="daily">Задача дня</option>
        {Object.entries(themeNames).map(([theme,label])=>{
          const matching = lessons.filter(lesson=>lesson.theme===theme && (!level || lesson.difficulty===Number(level)));
          return matching.length ? <optgroup key={theme} label={label}>
            {matching.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title} · {levels[lesson.difficulty-1]}</option>)}
          </optgroup> : null;
        })}
      </select></label>
      <p>Серия: <strong>{daily?.streak??0}</strong> дн. · скидка на стол: <strong>{daily?.discount??0}%</strong></p>
      <small>За каждый день подряд +2 процентных пункта, максимум 15%. Новая задача появляется в 00:00 UTC (03:00 МСК).</small>
      {!member && <p><a href="/profile">Войдите в профиль</a>, чтобы сохранять попытки, серию и скидку.</p>}
    </section>
    <section>
      <h2>{selected==="daily" ? "Задача дня" : puzzle.title}</h2>
      {selected==="daily" && daily && <p>{daily.solved ? "Сегодня уже решена · " : ""}<a href={"https://lichess.org/training/"+daily.source}>Источник: Lichess</a></p>}
      {puzzle ? <Exercise key={selected} puzzle={puzzle} csrf={csrf} member={member} onAttempt={setPlan}
        onProgress={stats=>setDaily(current=>({...current,streak:stats.streak,discount:stats.discount,solved:stats.solved}))}/> :
        <p role="status">{error || "Загружаем задачу дня…"}</p>}
    </section>
    {plan.history.length>0 && <section><h2>Последние попытки</h2><div className="scroll"><table>
      <thead><tr><th>Упражнение</th><th>Тема</th><th>Уровень</th><th>Результат</th><th>Ошибки</th></tr></thead>
      <tbody>{plan.history.map(({lesson_id,theme,difficulty,solved,errors}, index)=><tr key={index}>
        <td>{lessons.find(lesson=>lesson.id===lesson_id)?.title || lesson_id}</td>
        <td>{themeNames[theme]}</td><td>{levels[difficulty-1]}</td>
        <td>{solved ? "Решено" : "Не завершено"}</td><td>{errors}</td>
      </tr>)}</tbody>
    </table></div></section>}
  </>;
}
