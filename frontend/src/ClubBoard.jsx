import React from "react";

function point(file, rank) {
  return [246 + file * 30 - rank * 25, 74 + file * 9 + rank * 13];
}

const backRank = "♜♞♝♛♚♝♞♜";
const moves = {
  "5:6": ["move-f3", 0, -1],
  "4:1": ["move-e5", 0, 2],
  "6:6": ["move-g4", 0, -2],
  "3:0": ["move-qh4", 4, 4],
  "4:7": ["falling-king", 0, 0],
};

function Piece({file, rank, symbol, dark, move}) {
  const [x,y] = point(file + .5, rank + .5);
  const [animation, dx=0, dy=0] = move || [];
  return <g className={animation ? "opening-piece " + animation : undefined}
    style={animation ? {"--dx": (dx*30-dy*25)+"px", "--dy": (dx*9+dy*13)+"px", transformOrigin: x+"px "+y+"px"} : undefined}>
    <ellipse cx={x} cy={y} rx="11" ry="3" fill="#321e23" opacity=".32"/>
    <text x={x} y={y+1} textAnchor="middle" className="board-piece"
      fill={dark ? "#4a2632" : "#fff1c7"} stroke={dark ? "#e7c493" : "#77563d"}>{symbol}</text>
  </g>;
}

const scholarsMoves = {
  "4:6": ["scholar-e4",0,-2],
  "4:1": ["scholar-e5",0,2],
  "5:7": ["scholar-bc4",-3,-3],
  "1:0": ["scholar-nc6",1,2],
  "3:7": ["scholar-queen",4,-3],
  "6:0": ["scholar-nf6",-1,2],
  "5:1": ["scholar-capture",0,0],
  "4:0": ["scholar-king",0,0],
};

export default function ClubBoard({scholars=false}) {
  const squares = [];
  for(let rank=0;rank<8;rank++) {
    for(let file=0;file<8;file++) {
      const corners = [point(file,rank),point(file+1,rank),point(file+1,rank+1),point(file,rank+1)];
      squares.push(<polygon key={file+":"+rank} points={corners.join(" ")} fill={(file+rank)%2 ? "#86574c":"#ddbc88"}/>);
    }
  }
  return <svg className={"club-board"+(scholars?" scholars-board":"")} viewBox="0 0 530 285" aria-hidden="true">
    <path d="M46 178 246 74 486 146v10L286 260 46 188z" fill="#3d2329" stroke="#cead7c" strokeWidth="2"/>
    {squares}
    <polygon className={scholars?"scholar-mate-square":"mate-square"} points={[point(4,scholars?0:7),point(5,scholars?0:7),point(5,scholars?1:8),point(4,scholars?1:8)].join(" ")} fill="#be4650"/>
    <path d="M46 178 286 250 486 146" stroke="#edc99a" fill="none" strokeWidth="2"/>
    {[0,1,6,7].flatMap(rank => Array.from({length:8}, (_,file) =>
      <Piece key={file+":"+rank} file={file} rank={rank} dark={rank<2} move={(scholars ? scholarsMoves : moves)[file+":"+rank]}
        symbol={rank===0 || rank===7 ? backRank[file] : "♟"}/>))}
    <polygon className="board-glint" points="246,74 486,146 286,250 46,178" fill={scholars ? "url(#scholars-glint)" : "url(#opening-glint)"}/>
    <defs><linearGradient id={scholars ? "scholars-glint" : "opening-glint"}><stop stopColor="#fff4d2" stopOpacity="0"/><stop offset=".5" stopColor="#fff4d2" stopOpacity=".65"/><stop offset="1" stopColor="#fff4d2" stopOpacity="0"/></linearGradient></defs>
  </svg>;
}
