"use client";

import { useState } from "react";
import { THEME } from "../../lib/atlas/theme";

// Toggle panel for the additional open-data cross-reference layers. Each row
// shows the layer's distinct marker color and its required attribution so the
// credit is visible wherever the layer can be turned on.
export default function LayerToggles({
  showOsm,
  showWikidata,
  showProcurement,
  onToggleOsm,
  onToggleWikidata,
  onToggleProcurement,
}: {
  showOsm: boolean;
  showWikidata: boolean;
  showProcurement: boolean;
  onToggleOsm: () => void;
  onToggleWikidata: () => void;
  onToggleProcurement: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = Number(showOsm) + Number(showWikidata) + Number(showProcurement);

  return (
    <div className="absolute right-4 top-20 z-20 sm:top-24">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hud-panel relative ml-auto flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 font-mono text-[12px] uppercase tracking-wide text-ink backdrop-blur hover:border-signal hover:text-signal"
      >
        <span className="grid grid-cols-2 gap-0.5" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-signal" />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: THEME.osm }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: THEME.wikidata }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: THEME.procurement }} />
        </span>
        Layers{activeCount > 0 ? ` · ${activeCount}` : ""}
      </button>

      {open && (
        <div className="hud-panel relative mt-2 w-[calc(100vw-2rem)] max-w-64 rounded-xl p-4 backdrop-blur">
          <div className="mb-2 font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Cross-reference layers</div>
          <LayerRow
            on={showOsm}
            onToggle={onToggleOsm}
            color={THEME.osm}
            secondColor={THEME.osmAlpr}
            title="Mapped equipment"
            attribution="OpenStreetMap contributors · ODbL"
            note="Includes worldwide license-plate readers (gold), sampled from OSM."
          />
          <LayerRow
            on={showWikidata}
            onToggle={onToggleWikidata}
            color={THEME.wikidata}
            title="Agency reference"
            attribution="Wikidata · CC0"
          />
          <LayerRow
            on={showProcurement}
            onToggle={onToggleProcurement}
            color={THEME.procurement}
            title="Federal procurement"
            attribution="USAspending.gov · public domain"
            note="Award dollars by state. Purchasing evidence, not confirmed deployment."
          />

          <p className="mt-3 border-t border-edge pt-3 text-[12px] leading-relaxed text-faint">
            Layers are independent cross-references. Community-mapped locations may be incomplete or outdated.
          </p>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  on,
  onToggle,
  color,
  secondColor,
  title,
  attribution,
  note,
}: {
  on: boolean;
  onToggle: () => void;
  color: string;
  // Optional second swatch, for a layer that renders in two colors (the OSM
  // layer splits camera violet from ALPR gold).
  secondColor?: string;
  title: string;
  attribution: string;
  note?: string;
}) {
  return (
    <label className="mt-1 flex cursor-pointer items-start gap-2 py-1 text-xs text-ink-2">
      <input type="checkbox" checked={on} onChange={onToggle} className="mt-0.5 accent-signal" />
      <span className="flex-1">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 7px ${color}` }}
          />
          {secondColor && (
            <span
              aria-hidden
              className="-ml-1 inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: secondColor, boxShadow: `0 0 7px ${secondColor}` }}
            />
          )}
          <span className="text-ink">{title}</span>
        </span>
        <span className="block text-[12px] text-faint">{attribution}</span>
        {note && <span className="mt-0.5 block text-[12px] leading-relaxed text-faint">{note}</span>}
      </span>
    </label>
  );
}
