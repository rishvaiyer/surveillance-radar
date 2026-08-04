/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { normalizeRow } from "../lib/atlas/normalize";
import { geocode } from "../lib/atlas/geocode";
import { SurveillanceRecordSchema, type SurveillanceRecord } from "../lib/atlas/schema";

const ROOT = path.resolve(__dirname, "..");
const RAW_CSV = path.join(ROOT, "data/raw/atlas-of-surveillance.csv");
const SAMPLE_CSV = path.join(ROOT, "data/raw/sample-atlas.csv");
const OUT_RECORDS = path.join(ROOT, "data/processed/atlas-records.json");
const OUT_SUMMARY = path.join(ROOT, "data/processed/atlas-summary.json");
// The app fetches records at runtime from public/ (see components/MapExperience.tsx),
// while atlas-summary.json is statically imported from data/processed/ at build
// time (see app/page.tsx) and does not need a public/ copy. Both files must be
// written together so a live refresh doesn't silently go stale in the app.
const PUBLIC_RECORDS = path.join(ROOT, "public/atlas-records.json");

// Known EFF CSV endpoints. Verified 2026-08-03 via curl with a descriptive
// User-Agent: both return HTTP 200 / text/csv (~8.4MB, ~15k rows), headers
// matching the committed data/raw/atlas-of-surveillance.csv exactly. (The
// data-library page itself documents automated downloads as "often blocked
// with HTTP 403" — that was not reproduced from this environment, but the
// fallback chain below stays in place in case CI's egress is treated
// differently.)
const KNOWN_URLS = [
  "https://www.atlasofsurveillance.org/download.csv",
  "https://kiosk.atlasofsurveillance.org/download.csv",
];

const REQUEST_TIMEOUT_MS = Number(process.env.SR_ATLAS_REQUEST_TIMEOUT_MS || 45_000);
const TOTAL_BUDGET_MS = Number(process.env.SR_ATLAS_TOTAL_BUDGET_MS || 150_000);
const START = Date.now();

function manualImportMessage(): string {
  return [
    "",
    "No Atlas CSV found and automatic download was unavailable.",
    "",
    "To import the real dataset:",
    "  1. Download the complete CSV from the EFF Atlas of Surveillance Data Library:",
    "       https://atlasofsurveillance.org/pages/data-library",
    `  2. Save it to:  ${path.relative(ROOT, RAW_CSV)}`,
    "  3. Re-run:      pnpm ingest:atlas",
    "",
    "Continuing with the bundled demo data (data/raw/sample-atlas.csv) so the app still runs.",
    "",
  ].join("\n");
}

async function fetchOnce(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "SurveillanceRadar/1.0 (+public-interest data visualization)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const text = await res.text();
  if (!text.includes(",")) throw new Error(`unexpected response body from ${url}`);
  return text;
}

// Retry once per URL, then move to the next known endpoint. Non-fatal: the
// caller falls back to the committed raw CSV, then the bundled sample.
async function tryDownload(): Promise<string | null> {
  for (const url of KNOWN_URLS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (Date.now() - START > TOTAL_BUDGET_MS) {
        console.warn("  (time budget reached — stopping live-download attempts)");
        return null;
      }
      try {
        const text = await fetchOnce(url);
        if (text) return text;
      } catch (err) {
        console.warn(`  (${url} attempt ${attempt} failed: ${(err as Error).message})`);
        if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  return null;
}

function resolveCsv(): Promise<{ csv: string; origin: string; live: boolean }> {
  return (async () => {
    // Try the live EFF download FIRST so a weekly re-run actually refreshes
    // data instead of re-reading the same committed snapshot forever. Only
    // written to disk (and only used) once a full, valid response comes
    // back — a failed/partial download never touches the committed CSV.
    const downloaded = await tryDownload();
    if (downloaded) {
      fs.writeFileSync(RAW_CSV, downloaded);
      return { csv: downloaded, origin: "EFF live download", live: true };
    }
    if (fs.existsSync(RAW_CSV)) {
      return { csv: fs.readFileSync(RAW_CSV, "utf8"), origin: "data/raw/atlas-of-surveillance.csv (committed snapshot)", live: false };
    }
    console.log(manualImportMessage());
    if (fs.existsSync(SAMPLE_CSV)) {
      return { csv: fs.readFileSync(SAMPLE_CSV, "utf8"), origin: "bundled demo (sample-atlas.csv)", live: false };
    }
    throw new Error("No CSV available (no live download, no committed raw, no sample).");
  })();
}

function topN(counts: Map<string, number>, n: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The upstream CSV doesn't carry a reliable "last updated" header (HEAD
// requests to atlasofsurveillance.org returned 503 when probed 2026-08-03),
// so we track it ourselves: today's date when we successfully pulled live,
// otherwise whatever was recorded on the last successful live pull.
function resolveSourceLastUpdated(live: boolean): string {
  if (live) return isoDate(new Date());
  try {
    const prev = JSON.parse(fs.readFileSync(OUT_SUMMARY, "utf8"));
    if (typeof prev.sourceLastUpdated === "string") return prev.sourceLastUpdated;
  } catch {
    // no prior summary — fall through
  }
  return "unknown";
}

async function main() {
  const { csv, origin, live } = await resolveCsv();
  console.log(`\nReading CSV from: ${origin}`);

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  const headers = parsed.meta.fields ?? [];
  console.log(`Headers detected: ${headers.join(", ")}`);

  const records: SurveillanceRecord[] = [];
  let skippedNoLocation = 0;
  let skippedNoEvidence = 0;
  const techCounts = new Map<string, number>();
  const stateCounts = new Map<string, number>();
  const vendorCounts = new Map<string, number>();
  const agencies = new Set<string>();
  const geoSourceCounts: Record<string, number> = { csv: 0, city: 0, county: 0, state: 0 };

  parsed.data.forEach((row, i) => {
    const n = normalizeRow(row, headers);
    if (n.sourceUrls.length === 0) {
      skippedNoEvidence += 1;
      return;
    }

    let lat: number | null = n.csvLat;
    let lng: number | null = n.csvLng;
    let geocodeSource: SurveillanceRecord["geocodeSource"] = "none";

    if (lat != null && lng != null) {
      geocodeSource = "csv";
    } else {
      const g = geocode(n.city, n.county, n.state);
      if (g) {
        lat = g.lat;
        lng = g.lng;
        geocodeSource = g.source;
      }
    }

    if (lat == null || lng == null) {
      skippedNoLocation += 1;
      return;
    }
    geoSourceCounts[geocodeSource] = (geoSourceCounts[geocodeSource] ?? 0) + 1;

    const record: SurveillanceRecord = {
      id: n.sourceRecordId || `rec-${i}`,
      agencyName: n.agencyName,
      city: n.city,
      county: n.county,
      state: n.state,
      technology: n.technology,
      vendor: n.vendor,
      description: n.description,
      sourceUrls: n.sourceUrls,
      latitude: lat,
      longitude: lng,
      geocodeSource,
      // raw intentionally dropped from the client payload
    };

    const valid = SurveillanceRecordSchema.safeParse(record);
    if (!valid.success) return;
    records.push(record);

    if (record.technology) techCounts.set(record.technology, (techCounts.get(record.technology) ?? 0) + 1);
    if (record.state) stateCounts.set(record.state, (stateCounts.get(record.state) ?? 0) + 1);
    if (record.vendor) vendorCounts.set(record.vendor, (vendorCounts.get(record.vendor) ?? 0) + 1);
    if (record.agencyName) agencies.add(record.agencyName);
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    skippedNoLocation,
    skippedNoEvidence,
    geocodeSources: geoSourceCounts,
    uniqueAgencies: agencies.size,
    uniqueTechnologies: techCounts.size,
    uniqueStates: stateCounts.size,
    technologies: [...techCounts.keys()].sort(),
    states: [...stateCounts.keys()].sort(),
    topTechnologies: topN(techCounts, 10),
    topStates: topN(stateCounts, 10),
    topVendors: topN(vendorCounts, 10),
    attribution: "Data source: Electronic Frontier Foundation, Atlas of Surveillance (CC BY).",
    license: "CC BY 4.0",
    sourceName: "EFF Atlas of Surveillance",
    sourceUrl: "https://www.atlasofsurveillance.org/data-library",
    methodologyUrl: "https://www.atlasofsurveillance.org/pages/methodology",
    licenseUrl: "https://www.eff.org/copyright",
    csvOrigin: origin,
    live,
    sourceLastUpdated: resolveSourceLastUpdated(live),
  };

  fs.mkdirSync(path.dirname(OUT_RECORDS), { recursive: true });
  fs.mkdirSync(path.dirname(PUBLIC_RECORDS), { recursive: true });
  const recordsJson = JSON.stringify(records);
  fs.writeFileSync(OUT_RECORDS, recordsJson);
  fs.writeFileSync(PUBLIC_RECORDS, recordsJson);
  fs.writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2));

  console.log("\nImport summary");
  console.log("--------------");
  console.log(`  mapped records:      ${summary.totalRecords}`);
  console.log(`  skipped (no geo):    ${summary.skippedNoLocation}`);
  console.log(`  skipped (no source): ${summary.skippedNoEvidence}`);
  console.log(`  geocode sources:     ${JSON.stringify(geoSourceCounts)}`);
  console.log(`  unique agencies:     ${summary.uniqueAgencies}`);
  console.log(`  unique technologies: ${summary.uniqueTechnologies}`);
  console.log(`  unique states:       ${summary.uniqueStates}`);
  console.log(
    `\nWrote ${path.relative(ROOT, OUT_RECORDS)}, ${path.relative(ROOT, PUBLIC_RECORDS)} and ${path.relative(ROOT, OUT_SUMMARY)}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
