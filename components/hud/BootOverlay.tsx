"use client";

import { useEffect, useState } from "react";

// A brief "acquiring signals" boot sequence that fades out on first load. Session-gated
// so it doesn't replay on every client navigation, and skipped entirely under
// prefers-reduced-motion.
export default function BootOverlay() {
  const [phase, setPhase] = useState<"hidden" | "show" | "fade">("hidden");

  useEffect(() => {
    const reduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem("sr-booted") === "1";
    } catch {
      // sessionStorage unavailable — just show it once this mount.
    }
    if (reduced || seen) return;

    setPhase("show");
    try {
      sessionStorage.setItem("sr-booted", "1");
    } catch {
      /* ignore */
    }
    const t1 = setTimeout(() => setPhase("fade"), 1150);
    const t2 = setTimeout(() => setPhase("hidden"), 1750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-space transition-opacity duration-500 ${
        phase === "fade" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="w-64 text-center">
        <div className="font-display text-sm uppercase tracking-[0.4em] text-signal">
          Surveillance Radar
        </div>
        <div className="relative mx-auto mt-4 h-10 w-10">
          <span className="absolute inset-0 rounded-full border border-signal/30" />
          <span className="absolute inset-0 overflow-hidden rounded-full">
            <span className="radar-sweep animate-radar-sweep" style={{ animationDuration: "1.4s" }} />
          </span>
        </div>
        <div className="mt-4 h-px w-full overflow-hidden bg-edge">
          <span className="block h-full w-1/3 animate-boot-scan bg-signal/70" />
        </div>
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Acquiring signals…
        </div>
      </div>
    </div>
  );
}
