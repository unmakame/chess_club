import React, {useEffect, useRef} from "react";

const symbols = "♜♞♝♛♚♟";
const spacing = 52;
const radius = 105;

export default function ChessWave() {
  const layer = useRef(null);

  useEffect(() => {
    const canvas = layer.current;
    const hero = canvas.parentElement;
    const context = canvas.getContext("2d");
    if (!context) return;

    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let pointer = null;
    let width = 0;
    let height = 0;
    let pieces = [];
    let lastTime = 0;

    function draw(time) {
      const dt = lastTime ? Math.min(time - lastTime, 40) : 16;
      lastTime = time;
      const seconds = dt / 1000;
      const steer = 1 - Math.exp(-seconds * 4);
      const bounds = pointer && canvas.getBoundingClientRect();
      context.clearRect(0, 0, width, height);
      for (const piece of pieces) {
        if (!motion.matches) {
          const heading = time / 2400 + piece.school * 1.7 + Math.sin(piece.x / 125 - time / 1900) * .65;
          let vx = Math.cos(heading) * piece.speed;
          let vy = Math.sin(heading) * piece.speed * .75;
          if (bounds) {
            const dx = piece.x - (pointer.x - bounds.left);
            const dy = piece.y - (pointer.y - bounds.top);
            const distance = Math.hypot(dx, dy);
            if (distance < radius) {
              const push = 185 * (1 - distance / radius) ** 2;
              vx += distance > .1 ? push * dx / distance : push;
              vy += distance > .1 ? push * dy / distance : 0;
            }
          }
          const margin = 13;
          const edge = 48;
          vx += 95 * (Math.max(0, 1 - piece.x / edge) - Math.max(0, 1 - (width - piece.x) / edge));
          vy += 95 * (Math.max(0, 1 - piece.y / edge) - Math.max(0, 1 - (height - piece.y) / edge));
          piece.vx += (vx - piece.vx) * steer;
          piece.vy += (vy - piece.vy) * steer;
          piece.x = Math.max(margin, Math.min(width - margin, piece.x + piece.vx * seconds));
          piece.y = Math.max(margin, Math.min(height - margin, piece.y + piece.vy * seconds));
        }
        context.globalAlpha = .2;
        context.fillText(piece.symbol, piece.x, piece.y);
      }
    }

    function tick(time) {
      draw(time);
      frame = requestAnimationFrame(tick);
    }

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = '23px "Segoe UI Symbol", "DejaVu Sans", serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#dfebc3";
      pieces = [];
      const columns = Math.floor(width / spacing);
      const rows = Math.floor(height / spacing);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const x = width / 2 + (col - (columns - 1) / 2) * spacing;
          const y = height / 2 + (row - (rows - 1) / 2) * spacing;
          pieces.push({x, y, vx:0, vy:0, school:(Math.floor(col / 3) + Math.floor(row / 2)) % 3, speed:28 + (row * 7 + col * 3) % 15, symbol:symbols[(col + row * 5) % symbols.length]});
        }
      }
      draw(performance.now());
    }

    function start() {
      cancelAnimationFrame(frame);
      pointer = null;
      lastTime = 0;
      if (motion.matches) draw(0);
      else frame = requestAnimationFrame(tick);
    }

    function move(event) {
      if (!motion.matches && event.pointerType !== "touch") {
        pointer = {x:event.clientX, y:event.clientY};
      }
    }

    function clearPointer() {
      pointer = null;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    hero.addEventListener("pointermove", move, {passive:true});
    hero.addEventListener("pointerleave", clearPointer);
    window.addEventListener("blur", clearPointer);
    motion.addEventListener("change", start);
    resize();
    start();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", clearPointer);
      window.removeEventListener("blur", clearPointer);
      motion.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={layer} className="chess-wave" aria-hidden="true"/>;
}
