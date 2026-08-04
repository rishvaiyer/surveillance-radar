/* eslint-disable no-console */
//
// Ingest surveillance-tagged nodes (`man_made=surveillance`) from OpenStreetMap
// via the public Overpass API, and bake them to a static GeoJSON in public/ so
// the map can render the layer offline (no runtime API dependency), mirroring
// the EFF atlas build-time ingest pattern.
//
// TWO SWEEPS, sent as SEPARATE requests:
//
//   A. "camera" — `man_made=surveillance` across a curated list of well-mapped
//      world cities/regions. A worldwide unbounded query for this tag is far
//      too large for Overpass's public instance, so this stays bounded to
//      named bounding boxes with a modest per-region cap.
//
//   B. "alpr" — `man_made=surveillance` + `surveillance:type=ALPR`, worldwide.
//      This is the tagging used by the DeFlock automated-license-plate-reader
//      mapping project, whose data lives in OSM itself. Verified 2026-08-04 via
//      Overpass `out count`: 135,358 such nodes worldwide, 125,485 of them in
//      the continental U.S. (93%).
//
//      135k points is far too many to bake into a committed static file (it
//      would add ~15MB of churn to the repo every weekly CI run) and is not
//      legible on a globe. So sweep B is TILED — a grid of small bounding
//      boxes with a per-tile cap — and then spatially downsampled to
//      MAX_ALPR_FEATURES. Tiling is what makes the sample spatially even:
//      a single capped worldwide query would return Overpass's own internal
//      ordering (roughly node id, i.e. mapping chronology), which would
//      cluster the sample rather than spread it.
//
// The two sweeps are separate requests rather than one combined query for the
// same reason ingest-wikidata.ts splits its two classes: smaller requests are
// markedly more reliable against a shared public endpoint, and one sweep
// failing must not sink the other.
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
//   - PER-SWEEP fallback: if one sweep fails and the other succeeds, the
//     failed sweep's features are carried over from the committed file rather
//     than dropped. A bad network day can never shrink the dataset.
//
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/osm-surveillance.geojson");

const REQUEST_TIMEOUT_MS = Number(process.env.SR_OSM_REQUEST_TIMEOUT_MS || 90_000);
const TOTAL_BUDGET_MS = Number(process.env.SR_OSM_TOTAL_BUDGET_MS || 300_000);
const START = Date.now();

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const USER_AGENT =
  "SurveillanceRadar/1.0 (open-data cross-reference; +https://github.com/rishvaiyer/surveillance-radar)";

type BBox = [number, number, number, number]; // south, west, north, east

// --- Sweep A: curated general-surveillance regions -------------------------
//
// Curated, well-mapped cities/regions spanning every populated continent, each
// with a small bounding box (south, west, north, east). This is a sample, not
// a census — OSM `man_made=surveillance` tagging density varies enormously by
// city/community, so absence here reflects mapping coverage, not absence of
// cameras.
const REGIONS: { name: string; bbox: BBox }[] = [
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

// --- Sweep B: worldwide ALPR tiles -----------------------------------------
//
// A 4x6 grid over the continental U.S. (where 93% of mapped ALPR nodes are),
// plus coarse tiles for the rest of the world. Generated rather than hand-
// listed so the stratification is uniform and easy to retune.
const US_BBOX: BBox = [24.0, -125.0, 49.5, -66.0];
const US_GRID_ROWS = 4;
const US_GRID_COLS = 6;
const US_TILE_CAP = 350;

const WORLD_TILES: BBox[] = [
  [5, -170, 72, -125], // Alaska / W Canada
  [5, -66, 72, -50], // E Canada / Maritimes
  [-56, -82, 13, -34], // South America
  [35, -25, 72, 45], // Europe
  [-35, -20, 35, 52], // Africa
  [12, 45, 45, 75], // Middle East / W Asia
  [5, 60, 40, 92], // South Asia
  [18, 92, 54, 146], // East Asia
  [-48, 92, 20, 180], // SE Asia / Oceania
  [45, 45, 78, 180], // Russia / N Asia
];
const WORLD_TILE_CAP = 300;

const MAX_ALPR_FEATURES = 12_000;

function usTiles(): BBox[] {
  const [south, west, north, east] = US_BBOX;
  const dLat = (north - south) / US_GRID_ROWS;
  const dLon = (east - west) / US_GRID_COLS;
  const tiles: BBox[] = [];
  for (let r = 0; r < US_GRID_ROWS; r++) {
    for (let c = 0; c < US_GRID_COLS; c++) {
      tiles.push([
        Number((south + r * dLat).toFixed(4)),
        Number((west + c * dLon).toFixed(4)),
        Number((south + (r + 1) * dLat).toFixed(4)),
        Number((west + (c + 1) * dLon).toFixed(4)),
      ]);
    }
  }
  return tiles;
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

function allRegions() {
  return REGIONS;
}

// Sweep A query: one named set per curated region.
function regionQuery(): string {
  const lines = ["[out:json][timeout:120];"];
  allRegions().forEach((region, i) => {
    const [south, west, north, east] = region.bbox;
    const set = `.r${i}`;
    lines.push(`node["man_made"="surveillance"](${south},${west},${north},${east})->${set};`);
    lines.push(`${set} out body ${PER_REGION_CAP};`);
  });
  return lines.join("\n");
}

// Sweep B query: one named set per ALPR tile, tag-filtered so the worldwide
// extent stays tractable.
function alprQuery(): string {
  const lines = ["[out:json][timeout:240];"];
  const tiles = [
    ...usTiles().map((bbox) => ({ bbox, cap: US_TILE_CAP })),
    ...WORLD_TILES.map((bbox) => ({ bbox, cap: WORLD_TILE_CAP })),
  ];
  tiles.forEach(({ bbox, cap }, i) => {
    const [south, west, north, east] = bbox;
    const set = `.a${i}`;
    lines.push(
      `node["man_made"="surveillance"]["surveillance:type"="ALPR"](${south},${west},${north},${east})->${set};`
    );
    lines.push(`${set} out body ${cap};`);
  });
  return lines.join("\n");
}

function elementToFeature(el: OverpassElement, regionName: string, category: string): Feature | null {
  if (el.type !== "node" || el.lat == null || el.lon == null) return null;
  const tags = el.tags ?? {};
  return {
    type: "Feature",
    properties: {
      id: `osm-${el.id}`,
      category,
      region: regionName,
      // Common surveillance tags — kept compact for the popup.
      surveillanceType: tags["surveillance:type"] ?? tags["surveillance"] ?? "camera",
      operator: tags["operator"] ?? "",
      description: tags["description"] ?? tags["camera:type"] ?? "",
    },
    // Coordinates rounded to ~1m. At 12k features this meaningfully shrinks the
    // committed file without moving any point visibly on a globe.
    geometry: { type: "Point", coordinates: [round5(el.lon), round5(el.lat)] },
  };
}

function round5(n: number): number {
  return Number(n.toFixed(5));
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

// Spatially even downsample: bucket into ~0.05° cells, then take one point per
// cell per pass, round-robin, until the cap is hit. Preserves the geographic
// spread of the full set instead of favouring whichever dense metro happens to
// sort first.
function downsampleSpatially(features: Feature[], cap: number): Feature[] {
  if (features.length <= cap) return features;
  const cells = new Map<string, Feature[]>();
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const key = `${Math.floor(lat / 0.05)}:${Math.floor(lon / 0.05)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(f);
    else cells.set(key, [f]);
  }
  const buckets = [...cells.values()];
  const picked: Feature[] = [];
  let pass = 0;
  while (picked.length < cap) {
    let tookAny = false;
    for (const bucket of buckets) {
      if (pass >= bucket.length) continue;
      picked.push(bucket[pass]);
      tookAny = true;
      if (picked.length >= cap) break;
    }
    if (!tookAny) break; // every bucket exhausted
    pass++;
  }
  return picked;
}

// Resolves to the parsed feature list (possibly empty) or throws. It never
// resolves to null — the caller distinguishes "empty" from "failed" itself.
async function fetchOnce(url: string, query: string, category: string): Promise<Feature[]> {
  const body = `data=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  // A busy Overpass instance answers 200 with an HTML error document rather
  // than JSON ("Dispatcher_Client::request_read_and_idx::timeout"). Treat any
  // non-JSON body as a failure so the retry/mirror path engages.
  const text = await res.text();
  let json: { elements?: OverpassElement[] };
  try {
    json = JSON.parse(text);
  } catch {
    const hint = text.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`non-JSON response from ${url}: ${hint}`);
  }
  return (json.elements ?? [])
    .filter(
      (el): el is OverpassElement & { lat: number; lon: number } =>
        el.type === "node" && el.lat != null && el.lon != null
    )
    .map((el) => elementToFeature(el, regionForPoint(el.lat, el.lon), category))
    .filter((f): f is Feature => f != null);
}

// One retry per endpoint (network hiccups are common against the shared
// public Overpass instance); then fall through to the mirror endpoint.
async function tryEndpoint(url: string, query: string, category: string): Promise<Feature[] | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (Date.now() - START > TOTAL_BUDGET_MS) {
      console.warn("  (time budget reached — stopping Overpass attempts)");
      return null;
    }
    try {
      const features = await fetchOnce(url, query, category);
      if (features.length > 0) return features;
      console.warn(`  (${url} returned 0 features on attempt ${attempt})`);
    } catch (err) {
      console.warn(`  (${url} attempt ${attempt} failed: ${(err as Error).message})`);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function sweep(label: string, query: string, category: string): Promise<Feature[] | null> {
  console.log(`\n  sweep: ${label}`);
  for (const url of OVERPASS_ENDPOINTS) {
    if (Date.now() - START > TOTAL_BUDGET_MS) break;
    const features = await tryEndpoint(url, query, category);
    if (features) return features;
  }
  return null;
}

// Features of one category carried over from the committed file, used when
// that sweep fails so a bad network day never shrinks the dataset.
function committedFeatures(category: string): Feature[] {
  if (!fs.existsSync(OUT)) return [];
  try {
    const existing = JSON.parse(fs.readFileSync(OUT, "utf8")) as { features?: Feature[] };
    return (existing.features ?? []).filter((f) => {
      // Files written before the ALPR sweep existed have no `category`; treat
      // those as the camera sweep, which is what they were.
      const c = (f.properties?.category as string) ?? "camera";
      return c === category;
    });
  } catch {
    return [];
  }
}

async function main() {
  const regions = allRegions();
  const alprTileCount = usTiles().length + WORLD_TILES.length;
  console.log("\nIngesting OpenStreetMap surveillance nodes (Overpass API)…");
  console.log(`  A: ${regions.length} curated regions, cap ${PER_REGION_CAP}/region`);
  console.log(`  B: ${alprTileCount} ALPR tiles worldwide, cap ${MAX_ALPR_FEATURES} after downsample`);
  console.log(`  budget ${TOTAL_BUDGET_MS}ms`);

  const cameraFresh = await sweep("man_made=surveillance (curated regions)", regionQuery(), "camera");
  const alprFresh = await sweep("surveillance:type=ALPR (worldwide tiles)", alprQuery(), "alpr");

  if (!cameraFresh && !alprFresh) {
    if (fs.existsSync(OUT)) {
      console.log(
        "\nOverpass unavailable for both sweeps (network blocked, rate-limited, or budget exceeded)." +
          "\nKeeping the committed file so the build still has data — NOT overwriting:" +
          `\n  ${path.relative(ROOT, OUT)}\n`
      );
      // Validate the committed file still parses before exiting clean.
      JSON.parse(fs.readFileSync(OUT, "utf8"));
      return;
    }
    throw new Error("Overpass unavailable and no committed file present.");
  }

  const camera = cameraFresh
    ? cameraFresh.slice(0, MAX_FEATURES)
    : (console.warn("  (camera sweep failed — carrying over committed camera features)"),
      committedFeatures("camera"));

  const alpr = alprFresh
    ? downsampleSpatially(alprFresh, MAX_ALPR_FEATURES)
    : (console.warn("  (ALPR sweep failed — carrying over committed ALPR features)"),
      committedFeatures("alpr"));

  // De-duplicate by OSM id: an ALPR node inside a curated region satisfies both
  // sweeps. ALPR wins, since it is the more specific classification.
  const byId = new Map<string, Feature>();
  for (const f of camera) byId.set(f.properties.id as string, f);
  for (const f of alpr) byId.set(f.properties.id as string, f);
  const features = [...byId.values()];

  const fc = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    attribution: "© OpenStreetMap contributors (ODbL) — https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0",
    sourceName: "OpenStreetMap (Overpass API)",
    sourceUrl: "https://overpass-api.de/api/interpreter",
    note:
      "Two sweeps: general surveillance nodes sampled from curated world cities/regions, and " +
      "ALPR nodes (surveillance:type=ALPR, the DeFlock tagging) tiled worldwide and spatially " +
      "downsampled. Both are samples — absence reflects mapping coverage and sampling, not " +
      "absence of cameras.",
    counts: {
      camera: camera.length,
      alpr: alpr.length,
      alprFetchedBeforeDownsample: alprFresh ? alprFresh.length : null,
      alprWorldwideTotalObserved: 135358, // Overpass `out count`, 2026-08-04
    },
    regions: regions.map((r) => ({ name: r.name, bbox: r.bbox })),
    features,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log(
    `\nWrote ${features.length} OSM nodes (${camera.length} camera across ${regions.length} regions, ` +
      `${alpr.length} ALPR worldwide) to ${path.relative(ROOT, OUT)}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
