import React, {useEffect, useRef} from "react";

export default function ChessPointer() {
  const queen = useRef(null);

  useEffect(() => {
    const piece = queen.current;
    const motion = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let x, y, targetX, targetY, frame = 0, last = 0;

    function hide() {
      cancelAnimationFrame(frame);
      frame = 0;
      piece.hidden = true;
    }

    function follow(time) {
      const blend = 1 - Math.exp(-Math.min(time - last, 64) / 115);
      last = time;
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      piece.style.transform = `translate3d(${x}px,${y}px,0)`;
      frame = Math.hypot(targetX - x, targetY - y) > 0.35 ? requestAnimationFrame(follow) : 0;
    }

    function move(event) {
      if (!motion.matches || event.pointerType !== "mouse" ||
          event.target.closest("input, textarea, select, [contenteditable=true]")) {
        hide();
        return;
      }
      targetX = event.clientX + (event.clientX > innerWidth - 48 ? -28 : 19);
      targetY = event.clientY + (event.clientY > innerHeight - 54 ? -32 : 23);
      if (piece.hidden) {
        x = targetX;
        y = targetY;
        piece.style.transform = `translate3d(${x}px,${y}px,0)`;
        piece.hidden = false;
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(follow);
      }
    }

    document.addEventListener("pointermove", move, {passive:true});
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    motion.addEventListener("change", hide);
    return () => {
      hide();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      motion.removeEventListener("change", hide);
    };
  }, []);

  return <img ref={queen} hidden className="queen-follower" src="/static/queen-cursor.svg" alt="" aria-hidden="true"/>;
}
