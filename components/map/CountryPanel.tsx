"use client";

import { useMemo } from "react";
import type { MapRecord } from "../../lib/atlas/schema";
import { TECH_COLORS, TECH_FALLBACK } from "../../lib/atlas/theme";
import { pointInGeometry, type ClickedCountry } from "../../lib/geo/countryLookup";

type PointFeature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: [number, number] };
};

function topEntries(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Side panel opened by clicking a country on the globe (see Globe.tsx's "land"
// click handler). EFF Atlas of Surveillance only covers the United States, so
// for the US this breaks the atlas layer down by state (its native grain);
// for every other country the atlas total is honestly reported as zero, and
// the OSM / Wikidata cross-reference layers carry the country-level detail.
export default function CountryPanel({
  country,
  onClose,
  atlasRecords,
  osmFeatures,
  wikidataFeatures,
  onSelectState,
}: {
  country: ClickedCountry | null;
  onClose: () => void;
  atlasRecords: MapRecord[];
  osmFeatures: PointFeature[];
  wikidataFeatures: PointFeature[];
  onSelectState: (state: string) => void;
}) {
  const isUS = country?.iso2 === "US";

  const stats = useMemo(() => {
    if (!country) return null;

    const osmInside = osmFeatures.filter((f) =>
      pointInGeometry(f.geometry.coordinates[0], f.geometry.coordinates[1], country.geometry)
    );
    const wikidataInside = wikidataFeatures.filter((f) =>
      pointInGeometry(f.geometry.coordinates[0], f.geometry.coordinates[1], country.geometry)
    );

    const stateCounts = new Map<string, number>();
    const techCounts = new Map<string, number>();
    const agencyCounts = new Map<string, number>();

    if (isUS) {
      for (const r of atlasRecords) {
        if (r.state) stateCounts.set(r.state, (stateCounts.get(r.state) ?? 0) + 1);
        if (r.technology) techCounts.set(r.technology, (techCounts.get(r.technology) ?? 0) + 1);
        if (r.agencyName) agencyCounts.set(r.agencyName, (agencyCounts.get(r.agencyName) ?? 0) + 1);
      }
    }

    const wikidataNames = [
      ...new Set(wikidataInside.map((f) => (typeof f.properties.name === "string" ? f.properties.name : null)).filter(Boolean)),
    ].sort() as string[];

    return {
      atlasTotal: isUS ? atlasRecords.length : 0,
      osmTotal: osmInside.length,
      wikidataTotal: wikidataInside.length,
      topStates: topEntries(stateCounts, 12),
      totalStates: stateCounts.size,
      topTechnologies: topEntries(techCounts, 8),
      topAgencies: isUS ? topEntries(agencyCounts, 6) : wikidataNames.slice(0, 6).map((n): [string, number] => [n, 0]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, atlasRecords, osmFeatures, wikidataFeatures, isUS]);

  if (!country || !stats) return null;

  const maxState = stats.topStates.reduce((m, [, c]) => Math.max(m, c), 1);
  const maxTech = stats.topTechnologies.reduce((m, [, c]) => Math.max(m, c), 1);

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-full max-w-sm flex-col border-l border-edge bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between p-4">
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Country profile</span>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted transition hover:text-signal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <section className="rounded-xl border border-edge bg-space/40 p-3">
          <h2 className="font-display text-lg text-ink">{country.name}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {isUS
              ? "EFF Atlas of Surveillance is documented at the state level for the United States."
              : "EFF Atlas of Surveillance documents only the United States; totals below cover the cross-reference layers."}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-edge p-2">
              <dt className="text-faint">EFF Atlas</dt>
              <dd className="mt-0.5 text-lg text-ink">{stats.atlasTotal.toLocaleString()}</dd>
            </div>
            <div className="rounded-lg border border-edge p-2">
              <dt className="text-faint">OSM nodes</dt>
              <dd className="mt-0.5 text-lg text-ink">{stats.osmTotal.toLocaleString()}</dd>
            </div>
            <div className="rounded-lg border border-edge p-2">
              <dt className="text-faint">Agencies</dt>
              <dd className="mt-0.5 text-lg text-ink">{stats.wikidataTotal.toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        {isUS && stats.topStates.length > 0 && (
          <section>
            <h3 className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
              Top states ({stats.totalStates} documented)
            </h3>
            <div className="mt-2 space-y-1.5">
              {stats.topStates.map(([state, count]) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => onSelectState(state)}
                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/5"
                  aria-label={`Filter the map to ${state}`}
                >
                  <span className="w-8 flex-none font-mono text-[12px] text-ink-2">{state}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-white/5">
                    <span
                      className="absolute inset-y-0 left-0 rounded-sm bg-signal"
                      style={{ width: `${(count / maxState) * 100}%`, boxShadow: "0 0 8px #38e1ff" }}
                    />
                  </span>
                  <span className="w-10 flex-none text-right font-mono text-[12px] tabular-nums text-muted">{count}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {isUS && stats.topTechnologies.length > 0 && (
          <section>
            <h3 className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Technology breakdown</h3>
            <div className="mt-2 space-y-1.5">
              {stats.topTechnologies.map(([tech, count]) => {
                const color = TECH_COLORS[tech] || TECH_FALLBACK;
                return (
                  <div key={tech} className="flex items-center gap-2">
                    <span className="w-32 truncate text-right font-mono text-[12px] text-ink-2" title={tech}>
                      {tech}
                    </span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-white/5">
                      <span
                        className="absolute inset-y-0 left-0 rounded-sm"
                        style={{ width: `${(count / maxTech) * 100}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                      />
                    </span>
                    <span className="w-10 flex-none text-right font-mono text-[12px] tabular-nums text-muted">{count}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {stats.topAgencies.length > 0 && (
          <section>
            <h3 className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
              {isUS ? "Top agencies (by documented technologies)" : "Agencies referenced (Wikidata)"}
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-ink-2">
              {stats.topAgencies.map(([name, count]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="truncate">{name}</span>
                  {isUS && <span className="flex-none font-mono text-[12px] text-muted">{count}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isUS && stats.wikidataTotal === 0 && stats.osmTotal === 0 && (
          <p className="text-[12px] leading-relaxed text-faint">
            No documented records found for {country.name} in any connected layer. Absence here reflects data coverage,
            not absence of surveillance.
          </p>
        )}

        <section className="rounded-lg border border-edge bg-space/30 p-3 text-[12px] leading-relaxed text-faint">
          <div className="mb-1 font-mono uppercase tracking-[0.14em] text-muted">Sources &amp; licenses</div>
          {isUS && <p>EFF Atlas of Surveillance: CC BY 4.0.</p>}
          <p>OpenStreetMap contributors: ODbL 1.0. © OpenStreetMap contributors.</p>
          <p>Wikidata: CC0 1.0 (public domain dedication).</p>
          <p className="mt-1">
            OSM and Wikidata counts are estimated by testing each point against this country&apos;s mapped boundary, and
            may include small edge-matching errors near borders.
          </p>
        </section>
      </div>
    </aside>
  );
}
