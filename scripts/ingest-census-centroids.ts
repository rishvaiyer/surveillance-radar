/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import existing from "../data/centroids/us-places.json";

const ROOT = path.resolve(__dirname, "..");
const PLACE_FILE = path.join(ROOT, "data/raw/census/2025_Gaz_place_national.txt");
const COUNTY_FILE = path.join(ROOT, "data/raw/census/2025_Gaz_counties_national.txt");
const OUTPUT = path.join(ROOT, "data/centroids/us-places.json");

type Point = [number, number];

function clean(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+(city and borough|consolidated government|metropolitan government|unified government|municipality|census area|county|parish|borough|city|town|village|cdp)$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function rows(file: string): Record<string, string>[] {
  const [header, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const fields = header.split("|");
  return lines.map((line) =>
    Object.fromEntries(line.split("|").map((value, index) => [fields[index], value])),
  );
}

function point(row: Record<string, string>): Point | null {
  const latitude = Number(row.INTPTLAT);
  const longitude = Number(row.INTPTLONG);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null;
}

const cities: Record<string, Point> = {};
const ambiguous = new Set<string>();
for (const row of rows(PLACE_FILE)) {
  const coordinate = point(row);
  if (!coordinate) continue;
  const key = `${clean(row.NAME)}|${row.USPS}`;
  if (cities[key]) ambiguous.add(key);
  else cities[key] = coordinate;
}
for (const key of ambiguous) delete cities[key];

const counties: Record<string, Point> = {};
for (const row of rows(COUNTY_FILE)) {
  const coordinate = point(row);
  if (coordinate) counties[`${clean(row.NAME)}|${row.USPS}`] = coordinate;
}

const output = {
  _note: "Offline representative coordinates generated from the official 2025 U.S. Census Gazetteer place and county files.",
  _source: "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html",
  _generatedAt: new Date().toISOString(),
  states: existing.states,
  cities,
  counties,
};

fs.writeFileSync(OUTPUT, JSON.stringify(output));
console.log(`Wrote ${Object.keys(cities).length} places and ${Object.keys(counties).length} counties`);
console.log(`Excluded ${ambiguous.size} ambiguous duplicate place names`);
