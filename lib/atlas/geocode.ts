import centroids from "../../data/centroids/us-places.json";

// Offline, deterministic geocoding via bundled centroids.
// Resolution order: city+state -> county+state -> state centroid.
// No network, no API keys, no rate limits.

type LatLng = [number, number]; // [lat, lng]

const STATE_CENTROIDS = (centroids as any).states as Record<string, LatLng>;
const CITY_CENTROIDS = (centroids as any).cities as Record<string, LatLng>;
const COUNTY_CENTROIDS = ((centroids as any).counties ?? {}) as Record<string, LatLng>;

// Full state name -> USPS abbreviation.
const STATE_ABBR: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

export function normalizeState(state: string | null): string | null {
  if (!state) return null;
  const s = state.trim();
  if (s.length === 2 && STATE_CENTROIDS[s.toUpperCase()]) return s.toUpperCase();
  const abbr = STATE_ABBR[s.toLowerCase()];
  return abbr ?? (s.toUpperCase().length === 2 ? s.toUpperCase() : null);
}

function clean(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|municipality|census area|county|parish|borough|city|town|village|cdp)$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  source: "city" | "county" | "state";
} | null;

export function geocode(
  city: string | null,
  county: string | null,
  state: string | null
): GeocodeResult {
  const st = normalizeState(state);
  if (!st) return null;

  if (city) {
    const hit = CITY_CENTROIDS[`${clean(city)}|${st}`];
    if (hit) return { lat: hit[0], lng: hit[1], source: "city" };
  }
  if (county) {
    const hit = COUNTY_CENTROIDS[`${clean(county)}|${st}`];
    if (hit) return { lat: hit[0], lng: hit[1], source: "county" };
  }
  const stHit = STATE_CENTROIDS[st];
  if (stHit) return { lat: stHit[0], lng: stHit[1], source: "state" };
  return null;
}
