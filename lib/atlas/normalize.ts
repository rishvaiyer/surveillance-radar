// Header-tolerant normalization for the Atlas of Surveillance CSV.
// The published CSV column names are not guaranteed stable, so we map likely
// variants (lowercased, trimmed) onto our app schema fields.

type RawRow = Record<string, string>;

// Candidate header names for each logical field, in priority order.
const FIELD_ALIASES: Record<string, string[]> = {
  sourceRecordId: ["aosnumber", "newaosnumber (ori9)", "record id", "id"],
  agencyName: ["agency", "agency_name", "agencyname", "law enforcement agency", "lea"],
  city: ["city", "town", "municipality"],
  county: ["county", "parish", "borough"],
  state: ["state", "st", "state/territory"],
  technology: ["technology", "tech", "type of technology", "surveillance technology", "category"],
  vendor: ["vendor", "company", "manufacturer", "supplier"],
  description: ["description", "summary", "notes", "details"],
  latitude: ["latitude", "lat", "y"],
  longitude: ["longitude", "lng", "lon", "long", "x"],
};

// Header names that may individually hold a source / evidence URL.
const SOURCE_ALIASES = [
  "source",
  "source_url",
  "sourceurl",
  "url",
  "link",
  "link 1",
  "link 2",
  "link 3",
  "links",
  "other links",
  "evidence",
];

// Header names that may hold a date for one of the evidence links. Used to
// estimate the earliest year a record was documented (for the time slider).
const DATE_ALIASES = ["link 1 date", "link 2 date", "link 3 date", "date"];

function buildHeaderMap(headers: string[]): Map<string, string> {
  // normalized header -> original header
  const map = new Map<string, string>();
  for (const h of headers) {
    map.set(h.trim().toLowerCase(), h);
  }
  return map;
}

function pick(row: RawRow, headerMap: Map<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const original = headerMap.get(alias);
    if (original !== undefined) {
      const v = row[original];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return null;
}

function collectSources(row: RawRow, headerMap: Map<string, string>): string[] {
  const urls = new Set<string>();
  for (const alias of SOURCE_ALIASES) {
    const original = headerMap.get(alias);
    if (original === undefined) continue;
    const v = row[original];
    if (v == null) continue;
    // A cell may contain multiple URLs separated by spaces, commas, semicolons, or pipes.
    for (const token of String(v).split(/[\s,;|]+/)) {
      const t = token.trim();
      if (/^https?:\/\//i.test(t)) urls.add(t);
    }
  }
  return [...urls];
}

function toNumber(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pulls a plausible 19xx/20xx year out of a free-form date string (the CSV's
// link-date columns are US-format like "12/27/2012"). Returns null if none found.
function extractYear(dateStr: string): number | null {
  const m = dateStr.match(/(19|20)\d{2}/);
  if (!m) return null;
  const year = Number(m[0]);
  return Number.isFinite(year) ? year : null;
}

// Earliest (minimum) year across all dated evidence links on the row, used as
// a "known by" year for the time slider. A record can have no dated links at
// all (older entries, or links whose date wasn't captured upstream).
function earliestSourceYear(row: RawRow, headerMap: Map<string, string>): number | null {
  let earliest: number | null = null;
  for (const alias of DATE_ALIASES) {
    const original = headerMap.get(alias);
    if (original === undefined) continue;
    const v = row[original];
    if (v == null || String(v).trim() === "") continue;
    const year = extractYear(String(v));
    if (year != null && (earliest == null || year < earliest)) earliest = year;
  }
  return earliest;
}

export type NormalizedRow = {
  sourceRecordId: string | null;
  agencyName: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  technology: string | null;
  vendor: string | null;
  description: string | null;
  sourceUrls: string[];
  csvLat: number | null;
  csvLng: number | null;
  earliestSourceYear: number | null;
  raw: Record<string, string | null>;
};

export function normalizeRow(row: RawRow, headers: string[]): NormalizedRow {
  const headerMap = buildHeaderMap(headers);
  return {
    sourceRecordId: pick(row, headerMap, FIELD_ALIASES.sourceRecordId),
    agencyName: pick(row, headerMap, FIELD_ALIASES.agencyName),
    city: pick(row, headerMap, FIELD_ALIASES.city),
    county: pick(row, headerMap, FIELD_ALIASES.county),
    state: pick(row, headerMap, FIELD_ALIASES.state),
    technology: pick(row, headerMap, FIELD_ALIASES.technology),
    vendor: pick(row, headerMap, FIELD_ALIASES.vendor),
    description: pick(row, headerMap, FIELD_ALIASES.description),
    sourceUrls: collectSources(row, headerMap),
    csvLat: toNumber(pick(row, headerMap, FIELD_ALIASES.latitude)),
    csvLng: toNumber(pick(row, headerMap, FIELD_ALIASES.longitude)),
    earliestSourceYear: earliestSourceYear(row, headerMap),
    raw: Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? null : String(v)])),
  };
}
