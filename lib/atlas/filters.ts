import type { MapRecord } from "./schema";
import { searchRecords } from "./search";

export type Filters = {
  query: string;
  state: string | null;
  technology: string | null;
  sourcesOnly: boolean;
  alprEvidenceOnly: boolean;
};

export const EMPTY_FILTERS: Filters = {
  query: "",
  state: null,
  technology: null,
  sourcesOnly: false,
  alprEvidenceOnly: false,
};

export function applyFilters(records: MapRecord[], filters: Filters): MapRecord[] {
  let out = records;
  if (filters.state) out = out.filter((r) => r.state === filters.state);
  if (filters.technology) out = out.filter((r) => r.technology === filters.technology);
  if (filters.sourcesOnly) out = out.filter((r) => r.sourceUrls.length > 0);
  if (filters.alprEvidenceOnly) out = out.filter((r) => Boolean(r.alprEvidence));
  out = searchRecords(out, filters.query);
  return out;
}
