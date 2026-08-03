"use client";

import type { MapRecord } from "../../lib/atlas/schema";

export default function RecordList({
  records,
  onSelect,
}: {
  records: MapRecord[];
  onSelect: (record: MapRecord) => void;
}) {
  return (
    <section
      aria-label="Filtered surveillance records"
      className="hud-panel absolute inset-x-4 bottom-16 top-32 z-40 w-auto overflow-y-auto rounded-xl p-3 backdrop-blur md:left-4 md:right-auto md:top-96 md:w-80"
    >
      <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Showing {Math.min(records.length, 250).toLocaleString()} of {records.length.toLocaleString()}
      </h2>
      <ul className="mt-2 space-y-2">
        {records.slice(0, 250).map((record) => (
          <li key={record.id}>
            <button
              type="button"
              onClick={() => onSelect(record)}
              className="w-full rounded-md border border-edge p-2 text-left hover:border-signal"
            >
              <span className="block text-sm text-ink">{record.agencyName || "Unknown agency"}</span>
              <span className="block text-xs text-ink-2">
                {[record.city, record.state, record.technology].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
