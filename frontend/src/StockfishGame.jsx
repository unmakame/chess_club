import React, {useEffect, useRef, useState} from "react";
import {Chess} from "chess.js";
import TrainingPiece from "./TrainingPiece";

const names = {k:"Король",q:"Ферзь",r:"Ладья",b:"Слон",n:"Конь",p:"Пешка"};

function connectEngine() {
  const worker = new Worker("/static/stockfish/stockfish-19-lite-single.js");
  let pending;

  function finish(error, value) {
    if (!pending) return;
    const {resolve,reject,timer} = pending;
    pending = null;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(value);
  }

  worker.onmessage = ({data}) => {
    for (const line of data.split("\n")) {
      if (!pending) break;
      const info = line.match(/\bscore (cp|mate) (-?\d+)/);
      if (info && !/\b(?:upperbound|lowerbound)\b/.test(line)) {
        const score = Number(info[2]);
        pending.score = info[1] === "cp" ? score : Math.sign(score) * 1500;
      }
      if (line.startsWith(pending.end)) {
        finish(null,{move:line.split(" ")[1],score:pending.score});
      }
    }
  };
  worker.onerror = () => finish(new Error("Stockfish не запустился."));

  function command(commands,end) {
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => finish(new Error("Stockfish не ответил вовремя.")),12000);
      pending = {resolve,reject,timer,end};
      for (const line of commands) worker.postMessage(line);
    });
  }

  return {
    async ready() {
      await command(["uci"],"uciok");
      await command(["isready"],"readyok");
    },
    search(fen,skill,search) {
      return command([
        "setoption name Skill Level value " + skill,
        "position fen " + fen,
        "go " + search,
      ],"bestmove ");
    },
    close() {
      worker.terminate();
      finish(new Error("Партия закрыта."));
    },
  };
}

function outcome(game) {
  if (game.isCheckmate()) return game.turn()==="w" ? "Stockfish поставил мат" : "Вы поставили мат";
  if (game.isStalemate()) return "Ничья · пат";
  if (game.isThreefoldRepetition()) return "Ничья · повторение позиции";
  if (game.isInsufficientMaterial()) return "Ничья · недостаточно фигур";
  return "Ничья · правило 50 ходов";
}

function Game({restart}) {
  const board = useRef(new Chess());
  const engine = useRef(null);
  const level = useRef(2);
  const samples = useRef([]);
  const active = useRef(false);
  const busy = useRef(true);
  const [position,setPosition] = useState(() => board.current.board());
  const [history,setHistory] = useState([]);
  const [from,setFrom] = useState(null);
  const [promotion,setPromotion] = useState(null);
  const [skill,setSkill] = useState(2);
  const [thinking,setThinking] = useState(true);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState("");
  const [result,setResult] = useState("");

  useEffect(() => {
    active.current = true;
    const connection = connectEngine();
    engine.current = connection;
    connection.ready().then(() => {
      if (!active.current) return;
      busy.current = false;
      setReady(true);
      setThinking(false);
    }).catch(err => {
      if (!active.current) return;
      setError(err.message);
      setThinking(false);
    });
    return () => {
      active.current = false;
      connection.close();
    };
  },[]);

  function refresh() {
    setPosition(board.current.board());
    setHistory(board.current.history());
  }

  async function play(move) {
    if (busy.current || result || error) return;
    busy.current = true;
    setThinking(true);
    setFrom(null);
    setPromotion(null);
    const game = board.current;
    const fen = game.fen();
    const replyAfter = performance.now() + 900;
    const played = game.move(move);
    refresh();
    const uci = played.from + played.to + (played.promotion || "");
    try {
      const best = await engine.current.search(fen,20,"depth 10");
      if (!active.current) return;
      let loss = 0;
      if (best.move !== uci) {
        const choice = await engine.current.search(fen,20,"depth 10 searchmoves " + uci);
        if (!active.current) return;
        loss = best.score == null || choice.score == null ? null : Math.max(0,best.score-choice.score);
      }
      if (loss !== null) samples.current.push(Math.min(loss,500));

      const escalation = loss !== null && (loss <= 35 || loss >= 140) ? 2 : 1;
      level.current = Math.min(20,level.current+escalation);
      setSkill(level.current);
      if (game.isGameOver()) {
        setResult(outcome(game));
        return;
      }
      const reply = await engine.current.search(game.fen(),level.current,"depth " + (5+Math.floor(level.current/2)));
      if (!active.current) return;
      const delay = replyAfter - performance.now();
      if (delay > 0) await new Promise(resolve => setTimeout(resolve,delay));
      if (!active.current) return;
      game.move({from:reply.move.slice(0,2),to:reply.move.slice(2,4),promotion:reply.move[4]});
      refresh();
      if (game.isGameOver()) setResult(outcome(game));
      busy.current = false;
    } catch {
      if (active.current) setError("Движок не смог закончить расчёт. Начните новую партию.");
    } finally {
      if (active.current) setThinking(false);
    }
  }

  const game = board.current;
  const legal = from ? game.moves({square:from,verbose:true}) : [];

  function pick(square,piece) {
    if (!ready || busy.current || result || error || promotion) return;
    const options = legal.filter(move => move.to===square);
    if (options.some(move => move.promotion)) setPromotion(options);
    else if (options.length) void play(options[0]);
    else setFrom(piece?.color==="w" && from!==square ? square : null);
  }

  const count = samples.current.length;
  const loss = count ? samples.current.reduce((sum,value)=>sum+value,0)/count : null;
  const estimate = loss===null ? null :
    Math.round((1400*8 + Math.max(400,2400-17*loss)*count) / (count+8) / 50) * 50;
  const status = error || result || (thinking ? (ready ? "Stockfish анализирует ход…" : "Stockfish загружается…") : game.isCheck() ? "Вам шах. Ваш ход." : "Ваш ход белыми");
  return <div className="stockfish-layout">
    <div className="stockfish-board" aria-label="Шахматная доска">
      {position.flatMap((row,r)=>row.map((piece,c)=>{
        const square = "abcdefgh"[c]+(8-r);
        return <button type="button" key={square} onClick={()=>pick(square,piece)}
          aria-label={square+(piece ? ", "+names[piece.type]+(piece.color==="w" ? ", белые" : ", чёрные") : "")}
          aria-pressed={from===square}
          className={((r+c)%2 ? "dark-square" : "light-square")+(legal.some(move=>move.to===square) ? " legal-square" : "")}>
          {piece && <TrainingPiece type={piece.type} color={piece.color}/>}
          {c===0 && <span className="board-rank" aria-hidden="true">{8-r}</span>}
          {r===7 && <span className="board-file" aria-hidden="true">{"abcdefgh"[c]}</span>}
        </button>;
      }))}
    </div>
    <section className="stockfish-panel">
      <p role="status">{status}</p>
      <p>Сложность Stockfish <strong>{skill}/20</strong></p>
      {promotion && <div className="promotion"><p>Выберите фигуру для превращения</p>
        {promotion.map(move=><button type="button" key={move.promotion} onClick={()=>void play(move)}>{names[move.promotion]}</button>)}
        <button type="button" onClick={()=>setPromotion(null)}>Отмена</button>
      </div>}
      {result && <div className="game-rating">
        <h2>Оценка игры</h2>
        {estimate===null ? <p>Для оценки нужен хотя бы один проанализированный ход.</p> :
          <><p><strong>≈ {estimate}</strong> · ходов в анализе: {count}</p>
          <small>Условная оценка по потере преимущества. {count<10 ? "На короткой партии особенно неточна. " : ""}Рейтинг клуба не меняется.</small></>}
      </div>}
      <div className="stockfish-actions">
        <button type="button" onClick={restart}>Новая партия</button>
        {!result && ready && !error && <button type="button" disabled={thinking} onClick={()=>setResult("Вы сдались")}>Сдаться</button>}
      </div>
      {history.length>0 && <details><summary>Ходы партии</summary>
        <ol>{history.filter((_,i)=>i%2===0).map((move,i)=><li key={i}>{move} {history[i*2+1]}</li>)}</ol>
      </details>}
    </section>
  </div>;
}

export default function StockfishGame() {
  const [round,setRound] = useState(0);
  return <>
    <h1>Сыграть со Stockfish</h1>
    <p>Выберите фигуру и клетку назначения. Бот постепенно усиливается и старается использовать серьёзные ошибки.</p>
    <Game key={round} restart={()=>setRound(round+1)}/>
    <p><small>Движок Stockfish 19 · <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">исходный код</a> · <a href="/static/stockfish/COPYING.txt">GPLv3</a></small></p>
  </>;
}
