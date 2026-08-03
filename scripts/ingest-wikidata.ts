/* eslint-disable no-console */
//
// Ingest law-enforcement agency metadata (with coordinates) from Wikidata via
// the public SPARQL endpoint, and bake it to a static GeoJSON in public/ so the
// map renders it offline. Mirrors the EFF atlas build-time ingest pattern.
//
// On any network failure (the WDQS endpoint is frequently rate-limited in
// automated environments), this is NON-FATAL: we keep the committed sample file
// (public/wikidata-agencies.geojson). When run with network it OVERWRITES that
// file with fresh SPARQL results.
//
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/wikidata-agencies.geojson");

const WDQS = "https://query.wikidata.org/sparql";

// Law-enforcement agencies (instance of / subclass of "law enforcement agency",
// Q1414557) that have coordinate locations (P625). Bounded by LIMIT to keep the
// bundled file tiny.
const SPARQL = `
SELECT ?agency ?agencyLabel ?countryLabel ?coord WHERE {
  ?agency wdt:P31/wdt:P279* wd:Q1414557 .
  ?agency wdt:P625 ?coord .
  OPTIONAL { ?agency wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 300
`;

const MAX_FEATURES = 300;

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

function bindingToFeature(b: Binding): Feature | null {
  if (!b.coord?.value) return null;
  const coords = parsePoint(b.coord.value);
  if (!coords) return null;
  const qid = b.agency?.value?.split("/").pop() ?? "";
  return {
    type: "Feature",
    properties: {
      id: `wd-${qid}`,
      name: b.agencyLabel?.value ?? qid,
      country: b.countryLabel?.value ?? "",
      wikidata: b.agency?.value ?? "",
    },
    geometry: { type: "Point", coordinates: coords },
  };
}

async function trySparql(): Promise<Feature[] | null> {
  const url = `${WDQS}?format=json&query=${encodeURIComponent(SPARQL)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        // WDQS requires a descriptive User-Agent.
        "User-Agent": "SurveillanceRadar/0.1 (open-data cross-reference; build-time ingest)",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { bindings?: Binding[] } };
    const features = (json.results?.bindings ?? [])
      .map(bindingToFeature)
      .filter((f): f is Feature => f != null)
      .slice(0, MAX_FEATURES);
    return features.length > 0 ? features : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("\nIngesting Wikidata law-enforcement agencies (SPARQL)…");

  const features = await trySparql();

  if (!features) {
    if (fs.existsSync(OUT)) {
      console.log(
        "\nWikidata SPARQL unavailable (network blocked or rate-limited)." +
          "\nKeeping the committed sample file so the build still has data:" +
          `\n  ${path.relative(ROOT, OUT)}\n`
      );
      JSON.parse(fs.readFileSync(OUT, "utf8"));
      return;
    }
    throw new Error("Wikidata SPARQL unavailable and no committed sample file present.");
  }

  const fc = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    attribution: "Data from Wikidata (CC0)",
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
