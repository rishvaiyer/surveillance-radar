"use client";

import { useState } from "react";
import { TECH_COLORS, TECH_FALLBACK } from "../../lib/atlas/theme";

// Color key for the per-technology point coloring. Collapsible so it stays out of
// the way on small screens. Only lists technologies actually present in the data.
export default function Legend({
  technologies,
  active,
  onPick,
}: {
  technologies: string[];
  active: string | null;
  onPick: (tech: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="hud-panel pointer-events-auto absolute bottom-16 left-4 z-20 w-56 rounded-xl p-3 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted hover:text-signal"
      >
        <span>Technology</span>
        <span aria-hidden>{open ? "–" : "+"}</span>
      </button>

      {open && (
        <ul className="mt-2 max-h-[52vh] space-y-0.5 overflow-y-auto scrollbar-thin pr-1">
          {technologies.map((t) => {
            const color = TECH_COLORS[t] || TECH_FALLBACK;
            const isActive = active === t;
            return (
              <li key={t}>
                <button
                  onClick={() => onPick(isActive ? null : t)}
                  className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition ${
                    isActive ? "bg-signal/10 text-ink" : "text-ink-2 hover:bg-white/5"
                  } ${active && !isActive ? "opacity-45" : ""}`}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 7px ${color}` }}
                  />
                  <span className="truncate">{t}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
