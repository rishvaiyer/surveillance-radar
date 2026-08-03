import type { MapRecord } from "./schema";

// Simple, fast client-side search over the normalized text fields.
// 15k records is small enough for a linear scan per keystroke.
const FIELDS: (keyof MapRecord)[] = [
  "agencyName",
  "city",
  "county",
  "state",
  "technology",
  "vendor",
  "description",
];

export function searchRecords(records: MapRecord[], query: string): MapRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) =>
    FIELDS.some((f) => {
      const v = r[f];
      return typeof v === "string" && v.toLowerCase().includes(q);
    })
  );
}
