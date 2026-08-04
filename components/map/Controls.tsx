"use client";

import { useState } from "react";
import type { Filters } from "../../lib/atlas/filters";

export default function Controls({
  filters,
  onChange,
  states,
  technologies,
  resultCount,
  listView,
  onToggleList,
  networkView,
  onToggleNetwork,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  states: string[];
  technologies: string[];
  resultCount: number;
  listView: boolean;
  onToggleList: () => void;
  networkView: boolean;
  onToggleNetwork: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const label = "mt-3 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted";
  const field =
    "mt-1 w-full rounded-md border border-edge bg-space/70 px-2 py-1.5 text-sm text-ink focus:border-signal focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((value) => !value)}
        className={`hud-panel absolute left-4 z-30 rounded-lg border border-edge px-4 py-2 font-mono text-xs text-signal backdrop-blur sm:hidden ${networkView ? "top-44" : "top-20"}`}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? "Close filters" : `Search & filters · ${resultCount.toLocaleString()}`}
      </button>
      <div className={`hud-panel absolute left-4 z-30 max-h-[calc(100vh-11rem)] w-[calc(100vw-2rem)] max-w-64 overflow-y-auto rounded-xl p-4 backdrop-blur sm:top-24 ${networkView ? "top-56" : "top-32"} ${mobileOpen ? "block" : "hidden sm:block"}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Filter signals</div>
        <button type="button" onClick={() => setMobileOpen(false)} className="text-xs text-muted sm:hidden">Done</button>
      </div>
      <div aria-live="polite" className="mb-2 text-xs text-signal">
        {resultCount.toLocaleString()} documented records
      </div>
      <input
        type="search"
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
        placeholder="Search city, agency, tech…"
        className="w-full rounded-md border border-edge bg-space/70 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-signal focus:outline-none"
      />

      <label className={label}>State</label>
      <select
        value={filters.state ?? ""}
        onChange={(e) => set({ state: e.target.value || null })}
        className={field}
      >
        <option value="">All states</option>
        {states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label className={label}>Technology</label>
      <select
        value={filters.technology ?? ""}
        onChange={(e) => set({ technology: e.target.value || null })}
        className={field}
      >
        <option value="">All technologies</option>
        {technologies.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={filters.sourcesOnly}
          onChange={(e) => set({ sourcesOnly: e.target.checked })}
          className="accent-signal"
        />
        Only records with source links
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={filters.alprEvidenceOnly}
          onChange={(e) => set({ alprEvidenceOnly: e.target.checked })}
          className="accent-signal"
        />
        EFF ALPR reports (2016–2017)
      </label>

      {(filters.query || filters.state || filters.technology || filters.sourcesOnly || filters.alprEvidenceOnly || filters.year != null) && (
        <button
          onClick={() => onChange({ query: "", state: null, technology: null, sourcesOnly: false, alprEvidenceOnly: false, year: null })}
          className="mt-3 font-mono text-[10px] uppercase tracking-wide text-muted underline-offset-2 hover:text-signal hover:underline"
        >
          Clear filters
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          onToggleList();
          setMobileOpen(false);
        }}
        className="mt-3 w-full rounded-md border border-edge px-3 py-2 text-xs text-ink-2 hover:border-signal hover:text-signal"
      >
        {listView ? "Hide accessible list" : "View accessible list"}
      </button>
      <button
        type="button"
        onClick={() => {
          onToggleNetwork();
          setMobileOpen(false);
        }}
        className="mt-2 w-full rounded-md border border-amber-400/30 px-3 py-2 text-xs text-amber-300 hover:border-amber-300"
      >
        {networkView ? "Return to globe" : "Explore ALPR sharing"}
      </button>
      </div>
    </>
  );
}
