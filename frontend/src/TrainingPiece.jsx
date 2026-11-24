import React from "react";

export default function TrainingPiece({type,color}) {
  return <img className="training-piece" src={"/static/pieces/neo/"+color+type+".png"}
    alt="" aria-hidden="true" draggable={false}/>;
}
