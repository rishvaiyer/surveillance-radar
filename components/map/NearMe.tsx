"use client";

import { useMemo, useState } from "react";
import type { MapRecord } from "../../lib/atlas/schema";
import { byTechnology, findPlace, nearby } from "../../lib/atlas/near";
import { techColor } from "../../lib/atlas/theme";

export type Place = { lat: number; lon: number; label: string };

// Answers one question: what has been documented around here? Position stays in the browser.
export default function NearMe({
  open,
  onClose,
  records,
  place,
  onPlace,
  radius,
  onRadius,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  records: MapRecord[];
  place: Place | null;
  onPlace: (place: Place) => void;
  radius: number;
  onRadius: (miles: number) => void;
  onPick: (record: MapRecord) => void;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "unknown">("idle");
  const [shown, setShown] = useState(40);

  const found = useMemo(() => (place ? nearby(records, place.lat, place.lon, radius) : []), [records, place, radius]);
  const techs = useMemo(() => byTechnology(found), [found]);
  const agencies = useMemo(() => new Set(found.map((f) => f.record.agencyName)).size, [found]);

  if (!open) return null;

  const locate = () => {
    if (!navigator.geolocation) {
      setStatus("denied");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("idle");
        onPlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "your location" });
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const hit = findPlace(records, text);
    if (hit) {
      setStatus("idle");
      onPlace(hit);
    } else setStatus("unknown");
  };

  return (
    <aside
      aria-label="Documented surveillance near a place"
      className="hud-panel absolute right-4 top-24 z-30 max-h-[calc(100vh-8rem)] w-[24rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-5 scrollbar-thin"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold leading-tight text-ink">What is documented near {place ? place.label : "you"}?</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-2 text-xl leading-none text-muted hover:text-ink">
          ×
        </button>
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="City, ST  (for example Oakland, CA)"
          aria-label="City and state"
          className="min-w-0 flex-1 rounded-lg border border-edge bg-space/70 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-signal focus:outline-none"
        />
        <button type="submit" className="rounded-lg border border-edge px-3 py-2 text-sm font-semibold text-ink hover:border-signal">
          Go
        </button>
      </form>
      <button
        type="button"
        onClick={locate}
        disabled={status === "locating"}
        className="mt-2 w-full rounded-lg bg-signal px-3 py-2 text-sm font-bold text-[#1a0b07] hover:brightness-110 disabled:opacity-60"
      >
        {status === "locating" ? "Finding you…" : "Use my location"}
      </button>
      <p className="mt-2 text-[12px] leading-snug text-muted">
        Your location is used on this page only. Nothing is sent anywhere.
      </p>
      {status === "denied" && (
        <p role="alert" className="mt-2 text-[13px] text-signal">Location was not shared. Type a city above instead.</p>
      )}
      {status === "unknown" && (
        <p role="alert" className="mt-2 text-[13px] text-signal">No documented agency uses that city name. Try a larger nearby city.</p>
      )}

      {place && (
        <>
          <div className="mt-5 flex gap-1 rounded-full border border-edge p-1" role="group" aria-label="Distance">
            {[10, 25, 50].map((miles) => (
              <button
                key={miles}
                type="button"
                aria-pressed={radius === miles}
                onClick={() => {
                  onRadius(miles);
                  setShown(40);
                }}
                className={`flex-1 rounded-full px-3 py-1 text-sm font-semibold ${radius === miles ? "bg-ink text-space" : "text-ink-2 hover:text-ink"}`}
              >
                {miles} miles
              </button>
            ))}
          </div>

          <p className="mt-4 font-display text-3xl font-bold leading-none text-ink" aria-live="polite">
            {found.length.toLocaleString()}
            <span className="ml-2 text-base font-semibold text-muted">
              {found.length === 1 ? "deployment" : "deployments"} · {agencies.toLocaleString()} {agencies === 1 ? "agency" : "agencies"}
            </span>
          </p>

          {found.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">
              Nothing documented within {radius} miles. That does not mean nothing is there: it may only mean nobody has researched it yet.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-1.5">
                {techs.map((t) => (
                  <li key={t.technology} className="flex items-center gap-2 text-sm text-ink-2">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: techColor(t.technology) }} />
                    <span className="flex-1">{t.technology}</span>
                    <span className="font-semibold tabular-nums text-ink">{t.count}</span>
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 text-[13px] font-bold text-muted">Closest first</h3>
              <ul className="mt-2 divide-y divide-edge">
                {found.slice(0, shown).map(({ record, miles }) => (
                  <li key={record.id}>
                    <button type="button" onClick={() => onPick(record)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-white/5">
                      <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full" style={{ background: techColor(record.technology) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{record.agencyName || "Unnamed agency"}</span>
                        <span className="block truncate text-[13px] text-muted">{record.technology}{record.city ? ` · ${record.city}` : ""}</span>
                      </span>
                      <span className="flex-none text-[13px] tabular-nums text-muted">{miles < 1 ? "<1" : Math.round(miles)} mi</span>
                    </button>
                  </li>
                ))}
              </ul>
              {found.length > shown && (
                <button type="button" onClick={() => setShown((n) => n + 60)} className="mt-3 w-full rounded-lg border border-edge px-3 py-2 text-sm text-ink-2 hover:border-signal">
                  Show {Math.min(60, found.length - shown)} more
                </button>
              )}
            </>
          )}
          <p className="mt-5 text-[12px] leading-snug text-muted">
            Places are the agency&apos;s city or county, not a street address. Records placed only on a state are left out.
            Absence of a record does not mean absence of surveillance.
          </p>
        </>
      )}
    </aside>
  );
}
