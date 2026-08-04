"use client";

import { useEffect, useMemo, useState } from "react";
import Globe from "./map/Globe";
import Controls from "./map/Controls";
import RecordDrawer from "./map/RecordDrawer";
import Legend from "./map/Legend";
import Starfield from "./map/Starfield";
import StatHud from "./hud/StatHud";
import Footer from "./layout/Footer";
import RecordList from "./map/RecordList";
import AlprNetwork from "./map/AlprNetwork";
import LayerToggles from "./map/LayerToggles";
import TimeSlider from "./map/TimeSlider";
import CountryPanel from "./map/CountryPanel";
import { applyFilters, EMPTY_FILTERS, type Filters } from "../lib/atlas/filters";
import type { MapRecord } from "../lib/atlas/schema";
import type { ClickedCountry } from "../lib/geo/countryLookup";

type Summary = {
  totalRecords: number;
  uniqueAgencies: number;
  uniqueStates: number;
  technologies: string[];
  states: string[];
  topTechnologies?: { label: string; count: number }[];
  generatedAt: string;
  sourceUrl: string;
  methodologyUrl: string;
  licenseUrl: string;
  sourceLastUpdated: string;
};

type AlprRecord = NonNullable<MapRecord["alprEvidence"]> & {
  agencyName: string | null;
  state: string | null;
};

// Minimal shape needed by CountryPanel for the OSM / Wikidata point layers
// (fetched separately here purely for the country breakdown panel; Globe.tsx
// loads these same files itself for rendering, via its own MapLibre sources).
type PointFeature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: [number, number] };
};

export default function MapExperience({
  summary,
}: {
  summary: Summary;
}) {
  const [records, setRecords] = useState<MapRecord[]>([]);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // A single selected record, or a list of co-located records (stacked on one centroid).
  const [selected, setSelected] = useState<MapRecord[] | null>(null);
  const [listView, setListView] = useState(false);
  const [networkView, setNetworkView] = useState(false);
  const [showOsm, setShowOsm] = useState(false);
  const [showWikidata, setShowWikidata] = useState(false);
  // Country/region breakdown panel (opened by clicking a country on the globe).
  const [selectedCountry, setSelectedCountry] = useState<ClickedCountry | null>(null);
  const [osmFeatures, setOsmFeatures] = useState<PointFeature[]>([]);
  const [wikidataFeatures, setWikidataFeatures] = useState<PointFeature[]>([]);

  const filtered = useMemo(() => applyFilters(records, filters), [records, filters]);
  const yearCoverage = useMemo(() => {
    const withYear = records.filter((r) => r.earliestSourceYear != null).length;
    return { withYear, total: records.length };
  }, [records]);

  useEffect(() => {
    let active = true;
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const key = (agency: string | null, state: string | null) =>
      `${agency ?? ""}|${state ?? ""}`.toLowerCase().replace(/[^a-z0-9|]/g, "");

    Promise.all([
      fetch(`${base}/atlas-records.json`).then((response) => {
        if (!response.ok) throw new Error("Records unavailable");
        return response.json() as Promise<MapRecord[]>;
      }),
      fetch(`${base}/eff-data-driven-alpr.json`).then((response) => {
        if (!response.ok) throw new Error("ALPR evidence unavailable");
        return response.json() as Promise<AlprRecord[]>;
      }),
    ])
      .then(([atlasRecords, alprRecords]) => {
        if (!active) return;
        const evidence = new Map(
          alprRecords.map((record) => [key(record.agencyName, record.state), record])
        );
        setRecords(
          atlasRecords.map((record) => ({
            ...record,
            alprEvidence:
              record.technology === "Automated License Plate Readers"
                ? evidence.get(key(record.agencyName, record.state))
                : undefined,
          }))
        );
        setDataState("ready");
      })
      .catch(() => {
        if (active) setDataState("error");
      });

    return () => {
      active = false;
    };
  }, []);

  // Fetched separately (and non-fatally) from the atlas/ALPR load above: these
  // two only feed the country breakdown panel, so a failure here shouldn't
  // block the main map. Globe.tsx loads the same two files itself, directly
  // into MapLibre GeoJSON sources, for rendering the OSM/Wikidata layers.
  useEffect(() => {
    let active = true;
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

    Promise.all([
      fetch(`${base}/osm-surveillance.geojson`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${base}/wikidata-agencies.geojson`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([osm, wikidata]) => {
        if (!active) return;
        if (osm?.features) setOsmFeatures(osm.features);
        if (wikidata?.features) setWikidataFeatures(wikidata.features);
      })
      .catch(() => {
        // Non-fatal: the country panel just reports 0 for these layers.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (records.length === 0) return;
    const id = new URLSearchParams(window.location.search).get("record");
    if (!id) return;
    const record = records.find((item) => item.id === id);
    if (record) setSelected([record]);
  }, [records]);

  const selectRecords = (next: MapRecord[] | null) => {
    if (next) setSelectedCountry(null); // the two side panels are mutually exclusive
    setSelected(next);
    const url = new URL(window.location.href);
    if (next?.length === 1) url.searchParams.set("record", next[0].id);
    else url.searchParams.delete("record");
    window.history.replaceState({}, "", url);
  };

  const handleCountryClick = (country: ClickedCountry) => {
    selectRecords(null); // close the record drawer (and its ?record= param) first
    setSelectedCountry(country);
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-space">
      {/* The globe (base layer) */}
      <Globe
        records={filtered}
        onSelect={selectRecords}
        showOsm={showOsm}
        showWikidata={showWikidata}
        onCountryClick={handleCountryClick}
      />

      {/* Atmospheric overlays: stars, rotating radar sweep, scope vignette (above the
          globe, below the UI panels). */}
      <Starfield />
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        <div className="radar-sweep animate-radar-sweep" />
      </div>
      <div className="scope-vignette z-10" />
      {networkView && (
        <AlprNetwork
          records={filtered.filter((record) => Boolean(record.alprEvidence))}
          onSelect={(record) => selectRecords([record])}
        />
      )}

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4">
        <div className="pointer-events-auto">
          <div className="flex items-baseline gap-3">
            <span className="flex items-center gap-2 font-display text-lg font-medium tracking-tight text-signal">
            <span className="relative inline-flex h-4 w-4 items-center justify-center">
              <span className="absolute inset-0 rounded-full border border-signal/50" />
              <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_8px_#38e1ff]" />
            </span>
              Surveillance Radar
            </span>
            <span className="hidden font-mono text-[11px] text-muted lg:inline">
              Documented law-enforcement surveillance · EFF Atlas of Surveillance
            </span>
          </div>
          <a href="/" className="mt-1 inline-block font-mono text-[10px] text-muted hover:text-signal hover:underline">
            Built by unevil-warden · Rishva Iyer · Back to portfolio
          </a>
        </div>
        <div className="hidden sm:block">
          <StatHud filtered={filtered.length} summary={summary} />
        </div>
      </header>

      {dataState !== "ready" && (
        <div
          role={dataState === "error" ? "alert" : "status"}
          className="hud-panel pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-lg px-4 py-2 font-mono text-[11px] text-signal backdrop-blur"
        >
          {dataState === "loading" ? "Loading documented signals…" : "Signal data could not load. Refresh to retry."}
        </div>
      )}

      {/* Floating controls */}
      <Controls
        filters={filters}
        onChange={setFilters}
        states={summary.states}
        technologies={summary.technologies}
        resultCount={filtered.length}
        listView={listView}
        onToggleList={() => {
          setListView((value) => !value);
          setNetworkView(false);
        }}
        networkView={networkView}
        onToggleNetwork={() => {
          setNetworkView((value) => !value);
          setListView(false);
        }}
      />

      <LayerToggles
        showOsm={showOsm}
        showWikidata={showWikidata}
        onToggleOsm={() => setShowOsm((value) => !value)}
        onToggleWikidata={() => setShowWikidata((value) => !value)}
      />

      {listView && <RecordList records={filtered} onSelect={(record) => selectRecords([record])} />}

      {/* Time slider: filters the atlas layer to records known by a given year.
          Hidden in the list/network views, which have their own bottom-anchored
          panels that would collide with it on narrow screens. */}
      {!listView && !networkView && (
        <TimeSlider
          value={filters.year}
          onChange={(year) => setFilters((f) => ({ ...f, year }))}
          recordsWithYear={yearCoverage.withYear}
          totalRecords={yearCoverage.total}
        />
      )}

      {/* Technology color key (doubles as a quick filter) */}
      <div className="hidden md:block">
        <Legend
          technologies={summary.technologies}
          active={filters.technology}
          onPick={(tech) => setFilters((f) => ({ ...f, technology: tech }))}
        />
      </div>

      {/* Detail drawer */}
      <RecordDrawer records={selected} onClose={() => selectRecords(null)} />

      {/* Country/region breakdown panel (mutually exclusive with the record drawer above) */}
      <CountryPanel
        country={selectedCountry}
        onClose={() => setSelectedCountry(null)}
        atlasRecords={records}
        osmFeatures={osmFeatures}
        wikidataFeatures={wikidataFeatures}
        onSelectState={(state) => setFilters((f) => ({ ...f, state }))}
      />

      <Footer summary={summary} />

    </main>
  );
}
