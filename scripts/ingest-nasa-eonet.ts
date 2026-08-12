/* eslint-disable no-console */
//
// Fetch currently open natural events from NASA's Earth Observatory Natural
// Event Tracker (EONET) and bake one latest location per event into a compact
// GeoJSON file. EONET may return multiple dated points for a moving event, such
// as a tropical cyclone track; keeping the latest point avoids drawing one
// event as dozens of apparently separate incidents.
//
// The ingest is non-destructive. A failed request keeps the last committed
// snapshot so a temporary NASA/API outage cannot empty the deployed layer.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/nasa-eonet-events.geojson");
const API = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&limit=500";
const REQUEST_TIMEOUT_MS = Number(process.env.SR_EONET_REQUEST_TIMEOUT_MS || 30_000);

type EonetFeature = {
  type: "Feature";
  properties?: {
    id?: string;
    title?: string;
    description?: string | null;
    link?: string;
    date?: string;
    magnitudeValue?: number | null;
    magnitudeUnit?: string | null;
    magnitudeDescription?: string | null;
    categories?: { id?: string; title?: string }[];
    sources?: { id?: string; url?: string }[];
  };
  geometry?: { type: "Point"; coordinates: [number, number] };
};

type OutputFeature = {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: { type: "Point"; coordinates: [number, number] };
};

function normalize(feature: EonetFeature): OutputFeature | null {
  const p = feature.properties;
  const coordinates = feature.geometry?.coordinates;
  if (!p?.id || !p.title || feature.geometry?.type !== "Point" || !coordinates) return null;
  if (!coordinates.every(Number.isFinite)) return null;

  const category = p.categories?.[0];
  const source = p.sources?.[0];
  const magnitude =
    p.magnitudeValue == null
      ? ""
      : `${p.magnitudeValue}${p.magnitudeUnit ? ` ${p.magnitudeUnit}` : ""}`;

  return {
    type: "Feature",
    properties: {
      id: p.id,
      title: p.title,
      description: p.description ?? "",
      date: p.date ?? "",
      categoryId: category?.id ?? "other",
      category: category?.title ?? "Natural event",
      sourceName: source?.id ?? "",
      sourceUrl: source?.url ?? "",
      eventUrl: p.link ?? "",
      magnitude,
      magnitudeDescription: p.magnitudeDescription ?? "",
    },
    geometry: { type: "Point", coordinates },
  };
}

async function main() {
  console.log("\nIngesting NASA EONET open natural events…");

  try {
    const response = await fetch(API, {
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent":
          "SurveillanceRadar/1.0 (NASA EONET visualization; +https://github.com/rishvaiyer/surveillance-radar)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = (await response.json()) as { features?: EonetFeature[] };
    const latestById = new Map<string, OutputFeature>();
    for (const raw of json.features ?? []) {
      const feature = normalize(raw);
      if (!feature) continue;
      const id = String(feature.properties.id);
      const previous = latestById.get(id);
      if (!previous || String(feature.properties.date) > String(previous.properties.date)) {
        latestById.set(id, feature);
      }
    }

    const features = [...latestById.values()].sort((a, b) =>
      String(b.properties.date).localeCompare(String(a.properties.date))
    );
    if (features.length === 0) throw new Error("NASA EONET returned no usable open events");

    const output = {
      type: "FeatureCollection" as const,
      generatedAt: new Date().toISOString(),
      attribution: "NASA Earth Observatory Natural Event Tracker (EONET)",
      sourceName: "NASA EONET",
      sourceUrl: "https://eonet.gsfc.nasa.gov/",
      methodologyUrl: "https://eonet.gsfc.nasa.gov/docs/v3",
      note: "One latest known point per currently open EONET event. Event locations and open status reflect source curation and may change.",
      features,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(output));
    console.log(`Wrote ${features.length} current NASA EONET events to ${path.relative(ROOT, OUT)}\n`);
  } catch (error) {
    if (!fs.existsSync(OUT)) throw error;
    JSON.parse(fs.readFileSync(OUT, "utf8"));
    console.warn(
      `NASA EONET refresh failed (${(error as Error).message}). Keeping committed snapshot: ${path.relative(
        ROOT,
        OUT
      )}\n`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
