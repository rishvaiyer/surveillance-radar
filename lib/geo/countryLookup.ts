// Lightweight point-in-polygon test used to attribute the OSM / Wikidata point
// layers to a clicked country polygon from public/world.geojson. Deliberately
// dependency-free (no turf/geojson libs in this project); the per-click point
// counts here are small (thousands, not millions), so a plain ray-casting test
// is effectively instant and keeps the bundle lean.

// A country feature as clicked on the globe (properties trimmed to what the
// country panel needs; geometry kept as-is for the point-in-polygon test).
export type ClickedCountry = {
  name: string;
  iso2: string | null;
  geometry: { type: string; coordinates: unknown };
};

type Point = [number, number];
type Ring = Point[];

function pointInRing(pt: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// rings[0] is the outer boundary; any subsequent rings are holes cut out of it.
function pointInPolygon(pt: Point, rings: Ring[]): boolean {
  if (rings.length === 0 || !pointInRing(pt, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(pt, rings[i])) return false;
  }
  return true;
}

// Tests a [lng, lat] point against a GeoJSON Polygon or MultiPolygon geometry.
// Any other geometry type (or malformed coordinates) returns false rather than
// throwing; country attribution is a "nice to have" enrichment, not something
// that should ever crash the panel.
export function pointInGeometry(lng: number, lat: number, geometry: { type: string; coordinates: unknown }): boolean {
  if (lng == null || lat == null || Number.isNaN(lng) || Number.isNaN(lat)) return false;
  const pt: Point = [lng, lat];
  try {
    if (geometry.type === "Polygon") {
      return pointInPolygon(pt, geometry.coordinates as Ring[]);
    }
    if (geometry.type === "MultiPolygon") {
      return (geometry.coordinates as Ring[][]).some((poly) => pointInPolygon(pt, poly));
    }
  } catch {
    return false;
  }
  return false;
}
