"use client";

import { useEffect, useRef } from "react";

// A lightweight animated starfield rendered on a transparent canvas that sits above
// the globe canvas (screen-friendly light dots) and below the UI panels. Pure canvas,
// no dependencies. Honors prefers-reduced-motion (renders a static field, no twinkle).
export default function Starfield() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let stars: { x: number; y: number; r: number; base: number; tw: number; ph: number }[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;

    const seed = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Density scales with area; capped so it stays cheap on large screens.
      const count = Math.min(340, Math.floor((w * h) / 5200));
      stars = Array.from({ length: count }, (_, i) => {
        // Deterministic-ish spread using index-based jitter (no Math.random dependency
        // for the layout, so it's stable across resizes of the same size).
        const rx = ((i * 2654435761) % 100000) / 100000;
        const ry = ((i * 40503) % 100000) / 100000;
        const rr = ((i * 97) % 1000) / 1000;
        return {
          x: rx * w,
          y: ry * h,
          r: 0.4 + rr * 1.1,
          base: 0.25 + rr * 0.5,
          tw: 0.4 + rr * 1.6, // twinkle speed
          ph: rx * Math.PI * 2, // phase
        };
      });
    };

    let raf = 0;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = reduced ? s.base : s.base * (0.55 + 0.45 * Math.sin(t / 1000 * s.tw + s.ph));
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = "#cfe6ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    seed();
    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      seed();
      if (reduced) draw(0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
}
