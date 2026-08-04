// Centralized visual theme for the globe + UI.
// Swap these values to retune the whole map (e.g. amber/red or mono) without touching components.
export const THEME = {
  space: "#05070d", // near-black background / starfield
  earth: "#132a40", // deep blue landmass fill
  earthEdge: "#356089", // subtle land borders (brighter than fill)
  water: "#070f1c", // ocean (the globe sphere surface)
  atmosphere: "#3f8fd6", // rim glow color
  point: "#38e1ff", // default glowing surveillance point (uncategorized / fallback)
  pointBright: "#9af0ff", // selected / pulse highlight
  cluster: "#38e1ff",
  clusterText: "#03121a",
  // Distinct hues for the additional open-data layers so they read separately
  // from the cyan EFF points.
  osm: "#b07cff", // violet — community-mapped surveillance equipment (ODbL)
  osmBright: "#dcc6ff",
  // ALPR nodes within the OSM layer are colored by TECHNOLOGY rather than by
  // source: gold matches "Automated License Plate Readers" in TECH_COLORS, so
  // one reading of the legend holds across every layer. The hover popup still
  // names OpenStreetMap as the source, so layer identity isn't lost.
  osmAlpr: "#ffcf5c",
  osmAlprBright: "#ffe9ad",
  wikidata: "#5aa0ff", // blue — Wikidata agency reference points (CC0)
  wikidataBright: "#b5d1ff",
  procurement: "#57f2a3", // mint — federal procurement research via USAspending
  procurementBright: "#b6ffdb",
  uiText: "#dbe6f2",
  uiMuted: "#7d8ba0",
} as const;

// Per-technology categorical color ramp. Hues are spread across the wheel and kept
// bright/saturated so every point glows legibly on the near-black space background.
// Keys must match the `technology` label strings exactly (see data/processed/atlas-summary.json).
export const TECH_COLORS: Record<string, string> = {
  "Aerial Surveillance": "#38e1ff", // cyan
  "Automated License Plate Readers": "#ffcf5c", // gold
  "Body-worn Cameras": "#57f2a3", // green
  "Camera Registry": "#9d8bff", // indigo
  "Cell-site Simulators": "#ff7ab8", // pink
  "Drones / UAS": "#5aa0ff", // azure
  "Face Recognition": "#ff5d5d", // red
  "Gunshot Detection": "#ff9d3c", // orange
  "Predictive Policing": "#caff4d", // lime
  "Real-Time Crime Center": "#4fe6cf", // teal
  "Video Analytics": "#e08bff", // magenta
};

// Fallback for any technology not in the ramp (keeps the signature cyan).
export const TECH_FALLBACK = THEME.point;

export function techColor(technology?: string | null): string {
  return (technology && TECH_COLORS[technology]) || TECH_FALLBACK;
}

// Build a MapLibre `match` expression that maps the feature's `technology` property
// to its ramp color, defaulting to the fallback.
export function techColorMatchExpression(): unknown[] {
  const expr: unknown[] = ["match", ["get", "technology"]];
  for (const [label, color] of Object.entries(TECH_COLORS)) {
    expr.push(label, color);
  }
  expr.push(TECH_FALLBACK); // default
  return expr;
}
