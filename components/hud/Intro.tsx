"use client";

import { useEffect, useState } from "react";

const KEY = "sr-intro-v1";

// First visit only. Says what the map is, how much is on it, and how to read a missing dot.
export default function Intro({
  records,
  agencies,
  onNearMe,
}: {
  records: number;
  agencies: number;
  onNearMe: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: it will simply show again */
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-space/70 p-4 backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onClick={(e) => e.stopPropagation()}
        className="hud-panel w-full max-w-[34rem] p-7"
      >
        <h2 id="intro-title" className="font-display text-[28px] font-bold leading-[1.1] tracking-tight text-ink">
          {records.toLocaleString()} documented police surveillance deployments, across {agencies.toLocaleString()} U.S. agencies.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
          License plate readers, face recognition, drones, gunshot detection and more. Each dot is a place an agency has been
          documented using one of them, and every record links to the evidence.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          A missing dot does not mean there is no surveillance. It means nobody has documented it yet.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              close();
              onNearMe();
            }}
            className="rounded-full bg-signal px-5 py-2.5 text-[15px] font-bold text-[#1a0b07] hover:brightness-110"
          >
            What is near me?
          </button>
          <button type="button" onClick={close} className="rounded-full border border-edge px-5 py-2.5 text-[15px] font-semibold text-ink hover:border-ink">
            Explore the map
          </button>
        </div>
      </div>
    </div>
  );
}
