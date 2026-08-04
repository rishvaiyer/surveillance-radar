import type { MapRecord } from "./schema";
import { searchRecords } from "./search";

export type Filters = {
  query: string;
  state: string | null;
  technology: string | null;
  sourcesOnly: boolean;
  alprEvidenceOnly: boolean;
  // Time-slider position. null = "All years" (no year filtering; the default,
  // unfiltered view). A number Y shows only records known by year Y (earliest
  // dated evidence link <= Y); records with no usable year are excluded until
  // the slider returns to null / "All years".
  year: number | null;
};

export const EMPTY_FILTERS: Filters = {
  query: "",
  state: null,
  technology: null,
  sourcesOnly: false,
  alprEvidenceOnly: false,
  year: null,
};

export function applyFilters(records: MapRecord[], filters: Filters): MapRecord[] {
  let out = records;
  if (filters.state) out = out.filter((r) => r.state === filters.state);
  if (filters.technology) out = out.filter((r) => r.technology === filters.technology);
  if (filters.sourcesOnly) out = out.filter((r) => r.sourceUrls.length > 0);
  if (filters.alprEvidenceOnly) out = out.filter((r) => Boolean(r.alprEvidence));
  if (filters.year != null) {
    const year = filters.year;
    out = out.filter((r) => r.earliestSourceYear != null && r.earliestSourceYear <= year);
  }
  out = searchRecords(out, filters.query);
  return out;
}
