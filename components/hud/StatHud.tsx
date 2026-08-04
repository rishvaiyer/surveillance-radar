"use client";

import { useEffect, useRef, useState } from "react";
import { TECH_COLORS, TECH_FALLBACK } from "../../lib/atlas/theme";

type TopItem = { label: string; count: number };
type Summary = {
  totalRecords: number;
  uniqueAgencies: number;
  uniqueStates: number;
  topTechnologies?: TopItem[];
};

// Animated count-up for a target number. Eases toward the target whenever it changes
// (e.g. when filters narrow the record set). Reduced-motion → snaps instantly.
function useCountUp(target: number, ms = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);

  return value;
}

function Stat({ value, label }: { value: number; label: string }) {
  const n = useCountUp(value);
  return (
    <div className="text-right leading-none">
      <div className="font-mono text-lg font-medium tabular-nums text-ink">{n.toLocaleString()}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{label}</div>
    </div>
  );
}

export default function StatHud({
  filtered,
  summary,
}: {
  filtered: number;
  summary: Summary;
}) {
  const [open, setOpen] = useState(false);
  const top = (summary.topTechnologies ?? []).slice(0, 6);
  const max = top.reduce((m, t) => Math.max(m, t.count), 1);
  const shown = useCountUp(filtered);

  return (
    <div className="hud-panel relative pointer-events-auto rounded-xl px-4 py-2.5">
      <div className="flex items-stretch gap-4">
        <div className="text-right leading-none">
          <div className="font-mono text-lg font-medium tabular-nums text-signal">
            {shown.toLocaleString()}
            <span className="text-muted">/{summary.totalRecords.toLocaleString()}</span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">signals</div>
        </div>
        <div className="w-px bg-edge" />
        <Stat value={summary.uniqueAgencies} label="agencies" />
        <div className="w-px bg-edge" />
        <Stat value={summary.uniqueStates} label="states" />
        {top.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle technology breakdown"
            className="ml-1 self-center rounded border border-edge px-1.5 py-1 font-mono text-[12px] text-muted hover:border-signal hover:text-signal"
          >
            {open ? "–" : "▤"}
          </button>
        )}
      </div>

      {open && top.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-edge pt-3">
          {top.map((t) => {
            const color = TECH_COLORS[t.label] || TECH_FALLBACK;
            return (
              <div key={t.label} className="flex items-center gap-2">
                <span className="w-28 truncate text-right font-mono text-[12px] text-ink-2" title={t.label}>
                  {t.label}
                </span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-white/5">
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${(t.count / max) * 100}%`,
                      backgroundColor: color,
                      boxShadow: `0 0 8px ${color}`,
                    }}
                  />
                </span>
                <span className="w-5 text-right font-mono text-[12px] tabular-nums text-muted">{t.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
