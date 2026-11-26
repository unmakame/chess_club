import React from "react";

export const themeNames = {
  opening:"Дебюты", fork:"Вилки", pin:"Связки", mate:"Матовые атаки", endgame:"Эндшпиль",
};
export const levels = ["Базовый", "Средний", "Продвинутый"];

export async function saveTraining(path, fields) {
  const response = await fetch("/training/"+path, {method:"POST", body:new URLSearchParams(fields)});
  if (!response.ok) throw new Error("Не удалось сохранить тренировку.");
  return response.json();
}

export function attemptId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2,"0")).join("");
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
}

export function SuggestedLessons({plan, select}) {
  return <ul>{plan.items.map(({id,title,difficulty,probability})=>{
    const label = <>{title} · {levels[difficulty-1]}</>;
    return <li key={id}>{select ? <button type="button" onClick={()=>select(id)}>{label}</button> :
      <a href={"/training?lesson="+encodeURIComponent(id)}>{label}</a>}
      {" "}<small>Шанс решения ≈ {probability}%</small>
    </li>;
  })}</ul>;
}
