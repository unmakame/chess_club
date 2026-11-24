import React, {useEffect, useRef} from "react";

const symbols = "♜♞♝♛♚♟";
const spacing = 35;
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
    let pointerX = 0;
    let pointerY = 0;
    let influence = 0;
    let travel = 0;
    let lastTime = 0;

    function draw(time) {
      const dt = lastTime ? Math.min(time - lastTime, 40) : 16;
      lastTime = time;
      const bounds = pointer && canvas.getBoundingClientRect();
      if (!motion.matches) {
        travel += dt * .032;
        const ease = 1 - Math.exp(-dt / 100);
        if (bounds) {
          pointerX = pointer.x - bounds.left;
          pointerY = pointer.y - bounds.top;
        }
        influence += ((bounds ? 1 : 0) - influence) * ease;
      }
      context.clearRect(0, 0, width, height);
      const span = width + spacing;
      for (const piece of pieces) {
        const x = (piece.x + (motion.matches ? 0 : travel)) % span - spacing / 2;
        const wave = Math.sin(x / 83 + piece.phase) * piece.amplitude;
        const y = piece.y + wave;
        const distance = Math.hypot(x - pointerX, y - pointerY);
        const proximity = Math.max(0, 1 - distance / radius);
        const bend = motion.matches ? 0 : Math.tanh((y - pointerY) / 12) * proximity ** 2 * piece.amplitude * .4 * influence;
        const fade = Math.max(0, Math.min(1, x / 20, (width - x) / 20));
        context.globalAlpha = .28 * fade;
        context.fillStyle = piece.dark ? "#4d382a" : "#f6e8c6";
        context.strokeStyle = piece.dark ? "#eed6a6" : "#6c5237";
        context.strokeText(piece.symbol, x, y + bend);
        context.fillText(piece.symbol, x, y + bend);
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
      context.lineWidth = 1.25;
      context.lineJoin = "round";
      pieces = [];
      const columns = Math.max(1, Math.floor((width + spacing) / spacing));
      const rows = Math.max(1, Math.min(8, Math.floor(height / 43)));
      const laneHeight = height / rows;
      const amplitude = Math.min(20, laneHeight * .14);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          pieces.push({
            x: (col + .5) * (width + spacing) / columns,
            y: (row + .5) * laneHeight,
            phase: row * .65,
            dark: (row + col) % 2 === 1,
            amplitude,
            symbol: symbols[(col + row * 5) % symbols.length],
          });
        }
      }
      draw(performance.now());
    }

    function start() {
      cancelAnimationFrame(frame);
      pointer = null;
      influence = 0;
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
