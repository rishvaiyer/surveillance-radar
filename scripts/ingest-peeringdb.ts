/* eslint-disable no-console */
//
// Fetch public facility records from PeeringDB and bake a compact GeoJSON
// snapshot for the optional infrastructure context layer. PeeringDB facilities
// are interconnection locations, not a complete inventory of every datacenter.
//
// The ingest is non-destructive: a failed request keeps the last committed
// snapshot so a temporary API outage cannot remove the deployed layer.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/peeringdb-facilities.geojson");
const API = "https://www.peeringdb.com/api/fac?status=ok&limit=100000";
const REQUEST_TIMEOUT_MS = Number(process.env.SR_PEERINGDB_REQUEST_TIMEOUT_MS || 45_000);

type PeeringDbFacility = {
  id?: number;
  org_name?: string;
  name?: string;
  website?: string;
  net_count?: number;
  ix_count?: number;
  carrier_count?: number;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  updated?: string;
};

type Feature = {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: { type: "Point"; coordinates: [number, number] };
};

function normalize(raw: PeeringDbFacility): Feature | null {
  if (!raw.id || !raw.name || !Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude)) return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return {
    type: "Feature",
    properties: {
      id: `pdb-fac-${raw.id}`,
      name: raw.name,
      operator: raw.org_name ?? "",
      city: raw.city ?? "",
      state: raw.state ?? "",
      country: raw.country ?? "",
      website: raw.website ?? "",
      netCount: Number(raw.net_count ?? 0),
      ixCount: Number(raw.ix_count ?? 0),
      carrierCount: Number(raw.carrier_count ?? 0),
      updated: raw.updated ?? "",
      sourceUrl: `https://www.peeringdb.com/fac/${raw.id}`,
    },
    geometry: { type: "Point", coordinates: [longitude, latitude] },
  };
}

async function main() {
  console.log("\nIngesting PeeringDB public facilities…");

  try {
    const response = await fetch(API, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SurveillanceRadar/1.0 (public infrastructure visualization; +https://github.com/rishvaiyer/surveillance-radar)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = (await response.json()) as { data?: PeeringDbFacility[] };
    const byId = new Map<string, Feature>();
    for (const raw of json.data ?? []) {
      const feature = normalize(raw);
      if (feature) byId.set(String(feature.properties.id), feature);
    }
    const features = [...byId.values()].sort((a, b) =>
      String(a.properties.country).localeCompare(String(b.properties.country)) ||
      String(a.properties.city).localeCompare(String(b.properties.city)) ||
      String(a.properties.name).localeCompare(String(b.properties.name))
    );
    if (features.length === 0) throw new Error("PeeringDB returned no usable facilities");

    const output = {
      type: "FeatureCollection" as const,
      generatedAt: new Date().toISOString(),
      attribution: "PeeringDB (public facility data)",
      sourceName: "PeeringDB",
      sourceUrl: "https://www.peeringdb.com/",
      methodologyUrl: "https://docs.peeringdb.com/api_specs/",
      note: "Known PeeringDB facilities with coordinates. This is partial, user-maintained coverage and is not a complete datacenter inventory. Street addresses, contacts, and operational details are intentionally not included.",
      features,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(output));
    console.log(`Wrote ${features.length} PeeringDB facilities to ${path.relative(ROOT, OUT)}\n`);
  } catch (error) {
    if (!fs.existsSync(OUT)) throw error;
    JSON.parse(fs.readFileSync(OUT, "utf8"));
    console.warn(
      `PeeringDB refresh failed (${(error as Error).message}). Keeping committed snapshot: ${path.relative(ROOT, OUT)}\n`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
