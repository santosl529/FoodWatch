/**
 * Builds a GeoJSON polygon approximating a circle of `radiusMeters` around a
 * point.
 *
 * MapLibre's `circle` layer sizes in *pixels*, not metres, so it can't show a
 * real-world radius — the circle would stay the same size as you zoom. A
 * polygon is the standard workaround: it scales with the map because it is
 * actual geography.
 *
 * The longitude step is divided by cos(latitude) because a degree of longitude
 * shrinks toward the poles. Without that the shape would render as an ellipse.
 */
export function circlePolygon(
  center: { latitude: number; longitude: number },
  radiusMeters: number,
  steps = 96,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const EARTH_RADIUS_METERS = 6_371_000;

  const latRadians = (center.latitude * Math.PI) / 180;
  const latDelta = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const lngDelta = latDelta / Math.max(Math.cos(latRadians), 1e-6);

  const ring: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    ring.push([
      center.longitude + lngDelta * Math.cos(angle),
      center.latitude + latDelta * Math.sin(angle),
    ]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}
