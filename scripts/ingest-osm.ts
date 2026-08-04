/* eslint-disable no-console */
//
// Ingest surveillance-tagged nodes (`man_made=surveillance`) from OpenStreetMap
// via the public Overpass API, and bake them to a static GeoJSON in public/ so
// the map can render the layer offline (no runtime API dependency), mirroring
// the EFF atlas build-time ingest pattern.
//
// A worldwide, unbounded query is too large for Overpass's public instance, so
// this queries a single combined request made of small, named bounding boxes
// for a curated list of well-mapped world cities/regions, each capped at a
// modest per-region count. That keeps the request "single, bounded, and
// polite" (Overpass etiquette: one request in flight, an explicit [timeout],
// a descriptive User-Agent) while giving worldwide-ish coverage instead of one
// city.
//
// Verified 2026-08-03 via curl: a single POST with 24 named per-city sets
// (150 cap each) against https://overpass-api.de/api/interpreter returned
// HTTP 200 in ~24s with 3279 elements (809KB JSON).
//
// Discipline (mirrors scripts/ingest-cfpb.mjs in the complaintgraph repo):
//   - AbortSignal.timeout(...) per HTTP request (Node 20's built-in
//     AbortController-backed request timeout).
//   - Retry once per endpoint on failure/timeout before falling through.
//   - A hard total wall-clock budget for the whole ingest so a slow/hanging
//     API can never stall a deploy.
//   - Build the result in memory; only overwrite the committed file on a full
//     success. A failed or partial run keeps the existing public/ file as-is.
//
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/osm-surveillance.geojson");

const REQUEST_TIMEOUT_MS = Number(process.env.SR_OSM_REQUEST_TIMEOUT_MS || 90_000);
const TOTAL_BUDGET_MS = Number(process.env.SR_OSM_TOTAL_BUDGET_MS || 180_000);
const START = Date.now();

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const USER_AGENT =
  "SurveillanceRadar/1.0 (open-data cross-reference; +https://github.com/rishvaiyer/surveillance-radar)";

// Curated, well-mapped cities/regions spanning every populated continent, each
// with a small bounding box (south, west, north, east). This is a sample, not
// a census — OSM `man_made=surveillance` tagging density varies enormously by
// city/community, so absence here reflects mapping coverage, not absence of
// cameras.
const REGIONS: { name: string; bbox: [number, number, number, number] }[] = [
  { name: "Washington DC", bbox: [38.79, -77.12, 38.996, -76.91] },
  { name: "New York City", bbox: [40.49, -74.26, 40.92, -73.68] },
  { name: "Los Angeles", bbox: [33.7, -118.67, 34.34, -118.15] },
  { name: "Chicago", bbox: [41.64, -87.94, 42.02, -87.52] },
  { name: "Toronto", bbox: [43.58, -79.64, 43.85, -79.12] },
  { name: "Mexico City", bbox: [19.2, -99.3, 19.55, -98.95] },
  { name: "São Paulo", bbox: [-23.75, -46.83, -23.35, -46.36] },
  { name: "London", bbox: [51.28, -0.51, 51.7, 0.33] },
  { name: "Paris", bbox: [48.81, 2.22, 48.9, 2.47] },
  { name: "Berlin", bbox: [52.4, 13.09, 52.65, 13.6] },
  { name: "Amsterdam", bbox: [52.28, 4.73, 52.43, 5.02] },
  { name: "Moscow", bbox: [55.55, 37.35, 55.92, 37.85] },
  { name: "Johannesburg", bbox: [-26.35, 27.85, -26.05, 28.15] },
  { name: "Dubai", bbox: [24.95, 55.05, 25.35, 55.55] },
  { name: "Mumbai", bbox: [19.0, 72.75, 19.3, 73.05] },
  { name: "Delhi", bbox: [28.4, 76.85, 28.9, 77.35] },
  { name: "Beijing", bbox: [39.75, 116.2, 40.05, 116.55] },
  { name: "Shanghai", bbox: [31.05, 121.25, 31.35, 121.65] },
  { name: "Hong Kong", bbox: [22.15, 113.83, 22.56, 114.32] },
  { name: "Tokyo", bbox: [35.52, 139.56, 35.82, 139.92] },
  { name: "Seoul", bbox: [37.41, 126.76, 37.7, 127.18] },
  { name: "Singapore", bbox: [1.2, 103.6, 1.47, 104.05] },
  { name: "Bangkok", bbox: [13.6, 100.35, 13.95, 100.7] },
  { name: "Sydney", bbox: [-33.95, 151.1, -33.75, 151.34] },
];

// Cap per region so one dense city (e.g. London) can't crowd out the rest of
// the worldwide sample, and an overall cap so the bundled file stays small.
const PER_REGION_CAP = 150;
const MAX_FEATURES = 3600;

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

function allRegions() {
  return REGIONS;
}

function overpassQuery(): string {
  const lines = ["[out:json][timeout:120];"];
  allRegions().forEach((region, i) => {
    const [south, west, north, east] = region.bbox;
    const set = `.r${i}`;
    lines.push(`node["man_made"="surveillance"](${south},${west},${north},${east})->${set};`);
    lines.push(`${set} out body ${PER_REGION_CAP};`);
  });
  return lines.join("\n");
}

function elementToFeature(el: OverpassElement, regionName: string): Feature | null {
  if (el.type !== "node" || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  return {
    type: "Feature",
    properties: {
      id: `osm-${el.id}`,
      region: regionName,
      // Common surveillance tags — kept compact for the popup.
      surveillanceType: tags["surveillance:type"] ?? tags["surveillance"] ?? "camera",
      operator: tags["operator"] ?? "",
      description: tags["description"] ?? tags["camera:type"] ?? "",
    },
    geometry: { type: "Point", coordinates: [el.lon, el.lat] },
  };
}

// Overpass returns one flat element array for a multi-set query with no
// per-element indication of which named set it came from. We recover that by
// re-checking each element's coordinates against each region's bbox — cheap
// at this scale (a few thousand elements x ~24 regions).
function regionForPoint(lat: number, lon: number): string {
  for (const region of allRegions()) {
    const [south, west, north, east] = region.bbox;
    if (lat >= south && lat <= north && lon >= west && lon <= east) return region.name;
  }
  return "unknown";
}

async function fetchOnce(url: string): Promise<Feature[] | null> {
  const body = `data=${encodeURIComponent(overpassQuery())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };
  const features = (json.elements ?? [])
    .filter((el): el is OverpassElement & { lat: number; lon: number } => el.type === "node" && el.lat != null && el.lon != null)
    .map((el) => elementToFeature(el, regionForPoint(el.lat, el.lon)))
    .filter((f): f is Feature => f != null)
    .slice(0, MAX_FEATURES);
  return features;
}

// One retry per endpoint (network hiccups are common against the shared
// public Overpass instance); then fall through to the mirror endpoint.
async function tryEndpoint(url: string): Promise<Feature[] | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (Date.now() - START > TOTAL_BUDGET_MS) {
      console.warn("  (time budget reached — stopping Overpass attempts)");
      return null;
    }
    try {
      const features = await fetchOnce(url);
      if (features.length > 0) return features;
      console.warn(`  (${url} returned 0 features on attempt ${attempt})`);
    } catch (err) {
      console.warn(`  (${url} attempt ${attempt} failed: ${(err as Error).message})`);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function tryOverpass(): Promise<Feature[] | null> {
  for (const url of OVERPASS_ENDPOINTS) {
    if (Date.now() - START > TOTAL_BUDGET_MS) break;
    const features = await tryEndpoint(url);
    if (features) return features;
  }
  return null;
}

async function main() {
  const regions = allRegions();
  console.log("\nIngesting OpenStreetMap surveillance nodes (Overpass API)…");
  console.log(`  ${regions.length} curated regions, cap ${PER_REGION_CAP}/region, budget ${TOTAL_BUDGET_MS}ms`);

  const features = await tryOverpass();

  if (!features) {
    if (fs.existsSync(OUT)) {
      console.log(
        "\nOverpass unavailable (network blocked, rate-limited, or budget exceeded)." +
          "\nKeeping the committed file so the build still has data — NOT overwriting:" +
          `\n  ${path.relative(ROOT, OUT)}\n`
      );
      // Validate the committed file still parses before exiting clean.
      JSON.parse(fs.readFileSync(OUT, "utf8"));
      return;
    }
    throw new Error("Overpass unavailable and no committed file present.");
  }

  const fc = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    attribution: "© OpenStreetMap contributors (ODbL) — https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0",
    sourceName: "OpenStreetMap (Overpass API)",
    sourceUrl: "https://overpass-api.de/api/interpreter",
    note: "Sampled from a curated list of world cities/regions; absence reflects mapping coverage, not absence of cameras.",
    regions: regions.map((r) => ({ name: r.name, bbox: r.bbox })),
    features,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log(`\nWrote ${features.length} OSM surveillance nodes across ${regions.length} regions to ${path.relative(ROOT, OUT)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
