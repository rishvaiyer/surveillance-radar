import type { MapRecord } from "./schema";

// "What is documented near me?" Pure functions, no network: the visitor's position never leaves the page.

const EARTH_MILES = 3958.8;

export function distanceMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

// A record placed on a state centroid says nothing about where in the state it is, so it is never "near" anyone.
export function isLocal(record: MapRecord): boolean {
  return record.geocodeSource === "csv" || record.geocodeSource === "city" || record.geocodeSource === "county";
}

export type Nearby = { record: MapRecord; miles: number };

export function nearby(records: MapRecord[], lat: number, lon: number, radiusMiles: number): Nearby[] {
  const out: Nearby[] = [];
  for (const record of records) {
    if (!isLocal(record)) continue;
    const miles = distanceMiles(lat, lon, record.latitude, record.longitude);
    if (miles <= radiusMiles) out.push({ record, miles });
  }
  return out.sort((a, b) => a.miles - b.miles);
}

export function byTechnology(found: Nearby[]): { technology: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { record } of found) {
    const key = record.technology || "Other";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].map(([technology, count]) => ({ technology, count })).sort((a, b) => b.count - a.count);
}

// Find a place the visitor typed ("Oakland, CA", "Austin TX", "Denver") using the records' own city names,
// so no outside geocoder is involved.
export function findPlace(records: MapRecord[], text: string): { lat: number; lon: number; label: string } | null {
  const raw = text.trim();
  if (!raw) return null;
  const match = raw.match(/^(.*?)[,\s]+([A-Za-z]{2})$/);
  const city = (match ? match[1] : raw).trim().toLowerCase();
  const state = match ? match[2].toUpperCase() : null;
  const hits = records.filter(
    (r) => isLocal(r) && r.city && r.city.toLowerCase() === city && (!state || r.state === state)
  );
  if (!hits.length) return null;
  // Prefer the state with the most records for that city name, then use the middle of that city's points.
  const perState = new Map<string, MapRecord[]>();
  for (const r of hits) perState.set(r.state || "", [...(perState.get(r.state || "") || []), r]);
  const best = [...perState.values()].sort((a, b) => b.length - a.length)[0];
  const lat = best.reduce((s, r) => s + r.latitude, 0) / best.length;
  const lon = best.reduce((s, r) => s + r.longitude, 0) / best.length;
  return { lat, lon, label: `${best[0].city}${best[0].state ? ", " + best[0].state : ""}` };
}
