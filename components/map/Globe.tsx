"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { THEME, techColor, techColorMatchExpression } from "../../lib/atlas/theme";
import type { MapRecord } from "../../lib/atlas/schema";
import type { ClickedCountry } from "../../lib/geo/countryLookup";

// Dark globe style. Land outlines come from a bundled GeoJSON — fully self-contained,
// no tile server, no API keys.
function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sources: {
      // BASE prefix supports serving under a subpath (e.g. GitHub Pages).
      land: { type: "geojson", data: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/world.geojson` },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": THEME.water } },
      {
        id: "land",
        type: "fill",
        source: "land",
        paint: { "fill-color": THEME.earth },
      },
      {
        id: "land-edge",
        type: "line",
        source: "land",
        paint: { "line-color": THEME.earthEdge, "line-width": 0.6, "line-opacity": 0.9 },
      },
    ],
  };
}

function toFeatureCollection(records: MapRecord[]) {
  return {
    type: "FeatureCollection" as const,
    features: records.map((r) => ({
      type: "Feature" as const,
      properties: { id: r.id, technology: r.technology ?? "", agency: r.agencyName ?? "" },
      geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] },
    })),
  };
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TECH_COLOR = techColorMatchExpression() as any;
const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Globe({
  records,
  onSelect,
  showOsm,
  showWikidata,
  onCountryClick,
}: {
  records: MapRecord[];
  onSelect: (records: MapRecord[]) => void;
  showOsm: boolean;
  showWikidata: boolean;
  onCountryClick: (country: ClickedCountry) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const recordsRef = useRef<MapRecord[]>(records);
  const spinRef = useRef(true);
  const [spinning, setSpinning] = useState(true);
  const [ready, setReady] = useState(false);

  recordsRef.current = records;

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [-98, 39],
      zoom: 1.6,
      attributionControl: false,
      maxPitch: 0,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      // Soft blue atmosphere halo around the globe.
      try {
        map.setSky({
          "sky-color": THEME.atmosphere,
          "horizon-color": "#0b2036",
          "fog-color": THEME.space,
          "sky-horizon-blend": 0.5,
          "horizon-fog-blend": 0.5,
          "fog-ground-blend": 0.1,
          "atmosphere-blend": 0.85,
        } as any);
      } catch {
        // setSky unsupported on this version — globe still renders fine.
      }

      map.addSource("records", {
        type: "geojson",
        data: toFeatureCollection(recordsRef.current),
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 8,
      });

      // Cluster glow halo + core (aggregate view stays signature cyan).
      map.addLayer({
        id: "cluster-glow",
        type: "circle",
        source: "records",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": THEME.cluster,
          "circle-blur": 1,
          "circle-opacity": 0.35,
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 26, 50, 36],
        },
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "records",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": THEME.cluster,
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 12, 10, 18, 50, 26],
          "circle-stroke-color": THEME.pointBright,
          "circle-stroke-width": 1,
        },
      });
      // Expanding radar "ping" rings emanating from each unclustered point.
      // Two hollow-ring layers, phase-offset, animated in the rAF loop below.
      for (const id of ["point-ping-b", "point-ping-a"]) {
        map.addLayer({
          id,
          type: "circle",
          source: "records",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": 4,
            "circle-stroke-color": TECH_COLOR,
            "circle-stroke-width": 1.5,
            "circle-stroke-opacity": 0,
          },
        });
      }

      // Unclustered point: soft halo + bright core, colored by technology.
      map.addLayer({
        id: "point-glow",
        type: "circle",
        source: "records",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": TECH_COLOR,
          "circle-blur": 1,
          "circle-opacity": 0.45,
          "circle-radius": 11,
        },
      });
      map.addLayer({
        id: "point-core",
        type: "circle",
        source: "records",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": TECH_COLOR,
          "circle-radius": 4,
          "circle-stroke-color": "#eafcff",
          "circle-stroke-width": 1.2,
        },
      });

      // --- Additional open-data layers (toggleable, distinct styling) ---
      // OpenStreetMap surveillance / CCTV nodes — © OpenStreetMap contributors (ODbL).
      map.addSource("osm", { type: "geojson", data: `${BASE}/osm-surveillance.geojson` });
      map.addLayer({
        id: "osm-glow",
        type: "circle",
        source: "osm",
        layout: { visibility: "none" },
        paint: {
          "circle-color": THEME.osm,
          "circle-blur": 1,
          "circle-opacity": 0.5,
          "circle-radius": 9,
        },
      });
      map.addLayer({
        id: "osm-core",
        type: "circle",
        source: "osm",
        layout: { visibility: "none" },
        paint: {
          "circle-color": THEME.osmBright,
          "circle-radius": 3.5,
          "circle-stroke-color": THEME.osm,
          "circle-stroke-width": 1.5,
        },
      });

      // Wikidata law-enforcement agencies — Data from Wikidata (CC0).
      map.addSource("wikidata", { type: "geojson", data: `${BASE}/wikidata-agencies.geojson` });
      map.addLayer({
        id: "wikidata-glow",
        type: "circle",
        source: "wikidata",
        layout: { visibility: "none" },
        paint: {
          "circle-color": THEME.wikidata,
          "circle-blur": 1,
          "circle-opacity": 0.45,
          "circle-radius": 11,
        },
      });
      map.addLayer({
        id: "wikidata-core",
        type: "circle",
        source: "wikidata",
        layout: { visibility: "none" },
        paint: {
          "circle-color": THEME.wikidataBright,
          "circle-radius": 4.5,
          "circle-stroke-color": THEME.wikidata,
          "circle-stroke-width": 2,
        },
      });

      wireInteractions(map);
      wireExtraInteractions(map);
      wireCountryInteraction(map);
      setReady(true);
    });

    // Stop the auto-spin as soon as the user grabs the globe.
    const stopSpin = () => setSpinning(false);
    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);
    map.on("wheel", stopSpin);
    map.on("dragstart", stopSpin);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Wire hover + click once layers exist.
  function wireInteractions(map: MLMap) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });

    const interactive = ["clusters", "point-core", "point-glow"];
    for (const layer of interactive) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
    }

    map.on("mousemove", "point-core", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { agency?: string; technology?: string };
      const color = techColor(p.technology);
      popup
        .setLngLat((f.geometry as any).coordinates)
        .setHTML(
          `<div class="sr-popup">
             <div class="sr-popup-title"><span class="sr-chip" style="background:${color};color:${color}"></span>${escapeHtml(
               p.technology || "Surveillance record"
             )}</div>
             <div class="sr-sub">${escapeHtml(p.agency || "")}</div>
           </div>`
        )
        .addTo(map);
    });

    // Click a cluster: zoom in to expand it.
    map.on("click", "clusters", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      if (!f) return;
      const clusterId = f.properties?.cluster_id;
      const src = map.getSource("records") as GeoJSONSource;
      src.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: (f.geometry as any).coordinates, zoom: Math.min(zoom + 0.5, 12) });
      });
    });

    // Click a point: gather all records stacked on that coordinate and open the drawer.
    map.on("click", "point-core", (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (!id) return;
      const clicked = recordsRef.current.find((r) => r.id === id);
      if (!clicked) return;
      const here = recordsRef.current.filter(
        (r) => r.longitude === clicked.longitude && r.latitude === clicked.latitude
      );
      onSelect(here);
      map.easeTo({ center: [clicked.longitude, clicked.latitude], zoom: Math.max(map.getZoom(), 6) });
    });
  }

  // Hover popups for the additional open-data layers (OSM + Wikidata).
  function wireExtraInteractions(map: MLMap) {
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });

    const showPopup = (e: any, html: string) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat((f.geometry as any).coordinates).setHTML(html).addTo(map);
    };
    const hide = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };

    map.on("mousemove", "osm-core", (e) => {
      const p = e.features?.[0]?.properties as { surveillanceType?: string; operator?: string; description?: string };
      showPopup(
        e,
        `<div class="sr-popup">
           <div class="sr-popup-title"><span class="sr-chip" style="background:${THEME.osm};color:${THEME.osm}"></span>OSM · ${escapeHtml(
             p.surveillanceType || "surveillance"
           )}</div>
           <div class="sr-sub">${escapeHtml(p.operator || p.description || "OpenStreetMap node")}</div>
           <div class="sr-attr">© OpenStreetMap contributors (ODbL)</div>
         </div>`
      );
    });
    map.on("mouseleave", "osm-core", hide);

    map.on("mousemove", "wikidata-core", (e) => {
      const p = e.features?.[0]?.properties as { name?: string; country?: string };
      showPopup(
        e,
        `<div class="sr-popup">
           <div class="sr-popup-title"><span class="sr-chip" style="background:${THEME.wikidata};color:${THEME.wikidata}"></span>${escapeHtml(
             p.name || "Agency"
           )}</div>
           <div class="sr-sub">${escapeHtml(p.country || "")}</div>
           <div class="sr-attr">Wikidata (CC0)</div>
         </div>`
      );
    });
    map.on("mouseleave", "wikidata-core", hide);
  }

  // Click a country's landmass (the "land" fill layer, from world.geojson) to
  // open the country/region breakdown panel. Data-point clicks take priority:
  // if the click also hit a cluster or a record point, this bails so it
  // doesn't fight with wireInteractions()'s own click handlers on those layers.
  function wireCountryInteraction(map: MLMap) {
    map.on("mouseenter", "land", () => {
      if (map.getCanvas().style.cursor === "") map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "land", () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "land", (e) => {
      const dataHit = map.queryRenderedFeatures(e.point, { layers: ["clusters", "point-core"] });
      if (dataHit.length > 0) return;
      const f = e.features?.[0];
      if (!f || !f.geometry) return;
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const name = (props.ADMIN || props.NAME || props.NAME_EN || "Unknown") as string;
      const iso2 = typeof props.ISO_A2 === "string" ? props.ISO_A2 : null;
      onCountryClick({ name, iso2, geometry: f.geometry as any });
    });
  }

  // Toggle visibility of the additional layers when the props change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const set = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    set("osm-glow", showOsm);
    set("osm-core", showOsm);
    set("wikidata-glow", showWikidata);
    set("wikidata-core", showWikidata);
  }, [showOsm, showWikidata, ready]);

  // Keep the GeoJSON source in sync with filtered records.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("records") as GeoJSONSource | undefined;
    if (src) src.setData(toFeatureCollection(records) as any);
  }, [records, ready]);

  // Auto-spin loop + expanding radar-ping animation.
  useEffect(() => {
    spinRef.current = spinning;
  }, [spinning]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const PING_MS = 2600;
    const tick = (now: number) => {
      const map = mapRef.current;
      if (map) {
        const dt = now - last;
        if (spinRef.current && !map.isMoving()) {
          const c = map.getCenter();
          c.lng = ((c.lng + dt * 0.004 + 180) % 360) - 180; // slow eastward drift
          map.setCenter(c);
        }
        // Expanding radar pings: two phase-offset hollow rings per point.
        if (ready && !REDUCED_MOTION) {
          const setPing = (id: string, phase: number) => {
            if (!map.getLayer(id)) return;
            const p = (((now / PING_MS) % 1) + phase) % 1; // 0..1
            map.setPaintProperty(id, "circle-radius", 4 + p * 24);
            map.setPaintProperty(id, "circle-stroke-opacity", 0.55 * (1 - p));
          };
          setPing("point-ping-a", 0);
          setPing("point-ping-b", 0.5);
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <button
        onClick={() => setSpinning((s) => !s)}
        aria-label={spinning ? "Pause globe rotation" : "Resume globe rotation"}
        className="absolute bottom-20 right-4 z-20 flex items-center gap-1.5 rounded-md border border-edge bg-panel/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ink backdrop-blur transition hover:border-signal hover:text-signal"
      >
        {spinning ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <rect x="1" y="1" width="3" height="8" rx="0.5" />
            <rect x="6" y="1" width="3" height="8" rx="0.5" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <path d="M2 1l7 4-7 4z" />
          </svg>
        )}
        {spinning ? "pause" : "spin"}
      </button>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
