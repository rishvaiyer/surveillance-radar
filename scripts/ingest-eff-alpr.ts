/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "data/raw/eff-data-driven-alpr-2016-2017.csv");
const OUTPUT = path.join(ROOT, "data/processed/eff-data-driven-alpr.json");
// The app fetches this at runtime from public/ (see components/MapExperience.tsx),
// so both copies must be written together.
const PUBLIC_OUTPUT = path.join(ROOT, "public/eff-data-driven-alpr.json");

function value(row: Record<string, string>, prefix: string): string | null {
  const key = Object.keys(row).find((header) => header.startsWith(prefix));
  const raw = key ? String(row[key] ?? "").trim() : "";
  return raw && !["n/a", "Not Provided", "Data Incomplete"].includes(raw) ? raw : null;
}

function numberValue(row: Record<string, string>, prefix: string): number | null {
  const raw = value(row, prefix);
  if (!raw) return null;
  const parsed = Number(raw.replace(/[,*]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function links(row: Record<string, string>): string[] {
  return [...new Set(
    Object.entries(row)
      .filter(([header]) => header.startsWith("R"))
      .flatMap(([, raw]) => String(raw ?? "").split(/\s+/))
      .filter((item) => /^https?:\/\//i.test(item)),
  )];
}

const csv = fs.readFileSync(INPUT, "utf8");
const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
const records = parsed.data
  .map((row) => ({
    agencyName: value(row, "A."),
    state: value(row, "B."),
    directSharing: numberValue(row, "C."),
    nvls: value(row, "D.") === "Y",
    detections2016: numberValue(row, "E1."),
    hits2016: numberValue(row, "E2."),
    detections2017: numberValue(row, "F1."),
    hits2017: numberValue(row, "F2."),
    detectionsTotal: numberValue(row, "G1."),
    hitsTotal: numberValue(row, "G2."),
    sourceUrls: links(row),
  }))
  .filter((record) => record.agencyName && record.state && record.sourceUrls.length > 0);

const json = JSON.stringify(records);
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.mkdirSync(path.dirname(PUBLIC_OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, json);
fs.writeFileSync(PUBLIC_OUTPUT, json);
console.log(
  `Wrote ${records.length} sourced EFF Data Driven records to ${path.relative(ROOT, OUTPUT)} and ${path.relative(ROOT, PUBLIC_OUTPUT)}`
);
