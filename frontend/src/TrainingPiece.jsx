import React from "react";

const silhouettes = {
  k: "M24 6v12m-5-7h10M24 20c-4-7-15-5-13 4 1 4 4 6 6 9h14c2-3 5-5 6-9 2-9-9-11-13-4Z",
  q: "m11 16 7 7 6-12 6 12 7-7-5 17H16Z",
  r: "M12 10h7v6h3v-6h4v6h3v-6h7v12l-6 4 2 7H16l2-7-6-4Z",
  b: "M24 8c2 5 10 10 10 17 0 4-2 6-4 8H18c-2-2-4-4-4-8 0-7 8-12 10-17Z",
  n: "M15 33c-1-7 5-12 11-17l-8 4-7-2 3-6 8-6 2 5c10 2 15 11 9 22Z",
  p: "M24 11a7 7 0 0 1 5 12c0 4 2 7 4 10H15c2-3 4-6 4-10a7 7 0 0 1 5-12Z",
};

export default function TrainingPiece({type,color}) {
  return <svg className={"training-piece "+(color==="w"?"ivory-piece":"walnut-piece")}
    viewBox="0 0 48 48" aria-hidden="true">
    <g className="piece-body">
      <path d={silhouettes[type]}/>
      <path d="M16 33h16l5 5v4H11v-4Z"/>
      {type==="q" && <><circle cx="11" cy="15" r="2"/><circle cx="24" cy="10" r="2"/><circle cx="37" cy="15" r="2"/></>}
    </g>
    <path className="piece-detail" d="M15 38h18"/>
    {type==="b" && <path className="piece-detail" d="m22 24 6-8"/>}
    {type==="n" && <circle className="piece-eye" cx="19" cy="13" r="1.3"/>}
  </svg>;
}
