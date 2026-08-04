import { z } from "zod";

// Stable app schema for a single surveillance technology record.
// Mirrors the brief's normalized shape. `raw` is preserved at ingest time but
// stripped from the client-facing JSON to keep the payload small.
export const SurveillanceRecordSchema = z.object({
  id: z.string(),
  agencyName: z.string().nullable(),
  city: z.string().nullable(),
  county: z.string().nullable(),
  state: z.string().nullable(),
  technology: z.string().nullable(),
  vendor: z.string().nullable(),
  description: z.string().nullable(),
  sourceUrls: z.array(z.string()),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  // How the coordinates were resolved: from the CSV directly, or which centroid fallback.
  geocodeSource: z.enum(["csv", "city", "county", "state", "none"]).default("none"),
  // Earliest year found across the record's dated evidence links (used by the
  // time slider). `.optional()` because records committed before this field
  // existed won't have it until the next ingest run; treat missing the same
  // as null (no usable year).
  earliestSourceYear: z.number().nullable().optional(),
  raw: z.record(z.string(), z.string().nullable()).optional(),
  alprEvidence: z.object({
    directSharing: z.number().nullable(),
    nvls: z.boolean(),
    detections2016: z.number().nullable(),
    hits2016: z.number().nullable(),
    detections2017: z.number().nullable(),
    hits2017: z.number().nullable(),
    detectionsTotal: z.number().nullable(),
    hitsTotal: z.number().nullable(),
    sourceUrls: z.array(z.string()),
  }).optional(),
});

export type SurveillanceRecord = z.infer<typeof SurveillanceRecordSchema>;

// Client-facing record (no `raw`, coordinates guaranteed present).
export type MapRecord = Omit<SurveillanceRecord, "raw" | "latitude" | "longitude"> & {
  latitude: number;
  longitude: number;
};
