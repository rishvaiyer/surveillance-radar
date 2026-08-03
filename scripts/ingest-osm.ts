/* eslint-disable no-console */
//
// Ingest a SMALL, bounded sample of surveillance/CCTV nodes from OpenStreetMap
// via the Overpass API, and bake it to a static GeoJSON in public/ so the map
// can render it offline (no runtime API dependency), mirroring the EFF atlas
// build-time ingest pattern.
//
// On any network failure (Overpass is frequently rate-limited / unavailable in
// automated environments), this is NON-FATAL: we keep the committed sample file
// (public/osm-surveillance.geojson) so the build always has data. When run with
// network the script OVERWRITES that file with fresh Overpass results.
//
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/osm-surveillance.geojson");

// A small, bounded area keeps the query cheap and polite. Washington, D.C.
// (south, west, north, east) — a compact, well-mapped region with many
// `man_made=surveillance` nodes to cross-reference against EFF deployments.
const BBOX = { south: 38.79, west: -77.12, north: 38.996, east: -76.91 };

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Cap the result so the bundled file stays tiny.
const MAX_FEATURES = 400;

function overpassQuery(): string {
  const { south, west, north, east } = BBOX;
  const bbox = `${south},${west},${north},${east}`;
  return `
    [out:json][timeout:25];
    (
      node["man_made"="surveillance"](${bbox});
    );
    out body ${MAX_FEATURES};
  `;
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

type Feature = {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: { type: "Point"; coordinates: [number, number] };
};

function elementToFeature(el: OverpassElement): Feature | null {
  if (el.type !== "node" || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  return {
    type: "Feature",
    properties: {
      id: `osm-${el.id}`,
      // Common surveillance tags — kept compact for the popup.
      surveillanceType: tags["surveillance:type"] ?? tags["surveillance"] ?? "camera",
      operator: tags["operator"] ?? "",
      description: tags["description"] ?? tags["camera:type"] ?? "",
    },
    geometry: { type: "Point", coordinates: [el.lon, el.lat] },
  };
}

async function tryOverpass(): Promise<Feature[] | null> {
  const body = `data=${encodeURIComponent(overpassQuery())}`;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const features = (json.elements ?? [])
        .map(elementToFeature)
        .filter((f): f is Feature => f != null)
        .slice(0, MAX_FEATURES);
      if (features.length > 0) return features;
    } catch {
      // try next endpoint / fall back to committed sample
    }
  }
  return null;
}

async function main() {
  console.log("\nIngesting OpenStreetMap surveillance nodes (Overpass API)…");
  console.log(`  bounded region: ${JSON.stringify(BBOX)}`);

  const features = await tryOverpass();

  if (!features) {
    if (fs.existsSync(OUT)) {
      console.log(
        "\nOverpass unavailable (network blocked or rate-limited)." +
          "\nKeeping the committed sample file so the build still has data:" +
          `\n  ${path.relative(ROOT, OUT)}\n`
      );
      // Validate the committed sample parses as JSON before exiting clean.
      JSON.parse(fs.readFileSync(OUT, "utf8"));
      return;
    }
    throw new Error("Overpass unavailable and no committed sample file present.");
  }

  const fc = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    attribution: "© OpenStreetMap contributors (ODbL)",
    bbox: BBOX,
    features,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log(`\nWrote ${features.length} OSM surveillance nodes to ${path.relative(ROOT, OUT)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
