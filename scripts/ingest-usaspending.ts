/* eslint-disable no-console */
//
// Ingest federal prime-contract awards to documented surveillance-technology
// vendors from USAspending.gov, and bake them to a static GeoJSON in public/
// so the map renders the layer offline, mirroring the other ingests.
//
// WHAT THIS LAYER IS, AND IS NOT
//
// An award proves a federal agency PAID a vendor. It does not prove that
// equipment was deployed, where it was deployed, or that it is still in use.
// USAspending's "place of performance" for a contract is frequently a vendor
// facility, a contracting office, or a delivery point — not a surveillance
// site. The layer is therefore deliberately aggregated to STATE level and
// labelled as purchasing evidence, never as deployment. Plotting these awards
// as precise points would assert something the data does not support, and
// would contradict the disclaimer this project already ships in the record
// drawer ("does not prove where or whether equipment is currently deployed").
//
// Awards do carry a Zip5, so finer geocoding is technically available. It is
// intentionally not used: higher spatial precision here would raise apparent
// certainty without raising actual certainty.
//
// Verified 2026-08-04 against https://api.usaspending.gov (no API key needed):
//   POST /api/v2/search/spending_by_award/ returned HTTP 200 with real prime
//   awards for Palantir ($442.9M top award), Motorola Solutions ($95.8M),
//   Axon Enterprise ($20.6M), Cellebrite ($11.1M), Magnet Forensics ($8.4M),
//   Clearview AI ($3.75M) and SoundThinking ($1.5M). "Place of Performance
//   City Code" comes back null on these records while State Code and Zip5 are
//   populated — another reason state is the honest resolution.
//   The API caps search time_period at 2007-10-01 and says so in `messages`.
//
// Discipline mirrors the other ingests: per-request timeout, one retry, a hard
// total wall-clock budget, build in memory, and only overwrite the committed
// file on success. A vendor that fails is skipped rather than sinking the run.
//
import fs from "node:fs";
import path from "node:path";
import centroids from "../data/centroids/us-places.json";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public/procurement-awards.geojson");

const API = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const AWARD_URL = "https://www.usaspending.gov/award/";
const USER_AGENT =
  "SurveillanceRadar/1.0 (open-data cross-reference; +https://github.com/rishvaiyer/surveillance-radar)";

const REQUEST_TIMEOUT_MS = Number(process.env.SR_USAS_REQUEST_TIMEOUT_MS || 60_000);
const TOTAL_BUDGET_MS = Number(process.env.SR_USAS_TOTAL_BUDGET_MS || 300_000);
const START = Date.now();

// Search window. The API rejects start dates before 2007-10-01 for search
// endpoints; this window keeps the layer current rather than historical.
const START_DATE = "2015-01-01";
const END_DATE = new Date().toISOString().slice(0, 10);

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_VENDOR = 5; // 500 awards/vendor ceiling
const MAX_AWARDS_PER_STATE = 25; // detail rows kept per state feature

// Contract award types: A/B/C/D are definitive contracts, purchase orders,
// delivery orders and BPA calls. IDV vehicles are excluded — they are ceilings,
// not obligations, and would inflate totals.
const AWARD_TYPE_CODES = ["A", "B", "C", "D"];

// Awarding departments. Scoping to DHS and DOJ is what makes this layer about
// the same subject as the rest of the map: federal LAW-ENFORCEMENT purchasing.
//
// Without this filter the layer is dominated by work that isn't law
// enforcement at all — measured 2026-08-04, an unscoped run returned $7.87B
// across 2,423 awards, of which Palantir ($4.87B) and Motorola Solutions
// ($2.31B) were 91%, and the single largest line was an Army/CDAO software
// task order. Motorola in particular sells far more two-way radio than
// surveillance. Filtering by agency rather than dropping those vendors keeps
// their genuinely relevant contracts (e.g. Palantir/ICE, Palantir/FBI) while
// removing defense IT that would inflate the totals and misdescribe them.
const AWARDING_AGENCIES = ["Department of Homeland Security", "Department of Justice"];

// Vendors documented as selling surveillance technology to government, drawn
// from the categories the EFF Atlas of Surveillance itself tracks (body-worn
// cameras, ALPR, face recognition, mobile-device forensics, gunshot detection,
// social-media monitoring, data fusion).
const VENDORS: { name: string; search: string }[] = [
  { name: "Axon Enterprise", search: "Axon Enterprise" },
  { name: "Palantir", search: "Palantir" },
  { name: "Motorola Solutions", search: "Motorola Solutions" },
  { name: "Cellebrite", search: "Cellebrite" },
  { name: "Magnet Forensics", search: "Magnet Forensics" },
  { name: "Clearview AI", search: "Clearview AI" },
  { name: "SoundThinking (ShotSpotter)", search: "SoundThinking" },
  { name: "Grayshift", search: "Grayshift" },
  { name: "Flock Safety", search: "Flock Safety" },
  { name: "Verkada", search: "Verkada" },
  { name: "Genetec", search: "Genetec" },
  { name: "BriefCam", search: "BriefCam" },
  { name: "Babel Street", search: "Babel Street" },
  { name: "PenLink", search: "PenLink" },
];

type AwardRow = {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Award Amount"?: number;
  "Awarding Agency"?: string;
  "Awarding Sub Agency"?: string;
  "Start Date"?: string;
  "End Date"?: string;
  Description?: string;
  "Contract Award Type"?: string;
  "Place of Performance State Code"?: string | null;
  "Place of Performance Country Code"?: string | null;
  generated_internal_id?: string;
};

type Award = {
  vendor: string;
  awardId: string;
  recipient: string;
  amount: number;
  agency: string;
  subAgency: string;
  startDate: string;
  endDate: string;
  description: string;
  awardType: string;
  state: string;
  url: string;
};

type Feature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Point"; coordinates: [number, number] };
};

// The JSON import infers each centroid as number[], not a 2-tuple, so this
// needs the double assertion to land on [lat, lon].
const STATES = centroids.states as unknown as Record<string, [number, number]>;

function body(vendor: string, page: number) {
  return JSON.stringify({
    filters: {
      recipient_search_text: [vendor],
      // Multiple agency entries are OR'd by the API.
      agencies: AWARDING_AGENCIES.map((name) => ({ type: "awarding", tier: "toptier", name })),
      award_type_codes: AWARD_TYPE_CODES,
      time_period: [{ start_date: START_DATE, end_date: END_DATE }],
    },
    fields: [
      "Award ID",
      "Recipient Name",
      "Award Amount",
      "Awarding Agency",
      "Awarding Sub Agency",
      "Start Date",
      "End Date",
      "Description",
      "Contract Award Type",
      "Place of Performance State Code",
      "Place of Performance Country Code",
    ],
    page,
    limit: PAGE_LIMIT,
    sort: "Award Amount",
    order: "desc",
    subawards: false,
  });
}

function toAward(row: AwardRow, vendor: string): Award | null {
  const state = (row["Place of Performance State Code"] ?? "").toUpperCase();
  const country = (row["Place of Performance Country Code"] ?? "USA").toUpperCase();
  const amount = Number(row["Award Amount"] ?? 0);
  // Keep only U.S. awards we can place on a state centroid, with a real
  // obligated amount. Foreign and unplaceable awards are dropped rather than
  // guessed at.
  if (country !== "USA" || !STATES[state] || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    vendor,
    awardId: row["Award ID"] ?? "",
    recipient: row["Recipient Name"] ?? "",
    amount,
    agency: row["Awarding Agency"] ?? "",
    subAgency: row["Awarding Sub Agency"] ?? "",
    startDate: row["Start Date"] ?? "",
    endDate: row["End Date"] ?? "",
    description: (row.Description ?? "").slice(0, 240),
    awardType: row["Contract Award Type"] ?? "",
    state,
    url: row.generated_internal_id ? `${AWARD_URL}${row.generated_internal_id}` : "",
  };
}

async function fetchPage(vendor: string, page: number): Promise<{ rows: AwardRow[]; hasNext: boolean }> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: body(vendor, page),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${vendor} page ${page}`);
  const json = (await res.json()) as {
    results?: AwardRow[];
    page_metadata?: { hasNext?: boolean };
  };
  return { rows: json.results ?? [], hasNext: Boolean(json.page_metadata?.hasNext) };
}

// One retry per page. A vendor that keeps failing is skipped — with 14 vendors
// queried, losing one is a gap, not a failed run.
async function fetchVendor(v: { name: string; search: string }): Promise<Award[] | null> {
  const awards: Award[] = [];
  for (let page = 1; page <= MAX_PAGES_PER_VENDOR; page++) {
    if (Date.now() - START > TOTAL_BUDGET_MS) {
      console.warn(`  (time budget reached — stopping at ${v.name} page ${page})`);
      break;
    }
    let got: { rows: AwardRow[]; hasNext: boolean } | null = null;
    for (let attempt = 1; attempt <= 2 && !got; attempt++) {
      try {
        got = await fetchPage(v.search, page);
      } catch (err) {
        console.warn(`  (${v.name} page ${page} attempt ${attempt} failed: ${(err as Error).message})`);
        if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!got) return page === 1 ? null : awards; // total failure only if we got nothing at all
    for (const row of got.rows) {
      const award = toAward(row, v.name);
      if (award) awards.push(award);
    }
    if (!got.hasNext) break;
  }
  return awards;
}

function aggregate(awards: Award[]): Feature[] {
  const byState = new Map<string, Award[]>();
  for (const a of awards) {
    const bucket = byState.get(a.state);
    if (bucket) bucket.push(a);
    else byState.set(a.state, [a]);
  }

  const features: Feature[] = [];
  for (const [state, rows] of byState) {
    const [lat, lon] = STATES[state];
    rows.sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((sum, r) => sum + r.amount, 0);

    const vendorTotals = new Map<string, { amount: number; count: number }>();
    for (const r of rows) {
      const entry = vendorTotals.get(r.vendor) ?? { amount: 0, count: 0 };
      entry.amount += r.amount;
      entry.count += 1;
      vendorTotals.set(r.vendor, entry);
    }
    const vendors = [...vendorTotals.entries()]
      .map(([name, v]) => ({ name, amount: Math.round(v.amount), count: v.count }))
      .sort((a, b) => b.amount - a.amount);

    features.push({
      type: "Feature",
      properties: {
        id: `usas-${state}`,
        state,
        totalAmount: Math.round(total),
        awardCount: rows.length,
        vendorCount: vendors.length,
        topVendor: vendors[0]?.name ?? "",
        vendors,
        awards: rows.slice(0, MAX_AWARDS_PER_STATE).map((r) => ({
          vendor: r.vendor,
          awardId: r.awardId,
          recipient: r.recipient,
          amount: Math.round(r.amount),
          agency: r.agency,
          subAgency: r.subAgency,
          startDate: r.startDate,
          endDate: r.endDate,
          description: r.description,
          awardType: r.awardType,
          url: r.url,
        })),
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
    });
  }

  features.sort((a, b) => (b.properties.totalAmount as number) - (a.properties.totalAmount as number));
  return features;
}

async function main() {
  console.log("\nIngesting federal procurement awards (USAspending.gov)…");
  console.log(`  ${VENDORS.length} vendors, ${START_DATE} to ${END_DATE}, budget ${TOTAL_BUDGET_MS}ms`);

  const all: Award[] = [];
  const perVendor: Record<string, number> = {};
  let anySucceeded = false;

  for (const v of VENDORS) {
    const awards = await fetchVendor(v);
    if (awards === null) {
      console.warn(`  ${v.name}: request failed — skipped`);
      continue;
    }
    anySucceeded = true;
    perVendor[v.name] = awards.length;
    all.push(...awards);
    console.log(`  ${v.name}: ${awards.length} placeable U.S. awards`);
  }

  if (!anySucceeded) {
    if (fs.existsSync(OUT)) {
      console.log(
        "\nUSAspending unavailable for every vendor (network blocked, rate-limited, or budget exceeded)." +
          "\nKeeping the committed file so the build still has data — NOT overwriting:" +
          `\n  ${path.relative(ROOT, OUT)}\n`
      );
      JSON.parse(fs.readFileSync(OUT, "utf8"));
      return;
    }
    throw new Error("USAspending unavailable and no committed file present.");
  }

  const features = aggregate(all);
  const grandTotal = all.reduce((sum, a) => sum + a.amount, 0);

  const fc = {
    type: "FeatureCollection" as const,
    generatedAt: new Date().toISOString(),
    attribution: "Data from USAspending.gov — a work of the U.S. federal government, public domain.",
    license: "Public domain (U.S. government work)",
    sourceName: "USAspending.gov (search/spending_by_award)",
    sourceUrl: "https://api.usaspending.gov/",
    note:
      "Federal PRIME contract awards from DHS and DOJ to documented surveillance-technology " +
      "vendors, aggregated to the state of the award's place of performance. An award documents a " +
      "purchase, not a deployment: place of performance is often a vendor facility or contracting " +
      "office, not a surveillance site. State-level aggregation is deliberate — finer geocoding " +
      "would imply precision the data does not carry. Awards are matched by VENDOR, so a vendor's " +
      "non-surveillance business with these agencies is included too.",
    window: { start: START_DATE, end: END_DATE },
    awardingAgencies: AWARDING_AGENCIES,
    awardTypeCodes: AWARD_TYPE_CODES,
    caps: {
      maxPagesPerVendor: MAX_PAGES_PER_VENDOR,
      pageLimit: PAGE_LIMIT,
      maxAwardsPerStateDetail: MAX_AWARDS_PER_STATE,
      note: `At most ${MAX_PAGES_PER_VENDOR * PAGE_LIMIT} awards per vendor are read, highest amount first.`,
    },
    counts: {
      states: features.length,
      awards: all.length,
      totalObligatedUsd: Math.round(grandTotal),
      perVendor,
    },
    features,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fc));
  console.log(
    `\nWrote ${features.length} states / ${all.length} awards ` +
      `($${(grandTotal / 1e6).toFixed(1)}M obligated) to ${path.relative(ROOT, OUT)}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
