"use client";

import { useMemo, type ReactNode } from "react";
import type { MapRecord } from "../lib/atlas/schema";

type NasaEvent = {
  properties?: {
    categoryId?: string;
    title?: string;
    closed?: string | null;
  };
};

type Bar = { label: string; value: number };

export default function PatternsPanel({
  records,
  nasaEvents,
  onClose,
}: {
  records: MapRecord[];
  nasaEvents: NasaEvent[];
  onClose: () => void;
}) {
  const analysis = useMemo(() => buildAnalysis(records, nasaEvents), [records, nasaEvents]);

  return (
    <aside className="hud-panel scrollbar-thin absolute inset-x-4 bottom-20 z-30 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl p-4 backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[min(760px,calc(100vw-2rem))] sm:-translate-x-1/2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Pattern console · evidence view</div>
          <h2 className="mt-1 font-display text-xl text-ink">What the current layers show</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Deterministic summaries of the loaded EFF and NASA snapshots. These describe the data coverage, not causes or hidden relationships.
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md border border-edge px-2 py-1 font-mono text-[11px] uppercase text-muted hover:border-signal hover:text-signal">
          Close
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="EFF records" value={analysis.recordCount.toLocaleString()} />
        <Metric label="States" value={analysis.stateCount.toLocaleString()} />
        <Metric label="NASA events" value={analysis.nasaCount.toLocaleString()} />
        <Metric label="Dated records" value={`${analysis.datedPct}%`} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Chart title="Top technologies" note="Documented EFF records">
          <Bars bars={analysis.technologies} color="#38e1ff" />
        </Chart>
        <Chart title="NASA event categories" note="Current EONET snapshot">
          <Bars bars={analysis.nasaCategories} color="#ff8a3d" />
        </Chart>
        <Chart title="Source-year coverage" note="Earliest dated evidence year">
          <Bars bars={analysis.years} color="#57f2a3" />
        </Chart>
        <section className="rounded-xl border border-edge bg-space/45 p-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Conclusions</div>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-ink-2">
            {analysis.conclusions.map((conclusion) => (
              <li key={conclusion} className="border-l border-signal/40 pl-2">{conclusion}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 border-t border-edge pt-3 text-[11px] leading-relaxed text-faint">
        Method: counts and percentages are computed in the browser from the committed client snapshots. NASA EONET is an independent environmental context layer. Geographic overlap does not imply a relationship.
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-space/45 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</div>
      <div className="mt-1 font-display text-xl tabular-nums text-ink">{value}</div>
    </div>
  );
}

function Chart({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-edge bg-space/45 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{title}</div>
        <div className="text-[11px] text-faint">{note}</div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bars({ bars, color }: { bars: Bar[]; color: string }) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <div className="space-y-2">
      {bars.length === 0 && <div className="text-xs text-faint">No usable observations.</div>}
      {bars.map((bar) => (
        <div key={bar.label} className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 text-[11px]">
          <div>
            <div className="mb-1 flex justify-between gap-2 text-ink-2">
              <span className="truncate" title={bar.label}>{bar.label}</span>
              <span className="tabular-nums text-muted">{bar.value.toLocaleString()}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (bar.value / max) * 100)}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
            </div>
          </div>
          <span className="text-right font-mono text-[10px] text-faint">{Math.round((bar.value / Math.max(1, bars.reduce((sum, item) => sum + item.value, 0))) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function buildAnalysis(records: MapRecord[], nasaEvents: NasaEvent[]) {
  const technologies = count(records.map((record) => record.technology), 6);
  const states = new Set(records.map((record) => record.state).filter(Boolean));
  const dated = records.filter((record) => record.earliestSourceYear != null).length;
  const years = count(records.map((record) => record.earliestSourceYear?.toString() ?? null), 8, false);
  const nasaCategories = count(nasaEvents.map((event) => event.properties?.categoryId ?? null), 7);
  const topTechnology = technologies[0];
  const topCategory = nasaCategories[0];
  const conclusions = [
    `${records.length.toLocaleString()} documented records span ${states.size.toLocaleString()} states in the current EFF snapshot.`,
    topTechnology ? `${topTechnology.label} is the largest documented technology category with ${topTechnology.value.toLocaleString()} records.` : "No technology category is available in the current snapshot.",
    topCategory ? `NASA EONET currently contributes ${nasaEvents.length.toLocaleString()} environmental event points; ${topCategory.label} is the largest category in this snapshot.` : "NASA event categories are unavailable in the current snapshot.",
    "The dashboard reports counts and proximity context only. It does not infer causation, deployment intent, damage, or operational risk.",
  ];
  return {
    recordCount: records.length,
    stateCount: states.size,
    nasaCount: nasaEvents.length,
    datedPct: records.length ? Math.round((dated / records.length) * 100) : 0,
    technologies,
    years,
    nasaCategories,
    conclusions,
  };
}

function count(values: Array<string | null>, limit: number, sortByValue = true): Bar[] {
  const counts = new Map<string, number>();
  values.filter((value): value is string => Boolean(value)).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const bars = [...counts.entries()].map(([label, value]) => ({ label, value }));
  bars.sort((a, b) => sortByValue ? b.value - a.value || a.label.localeCompare(b.label) : a.label.localeCompare(b.label));
  return bars.slice(0, limit);
}
