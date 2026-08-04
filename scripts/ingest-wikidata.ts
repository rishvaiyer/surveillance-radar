/* eslint-disable no-console */
//
// Ingest intelligence and law-enforcement agency metadata (with coordinates)
// from Wikidata via the public SPARQL endpoint (WDQS), and bake it to a static
// GeoJSON in public/ so the map renders it offline. Mirrors the EFF atlas
// build-time ingest pattern.
//
// Two classes are queried, sequentially, as SEPARATE requests:
//   - Q47913   "intelligence agency"     (subclasses via P31/P279*)
//   - Q732717  "law enforcement agency"  (subclasses via P31/P279*)
//
// NOTE on QIDs: an earlier version of this script queried wd:Q1414557, which
// is NOT "law enforcement agency" — it resolves to "nondisjunction" (a
// genetics term) and silently returns zero results. Verified 2026-08-03 via
// the Wikidata API (wbsearchentities) and by fetching
// https://www.wikidata.org/wiki/Special:EntityData/Q1414557.json. The correct
// QID is Q732717. Q47913 ("intelligence agency") was verified correct the
// same way.
//
// The two classes are queried separately rather than combined with UNION:
// verified 2026-08-03 that a single UNION query (both classes + labels +
// coords in one request) intermittently returned HTTP 502 from WDQS, while
// each class queried alone reliably returned HTTP 200 in 5-15s. Splitting
// into two smaller, sequential requests is both more reliable and more
// polite to the shared public endpoint.
//
// On any network failure (WDQS is frequently rate-limited or flaky in
// automated environments), this is NON-FATAL: we keep the committed file
// (public/wikidata-agencies.geojson). When run with network it OVERWRITES
// that file with fresh SPARQL results, built in memory first so a partial
// failure never leaves a half-written file.
//
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/wikidata-agencies.geojson");

const WDQS = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "SurveillanceRadar/1.0 (open-data cross-reference; +https://github.com/rishvaiyer/surveillance-radar)";

const REQUEST_TIMEOUT_MS = Number(process.env.SR_WD_REQUEST_TIMEOUT_MS || 60_000);
const TOTAL_BUDGET_MS = Number(process.env.SR_WD_TOTAL_BUDGET_MS || 150_000);
const START = Date.now();

const CLASSES: { qid: string; kind: string; limit: number }[] = [
  { qid: "Q47913", kind: "intelligence", limit: 400 },
  { qid: "Q732717", kind: "law-enforcement", limit: 500 },
];

function sparqlFor(qid: string, limit: number): string {
  return `
SELECT ?agency ?agencyLabel ?countryLabel ?coord WHERE {
  ?agency wdt:P31/wdt:P279* wd:${qid} .
  ?agency wdt:P625 ?coord .
  OPTIONAL { ?agency wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT ${limit}
`;
}

type Binding = {
  agency?: { value: string };
  agencyLabel?: { value: string };
  countryLabel?: { value: string };
  coord?: { value: string };
};

type Feature = {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: "Point"; coordinates: [number, number] };
};

// Wikidata serializes P625 as WKT, e.g. "Point(-77.0366 38.8951)".
function parsePoint(wkt: string): [number, number] | null {
  const m = wkt.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  return [lng, lat];
}

function bindingToFeature(b: Binding, kind: string): Feature | null {
  if (!b.coord?.value) return null;
  const coords = parsePoint(b.coord.value);
  if (!coords) return null;
  const qid = b.agency?.value?.split("/").pop() ?? "";
  return {
    type: "Feature",
    properties: {
      id: `wd-${qid}`,
      name: b.agencyLabel?.value ?? qid,
      kind,
      country: b.countryLabel?.value ?? "",
      wikidata: b.agency?.value ?? "",
    },
    geometry: { type: "Point", coordinates: coords },
  };
}

async function fetchOnce(qid: string, kind: string, limit: number): Promise<Feature[]> {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(sparqlFor(qid, limit))}`;
  const res = await fetch(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${qid}`);
  const json = (await res.json()) as { results?: { bindings?: Binding[] } };
  return (json.results?.bindings ?? [])
    .map((b) => bindingToFeature(b, kind))
    .filter((f): f is Feature => f != null);
}

// Retry once per class on failure before giving up on that class. A failure
// on one class does not sink the other — we just end up with fewer features.
async function fetchClass(qid: string, kind: string, limit: number): Promise<Feature[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (Date.now() - START > TOTAL_BUDGET_MS) {
      console.warn(`  (time budget reached — skipping ${qid})`);
      return [];
    }
    try {
      const features = await fetchOnce(qid, kind, limit);
      console.log(`  ${kind} (${qid}): ${features.length} features`);
      return features;
    } catch (err) {
      console.warn(`  (${qid} attempt ${attempt} failed: ${(err as Error).message})`);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return [];
}

async function main() {
  console.log("\nIngesting Wikidata intelligence & law-enforcement agencies (SPARQL)…");

  const all: Feature[] = [];
  let anySucceeded = false;
  for (const cls of CLASSES) {
    const features = await fetchClass(cls.qid, cls.kind, cls.limit);
    if (features.length > 0) anySucceeded = true;
    all.push(...features);
  }

  // De-duplicate by QID in case an entity satisfies both class queries.
  const byId = new Map<string, Feature>();
  for (const f of all) byId.set(f.properties.id, f);
  const features = [...byId.values()];

  if (!anySucceeded) {
    if (fs.existsSync(OUT)) {
      console.log(
        "\nWDQS unavailable for both classes (network blocked, rate-limited, or budget exceeded)." +
          "\nKeeping the committed file so the build still has data — NOT overwriting:" +
          `\n  ${path.relative(ROOT, OUT)}\n`
      );
      JSON.parse(fs.readFileSync(OUT, "utf8"));
      return;
    }
    throw new Error("WDQS unavailable and no committed file present.");
  }

  const fc = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    attribution: "Data from Wikidata (CC0) — https://www.wikidata.org/wiki/Wikidata:Licensing",
    license: "CC0 1.0",
    sourceName: "Wikidata (SPARQL / WDQS)",
    sourceUrl: "https://query.wikidata.org/",
    note: "Intelligence agencies (wd:Q47913) and law-enforcement agencies (wd:Q732717), incl. subclasses, with coordinates (P625).",
    features,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log(`\nWrote ${features.length} Wikidata agencies to ${path.relative(ROOT, OUT)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
