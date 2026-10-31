// Centralized visual theme for the globe + UI.
// Swap these values to retune the whole map (e.g. amber/red or mono) without touching components.
export const THEME = {
  space: "#12100c", // warm ink background
  earth: "#26221a", // land fill
  earthEdge: "#5a5242", // land borders
  water: "#0c0b08", // ocean (the globe sphere surface)
  atmosphere: "#6b5f4a", // faint rim light
  point: "#ff6a4d", // default surveillance point (uncategorized / fallback)
  pointBright: "#ffd2c6", // selected / pulse highlight
  cluster: "#ff6a4d",
  clusterText: "#1a0b07",
  // Distinct hues for the additional open-data layers so they read separately
  // from the vermilion EFF points.
  osm: "#b9a5e6", // lilac: community-mapped surveillance equipment (ODbL)
  osmBright: "#e3d9f7",
  // ALPR nodes within the OSM layer are colored by TECHNOLOGY rather than by
  // source: butter matches "Automated License Plate Readers" in TECH_COLORS, so
  // one reading of the legend holds across every layer. The hover popup still
  // names OpenStreetMap as the source, so layer identity isn't lost.
  osmAlpr: "#edb93c",
  osmAlprBright: "#f6dc94",
  wikidata: "#8fb0d6", // steel: Wikidata agency reference points (CC0)
  wikidataBright: "#cfe0f2",
  procurement: "#8fd0a0", // sage: federal procurement research via USAspending
  procurementBright: "#d3efd9",
  nasa: "#d9a066", // copper: NASA EONET natural events
  nasaBright: "#f0cfa6",
  facilities: "#9bd3e0", // ice: public PeeringDB facility locations
  facilitiesBright: "#d6eef3",
  uiText: "#efe6d4",
  uiMuted: "#9d9482",
} as const;

export const NASA_CATEGORY_COLORS: Record<string, string> = {
  wildfires: "#ff713d",
  severeStorms: "#ff5da2",
  volcanoes: "#ff4d4d",
  floods: "#4da3ff",
  dustHaze: "#d9ad6a",
  landslides: "#d9963d",
  seaLakeIce: "#8ee9ff",
  snow: "#d7f5ff",
  earthquakes: "#d88cff",
  waterColor: "#45d5c4",
  tempExtremes: "#ffb347",
  manmade: "#b7bdc8",
};

export function nasaCategoryColorExpression(): unknown[] {
  const expression: unknown[] = ["match", ["get", "categoryId"]];
  for (const [category, color] of Object.entries(NASA_CATEGORY_COLORS)) {
    expression.push(category, color);
  }
  expression.push(THEME.nasa);
  return expression;
}

// Per-technology categorical color ramp. Hues are spread across the wheel and kept
// medium-saturated so every point reads on the warm near-black background.
// Keys must match the `technology` label strings exactly (see data/processed/atlas-summary.json).
export const TECH_COLORS: Record<string, string> = {
  "Aerial Surveillance": "#8cb8d9", // sky
  "Automated License Plate Readers": "#edb93c", // butter
  "Body-worn Cameras": "#6dbf8b", // sage
  "Camera Registry": "#a99bd6", // lavender
  "Cell-site Simulator": "#e58fb0", // rose
  "Cell-site Simulators": "#e58fb0",
  Drones: "#5fa2d8", // azure
  "Drones / UAS": "#5fa2d8",
  "Face Recognition": "#ff6a4d", // vermilion
  "Fusion Center": "#c9a97a", // sand
  "Gunshot Detection": "#f0955a", // amber
  "Predictive Policing": "#b5cf5a", // olive
  "Real-Time Crime Center": "#3fb8a5", // teal
  "Third-party Investigative Platforms": "#9aa7c7", // slate
  "Video Analytics": "#d68ae0", // orchid
};

// Fallback for any technology not in the ramp (keeps the signature vermilion).
export const TECH_FALLBACK = "#b8ad96"; // neutral, so only Face Recognition reads as vermilion

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
