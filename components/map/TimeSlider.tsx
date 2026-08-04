"use client";

import { useEffect, useState } from "react";

// Earliest year the slider will show: chosen because EFF Atlas evidence-link
// dates are vanishingly sparse before this (see the coverage caption below,
// which is computed live from the loaded records, not hardcoded).
const MIN_YEAR = 2015;
// Milliseconds between steps while "play" is animating adoption over time.
const STEP_MS = 900;

// Time slider filtering the atlas layer to records "known by" a given year
// (earliest dated evidence link <= that year). `value === null` means the
// rightmost "All years" position, which is also the only position where
// undated records are shown (see lib/atlas/filters.ts).
export default function TimeSlider({
  value,
  onChange,
  recordsWithYear,
  totalRecords,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  recordsWithYear: number;
  totalRecords: number;
}) {
  const maxYear = new Date().getFullYear();
  const allIndex = maxYear + 1; // sentinel slider position representing "All years"
  const sliderPos = value == null ? allIndex : Math.min(Math.max(value, MIN_YEAR), allIndex);

  const [playing, setPlaying] = useState(false);

  // Advance one year per tick while playing; stop automatically once "All
  // years" is reached rather than looping forever in the background.
  useEffect(() => {
    if (!playing) return;
    if (value == null) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      if (value >= maxYear) {
        onChange(null);
        setPlaying(false);
      } else {
        onChange(value + 1);
      }
    }, STEP_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, value, maxYear]);

  const coveragePct = totalRecords > 0 ? (recordsWithYear / totalRecords) * 100 : 0;
  const sparse = coveragePct < 40;
  const label = value == null ? "All years" : String(value);

  return (
    <div className="hud-panel pointer-events-auto absolute inset-x-4 bottom-14 z-20 mx-auto max-w-xl rounded-xl p-3 backdrop-blur sm:bottom-16">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!playing && value == null) onChange(MIN_YEAR);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pause adoption playback" : "Play adoption over time"}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-edge text-ink hover:border-signal hover:text-signal"
        >
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
              <rect x="1" y="1" width="3" height="8" rx="0.5" />
              <rect x="6" y="1" width="3" height="8" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
              <path d="M2 1l7 4-7 4z" />
            </svg>
          )}
        </button>

        <div className="flex-1">
          <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
            <span>Known by</span>
            <span className="text-signal">{label}</span>
          </div>
          <input
            type="range"
            min={MIN_YEAR}
            max={allIndex}
            step={1}
            value={sliderPos}
            onChange={(e) => {
              setPlaying(false);
              const n = Number(e.target.value);
              onChange(n >= allIndex ? null : n);
            }}
            aria-label="Filter surveillance records by year first documented"
            className="mt-1 w-full accent-signal"
          />
        </div>
      </div>

      <p className={`mt-2 text-[12px] leading-relaxed ${sparse ? "text-amber-300" : "text-faint"}`}>
        {recordsWithYear.toLocaleString()} of {totalRecords.toLocaleString()} records ({coveragePct.toFixed(1)}%) carry a
        documented year (earliest evidence-link date).{" "}
        {sparse
          ? "Coverage is sparse, so treat year filtering as illustrative, not comprehensive."
          : "Undated records appear only at “All years.”"}
      </p>
    </div>
  );
}
