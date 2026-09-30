/**
 * When to save the viewer's position as their notification centre (9h).
 *
 * The map's `watchPosition` fires every few seconds; saving each fix would be
 * a write per tick for no benefit, since the server only needs "roughly where
 * this student is". Save on the first fix, after a real move, or after a while.
 *
 * Pure and alias-free so the unit tests can import it directly.
 */
export type LatLng = { latitude: number; longitude: number };
export type SavedViewerLocation = { coords: LatLng; savedAt: number };

export const MIN_MOVE_METERS = 150;
export const MIN_INTERVAL_MS = 10 * 60 * 1000;

const EARTH_RADIUS_METERS = 6_371_000;

/** Haversine distance in metres. */
export function metersBetween(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function shouldSaveViewerLocation(
  last: SavedViewerLocation | null,
  next: LatLng,
  now: number,
): boolean {
  if (!last) return true;
  if (now - last.savedAt >= MIN_INTERVAL_MS) return true;
  return metersBetween(last.coords, next) >= MIN_MOVE_METERS;
}
