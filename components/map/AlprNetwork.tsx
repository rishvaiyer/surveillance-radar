"use client";

import { useMemo, useState } from "react";
import type { MapRecord } from "../../lib/atlas/schema";

type Node = {
  record: MapRecord;
  x: number;
  y: number;
  radius: number;
  sharing: number;
  nvls: boolean;
};

const WIDTH = 1200;
const HEIGHT = 760;
const CENTER_X = 750;
const CENTER_Y = 450;

export default function AlprNetwork({
  records,
  onSelect,
}: {
  records: MapRecord[];
  onSelect: (record: MapRecord) => void;
}) {
  const [hovered, setHovered] = useState<Node | null>(null);
  const nodes = useMemo(() => {
    const unique = new Map<string, MapRecord>();
    for (const record of records) {
      if (!record.alprEvidence || !record.agencyName) continue;
      unique.set(`${record.agencyName}|${record.state}`, record);
    }
    const items = [...unique.values()].sort((a, b) =>
      `${a.state}|${a.agencyName}`.localeCompare(`${b.state}|${b.agencyName}`),
    );
    return items.map((record, index): Node => {
      const evidence = record.alprEvidence!;
      const sharing = evidence.directSharing ?? 0;
      const angle = (index / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const ring = evidence.nvls ? 215 : 285;
      const stagger = ((index % 5) - 2) * 11;
      return {
        record,
        x: CENTER_X + Math.cos(angle) * (ring + stagger),
        y: CENTER_Y + Math.sin(angle) * (ring + stagger),
        radius: 3.5 + Math.min(9, Math.log10(sharing + 1) * 3),
        sharing,
        nvls: evidence.nvls,
      };
    });
  }, [records]);

  const participating = nodes.filter((node) => node.nvls).length;

  return (
    <section className="absolute inset-0 z-[15] overflow-hidden bg-space/95" aria-label="ALPR sharing landscape">
      <div className="absolute left-4 right-4 top-20 z-10 rounded-xl border border-edge bg-panel/90 p-3 backdrop-blur md:left-[19rem] md:p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-amber-300">EFF Data Driven · 2016–2017</p>
            <h2 className="mt-1 font-display text-lg text-ink md:text-xl">ALPR sharing landscape</h2>
            <p className="mt-1 hidden max-w-2xl text-xs text-muted sm:block">
              Each node is an agency with a primary EFF report. Node size reflects reported direct-sharing partners.
              Lines show verified participation in the shared NVLS pool, not direct agency-to-agency relationships.
            </p>
            <a href="/" className="mt-2 inline-block font-mono text-[12px] text-signal hover:underline">
              Built by Rish Iyer · View portfolio
            </a>
          </div>
          <div className="hidden text-right font-mono text-xs text-ink-2 sm:block">
            <div>{nodes.length.toLocaleString()} sourced agencies</div>
            <div>{participating.toLocaleString()} reported NVLS participants</div>
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="hidden h-full w-full md:block"
        role="img"
        aria-label={`${nodes.length} agencies arranged around the NVLS sharing pool`}
      >
        <defs>
          <radialGradient id="nvlsGlow">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={CENTER_X} cy={CENTER_Y} r="160" fill="url(#nvlsGlow)" />
        <circle cx={CENTER_X} cy={CENTER_Y} r="58" fill="#111a2b" stroke="#fbbf24" strokeWidth="1.5" />
        <text x={CENTER_X} y={CENTER_Y - 5} textAnchor="middle" fill="#fbbf24" fontSize="15" fontWeight="600">NVLS</text>
        <text x={CENTER_X} y={CENTER_Y + 15} textAnchor="middle" fill="#8fa2bd" fontSize="9">shared data pool</text>
        {nodes.filter((node) => node.nvls).map((node) => (
          <line
            key={`edge-${node.record.id}`}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={node.x}
            y2={node.y}
            stroke="#fbbf24"
            strokeOpacity="0.12"
            strokeWidth="0.8"
          />
        ))}
        {nodes.map((node) => (
          <g
            key={node.record.id}
            role="button"
            tabIndex={0}
            aria-label={`${node.record.agencyName}, ${node.record.state}, ${node.sharing || "unknown"} direct-sharing partners`}
            onMouseEnter={() => setHovered(node)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(node)}
            onBlur={() => setHovered(null)}
            onClick={() => onSelect(node.record)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(node.record);
            }}
            className="cursor-pointer outline-none"
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius + 5}
              fill="transparent"
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill={node.nvls ? "#fbbf24" : "#38e1ff"}
              fillOpacity={hovered === node ? 1 : 0.72}
              stroke={hovered === node ? "#ffffff" : "transparent"}
              strokeWidth="1.5"
            />
          </g>
        ))}
      </svg>

      <div className="absolute inset-x-4 bottom-16 top-56 overflow-y-auto md:hidden">
        <div className="space-y-2">
          {[...nodes]
            .sort((a, b) => b.sharing - a.sharing)
            .map((node) => (
              <button
                type="button"
                key={`mobile-${node.record.id}`}
                onClick={() => onSelect(node.record)}
                className="w-full rounded-xl border border-edge bg-panel/90 p-3 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{node.record.agencyName}</div>
                    <div className="mt-1 text-xs text-muted">{node.record.state}</div>
                  </div>
                  <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${node.nvls ? "bg-amber-300" : "bg-signal"}`} />
                </div>
                <div className="mt-2 font-mono text-xs text-amber-300">
                  {node.sharing ? `${node.sharing.toLocaleString()} sharing partners` : "Sharing count unavailable"}
                </div>
                <div className="mt-1 text-[12px] text-muted">
                  {node.nvls ? "Reported NVLS participant" : "No NVLS participation reported"}
                </div>
              </button>
            ))}
        </div>
      </div>

      {hovered && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-lg border border-edge bg-panel/95 p-3 text-xs shadow-xl"
          style={{
            left: `${Math.min(82, Math.max(28, (hovered.x / WIDTH) * 100))}%`,
            top: `${Math.min(78, Math.max(25, (hovered.y / HEIGHT) * 100))}%`,
          }}
        >
          <div className="font-medium text-ink">{hovered.record.agencyName}</div>
          <div className="mt-1 text-muted">{hovered.record.state}</div>
          <div className="mt-2 text-amber-300">
            {hovered.sharing ? `${hovered.sharing.toLocaleString()} reported direct-sharing partners` : "Sharing count not provided"}
          </div>
          <div className="mt-1 text-muted">{hovered.nvls ? "Reported NVLS participant" : "NVLS participation not reported"}</div>
          <div className="mt-2 text-signal">Open evidence →</div>
        </div>
      )}

      <div className="absolute bottom-16 right-5 hidden rounded-lg border border-edge bg-panel/90 p-3 text-[12px] text-muted md:block">
        <div><span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-300" />Reported NVLS participant</div>
        <div className="mt-1"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-signal" />No NVLS participation reported</div>
      </div>
    </section>
  );
}
