"use client";

import { useState } from "react";

type SourceSummary = {
  generatedAt: string;
  sourceUrl: string;
  methodologyUrl: string;
  licenseUrl: string;
  sourceLastUpdated: string;
};

export default function Footer({ summary }: { summary: SourceSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <footer className="pointer-events-none absolute bottom-2 left-2 z-20 md:bottom-4 md:left-1/2 md:-translate-x-1/2">
      <div className="hud-panel relative pointer-events-auto rounded-lg px-3 py-2 text-[10px] text-muted backdrop-blur">
        <button onClick={() => setOpen((value) => !value)} className="font-mono text-signal hover:underline">
          {open ? "Close sources" : "Sources & methodology"}
        </button>
        {open && (
          <div className="absolute bottom-10 left-0 w-[calc(100vw-1rem)] max-w-md rounded-xl border border-edge bg-panel/95 p-4 text-xs leading-relaxed shadow-xl">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <a className="text-signal hover:underline" href={summary.sourceUrl} target="_blank" rel="noreferrer">EFF Atlas</a>
              <a className="text-signal hover:underline" href="https://www.eff.org/pages/download-alpr-dataset" target="_blank" rel="noreferrer">EFF ALPR data</a>
              <a className="text-signal hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
              <a className="text-signal hover:underline" href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noreferrer">Wikidata</a>
              <a className="text-signal hover:underline" href="https://www.usaspending.gov/" target="_blank" rel="noreferrer">USAspending</a>
              <a className="text-signal hover:underline" href={summary.methodologyUrl} target="_blank" rel="noreferrer">Methodology</a>
              <a className="text-signal hover:underline" href={summary.licenseUrl} target="_blank" rel="noreferrer">License</a>
            </div>
            <p className="mt-3">
              Atlas source updated {summary.sourceLastUpdated}; refreshed {new Date(summary.generatedAt).toLocaleDateString()}.
              Locations use 2025 U.S. Census representative points and are not precise equipment sites.
              Missing markers may reflect incomplete research, not absence of surveillance.
              Procurement searches are research links and do not assert a match or current deployment.
            </p>
          </div>
        )}
      </div>
    </footer>
  );
}
