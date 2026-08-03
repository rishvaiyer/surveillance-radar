"use client";

import type { MapRecord } from "../../lib/atlas/schema";
import { techColor, THEME } from "../../lib/atlas/theme";

function locationLine(r: MapRecord): string {
  const county = r.county
    ? /county$/i.test(r.county) ? r.county : `${r.county} County`
    : null;
  return [r.city, county, r.state].filter(Boolean).join(", ");
}

function Metric({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <div>
      <dt className="inline text-muted">{label}: </dt>
      <dd className="inline text-ink">{value.toLocaleString()}</dd>
    </div>
  );
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function ProcurementCheck({ r }: { r: MapRecord }) {
  const searchTerm = r.vendor || r.agencyName;
  if (!searchTerm) return null;

  return (
    <section className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/5 p-3">
      <h4 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-300">
        <span className="h-2 w-2 rounded-full" style={{ background: THEME.procurement }} />
        Federal procurement check
      </h4>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Search USAspending for “{searchTerm}”. An award can document a purchase or funding relationship, but does not prove where or whether equipment is currently deployed.
      </p>
      <a
        className="mt-2 inline-flex min-h-9 items-center rounded-md border border-emerald-300/30 px-3 py-2 text-xs text-emerald-300 hover:border-emerald-200"
        href="https://www.usaspending.gov/search"
        target="_blank"
        rel="noopener noreferrer"
      >
        Search official award data ↗
      </a>
    </section>
  );
}

function RecordBody({ r }: { r: MapRecord }) {
  const color = techColor(r.technology);
  return (
    <div className="border-t border-edge pt-4">
      <h3 className="flex items-center gap-2 font-display text-base font-medium text-ink">
        <span
          aria-hidden
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
        {r.technology ?? "Surveillance record"}
      </h3>
      <dl className="mt-2 space-y-1 text-sm">
        {r.agencyName && (
          <div>
            <dt className="inline text-muted">Agency: </dt>
            <dd className="inline text-ink">{r.agencyName}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-muted">Location: </dt>
          <dd className="inline text-ink">{locationLine(r) || "—"}</dd>
        </div>
        {r.vendor && (
          <div>
            <dt className="inline text-muted">Vendor: </dt>
            <dd className="inline text-ink">{r.vendor}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Evidence sources">
        <span className="rounded-full border border-cyan-300/30 bg-cyan-300/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-cyan-200">
          EFF Atlas
        </span>
        {r.alprEvidence && (
          <span className="rounded-full border border-amber-300/30 bg-amber-300/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-amber-200">
            EFF ALPR report
          </span>
        )}
        {(r.vendor || r.agencyName) && (
          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/5 px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-emerald-200">
            Procurement searchable
          </span>
        )}
      </div>

      {r.description && <p className="mt-3 text-sm leading-relaxed text-ink-2">{r.description}</p>}

      {r.sourceUrls.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Evidence links</div>
          <ul className="mt-1 space-y-1">
            {r.sourceUrls.map((u, i) => (
              <li key={u}>
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-signal underline-offset-2 hover:underline break-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                  </svg>
                  {sourceHost(u)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.alprEvidence && (
        <section className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber-300">
            EFF Data Driven · historical ALPR report
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Agency-reported Vigilant Solutions activity from 2016–2017. Historical evidence, not a claim of current use.
          </p>
          <dl className="mt-2 space-y-1 text-xs">
            <Metric label="Plate detections" value={r.alprEvidence.detectionsTotal} />
            <Metric label="Reported hits" value={r.alprEvidence.hitsTotal} />
            <Metric label="Direct sharing partners" value={r.alprEvidence.directSharing} />
            {r.alprEvidence.nvls && (
              <div>
                <dt className="inline text-muted">NVLS pool: </dt>
                <dd className="inline text-ink">Reported participating</dd>
              </div>
            )}
          </dl>
          <ul className="mt-2 space-y-1">
            {r.alprEvidence.sourceUrls.map((url, index) => (
              <li key={url}>
                <a className="text-xs text-amber-300 hover:underline" href={url} target="_blank" rel="noopener noreferrer">
                  Primary report {index + 1}
                </a>
              </li>
            ))}
          </ul>
          <a
            className="mt-2 inline-block text-xs text-signal hover:underline"
            href="https://www.eff.org/pages/download-alpr-dataset"
            target="_blank"
            rel="noopener noreferrer"
          >
            Dataset and caveats
          </a>
        </section>
      )}

      <ProcurementCheck r={r} />

      {r.geocodeSource && r.geocodeSource !== "csv" && (
        <p className="mt-3 text-[11px] text-faint">
          Plotted at the U.S. Census {r.geocodeSource} representative point. This is not a precise deployment site.
        </p>
      )}
    </div>
  );
}

export default function RecordDrawer({
  records,
  onClose,
}: {
  records: MapRecord[] | null;
  onClose: () => void;
}) {
  if (!records || records.length === 0) return null;
  const technologies = new Set(records.map((record) => record.technology).filter(Boolean));
  const agencies = new Set(records.map((record) => record.agencyName).filter(Boolean));
  const vendors = new Set(records.map((record) => record.vendor).filter(Boolean));
  const evidenceLinks = new Set(records.flatMap((record) => record.sourceUrls));
  const sourceTypes = 1 + Number(records.some((record) => record.alprEvidence));

  return (
    <aside className="absolute right-0 top-0 z-30 flex h-full w-full max-w-sm flex-col border-l border-edge bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between p-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {records.length > 1 ? `${records.length} records here` : "Surveillance record"}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-muted transition hover:text-signal"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <section className="rounded-xl border border-edge bg-space/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
            Area Documentation Profile
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            A summary of published documentation at this mapped area. It is not a safety or surveillance score.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-edge p-2"><dt className="text-faint">Technologies</dt><dd className="mt-0.5 text-lg text-ink">{technologies.size}</dd></div>
            <div className="rounded-lg border border-edge p-2"><dt className="text-faint">Agencies</dt><dd className="mt-0.5 text-lg text-ink">{agencies.size}</dd></div>
            <div className="rounded-lg border border-edge p-2"><dt className="text-faint">Named vendors</dt><dd className="mt-0.5 text-lg text-ink">{vendors.size}</dd></div>
            <div className="rounded-lg border border-edge p-2"><dt className="text-faint">Evidence links</dt><dd className="mt-0.5 text-lg text-ink">{evidenceLinks.size}</dd></div>
          </dl>
          <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
            <span>{sourceTypes} integrated source {sourceTypes === 1 ? "type" : "types"}</span>
            <span>Coverage may be incomplete</span>
          </div>
        </section>
        {records.map((r) => (
          <RecordBody key={r.id} r={r} />
        ))}
      </div>

      <div className="border-t border-edge p-4 text-[11px] text-muted">
        Data from EFF Atlas of Surveillance. Independent visualization; not affiliated with or
        endorsed by EFF.
      </div>
    </aside>
  );
}
